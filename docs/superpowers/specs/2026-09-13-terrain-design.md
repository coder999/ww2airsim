# Plan 4 design — terrain and level of detail

**Date:** 2026-09-13
**Status:** Approved shape (Mark, 2026-09-13), pre-implementation
**Master spec:** [`2026-09-12-ww2airsim-design.md`](2026-09-12-ww2airsim-design.md) §4

## 1. What this plan builds

Real Leyte Gulf under the aeroplane: Leyte, southern Samar, Dinagat and
Surigao Strait, rendered from Copernicus 30 m elevation data, with the
simulation able to answer "how high is the ground here" and to notice when the
aeroplane has stopped being above it.

Two halves, deliberately of unequal size:

- **The renderer half.** An offline pipeline turns nine Copernicus GLO-30 tiles
  into one heightfield, and a CDLOD quadtree draws it to 100 km with continuous
  LOD morphing, camera-relative coordinates and horizon curvature.
- **The simulation half.** `src/sim/world/terrain.ts` answers height queries
  from the same data, and a crash event fires on contact. This half is pure,
  runs headlessly, and is where the honest guards live.

### Not in this plan

Stated explicitly, because each is a plausible place to drift:

- **Surface materials.** The ESA WorldCover splat guide is 400 MB and a
  subject of its own. Terrain is coloured by height and slope here.
- **Bathymetry.** Master spec §4 calls it "not optional", and it is — for the
  ocean, which is Plan 6. Flat water at y = 0 is unchanged by this plan, and
  the pipeline is built so a second source layer is an addition rather than a
  redesign.
- **Ground handling.** Contact produces a crash event, not a landing. Runways,
  gear and deck operations are Plan 8's.
- **Trees, buildings, roads.** None. The surface is bare relief.

## 2. The deviation from master spec §4, and why

§4 specifies a "CDLOD quadtree clipmap: heightmap tiles as textures" with "the
terrain tile cache" holding "a large resident set". That wording assumes the
world is bigger than the card. **It is not, by two orders of magnitude.**

Measured 2026-09-13:

| Quantity | Value |
| --- | --- |
| World, per §4 | 200 × 200 km |
| Heightfield grid | 8193 × 8193 samples, 24.4 m posting |
| `maxTextureDimension2D` on the reference RX 6700 XT | **16384** |
| Full mip chain, 2 bytes/sample | 179 MB |
| As `r32float` in VRAM, with mips | 358 MB, of 12288 MB |

**Why 8193 and not 6667** (settled while planning, 2026-09-13). The obvious
grid is the source posting, 200 km / 30 m = 6667 samples. That number halves
to 3334, 1667, 834 … — odd sizes with a dangling row and column at every
level, which is an edge case in the mip filter, in node addressing and in
texture-coordinate arithmetic, repeated thirteen times. `2^13 + 1` halves
exactly to `2^12 + 1` all the way down to 3, sharing edge samples the way
heightfield pyramids conventionally do. It costs a 1.23× oversample of the
source (24.4 m posting from 30 m data, so no invented detail, just resampled)
and buys the clean quadtree in §5.

So the whole world is **one texture**, not a grid of tiles, and it is resident
from load to exit. Deleted along with the tile grid: a tile manifest, a cache,
an eviction policy, tile-seam handling, and the whole class of hitching and
popping bugs that only appear when a fetch lands late. None of that is a
simplification we are choosing over fidelity — the fidelity is identical.

CDLOD stays, and does the job it is actually for here: keeping the triangle
count survivable. A fixed grid mesh per quadtree node samples an explicit mip
level of the one texture, and morphs between levels in the vertex stage.

"Coarse first, then everything resident" (Mark's call, 2026-09-13) therefore
needs no streaming system at all. The mip chain is nine files, smallest first:

```
L0  8193^2  134.2 MB   24 m      L5   257^2   132 KB    781 m
L1  4097^2   33.6 MB   49 m      L6   129^2    33 KB   1562 m
L2  2049^2    8.4 MB   98 m      L7    65^2     8 KB   3125 m
L3  1025^2    2.1 MB  195 m      L8..L12 down to 3^2, 3 KB total
L4   513^2    0.5 MB  391 m
```

L4 and coarser total 703 KB and are **committed**, so a fresh clone runs and
shows a recognisable Leyte immediately (master spec §10's "small
low-resolution fallback"). L0–L3 are generated, gitignored
(`/content/terrain/tiles/` already is), and fetched at runtime in ascending
order of size. Nothing is ever evicted, so there is no cache-coherence
question to get wrong.

### Wire format: raw `int16` decimetres, not an image

One `.bin` per level plus one JSON header. Elevation is stored as signed
decimetres (`round(metres * 10)`), which spans ±3276.7 m — Leyte's highest
ground is well inside that — at 0.1 m precision. The pipeline asserts the
range rather than trusting it: a source sample outside ±3276.7 m is a hard
failure, not a silent wrap.

- **Not 16-bit PNG**, because browsers do not reliably decode 16-bit PNG to 16
  bits; `createImageBitmap` gives 8-bit results, which would quantise elevation
  to ~5 m steps and terrace every shallow slope.
- **Not metres as integers**, because 1 m quantisation visibly terraces shallow
  slopes, and the source is float32 anyway.
- **Raw** because it is byte-for-byte deterministic, needs no decoder in either
  Node or the browser, and gzips on the wire like anything else.

### GPU format: `r32float`, with `r16float` as the measured fallback

Measured on the card, 2026-09-13: `r16float` and `r32float` both create and
filter; **`r16unorm` throws** without the optional `texture-formats-tier1`
feature, so it is off the table.

Default is `r32float` (358 MB with mips): exact, filterable, and 2% of the
card. `r16float` halves that but has only an 11-bit mantissa, so above 1024 m
it cannot represent decimetres at all and steps by 1 m — acceptable but not
free. The switch is a one-line change and is to be made on a measured
vertex-fetch cost, not on a guess.

## 3. Coordinate frame

A tangent plane centred on 10.8 N, 125.3 E, x east, z north, y up in metres —
the frame `sim/` already uses.

The naive mapping (`x = R·Δλ·cos(φ₀)`, `z = R·Δφ`) is wrong in a way worth one
paragraph: east–west scale drifts as `cos(φ)/cos(φ₀)`, which over this box is
**0.31% at the northern edge — 312 m of stretch over 100 km** (computed
2026-09-13). Internally consistent, but this project's stated appeal is that
this is *that place*, and 300 m is a visible displacement of a coastline.

So the **pipeline resamples onto a local azimuthal-equidistant grid** about the
centre, where distance and bearing from the centre are exact by construction
and the remaining tangential distortion at 100 km is 0.004% (computed
2026-09-13) — a metre and a half, against 312. The cost is entirely offline. The
runtime sees a plain regular grid of metres and needs no projection code at
all, which also keeps `sim/world/terrain.ts` free of trigonometry.

## 4. The pipeline

`tools/terrain/`, Node-only, in the manner of `tools/content/load.ts`.

**Source.** Copernicus DEM GLO-30, nine 1° tiles, N09–N11 × E124–E126.
Confirmed 2026-09-13: public on `copernicus-dem-30m.s3.amazonaws.com`, no
credentials, 9.6 MB each. Each is 3600 × 3600 float32 metres at 1 arcsec with
COG overviews.

**Reader.** `geotiff` (MIT, so AGPL-compatible per master spec §10). Confirmed
2026-09-13 reading that exact tile *remotely by HTTP range request in 2.0 s*,
returning correct geotransform, float32 samples and four overview levels — no
GDAL, no system dependency, reproducible from a fresh clone. Source tiles are
cached under `tools/**/cache/`, already gitignored.

**Steps.** Fetch → resample to the azimuthal-equidistant grid (bilinear) →
quantise to `int16` decimetres → build the mip chain via sample-aligned tent
filter with mirror boundary (see `tools/terrain/mips.ts`; corrected 2026-09-14 —
strict 2×2 box filtering cannot produce the (2^(k-1))+1 sample sizes §2 requires)
→ write the levels and a JSON header → record provenance and licence
in `ASSETS.md`, which master spec §10 requires before anything is committed.

**Determinism.** Same inputs produce byte-identical outputs, and that is
asserted against pinned hashes of both the source tiles and every output level.
A test that merely re-ran the pipeline and compared its two outputs would pass
against a pipeline that was wrong in the same way twice.

## 5. The runtime

### Renderer, `src/render/terrain/`

- `load.ts` — fetches levels smallest-first, decodes to typed arrays, uploads.
  Browser-side, so it lives here rather than in `sim/`.
- `mesh.ts` — the CDLOD quadtree: node selection, the shared grid mesh,
  vertex-stage displacement from an explicit mip, and morphing.

A node is a 64 × 64 quad grid. The grid of §2 makes this fall out exactly:
8192 intervals ÷ 64 = 128 nodes across at the finest ring, so the quadtree is
**8 rings deep and its root is precisely the whole world** — no partial nodes,
no world-edge special case, and **ring k samples mip k**, one texel per quad,
by construction rather than by a lookup table someone has to keep true. A
finest-ring node spans 1562 m; the root spans 200 km.

Two properties master spec §4 requires from the first commit, one of which is
already built:

- **Camera-relative rendering** — already in, `src/render/main.ts:282`. Terrain
  nodes are positioned in the same camera-relative frame.
- **Horizon curvature** — a vertex-stage vertical sink of `d²/2R`, which drops
  780 m at 100 km, matching §4's figure.

Aerial-perspective fog closes out the far field, and is tuned so the outermost
LOD transition happens inside the fog rather than in clear air.

### Simulation, `src/sim/world/terrain.ts`

Pure. Takes a `TerrainField` — a typed array plus origin, spacing and extent —
and answers `heightAt(x, z)` by bilinear interpolation. Nothing else: a slope
query has no consumer in this plan, and master spec §3 already records
`speedOfSoundAt` as the cost of adding one before there is. No fetch, no browser global, no `node:fs`, so every existing
boundary rule holds unchanged and the file is exercised headlessly.

The field is loaded by whichever caller has a filesystem or a network:
`tools/terrain/load.ts` in Node for tests and tools, `src/render/terrain/load.ts`
in the browser — exactly the split that `tools/content/load.ts` already
documents as finding I1.

Contact produces a crash event, which closes the master spec §11 invariant "no
aircraft is below terrain without a crash event". Out of the world's bounds,
`heightAt` returns sea level rather than throwing or returning `NaN`: master
spec §9's warning is that a `NaN` entering the integrator silently teleports
the aeroplane, and the edge of a 200 km box is somewhere an aeroplane can
trivially reach.

## 6. The hazard this plan has to be honest about

**What the simulation hits is not what the renderer draws.** The sim always
queries L0. The renderer draws a morphed blend of two mip levels chosen by
camera distance. Those agree only where the camera is close enough that L0 is
selected, and nowhere else — so a hill can be drawn lower than it is.

A test that samples the sim at L0 and the heightfield at L0 and finds them
equal would pass, prove nothing, and read as thorough. This project has shipped
four defects of exactly that shape.

The honest guard is on **LOD selection**, which is a pure function of camera
position and needs no GPU:

- the node containing the camera is always at L0, asserted over a sweep of
  positions including node and level boundaries;
- the distance at which the selected level first coarsens is pinned, so a
  change to the range constants fails a test rather than silently moving where
  the picture stops matching the physics;
- the maximum height error between L0 and the level actually selected at a
  given distance is measured and recorded, so "how wrong is the far field" has
  a number rather than a shrug.

## 7. Testing

**Tier 1 — Node, no GPU.** Carries most of the plan.

- Pipeline determinism against pinned hashes (§4).
- **Projection validated against independent facts, not against itself.** A
  test that samples our own grid through our own projection is circular and
  would pass with the projection entirely wrong. Instead: sample the source
  COGs directly through a second code path at named real-world coordinates —
  Tacloban's airfield, a known summit, a known deep-water point in Leyte Gulf —
  and assert our grid agrees at the same latitude and longitude, and that land
  is above sea level and water below it. Each such coordinate is carried in the
  test with the independent source it came from, cited — an uncited figure
  written from memory would be exactly the fiction this check exists to catch.
- `heightAt` bilinear correctness, exactness at sample points, behaviour at the
  world edge and outside it.
- LOD selection, per §6.
- The crash invariant, added as an arm to the existing soak so randomised
  flights hunt for an aeroplane that ended up under the ground without an
  event.

**Tier 2 — real GPU, reference platform.** Zero WebGPU validation errors on a
camera sweep that now includes terrain at several altitudes and distances; a
frame-time budget at 1440p; and — newly possible as of 2026-09-13 — screenshots
pulled back to nexus, so gross visual failures (no terrain, black terrain,
terrain at the wrong scale) are caught before they reach Mark.

**Tier 3 — Mark flies it.** Irreducibly: does the coast read as a coast, does
the relief feel like ground rather than a texture, does anything pop.

## 8. Risks

| Risk | Mitigation |
| --- | --- |
| Pipeline correctness is invisible until it is rendered | Cross-checked against independent coordinates (§7), not against itself |
| The drawn surface disagrees with the flown one | Guarded on LOD selection with a measured error bound (§6) |
| 89 MB L0 fetch is slow on first load | Coarse levels first; the aeroplane flies over recognisable terrain within ~100 KB |
| Licence contamination in a public repo | Copernicus attribution into `ASSETS.md` in the same commit as the first fetched byte (master spec §10) |
| CDLOD morph tuning is subjective | Frame-time budget and the LOD-error number make most of it objective; the rest is Tier 3 |

## 9. Open items

1. **`r32float` versus `r16float`** for the height texture — **CLOSED
   2026-09-14 (Task 11): `r32float`.**

   This item asked for a measured vertex-fetch cost, so one was measured, on
   the reference GPU at 1440p, as WebGPU timestamp-query durations over
   ~515-frame windows with every level swapped to half-float and nothing else
   changed. The two formats reported **identical** medians at all three test
   altitudes — 2.032 / 2.097 / 1.769 ms at 100 m, 3,000 m and 8,000 m — and
   the instrument quantises to 65.54 µs, so the difference is below 0.066 ms,
   under 3% of a 2.1 ms frame.

   **The measurement therefore did not decide it, and the decision does not
   rest on the measurement.** `r16float` is rejected on correctness, which
   Task 10 established independently: half-float quantises to 1 m above
   1024 m, which is ~20% noise in the analytic gradient on exactly the peaks
   slope shading exists for. The number is recorded because this item asked
   for it and because "the wide format must be slower" is the kind of
   unexamined belief this project keeps finding in old comments — not because
   it chose anything. Full derivation beside the code, in `sampleField`'s doc
   comment in `src/render/terrain/mesh.ts`.

2. **Where terrain data is served from** once there is a deployed build —
   **CLOSED 2026-09-14 (Task 11): static files beside the build, no object
   store.**

   The premise of this item was a 89 MB (in the event 134 MB) L0 fetch. That
   is not what the browser does. The loader fetches **L4 through L8 only** —
   702,346 bytes over five requests, of which L4 is 526,338 — because `LOD.rings` is
   8 and nothing coarser than mip 8 can be sampled by any ring
   (`coarsestFetchedLevel`, `src/render/terrain/lod.ts`). L0–L3 are 178 MB,
   are gitignored, and exist only on the machine that ran the pipeline; the
   browser has never been able to fetch them and `FINEST_FETCHED_LEVEL = 4`
   says so in code.

   700 KB of immutable content beside `index.html` needs no object store and
   no decision. R2 becomes a question again only if L0–L3 are ever shipped —
   and that has a second consequence, recorded beside `finestRangeM` in
   `lod.ts`: the LOD tuning is currently measured against a pyramid whose
   finest available level is 390 m, and shipping finer levels invalidates half
   of that argument.

   **Not closed by this:** `npm run build` still copies all thirteen levels,
   including the 171 MB of gitignored tiles, into `dist/` — a one-line filter
   in `vite.config.ts`'s `copyContent`, carried as a concern since Task 10 and
   still outside any task's file list.

3. **Vertical exaggeration.** Still open, deliberately, and still for Mark at
   the controls: real relief at real scale can read as flat from 15,000 ft,
   and whether a modest exaggeration is wanted is a judgement nobody can make
   from a test. Leyte's highest committed sample is 1,236.6 m over a 200 km
   box, so the case for it is real.

   It is one constant, with one caveat worth knowing before reaching for it:
   applied only in `mesh.ts`'s ring material (a multiplier on `field.x` before
   the curvature sink) it would exaggerate the surface you SEE and not the one
   you HIT, which §6 above already warns is the hazard class this plan is most
   exposed to. To stay honest it has to scale the physics field too — one
   place, the four `/ 10` decimetre-to-metre conversions inside `heightAt` in
   `src/sim/world/terrain.ts`, which is the single point where a sample
   becomes a height the simulation uses. Two call sites, one number, and a
   test that they are the same number.
