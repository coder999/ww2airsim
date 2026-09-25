# Cloud fidelity II — design

**Status: draft for Mark's review, 2026-09-25.** Follows the photoreal render
pass (`2026-09-24-photoreal-render-pass-design.md`). After Task 11 of that pass,
Mark compared the clouds with a photograph of fair-weather cumulus (deep blue
sky; separate cumulus with flat grey bases and brilliant cauliflower tops) and
asked what stands between them. This spec is the answer turned into work.

## 1. The gap, measured against today's code (2026-09-25, after photoreal Task 11)

| What the photo has | What we render | Why |
| --- | --- | --- |
| Individual clouds, each a convective cell with its own flat base and rising tower | One slab of thresholded noise; blobs of similar size everywhere | Coverage is a noise threshold (+ one 2D modulation field), not a per-cloud description |
| Cauliflower billows at every scale down to metres | Smooth lumps | Shape volume 128³ over 6 km (47 m/texel); detail 32³ over 150 m; one octave each |
| Sharp light/shadow between billows | Smooth gradients | `high` light march: 4 samples on COARSE density beyond near range; fine noise never reaches the light march |
| Crisp edges | Soft edges, especially near | Cloud pass at 0.35 resolution scale, temporally reconstructed |
| — | ~5–6 ms of clouds in an 8.33 ms 4K frame | Budget, and ~2 ms of it lost to an unexplained motion-vector (MRT) overhead (photoreal Task 11 measured: in-deck, clouds off, p50 1.78 ms no MRT / 2.47 `mrt({output})` / 3.85 with motion) |

## 2. Budget (Mark's decision, 2026-09-25)

- **High tier: gpu p95 ≤ 16.67 ms (60 Hz) at 3840×2160** on the reference desktop.
- **Medium and Low: ≤ 8.33 ms (120 Hz)** at 3840×2160.
- `budget4k.spec.ts` becomes per-tier: every view at `high` against 16.67, every
  view at `medium` against 8.33. The cost ladder must strictly descend
  high → medium → low (Tier 1 assertion on the tier table's cost proxy, as the
  photoreal Task 11 fix introduced).
- The one-time GPU probe keeps choosing a tier; its thresholds are re-derived
  from measurement against the new ladder (it must not pick High on a machine
  that measures High above 16.67 ms).

## 3. Work, in order

### 3.1 Recover the motion-vector overhead (budget; no look change)

Replace the scene-wide velocity MRT with **camera-motion reconstruction from
depth**: the world is camera-relative and almost everything in it is static, so
a pixel's motion is fully determined by its depth, this frame's and last frame's
view-projection, and the eye delta — exactly the arithmetic the cloud pass
already uses (`cloudHistory.ts`'s `reprojectUv`). TRAA gets that as its velocity
input, computed in a full-screen pass or inline.

Moving objects (aircraft, ships, tracers, ordnance) are a small screen fraction.
They either write motion through a SECOND, small-object-only pass or accept
TRAA's variance-clip rejection; the plan measures both and picks. The ocean's
waves are ignored for motion (the surface is world-fixed; the photoreal pass's
custom ocean velocity already treats it so).

Acceptance: the ~2 ms comes back (in-deck, clouds off, within 0.3 ms of the
no-MRT 1.78 ms p50), and the TRAA roll captures show no new ghosting on aircraft
or ships.

### 3.2 Amortized cloud updates

March **one texel in 16** (4×4 Bayer order) of the cloud target each frame and
reproject the rest from history — the Horizon/Nubis scheme. At the same cost
this buys ~16× samples per marched ray; spent as: resolution scale back to ≥0.5
at High, ≥128 view steps, a longer light march that reads fine noise near the
camera. The existing reprojection, neighborhood clamp and history reset
(photoreal Tasks 3–4) carry over; what is new is the per-texel update schedule,
the reprojection of NOT-updated texels (they take history exclusively), and a
disocclusion fallback that marches a rejected texel immediately rather than
waiting up to 16 frames.

Medium/Low may keep the current every-texel update if it measures cheaper at
their settings; the plan decides by measurement.

Acceptance: the Task 4 rolling-flight, teleport and camera-cut cases stay clean;
a fast roll at 200 m/s shows no 16-frame "crawl" at cloud edges.

### 3.3 Weather map: individual clouds

A 2D weather texture (built by `tools/sky/`, committed gzipped like the coverage
field) with, per texel: **coverage**, **cloud type** (0 stratus → 0.5 cumulus →
1 towering cumulus) and **top height**. Built from Worley cells so that each
cell is one cloud: a flat base at the layer's condensation height, a type-driven
vertical density profile (Schneider's three-gradient scheme), and a top that
varies per cloud. The scenario's `weather.clouds` layer keeps its meaning
(`coverage` = average fraction; `baseM`, `thicknessM`); the weather map
distributes it. The photoreal pass's coverage-modulation field is subsumed by
it.

Acceptance: from the runway and from 1200 m, clouds read as separate cells with
flat bases at one height and tops at different heights; coverage of the
above-deck view within ±20% of today.

### 3.4 Noise: resolution, octaves, curl

- Shape: 128³ Perlin-Worley with 4 Worley octaves packed as RGBA (Schneider's
  layout), tile reduced so a texel is ~20 m.
- Detail: 64³ with 3 Worley octaves (RGB), tile ~40 m across.
- Curl: 128² 2D curl noise to distort detail coordinates (the wispy/billowed
  edge motion in Nubis).
- All built deterministically by `tools/sky/` and committed gzipped; the
  existing `skyNoise.test.ts` pattern pins bytes.
- VRAM: 128³×4 + 64³×3 bytes ≈ 9 MB; download a few MB gzipped.

The light march samples detail for the first N light steps near the camera at
High (N set by measurement), which is what produces dark creases between
billows.

Acceptance: at 1–3 km, cloud tops show multi-scale billows and dark creases in
the captures; no sparkle inside the deck at 200 m/s.

## 4. Unchanged

`src/sim/`; cirrus (except whatever the new noise layout forces, which must be
look-identical); cloud shadows keep reading the same `density()` (so they gain
the new shapes for free); the atmosphere, AgX, bloom, TRAA+RCAS chain; the
Settings dialog UI.

## 5. Testing

- Tier 1: noise and weather-map generation deterministic (byte pins), Bayer
  schedule covers every texel exactly once per 16 frames, the tier cost ladder,
  camera-motion reconstruction matches `reprojectUv` for static points.
- Tier 2: per-tier `budget4k`; the eight fixed views plus a **"photo" view**
  (from the runway, looking ~30° up toward the sun-lit side of the deck, mid
  morning) captured and read against a written checklist: separate cells, flat
  grey bases, bright tops, multi-scale billows, dark creases, crisp edges;
  the Task 4 temporal cases; the TRAA roll case.
- Per the 2026-09-25 process change: full Tier 2 suite once at the end, not per
  task.

## 6. Open for Mark

None blocking. The weather map's default look (how cumulus-dominant a scenario
is) is a tuning call; the plan starts from fair-weather cumulus matching the
reference photo.
