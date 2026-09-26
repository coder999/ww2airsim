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

Tier 1 fails if a spec names a model id that is not registered.

## 8. Library entry

Add `content/library/<id>.json` with a name, blurb, history and dated
sources (Hangar spec §4). Tier 1 checks the library against the rosters in
`GAMEPLAY.md`.

## 9. Check

- **Look:** open `hangar.html?bench` on the dev server
  (`https://ww2airsim.windomlane.org/hangar.html?bench`). The test bench
  drives every part the model has and reads "not modeled" for the rest.
  *Pivot gizmos* shows where each moving part turns; a gizmo in the wrong
  place is a wrong pivot. *Wireframe* shows the mesh. The counts line reads
  the model against its budget and turns red when it is over.
- **Assert:** run `tests/e2e/hangar.spec.ts` on the reference GPU (the
  command is in README's "Tier 2: the GPU harness"). A new library entry is
  picked up automatically. Checks 1–3 and 5–10 cover the following:
  - it renders
  - its gear, propeller and stores move
  - it is lit like the Wildcat
  - Cycle runs the gear
  - wireframe works
  - it is inside its manifest budget as drawn (check 10)
