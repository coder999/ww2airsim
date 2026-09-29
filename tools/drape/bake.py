"""Spike: bake a satellite drape for the sim's world grid.

Inputs (from fetch steps, paths given on the command line):
  composite.npz  cloud-masked Sentinel-2 median: rgb uint8 (H,W,3), utm_bounds, crs
  roads.json     Overpass `out geom` highways
  rivers.json    content/scenery/rivers.json
Outputs: <out>/drape-raw.png (imagery only, resampled) and
         <out>/drape-1944.png (modern built-up scrubbed, vector roads/rivers drawn),
         <out>/drape.json (world bounds).

World frame is src/sim/world/projection.ts: azimuthal equidistant about
(10.8 N, 125.3 E) on a sphere, +x east, +z south.
"""
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw
from pyproj import Transformer
from scipy import ndimage as ndi

R = 6371008.8
LAT0, LON0 = math.radians(10.8), math.radians(125.3)


def to_local(lat_d, lon_d):
    lat, dlon = np.radians(lat_d), np.radians(lon_d) - LON0
    cosc = np.clip(math.sin(LAT0) * np.sin(lat) + math.cos(LAT0) * np.cos(lat) * np.cos(dlon), -1, 1)
    c = np.arccos(cosc)
    sinc = np.sin(c)
    k = np.where(sinc == 0, 1, c / np.where(sinc == 0, 1, sinc))
    return (R * k * np.cos(lat) * np.sin(dlon),
            R * k * (math.sin(LAT0) * np.cos(lat) * np.cos(dlon) - math.cos(LAT0) * np.sin(lat)))


def to_geodetic(x, z):
    rho = np.hypot(x, z)
    rho = np.where(rho == 0, 1e-9, rho)
    c = rho / R
    sinc, cosc = np.sin(c), np.cos(c)
    lat = np.arcsin(np.clip(cosc * math.sin(LAT0) - z * sinc * math.cos(LAT0) / rho, -1, 1))
    lon = LON0 + np.arctan2(x * sinc, rho * math.cos(LAT0) * cosc + z * math.sin(LAT0) * sinc)
    return np.degrees(lat), np.degrees(lon)


def upscale4(img, weights, tile=192, pad=16):
    # Real-ESRGAN x4 in overlapping tiles; the padded margins are discarded.
    import torch
    from spandrel import ModelLoader
    m = ModelLoader().load_from_file(weights).eval()
    H, W = img.shape[:2]
    out = np.zeros((H * 4, W * 4, 3), "uint8")
    for r in range(0, H, tile):
        for c in range(0, W, tile):
            r0, c0 = max(0, r - pad), max(0, c - pad)
            r1, c1 = min(H, r + tile + pad), min(W, c + tile + pad)
            t = torch.from_numpy(img[r0:r1, c0:c1]).permute(2, 0, 1)[None].float() / 255
            with torch.no_grad():
                o = (m(t)[0].permute(1, 2, 0).clamp(0, 1).numpy() * 255).astype("uint8")
            a, b = (r - r0) * 4, (c - c0) * 4
            hh, ww = min(tile, H - r) * 4, min(tile, W - c) * 4
            out[r * 4:r * 4 + hh, c * 4:c * 4 + ww] = o[a:a + hh, b:b + ww]
    return out


def main(comp_path, roads_path, rivers_path, out, half_m=7000.0, size=2048, sr_weights=None):
    d = np.load(comp_path)
    rgb = d["rgb"].astype("float32")
    left, bottom, right, top = d["utm_bounds"]
    H, W = rgb.shape[:2]
    to_utm = Transformer.from_crs("EPSG:4326", d["crs"].item(), always_xy=True)

    lat_c, lon_c = float(d["centre_latlon"][0]), float(d["centre_latlon"][1])
    cx, cz = (float(v) for v in to_local(lat_c, lon_c))
    step = 2 * half_m / size
    xs = cx - half_m + (np.arange(size) + 0.5) * step
    zs = cz - half_m + (np.arange(size) + 0.5) * step
    gx, gz = np.meshgrid(xs, zs)
    lat, lon = to_geodetic(gx, gz)
    e, n = to_utm.transform(lon, lat)
    col = (e - left) / ((right - left) / W) - 0.5
    row = (top - n) / ((top - bottom) / H) - 0.5

    def sample(img):
        return np.stack([ndi.map_coordinates(img[..., c], [row, col], order=3, mode="nearest") for c in range(3)], -1)

    def sample_mask(m):
        return ndi.map_coordinates(m.astype("float32"), [row, col], order=1, mode="nearest")

    # ---- classify at native 10 m ----
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    bright = rgb.mean(-1)
    # Sea is dark teal (b close to g); blue roofs are bright with b >> g.
    water = ((b > r * 1.12) & (bright < 125) & (b - g < 28)) | (bright < 45)
    water = ndi.binary_opening(water, iterations=2)
    veg = (g > r * 1.06) & (bright < 150) & ~water
    urban = ~veg & ~water
    # beaches and the coast strip are not built-up; keep 30 m of shore.
    near_water = ndi.binary_dilation(water, iterations=3)
    airfield = np.zeros_like(urban)
    ax, az = float(d["airfield_xz"][0]), float(d["airfield_xz"][1])
    lat_a, lon_a = to_geodetic(np.array(ax), np.array(az))
    ea, na = to_utm.transform(float(lon_a), float(lat_a))
    ca, ra = int((ea - left) / ((right - left) / W)), int((top - na) / ((top - bottom) / H))
    airfield[max(0, ra - 130):ra + 130, max(0, ca - 40):ca + 40] = True
    # A small closing merges roof clusters; dilate so their dark edges go too.
    scrub = ndi.binary_dilation(urban, iterations=2) & ~near_water & ~airfield & ~water
    support = (veg & ~scrub).astype("float32")

    def inpaint(sigma):
        num = np.stack([ndi.gaussian_filter(rgb[..., c] * support, sigma) for c in range(3)], -1)
        den = ndi.gaussian_filter(support, sigma)[..., None]
        return num / np.maximum(den, 1e-4), den[..., 0]

    fill_a, den_a = inpaint(6)
    fill_b, _ = inpaint(25)
    fill = np.where(den_a[..., None] > 0.08, fill_a, fill_b)
    soft = ndi.gaussian_filter(scrub.astype("float32"), 1.0)[..., None]
    scrubbed = rgb * (1 - soft) + fill * soft
    # Grass reads a touch lighter than the closed canopy it was filled from.
    scrubbed = np.where(scrub[..., None], scrubbed * np.array([1.06, 1.08, 0.98]), scrubbed)

    if sr_weights:
        up = upscale4(np.clip(scrubbed, 0, 255).astype("uint8"), sr_weights)
        c4, r4 = (col + 0.5) * 4 - 0.5, (row + 0.5) * 4 - 0.5
        img = np.stack([ndi.map_coordinates(up[..., k].astype("float32"), [r4, c4], order=1, mode="nearest") for k in range(3)], -1)
        os.makedirs(out, exist_ok=True)
        Image.fromarray(np.clip(img, 0, 255).astype("uint8")).save(f"{out}/drape-synthsr-base.png", optimize=True)
        json.dump({"centreX": cx, "centreZ": cz, "halfM": half_m, "size": size, "stepM": step},
                  open(f"{out}/drape-synthsr.json", "w"))
        print("sr base", size, "px,", round(step, 2), "m/px")
        return
    raw_out = sample(rgb)
    img = sample(scrubbed)

    # ---- vectors, drawn at 4x then reduced ----
    ss = 4
    layer = Image.new("RGBA", (size * ss, size * ss), (0, 0, 0, 0))
    dr = ImageDraw.Draw(layer)

    def px(latlon):
        lat_, lon_ = np.array([p[0] for p in latlon]), np.array([p[1] for p in latlon])
        x, z = to_local(lat_, lon_)
        return list(zip(((x - (cx - half_m)) / step * ss).tolist(), ((z - (cz - half_m)) / step * ss).tolist()))

    road_w = {"trunk": 11, "primary": 10, "secondary": 8, "tertiary": 6, "unclassified": 4}
    roads = json.load(open(roads_path))["elements"]
    n_roads = 0
    for el in sorted(roads, key=lambda e: road_w.get(e["tags"].get("highway"), 0)):
        w = road_w.get(el["tags"].get("highway"))
        if w is None or "geometry" not in el:
            continue
        pts = px([(p["lat"], p["lon"]) for p in el["geometry"]])
        wpx = max(1.0, w / step) * ss
        dr.line(pts, fill=(158, 143, 118, 235), width=int(round(wpx)), joint="curve")
        n_roads += 1
    for rv in json.load(open(rivers_path)):
        pts = px([(c[1], c[0]) for c in rv["coordinates"]])
        dr.line(pts, fill=(64, 92, 84, 255), width=int(round(max(1.0, rv["widthM"] / step) * ss)), joint="curve")
    layer = layer.resize((size, size), Image.LANCZOS)
    la = np.asarray(layer).astype("float32") / 255
    img = img * (1 - la[..., 3:4]) + la[..., :3] * 255 * la[..., 3:4]

    os.makedirs(out, exist_ok=True)
    Image.fromarray(np.clip(raw_out, 0, 255).astype("uint8")).save(f"{out}/drape-raw.png", optimize=True)
    Image.fromarray(np.clip(img, 0, 255).astype("uint8")).save(f"{out}/drape-1944.png", optimize=True)
    json.dump({"centreX": cx, "centreZ": cz, "halfM": half_m, "size": size, "stepM": step, "roads": n_roads},
              open(f"{out}/drape.json", "w"), indent=1)
    print("baked", size, "px,", round(step, 2), "m/px,", n_roads, "roads; scrubbed", round(float(scrub.mean()), 3), "of native px")


if __name__ == "__main__":
    main(*sys.argv[1:5], *(float(v) if i == 0 else int(v) for i, v in enumerate(sys.argv[5:7])), *sys.argv[7:8]) if len(sys.argv) > 7 else main(*sys.argv[1:5])
