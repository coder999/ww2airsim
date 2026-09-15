# Plan 5 design — the ocean


## Measured bathymetry correction — 2026-09-15

The fetched world subset spans **−7971 to +1189 m**; the built 513² grid spans
**−7807 to +1172 m**, with **−125 m** at its centre. The design's centre probe
did not establish the depth range of the whole box. Ocean data therefore use
**int16 metres**, little-endian, row 0 north and column 0 west, instead of the
int16 decimetres in the original snippets below. The header literal is
`int16-metres`; the size remains 526338 bytes and rounding error is at most
0.5 m. Terrain retains its own int16-decimetre format unchanged.

The proposed eastern orientation fixture `(60000, 0)` is only −25 m, not deep
water. The verified fixture is `(90000, 0)`, −4156 m. North/south fixtures
`(0, 80000)` (+224 m) and `(0, -80000)` (−1357 m) catch flipped rows.
GEBCO uses WGS84 horizontal coordinates and assumed mean sea level vertically,
not a WGS84 vertical datum. These measured corrections supersede the original
range, encoding, and fixture claims below.

**Date:** 2026-09-15
**Status:** Approved shape (Mark, 2026-09-15), pre-implementation
**Master spec:** [`2026-09-12-ww2airsim-design.md`](2026-09-12-ww2airsim-design.md) §4

**Section references:** a bare `§N` means a section of *this* document.
References to the master spec always say so.

## 1. What this plan builds

Water that is *this* water. Cascaded Tessendorf FFT on compute shaders driven
by a Beaufort wind setting, with Jacobian-derived foam, bathymetric depth
attenuating amplitude toward shore and driving a shallow-water colour ramp,
and the surface sunk by the same `d²/2R` the terrain already uses.

Two halves, as Plan 4 had:

- **The offline half.** A GEBCO_2026 subset becomes one depth field on the
  world grid (`tools/bathy/`, `content/ocean/depth.bin`). Small: the window
  this world needs is ~433 × 441 samples, 382 KB as int16, against Plan 4's
  107 MB. (Requested as OPeNDAP `.ascii` it arrives as text and is several
  times that on the wire; the binary `.dods` form is the 382 KB. Either is
  negligible, and the choice is the implementation's.)
- **The renderer half.** Spectrum → FFT compute → displacement, normal and
  folding targets → a camera-centred ring surface, shaded by depth and foam
  (`src/render/ocean/`).

There is no simulation half. §8 says why, and what it costs.

### Not in this plan

- **Wave height in `sim/`.** See §8. The aeroplane crashes at `y = 0` as it
  does today.
- **Deck motion, ditching, spray.** Plan 8 has the deck; ditching has no
  mechanics yet to attach sea state to.
- **Underwater rendering.** No below-surface camera, no refraction from below.
- **Breaking waves as geometry.** Foam marks where the surface folds; it does
  not spawn shore break.
- **Reflections beyond sky and Fresnel.** No screen-space reflections, no
  planar reflection pass. Both are their own subject and neither is needed to
  make water read as water at 170 m/s.
- **Surface materials on land.** Still Plan 4's height-and-slope colouring;
  the WorldCover splat guide remains a subject of its own.

## 2. Three things settled by measurement before this plan starts

Each of these was measured rather than assumed, and each removes a decision
this plan would otherwise have had to make blind.

### The bathymetry fetch works, and the world centre is in 126 m of water

**Verified 2026-09-15** against CEDA's OPeNDAP service, unauthenticated:

```
https://dap.ceda.ac.uk/thredds/dodsC/bodc/gebco/global/gebco_2026/
  ice_surface_elevation/netcdf/GEBCO_2026.nc.ascii?elevation[24190:24193][73270:73273]
```

returns the requested 4 × 4 window with its `lat`/`lon` maps attached, reading
−120 m to −128 m across it. The dataset descriptor is
`Int16 elevation[lat = 43200][lon = 86400]` — 15 arc-second global coverage,
int16 metres, WGS84 vertical datum, negative below sea level.

126 m at 10.8 N 125.3 E is shelf depth in Leyte Gulf, which is the right
answer. This matters beyond plausibility: it confirms the world centre is
**not** over the Philippine Trench, so the depth field spans a sane range
rather than saturating an int16.

### GEBCO_2026 is the current release, not 2025

Released April 2026; DOI `10.5285/4f68d5c7-45eb-f999-e063-7086abc036fa`.
Public domain — users are free to copy, publish, distribute, adapt and
commercially exploit the Grid, provided the source is acknowledged and no
official status is implied. AGPL-compatible, and safe in a public repository.
There is a no-navigation clause, which `content/ocean/NOTICE.md` must carry in
the same way `content/terrain/NOTICE.md` carries Copernicus Article 6(c).

### The FFT is written in raw WGSL, not TSL

The renderer design's open item 1 says TSL-versus-`wgslFn` is "a question for
the ocean plan". The evidence already answers it, and this plan closes the
item rather than inheriting it:

| Probe | AMD RDNA-2 | Qualcomm Adreno 7xx |
| --- | --- | --- |
| Raw WGSL `workgroupBarrier` compute | Works | Works |
| TSL `workgroupArray` + `workgroupBarrier` | `TypeError` | Identical `TypeError` |

Two vendors, two architectures, one failure mode, and the fixed probe threw it
too — so the 2026-09-12 "it was our bug" diagnosis is retired. An FFT is
exactly `workgroupArray` + `workgroupBarrier`; building it on the one path
that has never worked on any GPU we own would be a choice to discover the
problem late.

**Decision: `wgslFn` for the FFT and spectrum kernels.** TSL keeps the
material graph, where it works.

## 3. Bathymetry: the data and the pipeline

### The field

One level, **513 × 513 samples at 390 m posting**, int16 decimetres, on the
same tangent-plane projection as the terrain (`src/sim/world/projection.ts`,
already shared). 526 KB, committed, exactly as the terrain's coarse levels
are.

**513 rather than 1025, on purpose.** GEBCO's native 15 arc-second spacing is
**463.31 m in latitude and 455.11 m in longitude** at 10.8 N. So 513 × 513 is
already a mild upsample — 1.186× — and it is chosen not because it matches
GEBCO but because it **matches the terrain pyramid's L4 grid exactly**
(200 km / 512 = 390.6 m), which means one grid geometry, one set of sampling
arithmetic, and no second alignment to get wrong.

1025 would be 2.372× — 195 m posting carrying 460 m of information, which is
interpolation wearing the costume of data. The project has already had one
argument about a flattened surface being mistaken for a scale choice (Plan 4
hand-off, "the data flattening"), and inventing detail is the same error
pointing the other way.

### Where the coastline comes from

Not from this field. The ocean shader samples the **existing terrain
pyramid** for `isLand`, at up to 24.4 m posting — about **19× sharper** than
anything GEBCO offers. Depth drives only smooth quantities
(amplitude attenuation, colour ramp), which is what 450 m data is honestly
good for.

This is the whole reason the depth field is separate rather than a second
layer inside the terrain pyramid. Merging them would mean either resampling
GEBCO up to 8193² — 134 MB of invented detail — or coarsening the coastline to
390 m. Keeping them separate takes the sharpness from the source that has it
and the depth from the source that has that.

### The pipeline

`tools/bathy/`, mirroring `tools/terrain/`'s fetch-cache-build shape, with its
own command:

```sh
npm run bathy:build
```

**A sibling command, not folded into `terrain:build`.** The terrain build is a
107 MB download; this one is 380 KB. Joining them would make the cheap half
hostage to the expensive half, and Plan 4 already learned what a partially-run
build does to a test that gates on the wrong half (the `terrainBuild.test.ts`
skip that turned into an ENOENT, fixed 2026-09-14).

Unlike the terrain pyramid, the output is small enough to commit whole. There
is no gitignored tier here and therefore no named-skip machinery: a fresh
clone has the entire depth field.

### Licensing

`ASSETS.md` already carries the row "GEBCO 2024 bathymetry — To be recorded
with the pipeline, before first use". This plan records it, and corrects 2024
to 2026. `content/ocean/NOTICE.md` travels with the data, carrying the
acknowledgement, the no-official-status condition and the no-navigation
clause, so that someone who receives only the `.bin` still receives the terms.

## 4. The FFT

### Cascades

Three spectrum cascades at **pairwise non-commensurate patch sizes**, so that
the sum does not repeat at the least common multiple of the three. Starting
values to be tuned against the Tier 2 frame budget rather than asserted here;
the constraint that must survive tuning is that no two patch sizes share a
factor, because that is what produces a visible beat at altitude.

Resolution N = 256 per cascade is the starting point. N is a tier knob (§7).

### Per frame

1. **Evolve.** The stationary spectrum is generated once from the wind
   setting; each frame advances its phases by the deep-water dispersion
   relation `ω² = gk`. One dispatch.
2. **Transform.** A shared-memory Stockham FFT, rows then columns, per
   cascade. This is the part that needs `workgroupArray` and
   `workgroupBarrier`, and therefore the part that is raw WGSL.
3. **Derive.** Displacement (including horizontal choppiness), normal, and the
   Jacobian of the horizontal displacement. Foam is where the Jacobian goes
   negative — the surface folding on itself — accumulated with decay so that
   foam persists behind a crest rather than strobing.

### Wind

One Beaufort number selects wind speed, which parameterises the spectrum.
Master spec §4 makes wind a per-scenario weather parameter; there are no
scenarios yet, so it gets a **DEV-only URL parameter and a default**, the same
pattern as `?spawnX` (`src/render/spawn.ts`), including the
`tests/build/dist.test.ts` assertion that it is absent from a production
bundle.

The Beaufort-to-wind-speed and Beaufort-to-sea-state figures come from the
WMO scale and must be **cited to a named source in the implementation**, not
typed from memory. They become a test oracle (§9), and this project does not
let an untraceable number become an oracle.

## 5. The surface: extent, and why it is not 100 km

### The horizon is further away than the terrain is

The terrain draws to 100 km. Applying the same distance to the water would put
the edge of the world inside the frame. Computed 2026-09-15 from
`EARTH_RADIUS_M = 6371008.8` (`src/sim/world/projection.ts`):

| Eye altitude | True horizon |
| --- | --- |
| 600 m (the current spawn) | 87.4 km |
| 3,000 m (Plan 4's reference altitude) | 195.5 km |
| 4,572 m (15,000 ft) | 241.4 km |
| 11,370 m (F6F service ceiling, ~37,300 ft) | 380.6 km |

The service ceiling is **not currently in `content/aircraft/f6f-hellcat.json`**
— the schema has `diveSpeedMps` but no ceiling — so the 37,300 ft figure is
historical and, like every other performance number in this project, has to be
cited to a source when it is written down rather than carried from memory.
Nothing below depends on it being exact: it sets a draw distance, and the
rounding to 400 km absorbs a wide error.

At 3,000 m the horizon is nearly twice the present water extent. So:

**The ocean ring grid extends to 400 km**, set by the horizon at the service
ceiling and not by the terrain's draw distance. This is cheap — the outer
rings are enormous quads carrying no FFT detail, only the sink, the deep-water
colour and aerial perspective. The cost is in the near rings, which is where
it belongs.

### The sink, and the beach

The same `sinkM = d²/(2·EARTH_RADIUS_M)` that `mesh.ts` line 306 applies to
terrain is applied to the water. **That is the fix for the hidden beach**, and
the arithmetic that describes the defect is the arithmetic that removes it:
land sinks 80.4 m at 32 km while the flat plane stays at `y = 0`, so the plane
occludes any coast lower than 80.4 m at that range.

**The sink becomes one exported function that both meshes call**, not two
copies of one expression. This is precisely the hazard the Plan 4 hand-off
describes for vertical exaggeration — one number, two call sites, and a test
that they are the same number. A sink applied to one surface and not the other
is what produced the defect this plan is closing; shipping a second instance
of the same divergence would be remarkable.

### The mesh

A camera-centred ring grid rather than the present `PlaneGeometry`, for the
same reason terrain uses one: at 400 km a uniform grid is unaffordable and a
projected grid interacts badly with a vertical sink, because the projection
assumes the surface it is projecting onto is the one being displaced.

Camera-relative from the start, as everything here is.

## 6. Shading, and the horizon seam

Depth drives two things:

- **Amplitude attenuation.** Waves shoal and shorten in shallow water. Without
  this the sea has the same 3 m chop in 5 m of water off the beach as it has
  in 4,000 m of water offshore, which is what makes generic ocean read as
  generic.
- **The colour ramp.** From the shallow-water end at the shore to the
  deep-water end offshore.

**The horizon seam constrains the ramp's deep end.** `sky.ts` currently paints
the dome below its equator with `SEA_COLOUR`'s exact value, and that shared
literal is what makes the boundary invisible (`water.ts`, and the relation is
asserted in `tests/render/scene.test.ts`). With a ramp the sea is no longer
one colour, so the invariant becomes: **the ramp's deep-water end is the dome
literal**. The test shape is kept; its subject narrows from "the sea colour"
to "the deep end of the ramp".

Foam is composited on top of the ramp, not blended into it, so that
attenuation and foam remain separately debuggable.

## 7. Quality tiers

Master spec §4 requires tiers implemented from the start rather than
retrofitted, with thresholds derived from measured frame time via the Tier 2
harness rather than from estimated hardware figures.

The ocean's knobs are **cascade count** (3 / 2 / 1) and **N** (256 / 128).
Dropping to one cascade must remain visually coherent — a degraded sea, not a
broken one — which is a constraint on how the cascades are summed, not an
afterthought.

Threshold numbers are deliberately absent from this document. They are
measured in the implementation, and asserted there.

## 8. Why `sim/` is untouched, and what that costs

Both of master spec §4's stated ocean consumers — amplitude attenuation and
the colour ramp — are renderer-side. `heightAt` keeps returning `SEA_LEVEL_M = 0` over
water. Nothing in `src/sim/` changes, so the golden trajectory,
`tests/sim/terrainContact.test.ts`, the soak and the test cards are all
untouched by this plan, and a regression in any of them would be a real
finding rather than expected churn.

**What it costs: the aeroplane can clip a wave crest without crashing.** At
Beaufort 4 that is roughly a metre of error, and only for an aeroplane already
flying below wave height at 170 m/s.

**Why the obvious fix is the wrong one.** Querying the FFT's displacement from
`sim/` would make the simulation depend on GPU output — breaking the single
constraint the architecture rests on, that `sim/` never imports `render/` and
never touches a browser global, which is what makes ~90% of the logic testable
headlessly and lets an AI pilot fly the player's seat. It would also make the
simulation non-deterministic across GPUs, or force a CPU FFT into the fixed
step.

**The honest fix, recorded for the plan that needs it.** A cheap analytic
swell model in `sim/` — a few summed sinusoids sharing the Beaufort parameter
and the phase clock with the renderer, agreeing on the *large-scale* surface
without agreeing on the ripples. That is enough for ditching and deck motion,
it stays deterministic and headless, and it belongs to the plan that has
ditching. Naming it here is what stops it being reinvented as an emergency.

## 9. Testing

### Tier 1 — Node, no GPU

The weight sits here, as it did for terrain.

- **A pure TypeScript reference FFT, checked against a naive DFT.** Two
  independent implementations of the same transform, agreeing. This is the
  guard that makes everything downstream meaningful, and it is also the oracle
  Tier 2 compares the GPU against.
- **The dispersion relation** and the spectrum's parameterisation.
- **Significant wave height derived from the spectrum matches the Beaufort sea
  state** for each step of the scale, within a stated tolerance. A falsifiable
  physical assertion rather than a shape check — the same species of test as
  the flight test cards, and it fails loudly if the spectrum is normalised
  wrongly, which is the classic Tessendorf error.
- **The bathymetry build against source samples**, mirroring
  `tests/tools/terrainBuild.test.ts`: the built grid interrogated at known
  positions against the GEBCO values they came from.
- **The depth sampler**, including out-of-world behaviour and the int16
  decimetre round trip.
- **The sink function**, asserted to be the single one both surfaces use.

### Tier 2 — real GPU, reference platform

- **GPU FFT against the Node reference.** Read the displacement target back
  and compare it to the reference FFT for the same spectrum and the same
  simulation time. This is the test worth having: it converts "the ocean looks
  fine" into an assertion, and it is the only thing that can catch a WGSL
  indexing error that produces plausible-looking noise.
- **Zero WebGPU validation errors** across camera sweeps, as terrain has.
- **The frame budget**, measured, with the tier thresholds derived from it.

Still no screenshot goldens, for the reason
`tests/e2e/adapter.spec.ts` already documents.

### Tier 3 — human eyes

Does it read as sea, and does the coast now read as a beach. That is the
question this plan exists to answer and no test can.

## 10. The roadmap, settled

Three documents disagreed about plan numbering because the assists plan was
inserted into the slot the roadmap had given terrain, and every later number
shifted without anything being updated. The renderer design's deferral table
still said terrain was Plan 3 and the ocean Plan 4; the terrain design said
the ocean was Plan 6 and deck operations Plan 8; the assists design reserved
Plan 5 for combat.

**Decision (Mark, 2026-09-15):**

| Plan | Subject | Master spec |
| --- | --- | --- |
| 1 | Scaffold and flight model | §5, §11 |
| 2 | Renderer and flight controls | §3, §4 |
| 3 | Input assists | §5 |
| 4 | Terrain and level of detail | §4 |
| **5** | **Ocean** | **§4** |
| 6 | Combat and damage | §6 |
| 7 | AI | §7 |
| 8 | Carrier and airfield operations | §4, §8 |
| 9 | Meta-game | §8 |

The deployment work of 2026-09-15 is infrastructure and takes no number.

**This table is authoritative and lives in master spec §15.** The copy above
exists because this is the plan that took the decision; the renderer design's
deferral table and the terrain design's two numbered references are replaced
with pointers to §15 rather than restatements of it. One copy cannot
contradict itself, and this contradiction cost a decision nobody had taken.

## 11. Open items

1. **Cascade patch sizes and N.** Starting values only; tuned against measured
   frame time and visual beat, and recorded with their measurements.
2. **Where the Beaufort default sits.** A constant in this plan; it becomes a
   per-scenario weather parameter when master spec §9's scenarios exist.
3. **Whether the outer rings need the FFT at all.** Beyond some distance the
   displacement subtends less than a pixel and only the normal matters.
   Measured, not guessed.

## 12. Risks

| Risk | Mitigation |
| --- | --- |
| The FFT is the hardest single system in the project (master spec §14) | The Node reference FFT is written first and is the oracle. The flat-water path stays in the tree until the GPU FFT passes the readback comparison against it. |
| A WGSL indexing error produces plausible-looking noise | That is exactly what the Tier 2 readback comparison catches; nothing else would. |
| 400 km of water costs more than 100 km did | Outer rings carry no FFT detail. The budget is measured before the tiers are set, not after. |
| The horizon seam regresses when the sea stops being one colour | The shared-literal invariant is kept and its subject narrowed; the existing test moves with it rather than being deleted. |
