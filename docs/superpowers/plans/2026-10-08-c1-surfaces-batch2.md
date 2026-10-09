# C1 batch 2: control surfaces on the F6F, F4U and F4F

**Goal:** ailerons, elevators, rudder and flaps move on the three US fighters (`MASTER_PLAN.md` Track C1, batch 2).

**Run:** in the worktree `../ww2airsim-c1-batch2` (branch `c1-surfaces-batch2`), unattended. It runs in parallel with C2 (bay doors) in its own worktree (Mark, 2026-10-08).
**Viewing checkpoint:** the end of the plan only: the three on the Hangar bench at `ww2airsim-2.windomlane.org/hangar.html?bench`. The run is unattended, so the captures go in the handoff.

## Rulings carried from batch 1 (Mark, 2026-10-08)

- Visual only, with a 0.3 s slew.
- Full travel at any speed. Default limits: aileron ±20°, elevator ±25°, rudder ±25°, flap 0-45°.
- Flaps follow `flapFraction`.
- Names and orientation as in batch 1: `surfaceDrive` reads each node by its name, and a positive turn raises the trailing edge, or swings a rudder's to starboard (`docs/models.md` §5).

## Measured (2026-10-08)

| Model | Source | Surfaces in the source | Draws today / budget |
| --- | --- | --- | --- |
| F6F | `f6f.glb` (manilov.ap), yawed 151.84° | none: the wings are `krilo_13`/`krilo_14`, the tail is `Line132`/`Line133`, the fin is `Line04` | 39 / 47 |
| F4U | `f4u.glb` (manilov.ap) | none: one `f4u1fuse` mesh, 16 materials | 22 / 47 |
| F4F | committed `wildcat.glb` (rojatsu), **frozen** | separate nodes: `Aleron_Der`/`Aleron_Izq`, `Timon_Der`/`Timon_Izq` (elevators), `Timon_Prof` (rudder); no flaps | 47 / 47 |

The F6F and F4U wireframes in the Hangar show wing and tail triangles running the full chord, with no edge at any hinge line. So a `split` box, which takes whole triangles, cannot isolate a surface: every surface has to be *cut*.

Both raw inputs rebuild byte-identically to the committed glbs (checked 2026-10-08). The F6F's raw input is `content/models/candidates/f6f.glb`, linked into the cache.

## Tasks

### 1. A vector hinge axis, and a cut

- [ ] `manifest.ts`: `Pivot.axis` takes a unit vec3 as well as the six names. `pivot.ts` already takes a vector, from batch 1's `Hinge`.
- [ ] `split` gains an optional `cut: { normal }`, a plane through the rule's `pivot.point`. Before selection, every triangle the box touches is sliced by the box's faces and by that plane, with each attribute interpolated. The rule then takes the slices inside the box on the normal's side. The cut is exact, so the surface and the panel it leaves meet with no gap and no ragged edge.
- [ ] A unit test: slicing a quad across a plane keeps its total area and UV range, and puts no vertex on the wrong side.

### 2. F6F and F4U

- [ ] Per surface, a `split` rule with `select: "triangles"`, a box, a `cut` and a `pivot` whose axis follows the orientation rule.
- [ ] The hinge lines are an **ESTIMATE**, since neither model draws one. Spanwise extents come from the real airframes as far as a source gives them; each hinge sits at a stated fraction of the local chord, measured from the yawed vertex cloud.
- [ ] Flaps are plain flaps hinged on the panel. The F6F's and F4F's real split flaps are only the lower skin, which a shell model cannot separate.
- [ ] Rebuild, and enroll both in `AIRFRAME_RIGS` and in `aircraftRigs.test.ts`'s pinned list. Its leading-edge and direction checks are the gate: see one fail first.

### 3. F4F

- [ ] `wildcat.glb` stays frozen. `wildcat.ts` turns the five surface nodes about hinges measured from their own vertices in the node frame.
- [ ] Split flaps are modeled in code: thin plates under the inboard trailing edge, `Alerones_MAT`, hinged at their leading edge. Both share one mesh, posed on the CPU, which is one draw.
- [ ] Budget: the flap mesh adds one draw call to a model already at 47. At load, `wildcat.ts` merges the three static `Pasadores` pins (`Tensor_MAT`, 64 triangles each) into one mesh, a net -1. That keeps it at or under 47.
- [ ] Coverage: `hangar.spec` check 13 skips the Wildcat. Extend it, or a sibling check, to the Wildcat's surfaces.

### 4. Close

- [ ] Run the full suite on ryzen (`remote-run npm test`), plus the touched E2E on nexus. Captures with `surfacesCapture.spec.ts`.
- [ ] Handoff `docs/handoff/2026-10-08-c1-surfaces-batch2.md`: measured draws, what was cut and how, deviations.
- [ ] Update the C1 status in `MASTER_PLAN.md`. Push the branch and email the handoff. **No merge**: Mark looks first.
