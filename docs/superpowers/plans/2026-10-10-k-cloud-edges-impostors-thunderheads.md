# Track K: cloud edges, impostors, thunderheads

**Goal:** `MASTER_PLAN.md` Track K. Kill the one visible cloud defect Mark
named (pixelated, flickering edges, on every tier and worst on Low), bring
the cloud cost to ≤ 4 ms in every 1440p High view, and add occasional
thunderheads. Blender on ryzen is the new bake tool; `cumulus.py`'s deck
stays as the shipped deck.

**Run:** four worktrees, one per phase, in order (`k1-cloud-edges`,
`k2-cloud-impostors`, `k3-thunderhead`, `k4-auto-tier`), each pointing its
own vite at the `ww2airsim-2` slot for viewing. Each phase ends with a
handoff, a mailed capture set, a windomlane URL, and the matching update to
`docs/clouds.md` in the same commit. Nothing in a later phase starts before
Mark has flown the previous one, except the Blender spikes marked (parallel).

**Viewing checkpoints (Mark, 2026-10-10):** the end of each phase, flown on
windomlane, plus the thunderhead Cycles renders by email before Task 3.3.
Five looks in all. No mid-phase checkpoints.

**Attendance (Mark, 2026-10-10):** **Phase 1 is attended**: it stops at its
checkpoint and waits for his ruling on the Task 1.4 rung. Phases 2-4 decide
attended or unattended when each starts, by asking him then.

**Who runs what (Mark, 2026-10-10):** the planning session's model
orchestrates and reviews every diff and measurement table before it is
committed. Bounded tasks with a mechanical pass condition go to a
**Sonnet** subagent briefed with that task's section: 1.1, 1.2, 2.1, 3.1 and
all of Phase 4. Tasks that touch the march, the laid-out TSL `Fn`s, the
composite, or that interpret budget numbers stay on the **strong** model:
1.3, 1.4, 2.2, 3.2, 3.3 and every ruling. Each task below is tagged. A
Sonnet brief carries these hard stops, on which it reports instead of
continuing: a black or unchanged frame, any WGSL validation error, boot over
1.5 s, or a budget number that moved the wrong way. The reason is
`clouds.md` §4: a broken graph renders black with no error and makes timings
look like a win.

**Status:** plan only. Written from the 2026-10-10 grilling; no code.

## Rulings (Mark, 2026-10-10 grilling)

| # | Ruling |
| --- | --- |
| R1 | **The deck stays.** Today's cumulus archetype and the VDB coverage placement are the look. No new deck archetypes. The four-archetype idea was dropped by Mark. |
| R2 | **The defect is edges:** pixelated and flickering, present on all tiers, worst on Low. Lighting contrast and shape were not complaints. |
| R3 | **Budget:** clouds ≤ 4.0 ms gpu p95 in every 1440p High view of `tests/e2e/views.ts`, in-cloud included. Measured as baseline minus `?cloudTier=off`, same method as H0 Task 1. |
| R4 | **Representation:** near clouds raymarched, far clouds impostors. Impostors are **unlit G-buffers shaded at runtime** by the same lighting model as the march, so near and far share one look as the sun moves. |
| R5 | **Lighting is baked.** Sun transmittance (and the multi-scatter calibration) come from an offline bake of the archetype; the runtime light march goes from 6 steps to 0. The runtime erosion noise does not self-shadow; the archetype does. |
| R6 | **Low = impostors only.** No raymarch on Low. Fly-through on Low is a fade and a whiteout, not a volume. |
| R7 | **Blender is the bake tool,** as an offline step on ryzen whose outputs are checked into `content/sky/`. The game never depends on Blender. Mark wants a fresh approach after repeated `cumulus.py`-era attempts; see "What Blender does and does not fix" below. |
| R8 | **Asset cap: `content/sky/` ≤ 50 MB gz** (9 MB today). |
| R9 | **Acceptance is two gates:** numbers (R3 plus the flicker metric below) and Mark's eye: mailed before/after captures and flicker maps, then he flies it on `ww2airsim.windomlane.org` with `?cloudTier=high`. |
| R10 | **Thunderheads:** cumulonimbus, volumetric when near and impostor when far (like the deck), placed at random by a seeded density knob, visual only plus their shadow. Authored in Blender as a scripted geometry-nodes recipe, headless, with the `.blend` checked in for viewing. **Cycles renders are approved by Mark before any runtime work on them.** |
| R11 | **Auto-tier fix is in scope, last** (`clouds.md` issue 2). |
| R12 | Phase order: **1 edges → 2 impostors + Low → 3 thunderheads → 4 auto-tier.** |

## What Blender does and does not fix

Stated once so the plan is honest about where the win comes from. The
earlier failures (`clouds.md` §3) were budget and temporal, not shape; Mark
approved the `cumulus.py` look. Blender buys three things numpy does not
have: a real volumetric renderer to calibrate lighting against (Cycles),
impostor atlases rendered with real volumetrics, and a scripted authoring
path for a cloud `cumulus.py` cannot make (a 12 km cumulonimbus with an
anvil). **The edge defect lives in the runtime resolve** (`cloudPass.ts`:
a 0.5-scale march upsampled 2×, and High's 1-in-8 amortized update). Blender
fixes it only indirectly, by freeing the budget that resolution and update
rate cost. Phase 1 states that trade in numbers.

Ryzen has the blender.org 5.0.1 Linux build in WSL, byte-identical to
nexus's (`serverconfig/ryzen.md`, verified 2026-09-27), and Cycles HIP works
but is overhead-bound on small renders (memory `reference-ryzen-cycles-hip-not-faster`).
Bakes reuse the version pin from `tools/models/blender/run.ts`
(`BLENDER_VERSION`). Runs go through `remote-run` under `hwlock ryzen-budget`
when they share the GPU with a measurement.

## What the repo says today (checked 2026-10-10)

| Fact | Where |
| --- | --- |
| High: 128 view steps, 6 light steps (1 fine), scale 0.5, 1 texel in 8 per frame. Medium 56/4/0.3/every frame. Low 32/2/0.25/every frame | `CLOUD_TIERS`, `src/render/scene/clouds.ts:63` |
| Clouds cost 3.4 ms (above-deck) to 8.7 ms (in-cloud) of the frame at 1440p High, before H0's edge-skip; after it, in-cloud is 9.5 ms total against a 10.0 ms gate | `docs/handoff/2026-10-08-h0-render-budget.md` |
| The resolve already has a depth-aware upsample (not alpha-aware) and a 3×3 fresh-sample history clamp on High | `cloudPass.ts:122-142`, `:461-468` |
| The immediate edge re-march is off by default since 2026-10-10 (`?h0EdgeMarch=1` restores it); it cost 1.3-3.2 ms and its absence is the accepted shimmer | `cloudPass.ts:253-259`, H0 handoff ruling 1 |
| Flicker metric: 99.9th-percentile per-pixel spread over 30 frozen frames, per view, with flicker maps | H0 handoff, `tests/e2e/cloudTemporal.spec.ts` |
| One archetype, 250×170×307 voxels at 5.86 m, shipped half-res; 205 KB gz | `tools/sky/cumulus.py:17`, `content/sky/cumulus.bin.gz` |
| `content/sky/` is 9.0 MB gz; 8.0 MB of it is `shape.bin.gz` | `ls -la content/sky` |
| A cloud layer is `{kind: cumulus \| cirrus, baseM, thicknessM, coverage}`; at most 4 per scenario | `src/sim/scenario.ts:46-61` |
| Cumulus march is capped at 6 km after the curved-slab entry | `MAX_MARCH_M`, `clouds.ts:99` |
| Sun-view shadow map, 1024², 80 km, from the density field | `cloudShadow.ts` |
| Auto-tier picks Low on Mark's desktop because the title-screen measurement is vsync'd at 11 ms; nothing shows the chosen tier | `docs/incidents/2026-09-20-low-tier-hides-trees.md` |
| Laid-out TSL `Fn`s: one instance per material, no uniform read inside, or boot goes to 18-39 s | `clouds.md` §3.9, §4 |

## Measurement protocol (every phase)

- Reference RX 6700 XT through the console Playwright server, `hwlock ryzen-budget`, **median of three runs**, ryzen CPU monitored (the H0 trap: `vmmemWSL` at 45-60% spiked p95 to 14-18 ms), no other 3D client.
- Cloud cost = view p95 minus the same view at `?cloudTier=off`, back-to-back in one session (`clouds.md` §4: one capture is not a baseline).
- Edge quality = the H0 flicker metric (99.9th-pct spread, 30 frozen frames) **and** a motion variant: the same spread over 30 frames of a slow roll (`?look=` sweep), which is what Mark sees in flight. Both per view, both with maps.
- Every phase handoff mails: the budget table, the flicker table, before/after still pairs, flicker-map pairs, and the windomlane URL with the DEV params to compare.

## Phase 1: edges, funded by baked lighting (branch `k1-cloud-edges`)

**Outcome:** High and Medium edges are crisp and stable; clouds ≤ 4 ms in
every view; light steps 0 on every tier.

### Task 1.1 (parallel spike, Sonnet): get the archetype into Blender and back

The one real unknown in the toolchain. Three routes, try in order, stop at
the first that round-trips `cumulus.bin.gz` byte-exactly (same voxel values
after export):

1. **pyopenvdb** in ryzen WSL's Python: numpy → `.vdb` → Blender `Volume` object → bake → export voxels with Blender's Python.
2. Blender's bundled `openvdb` module, if 5.0.1 exposes it.
3. Fallback: skip VDB, load the `.bin` in a Blender Python script directly into a `Volume` via a `.vdb` written by a 40-line minimal VDB writer (dense grid only).

Deliverable: `tools/sky/blender/roundtrip.py` and a check that asserts
equality. If none of the three works in one session, the phase continues
with the bake in numpy (`cumulus.py`), and Blender enters at Phase 2 for
atlases only. Mark is told which happened.

### Task 1.2 (Sonnet): bake sun transmittance and calibrate multi-scatter

- **Format (recommended):** per voxel, 9 coefficients of order-2 spherical harmonics of **log-transmittance** toward the light, 8-bit, at the shipped half-res archetype (125×85×154 = 1.6 M voxels). 9 bytes/voxel = 14.7 MB raw, expected 4-6 MB gz. Log-transmittance keeps the SH from ringing into negative transmittance; clamp on decode.
- **Fallback format:** 4 elevations × 8 azimuths = 32 directions, 1 byte each = 52 MB raw (too large for R8 unless quarter-res); only if SH visibly blurs the lit/shadow boundary against the Cycles truth.
- **Truth:** Cycles renders of the archetype at sun elevations 15°, 45°, 75° are the reference the runtime is compared to (same view, same sun). `MS_SCALE`, albedo and the powder constant are re-fit to minimize the difference. This replaces the three multi-scatter octaves with a baked term plus one fitted constant. The CPU work of the bake itself (line integrals through the voxel grid) is numpy; Cycles is used only as the reference renderer, which is what it is good at.
- Gate: a fixed-view comparison image (runtime vs Cycles) with the mean difference in the handoff. No threshold yet; Mark looks.

### Task 1.3 (strong): runtime lookup replaces the light march

- `cloudLighting.ts`: the light march becomes one 3D texture fetch per view step (SH evaluated for the sun direction in cloud-local coordinates; the cell's rotation is already decoded in `cloudField.ts`). `lightSteps` and `fineLightSteps` go to 0 in every tier; the uniforms stay so `?cloudTune` can A/B.
- Trap: the fetch goes inside the laid-out density `Fn` pattern (`CloudField.laidOut()`), textures captured, direction passed as an argument. Re-check the boot gate (< 1.5 s, `tests/e2e/boot.spec.ts`) in the same commit.
- Measure: the per-view cloud cost table. Expected saving: the Task 11 ladder said view steps cost more than the light march, so expect 1-2 ms, not 4. The rest comes from Task 1.4 trading steps for resolution and from Phase 2 removing far texels.

### Task 1.4 (strong): spend it on edges

A ladder, each rung measured back-to-back, stop when R3 fails:

1. **Alpha-aware upsample.** The composite's depth weight gets an alpha term so a cloud silhouette is not bilinearly smeared across a 2×2 full-res block. Shader-only, expected ~0 ms. This is the "pixelated" half.
2. **`updatePeriod` 8 → 4 → 1 on High.** The amortized update is the "flicker in motion" half. Each halving costs march time; the baked light makes a march texel cheaper, so find where R3 holds.
3. **`resolutionScale` 0.5 → 0.65 → 0.75 on High**, Medium 0.3 → 0.4. Fewer steps if needed (`cumulusSteps` 128 → 96, priced by H0 at about 1 ms).
4. **Edge re-march on (`h0EdgeMarch=1`)** if budget remains.

Record every rung's cost, still-flicker and motion-flicker. The chosen rung
is the one that holds R3 with the lowest motion-flicker. Medium follows the
same ladder at its own budget (recorded, not asserted, per H0 R2).

### Phase 1 gates

- Clouds ≤ 4.0 ms in every 1440p High view (R3).
- Still and motion flicker metrics lower than `main`'s in every view, with maps.
- Boot < 1.5 s cold; `cloudTemporal`, `clouds`, `cloudPixels`, `cloudShadow` pass.
- Mailed captures; Mark flies `?cloudTier=high` on windomlane and rules.

## Phase 2: impostors and Low (branch `k2-cloud-impostors`)

**Outcome:** beyond a split distance, every weather cell draws a camera-facing
impostor of the archetype at full resolution; Low draws only impostors.
Distant edges become pixel-sharp by construction and the march stops at the
split distance, which is the remaining budget lever for the far views.

### Task 2.1 (Sonnet): Blender renders the atlas

- Views: an octahedral set over the **full sphere** (the pilot is above the deck at 3,200 m and below it at 600 m), 8×8 = 64 views.
- Per view texel: alpha, mean depth along the ray, and the same SH2 log-transmittance basis as Phase 1 projected along the view ray (9 channels). 12 channels in three RGBA8 textures.
- Sizing, which is the first thing to measure: at 256² per view, 64 × 65,536 × 12 B = 50 MB raw, 12-20 MB gz expected; at 128², a quarter of that. A 1.8 km cloud spans about 300 px at 10 km and 1,000 px at 3 km on a 90° 1440p view, so **256² implies a split near 8-10 km, 128² is only enough beyond ~20 km.** The handoff states atlas size against split distance and Mark picks, inside R8.
- Rendered with Cycles from the Task 1.1 volume, so the alpha and depth come from real volumetrics.

### Task 2.2 (strong): runtime impostor pass

- One instanced draw of camera-facing quads, one per weather cell beyond the split, at full resolution, depth-tested against the scene, written into the cloud composite with the march's own lighting applied per pixel (R4). The march's slab interval is clamped to the split distance.
- A blend band (split ± 1 km) where the march's alpha fades out and the impostor's fades in.
- **Seam test** (new spec): a fixed view with the split at two distances; the pixel difference inside the band must be below a grey-level threshold set from the first measurement, and the sun is swept across three elevations in the same test.
- Shadows: unchanged. The sun-view map reads the density field, which does not know about the split.

### Task 2.3 (strong): Low = impostors only

- Low: no cloud march; every cell is an impostor; `cumulusSteps` unused. Fly-through: the impostor fades as the camera enters the cell's radius, and a full-screen whiteout scales with the CPU coverage twin's local density (`skyCoverageTable`), so Low still reads "in cloud".
- Budget: Low clouds ≤ 1 ms in every view (recorded, then asserted once stable).

### Phase 2 gates

- High ≤ 4 ms holds with the split at the chosen distance; far views (above-deck, high-6000) drop further.
- Seam test passes across the sun sweep.
- Low ≤ 1 ms; Low edges have no shimmer in the motion-flicker metric (impostors are stable by construction; the test proves it).
- `content/sky/` ≤ 50 MB.
- Mailed captures of High at the split and Low; Mark flies both.

## Phase 3: thunderheads (branch `k3-thunderhead`)

**Outcome:** a seeded density knob scatters occasional cumulonimbus towers,
base ~1 km, top 10-12 km, 8-15 km wide, with anvils; volumetric when near,
impostor when far; they shade the sea.

### Task 3.1 (parallel spike, can start during Phase 2, Sonnet): scripted archetype in Blender

- `tools/sky/blender/cumulonimbus.py`: a headless geometry-nodes recipe (seed, base height, tower height, anvil spread, lobe scale, erosion) that builds the volume and exports it through the Task 1.1 path. The `.blend` it produces is checked in for viewing, never hand-edited (the script is the source).
- **Gate before anything else:** Cycles renders at three sun elevations plus a dusk render, mailed beside Mark's sunset-deck photos for the lighting match (he has no thunderhead photo; shape references are read, never copied, per `clouds.md` §7). Mark approves or sends it back. Iterations are minutes each on HIP.

### Task 3.2 (strong): assets and sizing

- Voxel size: a 12 km × 15 km × 15 km box at 80 m is 150 × 188 × 188 = 5.3 M voxels; with the SH transmittance that is ~50 MB raw, ~12 MB gz. 100 m voxels if the cap bites. The anvil's thin edge is what sets the floor; the Cycles gate shows whether 80 m holds it.
- Atlas as Phase 2, probably 128² views (the tower is seen from 20-60 km far more than from 5).

### Task 3.3 (strong): scenario and placement

- A new layer kind in `src/sim/scenario.ts`: `{kind: 'cumulonimbus', baseM, topM, density}`; `density` is the expected count per 80 km map (0 to ~3). Placement: seeded by the scenario id, rejection-sampled against the deck's weather map so a tower sits in a deck cell, not in a gap. Free-flight gets `density: 0.5`.
- Runtime: a second, tall slab for this kind; a per-layer march cap (the 6 km cap would truncate a near tower); the same split-distance rule as the deck. The shadow map adds the tower's column.
- E2E: a fixed-seed scenario with one tower in a known cell, a screenshot check that it is there, and the budget views re-run with it in frame.

### Phase 3 gates

- Mark approved the Cycles renders (Task 3.1).
- High ≤ 4 ms with a tower in frame at 5 km and at 30 km.
- `content/sky/` ≤ 50 MB.
- Mailed captures; Mark flies free-flight with a tower on the horizon and then around it.

## Phase 4 (Sonnet): auto-tier (branch `k4-auto-tier`)

The incident's root cause is a vsync'd title-screen measurement reading
11 ms (`docs/incidents/2026-09-20-low-tier-hides-trees.md`).

1. Measure after **New game**, in the first seconds of flight, not on the title screen; detect a vsync-capped sample (p50 pinned at a refresh multiple) and discard it.
2. Show the chosen tier on the HUD for a few seconds and in Settings, with the measured p95 beside it.
3. E2E: a run under Mark's Chrome flags on the reference GPU asserts the tier is High; a second run with `?oceanTier=low` asserts the HUD shows it.
4. With Low now impostors-only (Phase 2), a mis-pick is crisp rather than shimmering, which is the fallback if the measurement still misjudges a GPU.

Gate: the E2E passes; Mark sees "High" on his desktop without a URL parameter.

## Risks, named

| Risk | Where it bites | Mitigation |
| --- | --- | --- |
| VDB round-trip has no clean path in Blender 5.0.1's Python | Task 1.1 | Three routes listed; numpy fallback for the bake keeps Phase 1 moving |
| SH2 blurs the lit/shadow boundary | Task 1.2 | Compare against Cycles; fall back to 32 directions at quarter-res |
| Baked light does not fund 4 ms on its own | Task 1.3 | Expected; Task 1.4's ladder and Phase 2's split are the rest of the budget |
| A new 3D fetch inside the laid-out `Fn` breaks WGSL validation or boot time | Task 1.3 | `clouds.md` §4 pattern; boot gate in the same commit |
| Impostor seam visible as the sun moves | Task 2.2 | Shared lighting model (R4) plus the sun-sweep seam test |
| Atlas size vs split distance vs R8 | Task 2.1 | Sizing table in the handoff; Mark picks |
| The tall slab defeats the curved-slab early-outs and the 6 km cap | Task 3.3 | Per-layer cap; budget views re-run with a tower in frame |
| Measurement noise from shared ryzen load | Every phase | Protocol above; three-run medians; CPU monitored |

## Not in this plan

- Four deck archetypes (dropped by Mark, R1).
- Altocumulus, dusk crimson, shadow darkness (`clouds.md` issues 6, 7): the look-pass sitting, unchanged.
- Thunderhead rain, lightning, turbulence (R10: visual only).
- Cirrus changes.
