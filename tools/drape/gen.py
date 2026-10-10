"""Spike: synthesize a ground albedo for the drape from the sim's own data.

No imagery. Inputs are the Copernicus 30 m DEM tiles (tools/terrain/cache),
the 195 m land-cover fractions (content/landcover/cover.bin.gz) and the OSM
rivers. Fine structure (tree crowns, field patchwork, paddy terraces, scree,
beach strips) is invented offline with far more octaves than the runtime
shader can afford, then baked to one PNG on the same world square as bake.py.

  gen.py <repo-root> <drape.json> <out.png> [size]
"""
import gzip, json, math, os, sys
import numpy as np
import rasterio
from rasterio.merge import merge
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from bake import to_local, to_geodetic

RNG = np.random.default_rng(1944)
GRADE_SAT, GRADE_GAIN, GRADE_HAZE = 0.62, 1.22, 0.10
# GEN_V2=1 (L3 Phase 2, docs/superpowers/plans/2026-10-09-l3-land-quality.md):
# plausible, not accurate -- desaturated tone with large-scale drift, procedural
# roads and settlements, fine grain. Off by default so the spike's baked
# variants stay reproducible.
V2 = os.environ.get("GEN_V2") == "1"
if V2:
    GRADE_SAT = 0.46


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



def settlements_and_roads(root, albedo, gx, gz, h, slope, w_tree, sea, step, cx, cz, half, size):
    """Roads, yards and houses. Seeds: the real towns (largest), plus invented
    villages on flat low land near roads. Nothing here claims to be where real
    houses are."""
    rng = np.random.default_rng(1945)
    places = json.load(open(f"{root}/content/scenery/places.json"))
    ss = 2
    layer = Image.new("L", (size * ss, size * ss), 0)
    dr = ImageDraw.Draw(layer)
    for road in places["roads"]:
        lt = np.array([c[1] for c in road["coordinates"]]); ln = np.array([c[0] for c in road["coordinates"]])
        x, z = to_local(lt, ln)
        pts = list(zip(((x - (cx - half)) / step * ss).tolist(), ((z - (cz - half)) / step * ss).tolist()))
        dr.line(pts, fill=255, width=int(max(2.4, road["widthM"] / step * 1.1) * ss), joint="curve")
    road_m = np.asarray(layer.resize((size, size), Image.LANCZOS)).astype("float32") / 255
    near_road, idx = ndi.distance_transform_edt(road_m < 0.3, return_indices=True)
    near_road = near_road * step

    seeds = []  # (x, z, radius_m, density)
    for t in places["towns"]:
        x, z = to_local(np.array([t["lat"]]), np.array([t["lon"]]))
        if abs(x[0] - cx) < half and abs(z[0] - cz) < half:
            seeds.append((float(x[0]), float(z[0]), 1700.0 if t["size"] == "town" else 450.0, 1.0))
    flat = (slope < 5) & (h > 2.5) & (h < 140) & ~sea & (w_tree < 0.6)
    for gxs in np.arange(-half + 300, half - 300, 500.0):
        for gzs in np.arange(-half + 300, half - 300, 500.0):
            x, z = cx + gxs + rng.uniform(-250, 250), cz + gzs + rng.uniform(-250, 250)
            i, j = int((z - (cz - half)) / step), int((x - (cx - half)) / step)
            if not (0 <= i < size and 0 <= j < size) or not flat[i, j]:
                continue
            p = 0.7 if near_road[i, j] < 700 else 0.25
            if rng.random() < p:
                seeds.append((x, z, float(rng.uniform(220, 480)), float(rng.uniform(0.55, 0.95))))
    print("settlement seeds", len(seeds))

    # Yards: bare, lighter ground inside each settlement's footprint.
    yard = np.zeros_like(h)
    for x, z, rad, dens in seeds:
        d2 = ((gx - x) ** 2 + (gz - z) ** 2) / (rad * rad)
        yard = np.maximum(yard, dens * np.exp(-1.6 * d2))
    yard *= (flat | (slope < 9)) & ~sea
    albedo = albedo * (1 - 0.2 * yard[..., None]) + np.array([170, 156, 128], "float32") * 0.2 * yard[..., None]

    # Roads: the real OSM alignment only, muted. Houses and streets are NOT
    # painted: a flat texture stain reads as a decal from low altitude, so the
    # villages are real 3D huts placed at runtime from content/scenery/villages.json
    # (src/render/scene/villages.ts). The texture only carries the bare-earth
    # yard tone above.
    road_col = np.array([150, 148, 140], "float32")
    albedo = albedo * (1 - 0.55 * road_m[..., None]) + road_col * 0.55 * road_m[..., None]
    invented = [sd for sd in seeds if sd[3] < 1.0]
    out = [{"x": round(x), "z": round(z), "radius": round(r), "density": round(d, 2)} for x, z, r, d in invented]
    json.dump(out, open(f"{root}/content/scenery/villages.json", "w"), indent=0)
    print("wrote villages.json:", len(out), "invented villages")
    return albedo


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
    field = base + (palette[pick_i] - base) * (1.0 if V2 else 0.5)
    field = field * ((0.80 + 0.40 * r2[..., None]) if V2 else (0.94 + 0.12 * r2[..., None]))
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

    fill_src = albedo.copy()  # before the beach strip: the coastal fill must not be sand
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

    if V2:
        # Large-scale tone drift (hundreds of metres): warm/dry vs cool/wet, so
        # forest and fields stop reading as one flat green.
        drift = fbm(gx.shape, (45, 130, 320), (1, 1, 0.8), 81)
        warm = np.array([10, 4, -8], "float32")
        albedo = albedo * (1 + 0.11 * np.clip(drift, -1.5, 1.5)[..., None]) + warm * np.clip(drift, -1, 1)[..., None]
        # Exposed rock on the steepest ground goes grey, not brown.
        rock = smooth(34, 48, slope + (fbm(gx.shape, (3, 12), (1, 1), 82) * 5)) * (h > 20)
        albedo = albedo * (1 - 0.7 * rock[..., None]) + np.array([128, 124, 118], "float32") * 0.7 * rock[..., None]
        albedo = settlements_and_roads(root, albedo, gx, gz, h, slope, w_tree, sea, step, cx, cz, half, size)
        # Fine grain, so no region reads as a smooth gradient.
        albedo = albedo * (1 + 0.07 * fbm(gx.shape, (0.9, 2.0), (1, 1), 83)[..., None])

    # Grade to the measured statistics of the real 2013 Tacloban photos
    # (OpenAerialMap, CC-BY 4.0): vegetation median RGB ~(111,131,104),
    # saturation ~0.20, luminance std ~19. Raw palette was far too saturated.
    def grade(a):
        lum = (a @ np.array([0.2126, 0.7152, 0.0722], "float32"))[..., None]
        a = lum + (a - lum) * GRADE_SAT
        a = a * GRADE_GAIN
        return a * (1 - GRADE_HAZE) + np.array([150, 158, 150], "float32") * GRADE_HAZE

    albedo = grade(albedo)
    fill_src = grade(fill_src)
    if V2:
        albedo = (albedo - 128.0) * 1.14 + 124.0  # the grade left it flat and hazy
        fill_src = (fill_src - 128.0) * 1.14 + 124.0

    # Sea: leave a neutral mid-tone; the shader masks it by height.
    d_land, (ri, ci_) = ndi.distance_transform_edt(sea, return_indices=True)
    filled = (fill_src if V2 else albedo)[ri, ci_]
    if V2:
        # Nearest-land colour only within ~80 m of the coast (where the sim's
        # terrain and this DEM disagree); open sea gets a water tone. Otherwise a
        # whole shallow bay fills with the nearest beach's sand (seen 2026-10-09).
        wet = smooth(50.0, 110.0, d_land * step)[..., None]
        filled = filled * (1 - wet) + np.array([62, 98, 104], "float32") * wet
    albedo = np.where(sea[..., None], filled, albedo)
    Image.fromarray(np.clip(albedo, 0, 255).astype("uint8")).save(out_png, optimize=True)
    print("wrote", out_png, size, "px", round(step, 2), "m/px")


if __name__ == "__main__":
    main(*sys.argv[1:8])
