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

## Second pass: the canopies (2026-10-11, after Mark's review)

Mark: the glass was not a bubble (a triangular join with the hull) and sat too far aft on all three. Measured the downloads'
glass nodes: Hellcat x -1.49 to 0.0 (crown 1.27 m), Corsair x -2.9 to -1.0 (crown 1.07 m, raked windscreen), Wildcat x -2.12 to -1.31 (crown 0.61 m).
Rebuilt each canopy from those numbers (see the first trap in `docs/blender-aircraft.md`) and lowered the Corsair's nose deck from 0.9 to 0.66 m
to match. `tests/tools/models`, `tests/render/hangar` and `airframes` pass (64 files, 1,483 tests); Hangar Tier 2 passes, but checks 7b, 10
and 16 timed out once under another session's load and passed alone (16 at 45 s of its 60 s limit, so it is close). Captures are redone.

## Third pass: the real airplane (2026-10-11, Mark: "pay attention to how far forward the real canopies are")

Mark was right, and the downloads were the error: found the 3-view line drawings on Wikimedia Commons and rebuilt the fuselage top and
bottom lines, half-widths, canopy, fin and tailplane from them (`docs/blender-aircraft.md`, "Measure the real airplane"). Real canopy
fronts are 3.3 m (Hellcat), 3.95 m (Corsair) and 2.7 m (Wildcat) aft of the spinner tip; the Wildcat's crown is 1.25 m above the thrust
line, not 0.6 (it is now a barrel-chested airplane with a high hood). An overlay of each model's centerline silhouette on its drawing
agrees to a few cm along the top, canopy and belly.

**Decision for Mark: the specs' eye points.** They were fitted to the downloads and sit behind and below the real cockpits. Proposed
real eye points, now asserted by `blenderDuplicates.test.ts`: Hellcat (-0.87, 1.17) against the spec's (-0.75, 0.95); Corsair (-1.63, 1.02)
against (-1.85, 0.78); Wildcat (-0.82, 0.95) against (-1.713, 0.315). Promotion moves the spec to them; the Wildcat's is a 0.9 m forward and 0.6 m
up change of the cockpit view.

## Fourth pass: Hellcat canopy photograph (2026-10-11)

Mark supplied a side photograph showing that the Hellcat canopy is not a rounded bubble: its windscreen climbs steeply to a high
forward bow, then a long, nearly straight roof descends aft into the turtledeck. The Hellcat generator now uses seven explicit side
stations for that wedge and leaves them unsubdivided so Catmull-Rom refinement cannot round the authored corners away. The frame
stations moved with the new silhouette. The close side capture is now part of the gated capture tool because the normal whole-airframe
view makes the roughly 0.5 m-high glass too small to judge.

Review captures are in [`2026-10-11-hellcat-canopy-shots/`](2026-10-11-hellcat-canopy-shots/). The focused model suite passes all
525 tests, including byte-identical headless rebuild of the committed Hellcat GLB, dimensions, rigs and duplicate-model checks; the
gated Playwright capture passes 1/1.

## Review (2026-10-11)

Mark reviewed contact sheets of each duplicate beside its download (flat Blender previews, same camera) and judged them "great".
Still his to decide: the eye points above, and whether to push and to promote a duplicate. To send him snapshots again: one JPEG
contact sheet per aircraft as plain attachments, under 0.5 MB in total. An HTML email with 18 inline `cid:` images (0.8 MB) was
accepted by Cloudflare (msmtp exit 0) and never arrived, and was not in spam, while a one-line API email arrived; the attachment
route arrived (2026-10-11). Cloudflare's usage counter read 0 sent all day, so it cannot confirm a send either.

## Open

- **The likeness is still a measured first pass outside the Hellcat canopy**: silhouettes came from the Commons 3-view drawings, and
  the Hellcat canopy now also follows Mark's side photograph. No cross sections were read. The wing planform, nose cowl detail and the
  tail fillets were not refit to the drawings. Mark's eye is the review.
- **The folds are one-hinge estimates**: the Hellcat swings its legs aft with the wheel upright, the Corsair and Wildcat fold flat
  inboard. The real struts turn the wheel 90 degrees as they swing.
- **Promotion is untested.** `docs/blender-aircraft.md`, "Promoting a duplicate", is derived from the files the tests read; the
  first real promotion should correct it. The Wildcat's is the awkward one (`wildcat.ts` and its frame constants).
- **Not served on windomlane.** Ports 5173 to 5175 are taken by other sessions' servers. To see the duplicates in Mark's Hangar,
  merge the branch, or point a free slot at this worktree (`AGENTS.md`, "Division of labor").
- **No cost record.** Mark's request was for the process; an earlier reading ("prices") was answered "process" (2026-10-11).
