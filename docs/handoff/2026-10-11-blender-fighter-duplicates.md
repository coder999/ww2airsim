# Handoff: Blender duplicates of the Hellcat, Corsair and Wildcat (2026-10-11)

Worktree `ww2airsim-blender-fighters`, branch `blender-fighters` (Mark chose a worktree and a final-product-only viewing
checkpoint, 2026-10-11; the run was unattended). Nothing is pushed or merged. The process is written down in
[`docs/blender-aircraft.md`](../blender-aircraft.md); this page records what was measured and what is open.

## What ships

Three original Blender models (AGPL-3.0-or-later), each beside the download it copies, which is unchanged and still what flies:

| Hangar card | Script | Copies |
| --- | --- | --- |
| Grumman F6F-5 Hellcat (Blender model) | `tools/models/blender/f6f-hellcat-blender.py` | `f6f-hellcat` |
| Vought F4U-1D Corsair (Blender model) | `tools/models/blender/f4u-corsair-blender.py` | `f4u-corsair` |
| Grumman F4F-4 Wildcat (Blender model) | `tools/models/blender/f4f-wildcat-blender.py` | `f4f-wildcat` |

Each has what the download has, except that no model draws a rack or launcher (O1), so there is nothing to carry there:

- **Landing gear that moves** (`GearL`, `GearR`, and `Tailwheel` on the Hellcat and Corsair; the Wildcat's tail wheel is fixed),
  rigged in `src/render/scene/airframeRigs.ts`. Hangar check 2 (the gear visibly moves) and check 7 pass for all three.
- **A working propeller**, three blades, exactly 3-fold symmetric (`aircraftRigs.test.ts`).
- **Control surfaces**: ailerons, flaps (two pairs on the Corsair), elevators, rudder.
- **Store attachment points.** The spec's racks and rails hang on the drawn wing; `blenderDuplicates.test.ts` proves each
  duplicate's wing takes the original spec's stations inside the chord and clear of the skin. The offsets in the spec are the
  download's and will be re-measured on promotion (`npm run models:mounts`). The Hangar's display path hangs no stores for a card
  with its own model, so the stores are not visible on a duplicate until it flies.
- **The same stance as the download**: wheel height, wheel x, tail contact, eye point and gun positions, all asserted.

Also new: `preview.py` takes `--view side|top`; a `blueGray` paint role (the Wildcat's upper surfaces); a gated capture tool,
`tests/e2e/blenderDuplicatesCapture.spec.ts`.

## Measured

- **Full `remote-run npm run verify`** (ryzen, 2026-10-11): typecheck, eslint (`--max-warnings 0`) and depcruise clean; 413 of 414
  test files and 5,819 tests passed, 11 skipped, 1 failed: `tests/render/aiLethality.test.ts` timed out at 30 s under the shared
  load, and passed alone in 26 s (10 of 10). It touches no file this change did. Reported, not tracked.
- Hangar Tier 2 (`tests/e2e/hangar.spec.ts`, nexus WebGPU, localhost): **23 passed**, 7.1 minutes, with the three new ids in checks 10 and 16.
- Glbs: Hellcat 820,488 B / 25,932 tris / 12 draws; Corsair 823,032 / 25,400 / 14; Wildcat 806,508 / 25,468 / 17 (budget 3 MB / 60k / 47).
- Captures, the download and the duplicate side by side, gear down and up:
  `docs/handoff/2026-10-11-blender-fighter-duplicates-shots/` (21 PNGs).

## Open

- **The likeness is a first pass.** The profiles were matched by eye to the downloads' silhouettes; no three-view drawing was read.
  The Wildcat in particular is more slender than the real barrel-chested fuselage, and the Corsair's canopy is low because the
  spec's eye point (0.78 m up) caps the crown at 1.23 m. Mark's eye is the review.
- **The folds are one-hinge estimates**: the Hellcat swings its legs aft with the wheel upright, the Corsair and Wildcat fold flat
  inboard. The real struts turn the wheel 90 degrees as they swing.
- **Promotion is untested.** `docs/blender-aircraft.md`, "Promoting a duplicate", is derived from the files the tests read; the
  first real promotion should correct it. The Wildcat's is the awkward one (`wildcat.ts` and its frame constants).
- **Not served on windomlane.** Ports 5173 to 5175 are taken by other sessions' servers. To see the duplicates in Mark's Hangar,
  merge the branch, or point a free slot at this worktree (`AGENTS.md`, "Division of labor").
- **No cost record.** Mark's request was for the process; an earlier reading ("prices") was answered "process" (2026-10-11).
