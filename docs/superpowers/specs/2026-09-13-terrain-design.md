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
  ocean (numbering: master spec §15; this line said "Plan 6" until 2026-09-15,
  when the count was settled). Flat water at y = 0 is unchanged by this plan.

  **What the ocean design actually did with that pipeline, 2026-09-15.** The
  sentence that used to end this bullet — "the pipeline is built so a second
  source layer is an addition rather than a redesign" — turned out to be true
  and unused. Bathymetry became its **own 513 × 513 field** rather than a
  layer inside this pyramid, because merging would mean either resampling
  GEBCO's 460 m data up to 8193² (134 MB of invented detail) or coarsening
  this pyramid's 24.4 m coastline to 390 m. See
  [`2026-09-15-ocean-design.md`](2026-09-15-ocean-design.md) §3.
- **Ground handling.** Contact produces a crash event, not a landing. Runways,
  gear and deck operations belong to the deck-operations plan (master spec
  §15; this line said "Plan 8's", which the settled numbering confirms).
- **Trees, buildings, roads.** None. The surface is bare relief.

## 2. The deviation from master spec §4, and why

§4 originally specified a "CDLOD quadtree clipmap: heightmap tiles as
textures" with "the terrain tile cache" holding "a large resident set". That
wording assumed the world is bigger than the card. **It is not, by two orders
of magnitude.** (§4 was amended in place on 2026-09-14, once this plan had
built the thing; the quoted phrases above are the retired wording, kept so
this section's argument still has its subject.)

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
needs no streaming system at all. The mip chain is thirteen files (L0..L12);
the five the browser fetches arrive smallest first:

```
L0  8193^2  134.2 MB   24 m      L5   257^2   132 KB    781 m
L1  4097^2   33.6 MB   49 m      L6   129^2    33 KB   1562 m
L2  2049^2    8.4 MB   98 m      L7    65^2     8 KB   3125 m
L3  1025^2    2.1 MB  195 m      L8..L12 down to 3^2, 3 KB total
L4   513^2    0.5 MB  391 m
```

L4 and coarser total 703,306 bytes and are **committed**, so a fresh clone
runs and shows a recognisable Leyte immediately (master spec §10's "small
low-resolution fallback"). L0–L3 are generated and gitignored
(`/content/terrain/tiles/` already is). Nothing is ever evicted, so there is
no cache-coherence question to get wrong.

[Amended 2026-09-14 (Task 12): this said L0–L3 are "fetched at runtime in
ascending order of size". They are not fetched at all, and never have been —
the browser fetches L8..L4 only, 702,346 bytes over five requests, because
nothing coarser than mip `LOD.rings` can be sampled by any ring and nothing
finer than L4 is shipped. §9 item 2 recorded that when it closed, and this
paragraph did not follow; it does now.]

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

### GPU format: `r32float` — settled, see §9 item 1

Measured on the card, 2026-09-13: `r16float` and `r32float` both create and
filter; **`r16unorm` throws** without the optional `texture-formats-tier1`
feature, so it is off the table.

`r32float` (358 MB with mips) is exact, filterable, and 2% of the card.
`r16float` would halve that, but has only an 11-bit mantissa, so above 1024 m
it cannot represent decimetres at all and steps by 1 m.

[Amended 2026-09-14 (Task 12). This heading called `r16float` "the measured
fallback", called its 1 m step "acceptable but not free", and said the switch
"is to be made on a measured vertex-fetch cost, not on a guess". **§9 item 1
closed all three on 2026-09-14 and this paragraph did not follow.** The
vertex-fetch cost was measured and came in *below the instrument's 65.54 µs
quantum* — identical p50 at all three altitudes — so it decided nothing.
`r16float` is rejected on **correctness**: the same 1 m step called "acceptable"
above is ~20% noise in the analytic gradient on exactly the peaks slope shading
exists for. It is not a fallback that is waiting on a number; it is closed. §9
item 1 has the table, and `sampleField`'s doc comment in
`src/render/terrain/mesh.ts` has the derivation beside the code.]

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
credentials. Each is 3600 × 3600 float32 metres at 1 arcsec with COG
overviews.

[Corrected 2026-09-14 (Task 12): this said "9.6 MB each", generalised from the
one tile probed on 2026-09-13, and that figure is where the plan's "~90 MB of
downloads" estimate came from. **Eight** of the nine cells have a tile at all
(the ninth is 100% open ocean, for which GLO-30 Public publishes nothing —
`ASSETS.md`), and they range from 226,292 to 22,828,318 bytes, totalling
**106,966,683**. These are COGs: size tracks how much land the cell contains.]

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

**What the simulation hits is not what the renderer draws.** The renderer
draws a morphed blend of two mip levels chosen by camera distance, so a hill
can be drawn lower than it is.

**Amended 2026-09-14 (Task 12).** This said "the sim always queries L0", which
was true of the plan and is not true of what shipped. In the browser the
simulation is handed the finest **fetched** level — L4 — because L0–L3 are not
shipped (`physicsFieldFor`, `src/render/terrain/load.ts`; `FINEST_FETCHED_LEVEL`,
`src/render/content.ts`). The renderer clamps both mip taps of rings 0–3 to L4
for the same reason (`sampleLevelsForRing`, `src/render/terrain/mesh.ts`). Two
consequences, neither of which this section anticipated:

- In the shipped browser build the near field is **drawn from the level the
  physics queries**, so the disagreement this section is about does not begin
  until ring 4. It begins at ring 1 in a checkout that has run
  `npm run terrain:build`, which is the configuration the pinned mip-0 error
  table in `tests/render/terrainLod.test.ts` measures.

  **How far out "ring 4" is depends on where the camera stands**, and quoting
  one number without saying so reads as a contradiction of the other. The
  quadtree is anchored to the world, not to the eye, so a camera's distance to
  the nearest ring-4 node varies with its position inside its own node:
  measured 2026-09-14, **27.4 km** at the Tier 2 spawn (−45000, 47605) and
  **49.0 km** at (99000, −99000), the camera the mip-0 table uses. Both are
  correct for their camera; neither is "the" ring-4 distance.
- What both are wrong about instead is the **whole surface against the source
  grid**: worst |L0 − L4| over every one of L0's 8193² samples is **220.862 m**,
  at (−78,027, 80,664), measured 2026-09-14. A fresh clone flies a Leyte whose
  peaks are that much flatter than the Copernicus data, everywhere, near field
  included.

  **Pinned, not quoted** (final review 2026-09-14): it is asserted in
  `tests/render/terrainLod.test.ts`, inside the same `skipIf(!haveFinestMip)`
  block as the mip-0 table above, so it is re-derived on every run of a
  checkout that has L0 rather than believed from this paragraph. It had been
  recorded as unpinnable "because it needs L0, which CI lacks", which that
  block already answers.

The guard below is unchanged and is still the right one; only the premise
above moved.

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
| ~~89 MB L0 fetch is slow on first load~~ — **retired 2026-09-14, §9 item 2**: L0 is never fetched. The browser fetches L8..L4, 702,346 bytes | Moot. The mitigation shipped anyway: coarse levels first, and the aeroplane flies over recognisable terrain within 43,910 bytes (L8..L6) |
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

2. **Where terrain data is served from** — **CLOSED 2026-09-14 (Task 11):
   static files beside the build, no object store.** Confirmed against a real
   deploy 2026-09-15; see the dated note at the end of this item, which the
   phrase "once there is a deployed build" used to stand in for.

   The premise of this item was a 89 MB (in the event 134 MB) L0 fetch. That
   is not what the browser does. The loader fetches **L4 through L8 only** —
   702,346 bytes over five requests, of which L4 is 526,338 — because `LOD.rings` is
   8 and nothing coarser than mip 8 can be sampled by any ring
   (`coarsestFetchedLevel`, `src/render/terrain/lod.ts`). L0–L3 are
   **178,319,368 bytes (178 MB)**, are gitignored, and exist only on the
   machine that ran the pipeline; the browser has never been able to fetch
   them and `FINEST_FETCHED_LEVEL = 4` says so in code.

   700 KB of immutable content beside `index.html` needs no object store and
   no decision. R2 becomes a question again only if L0–L3 are ever shipped —
   and that has a second consequence, recorded beside `finestRangeM` in
   `lod.ts`: the LOD tuning is currently measured against a pyramid whose
   finest available level is 390 m, and shipping finer levels invalidates half
   of that argument.

   **Closed 2026-09-14 (final review, I1).** `npm run build` used to copy all
   thirteen levels, including those 178 MB of gitignored tiles, into `dist/`.
   `vite.config.ts`'s `copyContent` now filters `content/terrain/tiles` out,
   and `tests/build/dist.test.ts` asserts the built artifact does not contain
   it — guarded on the SOURCE directory existing, so it is a real assertion on
   a machine that has run the pipeline and a stated no-op in CI, where an
   unconditional check would have passed because there was nothing to copy.

   (Review 2026-09-14 flagged "178 MB" here against "171 MB" in the Task 10
   concern as a contradiction. It is not one — it is the same bytes in two
   units, and both were right. `ls -l` sums L0–L3 to 178,319,368 bytes;
   that is 170.06 MiB, which `du -sh` rounds up and prints as `171M`.
   Everything in this plan now quotes decimal MB, or the byte count, and
   never `du`'s output.)

   **A deploy now exists (2026-09-15), and the answer holds.** This item was
   closed on reasoning about a build that had not happened yet; it has now
   happened. Terrain is served from the same origin as everything else —
   `https://ww2airsim.marktuttle.dev/content/terrain/`, plain static files
   under nginx, the 703,306 bytes committed in this repo and nothing more.
   Verified the same day against the live site: `L4.bin` is 200 and 526,338
   bytes, `tiles/L0.bin` is 404, and the deploy workflow asserts both on every
   run. No object store, still not worth one.

   **One wrinkle the deploy exposed, and it argues for R2 or for hashing
   later.** These filenames are stable across releases, so the vhost gives
   them a short `max-age` and relies on revalidation. That is not what a
   browser receives. Cloudflare's zone-level Browser Cache TTL rewrites the
   origin's value: measured 2026-09-15, nginx served `max-age=300` on
   `L4.bin` and the edge delivered `max-age=14400`. A terrain file replaced by
   a rebuild is therefore stale in a browser for up to four hours, and the
   vhost's own number cannot shorten it. Content-hashed terrain filenames
   would make the question moot (as it already is for `/assets/`), and an
   object store would move the decision somewhere it can actually be made.
   Neither is needed while the pyramid is 703 KB that changes ~never; both
   become live questions the moment terrain is regenerated often, or L0–L3
   ship. Recorded so the next person reads it as a known property rather than
   rediscovering it as a caching bug. The infra side, including why removing
   nginx's `always` does not by itself close the equivalent window on 404s, is
   commented in `vps-infra/sites/ww2airsim/nginx/conf.d/site.conf`.

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

## 10. The Tier 2 frame-time instrument (added 2026-09-14, Task 11)

§7 asked for "a frame-time budget at 1440p". This section records what that
turned out to mean on the reference platform, because the answer is not the
obvious one and several code comments point here for it.

It lives in the design doc rather than only in
`.superpowers/sdd/2026-09-13-terrain/task-11-report.md` for a boring but
load-bearing reason: **`.gitignore` ignores `.superpowers/`, so that report is
not in the repository and a fresh clone does not have it.** The raw per-run
tables are still only there. Everything a reader needs in order to trust, or
to overturn, the substitution below is here.

### 10.1 The budget cannot be a frame interval on this platform

`requestAnimationFrame` on the reference desktop fires every **10.0 ms**, and
nothing available moves it. Measured 2026-09-14:

- A **blank page** — `setContent('<html><body>blank</body></html>')`, no
  WebGPU, no canvas, nothing but a rAF counter — reports the same 9.9–10.0 ms
  median as the game does.
- Five flag configurations (none; `--disable-gpu-vsync`; that plus
  `--disable-frame-rate-limit`; those plus
  `--disable-features=CalculateNativeWinOcclusion`; those plus
  `--disable-new-content-rendering-timeout`) all report 9.9–10.0 ms.
- The flags **do** reach the remote browser: `--disable-gpu` through the same
  channel made `navigator.gpu` vanish. So this is not a plumbing failure.

Task 10's "10.0 ms with terrain against 9.9 ms without" was this cadence
measured twice. It is not a baseline and is not quoted as one anywhere.

### 10.2 Where the 10.0 ms comes from — and where it does NOT

An earlier draft of this work inferred "the display is 100 Hz" from the 9.9 ms
interval. **That inference is wrong, and the check that settled it refuted it
rather than confirming it** (review 2026-09-14, finding m9):

- `Get-CimInstance Win32_VideoController` over `ssh ryzen`, read 2026-09-14,
  reports **AMD Radeon RX 6700 XT, 3840×2160 @ 120 Hz**. 120 Hz is 8.33 ms,
  not 10.0.
- It is not the GPU presentation path either. Blank-page rAF measured through
  three launch configurations on the same machine, same day:

  | launch | rAF p50 | implied |
  | --- | --- | --- |
  | headed, default args | 9.900 ms | 101.0 Hz |
  | headed, `--disable-gpu` | 10.000 ms | 100.0 Hz |
  | headless (no display present path at all) | 10.000 ms | 100.0 Hz |

So the cadence survives removing the GPU and removing the display. **It is
Chromium's own scheduler, not the monitor and not vsync** — which is also why
no vsync flag moves it. The exact mechanism was not identified and is out of
scope; what matters is that it is a property of the browser, is stable, and is
not a number about this renderer.

Consequences for the prose elsewhere: a doubled interval is a **missed frame
deadline**, not a "missed vsync", and the 10.0 ms figure is the **rAF
cadence**, not a refresh interval. Both were relabelled.

### 10.3 What the budget is measured with instead

**WebGPU timestamp queries around the render pass.** three@0.186.0 supports it
directly: `new WebGPURenderer({ trackTimestamp: true })` writes a timestamp
pair per pass, and `renderer.resolveTimestampsAsync('render')` returns the
duration of the most recent frame in the batch (read from
`WebGPUTimestampQueryPool._resolveQueries`, not assumed — it is the last
frame's total, not a sum over the batch). Exposed as
`window.__ww2.gpuFrameTimesMs()`, DEV only.

This is on the GPU's own clock, so the cadence above is irrelevant to it
rather than merely worked around. Results quantise to **65.54 µs (2^16 ns)**;
one step is not a difference.

Measured 2026-09-14 at 2560×1440 over Leyte, ~515-frame windows: GPU p50/p95
of **2.032/2.294** at 100 m, **2.097/2.359** at 3,000 m, **1.769/2.097** at
8,000 m. The asserted budget is **GPU p95 ≤ 3.5 ms**
(`tests/e2e/terrain.spec.ts`).

### 10.4 The residual gap this substitution leaves

Stated here because it is the honest cost of the trade and because nothing in
the repository recorded it before:

**A purely CPU-side regression is invisible to the budget.** The GPU pass
duration excludes the simulation, the scene update and three's draw
submission. Main-thread work could grow from ~2 ms to ~9 ms and both
assertions in the budget test would still pass — the GPU number would not
move, and the frame interval would still be 10.0 ms, because 9 ms of CPU still
fits inside a 10.0 ms cadence. Only at the point where a frame actually misses
its deadline does the interval guard (p95 ≤ 15 ms) see anything, and by then
the regression is already user-visible.

Closing it needs a second instrument — wall-clock time spent inside the render
callback, which nothing measures today. Not built here: it is a new diagnostic
and a new budget, and this task was asked for one.

### 10.5 What "1440p" means here, precisely

The remote browser runs **headed** on the Windows desktop. `test.use({
viewport: { width: 2560, height: 1440 } })` is a CDP device-metrics override,
not a window resize — `window.screen` follows the override (proven: with no
viewport set, the page reported `screen: [1280, 720]` with an outer window of
1296×808, larger than its own "screen"), and the physical adapter mode is
3840×2160, so 2560×1440 is definitively emulated and this document claims no
1440p monitor.

What is confirmed, and is the part the GPU pays for: `canvas.width ×
canvas.height` is 2560 × 1440 at `devicePixelRatio` 1.0, i.e. a 3.7 Mpx
swap-chain texture with MSAA on (`antialias: true`, `renderer.ts`). The budget
test asserts both dimensions, so a viewport that silently failed to apply
fails the test rather than producing a comfortable 720p number.

