# Ground drape spike (`?drape=`)

Status: **spike, off by default** (2026-09-29; `synth2` and the 3D villages added 2026-10-10, below). Its code is on `main` via
`10cd56e`; the baked textures are not in git (below). Goal was ground that looks like OpenSkyFlight's, which drapes roughly
1 m/px real satellite imagery over terrain. Mark judged the final variant
("synthsr") "pretty good" but not OpenSkyFlight-level. Nothing here is a plan
of record; `MASTER_PLAN.md` owns the plan.

## What exists

| Flag | What it is | Resolution |
| --- | --- | --- |
| (none) | Shipping terrain shader, unchanged | n/a |
| `?drape=raw` / `1944` | Sentinel-2 10 m imagery, modern built-up scrubbed, vector roads/rivers | 10 m native |
| `?drape=synth` | Synthetic ground generated from the sim's own DEM and landcover, whole map | coarse |
| `?drape=synth1m` | Same generator, 4 km patch west of Tacloban | about 3.2 ft/px |
| `?drape=synthsr` | Sentinel-2 base, Real-ESRGAN x4, plus synthetic canopy luminance; full 14 km square, 6144 px | about 7.5 ft/px |
| `?drape=synth2` | `synth` regenerated with `GEN_V2=1` (below): muted tone, tonal drift, fine grain, bare-earth yards under villages; 14 km square, 4096 px | about 11 ft/px |

Code: `src/render/terrain/surface.ts` (variant whitelist; synthetic variants use
raw color and a 40-220 m fade), `tools/drape/` (`bake.py`, `gen.py`,
`detail.py`), `tests/e2e/drapeSpike.spec.ts` (four views, screenshots to
`test-results/drape/`; skipped unless `E2E_CAPTURE=1`). Baked textures live in `content/drape-spike/`, which is
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

## synth2 and the invented villages (L3 Phase 2, 2026-10-10)

Mark's bar (2026-10-09): a *plausible* ground that looks as good as OpenSkyFlight;
accuracy is not a goal. Phase 0b captured shipping, `synth` and `synthsr` at about
1,000, 4,000 and 13,000 ft against an OpenSkyFlight frame
([handoff](handoff/2026-10-09-l3-phase0b.md)): `synth` was the best base,
`synthsr` was no better and costs a 6144 px texture, and what OpenSkyFlight has that
ours lacks is built-up places, desaturated varied tone and fine grain. So:

- `GEN_V2=1 python3 tools/drape/gen.py ...` (`tools/drape/gen.py`, `V2`): grade to
  saturation 0.46 with a contrast lift, large-scale warm/cool drift, grey rock on the
  steepest ground, fine grain, parcel colors kept visible, a faint bare-earth patch under
  each village, the real Maharlika Highway muted, and a fix to an old defect (open sea was
  filled with the nearest beach's sand, which showed as pale slabs on shallow bays; V2
  keeps the nearest-land fill only within about 260 ft of the coast).
- **Houses and streets are not painted.** A painted house reads as a flat decal from low
  altitude (Mark, 2026-10-10). The generator writes only the invented seeds to
  `content/scenery/villages.json` (committed, 54 rows); `src/render/scene/villages.ts`
  lays out each village at load, deterministically, as gabled nipa-style huts (not
  `towns.ts`'s barrel-roof military huts), with trees cleared around each hut. DEV only:
  `?villages=on`. The shipping game is unchanged.
- Rebuild (needs rasterio, scipy, pillow, numpy and pyproj in a venv; `~/.venvs/l3` on
  nexus; takes about 3 min):

  ```sh
  cd tools/drape && GEN_V2=1 ~/.venvs/l3/bin/python gen.py ../.. ../../content/drape-spike/drape-synth.json ../../content/drape-spike/drape-synth2.png 4096
  ```

  **It holds about 8.5 GB resident.** On 2026-10-10 that, alongside a Chromium, OOM'd nexus.
  Run it when nothing else is, or on ryzen.
- Measured on the ryzen GPU (1440p, over the densest village): no measurable p50 cost for
  `synth2`; the villages may add 0.2 to 0.3 ms at p50 at 6,000 ft (suggestive, not proven).
  **The 6,000 ft view is over the 8.33 ms gate at p95 with nothing new in it** (about 10 ms
  on shipping terrain on 2026-10-10), so this cannot be cleared against that budget until it
  is fixed. Numbers and their noise: [handoff](handoff/2026-10-10-l3-phase2.md).
- `?drape=` and `?villages=` are DEV-only experiments. Making either a shipped tier needs
  Mark's call and a budget run.

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
  destroys other data (see AGENTS.md), never run it here.

## Open

- Regrade whole-map `?drape=synth` to match, if wanted.
- Whether any drape becomes a shipped tier is undecided; it would need a
  plan, a texture budget (6144 px is 51 MB PNG) and an E2E budget run.
- Real fine detail needs licensed imagery; revisit only if the budget moves.
- `synth2`: the huts read too orange-brown at 1,000 ft (not tuned: needs a look on the GPU);
  Tacloban and Basey still use `towns.ts`'s 24-hut Quonset ring; the High tier at altitude
  was not measured; a Blender top-down render of real 3D tree crowns for forest grain
  (Phase 2 in the L3 plan) is not built.
