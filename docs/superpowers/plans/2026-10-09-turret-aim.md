# Turret aim: bomber turrets turn and their guns elevate (2026-10-09)

**Checkpoint:** the final product only. **Run:** unattended, in the `turrets-aim` worktree. Mark looks
at it on ww2airsim-2 before any merge.

Mark's answers (2026-10-09):
- Turrets turn and their guns elevate.
- Driven by Hangar bench sliders, and in flight by tracking a target. Tracking is visual only: no
  firing, which stays with E3.
- Every airframe with turrets: the B-17, B-29, G4M and Ki-21.

## Model

Each `Turret<N>` gets a gun part, `Turret<N>Guns`, holding its barrels:
- It is pivoted on a horizontal elevation axis through the trunnion, oriented so that a positive
  turn raises the muzzle.
- The build keeps it as its own root node, like every other kept part.
- At load, the runtime hangs it under its turret (`attach`), so it traverses with the turret and
  elevates on its own axis.
- `PART_NAME` gains `Turret\d+Guns`.

| Model | Where the guns come from |
| --- | --- |
| B-29, G4M, Ki-21 (Blender) | `kit.gun_turret` draws the barrels into `Turret<N>Guns` and writes its hinge to the `hinges.json` sidecar. |
| B-17 (download) | A `components` split per turret takes the download's own gun parts. They are separate components in the `guns` material, measured 2026-10-09. |

The draw count is expected to rise by one per turret on the Blender models (+5 on the B-29, +1 each
on the G4M and Ki-21). On the B-17 it should stay flat, since its guns are already their own primitive.

## Limits

Elevation is measured in degrees above the horizontal, in the airframe frame. Traverse is measured
from the rest heading. These are ESTIMATEs unless a source is named.

| Model | Turret | Traverse | Elevation |
| --- | --- | --- | --- |
| B-17 | Turret1 chin | ±86° | −46° to +26° |
| B-17 | Turret2 top | full circle | 0° to +85° |
| B-17 | Turret3 ball | full circle | −90° to 0° |
| B-29 | Turret1, Turret3 (upper) | full circle | 0° to +90° |
| B-29 | Turret2, Turret4 (lower) | full circle | −90° to 0° |
| B-29 | Turret5 tail (a cone) | ±30° | −30° to +30° |
| G4M | Turret1 dorsal | full circle | 0° to +80° |
| Ki-21 | Turret1 dorsal | full circle | 0° to +80° |

Any limit the skin check below refuses is raised to the measured clearance and noted in the handoff.

## Aim rule (one path for the bench and the sim)

`AirframeUpdate` gains `aim`: a direction in the airframe frame, or `null`.
- Each turret computes the traverse and elevation that point its guns along `aim`, clamps both to its
  limits, and slews there at a cosmetic 60°/s (ESTIMATE).
- With `aim` null, every turret slews back to its rest pose.
- **In flight** (`airframeUpdateFor`): the nearest hostile aircraft within 1,500 m (about 1,640 yd),
  by `sideOf`, excluding wrecks.
- **Hangar bench:** two sliders, *Turret bearing* and *Turret elevation*. Together they give one aim
  direction that every turret follows, and setting both to 0 returns the turrets to rest. The bench
  snaps instead of slewing.

## Tests (enrolled, `aircraftRigs.test.ts`)

- Every rig turret has a `Turret<N>Guns` node in the GLB, with a horizontal unit pivot axis. A
  positive turn raises the muzzle.
- The rig names match the GLB, as they already must.
- At the corners of each turret's limits, sampled every 15° of traverse, the exposed barrel (40 to
  100% of trunnion to muzzle) crosses no airframe triangle.
- The aim math is a pure function with a unit test: for a target dead ahead, abeam or above, the
  angles come out as expected, and clamps hold.
