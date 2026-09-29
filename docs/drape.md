# Ground drape spike (`?drape=`)

Status: **spike, off by default** (2026-09-29, branch `worktree-sat-drape`, not
merged). Goal was ground that looks like OpenSkyFlight's, which drapes roughly
1 m/px real satellite imagery over terrain. Mark judged the final variant
("synthsr") "pretty good" but not OpenSkyFlight-level. Nothing here is a plan
of record; §15 of the master spec owns plan numbering.

## What exists

| Flag | What it is | Resolution |
| --- | --- | --- |
| (none) | Shipping terrain shader, unchanged | n/a |
| `?drape=raw` / `1944` | Sentinel-2 10 m imagery, modern built-up scrubbed, vector roads/rivers | 10 m native |
| `?drape=synth` | Synthetic ground generated from the sim's own DEM and landcover, whole map | coarse |
| `?drape=synth1m` | Same generator, 4 km patch west of Tacloban | about 3.2 ft/px |
| `?drape=synthsr` | Sentinel-2 base, Real-ESRGAN x4, plus synthetic canopy luminance; full 14 km square, 6144 px | about 7.5 ft/px |

Code: `src/render/terrain/surface.ts` (variant whitelist; synthetic variants use
raw color and a 40-220 m fade), `tools/drape/` (`bake.py`, `gen.py`,
`detail.py`), `tests/e2e/drapeSpike.spec.ts` (four views, screenshots to
`test-results/drape/`). Baked textures live in `content/drape-spike/`, which is
git-excluded and exists only where it was baked; regenerate with the commands
in each script's header.

`synth`/`synth1m` were regraded to photo-calibrated color; `synth` (whole map)
has not been regenerated with that grade.

## Rebuilding synthsr

Needs a Python venv with rasterio, pyproj, scipy, PIL, torch (CPU) and
`spandrel`, plus the `RealESRGAN_x4plus.pth` weights and a cloud-masked
Sentinel-2 composite (`composite.npz`). About 8 minutes on nexus.

```sh
python bake.py <composite.npz> <osm_roads.json> content/scenery/rivers.json content/drape-spike 7000 6144 <RealESRGAN_x4plus.pth>
python detail.py content/drape-spike/drape-synthsr-base.png content/drape-spike/drape-synthsr.png
```

`pip install realesrgan basicsr` fails to build; `spandrel` with the raw
weights works.

## What was tried and found

- **Sentinel-2 drape alone** (Mark: "not great"): 10 m pixels, and modern
  roads and buildings show through. Scrubbing built-up areas and drawing OSM
  roads helped little; extra roads were disliked.
- **Synthetic ground** from DEM plus landcover (`cover.bin.gz`, about 640 ft per
  sample). First versions failed in three ways, each fixed: tiled rectangular
  fields (now warped, low contrast, softened); sea-colored texels on land where
  the DEM says water but the sim's terrain is land (now filled from the
  nearest land color); oversaturation (median photo vegetation measured
  RGB (111,131,104), saturation about 0.20, against the original (64,92,47) at
  0.49, so a grade pulls it toward the photo).
- **Real imagery, free.** OpenAerialMap (CC-BY 4.0) covers only the Tacloban
  core (lon 124.985-125.013, lat 11.235-11.259) at about 4 cm/px, from 2013.
  A wide-area query found 51 images under 190 km2, all drone patches, under 1%
  of the map. Maxar Open Data has no Leyte event. Planet NICFI forbids sharing.
  ESRI, Google and Bing forbid this use. Mark: patches would look bad.
- **Buying imagery** (Apollo pricing, 2026-09-18): out of budget; Mark's cap
  is $100.
- **DLSS is not applicable**: it is real-time and needs motion vectors. Offline
  single-image super-resolution works instead.
- **Real-ESRGAN x4** on the 10 m Sentinel base gives about 2.5 m/px of credible
  detail. It hallucinates plausible texture; 4x is the ceiling, and it will not
  match imagery that was actually shot at 1 m. Close-range views still read as
  terrain color, not as photographed ground.

## Traps

- **A stale vite dev server looked like a texture-size failure** (2026-09-29).
  All tests timed out in `waitForTerrain` and the browser logged
  `ERR_INSUFFICIENT_RESOURCES`, even with no `?drape=`. Restarting vite on the
  slot fixed it; the 6144 px texture renders fine. Check the baseline (no
  flag) before blaming a texture.
- Do not add a `varying()` from `mesh.ts` for this; it produced an invalid
  pipeline. The scene is camera-relative, so `length(positionView)` gives eye
  distance in the fragment stage.
- Emailed screenshots: inline `cid:` images did not show for Mark; attach the
  JPEGs too.
- `content/drape-spike/` is about 130 MB and git-excluded. `git clean -fdx`
  destroys other data (see CLAUDE.md), never run it here.

## Open

- Regrade whole-map `?drape=synth` to match, if wanted.
- Whether any drape becomes a shipped tier is undecided; it would need a
  plan, a texture budget (6144 px is 51 MB PNG) and a Tier 2 budget run.
- Real fine detail needs licensed imagery; revisit only if the budget moves.
