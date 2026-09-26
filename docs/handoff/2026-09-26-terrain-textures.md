# Terrain surface textures handoff — 2026-09-26

The near ground now carries photographed albedo and normal detail from five CC0
Poly Haven materials—sand, grass, dirt, jungle floor and rock—without changing
the terrain's established land-cover weights or far-field palette. The generated
2.77 MB KTX2 array pair loads once before terrain creation. Scenery `low` uses a
separate procedural material graph with no texture nodes, and any asset/transcoder
failure warns and falls back to that procedural graph.

## What shipped

| Commit | Result |
| --- | --- |
| `8361a06` | Split the established surface weights/composition and proved the CPU composition identical. |
| `70ff0a1` | Added the reproducible, pinned texture build; five licensed CC0 sources; KTX2 arrays; manifest; and vendored Basis transcoder. |
| `1de3821` | Added KTX2 loading, manifest/query validation and the `?terrainTextures=on|off` development override. |
| `c866a66` | Added texel/mean albedo modulation and OpenGL-normal detail under the unchanged weights; ring materials can swap detail graphs. |
| `98d6213` | Loaded textures before terrain creation, gated detail by scenery tier, exposed diagnostics and added the six-case reference-GPU behavior suite. |
| `9fed78c` | Completed reference-GPU tuning and captures; removed the second albedo sample per layer to meet the budget. |

No runtime dependency was added and `src/sim/` is unchanged. The build uses
`globalThis.fetch` so its source downloads work under Node, while
`tools/**/cache/**` is excluded from lint because it contains fetched third-party
source/tool bytes. Runtime assets and their provenance remain committed and
tested.

## Acceptance

The final full verification ran on ryzen through `remote-run npm run verify` and
returned 0: typecheck, ESLint and dependency-cruiser passed; Vitest passed 195
files and 1,969 tests, with one intentional skip.

The reference RX 6700 XT behavior spec passed all 6 cases at 2560×1440: texture
load/diagnostics, failed-load fallback, live scenery-tier switching, A/B visual
difference and the two GPU-budget probes. Its final budget readings were 5.542 ms
on versus 5.445 ms off at the runway (+0.098 ms), and 5.993 ms on versus 5.431 ms
off at `low-land-600` (+0.562 ms), both below the 6.0 ms p95 limit and below the
1.0 ms incremental limit.

At 3840×2160, every required view passed its quality-tier budget with textures
explicitly enabled. The first sweep had two external-tail artifacts; clean
targeted retries are included rather than concealing them.

| View | Tier | Budget p95 | Measured p95 | Result |
| --- | --- | ---: | ---: | --- |
| runway | high | 16.67 ms | 9.058 ms | pass |
| low-land-600 | high | 16.67 ms | 8.900 ms | pass |
| under-deck | high | 16.67 ms | 9.706 ms | pass |
| in-deck | high | 16.67 ms | 9.731 ms | pass |
| above-deck | high | 16.67 ms | 8.772 ms | pass |
| high-6000 | high | 16.67 ms | 9.141 ms | pass |
| deckquals | high | 16.67 ms | 11.400 ms | pass |
| sunset | high | 16.67 ms | 9.404 ms | pass |
| photo | high | 16.67 ms | 9.218 ms | pass |
| runway | medium | 8.33 ms | 6.410 ms | pass |
| low-land-600 | medium | 8.33 ms | 6.217 ms | pass |
| under-deck | medium | 8.33 ms | 7.486 ms | pass |
| in-deck | medium | 8.33 ms | 6.640 ms | pass |
| above-deck | medium | 8.33 ms | 6.761 ms | pass on clean retry; initial tail was 8.393 ms |
| high-6000 | medium | 8.33 ms | 6.717 ms | pass on valid clean retry; initial run had only 20 samples |
| deckquals | medium | 8.33 ms | 7.269 ms | pass |
| sunset | medium | 8.33 ms | 7.096 ms | pass |
| photo | medium | 8.33 ms | 6.052 ms | pass |

The exact legacy 3000 m corridor probe initially measured 6.219 ms on versus
5.076 ms off (+1.143 ms), crossing both tuning thresholds. The shipped lever
therefore removes the second, rotated far-scale albedo sample for each of the five
layers. The retained single photograph sample gets bounded macro-noise contrast
(0.7–1.3, mean-preserving) and the existing distance fade, saving five texture
samples per fragment. A clean post-tuning probe measured 4.676 ms on and 5.813 ms
off; the negative difference is scheduling noise, not a texture speedup claim.

## Visual review

All ten requested frames are in
`docs/handoff/2026-09-26-terrain-textures-shots/` and were read pair by pair:

- `runway-on.png` / `runway-off.png`: photographed structure is clear on the
  grass and soil verges while their established green/brown hue remains stable.
- `photo-on.png` / `photo-off.png`: the fixed view is mostly sky, so it is kept as
  requested evidence but is not useful evidence for terrain texture quality.
- `low-land-600-on.png` / `low-land-600-off.png`: this fixed view is over water
  toward a distant shore. The shore stays field-readable and grid-free, but this
  is weak evidence for near-ground detail.
- `high-6000-on.png` / `high-6000-off.png`: cloud obscures much of the terrain and
  albedo detail is fully faded at 6 km, as designed. The nearly identical pair
  shows no far-field hue shift or repetition grid.
- `low-sun-runway-on.png` / `low-sun-runway-off.png`: at 17:00 the sun is 12.382°
  above the WSW horizon (world direction approximately
  `[-0.950, +0.214, +0.227]`). Texture relief lights from screen-left/WSW, so the
  OpenGL normal-map handedness is not inverted.

## Rulings and execution departures

1. Texture albedo modulates the existing procedural hue by `texel / layerMean`;
   it does not replace the hue.
2. The planned two-scale anti-tiling path was reduced during measured tuning to
   one photograph sample plus mean-preserving macro contrast and distance fade;
   triplanar mapping remains rejected for this pass.
3. Every Asset Quality tier uses the same 1024² albedo/512² normal assets; Render
   Quality scenery `low` removes the texture graph entirely.
4. Textures load once before terrain mesh creation; failure warns and preserves
   the procedural surface.
5. The Basis transcoder is vendored under `content/vendor/basis/` and tested
   byte-for-byte against the installed three package.
6. OpenGL normal maps map tangent `(nx, ny, nz)` to world `(nx, nz, -ny)` for the
   terrain UV convention; CPU cases and the low-sun GPU capture cover it.

The behavior suite uses `groundHeightM()` to wait for terrain without dismissing
the Title dialog; the A/B assertion uses the unobstructed left ground region with
a 0.25 mean-absolute-error floor; and the on-budget leg forces
`?terrainTextures=on` so the one-shot quality probe cannot invalidate the
comparison. These are test corrections recorded in the execution ledger, not
runtime scope additions.

## Open questions for Mark

1. Does the near ground now read as real material while retaining the established
   biome colors, or should a later pass replace rather than modulate the hue?
2. Should Asset Quality `high`/`ultra` later buy a separate 2048² albedo pair?
   That is a build-flag change plus a second file pair, not part of this pass.
3. The next visual-realism priority is §2.2 tree textures, but useful crowns need
   §3.1 crown geometry first. Should that combined tree pass be next?

Visual-realism §2.2/§2.3/§3 remains open. The terrain texture implementation is
otherwise complete and available from the nexus working-copy development server.
