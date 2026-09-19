# Plan 16a — clouds: handoff, 2026-09-19

Volumetric cloud layers are on `main`: design
[2026-09-19-clouds-design.md](../superpowers/specs/2026-09-19-clouds-design.md),
plan [2026-09-19-clouds.md](../superpowers/plans/2026-09-19-clouds.md),
commits `156c68e` (content), `2e70d7f` (noise), `4d5ae71` (material),
`699e1fd` (wiring), `05ffc41` (a loader fix found on the way), and the closing
commit carrying this document. Nothing pushed, nothing deployed. 16b (cloud
shadows) and 16c (a movable sun) are next, each with its own short design.

## What landed

- `weather.clouds` on a scenario: up to four non-overlapping slabs, `cumulus`
  or `cirrus`, `baseM`, `thicknessM`, `coverage`. `free-flight`: cumulus
  1,500 m / 900 m / 0.45 and cirrus 7,000 m / 300 m / 0.35. `deck-quals`:
  cumulus 1,000 m / 800 m / 0.55 plus the cirrus. `gunnery-range`: clear.
- `content/sky/shape.bin.gz` (128³ Perlin-Worley) and `detail.bin.gz` (32³
  Worley), built by `npm run sky:build` from mulberry32, SHA-256 pinned.
- `src/render/scene/clouds.ts`: a dome drawn last whose fragment marches each
  slab, occluded per pixel by `viewportLinearDepth`, lit by a short march
  toward `SUN_DIRECTION` (cumulus only), curved by `horizonSinkNode`, fogged
  by `fogWeightNode` -- which moved from the terrain into `horizon.ts` so the
  two share one ramp. Drift is the wind times the ocean's clock. Tiers
  high/medium/low march 48/32/20 cumulus steps.
- The whiteout is the march starting at the eye; the panel at 0.7 m stops it
  by depth.
- DEV: `?cloudTier=off|high|medium|low` and `?cloudDebug=` (below).

## Measured, reference GPU, 2026-09-19

Windows desktop, RX 6700 XT, 2560 x 1440, `clouds.spec.ts`, every case with
zero WebGPU validation errors AND zero three console errors:

| Measurement | Value |
| --- | --- |
| Budget view (1,300 m, level, under the cumulus deck), clouds off | gpu p95 1.163 ms over 545 samples |
| Same view, high tier | gpu p95 3.210 ms over 314 samples |
| **Cloud pass cost at high** | **2.048 ms** (budget 2.5 ms); an earlier isolated run read 2.096 |
| Terrain budget over Leyte at 3,000 m, with clouds | gpu p95 3.118 ms (was 1.345 ms this morning without) |
| Gunnery budget (clear range) | gpu p95 0.743 ms, unchanged |
| Deck-quals deck run under its heavier 0.55 overcast | gpu p95 4.102 ms over 772 samples (ceiling 6.0 ms) |

Screenshots read at 1440p (`test-results/clouds-*.png`): from the chocks
looking up, distinct cumulus puffs against blue; under the deck, a bright
underside with a hazed band at the horizon; inside the deck in cockpit view,
white outside and the panel intact, cirrus streaks above; above the deck at
3,200 m, cloud tops over the gulf with the cirrus sheet as long streaks; the
deck-quals carrier under a heavy grey overcast. The runway is never painted
over and the airplane always occludes cloud behind it.

Tier 1: `npm run verify` exits 0 at the closing commit (counts in the commit
message). Goldens, landing snapshots and the soak untouched.

## What it took to get a picture (the traps)

1. **A TSL `Fn` must return ONE node.** Returning `{ rgb, alpha }` fails to
   build (`this.outputNode.build is not a function`), three substitutes a
   blank material, and the dome paints the screen black with
   `validationErrors` empty. `clouds.spec.ts` now fails on any three console
   error, because the first run passed every assertion over a black frame.
2. **Hoist int-to-float conversions into vars.** An inline `steps.toFloat()`
   used twice emitted the second use as `f32 / i32`; WGSL rejected it.
3. **`uniformArray.element(i)` is re-emitted at every use, and every `Loop`
   names its counter `i` unless told otherwise.** Inside the step loop the
   layer array was indexed by the STEP, so layers 2 and up (zeros) fed every
   sample and the deck vanished. Capture layer fields with `.toVar()` before
   inner loops and pass `name:` to nested loops (honoured at runtime, absent
   from the types -- hence the casts).
4. **Sample one kind, never both.** A density that sampled cumulus and cirrus
   shapes and mixed afterward cost 3.9 ms; branching on kind brought it to
   2.1 ms. The cirrus light march was another 1.6 ms for nothing visible.
5. **The dev server inflates `.gz` before `fetch` sees it** (`Content-Encoding:
   gzip`), so a second `DecompressionStream` aborts the request. Both loaders
   now inflate only on the gzip magic (`src/render/gunzip.ts`). The land
   cover had painted procedurally in every dev session since 2026-09-18.
6. **`?cloudDebug=`** paints one link at a time: `depth` (grey by range),
   `layer` (uniform contents), `shape` (raw volume), `density` (peak along
   the ray), `slab` (entry/exit), `point` (density at a known point in the
   slab), `eye` (the eye uniform), `nodepth` (march ignoring depth). That is
   the sequence that found trap 3 in four screenshots; keep it.
7. The deck-quals deck-run spec asserted "no deck under the wheels" at a
   fixed 2 s after liftoff, a 3 m margin past the bow; it now polls.

## Known limitations, for 16b/16c and later

- Lighting is single-scatter with a 0.35 extinction scale on the light march
  as the multiple-scattering stand-in; cloud undersides read bright rather
  than shaded. Cirrus uses a constant light term.
- Curvature widens the flat slab by the sink at the far bound and corrects
  each sample's altitude; a grazing ray marches empty air first.
- No temporal reprojection and no half-resolution target; neither was needed
  for the budget on this card.
- Coverage is thresholded after stretching the volume's 110..247 range;
  `coverage: 0.45` is a look, not a measured sky fraction.
