# Adding a third-party model

The one runbook for bringing a licensed model into the game, from search to
a passing Hangar check (Hangar spec §11). It points at the files that own
each rule rather than restating them. Every command and path below was
checked against the repo on 2026-09-26.

## 1. Find

Search Sketchfab with the **Downloadable** filter and a **CC BY** or **CC0**
license. Before you pick one, look through the author's other uploads: an
account that posts many unrelated "free" models ripped from games is a sign
of license laundering, and a license is only as good as the uploader's right
to grant it.

Record what you checked and turned down, so the next search does not find it
again. The ship-models design keeps that list in its §2.3,
["Checked and rejected"](superpowers/specs/2026-09-25-ship-models-design.md).
Follow that pattern in your own design doc.

## 2. Fetch

```sh
tools/models/sketchfab-fetch.sh <uid> <name>
```

This writes `content/models/candidates/<name>.glb` plus a
`<name>.sketchfab.json` sidecar (uid, author, license, fetch time) into a
gitignored folder. It is headless and needs no manual download. The token
comes from 1Password and is never printed; the script's header says how.

Once a download is vetted and has an entry, its one home is **nexus's
`tools/models/cache/`**. That folder is gitignored, because the repo is public
and these are other people's files (Mark, 2026-10-08). Copy the download
there, and record its SHA-256 as the entry's `inputSha256`.
`npm run models:raws` checks every entry's raw against its hash, and
`-- --restore` refills the store from `candidates/`, `dist/`, or ryzen's
remote-run mirror, keeping only a copy whose hash matches.
`tests/tools/models/sketchfabEntries.test.ts` rebuilds every committed
download-built model from its raw, byte for byte. A worktree links its
`tools/models/cache` to main's (`ln -s <main>/tools/models/cache
tools/models/cache`) and never holds a copy of its own. On 2026-10-08 the F6F's
only working copy went with a removed worktree, and 11 of the 16 raws were
missing from nexus.

## 3. Vet

A download is not a license check. Before anything is committed, read the
license from `api.sketchfab.com/v3/models/<uid>` and add a row to
[`ASSETS.md`](../ASSETS.md)'s "3D models" table: path, source URL, author and
license. CC BY needs the author's credit in the game. The legend's "Models:"
line is generated from the model entries, so adding the entry (step 5) is
what credits the author.

## 4. Inspect

```sh
npm run models:inspect -- <path-to-glb>
```

This prints the node tree with per-node triangle counts and bounds, the
materials, textures and animations, all in the file's source frame, which is
the frame an entry is written in. Use it to find the names of the parts that
articulate (propeller, gear legs, flaps, turrets) and the axis the model
faces.

## 5. Entry

Write `tools/models/entries/<id>.json`. The fields are defined, with the
cross-field rules, in [`tools/models/manifest.ts`](../tools/models/manifest.ts).
The reasoning behind them is in the
[A6M Zero design §6](superpowers/specs/2026-09-25-a6m-zero-design.md), and
ships add the `ship` block from the
[ship-models design](superpowers/specs/2026-09-25-ship-models-design.md).
Name articulated parts as `keep` or `split` nodes. Turrets follow the Hangar
spec's §9 convention, `Turret1`…`TurretN`, numbered bow to stern. **A ship's
guns are different (Track M, M1, 2026-10-08):** their positions live in the
ShipSpec's `armament` (`content/ships/<id>.json`), and the build writes an
empty locator per entry, `Turret1..N`, `HeavyAA1..N`, `LightAA1..N`, with
`extras.kit`. A download carves (a Blender script builds, via
`tools/models/blender/naval.py`) a node named after a locator; the first of each
kit becomes `Kit_<kit>`, posed at its mount, and the rest are dropped; a kit
the model has no geometry for is generated (`stages/mountKits.ts`). The
renderer instances each kit at its locators (`src/render/scene/ship.ts`), one
draw per kit part. Every mount must stand on a surface within 0.75 m, and
`tests/tools/shipModels.test.ts` holds the committed model to the spec.
**M1b (2026-10-09):**
- Each kit is two parts: `Kit_<kit>` trains, and its child `Kit_<kit>_Guns`
  (extras `trunnion`, `maxElevationRad` from `MAX_ELEVATION_DEG` in
  `stages/shipMounts.ts`) also elevates. Guns rest level, along +x.
- A carved kit's guns are its long thin shells pointing forward. A carved kit
  whose guns are welded to its mount is replaced by its generated kit.
- Every light AA kit (40 mm and below) is generated, on the Blender ships too,
  and drawn **1.3x true size on purpose** (`LIGHT_AA_SCALE`, Ruling B3) so it
  reads from the air. Generated guns are `ship:gunmetal`.
- A `lightAA` entry with a `run` is a gallery: one locator per barrel,
  `LightAA<k>_<i>`, spread over the run bow to stern and set on the deck under
  each. The sim keeps it one fire position.
`tools/models/islands.ts` finds a download's gun shells in the ship frame and
turns output-frame boxes into `split` boxes. A building
has no bow, so its turrets are numbered +x to -x, then -z to +z (R4).
Aircraft parts (R3): `Prop`, or `Prop1`…`PropN` from port to starboard;
`GearL`, `GearR`, `GearNose`, `Tailwheel`; `Turret1`…`TurretN` nose to
tail, dorsal before ventral, then port before starboard at one station, each
with its barrels in `Turret<N>Guns` on a horizontal trunnion oriented so a
positive turn raises the muzzle (turret aim, 2026-10-09). A flexible nose,
cheek or tail gun is a turret too: its `Turret<N>` is the socket (Blender:
`kit.flex_gun`) or the gun's rear cap (a download), and both pivots sit where
the gun leaves the skin (flex guns, 2026-10-09). Control surfaces (C1):
`AileronL`/`AileronR`, `ElevatorL`/`ElevatorR`, `Flap1L`…`FlapNR` inboard to
outboard, and `Rudder`, or `Rudder1`…`RudderN` port to starboard. Bay doors
(C2): `BayDoor1L`…`BayDoorNR` nose to tail, each hinged along x at its
outboard edge with its axis oriented so a positive turn opens it (the keel
edge swings down and out); the rig lists them in `doors`. A Blender model
gets them from `kit.fuselage(doors=[(x0, x1, half_width), ...])`: the belly
quads of each bay become the door nodes, with a shallow dark well behind
them, and their hinges go in the same `<raw>.hinges.json` sidecar (already
oriented, so the control-surface flip does not apply). The B-17's are cut
from its belly by a `split` whose `cut` plane runs between the skin and the
interior shell above it, so only skin comes away.
`surfaceDrive` in `src/render/scene/airframeRigs.ts` reads what each one
follows from its name. Every part needs a `pivot`: the
build moves its origin onto the hinge and records the axis the runtime turns
it about. A Blender model's control surface is the exception. `kit.py`
writes its hinge to `<raw>.hinges.json`, oriented so a positive turn raises
the trailing edge (or swings a rudder's to starboard), and the build pivots
every `keep` node named there that has no `pivot` of its own. The entry
lists the node without one, so the hinge has one copy, in the script.
A download's surface is a `split` with a `cut`: a plane through its
`pivot.point` with the given normal, pointing aft. Triangles the box touches
are sliced by the box and that plane, and only the slices behind the plane are
taken. So the surface comes out exactly along its hinge, even where the mesh
has no edge there, as on the F6F's and F4U's full-chord wing skins. A swept
hinge takes a unit-vector `pivot.axis`. Measure the hinge from true sections
of the skin (the C1 batch 2 handoff says how). The cut caps the openings it
makes, on both sides, and joins a piece's primitives that share a material, so a surface carved from a
two-primitive skin (the Zero's) is one draw. A download that already models a surface as its own mesh
(the Ki-43's ailerons, elevators and rudder) takes a `keep` with a vector-axis `pivot` on its leading edge instead. An entry without `normalize` (the Wildcat, whose
`legacyOptimize` keeps its hierarchy as authored) gives its cut a `point`
instead of a pivot. Never simplify a propeller (`perNode` ratio 1):
`tests/tools/models/aircraftRigs.test.ts` checks its N-fold symmetry about
the pivot, and that its vertex centroid lies within 5% of its radius of the
spin axis. The symmetry check is waived where the source prop cannot pass
it: a rig row's `symmetryTolerance` of 0.02 equals the metric's cap, so it
turns the check off, and that is set for the Zero, F4U, Ki-43 and D3A props
(blur discs on the F4U and Ki-43, off-orbit blades on the Zero and D3A;
rulings in the [R3 handoff](handoff/2026-09-27-r3-aircraft-models.md)).
There the centroid check is the guard. A download posed at an angle takes
`normalize.yawDeg` (measure it with `npm run models:rig`), and one with a
material per part takes `dedupMaterials: true`.

The entry's `budget` (`maxBytes`, `maxTriangles`, `maxDrawCalls`) is
enforced twice: by the build, and by the Hangar as the model is drawn
(step 9).

## 6. Build

```sh
npm run models:build -- <id>
```

This writes the entry's `output` (`content/aircraft/<id>.glb` or
`content/ships/<id>.glb`) and fails if it is over budget. An entry marked
`frozen` is skipped on purpose; its `frozen` text says why.

## 7. Register

- **Aircraft:** add a row for the id to `AIRFRAME_RIGS` in
  [`src/render/scene/airframeRigs.ts`](../src/render/scene/airframeRigs.ts),
  which registers it in `AIRFRAME_MODELS` through the one generic module,
  `pivotedAirframe.ts` (R3). Only a model whose parts move by a baked clip,
  as the Wildcat's do, needs its own module. For the Library, set the
  entry's `model` (§8). Set a spec's `view.model` only for an airframe the
  game should fly with it. A rigged model hangs the flying spec's stores
  (`pivotedAirframe.ts`); measure them on that model first with
  `npm run models:mounts`, which `tests/tools/models/wildcatMounts.test.ts`
  enforces for every stores-carrying spec (sortie forms A4, 2026-09-27).
- **Ships:** add the id to `SHIP_MODELS` in
  [`src/render/scene/shipModels.ts`](../src/render/scene/shipModels.ts), and
  set `view.model` in `content/ships/<spec>.json`. The Hangar spec names a
  `content/ships/models.json` for this, but that file was never created; S1
  registered ships in `SHIP_MODELS` instead.
- **Vehicles:** add the id to `STATIC_MODELS.vehicle` in
  [`src/render/scene/staticModels.ts`](../src/render/scene/staticModels.ts)
  and name it in the Library entry's `model`. A vehicle stands on y = 0,
  centered on its footprint, nose to +x;
  `tests/tools/models/vehicleModels.test.ts` measures it against its cited
  length, width and height (R5).
- **Buildings:** add the id to `STATIC_MODELS.building` in
  [`src/render/scene/staticModels.ts`](../src/render/scene/staticModels.ts).
  They have no sim spec and no `view.model`; the Hangar draws one in place
  of one, through a Library entry's `model` (R1, step 8).

Deterministic fails if a spec names a model id that is not registered.

## 8. Library entry

Add `content/library/<id>.json` with a name, blurb, history and dated
sources (Hangar spec §4). Deterministic checks the library against the rosters in
`GAMEPLAY.md`.

An entry may also carry an optional `model: { "kind", "id" }` (R1), where
`kind` must equal the entry's own kind (`aircraft`, `ship`, `building` or
`vehicle`). The Hangar draws it in place of the spec's `view.model`; with no
spec, the entry reads "not in the game yet" instead of "not yet in service".
Deterministic checks that every `model` resolves: it is registered (step 7), has a
manifest entry, sits in the right output folder, and its glb is committed.
Every entry must now arrive with its model: R5 deleted the allowlist, and
`tests/render/hangar/roster.test.ts` asserts that nothing is undrawn.

## 9. Check

- **Look:** open `hangar.html?bench` on the dev server
  (`https://ww2airsim.windomlane.org/hangar.html?bench`). The test bench
  drives every part the model has and reads "not modeled" for the rest.
  *Pivot gizmos* shows where each moving part turns; a gizmo in the wrong
  place is a wrong pivot. *Wireframe* shows the mesh. The counts line reads
  the model against its budget and turns red when it is over.
- **Assert:** run `tests/e2e/hangar.spec.ts` on the reference GPU (the
  command is in `docs/testing.md`). A new library entry is
  picked up automatically. Checks 1–3, 5–10 and 12–14 cover the following:
  - it renders
  - its gear, propeller and stores move
  - it responds to light like the Wildcat (lit over unlit, in its own paint; R3)
  - Cycle runs the gear
  - wireframe works
  - it is inside its manifest budget as drawn (check 10)
  - the list marks exactly the entries it cannot draw, and every other one
    is drawn (check 12, R1)
  - every rigged aircraft's gizmos are its props and legs (check 13, R3)
  - its card's Model row names where it came from, from its entry's `source`,
    and the Origin filter lists it as internal or external (check 14)
  - every Library entry is drawn: there is no allowlist (check 12, R5)

## Generated models

Not every model is a download. Ordnance is generated by script from cited dimensions
(ordnance spec §2): `tools/models/generated/<id>.ts` builds the geometry from the kit in
`mesh.ts`, keeps every figure in its header as CITED or ESTIMATE, and is registered in
`registry.ts`. Its entry has `source.kind: "generated"` and no `input`; `npm run
models:build -- <id>` runs it. The paint texture is pinned by MD5 in `paint.ts`, the way
`tools/textures/sources.ts` pins terrain textures, and the output must rebuild
byte-identically (`tests/tools/models/generatedModels.test.ts`). Verified 2026-09-26.

## Authoring in Blender

Where no cleanly licensed model exists, write an original one
([model-roster spec](superpowers/specs/2026-09-26-model-roster-design.md)).
A model is a script, `tools/models/blender/<id>.py`, built from
`tools/models/blender/kit.py`. Read the kit's header for the frame and the
determinism rules. `hangar.py` is the worked example, and its header shows
how to cite each figure and label each estimate.
For aircraft, `ki-84-frank.py`, `ki-21-sally.py` and
`b-29-superfortress.py` are one-, two- and four-engine templates whose
geometry is fractions of the cited length and span (R3).

A building (R4) takes its parts from the kit: `frustum`, `gable_roof`, `tank`, `sandbag_ring`, `strut`,
`gun_barrel` and `lattice_mast`, all wound outward and checked by
`tests/tools/models/blender/kitBuildings.test.ts`. One kit node is one draw call, so the building
budget's 4 draw calls means at most four roles or named nodes, turrets included. A building script
sets literal `FOOTPRINT_X_M`, `FOOTPRINT_Z_M`, `HEIGHT_M` and `BASE_Y_M`, which
`tests/tools/models/buildingModels.test.ts` measures against the committed glb without Blender,
along with its budget, its turret names and a check that no two paints z-fight. Its front faces +x;
the hangar, which opens toward +z as the game's does, is the exception.

```sh
npx tsx tools/models/blender/cli.ts <id> [--key value ...]
```

This writes `content/models/candidates/<id>.glb` (gitignored) and prints its
inspection. Blender must be exactly the version pinned in
`tools/models/blender/run.ts`, and every run goes through that file's
`runBlenderScript`: it is what makes a raising script fail. Tests that need
Blender skip by name without it. Both nexus and ryzen have it (the blender.org
build, since 2026-09-27; see `serverconfig/ryzen.md`, "Blender: the blender.org build"), so they also run under `remote-run`.
`tools/models/blender/preview.py`
renders a glb to PNG for a handoff.

A model ships through the manifest like any other (R1, 2026-09-26). Its entry
has `source.kind: "blender"`, a `script`, a `dimensions` citation and
`AGPL-3.0-or-later`, and no `input`. `npm run models:build -- <id>` runs the
script into `tools/models/cache/<id>.glb`, then runs every stage a download
does, so `normalize`, `keep` and `split` work the same way. Without Blender,
`models:build` skips it by name.
`tests/tools/models/blenderEntries.test.ts` rebuilds every Blender entry and
compares the bytes with the committed file. To show the model in the Hangar, see §7
and §8.
The onboarding runbook for a new aircraft is [aircraft.md](aircraft.md).

### Skins (DP0, DP1, DP2, DP3)

A Blender model can carry a baked skin: paint, markings, panel lines and
pinned CC0 scan detail in one atlas on `TEXCOORD_0`
([detail-pass spec](superpowers/specs/2026-09-28-model-detail-pass-design.md),
§4 ruling: one UV set, no `TEXCOORD_1`). Written 2026-09-28 and verified by
the DP0 to DP3 plans' Deterministic runs and their reference-GPU E2E runs
(`tests/e2e/hangar.spec.ts` checks 15 and 16); the numbers are in the
[DP0 handoff](handoff/2026-09-28-dp0-skin-pipeline.md) and the
[DP1 handoff](handoff/2026-09-28-dp1-aircraft.md) and the
[DP2 handoff](handoff/2026-09-28-dp2-ships.md) and the
[DP3 handoff](handoff/2026-09-29-dp3-buildings.md).

- **Turn it on** with `kit.Model(name, skin=<atlas px>)` (1024 for aircraft,
  512 for buildings). The kit then writes charts, UVs, smooth shading on
  lofted surfaces, and `<out>.skin.json` beside the glb.
- **Markings** are declared in model coordinates with `m.marking(...)`; the
  schema is `tools/models/skin/sidecar.ts`. **Tags** come from
  `with m.tagged(...)`, and a marking's `tags` restrict it to those parts.
  Small uniform fittings go inside `with m.shared_chart():` so their padding
  does not eat the atlas (read its docstring in `kit.py` first).
- **The entry** takes `"skin": true` (Blender entries, ships included), and
  `textures.maxSize` equal to the atlas. `maxBytes` does not rise.
- **Ships (DP2).** A ship takes `"skin": true` too. Its paint is its
  palette's (`tools/models/skin/shipColors.ts`) and its skin is
  `metallicFactor 0` (Ruling S1); its skirt stays `ship:boot`. Ship hulls are
  `hull_lines` and turrets are `naval_turret`: read their docstrings in
  `kit.py`. A hull number is the `text` marking
  (`tools/models/skin/strokeFont.ts`; model space, refused mirrored). A
  downloaded ship with no usable UVs takes `"boxSkin": { "atlasPx": ... }`
  (`tools/models/skin/boxProject.ts`), and
  `tests/tools/models/shipEntries.test.ts` rebuilds the downloads from their
  raw inputs and pins their geometry.
- **The look** lives in `tools/models/skin/surfaces.ts` (per-role scan,
  finish, chips, rivets) and `tools/models/skin/layers.ts` (paint, markings,
  panel lines, height). A change there re-skins every skinned model and moves
  the golden hashes in `tests/tools/models/skin/golden.test.ts`.
- **No coplanar overlapping faces.** Two faces of one material can now show
  different atlas texels, so a coincident face z-fights in paint. Additions
  embed by at least 0.02 m or clear by at least 0.01 m, never flush.
- **Bare metal (DP1).** `naturalMetal` is `metallic 0.25`, not 1: fully
  metallic renders near-black in the Hangar, which has no environment to
  reflect (P-38 measured 0.089x its flat luminance, 2026-09-28). At 0.25 the
  P-38 and B-29 both read 0.738x, inside check 15's band.
- **The UV checker:** open `hangar.html?bench` and tick "UV checker" to see
  each model's chart stretch.
- **`tests/tools/models/skins.test.ts`** requires every non-generated entry to
  be skinned (the flat-shaded allowlist was deleted 2026-09-29, when DP3
  skinned the last nine buildings): its committed glb must carry textures, and
  a Blender entry must say `"skin": true`. A new Blender model that arrives
  flat fails the suite.
