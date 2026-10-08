# C1 batch 1: control surfaces on the five Blender models

**Goal:** ailerons, elevator, rudder and flaps move on the B-29, Ki-21, G4M,
P-38 and Ki-84 (`MASTER_PLAN.md` Track C1, batch 1).

**Run:** in the worktree `../ww2airsim-c1-surfaces` (branch `c1-surfaces-batch1`), unattended (Mark, 2026-10-08).
**Viewing checkpoint:** the end of the plan only. The five models go on the Hangar bench
with the new roll, pitch and yaw sliders. The run is unattended, so the captures go in the handoff.

## Rulings (Mark, grilling 2026-10-08)

| # | Ruling |
| --- | --- |
| R1 | Visual only. The renderer follows `Controls` through a cosmetic slew rate. The flight model is unchanged. |
| R2 | Full travel at any speed. No `controlFade` scaling. |
| R3 | Flaps follow `AircraftState.flapFraction`, which already moves at `spec.flap.travelSeconds`. |
| R4 | Default limits: aileron ±20°, elevator ±25°, rudder ±25°, flap 0-45°. A per-rig override is allowed only with a cited source. |
| R5 | The Hangar bench gains roll, pitch and yaw sliders, and is the test harness. |

## Measured (2026-10-08, `npm run models:inspect`)

One node per mesh, one draw call per node, and every entry's budget is 47 draw calls.

| Model | Draws today | New nodes | Draws after |
| --- | --- | --- | --- |
| B-29 | 13 | 2 aileron + 4 flap + 2 elevator + 1 rudder = 9 | 22 |
| G4M | 6 | 2 + 4 + 2 + 1 = 9 | 15 |
| Ki-21 | 6 | 2 + 4 + 2 + 1 = 9 | 15 |
| P-38 | 6 | 2 + 4 + 2 + 2 rudders = 10 | 16 |
| Ki-84 | 5 | 2 + 2 + 2 + 1 = 7 | 12 |

Triangles barely change, because the pieces are already cut (`kit.py`
`_lifting_detailed`). Today they are emitted into their parent's node.

## Names

Frame: +x forward, +y up, +z starboard (`Prop1..N` run port to starboard).

| Node | Drives | Positive command moves the trailing edge |
| --- | --- | --- |
| `AileronL`, `AileronR` | roll | +roll (right): R up, L down |
| `ElevatorL`, `ElevatorR` | pitch | +pitch (nose up): up |
| `Rudder`, or `Rudder1`, `Rudder2` port to starboard | yaw | +yaw (nose right): to starboard (+z) |
| `Flap1L` ... `FlapNR`, inboard to outboard | flapFraction | down, as the fraction rises |

The tailplane is mirrored, and a swept or tapered hinge line is not one axis across both halves,
so the elevator is two nodes.
`PART_NAME` gains `(Aileron|Elevator|Flap\d+)[LR]|Rudder\d*`.

## Tasks

### 1. Hinges come from the script, not hand-copied

Every pivot today is typed into the entry's `keep`, with an axis from `±x/y/z`.
A hinge line on a tapered or swept panel is not axis-aligned, and `kit.py`
already knows it exactly, so it should be the one copy.

- [ ] `kit.py`: a control tuple gains a name, `(z0, z1, hinge, 'Aileron')`. The
  control piece goes to its own node (`<name>R`, with the mirror as `<name>L`;
  a fin's control takes the name as given). The node records its hinge line, the
  hinge chord fraction's points on the chord line at the piece's two spanwise
  ends, as a glTF extra (`export_extras=True` on that object's custom property only).
- [ ] The build: a `keep` entry with no `pivot` takes the node's `hinge` extra
  as its pivot. The pivot axis is then a free unit vector, so `Pivot.axis` accepts a
  unit `vec3` as well as the six names (`manifest.ts`, `axisVector`). Normalize
  already rotates `pivotAxis` into the output frame.
- [ ] Verify before relying on it: an extra survives Blender export, then
  collapse, then pivot. Check with one node on the Ki-84 first. If extras don't
  survive, fall back to a sidecar JSON next to the raw glb in the build cache, and record
  which path was taken in the handoff.
- [ ] Unit test (`tests/tools/models/`): a pivot with a vec3 axis moves the origin
  and moves no vertex, the same check the named-axis pivot has.

### 2. The five scripts, rebuilt

- [ ] Name every control in the five scripts. Each entry's `keep` lists the new nodes, without pivots.
- [ ] `npm run models:build -- <id>` for each (Blender is on nexus). Commit the glbs.
- [ ] `npm run models:inspect` matches the "Draws after" column above. A mismatch is a finding, not a tolerance.

### 3. Rig data and the posing math

- [ ] `airframeRigs.ts`: `AirframeRig.surfaces: SurfaceRig[]`, where
  `SurfaceRig = { node, drives: 'roll' | 'pitch' | 'yaw' | 'flap', sign: 1 | -1, maxDeg?, source? }`.
  The defaults (R4) live in one table keyed by `drives`. `sign` maps a positive
  command to a positive turn about the baked axis. It is the only thing a mirrored
  half changes, and the test in task 4 decides it.
- [ ] `pivotedAirframe.ts`: a pure `slewToward(current, target, dtS)` at
  `SURFACE_SLEW_PER_S`, with full travel (-1 to +1) taking 0.3 s, and
  `surfaceAngleRad(rig, value)`. Flaps take `flapFraction` straight through,
  unslewed (R3). `rigParts` adds `'surfaces'` when a rig has roll, pitch or yaw
  surfaces, and `'flaps'` when it has flap surfaces.
- [ ] `PartId` gains `'surfaces'`. AI aircraft already pass their own
  `controls` (`airframeUpdate.ts`), so the Ki-84 AI's surfaces move with no extra wiring.

### 4. Tests, enrolled

All of these go in the existing table-driven files, so the next batch gets coverage just by adding rig rows.

- [ ] `aircraftRigs.test.ts`, per rig surface, against the committed glb:
  - the node exists, once, and carries a unit `pivotAxis`;
  - the hinge is on the piece's leading edge: every vertex lies aft of the hinge
    line, and the nearest is within `CONTROL_GAP_M` (0.012 m) plus slack measured on the B-29;
  - **sense**: turning by a +1 command's angle moves the trailing-edge centroid the
    way the Names table says (y for ailerons, elevators and flaps, z for rudders).
    This is the check that decides each `sign`. See it fail once with a flipped sign.
- [ ] Pin the enrollment: the five Blender rigs each have all four `drives`, and
  the list names exactly those five ids, so an empty filter fails.
- [ ] `pivotedAirframe.test.ts`: `slewToward` reaches the target and never
  overshoots, a 0.3 s full sweep takes 0.3 s at any frame step, and a flap's angle
  at fraction 1 is its maxDeg.

### 5. Hangar bench

- [ ] `BENCH_PARTS` gains a `surfaces` row with roll, pitch and yaw sliders from
  -1 to +1, greyed out unless `parts` has it. `benchController` passes them as `controls`.
  The existing flaps row now drives something.
- [ ] `benchController.test.ts`: the sliders reach `AirframeUpdate.controls`.
- [ ] `hangar.spec.ts` (wiring, read through the bench's own probe, not pixels):
  on the B-29, roll +1 changes `AileronR`'s pose, and `probeArticulated` lists the new nodes.
- [ ] Checkpoint captures, gated behind `E2E_CAPTURE=1`. For each of the five,
  three views (roll +1, pitch +1 with yaw +1, flaps down) on the bench, saved to `docs/handoff/`.

### 6. Docs

- [ ] `docs/models.md` §5: the new part names and the hinge-from-extras rule.
- [ ] `docs/aircraft.md`: a line on surface splitting for downloaded models (batches 2-4). Today there is none.
- [ ] `MASTER_PLAN.md` C1: batch 1 done, with the date.

## Done means

`npm run verify` passes, along with the touched unit files and `hangar.spec.ts`. A handoff
in `docs/handoff/` holds the captures and the measured draw counts. Mark looks
at the bench on `ww2airsim-2.windomlane.org` (this worktree's slot) when he is back.
