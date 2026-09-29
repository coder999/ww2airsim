"""Spike: synthesize a ground albedo for the drape from the sim's own data.

No imagery. Inputs are the Copernicus 30 m DEM tiles (tools/terrain/cache),
the 195 m land-cover fractions (content/landcover/cover.bin.gz) and the OSM
rivers. Fine structure (tree crowns, field patchwork, paddy terraces, scree,
beach strips) is invented offline with far more octaves than the runtime
shader can afford, then baked to one PNG on the same world square as bake.py.

  gen.py <repo-root> <drape.json> <out.png> [size]
"""
import gzip, json, math, sys
import numpy as np
import rasterio
from rasterio.merge import merge
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from bake import to_local, to_geodetic

RNG = np.random.default_rng(1944)
GRADE_SAT, GRADE_GAIN, GRADE_HAZE = 0.62, 1.22, 0.10


def fbm(shape, scales_px, weights, seed):
    rng = np.random.default_rng(seed)
    out = np.zeros(shape, "float32")
    for s, w in zip(scales_px, weights):
        n = ndi.gaussian_filter(rng.standard_normal(shape).astype("float32"), s, mode="wrap")
        out += w * n / (n.std() + 1e-6)
    return out / (sum(weights) ** 0.5)


def norm01(a):
    return np.clip(a * 0.25 + 0.5, 0, 1)


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def main(root, meta_path, out_png, size=4096, cx=None, cz=None, half=None):
    size = int(size)
    meta = json.load(open(meta_path))
    cx = meta["centreX"] if cx is None else float(cx)
    cz = meta["centreZ"] if cz is None else float(cz)
    half = meta["halfM"] if half is None else float(half)
    json.dump({"centreX": cx, "centreZ": cz, "halfM": half, "size": size, "stepM": 2 * half / size},
              open(out_png.replace(".png", ".json"), "w"))
    step = 2 * half / size
    xs = cx - half + (np.arange(size) + 0.5) * step
    zs = cz - half + (np.arange(size) + 0.5) * step
    gx, gz = np.meshgrid(xs, zs)
    lat, lon = to_geodetic(gx, gz)

    # ---- DEM (30 m), bicubic to the grid ----
    tiles = [rasterio.open(f"{root}/tools/terrain/cache/Copernicus_DSM_COG_10_N{n:02d}_00_E{e:03d}_00_DEM.tif")
             for n in (int(lat.min()), int(lat.max())) for e in (int(lon.min()), int(lon.max()))]
    seen, uniq = set(), []
    for t in tiles:
        if t.name not in seen:
            seen.add(t.name); uniq.append(t)
    mosaic, tf = merge(uniq)
    dem = mosaic[0].astype("float32")
    col = (lon - tf.c) / tf.a - 0.5
    row = (lat - tf.f) / tf.e - 0.5
    h = ndi.map_coordinates(dem, [row, col], order=3, mode="nearest")
    gy, gxg = np.gradient(ndi.gaussian_filter(h, 2.0), step)
    slope = np.degrees(np.arctan(np.hypot(gxg, gy)))
    curv = ndi.gaussian_filter(h, 6) - ndi.gaussian_filter(h, 30)  # +ridge, -hollow

    # ---- land cover fractions (195 m) ----
    raw = np.frombuffer(gzip.decompress(open(f"{root}/content/landcover/cover.bin.gz", "rb").read()), "uint8")
    cov = raw.reshape(1025, 1025, 4).astype("float32") / 255.0
    cstep = 200000.0 / 1024
    ci = (gx + 100000.0) / cstep
    cj = (gz + 100000.0) / cstep
    # Domain warp so patch edges are organic rather than the 195 m raster's.
    warp_x = fbm(gx.shape, (20, 60), (1, 1), 11) * 55 / cstep
    warp_z = fbm(gx.shape, (20, 60), (1, 1), 12) * 55 / cstep
    F = np.stack([ndi.map_coordinates(cov[..., c], [cj + warp_z, ci + warp_x], order=1, mode="nearest") for c in range(4)], -1)
    tree, crop, mang, opn = (F[..., k] for k in range(4))

    sea = h < 0.5
    land = ~sea
    print("land fraction", round(float(land.mean()), 3), "tree|land", round(float(tree[land].mean()), 3),
          "crop|land", round(float(crop[land].mean()), 3), "open|land", round(float(opn[land].mean()), 3))

    # ---- sharpen fractions against noise so classes form real patches ----
    patch = norm01(fbm(gx.shape, (18, 45, 110), (1, 1.2, 1), 21))
    def pick(f, bias):
        return smooth(0.42, 0.58, f + (patch - 0.5) * 0.9 + bias)
    w_tree = pick(tree, 0.0)
    w_mang = pick(mang, 0.05) * smooth(6, 1.5, h)
    w_crop = pick(crop, 0.0) * (1 - w_tree) * smooth(28, 10, slope)
    w_open = np.clip(1 - w_tree - w_crop - w_mang, 0, 1)

    # ---- tree canopy: crowns (~5-9 m) inside clumps (~40 m) ----
    crowns = fbm(gx.shape, (1.4, 2.6, 5), (1, 1, 0.6), 31)
    clump = fbm(gx.shape, (9, 22), (1, 1), 32)
    canopy = np.clip(0.5 + 0.22 * crowns + 0.16 * clump, 0, 1)
    forest_lo = np.array([26, 52, 30], "float32")
    forest_hi = np.array([74, 108, 52], "float32")
    forest = forest_lo + (forest_hi - forest_lo) * canopy[..., None]
    # Upland forest is darker and bluer; lowland is brighter and yellower.
    alt = smooth(50, 700, h)[..., None]
    forest = forest * (1 - 0.22 * alt) + np.array([-6, 4, 8], "float32") * alt
    forest = forest * (1 + 0.35 * np.clip(-curv, -1, 1)[..., None] * 0.0)
    mangrove = np.array([30, 62, 44], "float32") * (0.85 + 0.3 * canopy[..., None])

    # ---- open grass / scrub ----
    dry = norm01(fbm(gx.shape, (8, 30, 90), (1, 1, 1), 41))
    grass_a = np.array([128, 142, 66], "float32")
    grass_b = np.array([150, 138, 84], "float32")
    grass = grass_a + (grass_b - grass_a) * dry[..., None]
    grass = grass * (0.92 + 0.16 * norm01(fbm(gx.shape, (1.2, 3), (1, 1), 42))[..., None])

    # ---- crop fields: jittered rotated cells with per-field colors and bunds ----
    ang = math.radians(23)
    ru = (gx * math.cos(ang) + gz * math.sin(ang))
    rv = (-gx * math.sin(ang) + gz * math.cos(ang))
    cell = 95.0
    jx = fbm(gx.shape, (14, 45), (1, 1.4), 51) * 30
    jz = fbm(gx.shape, (14, 45), (1, 1.4), 52) * 30
    iu = np.floor((ru + jx) / cell).astype("int64")
    iv = np.floor((rv * 1.4 + jz) / cell).astype("int64")
    hsh = ((iu * 73856093) ^ (iv * 19349663)) & 0xFFFF
    r1 = (hsh % 251) / 251.0
    r2 = ((hsh // 7) % 241) / 241.0
    palette = np.array([[112, 150, 62], [138, 162, 70], [168, 152, 86], [124, 100, 66], [96, 140, 64], [182, 170, 104]], "float32")
    pick_i = np.minimum((r1 * len(palette)).astype(int), len(palette) - 1)
    base = palette.mean(0)
    field = base + (palette[pick_i] - base) * 0.5
    field = field * (0.94 + 0.12 * r2[..., None])
    field = field * (0.94 + 0.12 * norm01(fbm(gx.shape, (4, 14, 40), (1, 1, 1), 53))[..., None])
    rows = 0.94 + 0.06 * np.sin((ru + jx) * (2 * math.pi / (2.2 + 2.0 * r2)))
    field = field * rows[..., None]
    fu = np.abs(((ru + jx) / cell) % 1 - 0.5)
    fv = np.abs(((rv * 1.4 + jz) / cell) % 1 - 0.5)
    bund = smooth(0.475, 0.5, np.maximum(fu, fv))
    field = field * (1 - 0.05 * bund[..., None]) + np.array([60, 80, 40], "float32") * 0.05 * bund[..., None]
    # Flat, low ground next to the sea or rivers goes to flooded paddy.
    paddy_w = smooth(6, 2, h) * smooth(2.5, 0.8, slope) * (r1 > 0.35)
    paddy_col = np.array([98, 146, 92], "float32") * (0.92 + 0.16 * r2[..., None])
    paddy_col = paddy_col * (1 - 0.30 * bund[..., None]) + np.array([130, 158, 150], "float32") * 0.30 * bund[..., None]
    field = field * (1 - paddy_w[..., None]) + paddy_col * paddy_w[..., None]
    field = np.stack([ndi.gaussian_filter(field[..., c], 2.0) for c in range(3)], -1)

    # ---- assemble land classes ----
    wsum = (w_tree + w_crop + w_mang + w_open + 1e-4)[..., None]
    albedo = (forest * w_tree[..., None] + field * w_crop[..., None] +
              mangrove * w_mang[..., None] + grass * w_open[..., None]) / wsum

    # ---- steep ground: scree/bare soil with vertical streaking ----
    streak = norm01(fbm(gx.shape, (1.5, 14), (1, 1.4), 61))
    bare = smooth(26, 40, slope + (streak - 0.5) * 14)
    soil = np.array([124, 96, 70], "float32") * (0.85 + 0.3 * streak[..., None])
    albedo = albedo * (1 - bare[..., None] * 0.85) + soil * bare[..., None] * 0.85

    # ---- beach and coast ----
    near_sea = ndi.distance_transform_edt(~sea) * step  # metres from water
    beach_w = smooth(45, 12, near_sea + (norm01(fbm(gx.shape, (6, 20), (1, 1), 71)) - 0.5) * 40) * (h < 5)
    sand = np.array([196, 182, 148], "float32") * (0.93 + 0.14 * norm01(fbm(gx.shape, (1.5, 5), (1, 1), 72))[..., None])
    albedo = albedo * (1 - beach_w[..., None]) + sand * beach_w[..., None]

    # ---- curvature: hollows a little darker, ridges a little lighter ----
    albedo = albedo * (1 + 0.10 * np.clip(curv / 6.0, -1, 1))[..., None]

    # ---- rivers: wet banks then water ----
    layer = Image.new("RGBA", (size * 2, size * 2), (0, 0, 0, 0))
    dr = ImageDraw.Draw(layer)
    ss = 2
    def px(coords):
        lt = np.array([c[1] for c in coords]); ln = np.array([c[0] for c in coords])
        x, z = to_local(lt, ln)
        return list(zip(((x - (cx - half)) / step * ss).tolist(), ((z - (cz - half)) / step * ss).tolist()))
    for rv_ in json.load(open(f"{root}/content/scenery/rivers.json")):
        pts = px(rv_["coordinates"])
        wpx = max(1.5, rv_["widthM"] / step) * ss
        dr.line(pts, fill=(96, 92, 74, 200), width=int(wpx * 1.9), joint="curve")
    for rv_ in json.load(open(f"{root}/content/scenery/rivers.json")):
        dr.line(px(rv_["coordinates"]), fill=(58, 88, 84, 255), width=int(max(1.5, rv_["widthM"] / step) * ss), joint="curve")
    layer = layer.resize((size, size), Image.LANCZOS)
    la = np.asarray(layer).astype("float32") / 255
    albedo = albedo * (1 - la[..., 3:4]) + la[..., :3] * 255 * la[..., 3:4]

    # Grade to the measured statistics of the real 2013 Tacloban photos
    # (OpenAerialMap, CC-BY 4.0): vegetation median RGB ~(111,131,104),
    # saturation ~0.20, luminance std ~19. Raw palette was far too saturated.
    lum = (albedo @ np.array([0.2126, 0.7152, 0.0722], "float32"))[..., None]
    albedo = lum + (albedo - lum) * GRADE_SAT
    albedo = albedo * GRADE_GAIN
    albedo = albedo * (1 - GRADE_HAZE) + np.array([150, 158, 150], "float32") * GRADE_HAZE

    # Sea: leave a neutral mid-tone; the shader masks it by height.
    _, (ri, ci_) = ndi.distance_transform_edt(sea, return_indices=True)
    albedo = np.where(sea[..., None], albedo[ri, ci_], albedo)
    Image.fromarray(np.clip(albedo, 0, 255).astype("uint8")).save(out_png, optimize=True)
    print("wrote", out_png, size, "px", round(step, 2), "m/px")


if __name__ == "__main__":
    main(*sys.argv[1:8])
