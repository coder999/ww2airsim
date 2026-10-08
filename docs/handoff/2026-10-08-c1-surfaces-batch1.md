# Handoff: C1 batch 1, control surfaces on the five Blender models (2026-10-08)

Plan: [`docs/superpowers/plans/2026-10-08-c1-surfaces-batch1.md`](../superpowers/plans/2026-10-08-c1-surfaces-batch1.md).
Branch `c1-surfaces-batch1`, worktree `../ww2airsim-c1-surfaces`. Run unattended.

## What works

The B-29, G4M, Ki-21, P-38 and Ki-84 move their ailerons, elevators, rudders and flaps:

- **In flight:** the player's from the stick, an AI's from its own pilot's controls.
- **On the Hangar bench:** from new roll, pitch and yaw sliders. The flaps row was greyed out on these five before; it now drives them.
- **Slew:** the stick surfaces sweep stop to stop in 0.3 s, a cosmetic slew (`SURFACE_SWEEP_S`).
- **Flaps:** they follow the sim's `flapFraction` directly.
- **Travel:** full travel at any speed, ±20° aileron, ±25° elevator and rudder, 0-45° flap (Rulings R1-R4).

## Checkpoint (Mark, when back)

- **Live:** the bench on `https://ww2airsim-2.windomlane.org/hangar.html?bench`, served from this worktree. Pick any of the five; the "Control surfaces" row has the three sliders. It returned 200 at 2026-10-08 ~16:10, but it is down whenever its dev server is not running.
- **Captures:** in [`2026-10-08-c1-surfaces-batch1-shots/`](2026-10-08-c1-surfaces-batch1-shots/), three per airframe:
  - roll right, from the front;
  - pitch up with yaw right, three-quarter view;
  - flaps down, from the side.

  Regenerate with `E2E_CAPTURE=1 PW_BASE_URL=http://localhost:<port> sg render -c 'npx playwright test tests/e2e/surfacesCapture.spec.ts'`.
- **The guess for your eye:** `SURFACE_SWEEP_S`, 0.3 s. Tell me if the surfaces feel sluggish or twitchy in flight.

## How

- **Hinges come from the script.** `kit.py` already cut each control into its own piece; it now names the piece's node and writes its hinge line to `<raw>.hinges.json`. The build pivots every `keep` node named there that has no `pivot` of its own (`build.ts` `parseHinges`). The plan had a glTF extra; a sidecar never meets collapse or join, and the kit already writes one.
- **One orientation.** The kit orients every hinge so a positive turn raises the trailing edge, or swings a rudder's to starboard. So `surfaceDrive` reads what a node follows, and its sign, from the name alone, and the rig data is a list of names.
- **Two-tone surfaces.** A kit node carries one paint role. Where a surface's underside is a second role (the G4M, Ki-21 and Ki-84), the underside is a child node (`AileronR_lower`), which the build's collapse folds into the part.

## Measured

Draw calls, from `npm run models:build`, are all far inside the 47 budget. Triangles are unchanged.

| Model | Before | After | Planned |
| --- | --- | --- | --- |
| B-29 | 13 | 22 | 22 |
| G4M | 6 | 23 | 15 |
| Ki-21 | 6 | 23 | 15 |
| P-38 | 6 | 16 | 16 |
| Ki-84 | 5 | 18 | 12 |

The plan missed the two-tone undersides: each costs one more primitive per horizontal surface.

Hinge placement: the worst vertex ahead of its hinge is 1.8 mm (G4M `Flap1`, from dihedral tilting the front face), against the 12 mm control gap. That is the tolerance in `aircraftRigs.test.ts`.

## Tests

- `aircraftRigs.test.ts`, per surface, against the committed glb:
  - the hinge is on the leading edge;
  - a +1 input moves the trailing edge the way `surfaceDrive` says;
  - the batch-1 list is pinned.

  Seen red: flipping `AileronR`'s sign fails all five `AileronR` rows.
- `kitDetail.test.ts`: the probe's controls are their own nodes, hinge-sidecar position and orientation, and the underside as a child.
- `pivotedAirframe.test.ts`:
  - the slew (a 0.3 s sweep at any frame step, no overshoot);
  - angles and clamps;
  - posing from stick and flapFraction.
- `models.test.ts`: the sliders reach the airframe's controls.
- `hangar.spec.ts` check 13: the gizmos include the surfaces exactly when the bench row is modeled. 18/18 passed on nexus's 680M.
- `blenderEntries.test.ts` rebuilds the five byte-identically.

## Not done, and why

- **Batches 2-4 (the downloads).** They need surfaces split per model, and the manifest's `pivot.axis` takes only named axes. Swept hinges need a vector axis first (`docs/aircraft.md` Part E).
- **The Wildcat's split flaps.** That is batch 2.
- **The local `vite.config.ts` edit in the worktree** (slot 2: `TUNNEL_HOST`, port 5175) is scratch and not committed.
