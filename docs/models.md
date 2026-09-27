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
spec's §9 convention, `Turret1`…`TurretN`, numbered bow to stern.

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

- **Aircraft:** add the id to `AIRFRAME_MODELS` in
  [`src/render/scene/airframes.ts`](../src/render/scene/airframes.ts), with a
  module like `wildcat.ts` that poses its parts and lists them in `parts`.
  Then set `view.model` in the aircraft's `content/aircraft/<spec>.json`.
- **Ships:** add the id to `SHIP_MODELS` in
  [`src/render/scene/shipModels.ts`](../src/render/scene/shipModels.ts), and
  set `view.model` in `content/ships/<spec>.json`. The Hangar spec names a
  `content/ships/models.json` for this, but that file was never created; S1
  registered ships in `SHIP_MODELS` instead.
- **Buildings and vehicles:** add the id to `STATIC_MODELS` in
  [`src/render/scene/staticModels.ts`](../src/render/scene/staticModels.ts).
  They have no sim spec and no `view.model`; the Hangar draws them in place
  of one, through a Library entry's `model` (R1, step 8).

Tier 1 fails if a spec names a model id that is not registered.

## 8. Library entry

Add `content/library/<id>.json` with a name, blurb, history and dated
sources (Hangar spec §4). Tier 1 checks the library against the rosters in
`GAMEPLAY.md`.

An entry may also carry an optional `model: { "kind", "id" }` (R1), where
`kind` must equal the entry's own kind (`aircraft`, `ship`, `building` or
`vehicle`). The Hangar draws it in place of the spec's `view.model`; with no
spec, the entry reads "not in the game yet" instead of "not yet in service".
Tier 1 checks that every `model` resolves: it is registered (step 7), has a
manifest entry, sits in the right output folder, and its glb is committed.
An entry the plan now draws must come off `NOT_YET_DRAWN` in
`tests/render/hangar/roster.test.ts`, with `CEILING` lowered to match.

## 9. Check

- **Look:** open `hangar.html?bench` on the dev server
  (`https://ww2airsim.windomlane.org/hangar.html?bench`). The test bench
  drives every part the model has and reads "not modeled" for the rest.
  *Pivot gizmos* shows where each moving part turns; a gizmo in the wrong
  place is a wrong pivot. *Wireframe* shows the mesh. The counts line reads
  the model against its budget and turns red when it is over.
- **Assert:** run `tests/e2e/hangar.spec.ts` on the reference GPU (the
  command is in README's "Tier 2: the GPU harness"). A new library entry is
  picked up automatically. Checks 1–3, 5–10 and 12 cover the following:
  - it renders
  - its gear, propeller and stores move
  - it is lit like the Wildcat
  - Cycle runs the gear
  - wireframe works
  - it is inside its manifest budget as drawn (check 10)
  - the list marks exactly the entries it cannot draw, and every other one
    is drawn (check 12, R1)

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

```sh
npx tsx tools/models/blender/cli.ts <id> [--key value ...]
```

This writes `content/models/candidates/<id>.glb` (gitignored) and prints its
inspection. Blender must be exactly the version pinned in
`tools/models/blender/run.ts`, and every run goes through that file's
`runBlenderScript`: it is what makes a raising script fail. Tests that need
Blender skip by name without it (ryzen has none, checked 2026-09-26), so run
`tests/tools/models/blender/` on nexus. `tools/models/blender/preview.py`
renders a glb to PNG for a handoff.

A model ships through the manifest like any other (R1, 2026-09-26). Its entry
has `source.kind: "blender"`, a `script`, a `dimensions` citation and
`AGPL-3.0-or-later`, and no `input`. `npm run models:build -- <id>` runs the
script into `tools/models/cache/<id>.glb`, then runs every stage a download
does, so `normalize`, `keep` and `split` work the same way. Build it on
nexus: without Blender, `models:build` skips it by name.
`tests/tools/models/blenderEntries.test.ts` rebuilds every Blender entry and
compares the bytes with the committed file. That check is a named skip on
ryzen, so run it on nexus by name. To show the model in the Hangar, see §7
and §8.
