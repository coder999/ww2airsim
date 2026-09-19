# Plan 16 — clouds: design

2026-09-19. Mark asked on 2026-09-18 for clouds, "multiple high layers, some
flyable-through", and chose the shape of this plan on 2026-09-19: volumetric
raymarched cloud, up to 2.5 ms of the 6.0 ms GPU p95 at the high tier, layers
as per-scenario weather content with a default deck, plus a whiteout inside a
cloud, cloud shadows on the terrain and sea, and a movable sun. The master
spec §4 ("Sky") already names raymarched volumetric cloud with coverage and
base altitude as weather parameters; this document is that section made
concrete.

**Three slices, one number.** Clouds, shadows and time of day are three
subsystems. Shadows read the cloud field, and a movable sun changes the
lighting of every material in the scene, so both are designed AFTER the field
exists and its cost is measured. This document is **16a: the cloud field and
the whiteout**. 16b (shadows) and 16c (sun) each get a short design of their
own when 16a's handoff has numbers. §15's table carries one row, 16, with
the three slices in its status.

## 1. What the pilot sees

Slabs of cloud at real altitudes over Leyte Gulf: a scattered cumulus deck a
few thousand feet up that the Hellcat climbs into and out of, and a thin
high sheet far above it. Clouds are lit by the one sun the scene already has
(`SUN_DIRECTION`, lighting.ts), shaded on their undersides, hazed toward the
horizon by the same fog the terrain uses, and they curve over the horizon
with the same Earth sink as everything else. They drift with the scenario
wind. Inside one, the world outside the canopy goes white; the panel stays.

Nothing in `src/sim/` changes. Clouds apply no force, hide nothing from the
simulation, and the goldens and soak never see them.

## 2. Content

`weather.clouds` on the scenario, strict, optional (absent means clear):

```json
"weather": {
  "windFromDeg": 0, "windMps": 0,
  "clouds": [
    { "kind": "cumulus", "baseM": 1500, "thicknessM": 900, "coverage": 0.45 },
    { "kind": "cirrus",  "baseM": 7000, "thicknessM": 300, "coverage": 0.35 }
  ]
}
```

- `kind`: `cumulus` (billowing, eroded edges, full lighting) or `cirrus`
  (thin, streaked, cheap). Two kinds, because two is what the request needs
  and each costs a different number of steps.
- `baseM` ≥ 0, `thicknessM` > 0, `coverage` in [0, 1]; at most four layers;
  layers must not overlap (a parse error, not a render-time surprise).
- Defaults: `free-flight` gets the two layers above. `deck-quals` gets
  cumulus at 1,000 m, 800 m thick, coverage 0.55, plus the same cirrus -- a
  windier day, Beaufort 4 by its own wind. `gunnery-range` stays clear, so
  the gunnery screenshots keep their baseline.

Drift: every layer's noise is offset by the ground wind times simulated
seconds, the same clock the ocean dispatches on (`tick * DT +
accumulatorSeconds`, plus the post-impact seconds). No shear; the wind record
is one vector. A calm scenario's clouds stand still.

## 3. Noise

Two committed textures built offline, the pipeline pattern of
`tools/terrain`, `tools/bathy` and `tools/landcover`:

- `content/sky/shape.bin.gz`: 128³ R8, tileable Perlin-Worley (Perlin
  remapped by inverted Worley at three frequencies), the low-frequency
  body of a cloud.
- `content/sky/detail.bin.gz`: 32³ R8, tileable Worley, the edge erosion.

Built by `tools/sky/build.ts` from `mulberry32` (`src/sim/rng.ts`) with fixed
seeds, so the build is bit-identical anywhere; `tests/tools/skyNoise.test.ts`
pins tileability (each face equals its opposite face), the value range, and a
checksum. Uploaded at boot as `Data3DTexture`s (three r186 has `texture3D`
in TSL and `Data3DTexture`, checked 2026-09-19). About 2.1 MB in the
repository; the audio is 3.6 MB. No boot-time generation and no worker.

## 4. The pass

One mesh, `src/render/scene/clouds.ts`: a sky-sized dome (BackSide, the sky's
radius is fine, the march is not bounded by it) with a `MeshBasicNodeMaterial`
whose color node raymarches, `transparent`, `depthTest` and `depthWrite`
off, `renderOrder` after every opaque and the ocean. Per fragment:

1. **Ray.** From the eye (`cameraPosition`) through `positionWorld`; the
   scene is camera-relative, so the eye is the origin and the direction is
   the dome vertex direction. Far bound: the scene depth from
   `viewportLinearDepth` (three r186 handles the reversed depth buffer
   inside that node; checked in `ViewportDepthNode.js` 2026-09-19), capped at
   the terrain's 100 km draw distance, where fog is total anyway.
2. **Slabs.** Layers sorted by base. For each, the ray's entry and exit
   through the flat slab `[base, base + thickness]`; a ray that misses every
   slab, or is stopped by depth before the first, exits with transmittance 1
   and costs a handful of instructions. Looking at the runway from the
   chocks is therefore nearly free; the expensive view is level flight just
   under a deck, and that is the view the budget is measured on.
3. **March.** Fixed-count steps across the slab segment (per tier, §6), step
   length the segment divided by the count but never shorter than
   `thickness / count` -- a grazing ray gets long steps and haze, not a
   stall. At each sample the altitude is curvature-corrected with
   `horizonSinkNode` from `horizon.ts` (the one place `d²/2R` may live), so
   the deck bends over the horizon with the sea under it. Density: shape
   texture at a per-kind scale, thresholded by coverage, shaped by a height
   gradient (flat base, rounded top for cumulus; a thin band for cirrus),
   eroded by the detail texture near the edge. A sample with zero density
   skips its lighting entirely.
4. **Light.** Beer-Lambert extinction along the view ray; at each dense
   sample a short march toward `SUN_DIRECTION` (per tier, §6) for the sun
   term, with the "powder" darkening of dense cores; ambient from the sky
   gradient (`SKY_ZENITH` above, `SKY_HAZE` below). The march stops when
   transmittance falls under 0.01.
5. **Fog and composite.** The accumulated cloud color is mixed toward
   `SKY_HAZE` by the terrain's own fog weight, `smoothstep(0, 100 km, d)` --
   moved from `terrain/mesh.ts` into `horizon.ts` as `fogWeightNode` so the
   terrain and the clouds cannot disagree. Output is premultiplied color with
   alpha `1 - transmittance`, blended over the scene.

**The whiteout is step 3 with the eye inside the slab**: the march starts at
the eye, density accumulates from the first sample, and transmittance goes to
zero in metres. The cockpit panel sits 0.7 m from the eye, so the depth bound
stops the march before any sample; the panel stays, the world goes white.
Nothing is added for it.

**No temporal reprojection and no half-resolution target in this slice.**
The master spec names both; they are the contingency (§7), not the plan.
Full-resolution marching with early exits is tried first because it needs no
second render target and no history buffer, and the reference card has the
headroom to find out.

## 5. Where it plugs in

- `main.ts` creates the clouds after the sky and lighting, feeds them the
  scenario's layers, and each frame sets the drift offset from the same
  expression the ocean dispatch uses, and the tier from `adaptOceanQuality`'s
  one-time pick (the app has one quality signal, `scene/tiers.ts` says why).
- The DEV hook gains `clouds()` → `{ layers, tier, steps }` and a
  `?clouds=off|high|medium|low` query override, DEV-only, asserted absent
  from the production bundle like `?oceanTier`.
- `scenario.ts`'s `Scenario` type carries the layers to the renderer;
  `World` does not (sim never reads them).

## 6. Tiers and budget

Keyed by the ocean tier's name, like `SCENERY_TIERS`:

| Tier | Cumulus steps | Light steps | Cirrus steps |
| --- | --- | --- | --- |
| high | 48 | 4 | 8 |
| medium | 32 | 3 | 6 |
| low | 20 | 2 | 4 |

The cloud pass at **high must cost ≤ 2.5 ms gpu p95 at 2560 x 1440 on the
reference card in the worst view**: `free-flight`, airborne at 1,300 m (200 m
under the cumulus base), level, looking at the horizon, cumulus at coverage
0.45. Measured as the difference between `?clouds=high` and `?clouds=off` on
the same spawn, each over 300 samples after `resetFrameTimes()`. The whole
frame's p95 must stay under 6.0 ms. `adaptOceanQuality`'s thresholds (8 and
11 ms) are unchanged; they now see the cloud cost and pick accordingly.

## 7. Risks and contingencies

- **The march does not fit 2.5 ms at high.** First lever: steps (48 → 40 →
  32), measured each time. Second: a half-resolution cloud target composited
  with a depth-aware upsample -- a second pass and the master spec's stated
  design; it becomes a task in the plan only if the first lever fails. The
  handoff records the numbers either way.
- **`viewportLinearDepth` inside a transparent mesh.** three copies the depth
  buffer for it; if that copy misbehaves with the reversed depth buffer the
  fallback is a `PostProcessing` pass with `pass(scene, camera)`'s depth
  texture. Checked by the first Tier 2 screenshot: the airplane inside a
  cloud must occlude it, and the runway must not be painted over.
- **Grazing views at low altitude** show step banding. Blue-noise dither of
  the start offset per pixel is cheap and planned in; a temporal history is
  not.
- **Cirrus in a volumetric march** may look like thin cumulus. If eight
  steps do not read as a sheet, cirrus becomes a two-sample textured layer
  inside the same pass, not a separate system.

## 8. Acceptance

Tier 1: the schema rejects an unknown key, a negative base, zero thickness,
coverage outside [0, 1], five layers and overlapping layers; the three
scenarios parse with their decks; the noise build is bit-identical and
tileable; `createClouds()` constructs under Node with the three scenario
decks (the same construct test `scene.test.ts` runs for the Hellcat);
`cloudDriftM(wind, seconds)` is the wind times the seconds; the tier table
has three rows and the query override rejects an unknown value;
`fogWeightNode` moved without changing the terrain (the terrain Tier 2 budget
and a screenshot say so). The goldens, the landing snapshots and the soak
are untouched.

Tier 2, reference GPU at 1440p, each screenshot READ, not just taken: (a)
from the chocks at Tacloban looking up the strip, the deck overhead and the
runway unpainted; (b) inside the cumulus deck in cockpit view, the panel
visible and the outside white; (c) above the deck looking down at cloud tops
over the gulf, with the cirrus sheet above; (d) the budget view of §6, with
and without clouds, the difference under 2.5 ms and the frame under 6.0 ms;
(e) zero WebGPU validation errors in every case; (f) the deck-quals parked
screenshot and the gunnery screenshots re-taken, the range still clear.
`npm run verify` exits 0, and a dated handoff records every number and which
contingency, if any, was used.

## 9. Sources

- Schneider & Vos, "The Real-Time Volumetric Cloudscapes of Horizon: Zero
  Dawn", SIGGRAPH 2015 Advances in Real-Time Rendering: the Perlin-Worley
  shape/detail split, the height gradient by cloud type, the powder term.
- Hillaire, "Physically Based Sky, Atmosphere and Cloud Rendering in
  Frostbite", SIGGRAPH 2016: Beer-Lambert with a light march, the
  half-resolution and temporal reprojection contingency.

Both are method references. Every constant in this plan (scales, step
counts, coverage, altitudes) is a gameplay estimate to be tuned on the
reference GPU, not a measurement of any real sky over Leyte in October 1944.
