# F4R maritime mesh rework: handoff

**Date:** 2026-10-14  
**Branch:** `f4r-maritime` (based on `f4-night-site-assets`; not merged, not on `main`)  
**Attendance:** unattended; Hangar review images below are the checkpoint for Mark.

Mark's review of the F4 maritime and site assets said four meshes were unreadable. All four were rebuilt
from scratch in the Blender generators. `pby-mooring-buoy` was not touched (its GLB is byte-identical).

## What changed

| Asset | Triangles before | Triangles after | Draw calls before | after | GLB bytes after |
| --- | ---: | ---: | ---: | ---: | ---: |
| `lcvp` | 136 | 3,432 | 3 | 4 | 239,000 |
| `usaaf-63ft-rescue-boat` | 648 | 4,684 | 6 | 7 | 311,420 |
| `type-a3-life-raft-survivors` | 1,048 | 6,432 | 3 | 5 | 374,044 |
| `suluan-damaged-lighthouse` | 316 | 3,560 | 5 | 6 | 305,988 |

Willys MB jeep is 9,432 triangles for reference. No budget in `tools/models/entries/<id>.json` was raised:
every asset sits inside its existing 20,000 / 12,000 triangle and 8 draw-call caps.

- **LCVP.** Higgins hull as a hollow lofted shell (flat bottom, bilge panels, sheer, bow taper), raked bow ramp
  with cleats and side flanges, ramp-cheek `Nose`, planked cargo and personnel well with battens and tie-downs,
  stern coxswain platform with a four-plate armor shield and vision slit, steering console, engine box with
  louvers and exhaust, two gun tubs each with a .30 cal on a pintle, rubbing strakes, cleats, lifting eyes, hull
  ribs, ammo cans, boat hook, screw, skeg and rudder.
- **63-ft rescue boat.** Hard-chine hull with sheer, flared topsides, raked stem and counter stern; cambered deck
  plating; aft cabin and a raised pilot house with a raked four-pane windshield, side windows, portholes, doors;
  mast with yard, searchlight, ventilators, skylight, two raft canisters, exhaust stacks, bow and stern rails,
  guards and hanging fenders, two twin .50 mounts, windlass, cleats, davit, stern ladder, flag staff. Two
  three-blade screws and rudders sit under the counter.
- **Type A-3 raft.** Rounded-rectangle buoyancy tube (yellow) with an equator seam and six chamber seams,
  olive floor, rope lifeline with ten grab loops, six boarding handles, CO2 cylinder and hose, paddle, dye
  marker; open (no canopy). Five seated survivors (torso, legs, arms, head with face marks, helmet or cap, yellow
  life vest), one waving.
- **Suluan lighthouse.** 20-sided tapered masonry shaft (hollow, 0.45 m wall) on a two-step plinth, three
  string courses, porch with door, three windows, ladder, corbelled gallery with railing, lantern with
  mullions, glazing and lamp, domed roof of 12-degree gores. Damage: upper section sheared away over about
  140 degrees with a jagged edge, shell holes, panes shot out, half the dome gone, fallen gores and gallery
  section, bent rails, rubble (kept inside the 4.70 m footprint).

## Hard contracts: held

Asset ids, output paths and kept node names are unchanged. `lcvp` keeps `Hull`, `Ramp`, `Nose`; the boat keeps
`Hull`, `Nose`, `Prop1`, `Prop2`, `Rudder1`, `Rudder2`; the raft keeps `Raft`, `Survivors`, `SurvivorHeads`
(plus the new `SurvivorVests`); the lighthouse keeps `Tower`, `Gallery`, `Lantern`, `DamagedCrown`,
`DamageDebris`. Overall envelopes (from the GLBs): LCVP 11.08 x 3.28 x 2.10 m; boat 19.20 x 4.64 x 3.60 m;
raft 2.63 x 1.69 m; lighthouse 4.67 x 4.69 x 11.62 m. +x forward, y=0 is the bottom (waterline contact), and
licence is AGPL-3.0-or-later with no third-party mesh.

**One deliberate fix beyond the brief.** The F4 entries had no `normalize`, so their kept nodes had no pivot and
`VEHICLE_RIGS` rotated them about the model origin (ramp and propellers would swing round the hull center).
The LCVP and boat entries now carry a no-op `normalize` (`origin` 0, fit equal to the cited length, scale 1.0)
and `pivot`s: ramp at its foot hinge (5.48, 0.30, 0) about +z; propellers at their hubs about +x; rudders at
their stocks about +y. The rig code is unchanged. Verified in the Hangar: the ramp lowers about its hinge and the rudders turn
in place (`lcvp-ramp-down.jpg`, `usaaf-63ft-rescue-boat-stern-rudders.jpg`). The other F4 ground vehicles still
have the old no-pivot arrangement; that is outside this branch.

## Cited facts and estimates

- LCVP: 36 ft 4 in x 10 ft 9 in (NHHC) is cited; everything else is an ESTIMATE (no plan was read), and the
  entry, Library card and generator header say so.
- Rescue boat: 63 ft class (congressional record) and, new, 15 ft 4 in beam over guards, 23.75 in three-blade
  screws and two twin .50 mounts from uscrashboats.org (63-foot boat page, read 2026-10-14; added to the Library
  card). **The page's 8 ft 9 in depth is not matched**: with the F3-approved 3.60 m overall height it would leave
  no room for a house, so deck height, house and mast are ESTIMATES (stated in the entry).
- Raft: Type A-3 five-person identity (Wright Field 40420-A, 1947 Federal Register) is cited. Shape, seams,
  fittings and poses are ESTIMATES. The paddle and dye marker are *not* verified against the equipment listing;
  I did not read it, so they are labeled ESTIMATE.
- Lighthouse: a search on 2026-10-14 found no drawing or photograph of the real Suluan tower (only the 17 Oct 1944
  6th Ranger landing and the Coast Pilot entry). Every dimension and the whole damage pattern are ESTIMATES;
  the card now says it is not a reconstruction.

## Files

Generators: `tools/models/blender/f4-maritime-assets.py`, `f4-night-site-assets.py`; new helper module
`tools/models/blender/f4geom.py` (outward-wound solids, lofts, closed sweeps, oriented boxes; `kit.py` is not
otherwise changed). `kit.py` gains two palette roles (`raftYellow`, `vestYellow`) and
`tools/models/skin/surfaces.ts` their flat surfaces; neither affects any existing model. Entries, Library cards,
the four GLBs, the capture tool `tests/e2e/f4rMaritimeCapture.spec.ts` (registered in `captureTools.ts`).

## Review images

`docs/handoff/2026-10-14-f4r-maritime-shots/*.jpg`: real Hangar captures on nexus's WebGPU (680M), a vite
server on this worktree at :5190 (stopped afterward). Per asset: `-low`, `-eye`, `-over`; plus
`lcvp-ramp-down` and `usaaf-63ft-rescue-boat-stern-rudders`. Reproduce with
`PW_BASE_URL=http://localhost:<port> E2E_CAPTURE_DIR=<dir> npm run capture:e2e -- f4rMaritimeCapture.spec.ts`.
These are nexus numbers for correctness only, not a budget measurement.

## Verification

Run on ryzen through `remote-run` (REMOTE_RUN_OVERFLOW=0), 2026-10-14:

- `tsc --noEmit -p .`: clean. `eslint` on the changed TypeScript files: clean.
- `vitest run tests/tools/models tests/render/vehicleRig.test.ts tests/render/staticModels.test.ts tests/render/hangar`: 70 files, 1,998 tests pass. This includes `blenderEntries` (every Blender entry rebuilt byte-identically to its committed GLB, so the four rebuilt assets are reproducible), `vehicleModels`, provenance, budgets and the rigs.
- An earlier run of 19 files (750 tests) on the same code also passed. The full `npm run verify` gate was not run.

Tests updated: none needed beyond the capture manifest (existing vehicle rows, rig, provenance and budget tests
hold the new models as is). Tests still valid: `vehicleModels` (cited length, width, height, forward proof),
`vehicleRig`, `staticModels`, Hangar roster and provenance, `blenderEntries` (byte-identical rebuild).
Known gaps: no gameplay use of any of these assets; the paddle and dye marker are unverified; the lighthouse's
true appearance is unknown; the other F4 vehicles' pivots (see above).
