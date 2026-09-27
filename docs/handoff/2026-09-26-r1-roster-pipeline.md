# R1 handoff: the roster pipeline and the display-only Library path (2026-09-26)

R1 turns R0's Blender kit into a shipping model and gives the Library its own
display path: a `blender` manifest kind, a `vehicle` kind, a static-model
registry for entries with no sim spec, and a Hangar that draws any entry's
own model whether or not it is in the game. The design is
[`2026-09-26-model-roster-design.md`](../superpowers/specs/2026-09-26-model-roster-design.md).
The plan is
[`2026-09-26-r1-roster-pipeline.md`](../superpowers/plans/2026-09-26-r1-roster-pipeline.md).

This work is **complete on branch `worktree-r1-roster`, not merged into
`main`**; merging is Mark's call. Commits `52c2ddb`..`e1ed885` (this
handoff's commit included) sit on `main` at `fe461c8`.

## What shipped

- **The `blender` source kind.** A manifest entry with `source.kind:
  "blender"` names a script, a `dimensions` citation and
  `AGPL-3.0-or-later`, no `input`. `npm run models:build -- <id>` runs the
  script into `tools/models/cache/<id>.glb`, then the same pipeline stages a
  download uses (`normalize`, `keep`, `split`, `compressTextures`,
  `forceOpaque`, `prune`). Blender must run on nexus; without it,
  `models:build` skips the entry by name.
- **New output folders**: `content/buildings/` and `content/vehicles/`, next
  to the existing `content/aircraft/`, `content/ships/` and
  `content/ordnance/`.
- **The hangar as the first Blender model in `content/`.** Built on nexus
  (`npm run models:build -- hangar`): **18,784 bytes, 356 triangles, 3 draw
  calls**, bounds min (-17.5, -0.3, -21.5) max (17.5, 14.0, 21.5). The
  build's own log line: `built hangar -> content/buildings/hangar.glb: 18784
  bytes, 356 triangles, 3 draw calls`. Triangles and draw calls match R0's
  raw Blender export exactly; the 228 extra bytes are the pipeline's
  provenance `asset.extras` plus a `gltf-transform` re-encode, not a
  `hangar.py` change.
- **The Library `model` field.** An entry may carry `model: { kind, id }`
  (`docs/models.md` §8), where `kind` must equal the entry's own kind. The
  Hangar draws it in place of the spec's `view.model`. Tier 1 checks that
  every `model` resolves: registered, has a manifest entry, sits in the
  right output folder, and its glb is committed.
- **The `vehicle` kind**, with two entries: `type97-chi-ha` and
  `willys-mb-jeep`. Neither has a sim spec or a model; both remain
  "not yet in service".
- **The static-model registry**, `STATIC_MODELS` in
  `src/render/scene/staticModels.ts` (`docs/models.md` §7): buildings and
  vehicles register here instead of `AIRFRAME_MODELS` or `SHIP_MODELS`,
  because they have no sim spec. The hangar is registered.
- **The display path**, with its three labels (`src/render/hangar/catalog.ts`
  `availability`/`STATUS`): an entry with a spec is `in-game` (no status
  note); an entry with only a `model` is `display-only`, "not in the game
  yet"; an entry with neither is `not-drawn`, "not yet in service".
- **The not-yet-drawn allowlist stands at 25** (`NOT_YET_DRAWN` /
  `CEILING` in `tests/render/hangar/roster.test.ts`): the 23 Library
  entries with no spec, plus the 2 new vehicle entries. The hangar was
  never on it — it always had a spec, so it was never undrawable. Every
  later roster plan removes the entries it draws and lowers `CEILING` to
  match; R5 deletes both.

## Tier 1

`remote-run npm run verify`, run 1: `rc=1` — `tests/sim/ai/furball.test.ts`
`beforeAll` hit its 10 s hook timeout under full-suite contention on ryzen.
`git diff main...HEAD -- src/sim tests/sim` is empty, and the suite alone on
ryzen passed 8/8 in 2.7 s, so this is a latent flake on `main`, not R1. Run
2: **rc=0**, 248 files (247 passed, 1 skipped), **2,538 passed, 22 skipped**.
Twenty-one of the skips match the O1 handoff's count; the new one is the
`blenderEntries.test.ts` rebuild block (named skip, no Blender on ryzen).
Its footprint test and `outputs.test.ts`'s `hangar` block both **ran** on
ryzen, and O1's generated-identity block was not skipped.

The nexus Blender-only run: `npx vitest run tests/tools/models/blender
tests/tools/models/blenderEntries.test.ts --maxWorkers=1` — **rc=0**, 4
files, 30 passed, none skipped.

**No game change**: `git diff main...HEAD --stat -- src/sim content/aircraft
content/ships content/scenarios content/bases
src/render/scene/airfield.ts src/render/scene/buildings.ts` is empty.

## Tier 2

Slot `ww2airsim-2.windomlane.org` (port 5175), 14/14, **rc=0**. For the
`hangar` entry:

- **Check 1** (renders, mask in bounds, no validation errors): pass.
- **Check 8** (wireframe share, materials toggle): `wireframe hangar:
  65.45%`.
- **Check 10** (manifest budget as drawn, `modelUrl`): `counts hangar:
  {"scene":{"triangles":356,"drawCalls":3},"model":{"triangles":356,"drawCalls":3},"modelUrl":"/content/buildings/hangar.glb","budget":{"maxBytes":500000,"maxTriangles":5000,"maxDrawCalls":4},"over":false}`.
- **Check 12** (the list marks exactly what it cannot draw, new in R1):
  pass — `all - notDrawn === entries().length` and no drawable id carries
  "(not yet in service)".

## Mark's checkpoint

Captures from the reference GPU, in
[`2026-09-26-r1-shots/`](2026-09-26-r1-shots/):

- The hangar model: [three-quarter](2026-09-26-r1-shots/hangar-three-quarter.png), [front](2026-09-26-r1-shots/hangar-front.png), [top](2026-09-26-r1-shots/hangar-top.png)
- The Library: [Vehicles filter](2026-09-26-r1-shots/library-vehicles.png), [the hangar's card](2026-09-26-r1-shots/library-hangar-card.png)

To see it live, open `https://ww2airsim-2.windomlane.org/hangar.html?bench`.
It is up **only while this worktree's dev server runs** on port 5175; check
first:
`curl -sS -o /dev/null -w '%{http_code}\n' https://ww2airsim-2.windomlane.org/`
must print `200`.

## Found along the way

- **A furball soak flake on `main`.** `tests/sim/ai/furball.test.ts`
  `beforeAll` timed out at 10 s under full-suite contention on ryzen; passed
  8/8 alone in 2.7 s. Untouched by R1 (`git diff main...HEAD -- src/sim
  tests/sim` is empty) — a pre-existing flake, not a regression.
- **The main checkout's texture cache lacked O1's paint JPEGs.** Task 0
  found 3 skipped paint-texture identity tests at baseline because
  `tools/textures/cache` lacked the `blue_metal_plate` JPEGs O1 fetched into
  its own worktree. Copied the three in and verified their MD5s against
  `paint.ts`'s pins; baseline became 210 passed, 0 skipped there.

## For R2

- **Adding a ship**: write the content spec, add a Library entry, register
  the id in `SHIP_MODELS`, and set the Library entry's `model` (or the
  spec's `view.model`) — see `docs/models.md` §7-§8 for the exact steps;
  not restated here.
- **`NOT_YET_DRAWN` and `CEILING` both go down** in
  `tests/render/hangar/roster.test.ts` as R2 draws entries off the list.
  `CEILING` is a review tripwire only — it lives in the same file, not a
  behavioral gate.
- **R0's kit still lacks the hull part.** Per the R0 (M0) handoff's
  rulings, R0 built only `box`, `barrel_vault` and `arch_gable`; the hull
  goes to R2, the fuselage/wing/propeller to R3, and the gable roof,
  tank, sandbag ring, gun barrel and lattice mast to R4 (the R0 handoff
  calls them M2-M4).
- **Two open decisions from the final review's "declined to judge"**, both
  unresolved because neither case exists in R1:
  - An aircraft entry that carries both a spec and its own `model`: the
    display path would draw the `model` and drop the spec's stores and
    gear seating, while `main.ts` still builds the spec's Cycle controller
    against the spec. Which one should own the aircraft in that case is
    undecided.
  - A ship entry that carries both a spec and its own `model`: the display
    path sends it through the raw display loader, not S1's
    `loadShipView`, so it also would not carry S1's ship-specific view
    logic. Same open question.

## Departures

Summarized from the ledger's `Ruling:` lines
(`.superpowers/sdd/2026-09-26-r1-roster-pipeline/progress.md`, gitignored):

- **R-T6a** — Task 6 changed the existing "a ship and a building load with
  no articulated parts" test from `byId('hangar')` to `byId('tower')`,
  because after Task 5 the hangar names its own model and would otherwise
  reach `GLTFLoader` in Node; the hangar's display path is covered by
  Task 6's own new test instead.
- **R-T1a** — Task 1's `outputs.test.ts` blender branches (provenance and
  ASSETS row) stayed in Task 1 rather than moving to Task 3, because tsc
  already required them for the third union member; Task 3's dispatch text
  went slightly stale but nothing functional changed.
- **R-T5a** — two of Task 5's schema-test regexes could not match, because
  a `ZodError.message` arrives as JSON with escaped quotes; fixed the
  regexes to match the escaped form, schema code unchanged.
- **R-T5b** — commits from Tasks 1, 4 and 5 carry "Co-Authored-By: Claude
  Haiku 4.5" rather than the constraints' Opus 5.5 line, because that is
  the model that actually wrote them; left as accurate history rather than
  rewritten, fixable by a rebase before merge if Mark wants one.
- **R-T9a** — Task 9's Tier 1/Tier 2 verification and the final whole-branch
  review ran before Task 9's handoff/docs steps, so this handoff reports
  post-review state; an ordering ruling only, no functional cost.
- **Final review fix wave** — addressed the review's one Important finding
  (`docs/models.md`'s new paragraph pointed at §7/§8 without covering
  `STATIC_MODELS` or the Library `model` field, and §9's check list lacked
  check 12) plus two minors (a vehicle case added to the display-loader
  test; stale wording in `ASSETS.md` and the footprint-test comment). A
  third minor (`fcc945b`'s commit subject/trailer spacing) folds into
  R-T5b: no history rewrite. Commit `06aa24c`.
