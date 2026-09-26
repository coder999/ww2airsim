# Z1 handoff: the model pipeline and runtime foundation (2026-09-25)

**`view.model` state.** `content/aircraft/a6m2-zero.json` did not exist on
this branch when Task 7 ran, so Z1 gave `"model": "wildcat"` only to
`f4f-wildcat.json` and `f6f-hellcat.json`. Z2 has since reached `main` and
applied the plan's rule from its side: `main`'s `a6m2-zero.json` already
names `"model": "wildcat"` (`a499898`, checked 2026-09-25). Z3 flips it to
`"a6m2-zero"` when it registers that id.

Branch `worktree-models-track`, the Models-track sequence Z1, H1, S1, Z3,
H2, S2, H3. **Z1 landed in two sessions, out of order.** Tasks 5, 6 and 7
(the dist filter, the model cache and `Airframe`, `view.model`) were
committed first, in an earlier session (`6abdb6d`, `c076e99`, `227ca1e`),
and H1 was built on top of them (`f0e16d1`..`06fdf2b`). Tasks 1 to 4 (the
tooling) and this handoff followed on top of H1 in a later session. Nothing
Zero-specific ships, and no glb was built: `content/aircraft/wildcat.glb`
kept its bytes (sha256 `3f7a6ccf…58d6e` before and after, 5,573,316 bytes).

Tier 1 completed with `rc=0` after every task: typecheck, lint and
dependency-cruiser passed, followed by **1,754 tests passed and 12 skipped in
175 files** after Task 4. The skips are the repository's documented absent
terrain and source-data caches. `npx vitest run tests/tools/models/` alone
passes **37 tests in 6 files** (manifest 15, inspect 1, geometryStages 7,
surfaceStages 3, build 7, outputs 4), the plan's figure exactly.

## The interface Lane C and the Hangar consume

Tooling (`tools/models/`, Node only):

- `ModelEntrySchema`, `parseModelEntry`, `loadModelEntries` —
  `tools/models/manifest.ts`. One `tools/models/entries/<id>.json` per model.
  Optional `frozen: "<reason>"`: a bare `models:build` skips the entry and
  names it; `models:build -- <id>` refuses it unless `--force` is given.
- The stage order lives in `runPipeline` — `tools/models/build.ts`: remove
  (source nodes), keep-presence check, split, remove (split names), simplify,
  then with `normalize` only collapse, pivot and `normalizeDocument`, then
  `joinExcept`, textures, opaque, `prune`, provenance. **S1's `shipFit` and
  `shipMaterials` go after `normalizeDocument` and before `joinExcept`.**
- `checkOutput(doc, byteLength, entry)` and `ALLOWED_REQUIRED_EXTENSIONS`
  (`['EXT_texture_webp']`) — `tools/models/build.ts`. The build checks before
  it writes, so a failed build leaves the committed file untouched.
  `tests/tools/models/outputs.test.ts` runs the same check on every committed
  output, plus its provenance and its `ASSETS.md` row.
- `prune` already runs with `keepSolidTextures: true`.
- Provenance travels in the file: `asset.extras.source`, `author`, `license`.
- A part's hinge axis travels in node extras as `pivotAxis`, a unit vector in
  the output frame. `GLTFLoader` surfaces it as `Object3D.userData.pivotAxis`.
  Nothing in `src/` reads it yet; Z3 is the first reader.
- `npm run models:inspect -- <file.glb>` — `tools/models/inspect.ts`. Every
  coordinate it prints is in the source frame an entry is written in.

Runtime (`src/render/`):

- `acquireModel(url)`, `createModelCache(parse?)`, `ModelInstance` —
  `src/render/models/modelCache.ts`. One parse per URL; each acquire clones and
  shares geometry, materials and textures.
- `disposeMeshTree` now lives in `src/render/models/dispose.ts`
  (`scenarioEntities.ts` re-exports it).
- `Airframe` (`parts`, `update`, `dispose`), `AirframeUpdate`, `PartId`,
  `propAngle` — `src/render/scene/airframe.ts`. `airframeUpdateFor` —
  `src/render/airframeUpdate.ts`.
- `AIRFRAME_MODELS` and `airframeFor` — `src/render/scene/airframes.ts`.
- `LoadAirframe` and `loadRegisteredAirframe` —
  `src/render/scenarioEntities.ts`. A scenario switch loads the new airframes
  before it releases the old ones, so a model both scenarios use keeps its one
  parse.

## Reference-GPU Tier 2

**Not run.** Task 8 Step 1 (`wildcat.spec.ts` and `entities.spec.ts` on a
spare slot) was excluded from this session by instruction, so Z1 has
Tier 1 acceptance only. The runtime half it would cover (Tasks 5 to 7) has
been exercised on the reference GPU only indirectly, by H1's Hangar run
(`docs/handoff/2026-09-25-h1-hangar-library.md`: gear and propeller motion
through `Airframe.update`, 6/6 passed). Tasks 1 to 4 are Node tooling and
change nothing a browser loads.

## What changed visibly

AI propellers now turn with their own throttle, and a wreck's stops
(Task 6). Nothing else is visible: the committed Wildcat is byte-identical.

## Traps

- The shared `node_modules` holds the new devDependencies through an
  `npm install --no-save` from the main checkout. Until this branch merges,
  any `npm install` or `npm ci` on `main` prunes them; re-run Task 1 Step 2.
- `Texture.getSize()` and `ImageUtils.getSize()` return `null` for sharp's
  lossy WebP; `measure.ts`'s `webpSize` reads the RIFF header instead.
- `npm run models:build -- wildcat --force` in the main checkout, where the
  raw input exists, would rewrite `wildcat.glb` and break the 5,573,316-byte
  pin in `tests/build/dist.test.ts`.
- `npm run models:inspect -- x.glb | head` dies with `EPIPE`: npm's banner
  eats lines and the closed pipe kills `console.log`. Use
  `npx tsx tools/models/inspect.ts x.glb | head`, or write to a file.

## Departures

The design-level departures from the spec's wording are listed once, in the
plan's
["Where this plan departs from the spec's wording"](../superpowers/plans/2026-09-25-z1-model-pipeline.md#where-this-plan-departs-from-the-specs-wording).
Execution departures from the plan's own steps, Tasks 1 to 4 and 8:

1. **Order.** Tasks 5 to 7 and H1 landed before Tasks 1 to 4. None of Tasks
   1 to 4's code needed a change for it: every plan block applied verbatim.
2. **`sharp`'s range.** `npm install --package-lock-only sharp@~0.35.3` saved
   `^0.35.4`; it was set back to the plan's `~0.35.3` in `package.json` and the
   lock's root entry.
3. **The shared install added more than the five packages.** `main`'s lock
   listed `@gltf-transform/cli`, but it was absent from `node_modules`, so the
   `--no-save` install reified it and its dependencies too: 156 packages
   added, 1 changed, none removed; `main`'s `package.json` and lock were not
   modified.
4. **`verify` under the shared lock.** `npm run verify -- --maxWorkers=6`
   cannot reach vitest (the flag lands on the inner `npm test`), so each task
   ran verify's four parts under `flock /tmp/ww2airsim-fullsuite.lock`, with
   `npx vitest run --maxWorkers=6` as the last.
5. **A stale pointer in the plan's `build.ts`.** Its provenance comment named
   `tests/tools/modelOutputs.test.ts`; it now names
   `tests/tools/models/outputs.test.ts`.
6. **`ASSETS.md`.** Its Wildcat paragraph said `tools/models/build.ts`
   produces the glb through `@gltf-transform/cli`. After Task 4 that was
   false, so it now dates that build to 2026-09-24 and says the entry is
   frozen.
7. **§15.** `main` already has the "A6M Zero (Z1-Z3)" row, added by Z2 after
   this branch was cut; this branch did not. The row was added here in
   `main`'s position (after row 17), with Z2's current wording and Z1's status
   folded in, so the merge conflict resolves by keeping this branch's line.
   The F4F Wildcat row's "no per-spec model selection exists yet" was
   amended, since Task 7 made it false.
8. **README.** There is no F4F Wildcat paragraph to follow; the pointer sits
   after the Hangar Library paragraph.
9. **Tier 2** was not run (above).
