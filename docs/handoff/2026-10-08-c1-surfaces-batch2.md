# Handoff: C1 batch 2, control surfaces on the F6F, F4U and F4F (2026-10-08)

Plan: [`docs/superpowers/plans/2026-10-08-c1-surfaces-batch2.md`](../superpowers/plans/2026-10-08-c1-surfaces-batch2.md).
Branch `c1-surfaces-batch2`, worktree `../ww2airsim-c1-batch2`. Run unattended. **Not merged:** Mark looks first.

## What works

All three US fighters move their ailerons, elevators, rudder and flaps on the bench and in flight, under batch 1's rulings:
- visual only, with the 0.3 s slew;
- full travel: aileron ±20°, elevator and rudder ±25°, flap 0-45°;
- flaps from `flapFraction`.

## Checkpoint (Mark, when back)

- **Live:** `https://ww2airsim-2.windomlane.org/hangar.html?bench`, served from this worktree. Pick the F6F, F4U or F4F. The "Control surfaces" row has roll, pitch and yaw; the flaps row drives the flaps.
- **Captures:** [`2026-10-08-c1-surfaces-batch2-shots/`](2026-10-08-c1-surfaces-batch2-shots/), three per airframe: roll right from the front, pitch up with yaw right in three-quarter, and flaps down from the side.
- **Please look at the F4F's ailerons.** The model's own `Aleron_Der`/`Aleron_Izq` sit **inboard**, from the fuselage to mid-span, where a real F4F's flaps are. Its outer wing has no surface at all. They are driven as ailerons, as the model names them. The split flaps drawn in code hang under the same span.

## How

### F6F and F4U: surfaces cut out of the download

- **The problem:** neither model separates a surface, and their wing and tail skins are long triangles running leading edge to trailing edge, with no edge at any hinge. A `split` box, which takes whole triangles, cannot isolate a surface (wireframes, 2026-10-08).
- **The `cut` (`tools/models/stages/split.ts`):** a `split` rule can carry a `cut`, a plane through its `pivot.point`. Triangles the box touches are sliced by the box's faces and by that plane, with every float attribute interpolated and crossing edges shared. Only the slices behind the plane are taken. So a surface and the panel it leaves meet exactly, with nothing ragged. A unit test slices a box whose faces are single quads: it keeps the area to 1e-9 and puts no vertex on the wrong side.
- **Vector hinge axis:** `pivot.axis` now takes a unit vector as well as `±x/y/z` (`manifest.ts`).
- **Hinges (ESTIMATE):** neither model draws one. Each was placed from true sections of the skin (triangles cut at a station, not vertices), at a fraction of the local chord from the trailing edge:
  - 0.25 for ailerons and flaps;
  - 0.40 for elevators;
  - 0.35 for rudders.

  The spanwise ends are rounded estimates of the real layout. The port side mirrors the starboard about the model's centerline.
- **F4U's gull wing:** a single straight hinge cannot follow its kink, so the flaps are two panels per side, `Flap1` from z 0.45 to 1.15 (inner) and `Flap2` from 1.3 to 2.35 (outer).
- **F6F flap root:** the flaps start at z 1.9, not 1.75. At 1.75 they took 15-16 fuselage-fillet triangles, and the extra primitive put the model at 48 draws.
- **Flap type:** all flaps here are plain flaps hinged in the skin. A real split flap is only the lower skin, which a shell model cannot separate.
- **Open slit:** the cut faces are not capped. At full deflection a thin slit into the hollow wing may show at the hinge. It isn't visible in the captures; Mark's eye decides.

### F4F: the model's own surface nodes, and split flaps drawn in code

- **Turning in place:** `wildcat.glb` stays frozen (its bytes are pinned in `dist.test.ts`). `wildcat.ts` turns `Aleron_*`, `Timon_Der`/`Timon_Izq` (elevators) and `Timon_Prof` (rudder) about each piece's own leading edge, measured from its vertices at load. They use the same orientation rule and the same `surfaceAngleRad` and slew as the rigs.
- **Split flaps (ESTIMATE):** one plate under each aileron, from its leading edge to its trailing edge, hinged at the front. Both plates are one mesh posed on the CPU, which costs one draw call. It is hidden while the flaps are up, where it would lie flush. The color is a plain light gray, since the model's texture has no region for it.
- **Budget:** the model was at exactly 47 of 47 draws. At load the three static hinge pins under `Pasadores` (`Tensor_MAT`, 64 triangles each) are merged into one mesh, two draws back. So with the flaps down it draws at most 47. A unit test holds that.

## Measured

| Model | Draws before | Draws after | Budget | Triangles before | Triangles after |
| --- | --- | --- | --- | --- | --- |
| F6F | 39 | 46 | 47 | 26,399 | 28,303 |
| F4U | 22 | 34 | 47 | 15,296 | 18,434 |
| F4F | 47 | at most 47 (45 with the flaps up) | 47 | 100,886 | 100,890 |

- **F6F:** each surface is one primitive (+7).
- **F4U:** its elevators and rudder each span two materials (+12).
- **F4F:** the flaps add 1 draw and the pin merge removes 2.
- **Slicing:** it adds triangles only where a box cuts the skin.

## Tests

- `aircraftRigs.test.ts`: the F6F and F4U are enrolled in the pinned list. Every surface passes the leading-edge and direction checks.
  - Seen red: flipping the F6F `AileronR` axis in its entry fails "trailing edge along y". The restored entry rebuilds to the same 1,604,632 bytes.
- `wildcat.test.ts`, the F4F on its real node graph (`_wildcatCache.ts`):
  - all five surfaces, hinge and direction, in the sim frame;
  - the flaps: hidden when up, trailing edges below the hinge when down;
  - the draw count at or under 47 with the flaps down.

  The leading-edge tolerance is 3% of the chord: the ailerons' leading edges bow 2.35% forward of their end-to-end hinge (measured 2026-10-08). Seen red: inverting the orientation rule fails all six.
- `geometryStages.test.ts`: the cut. `manifest.test.ts`: a vector axis is accepted; a non-unit axis, a cut without a pivot and a cut on `components` are rejected.
- `hangar.spec.ts` check 9: the F4F's gizmo list now includes its five surfaces. 19/19 passed on nexus's 680M.

## Results

Typecheck, lint and depcruise are clean. The full suite on ryzen (`remote-run npm test`) passed: 361 files, 4,610 tests, 10 named skips. The Hangar E2E passed 19/19 on nexus.

## Not done, and why

- **The F4F's real outboard ailerons.** The frozen model draws none, and cutting them would mean unfreezing it. A decision for Mark.
- **Caps on the cut faces.** They are open, as noted above. Add caps if the slit shows.
- **Batches 3 (A6M2, Ki-43) and 4 (D3A, B-17).** They go by the same `split` + `cut` route.
