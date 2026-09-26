# S1: ship models from licensed candidates, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the procedural boxes of the three shipped ships (`essex-cv`, `fletcher-dd`, `type-b-maru`) with licensed Sketchfab models, fitted at build time to the ShipSpec the sim is authoritative for, loaded through Z1's shared model cache, and drawn with a loud fallback to the boxes.

**Architecture:** One pure module, `src/render/scene/shipFit.ts`, measures a triangle soup and fits it to a ShipSpec: a carrier's flight deck to Plan 8's rectangle, everything else to its length and waterline beam. Two new build stages call it inside Z1's `runPipeline` (`shipFit`, then `shipMaterials`, between `normalizeDocument` and `joinExcept`), and a third step adds the runtime's marker nodes after `prune`. Tier 1 re-runs the same measurements on the **committed** glbs against the **live** `content/ships/*.json`. At runtime a ship spec's optional `view.model` names a registry entry; `makeShipViewLoader` acquires it through `acquireModel` and builds a `ShipView`, or draws the boxes and reports the failure into `validationErrors`.

**Tech Stack:** TypeScript (strict), three.js 0.186, Zod, vitest, glTF-Transform 4.5 (Z1's tooling devDependencies; nothing new is installed), Vite's `import.meta.glob`, Playwright (Tier 2).

**Spec:** `docs/superpowers/specs/2026-09-25-ship-models-design.md`, approved by Mark on 2026-09-25 with every recommendation in §13 accepted. This plan is its §11 "S1" (the three shipped ships, §2.1). S2 is not planned here. Read §3 to §9 and §13 first, then Z1's handoff, `docs/handoff/2026-09-25-z1-model-pipeline.md`.

**Where:** the worktree `/home/mark/projects/ww2airsim/.claude/worktrees/models-track`, branch `worktree-models-track`, at `ac7f4f8` (main, which already contains Z1 and H1). The Models-track order is Z1, H1, S1, Z3, H2, S2, H3; Z1 and H1 are complete. Do not switch branches, do not touch `main`, and do not push.

## Open questions for Mark

**Answered 2026-09-25: Mark accepted all three defaults** (S1 switches the Hangar's ship path now, so H2's item 4 is done early; the island clearance is accepted as drawn, 0.9 m of wingtip margin at its forward feature rather than 2.1 m; the model carrier's trap band is narrowed to 18.5 m, its width carried in the glb's `TrapBand` node). The questions are kept below as the record of what was decided and why.

Each has a default, and the plan follows the default unless Mark says otherwise. Each answer is at most a one-task change.

1. **The Hangar's ships.** The Hangar spec (§12) moves the Hangar's ships to Lane C's loader in H2, "if S1 has merged". H2 comes after S1 in the track, so until then the Hangar would show boxes for ships the game draws as models.
   - **Default:** S1 switches the Hangar's ship path now (Task 7): the ship branch and signature of `loadHangarModel` in `src/render/hangar/models.ts`, and one loader in `src/render/hangar/main.ts`. H1's Tier 2 check 1 already iterates every in-service entry through `__hangar.entries()`, so it covers the three ship models with no test change. H2's item 4 becomes done.
   - **Alternative:** leave the Hangar on boxes until H2. Drop Task 7 Steps 5 and 6.
2. **How close the island stands to the landing lane.** The spec measured the island's inboard face at 8.6 m from the centerline (a centerline Wildcat's wingtip clears it by about 2.1 m) and Mark accepted it as drawn (§13 item 4). Re-measured for this plan, the island's main face is at **11.0 m** (4.5 m of clearance), but a feature at its forward end (x = +30 to +32 m, forward of the trap zone, on the take-off run) reaches **7.5 m** inboard: **0.9 m** of wingtip clearance.
   - **Default:** accept as drawn, per Mark's ruling. There is no island collision in the sim either way.
   - **Alternative:** remove that feature in the build with a `split` box plus `remove` in `essex-cv.json`, around x +28 to +34 m and inboard of z +9.5 m in fitted meters (converted to the source frame; the island's main face at 11.0 m is untouched). That misrepresents the ship slightly.
3. **The trap band's width on the model carrier.** The boxes draw the band 0.9 × the deck width (29.6 m). On the model that band would cross the island's aft end, which stands inside the trap zone's span from x = −28 m forward.
   - **Default:** narrow the band on model carriers to what the model leaves clear, 1 m inboard of anything more than 0.5 m above the deck in the trap zone's span. That is **18.5 m** on the CV-6 (half-width 9.25 m), and the width travels inside the glb (`TrapBand`). The boxes keep 0.9 W.
   - **Alternative:** keep the full width and stop the band short of the island (shorter than the sim's trap zone). That misdraws the zone.

## Global Constraints

- `npm run verify` (typecheck, lint at zero warnings, depcruise, tests) ends every task with `rc=0`. **Nexus was OOM-killed on 2026-09-25 by parallel test suites**, so run it in its four parts, one full suite on the machine at a time, and capture the status directly:

  ```bash
  flock /tmp/ww2airsim-fullsuite.lock sh -c 'npm run typecheck && npm run lint && npm run depcruise && npx vitest run --maxWorkers=2'; rc=$?; echo "rc=$rc"
  ```

  Never gate on a grepped pipeline. While iterating, run named files only: `npx vitest run <files> --maxWorkers=2`.
- **Never copy the repo, or a model, into `/tmp`** (a RAM-backed tmpfs). Probes and scratch builds go under `.superpowers/` (gitignored) and are deleted before the commit. `tests/build/dist.test.ts` already builds twice into `os.tmpdir()`; run it alone.
- **No `npm install`** of any kind: Z1's devDependencies are in the shared `node_modules`. **Never `git clean -fdx`**: it destroys about 275 MB of terrain data that exists nowhere else.
- **The sim is authoritative** (spec §4). No sim number in `content/ships/*.json` changes; the only content edit is the render-only `view` key. `src/sim/` changes only by that optional key (spec §3.1). Plan 8's deck, the trap zone, the paddles, the deck-quals spot and the strike hit boxes stay exactly as they are.
- **No compression extension, ever.** `checkOutput` rejects any `extensionsRequired` entry other than `EXT_texture_webp`.
- **`content/aircraft/wildcat.glb` keeps its bytes:** 5,573,316, sha256 `3f7a6ccff7ea1e2f1362cfa44f9b13dbba1fea4130d015dbd4c3d9b704d58d6e`. Its entry is `frozen`; never pass `--force`, and never run a bare `npm run models:build` in the main checkout (its raw Wildcat input is there).
- **A committed ship glb is written only by `npm run models:build -- <id>` in Task 3** (and, if Task 9 retunes the palette, again there). Its `ASSETS.md` row lands in the same commit.
- **Ownership (spec §8.2, as it applies after Z1 and H1).** This work owns `src/render/scene/{shipFit,shipPalette,shipModels,ship}.ts`, `src/render/modelCredits.ts`, `src/render/modelCreditsIndex.ts`, `tools/models/stages/{shipFit,shipMaterials}.ts`, `tools/models/entries/{essex-cv,fletcher-dd,type-b-maru}.json`, `content/ships/*.glb`, `tests/render/shipFixtures.ts`, `tests/render/{shipFit,shipModels,modelCredits,ship}.test.ts`, `tests/tools/models/shipStages.test.ts`, `tests/tools/shipModels.test.ts` and `tests/e2e/ships.spec.ts`. It shares these, touching only what each item names, and re-diffs each against `HEAD` right before every commit:
  - `tools/models/manifest.ts`: the additive `ship` block and its cross-field rules
  - `tools/models/build.ts`: three ship lines in `runPipeline`, the ship checks in `checkOutput`, the per-entry catch in `runBuild`
  - `src/sim/world/ships.ts` and `content/ships/*.json`: the `view` key only
  - `src/render/scenarioEntities.ts`: the ship half
  - `src/render/main.ts`: the ship loader, the one `buildScenarioEntities` call, two `__ww2` members
  - `src/render/diagnostics.ts`: those two members' types
  - `src/render/content.ts`: `shipModelPath`, `shipModelUrl`
  - `src/render/legend.ts`: the models credit
  - `src/render/hangar/models.ts`, `src/render/hangar/main.ts`: the ship path (Open question 1)
  - `tests/render/scenarioEntities.test.ts`, `tests/render/hangar/models.test.ts`, `tests/sim/world/ships.test.ts`, `tests/build/dist.test.ts`, `tests/e2e/deckQuals.spec.ts` (one new test; photoreal's luminance test there is not edited)
  - `ASSETS.md`: the three ship rows, their provenance paragraph, and the Fletcher's candidate row
- **Photoreal Task 12 has landed** (`1fd81d1`, in this branch's history). Its deck-luminance gate in `deckQuals.spec.ts` must stay green with the model's `flightDeck` color: tune inside the gate (Task 9), never re-baseline it. Task 12 did not edit `ship.ts`.
- Tier 2 runs only in Task 9, on the `ww2airsim-2` slot (port 5175), per the repo `CLAUDE.md`. No dev server before that.
- Write a rulings ledger at `.superpowers/sdd/s1-ship-models/progress.md` (repo `CLAUDE.md`, item 5).
- US spelling in new prose and identifiers. Escape `|` as `\|` inside markdown table cells.
- End each commit message with the `Co-Authored-By` trailer your session's instructions specify.

## What S1 consumes from Z1, and where this plan departs from the spec's wording

The spec's §8.1 was written before Z1 existed. Z1's handoff names the real interface, and this plan builds on exactly these names:

- **Tooling** (`tools/models/`): `ModelEntrySchema`, `parseModelEntry`, `loadModelEntries` (`manifest.ts`); `runPipeline`, `checkOutput`, `runBuild`, `BuildDeps`, `ALLOWED_REQUIRED_EXTENSIONS` (`build.ts`); `modelIO`, `findNode`, `meshNodes`, `onlyScene`, `ownMesh` (`document.ts`); `measureDocument` (`measure.ts`); `normalizeMatrix`, `normalizeDocument` (`stages/normalize.ts`); `carve`, `ensureIndices` (`stages/geometry.ts`); `npm run models:build -- <id>` and `npm run models:inspect -- <file.glb>`; the test fixtures `boxArrays`, `boxesPrimitive`, `addMeshNode`, `newDocument`, `V3` (`tests/tools/models/fixtures.ts`).
- **The stage order** in `runPipeline`: remove, keep check, split, remove, simplify, then with `normalize` only collapse, pivot and `normalizeDocument`, then `joinExcept`, textures, opaque, `prune`, provenance. S1's `shipFitStage` and `shipMaterials` go after `normalizeDocument` and before `joinExcept`, as the handoff says. S1's `addShipMarkers` goes after `prune` (departure 4).
- **Runtime** (`src/render/`): `acquireModel`, `createModelCache(parse?)`, `ModelInstance` with `root`, `node(name)` and `release()` (`models/modelCache.ts`); `disposeMeshTree` (`models/dispose.ts`); `LoadAirframe`, `loadRegisteredAirframe`, `buildScenarioEntities` and its load-before-release order (`scenarioEntities.ts`).
- **Committed-output tests:** `tests/tools/models/outputs.test.ts` runs on **every** entry, ships included. It already checks each ship glb's existence, budget, extensions, provenance (`asset.extras.source` and `license`) and its `ASSETS.md` row. S1's own Tier 1 file adds only what is ship-specific.
- **`prune` already exists**, with glTF-Transform's default `keepAttributes: false`. It removes the Liberty's nine unused UV sets without a new stage (departure 1).

**Departures from the spec's wording.** All were measured or found while drafting this plan. None reverses a decision Mark made; the three that are his to rule on are the open questions above.

1. **No `prune` stage is added** (spec §7, §8.1). Z1's `prune` already drops unused vertex attributes. The Liberty still misses its 4 MB budget without more: built through Z1's stages alone it is **4,630,960 bytes**. `shipMaterials` drops, on a `keep` material, every `KHR_materials_*` extension (the specular texture is 689,750 bytes as WebP) and its `TANGENT` attribute (1,040,912 bytes). Built, it is **2,900,088 bytes**.
2. **`KHR_materials_specular` is dropped, not kept optional** (spec §5.2). It makes three.js build a `MeshPhysicalMaterial` for the Liberty alone, and it is the largest texture. Every ship is now a `MeshStandardMaterial`, like the boxes.
3. **Every entry's `normalize.fit` is `length` at `lengthM`.** For a carrier, `shipFit` then applies the deck-derived x residual (`rx`) that spec §4.3 describes, so the deck is exact and the overall length lands where it lands.
4. **The marker nodes are added after `prune`.** Z1's `prune` runs with `keepLeaves: false`, which deletes empty leaf nodes; `SmokeOrigin` and `TrapBand` are exactly that. `addShipMarkers` runs after it.
5. **The deck-length estimator.** The spec used the deck plane's 1st-to-99th percentile (36.05 source units). An area-weighted percentile trims the tapered ends: measured, it gives 252.0 m, `rx` 1.0425, and an overall length **+4.25%**, which fails the ±3% tolerance. This plan measures the deck as the eye sees it from above: first to last 0.5 m slice holding at least 2 m of visible deck across. That is **36.232 units (259.5 m normalized)**, so `rx` is **1.0123**, `sx` 7.2504 m/unit, and the overall length **269.08 m, +1.23%** (the spec said +1.7%).
6. **The deck-width estimator.** A 0.5 m grid quantizes the width; measured that way, `kDeck` came out at exactly **1.2500**, the cap. This plan bisects each slice's edges to 1 mm and takes the median: **3.7355 units**, `kDeck` **1.2147** (the spec said 1.236). The waterline beam is read on the exact section at y = 0.1 m: **3.6135 units** (the spec's 3.612), `kWaterline` **1.0802** (the spec said 1.075). `sy/sx` is **0.9407** (the spec said 0.933).
7. **The Liberty's bow cannot be proved by the narrow-end rule** (spec §4.2 says it passes). Measured on sections at 0.1, 0.5 and 1 m, a merchant's full bow against its fine cruiser stern reads **0.938** bow-forward and about **1.066** reversed: neither side of 0.9 discriminates. The side render shows the rudder and propeller at −x, the raked stem and anchors at +x, and the ensign aft. So the Liberty's entry pins its ratio, `bow: { pinnedNarrowEnd: 0.938, evidence }`, with a ±0.03 tolerance that a reversal (1.066) fails. The Fletcher reads 0.210 and uses the rule.
8. **The Liberty's draft is 5.35 m, not about 6.0 m.** The spec's seam (y = 0.0075) and keel (0.0008) are 0.0067 units apart, and at 796.17 m/unit that is 5.33 m; the build measures the keel at −5.348 m. The main deck is at **4.17 m** (the spec said 4.3), inside ±3 m of 6.
9. **`SmokeOrigin` is an explicit point for all three** (spec §4.6 allowed either). The `funnelTop` heuristic is not built. The points were read off height maps of the fitted models (below). A point may stand up to 5 m above the model's top and must be within 5 m above the surface straight below it.
10. **The waterline's Tier 1 check.** A waterline model's skirt must end at exactly −3 m. A full hull's keel is pinned to its measured depth (`keelM`, ±0.05 m), so a moved waterline origin fails; where a hull has an `antifouling` role (the Fletcher), its top at midships must be y = 0 ± 0.05 m.
11. **The `ship` block's shape** (spec §4.1's example): it adds `otherMaterials` (the rule for every material `materials` does not name: a role, `classify` or `keep`), `bow` and `keelM`, and drops `smokeOrigin: "funnelTop"`. Role materials are named `ship:<role>`, so Tier 1 finds a role by name. Cross-field rules: only a `content/ships/` output takes a `ship` block and it must; a ship needs `normalize` and `opaque: false`; only a carrier uses `island-starboard`; `keelM` is required for a full hull and only for one.
12. **`checkOutput` gains ship checks:** BLEND is refused regardless of `opaque`, every `metallicFactor` must be 0, and there must be exactly one `SmokeOrigin`.
13. **`runBuild` catches a stage that throws.** Before, the first failing entry killed the whole CLI. Now it logs `FAILED <id>, nothing written: <problems>` and the other entries still build.
14. **`runPipeline` takes the ShipSpec loader as an injectable third parameter** (default `loadShipSpec`), so a test can move the deck without touching `content/`.
15. **The palette lives in `src/render/scene/shipPalette.ts`**, shared by the boxes and the build, and its `hull` and `flightDeck` colors are the two `ship.ts` drew before S1: the ones photoreal Task 12's gate measured at 0.64 of the runway. Only `usn-1944` exists; S2 adds `ijn`.
16. **The sink depth is the hull's own top plus 2 m for the boxes too**, not only for models. One rule for both paths: the escort's boxes now sink 23 m before hiding (was 10 m), the carrier's 33 m (was 25.5 m), the merchant's 19 m (was 10 m).
17. **`createShipMesh` keeps its name and returns a `ShipView`** (`root`, `model`, `setDamage`, `dispose`); the model path is `createShipView(spec, modelId, instance)`. `buildScenarioEntities` disposes every ship through `dispose()`, never `disposeMeshTree`: on a model root that would free geometry and materials other instances are still drawing.
18. **`main.ts` changes in three places, not zero** (spec §8.2 says its ship-pose loop does not change, which stays true): a `loadShips` loader whose error sink is `validationErrors`, that loader passed to the one `buildScenarioEntities` call, and two `__ww2` members for Tier 2 (`shipModels`, `shipDeckProbe`).
19. **The trap band on a model carrier is 18.5 m wide** (Open question 3), carried in the glb's `TrapBand` node as `extras.halfWidthM`.
20. **Tier 2 reads its broadsides in the Hangar** (the `side` preset), because the game's camera cannot be aimed at a ship headlessly. The deck probe reads the trap-zone center and 5 m short of the bow from the parked frame, in ship coordinates: the rendered deck is rigid, so the deck run adds nothing to it. It probes under the parked airplane at its origin and ±1.7 m to either side (the F6F's main-gear track, about 3.4 m, is an estimate; the sim has one contact point).
21. **`ASSETS.md`'s "Candidate models" section is already on this branch** (`e8ebcd2` is merged), so spec §10's cherry-pick is moot. The CV-6 and the Liberty were never candidate rows; only the Fletcher's row moves.
22. **`dist.test.ts` compares each ship glb in `dist/` with the committed file's size**, not a literal: a rebuild is legitimate, and Tier 1 re-measures it.
23. **The Hangar's ships switch in S1** (Open question 1).

## Measured before writing this plan (2026-09-25, this worktree at `ac7f4f8`)

These are claims to re-check before relying on them.

- **The code in this plan was run before it was written down.** Every new and modified file was applied to this worktree temporarily. `tsc --noEmit` passed; eslint passed at zero warnings on every changed file; depcruise reported no violations (190 modules). The named test files passed: `shipFit.test.ts` 29, `shipStages.test.ts` 7, `ship.test.ts` 18, `shipModels.test.ts` 4, `scenarioEntities.test.ts` 16, `hangar/models.test.ts` 7, `modelCredits.test.ts` 2, `legend.test.ts` 10, and Z1's `tests/tools/models/` 37 unchanged. `npx vite build` into `.superpowers/` exited 0 and the main chunk carried the credit. The three ships were built by the drafted pipeline into `.superpowers/` (never `content/ships/`), then read back and put through every Tier 1 assertion of Task 4 by a probe. The worktree was then restored: `git status` came back clean, and `wildcat.glb`'s sha256 was unchanged. **Not run:** Tier 2, `tests/tools/shipModels.test.ts` in place (its logic ran through the probe, because the glbs could not be written to `content/ships/`), `tests/sim/world/ships.test.ts`'s new case, the `dist.test.ts` lines, and Task 8's pinned credit string (the entries did not exist yet). The executor still runs every step.
- **Licenses**, read from `api.sketchfab.com/v3/models/<uid>` on 2026-09-25: all three are `license.slug` `by`, `isDownloadable` true, `price` null. Authors: KTKloss (CV-6), AlanTinka (Liberty), `hellomynameis.jeffz`, display name JZHU (Fletcher). Each glb's `asset.extras` agrees with its sidecar: `KTKloss (https://sketchfab.com/KTKloss)`, `AlanTinka (https://sketchfab.com/AlanTinka)`, `JZHU (https://sketchfab.com/hellomynameis.jeffz)`, all `CC-BY-4.0`.
- **Raw inputs** (main checkout, `content/models/candidates/`):

| File | Bytes | sha256 |
| --- | --- | --- |
| `enterprise-cv6.glb` | 939,492 | `74a85f09b7fb3d79af14efe38924284ad3dd23fce9f1846c839a36d72edfb515` |
| `fletcher-dd.glb` | 2,279,920 | `847a5fe51a34b7bc1caba03dbebb28d310789f3f9b0ff409e1ff9cee802de127` |
| `liberty-ship.glb` | 12,936,060 | `d20e2d2719dd8e6a4175658c36ba5173ca873911d2c44856225ae34e634871ad` |

- **`models:inspect`:** the CV-6 is 1 mesh, 1 material (`Material.001`, metalness 0), no textures, 15,339 triangles, source bounds [−2.468, 0, −17.894] to [2.507, 6.633, 19.218]. The Liberty is 1 material (`DefaultMaterial`, metalness 1, `KHR_materials_specular`), 4 × 1024² PNG, 42,735 triangles, 10 UV sets. The Fletcher is 261 nodes, 146 meshes, 29 materials (`mesh`, `mesh1`, `mesh2` and `radar` BLEND), 3 × 1024² PNG (22,810 bytes as WebP), 43,316 triangles.
- **Orientation, confirmed by orthographic side and top renders read by eye:** all three bows point at +x after `normalize` (raked stems at +x; propellers and rudders at −x; the Liberty's ensign aft), and the CV-6's island is to starboard.
- **The fit, per ship** (the drafted pipeline; "normalized" means after `normalize`'s uniform scale):

| | `essex-cv` (CV-6) | `fletcher-dd` (Fletcher) | `type-b-maru` (Liberty) |
| --- | --- | --- | --- |
| Source forward extent; `normalize` scale | 37.112 units; 7.1621 m/unit | 10.0487 units; 11.4244 m/unit | 0.14067 units; 796.17 m/unit |
| `normalize.origin` (source) | [0, 0, 0.6621] | [0.0021, 0, 0] | [−0.0003, 0.0075, 0] |
| Fit | deck: `rx` 1.0123, `ry` 0.9523, `shiftX` +1.25 m; `sx` 7.2504, `sy` 6.8207 m/unit; **`sy/sx` 0.9407** | hull | hull |
| Lateral k (0.85 to 1.25) | **`kWaterline` 1.0802, `kDeck` 1.2147** | **1.0893** | **1.1042** |
| Waterline beam, section at y = 0.1 m | 3.6135 units → 28.32 m (beamM 28.3) | 11.016 m → 12.00 m | 14.309 m → 15.80 m |
| Widest beam up to the deck + 3 m, after k | (flight deck 32.90 m) | 13.25 m at y 3.85 | 18.61 m at y 7.85 |
| Overall length vs `lengthM` | **269.08 m, +1.23%** (limit ±3%) | 114.80 m, 0.00% | 112.00 m, 0.00% |
| Deck vs Plan 8 | plane **17.000 m**; length 263.0 m (+0.11%); width 32.896 m | main deck **3.41 m** vs 6 (±3) | main deck **4.17 m** vs 6 (±3) |
| Waterline / keel | flat base at 0; skirt to −3 | keel −3.885 m; antifouling top at midships 0.0000 | keel **−5.348 m** |
| Bow check | island mean z **+14.64 m** (starboard) | narrow-end **0.210** | narrow-end **0.938** (reversed ≈1.066): pinned |
| `SmokeOrigin` (fitted m); surface below | [6, 32.5, 15]; funnel top 32.05 | [8.5, 15, 0] (forward funnel); 14.79 | [−1, 15, 0]; 13.85 |
| Built: bytes / triangles / draws / textures | **671,660** / 15,465 / 5 / 0 | **1,782,996** / 43,316 / 9 / 2 | **2,900,088** / 42,735 / 1 / 3 |
| Budget (spec §7) | 1,500,000 / 60,000 / 8 | 3,000,000 / 45,000 / 12 | 4,000,000 / 45,000 / 4 |
| Materials after `shipMaterials` | `ship:` hull, deck, flightDeck, superstructure, boot (the skirt, 126 triangles) | `ship:` hull, deck, antifouling, boot, fitting; `mesh`, `mesh1`, `mesh2`, `radar` MASK | `DefaultMaterial` (kept, metalness 0) |

- **The CV-6's deck grid** (2 m cells over 262.7 × 32.9 m, 2,096 cells, compared with 17 m): **96.46%** of inner cells within ±0.15 m (limit ≥ 95%); 93.18% of all cells; **0** centerline or trap-lane misses; **1.86%** below the deck, all in the tapered corners; the tallest fitting outside the island **0.40 m** (limit 0.5). The island's starboard box is x −29.3 to +43.2 m, z +7.4 to +22.1 m; its top is 45.2 m, 28.2 m above the deck. Its inboard face, first geometry more than 0.5 m above the deck out from the centerline: 13.4 m at x −28 to −16; 9.8 to 10.1 m at x −8 to −2; **11.0 m** along the main island, x 0 to +22; **7.5 m at x +32**; 12.4 to 16.4 m farther forward. The trap lane half-width that leaves it clear: **9.25 m**.
- **The heaviest scenario** (deck-quals and free-flight: one carrier, two destroyers) comes to 15,465 + 2 × 43,316 = **102,097** ship triangles.
- **Costs:** the three-ship build took about 1.3 s of wall time and peaked at 366 MB RSS. `tsc --noEmit` took 8.9 s at 735 MB. `npx vite build` took 3.4 s.

## Review Focus

Five things the spec implies but no step of it tests. Each one has a test in the task that owns the code.

1. **Switching between two scenarios that draw the same ship models** (free-flight and deck-quals both carry a CV-6 and two Fletchers). Each glb must be parsed once, nothing still drawn may be freed, and a model view must never be walked by `disposeMeshTree`. Task 7.
2. **A ship model that fails at runtime:** a 404 or an unparseable file, a glb missing `SmokeOrigin` (a carrier's missing `TrapBand` takes the same `instance.node` throw), an unregistered id, or `"constructor"`. The ship draws its boxes, exactly one `validationErrors` line names the ship and the model, and the half-acquired instance is released. Task 6.
3. **Plan 8 moves the deck or the trap zone after S1 ships.** Tier 1 must fail against the committed glb and name the quantity, rather than pass on a stale model. Task 1 (the pure case) and Task 4 (the committed file).
4. **A `models:build` where one ship fails its fit, or a raw input is missing.** Nothing is written for that ship, the log names it and why, the others still build, and the frozen Wildcat is skipped. Task 2, and Task 3's hash check.
5. **A model ship sinking.** It rolls about its keel (not a bow-down trim), and its tallest mast is under water before `root` hides. The same holds for the boxes. Task 5.

---

## File structure

| File | Status | Responsibility |
| --- | --- | --- |
| `src/render/scene/shipPalette.ts` | create | `SHIP_ROLES`, `SHIP_PALETTES`, `SHIP_ROUGHNESS`, `linearFactor` |
| `src/render/scene/shipFit.ts` | create | the pure measurements, the fit, the deck grid, the skirt, `fitProblems`, `residualProblems` |
| `tests/render/shipFixtures.ts`, `tests/render/shipFit.test.ts` | create | synthetic hulls; a pass and a fail for every tolerance |
| `tools/models/manifest.ts` | modify | the `ship` block and its rules |
| `tools/models/stages/shipFit.ts` | create | `documentSoup`, `shipFitStage`, `addShipMarkers`, `SMOKE_REACH_M` |
| `tools/models/stages/shipMaterials.ts` | create | `shipMaterials`, `roleMaterial` |
| `tools/models/build.ts` | modify | the ship stages in `runPipeline`, ship checks, the per-entry catch |
| `tests/tools/models/shipStages.test.ts` | create | the schema rules, the stages, `runBuild` |
| `tools/models/entries/{essex-cv,fletcher-dd,type-b-maru}.json` | create | the three entries |
| `content/ships/{essex-cv,fletcher-dd,type-b-maru}.glb` | create (built) | the committed models |
| `ASSETS.md` | modify | three rows, a provenance paragraph, the Fletcher's candidate row removed |
| `tests/tools/shipModels.test.ts` | create | Tier 1 on the committed glbs |
| `tests/build/dist.test.ts` | modify | the ship glbs reach `dist/` whole |
| `src/render/scene/ship.ts` | modify | `ShipView`, `createShipView`, the list fix, the sink depth, `probeShipSurface` |
| `src/sim/world/ships.ts`, `content/ships/*.json` | modify | the optional `view` block |
| `src/render/content.ts` | modify | `shipModelPath`, `shipModelUrl` |
| `src/render/scene/shipModels.ts` | create | `SHIP_MODELS`, `shipModelUrlFor`, `LoadShipView`, `makeShipViewLoader`, `loadRegisteredShipView` |
| `tests/render/ship.test.ts`, `tests/render/shipModels.test.ts`, `tests/sim/world/ships.test.ts` | modify, create, modify | per task |
| `src/render/scenarioEntities.ts`, `src/render/main.ts`, `src/render/diagnostics.ts` | modify | ships through the loader; `shipModels`, `shipDeckProbe` |
| `src/render/hangar/models.ts`, `src/render/hangar/main.ts` | modify | the Hangar's ships through the loader |
| `tests/render/scenarioEntities.test.ts`, `tests/render/hangar/models.test.ts` | modify | ship stubs, and the new cases |
| `src/render/modelCredits.ts`, `src/render/modelCreditsIndex.ts`, `src/render/legend.ts`, `tests/render/modelCredits.test.ts` | create, modify | the in-app models credit |
| `tests/e2e/ships.spec.ts`, `tests/e2e/deckQuals.spec.ts` | create, modify | Tier 2 |
| `docs/handoff/`, master spec §15, `README.md`, visual-realism spec §3.3, Hangar spec §12 | create, modify | Task 10 |

---

### Task 1: The palette and the pure fit module

**Files:**
- Create: `src/render/scene/shipPalette.ts`, `src/render/scene/shipFit.ts`
- Test: `tests/render/shipFixtures.ts`, `tests/render/shipFit.test.ts`

**Interfaces:**
- Consumes: `boxArrays`, `V3` from `tests/tools/models/fixtures.ts` (Z1).
- Produces:
  - `shipPalette.ts`: `SHIP_ROLES` (`'hull' | 'deck' | 'flightDeck' | 'boot' | 'antifouling' | 'superstructure' | 'fitting'`), `type ShipRole`, `SHIP_PALETTES` (`{ 'usn-1944': Record<ShipRole, number> }`), `type ShipPaletteId`, `SHIP_PALETTE_IDS`, `SHIP_ROUGHNESS` (0.8), `linearFactor(hex): [r, g, b, 1]`.
  - `shipFit.ts`: `TriangleSoup { positions: Float32Array; indices: Uint32Array }`, `FitSpec` (the ShipSpec fields a fit reads), `TOLERANCE`, `SKIRT_BOTTOM_M` (−3), `PINNED_NARROW_END_TOL` (0.03), `UP_NY` (0.9), `PLANE_TOL_M` (0.3), `WATERLINE_SECTION_M` (0.1), `DECK_SLICE_M`, `DECK_SLICE_MIN_M`, `triangleCount`, `triangleNormal`, `bounds`, `percentile`, `dominantUpPlane`, `sectionAt`, `sectionBeam`, `waterlineBeam`, `narrowEndRatio`, `planeSamples`, `deckExtent`, `islandOf`, `ShipFit { shiftX, rx, ry, kWaterline, kDeck, deckY }`, `lateralK`, `applyFit(positions, normals | null, fit)`, `deckFit(soup, spec): ShipFit`, `hullFit(soup, spec): ShipFit`, `createHeightProbe(soup): (x, z) => number | null`, `DeckGridReport`, `deckGrid`, `trapLaneHalfWidth`, `surfaceBelow`, `skirtOutline`, `skirtWall`, `BowCheck`, `FitOptions { fit, kind, bow, keelM? }`, `FitMeasures`, `fitProblems(soup, spec, opts): { problems: string[]; measures: FitMeasures }`, `residualProblems(fit, { fit }): string[]`.
  - Test helpers: `boxSoup`, `prismSoup`, `CARRIER`, `ESCORT`, `carrierBoxes(opts)`, `escortPrism(opts)`.

The module is pure: typed arrays in, numbers out, no three.js and no DOM, so both the build (Node) and Tier 1 can run it. `FitSpec` is a structural subset of `ShipSpec`, so nothing here imports `src/sim/`.

- [x] **Step 1: Write the fixtures and the failing test.**

`tests/render/shipFixtures.ts`:

```ts
// tests/render/shipFixtures.ts
import type { FitSpec, TriangleSoup } from '../../src/render/scene/shipFit.js'
import { boxArrays, type V3 } from '../tools/models/fixtures.js'

/** Closed boxes as one soup, each wound outward. */
export function boxSoup(boxes: readonly [V3, V3][]): TriangleSoup {
  const positions: number[] = [], indices: number[] = []
  for (const [min, max] of boxes) {
    const b = boxArrays(min, max)
    const base = positions.length / 3
    positions.push(...b.positions)
    indices.push(...b.indices.map((i) => i + base))
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) }
}

/** A convex (x, z) outline extruded from `bottom` to `top`: walls plus fan-triangulated caps, wound outward. */
export function prismSoup(outline: readonly [number, number][], bottom: number, top: number): TriangleSoup {
  const positions: number[] = [], indices: number[] = []
  const n = outline.length
  for (const [x, z] of outline) positions.push(x, bottom, z)
  for (const [x, z] of outline) positions.push(x, top, z)
  // Winding: for an outline that runs +x along its -z side first (escortPrism's), these face outward;
  // tests/render/shipFit.test.ts checks every triangle.
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    indices.push(i, n + j, j, i, n + i, n + j)
  }
  for (let i = 1; i < n - 1; i++) {
    indices.push(n, n + i + 1, n + i) // top, facing +y
    indices.push(0, i, i + 1) // bottom, facing -y
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) }
}

/** essex-cv's figures (content/ships/essex-cv.json), as a FitSpec. */
export const CARRIER: FitSpec = {
  id: 'test-cv', role: 'carrier', lengthM: 265.8, beamM: 28.3, deckHeightM: 17,
  flightDeck: { lengthM: 262.7, widthM: 32.9, heightM: 17 },
  trapZone: { fromSternM: 30, toSternM: 130 },
}

/** fletcher-dd's figures, as a FitSpec. */
export const ESCORT: FitSpec = { id: 'test-dd', role: 'escort', lengthM: 114.8, beamM: 12, deckHeightM: 6 }

/**
 * A carrier in `normalize`'s output frame, fitted to nothing yet: a 260 x 26 m
 * hull 15 m high, a 256 x 30 m flight deck slab topped at 16 m, and an island
 * to starboard (x 0..40, z 12..15) standing 24 m over the deck. `deckFit`
 * maps it onto CARRIER with rx 1.0262, ry 1.0625, kWaterline 1.0607 and kDeck 1.0690.
 */
export function carrierBoxes(opts: { islandZ?: [number, number]; deckTop?: number; hullX?: number; extra?: [V3, V3][] } = {}): TriangleSoup {
  const [iz0, iz1] = opts.islandZ ?? [12, 15]
  const top = opts.deckTop ?? 16, hx = opts.hullX ?? 130
  return boxSoup([
    [[-hx, 0, -13], [hx, top - 1, 13]],
    [[-128, top - 1, -15], [128, top, 15]],
    [[0, top, iz0], [40, top + 24, iz1]],
    ...(opts.extra ?? []),
  ])
}

/**
 * A full hull in `normalize`'s output frame: a planform 114.8 m long, 11 m
 * wide at the stern and tapering to 2 m at the bow (+x), keel at -4, main
 * deck at `deck` (6 unless given). `bowAt: -1` builds it reversed.
 */
export function escortPrism(opts: { deck?: number; keel?: number; bowAt?: 1 | -1 } = {}): TriangleSoup {
  const s = opts.bowAt ?? 1
  const outline: [number, number][] = s === 1
    ? [[-57.4, -5.5], [30, -5.5], [57.4, -1], [57.4, 1], [30, 5.5], [-57.4, 5.5]]
    : [[57.4, 5.5], [-30, 5.5], [-57.4, 1], [-57.4, -1], [-30, -5.5], [57.4, -5.5]]
  return prismSoup(outline, opts.keel ?? -4, opts.deck ?? 6)
}
```

`tests/render/shipFit.test.ts`:

```ts
// tests/render/shipFit.test.ts
import { describe, expect, it } from 'vitest'
import {
  applyFit, bounds, deckExtent, deckFit, deckGrid, dominantUpPlane, fitProblems, hullFit, islandOf, narrowEndRatio,
  percentile, residualProblems, sectionBeam, skirtOutline, skirtWall, SKIRT_BOTTOM_M, surfaceBelow, trapLaneHalfWidth,
  triangleNormal, waterlineBeam, type FitOptions, type ShipFit, type TriangleSoup,
} from '../../src/render/scene/shipFit.js'
import { boxSoup, CARRIER, carrierBoxes, ESCORT, escortPrism } from './shipFixtures.js'

/** `m` with `fit` applied, as a new soup. */
function fitted(m: TriangleSoup, fit: ShipFit): TriangleSoup {
  const positions = new Float32Array(m.positions)
  applyFit(positions, null, fit)
  return { positions, indices: m.indices }
}

const CARRIER_OPTS: FitOptions = { fit: 'deck', kind: 'full-hull', bow: 'island-starboard', keelM: 0 }
const ESCORT_OPTS: FitOptions = { fit: 'hull', kind: 'full-hull', bow: 'narrow-end', keelM: -4 }

describe('measures', () => {
  it('percentile is nearest-rank and refuses nothing', () => {
    expect(percentile([5, 1, 3, 2, 4], 0)).toBe(1)
    expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3)
    expect(percentile([5, 1, 3, 2, 4], 100)).toBe(5)
    expect(() => percentile([], 50)).toThrow(/nothing/)
  })

  it('the escort prism is wound outward, so its caps and walls face away from its center', () => {
    const m = escortPrism()
    for (let t = 0; t < m.indices.length / 3; t++) {
      const n = triangleNormal(m, t)
      expect(n.nx * n.cx + n.ny * (n.cy - 1) + n.nz * n.cz, `triangle ${t}`).toBeGreaterThan(0)
    }
  })

  it('sectionBeam reads the exact width where a plane cuts the hull, however sparse its vertices', () => {
    const m = escortPrism()
    expect(sectionBeam(m, 0.1).width).toBeCloseTo(11, 6)
    // In the bow taper (x 30..57.4 narrows 11 -> 2): at x 57.4 the section is 2 m wide.
    expect(sectionBeam(m, 0.1, 57, 57.4).width).toBeCloseTo(2 + (9 * 0.4) / 27.4, 3)
    expect(waterlineBeam(m)).toBeCloseTo(11, 6)
    expect(() => waterlineBeam(boxSoup([[[0, 1, 0], [1, 2, 1]]]))).toThrow(/waterline origin is wrong/)
  })

  it('dominantUpPlane finds the flight deck, and deckExtent its visible length, center and width', () => {
    const m = carrierBoxes()
    expect(dominantUpPlane(m, 3, 40, 0.1)).toBeCloseTo(16, 6)
    const d = deckExtent(m, 16)
    expect(d.length).toBeCloseTo(256, 6)
    expect(d.centerX).toBeCloseTo(0, 6)
    expect(d.medianWidth).toBeCloseTo(30, 2)
  })

  it('narrowEndRatio reads a fine bow as < 0.9 and the same hull reversed as > 1', () => {
    expect(narrowEndRatio(escortPrism())).toBeLessThan(0.9)
    expect(narrowEndRatio(escortPrism({ bowAt: -1 }))).toBeGreaterThan(1)
  })

  it('islandOf is to starboard for the fixture and to port when mirrored', () => {
    expect(islandOf(carrierBoxes(), 16).meanZ).toBeGreaterThan(0)
    expect(islandOf(carrierBoxes({ islandZ: [-15, -12] }), 16).meanZ).toBeLessThan(0)
  })

  it('surfaceBelow finds the first surface at or under a height, not the topmost', () => {
    const m = boxSoup([[[-1, 0, -1], [1, 1, 1]], [[-1, 10, -1], [1, 11, 1]]])
    expect(surfaceBelow(m, 0, 0, 5)).toBeCloseTo(1, 6)
    expect(surfaceBelow(m, 0, 0, 20)).toBeCloseTo(11, 6)
    expect(surfaceBelow(m, 5, 5, 20)).toBeNull()
  })
})

describe('deckFit and hullFit', () => {
  it('deckFit maps the fixture onto the Essex rectangle: deck length, height, beams and center', () => {
    const fit = deckFit(carrierBoxes(), CARRIER)
    expect(fit.rx).toBeCloseTo(262.7 / 256, 6)
    expect(fit.ry).toBeCloseTo(17 / 16, 6)
    expect(fit.kWaterline).toBeCloseTo(28.3 / (26 * fit.rx), 6)
    expect(fit.kDeck).toBeCloseTo(32.9 / (30 * fit.rx), 3)
    expect(fit.shiftX).toBeCloseTo(0, 6)
    expect(residualProblems(fit, CARRIER_OPTS)).toEqual([])
  })

  it('hullFit keeps length and height and scales the beam to beamM at the waterline', () => {
    const fit = hullFit(escortPrism(), ESCORT)
    expect(fit).toMatchObject({ shiftX: 0, rx: 1, ry: 1 })
    expect(fit.kWaterline).toBeCloseTo(12 / 11, 6)
    expect(fit.kDeck).toBe(fit.kWaterline)
  })

  it('applyFit keeps every normal perpendicular to its warped triangle, through the lateral ramp', () => {
    const fit: ShipFit = { shiftX: 2, rx: 1.02, ry: 0.95, kWaterline: 1.05, kDeck: 1.22, deckY: 17 }
    // A tilted triangle inside the ramp (0 < y' < 17), well off the centerline.
    const p = new Float32Array([10, 4, 6, 12, 9, 9, 11, 6, 13])
    const ux = p[3]! - p[0]!, uy = p[4]! - p[1]!, uz = p[5]! - p[2]!, vx = p[6]! - p[0]!, vy = p[7]! - p[1]!, vz = p[8]! - p[2]!
    let n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]
    const len = Math.hypot(n[0]!, n[1]!, n[2]!)
    n = n.map((v) => v / len)
    const normals = new Float32Array([...n, ...n, ...n])
    applyFit(p, normals, fit)
    // Each vertex's normal against the warped surface's local tangents: finite differences of the map.
    for (let v = 0; v < 3; v++) {
      const at = (dx: number, dy: number, dz: number): number[] => {
        const q = new Float32Array([
          [10, 12, 11][v]! + dx, [4, 9, 6][v]! + dy, [6, 9, 13][v]! + dz,
        ])
        applyFit(q, null, fit)
        return Array.from(q)
      }
      const base = at(0, 0, 0), e = 1e-2
      for (const [dx, dy, dz] of [[ux, uy, uz], [vx, vy, vz]]) {
        const moved = at(dx! * e, dy! * e, dz! * e)
        const t = moved.map((c, k) => c - base[k]!)
        const dot = t[0]! * normals[3 * v]! + t[1]! * normals[3 * v + 1]! + t[2]! * normals[3 * v + 2]!
        expect(Math.abs(dot) / Math.hypot(t[0]!, t[1]!, t[2]!)).toBeLessThan(1e-3)
      }
      expect(Math.hypot(normals[3 * v]!, normals[3 * v + 1]!, normals[3 * v + 2]!)).toBeCloseTo(1, 5)
    }
  })
})

describe('fitProblems: a pass, and a failure for every tolerance (spec §4.4)', () => {
  const carrierFit = (m: TriangleSoup): TriangleSoup => fitted(m, deckFit(m, CARRIER))

  it('the fitted carrier fixture passes, and reports its grid', () => {
    const { problems, measures } = fitProblems(carrierFit(carrierBoxes()), CARRIER, CARRIER_OPTS)
    expect(problems).toEqual([])
    expect(measures.grid!.cells).toBe(131 * 16)
    expect(measures.grid!.innerOnDeck).toBe(1)
    expect(measures.deckPlaneM).toBeCloseTo(17, 4)
    expect(measures.trapLaneHalfWidthM).toBeCloseTo(0.45 * 32.9, 6)
  })

  it('the fitted escort fixture passes', () => {
    const m = escortPrism()
    expect(fitProblems(fitted(m, hullFit(m, ESCORT)), ESCORT, ESCORT_OPTS).problems).toEqual([])
  })

  const cases: [string, () => string[], RegExp][] = [
    ['a mirrored carrier', () => fitProblems(carrierFit(carrierBoxes({ islandZ: [-15, -12] })), CARRIER, CARRIER_OPTS).problems, /island mean z .* not to starboard/],
    ['a kDeck over the cap', () => residualProblems({ ...deckFit(carrierBoxes(), CARRIER), kDeck: 1.3 }, CARRIER_OPTS), /kDeck 1\.3000 outside 0\.85\.\.1\.25/],
    ['a deck too low for sy/sx', () => residualProblems(deckFit(carrierBoxes({ deckTop: 12 }), CARRIER), CARRIER_OPTS), /sy\/sx 1\.3\d+ outside/],
    ['a hull far longer than its deck', () => fitProblems(carrierFit(carrierBoxes({ hullX: 140 })), CARRIER, CARRIER_OPTS).problems, /overall length .* limit ±3%/],
    ['a fitting on the deck outside the island', () => fitProblems(carrierFit(carrierBoxes({ extra: [[[60, 16, -2], [62, 17, 2]]] })), CARRIER, CARRIER_OPTS).problems, /fitting stands 1\.\d+ m above/],
    ['an obstruction on the centerline in the trap zone', () => fitProblems(carrierFit(carrierBoxes({ extra: [[[-60, 16, -1], [-58, 20, 1]]] })), CARRIER, CARRIER_OPTS).problems, /centerline or trap-lane cells are not on the deck/],
    ['a hole in the deck edge amidships', () => fitProblems(carrierFit(boxSoup([[[-130, 0, -13], [130, 15, 13]], [[-128, 15, -15], [20, 16, 15]], [[40, 15, -15], [128, 16, 15]], [[20, 15, -11], [40, 16, 11]], [[0, 16, 12], [15, 40, 15]]])), CARRIER, CARRIER_OPTS).problems, /below-deck cells outside the tapered corners/],
    ['a moved deck (Plan 8 raises it to 18 m)', () => fitProblems(carrierFit(carrierBoxes()), { ...CARRIER, deckHeightM: 18, flightDeck: { ...CARRIER.flightDeck!, heightM: 18 } }, CARRIER_OPTS).problems, /deck plane at 17\.000 m vs flightDeck\.heightM 18/],
    ['a reversed escort', () => { const m = escortPrism({ bowAt: -1 }); return fitProblems(fitted(m, hullFit(m, ESCORT)), ESCORT, ESCORT_OPTS).problems }, /narrow-end ratio .* bow is not at \+x/],
    ['a pinned ratio that no longer matches', () => { const m = escortPrism({ bowAt: -1 }); return fitProblems(fitted(m, hullFit(m, ESCORT)), ESCORT, { ...ESCORT_OPTS, bow: { pinnedNarrowEnd: 0.2, evidence: 'test' } }).problems }, /pinned at 0\.2 ± 0\.03 \(test\): the model was reversed/],
    ['a main deck 4 m off', () => { const m = escortPrism({ deck: 10 }); return fitProblems(fitted(m, hullFit(m, ESCORT)), ESCORT, ESCORT_OPTS).problems }, /main deck at 10\.00 m vs deckHeightM 6/],
    ['a moved waterline (keel 1 m deeper)', () => { const m = escortPrism({ keel: -5 }); return fitProblems(fitted(m, hullFit(m, ESCORT)), ESCORT, ESCORT_OPTS).problems }, /keel at y -5\.000, pinned at -4/],
    ['a hull the wrong length', () => { const m = escortPrism(); return fitProblems(m, { ...ESCORT, lengthM: 120 }, ESCORT_OPTS).problems }, /hull length 114\.80 m vs lengthM 120/],
    ['a lateral k out of range', () => residualProblems(hullFit(escortPrism(), { ...ESCORT, beamM: 16 }), ESCORT_OPTS), /kWaterline 1\.45\d+ outside/],
    ['a waterline model with no skirt', () => { const m = escortPrism({ keel: 0 }); return fitProblems(fitted(m, hullFit(m, ESCORT)), ESCORT, { ...ESCORT_OPTS, kind: 'waterline' }).problems }, /skirt bottom at y 0\.000, expected -3/],
  ]
  for (const [name, run, pattern] of cases) {
    it(`fails ${name}, naming the quantity`, () => {
      expect(run().join('; ')).toMatch(pattern)
    })
  }
})

describe('deckGrid, trapLaneHalfWidth', () => {
  it('narrows the trap lane to 1 m inboard of anything in the trap span, and counts centerline cells', () => {
    const fit = deckFit(carrierBoxes(), CARRIER)
    const obstructed = fitted(carrierBoxes({ extra: [[[-60, 16, 9], [-58, 20, 12]]] }), fit)
    expect(trapLaneHalfWidth(obstructed, CARRIER)).toBeLessThan(9 * fit.rx * fit.kDeck - 1 + 0.5)
    const island = islandOf(obstructed, 17)
    const g = deckGrid(obstructed, CARRIER, trapLaneHalfWidth(obstructed, CARRIER), island)
    expect(g.laneMisses).toBe(0)
  })
})

describe('the skirt (spec §4.5)', () => {
  it('outlines the base as a convex hull and walls it from 0 to -3, every face outward', () => {
    const m = boxSoup([[[-10, 0, -2], [10, 5, 2]], [[-4, 5, -1], [4, 8, 1]]])
    const outline = skirtOutline(m)
    expect(outline).toHaveLength(4)
    const wall = skirtWall(outline, 0, SKIRT_BOTTOM_M)
    const soup = { positions: wall.positions, indices: wall.indices }
    expect(wall.indices.length / 3).toBe(8)
    expect(bounds(soup).min[1]).toBe(-3)
    for (let t = 0; t < 8; t++) {
      const n = triangleNormal(soup, t)
      expect(n.nx * n.cx + n.nz * n.cz, `face ${t} faces outward`).toBeGreaterThan(0)
      const v = wall.indices[3 * t]!
      expect(n.nx * wall.normals[3 * v]! + n.nz * wall.normals[3 * v + 2]!, `face ${t} normal agrees with its winding`).toBeGreaterThan(0.99)
    }
  })
})
```

- [x] **Step 2: Run it to see it fail.**

Run: `npx vitest run tests/render/shipFit.test.ts --maxWorkers=2`
Expected: FAIL. `src/render/scene/shipFit.js` does not resolve.

- [x] **Step 3: Implement.** `src/render/scene/shipPalette.ts`:

```ts
// src/render/scene/shipPalette.ts
/**
 * Ship paint, one color per palette role (ship-models spec §5.1). The boxes
 * in ship.ts and the models built by tools/models/stages/shipMaterials.ts both
 * read this, so a ship looks the same color whichever path draws it. The
 * values are a render choice, not a sourced Measure: `hull` and `flightDeck`
 * are the two colors ship.ts drew before S1, which photoreal Task 12's deck
 * luminance gate (tests/e2e/deckQuals.spec.ts) measured at 0.64 of the
 * runway on 2026-09-25; tune inside that gate, never re-baseline it.
 */
export const SHIP_ROLES = ['hull', 'deck', 'flightDeck', 'boot', 'antifouling', 'superstructure', 'fitting'] as const
export type ShipRole = (typeof SHIP_ROLES)[number]

export const SHIP_PALETTES = {
  'usn-1944': {
    hull: 0x5c6670,
    deck: 0x3b3f44,
    flightDeck: 0x3b3f44,
    boot: 0x1e2124,
    antifouling: 0x5b2a24,
    superstructure: 0x5c6670,
    fitting: 0x4b535b,
  },
} as const satisfies Record<string, Record<ShipRole, number>>

export type ShipPaletteId = keyof typeof SHIP_PALETTES
export const SHIP_PALETTE_IDS = Object.keys(SHIP_PALETTES) as ShipPaletteId[]

/** Every role's roughness; metalness is always 0 (spec §5.1-5.2). */
export const SHIP_ROUGHNESS = 0.8

/** An sRGB hex color as a LINEAR glTF baseColorFactor, the conversion three.js applies to `color: 0x...`. */
export function linearFactor(hex: number): [number, number, number, number] {
  const lin = (c: number): number => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
  return [lin((hex >> 16) & 0xff), lin((hex >> 8) & 0xff), lin(hex & 0xff), 1]
}
```

`src/render/scene/shipFit.ts`:

```ts
// src/render/scene/shipFit.ts
/**
 * Fitting a ship model to the ShipSpec the sim is authoritative for (ship-models
 * spec §4). Pure: typed arrays in, numbers and typed arrays out. No DOM, no
 * three.js, no loader. `tools/models/stages/shipFit.ts` calls it at build time
 * and `tests/tools/shipModels.test.ts` calls it again on the COMMITTED glb
 * against the LIVE content/ships/<id>.json, so a moved deck fails the suite.
 *
 * Frame: meters, +x bow, +y up, +z starboard, waterline at y = 0, which is the
 * frame `normalize` bakes (A6M Zero spec §6.1) and the one `createShipMesh`
 * has always drawn in.
 */

/** Every triangle of a model, flattened into one frame. */
export interface TriangleSoup {
  /** xyz per vertex. */
  readonly positions: Float32Array
  /** Three vertex indices per triangle. */
  readonly indices: Uint32Array
}

/** The ShipSpec fields a fit reads. A structural subset, so this module does not import src/sim. */
export interface FitSpec {
  readonly id: string
  readonly role: string
  readonly lengthM: number
  readonly beamM: number
  readonly deckHeightM: number
  readonly flightDeck?: { readonly lengthM: number; readonly widthM: number; readonly heightM: number } | undefined
  readonly trapZone?: { readonly fromSternM: number; readonly toSternM: number } | undefined
}

/** Design constants (spec §4.4). A change here is a design change: say so in the commit. */
export const TOLERANCE = {
  hullLengthFrac: 0.005,
  deckLengthFrac: 0.005,
  overallLengthFrac: 0.03,
  kMin: 0.85,
  kMax: 1.25,
  syOverSxMin: 0.85,
  syOverSxMax: 1.15,
  mainDeckM: 3,
  deckCellM: 0.15,
  deckCellShareMin: 0.95,
  edgeBandM: 2.5,
  belowDeckEndM: 45,
  belowDeckEdgeM: 4,
  fittingM: 0.5,
  narrowEndMax: 0.9,
} as const

/** Where the skirt ends, meters (spec §4.5). */
export const SKIRT_BOTTOM_M = -3

/** A pinned narrow-end ratio's tolerance: the Liberty reads 0.938 bow-forward and about 1.066 reversed (2026-09-25). */
export const PINNED_NARROW_END_TOL = 0.03

/** Up-facing: a unit normal whose y exceeds this (spec §5.1). */
export const UP_NY = 0.9
/** Half-height of the band a deck plane's triangles are gathered from, meters. */
export const PLANE_TOL_M = 0.3

const tri = (m: TriangleSoup, t: number): [number, number, number] => [m.indices[3 * t]!, m.indices[3 * t + 1]!, m.indices[3 * t + 2]!]
const px = (m: TriangleSoup, v: number): number => m.positions[3 * v]!
const py = (m: TriangleSoup, v: number): number => m.positions[3 * v + 1]!
const pz = (m: TriangleSoup, v: number): number => m.positions[3 * v + 2]!

export const triangleCount = (m: TriangleSoup): number => m.indices.length / 3

/** Area and unit normal of triangle `t` (counter-clockwise front face, glTF's winding). */
export function triangleNormal(m: TriangleSoup, t: number): { area: number; nx: number; ny: number; nz: number; cx: number; cy: number; cz: number } {
  const [a, b, c] = tri(m, t)
  const ux = px(m, b) - px(m, a), uy = py(m, b) - py(m, a), uz = pz(m, b) - pz(m, a)
  const vx = px(m, c) - px(m, a), vy = py(m, c) - py(m, a), vz = pz(m, c) - pz(m, a)
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
  const len = Math.hypot(nx, ny, nz)
  return {
    area: len / 2,
    nx: len ? nx / len : 0, ny: len ? ny / len : 0, nz: len ? nz / len : 0,
    cx: (px(m, a) + px(m, b) + px(m, c)) / 3, cy: (py(m, a) + py(m, b) + py(m, c)) / 3, cz: (pz(m, a) + pz(m, b) + pz(m, c)) / 3,
  }
}

export function bounds(m: TriangleSoup): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < m.positions.length; i += 3) {
    for (let k = 0; k < 3; k++) { const v = m.positions[i + k]!; if (v < min[k]!) min[k] = v; if (v > max[k]!) max[k] = v }
  }
  return { min, max }
}

/** The `p`th percentile (0..100) of `values`, nearest-rank. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) throw new Error('percentile of nothing')
  const s = [...values].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))]!
}

/**
 * The height of the largest up-facing surface between `minY` and `maxY`:
 * up-facing triangle area binned by centroid height in `binM` bins, the
 * heaviest bin's area-weighted mean height. A carrier's flight deck, a
 * freighter's main deck.
 */
export function dominantUpPlane(m: TriangleSoup, minY: number, maxY: number, binM: number): number {
  const area = new Map<number, number>(), moment = new Map<number, number>()
  for (let t = 0; t < triangleCount(m); t++) {
    const n = triangleNormal(m, t)
    if (n.ny <= UP_NY || n.cy < minY || n.cy > maxY) continue
    const bin = Math.floor(n.cy / binM)
    area.set(bin, (area.get(bin) ?? 0) + n.area)
    moment.set(bin, (moment.get(bin) ?? 0) + n.area * n.cy)
  }
  let best: number | null = null
  for (const [bin, a] of area) if (best === null || a > area.get(best)!) best = bin
  if (best === null) throw new Error(`no up-facing surface between y ${minY} and ${maxY}`)
  return moment.get(best)! / area.get(best)!
}

/**
 * Where a horizontal plane at height `y` cuts the model: one segment per
 * triangle that straddles it, as [x0, z0, x1, z1]. Exact, however sparse the
 * mesh's vertex rows are (a vertex band misses a low-poly hull entirely).
 */
export function sectionAt(m: TriangleSoup, y: number): number[][] {
  const out: number[][] = []
  for (let t = 0; t < triangleCount(m); t++) {
    const vs = tri(m, t)
    const pts: number[] = []
    for (let e = 0; e < 3; e++) {
      const a = vs[e]!, b = vs[(e + 1) % 3]!
      const ya = py(m, a) - y, yb = py(m, b) - y
      if ((ya < 0 && yb >= 0) || (yb < 0 && ya >= 0)) {
        const s = ya / (ya - yb)
        pts.push(px(m, a) + s * (px(m, b) - px(m, a)), pz(m, a) + s * (pz(m, b) - pz(m, a)))
      }
    }
    if (pts.length === 4) out.push(pts)
  }
  return out
}

/** The section's lateral extent at height `y`, optionally only where x lies in [xLo, xHi]. */
export function sectionBeam(m: TriangleSoup, y: number, xLo = -Infinity, xHi = Infinity): { minZ: number; maxZ: number; width: number } {
  let minZ = Infinity, maxZ = -Infinity
  const take = (x: number, z: number): void => { if (x >= xLo && x <= xHi) { minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z) } }
  for (const [x0, z0, x1, z1] of sectionAt(m, y) as [number, number, number, number][]) {
    take(x0, z0); take(x1, z1)
    for (const xb of [xLo, xHi]) {
      if (Number.isFinite(xb) && (x0 - xb) * (x1 - xb) < 0) take(xb, z0 + ((xb - x0) / (x1 - x0)) * (z1 - z0))
    }
  }
  return { minZ, maxZ, width: maxZ > minZ ? maxZ - minZ : 0 }
}

/** The height at which "waterline beam" is read, meters: just above y = 0, where a waterline model's flat base meets its sides. */
export const WATERLINE_SECTION_M = 0.1

export function waterlineBeam(m: TriangleSoup): number {
  const w = sectionBeam(m, WATERLINE_SECTION_M).width
  if (!(w > 0)) throw new Error(`nothing crosses y = ${WATERLINE_SECTION_M} m: the waterline origin is wrong`)
  return w
}

/**
 * Spec §4.2's bow check for non-carriers: the widest half-beam in the forward
 * `frac` of the hull over the widest in the aft `frac`, read on sections at
 * `heights` above the waterline. A bow is finer than a stern, so a value over
 * 0.9 means the model is backward.
 */
export function narrowEndRatio(m: TriangleSoup, heights: readonly number[] = [0.1, 0.5, 1], frac = 0.05): number {
  const b = bounds(m)
  const len = b.max[0] - b.min[0]
  let fore = 0, aft = 0
  for (const y of heights) {
    const f = sectionBeam(m, y, b.max[0] - frac * len, b.max[0])
    const a = sectionBeam(m, y, b.min[0], b.min[0] + frac * len)
    if (f.width > 0) fore = Math.max(fore, Math.abs(f.minZ), Math.abs(f.maxZ))
    if (a.width > 0) aft = Math.max(aft, Math.abs(a.minZ), Math.abs(a.maxZ))
  }
  if (aft === 0) throw new Error('narrowEndRatio: no stern section at the given heights')
  return fore / aft
}

/**
 * Points where a vertical ray's TOPMOST hit lies within `tol` of `planeY`, on
 * a `stepM` grid: an area-uniform sample of the deck as the eye sees it from
 * above (the island hides the deck under it, as it does in the game).
 */
export function planeSamples(m: TriangleSoup, planeY: number, stepM = 0.5, tol = 0.15): { xs: number[]; zs: number[] } {
  const b = bounds(m)
  const probe = createHeightProbe(m)
  const xs: number[] = [], zs: number[] = []
  for (let x = b.min[0] + stepM / 2; x < b.max[0]; x += stepM) {
    for (let z = b.min[2] + stepM / 2; z < b.max[2]; z += stepM) {
      const y = probe(x, z)
      if (y !== null && Math.abs(y - planeY) <= tol) { xs.push(x); zs.push(z) }
    }
  }
  if (xs.length === 0) throw new Error(`no deck visible at y ${planeY}`)
  return { xs, zs }
}

/** The slice length `deckExtent` measures in, meters. */
export const DECK_SLICE_M = 0.5
/** A slice counts as deck when this much of it, across, is visible deck. */
export const DECK_SLICE_MIN_M = 2

/**
 * A deck's visible extent, from `planeSamples` on a 0.5 m grid: its length
 * is first to last `DECK_SLICE_M` slice holding at least `DECK_SLICE_MIN_M`
 * of visible deck across (so one stray sample far off cannot stretch it, and
 * a tapered end is not trimmed the way an area percentile trims it); its
 * center is that span's middle. Its width is the median over those slices of
 * each slice's visible edge-to-edge width at the slice's middle, with both
 * edges refined by bisection to 1 mm, so the 0.5 m grid does not quantize it.
 */
export function deckExtent(m: TriangleSoup, planeY: number): { length: number; centerX: number; medianWidth: number; minX: number; maxX: number } {
  const step = 0.5
  const probe = createHeightProbe(m)
  const onDeck = (x: number, z: number): boolean => { const y = probe(x, z); return y !== null && Math.abs(y - planeY) <= 0.15 }
  const { xs, zs } = planeSamples(m, planeY, step)
  const count = new Map<number, number>(), zlo = new Map<number, number>(), zhi = new Map<number, number>()
  xs.forEach((x, i) => {
    const s = Math.floor(x / DECK_SLICE_M)
    count.set(s, (count.get(s) ?? 0) + 1)
    zlo.set(s, Math.min(zlo.get(s) ?? Infinity, zs[i]!))
    zhi.set(s, Math.max(zhi.get(s) ?? -Infinity, zs[i]!))
  })
  const perSlice = (DECK_SLICE_M / step) * (DECK_SLICE_MIN_M / step)
  const deck = [...count.keys()].filter((s) => count.get(s)! >= perSlice).sort((a, b) => a - b)
  if (deck.length === 0) throw new Error(`no ${DECK_SLICE_M} m slice holds ${DECK_SLICE_MIN_M} m of visible deck at y ${planeY}`)
  const minX = deck[0]! * DECK_SLICE_M, maxX = (deck.at(-1)! + 1) * DECK_SLICE_M
  // Bisect from an on-deck z toward an off-deck z, 1 mm.
  const edge = (x: number, inZ: number, outZ: number): number => {
    let a = inZ, b = outZ
    while (Math.abs(b - a) > 0.001) { const c = (a + b) / 2; if (onDeck(x, c)) a = c; else b = c }
    return a
  }
  const widths = deck.map((s) => {
    const x = (s + 0.5) * DECK_SLICE_M
    const lo = zlo.get(s)!, hi = zhi.get(s)!
    const zLo = onDeck(x, lo) ? edge(x, lo, lo - step) : lo
    const zHi = onDeck(x, hi) ? edge(x, hi, hi + step) : hi
    return zHi - zLo
  })
  return { length: maxX - minX, centerX: (minX + maxX) / 2, minX, maxX, medianWidth: percentile(widths, 50) }
}

/**
 * Where a carrier's island is: the area-weighted mean z of every triangle
 * whose centroid is more than `aboveM` over the deck plane, and the xz box of
 * those on the starboard half. Spec §4.2: after the fit the island must be to
 * starboard (+z); a reversed or mirrored carrier puts it to port.
 */
export function islandOf(m: TriangleSoup, deckY: number, aboveM = 3): { meanZ: number; minX: number; maxX: number; minZ: number; maxZ: number } {
  let a = 0, az = 0
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (let t = 0; t < triangleCount(m); t++) {
    const n = triangleNormal(m, t)
    if (n.cy <= deckY + aboveM) continue
    a += n.area; az += n.area * n.cz
    if (n.cz <= 0) continue
    for (const v of tri(m, t)) {
      minX = Math.min(minX, px(m, v)); maxX = Math.max(maxX, px(m, v))
      minZ = Math.min(minZ, pz(m, v)); maxZ = Math.max(maxZ, pz(m, v))
    }
  }
  if (a === 0) throw new Error(`islandOf: nothing more than ${aboveM} m above the deck at ${deckY}`)
  return { meanZ: az / a, minX, maxX, minZ, maxZ }
}

/**
 * The residual fit applied after `normalize` (spec §4.3): translate x by
 * `shiftX`, scale x by `rx` and y by `ry`, and scale z by `rx * k(y')`, where
 * `k` runs linearly from `kWaterline` at y' = 0 to `kDeck` at y' = `deckY`
 * and holds outside that span. A hull fit is rx = ry = 1, shiftX = 0 and
 * kWaterline = kDeck.
 */
export interface ShipFit {
  readonly shiftX: number
  readonly rx: number
  readonly ry: number
  readonly kWaterline: number
  readonly kDeck: number
  /** Fitted meters: the height at which `k` reaches `kDeck`. */
  readonly deckY: number
}

export function lateralK(fit: ShipFit, y: number): number {
  const t = fit.deckY > 0 ? Math.min(1, Math.max(0, y / fit.deckY)) : 1
  return fit.kWaterline + (fit.kDeck - fit.kWaterline) * t
}

/** d k / d y' at `y` (0 outside the ramp). */
function lateralKSlope(fit: ShipFit, y: number): number {
  return fit.deckY > 0 && y > 0 && y < fit.deckY ? (fit.kDeck - fit.kWaterline) / fit.deckY : 0
}

/**
 * Applies `fit` to positions in place, and to normals by the inverse
 * transpose of the map's Jacobian, so a warped hull keeps its authored
 * shading. The map is x' = rx (x + shiftX), y' = ry y, z' = rx k(y') z.
 */
export function applyFit(positions: Float32Array, normals: Float32Array | null, fit: ShipFit): void {
  for (let v = 0; v < positions.length / 3; v++) {
    const x = positions[3 * v]!, y = positions[3 * v + 1]!, z = positions[3 * v + 2]!
    const y2 = fit.ry * y
    const k = lateralK(fit, y2)
    positions[3 * v] = fit.rx * (x + fit.shiftX)
    positions[3 * v + 1] = y2
    positions[3 * v + 2] = fit.rx * k * z
    if (normals) {
      const d = fit.rx * k
      const c = fit.rx * z * lateralKSlope(fit, y2) * fit.ry
      const nx = normals[3 * v]! / fit.rx
      const nz = normals[3 * v + 2]! / d
      const ny = normals[3 * v + 1]! / fit.ry - (c / (fit.ry * d)) * normals[3 * v + 2]!
      const len = Math.hypot(nx, ny, nz) || 1
      normals[3 * v] = nx / len; normals[3 * v + 1] = ny / len; normals[3 * v + 2] = nz / len
    }
  }
}

/** The fit for a carrier (`fit: "deck"`, spec §4.3), from normalized geometry. */
export function deckFit(m: TriangleSoup, spec: FitSpec): ShipFit {
  const fd = spec.flightDeck
  if (!fd) throw new Error(`${spec.id}: fit "deck" needs a flightDeck`)
  const b = bounds(m)
  const deckY0 = dominantUpPlane(m, b.max[1] * 0.2, b.max[1], 0.1)
  const d = deckExtent(m, deckY0)
  const rx = fd.lengthM / d.length
  const ry = fd.heightM / deckY0
  const wl = waterlineBeam(m)
  return { shiftX: -d.centerX, rx, ry, kWaterline: spec.beamM / (wl * rx), kDeck: fd.widthM / (d.medianWidth * rx), deckY: fd.heightM }
}

/** The fit for everything else (`fit: "hull"`): length is `normalize`'s, lateral k matches the waterline beam. */
export function hullFit(m: TriangleSoup, spec: FitSpec): ShipFit {
  const k = spec.beamM / waterlineBeam(m)
  return { shiftX: 0, rx: 1, ry: 1, kWaterline: k, kDeck: k, deckY: spec.deckHeightM }
}

/** A vertical ray's topmost hit, bucketed so a 2,096-cell grid over 15k triangles is fast. */
export function createHeightProbe(m: TriangleSoup, cellM = 4): (x: number, z: number) => number | null {
  const b = bounds(m)
  const nx = Math.max(1, Math.ceil((b.max[0] - b.min[0]) / cellM)), nz = Math.max(1, Math.ceil((b.max[2] - b.min[2]) / cellM))
  const buckets: number[][] = Array.from({ length: nx * nz }, () => [])
  const ix = (x: number): number => Math.min(nx - 1, Math.max(0, Math.floor((x - b.min[0]) / cellM)))
  const iz = (z: number): number => Math.min(nz - 1, Math.max(0, Math.floor((z - b.min[2]) / cellM)))
  for (let t = 0; t < triangleCount(m); t++) {
    const [a, bb, c] = tri(m, t)
    const x0 = Math.min(px(m, a), px(m, bb), px(m, c)), x1 = Math.max(px(m, a), px(m, bb), px(m, c))
    const z0 = Math.min(pz(m, a), pz(m, bb), pz(m, c)), z1 = Math.max(pz(m, a), pz(m, bb), pz(m, c))
    for (let i = ix(x0); i <= ix(x1); i++) for (let j = iz(z0); j <= iz(z1); j++) buckets[i * nz + j]!.push(t)
  }
  return (x, z) => {
    if (x < b.min[0] || x > b.max[0] || z < b.min[2] || z > b.max[2]) return null
    let top: number | null = null
    for (const t of buckets[ix(x) * nz + iz(z)]!) {
      const [a, bb, c] = tri(m, t)
      const ax = px(m, a), az = pz(m, a), bx = px(m, bb), bz = pz(m, bb), cx = px(m, c), cz = pz(m, c)
      const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz)
      if (Math.abs(det) < 1e-12) continue
      const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det
      const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det
      const l3 = 1 - l1 - l2
      if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue
      const y = l1 * py(m, a) + l2 * py(m, bb) + l3 * py(m, c)
      if (top === null || y > top) top = y
    }
    return top
  }
}

export interface DeckGridReport {
  readonly cells: number
  /** Share of cells more than `edgeBandM` from the long edges within ±deckCellM of the deck. */
  readonly innerOnDeck: number
  /** Share of all cells within ±deckCellM. */
  readonly allOnDeck: number
  /** Cells on the centerline (|z| <= 1 m) or in the trap zone's lane that are NOT on the deck. */
  readonly laneMisses: number
  /** Below-deck cells outside the allowed corners. */
  readonly strayBelow: number
  readonly belowShare: number
  /** The highest above-deck excess outside the island's box, meters. */
  readonly worstFitting: number
}

/**
 * Spec §4.3 step 4: `cellM` cells over the sim's flight-deck rectangle, each
 * compared with the deck height. `lane` is the half-width of the trap-zone
 * lane checked at 100%: the trap band's own half-width (ship.ts).
 */
export function deckGrid(m: TriangleSoup, spec: FitSpec, lane: number, island: { minX: number; maxX: number; minZ: number; maxZ: number }, cellM = 2): DeckGridReport {
  const fd = spec.flightDeck!, tz = spec.trapZone
  const probe = createHeightProbe(m)
  const L = fd.lengthM, W = fd.widthM, H = fd.heightM
  let cells = 0, inner = 0, innerOn = 0, allOn = 0, laneMisses = 0, strayBelow = 0, below = 0, worstFitting = 0
  const nx = Math.floor(L / cellM), nz = Math.floor(W / cellM)
  for (let i = 0; i < nx; i++) {
    const x = (i - (nx - 1) / 2) * cellM
    for (let j = 0; j < nz; j++) {
      const z = (j - (nz - 1) / 2) * cellM
      cells++
      const y = probe(x, z)
      const on = y !== null && Math.abs(y - H) <= TOLERANCE.deckCellM
      const isInner = Math.abs(z) <= W / 2 - TOLERANCE.edgeBandM
      if (isInner) { inner++; if (on) innerOn++ }
      if (on) allOn++
      const fromStern = x + L / 2
      const inLane = Math.abs(z) <= 1 || (tz !== undefined && fromStern >= tz.fromSternM && fromStern <= tz.toSternM && Math.abs(z) <= lane)
      if (inLane && !on) laneMisses++
      if (y === null || y < H - TOLERANCE.deckCellM) {
        below++
        if (!(Math.abs(x) >= L / 2 - TOLERANCE.belowDeckEndM && Math.abs(z) >= W / 2 - TOLERANCE.belowDeckEdgeM)) strayBelow++
      } else if (y > H + TOLERANCE.deckCellM) {
        const inIsland = x >= island.minX - 2 && x <= island.maxX + 2 && z >= island.minZ - 2 && z <= island.maxZ + 2
        if (!inIsland) worstFitting = Math.max(worstFitting, y - H)
      }
    }
  }
  return { cells, innerOnDeck: innerOn / inner, allOnDeck: allOn / cells, laneMisses, strayBelow, belowShare: below / cells, worstFitting }
}

/**
 * The half-width of the trap band a carrier's model can carry (spec §4.3
 * step 5): 0.45 of the deck's width (ship.ts's boxes draw 0.9 W), narrowed
 * to 1 m inboard of anything over `fittingM` above the deck inside the trap
 * zone's span, which on the CV-6 is the island (measured 2026-09-25).
 */
export function trapLaneHalfWidth(m: TriangleSoup, spec: FitSpec, stepM = 0.5): number {
  const fd = spec.flightDeck!, tz = spec.trapZone!
  const probe = createHeightProbe(m)
  let half = 0.45 * fd.widthM
  for (let s = tz.fromSternM; s <= tz.toSternM; s += stepM) {
    const x = -fd.lengthM / 2 + s
    for (let z = 0; z <= half; z += stepM / 2) {
      for (const zz of [z, -z]) {
        const y = probe(x, zz)
        if (y !== null && y > fd.heightM + TOLERANCE.fittingM) half = Math.min(half, Math.abs(zz) - 1)
      }
    }
  }
  return half
}

/** Topmost hit at or below `belowY` straight under (x, z), or null. */
export function surfaceBelow(m: TriangleSoup, x: number, z: number, belowY: number): number | null {
  let top: number | null = null
  for (let t = 0; t < triangleCount(m); t++) {
    const [a, b, c] = tri(m, t)
    const ax = px(m, a), az = pz(m, a), bx = px(m, b), bz = pz(m, b), cx = px(m, c), cz = pz(m, c)
    const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz)
    if (Math.abs(det) < 1e-12) continue
    const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det
    const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det
    const l3 = 1 - l1 - l2
    if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue
    const y = l1 * py(m, a) + l2 * py(m, b) + l3 * py(m, c)
    if (y <= belowY && (top === null || y > top)) top = y
  }
  return top
}

/**
 * The skirt's outline (spec §4.5): the 2D convex hull, in xz, of every vertex
 * within `bandM` of the lowest one, counter-clockwise seen from above
 * (Andrew's monotone chain).
 */
export function skirtOutline(m: TriangleSoup, bandM = 0.3): [number, number][] {
  const minY = bounds(m).min[1]
  const pts: [number, number][] = []
  for (let v = 0; v < m.positions.length / 3; v++) if (py(m, v) <= minY + bandM) pts.push([px(m, v), pz(m, v)])
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (o: [number, number], a: [number, number], b: [number, number]): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: [number, number][] = [], upper: [number, number][] = []
  for (const p of pts) { while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, p) <= 0) lower.pop(); lower.push(p) }
  for (const p of [...pts].reverse()) { while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, p) <= 0) upper.pop(); upper.push(p) }
  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)]
  if (hull.length < 3) throw new Error('skirtOutline: fewer than three points at the base')
  return hull
}

/**
 * A wall around `outline` from y = `top` down to y = `bottom`: two triangles
 * per edge, wound so the front face looks outward, and a horizontal outward
 * normal per vertex (four vertices per edge, flat-shaded).
 */
export function skirtWall(outline: readonly [number, number][], top: number, bottom: number): { positions: Float32Array; normals: Float32Array; indices: Uint32Array } {
  const pos: number[] = [], nor: number[] = [], idx: number[] = []
  // Signed area: counter-clockwise in (x, z) when positive.
  let area = 0
  outline.forEach((p, i) => { const q = outline[(i + 1) % outline.length]!; area += p[0] * q[1] - q[0] * p[1] })
  const ccw = area > 0
  outline.forEach((p, i) => {
    const q = outline[(i + 1) % outline.length]!
    const ex = q[0] - p[0], ez = q[1] - p[1]
    const len = Math.hypot(ex, ez) || 1
    // Outward normal in xz for a counter-clockwise (x, z) polygon is (ez, -ex).
    const nx = (ccw ? ez : -ez) / len, nz = (ccw ? -ex : ex) / len
    const b = pos.length / 3
    pos.push(p[0], top, p[1], q[0], top, q[1], q[0], bottom, q[1], p[0], bottom, p[1])
    for (let k = 0; k < 4; k++) nor.push(nx, 0, nz)
    // Front face = counter-clockwise seen from outside.
    const quad = [b, b + 1, b + 2, b, b + 2, b + 3]
    const t0 = triangleNormal({ positions: new Float32Array(pos), indices: new Uint32Array(quad.slice(0, 3)) }, 0)
    idx.push(...(t0.nx * nx + t0.nz * nz >= 0 ? quad : [b, b + 2, b + 1, b, b + 3, b + 2]))
  })
  return { positions: new Float32Array(pos), normals: new Float32Array(nor), indices: new Uint32Array(idx) }
}

/** How a model proves its bow is at +x (spec §4.2). */
export type BowCheck = 'narrow-end' | 'island-starboard' | { readonly pinnedNarrowEnd: number; readonly evidence: string }

export interface FitOptions {
  readonly fit: 'deck' | 'hull'
  readonly kind: 'waterline' | 'full-hull'
  readonly bow: BowCheck
  /** full-hull only: the keel's depth measured at S1, pinned so a moved origin fails. */
  readonly keelM?: number | undefined
}

/** What a fitted model measures, for the build log and the progress ledger. */
export interface FitMeasures {
  readonly overallLengthM: number
  readonly waterlineBeamM: number
  readonly baseY: number
  readonly topY: number
  readonly narrowEnd: number
  readonly mainDeckM?: number
  readonly deckPlaneM?: number
  readonly deckLengthM?: number
  readonly deckWidthM?: number
  readonly islandMeanZ?: number
  readonly islandInboardZ?: number
  readonly trapLaneHalfWidthM?: number
  readonly grid?: DeckGridReport
}

const pct = (a: number, b: number): string => `${(((a / b) - 1) * 100).toFixed(2)}%`

/**
 * Every §4.4 tolerance, re-measured on FITTED geometry against the spec. The
 * build calls it before writing; Tier 1 calls it on the committed glb against
 * the live content/ships JSON. Each problem names the quantity, the measured
 * value and the limit.
 */
export function fitProblems(m: TriangleSoup, spec: FitSpec, o: FitOptions): { problems: string[]; measures: FitMeasures } {
  const problems: string[] = []
  const b = bounds(m)
  if (!Array.from(m.positions).every(Number.isFinite)) problems.push('a vertex is not finite')
  const overall = b.max[0] - b.min[0]
  const wl = waterlineBeam(m)
  const narrow = narrowEndRatio(m)
  let measures: FitMeasures = { overallLengthM: overall, waterlineBeamM: wl, baseY: b.min[1], topY: b.max[1], narrowEnd: narrow }
  if (Math.abs(wl / spec.beamM - 1) > 0.01) problems.push(`waterline beam ${wl.toFixed(2)} m vs beamM ${spec.beamM} (${pct(wl, spec.beamM)}, limit ±1%)`)
  if (o.kind === 'waterline' && Math.abs(b.min[1] - SKIRT_BOTTOM_M) > 0.05) problems.push(`skirt bottom at y ${b.min[1].toFixed(3)}, expected ${SKIRT_BOTTOM_M}`)
  if (o.kind === 'full-hull') {
    if (o.keelM === undefined) problems.push('a full-hull model needs its measured keelM')
    else if (Math.abs(b.min[1] - o.keelM) > 0.05) problems.push(`keel at y ${b.min[1].toFixed(3)}, pinned at ${o.keelM} ± 0.05 (the waterline origin moved)`)
  }
  if (o.bow === 'narrow-end' && narrow > TOLERANCE.narrowEndMax) problems.push(`narrow-end ratio ${narrow.toFixed(3)} > ${TOLERANCE.narrowEndMax}: the bow is not at +x`)
  if (typeof o.bow === 'object' && Math.abs(narrow - o.bow.pinnedNarrowEnd) > PINNED_NARROW_END_TOL) problems.push(`narrow-end ratio ${narrow.toFixed(3)}, pinned at ${o.bow.pinnedNarrowEnd} ± ${PINNED_NARROW_END_TOL} (${o.bow.evidence}): the model was reversed`)
  if (o.fit === 'hull') {
    if (Math.abs(overall / spec.lengthM - 1) > TOLERANCE.hullLengthFrac) problems.push(`hull length ${overall.toFixed(2)} m vs lengthM ${spec.lengthM} (${pct(overall, spec.lengthM)}, limit ±0.5%)`)
    const main = dominantUpPlane(m, 0.5, spec.deckHeightM + TOLERANCE.mainDeckM + 3, 0.25)
    measures = { ...measures, mainDeckM: main }
    if (Math.abs(main - spec.deckHeightM) > TOLERANCE.mainDeckM) problems.push(`main deck at ${main.toFixed(2)} m vs deckHeightM ${spec.deckHeightM} (limit ±${TOLERANCE.mainDeckM} m)`)
  } else {
    const fd = spec.flightDeck
    if (!fd) return { problems: [...problems, `${spec.id}: fit "deck" needs a flightDeck`], measures }
    const plane = dominantUpPlane(m, b.max[1] * 0.2, b.max[1], 0.1)
    const d = deckExtent(m, plane)
    const island = islandOf(m, fd.heightM)
    const lane = spec.trapZone ? trapLaneHalfWidth(m, spec) : 0
    const grid = deckGrid(m, spec, lane, island)
    measures = { ...measures, deckPlaneM: plane, deckLengthM: d.length, deckWidthM: d.medianWidth, islandMeanZ: island.meanZ, islandInboardZ: island.minZ, trapLaneHalfWidthM: lane, grid }
    if (Math.abs(plane - fd.heightM) > 0.05) problems.push(`deck plane at ${plane.toFixed(3)} m vs flightDeck.heightM ${fd.heightM} (limit ±0.05)`)
    if (Math.abs(d.length / fd.lengthM - 1) > TOLERANCE.deckLengthFrac) problems.push(`deck length ${d.length.toFixed(2)} m vs flightDeck.lengthM ${fd.lengthM} (${pct(d.length, fd.lengthM)}, limit ±0.5%)`)
    if (Math.abs(d.medianWidth / fd.widthM - 1) > 0.01) problems.push(`deck width ${d.medianWidth.toFixed(2)} m vs flightDeck.widthM ${fd.widthM} (${pct(d.medianWidth, fd.widthM)}, limit ±1%)`)
    if (Math.abs(overall / spec.lengthM - 1) > TOLERANCE.overallLengthFrac) problems.push(`overall length ${overall.toFixed(2)} m vs lengthM ${spec.lengthM} (${pct(overall, spec.lengthM)}, limit ±3%)`)
    if (o.bow === 'island-starboard' && !(island.meanZ > 0)) problems.push(`island mean z ${island.meanZ.toFixed(2)} m is not to starboard (+z): the model is reversed or mirrored`)
    if (grid.innerOnDeck < TOLERANCE.deckCellShareMin) problems.push(`${(grid.innerOnDeck * 100).toFixed(1)}% of inner deck cells within ±${TOLERANCE.deckCellM} m (limit ≥ ${TOLERANCE.deckCellShareMin * 100}%)`)
    if (grid.laneMisses > 0) problems.push(`${grid.laneMisses} centerline or trap-lane cells are not on the deck (limit 0)`)
    if (grid.strayBelow > 0) problems.push(`${grid.strayBelow} below-deck cells outside the tapered corners (limit 0)`)
    if (grid.worstFitting > TOLERANCE.fittingM) problems.push(`a fitting stands ${grid.worstFitting.toFixed(2)} m above the deck outside the island (limit ${TOLERANCE.fittingM})`)
    if (spec.trapZone && lane < 5) problems.push(`trap lane half-width ${lane.toFixed(2)} m < 5 m: the island crowds the landing lane`)
  }
  return { problems, measures }
}

/** The fit's own residuals against §4.4's design ranges (build time: the committed glb records them in asset.extras.shipFit). */
export function residualProblems(fit: ShipFit, o: Pick<FitOptions, 'fit'>): string[] {
  const out: string[] = []
  const inK = (k: number): boolean => k >= TOLERANCE.kMin && k <= TOLERANCE.kMax
  if (!inK(fit.kWaterline)) out.push(`lateral kWaterline ${fit.kWaterline.toFixed(4)} outside ${TOLERANCE.kMin}..${TOLERANCE.kMax}`)
  if (!inK(fit.kDeck)) out.push(`lateral kDeck ${fit.kDeck.toFixed(4)} outside ${TOLERANCE.kMin}..${TOLERANCE.kMax}`)
  const r = fit.ry / fit.rx
  if (o.fit === 'deck' && (r < TOLERANCE.syOverSxMin || r > TOLERANCE.syOverSxMax)) out.push(`sy/sx ${r.toFixed(4)} outside ${TOLERANCE.syOverSxMin}..${TOLERANCE.syOverSxMax}`)
  return out
}
```

- [x] **Step 4: Run it to see it pass.**

Run: `npx vitest run tests/render/shipFit.test.ts --maxWorkers=2`
Expected: PASS, 29 tests. The 15 `fitProblems` cases each fail by the named quantity, and the fixture carrier maps onto the Essex rectangle with `rx` 262.7/256 and `ry` 17/16.

- [x] **Step 5: Verify and commit.**

```bash
flock /tmp/ww2airsim-fullsuite.lock sh -c 'npm run typecheck && npm run lint && npm run depcruise && npx vitest run --maxWorkers=2'; rc=$?; echo "rc=$rc"
git add src/render/scene/shipPalette.ts src/render/scene/shipFit.ts tests/render/shipFixtures.ts tests/render/shipFit.test.ts
git commit -m "S1: the pure ship fit (deck and hull fits, the deck grid, the skirt, every §4.4 tolerance) and the ship palette (S1 Task 1)"
```

---

### Task 2: The `ship` block, the `shipFit` and `shipMaterials` stages, and the build wiring

**Files:**
- Modify: `tools/models/manifest.ts`, `tools/models/build.ts`
- Create: `tools/models/stages/shipFit.ts`, `tools/models/stages/shipMaterials.ts`
- Test: `tests/tools/models/shipStages.test.ts`

**Interfaces:**
- Consumes: Task 1's `shipFit.ts` and `shipPalette.ts`; Z1's `runPipeline`, `checkOutput`, `runBuild`, `meshNodes`, `onlyScene`, `ownMesh`, `carve`, `ensureIndices`; `loadShipSpec` (`tools/content/load.ts`).
- Produces:
  - `manifest.ts`: `ModelEntry['ship']`, `type ShipEntry = { spec; fit: 'deck' | 'hull'; kind: 'waterline' | 'full-hull'; palette: ShipPaletteId; materials: Record<string, ShipRole | 'keep' | 'mask'>; otherMaterials: ShipRole | 'classify' | 'keep'; smokeOrigin: [x, y, z]; bow: 'narrow-end' | 'island-starboard' | { pinnedNarrowEnd; evidence }; keelM? }`.
  - `stages/shipFit.ts`: `SMOKE_REACH_M` (5), `documentSoup(doc): TriangleSoup`, `ShipFitResult { fit; flightDeckY: number | null; trapLaneHalfWidthM: number | null }`, `shipFitStage(doc, ship, spec): ShipFitResult`, `addShipMarkers(doc, ship, spec, result)`.
  - `stages/shipMaterials.ts`: `roleMaterial(doc, palette, role): Material` (named `ship:<role>`), `isRoleMaterial(m)`, `shipMaterials(doc, ship, flightDeckY)`.
  - `build.ts`: `runPipeline(doc, entry, shipSpec = loadShipSpec)`.

- [x] **Step 1: Write the failing test.** `tests/tools/models/shipStages.test.ts`:

```ts
// tests/tools/models/shipStages.test.ts
import { describe, expect, it } from 'vitest'
import type { Document } from '@gltf-transform/core'
import { KHRMaterialsSpecular } from '@gltf-transform/extensions'
import { checkOutput, runBuild, runPipeline, type BuildDeps } from '../../../tools/models/build.js'
import { parseModelEntry, type ModelEntry } from '../../../tools/models/manifest.js'
import { findNode, modelIO } from '../../../tools/models/document.js'
import { measureDocument } from '../../../tools/models/measure.js'
import { documentSoup } from '../../../tools/models/stages/shipFit.js'
import { shipMaterials } from '../../../tools/models/stages/shipMaterials.js'
import { fitProblems } from '../../../src/render/scene/shipFit.js'
import { loadShipSpec } from '../../../tools/content/load.js'
import { addMeshNode, boxesPrimitive, newDocument, type V3 } from './fixtures.js'

/**
 * tests/render/shipFixtures.ts's carrier (hull 260 x 26 x 15, deck slab 256 x
 * 30 topped at 16, island 24 m tall at z 12..15), authored the way the CV-6
 * is: bow toward -z, a tenth of the size, one material.
 */
function toyCarrier(islandSide: 1 | -1 = 1): Document {
  const doc = newDocument()
  const paint = doc.createMaterial('Material.001')
  // Output (x bow, y up, z starboard) -> source (x = z, y, z = -x), / 10.
  const box = (min: V3, max: V3): [V3, V3] => [[min[2] / 10, min[1] / 10, -max[0] / 10], [max[2] / 10, max[1] / 10, -min[0] / 10]]
  const island: [V3, V3] = islandSide === 1 ? [[0, 16, 12], [40, 40, 15]] : [[0, 16, -15], [40, 40, -12]]
  addMeshNode(doc, 'Object_2', [boxesPrimitive(doc, [box([-130, 0, -13], [130, 15, 13]), box([-128, 15, -15], [128, 16, 15]), box(...island)], paint)])
  return doc
}

const SOURCE = { url: 'https://sketchfab.com/3d-models/toy-cv-0123456789abcdef0123456789abcdef', uid: '0123456789abcdef0123456789abcdef', author: 'tester', license: 'CC-BY-4.0' }

const carrierEntry: ModelEntry = parseModelEntry({
  id: 'toy-cv',
  input: 'tools/models/cache/toy-cv.glb',
  output: 'content/ships/toy-cv.glb',
  source: SOURCE,
  normalize: { forward: '-z', up: '+y', origin: [0, 0, 0], fit: { extent: 'length', meters: 265.8 } },
  textures: { maxSize: 1024, format: 'webp' },
  opaque: false,
  budget: { maxBytes: 100_000, maxTriangles: 200, maxDrawCalls: 5 },
  ship: { spec: 'essex-cv', fit: 'deck', kind: 'waterline', palette: 'usn-1944', otherMaterials: 'classify', smokeOrigin: [20, 44, 14.5], bow: 'island-starboard' },
})

describe('the ship block in ModelEntrySchema', () => {
  const raw = { ...carrierEntry, ship: { ...carrierEntry.ship } } as Record<string, unknown>
  const bad = (patch: Record<string, unknown>): unknown => () => parseModelEntry({ ...raw, ...patch })
  it('parses, defaulting materials to {}', () => {
    expect(carrierEntry.ship!.materials).toEqual({})
  })
  it('refuses every inconsistent combination, naming it', () => {
    expect(bad({ ship: undefined })).toThrow(/content\/ships\/ output needs a ship block/)
    expect(bad({ output: 'content/aircraft/toy-cv.glb' })).toThrow(/only a content\/ships\/ output takes a ship block/)
    expect(bad({ opaque: true })).toThrow(/shipMaterials owns alpha/)
    expect(bad({ normalize: undefined })).toThrow(/a ship needs normalize/)
    expect(bad({ ship: { ...carrierEntry.ship, bow: 'narrow-end' } })).toThrow(/island-starboard/)
    expect(bad({ ship: { ...carrierEntry.ship, kind: 'full-hull' } })).toThrow(/keelM/)
    expect(bad({ ship: { ...carrierEntry.ship, otherMaterials: 'paint' } })).toThrow()
    expect(bad({ ship: { ...carrierEntry.ship, palette: 'ijn' } })).toThrow()
  })
})

describe('runPipeline on a synthetic carrier', () => {
  it('fits it, skirts it, paints it in roles, marks it, and meets its contract', async () => {
    const doc = await runPipeline(toyCarrier(), carrierEntry)
    const io = modelIO()
    const bytes = await io.writeBinary(doc)
    expect(checkOutput(doc, bytes.byteLength, carrierEntry)).toEqual([])
    const again = await io.readBinary(bytes)
    const names = again.getRoot().listMaterials().map((m) => m.getName()).sort()
    expect(names).toEqual(['ship:boot', 'ship:deck', 'ship:flightDeck', 'ship:hull', 'ship:superstructure'])
    expect(measureDocument(again).drawCalls).toBe(5)
    expect(findNode(again, 'SmokeOrigin').getTranslation()).toEqual([20, 44, 14.5])
    const band = findNode(again, 'TrapBand')
    expect(band.getTranslation()[0]).toBeCloseTo(-262.7 / 2 + 80, 6)
    expect(band.getExtras()['halfWidthM']).toBeCloseTo(0.45 * 32.9, 6)
    expect(again.getRoot().getAsset().extras).toMatchObject({ shipFit: { spec: 'essex-cv' }, source: SOURCE.url })
    // Tier 1's own re-measure, on the bytes that would be committed.
    expect(fitProblems(documentSoup(again), loadShipSpec('essex-cv'), carrierEntry.ship!).problems).toEqual([])
  })

  it('refuses a mirrored carrier, naming the island', async () => {
    await expect(runPipeline(toyCarrier(-1), carrierEntry)).rejects.toThrow(/island mean z .* not to starboard/)
  })

  it('takes its ShipSpec from the injected loader, so a moved deck fails the build', async () => {
    const cv = loadShipSpec('essex-cv')
    const raised = { ...cv, deckHeightM: 30, flightDeck: { ...cv.flightDeck!, heightM: 30 } }
    await expect(runPipeline(toyCarrier(), carrierEntry, () => raised)).rejects.toThrow(/sy\/sx 1\.8\d+ outside/)
  })
})

describe('shipMaterials', () => {
  it('maps roles, masks lattices, keeps a textured material at metalness 0 without its extensions or tangents', () => {
    const doc = newDocument()
    const spec = doc.createExtension(KHRMaterialsSpecular)
    const hull = doc.createMaterial('hullgrey').setMetallicFactor(0.4)
    const lattice = doc.createMaterial('mesh').setAlphaMode('BLEND')
    const textured = doc.createMaterial('DefaultMaterial').setMetallicFactor(1).setExtension('KHR_materials_specular', spec.createSpecular().setSpecularFactor(0.5))
    const other = doc.createMaterial('rope')
    const withUv = (m: Parameters<typeof boxesPrimitive>[2]) => {
      const p = boxesPrimitive(doc, [[[0, 0, 0], [1, 1, 1]]], m)
      p.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(16)))
      p.setAttribute('TANGENT', doc.createAccessor().setType('VEC4').setArray(new Float32Array(32)))
      return p
    }
    addMeshNode(doc, 'a', [withUv(hull), withUv(lattice), withUv(textured), withUv(other)])
    const ship = parseModelEntry({ ...carrierEntry, ship: { ...carrierEntry.ship, fit: 'hull', kind: 'full-hull', keelM: -1, bow: 'narrow-end', materials: { hullgrey: 'hull', mesh: 'mask', DefaultMaterial: 'keep' }, otherMaterials: 'fitting' } }).ship!
    shipMaterials(doc, ship, null)
    const prims = doc.getRoot().listMeshes()[0]!.listPrimitives()
    const by = (name: string) => prims.find((p) => p.getMaterial()!.getName() === name)!
    expect(by('ship:hull').listSemantics().sort()).toEqual(['POSITION'])
    expect(by('ship:fitting').listSemantics().sort()).toEqual(['POSITION'])
    expect(by('mesh').getMaterial()!.getAlphaMode()).toBe('MASK')
    expect(by('mesh').getMaterial()!.getAlphaCutoff()).toBe(0.5)
    expect(by('mesh').listSemantics()).toContain('TEXCOORD_0')
    expect(by('DefaultMaterial').listSemantics().sort()).toEqual(['POSITION', 'TEXCOORD_0'])
    expect(doc.getRoot().listExtensionsUsed().map((e) => e.extensionName)).toEqual([])
    for (const m of doc.getRoot().listMaterials()) {
      expect(m.getMetallicFactor(), m.getName()).toBe(0)
      expect(m.getAlphaMode(), m.getName()).not.toBe('BLEND')
    }
  })
})

describe('runBuild with a ship whose fit fails', () => {
  it('logs FAILED naming the problem, writes nothing for it, and still builds the rest', async () => {
    const good = parseModelEntry({ ...carrierEntry, id: 'good-cv', input: 'tools/models/cache/good-cv.glb', output: 'content/ships/good-cv.glb' })
    const lines: string[] = [], written: string[] = []
    const deps: BuildDeps = {
      exists: () => true,
      read: async (p) => toyCarrier(p.includes('good') ? 1 : -1),
      write: (p) => { written.push(p) },
      encode: (d) => modelIO().writeBinary(d),
      log: (l) => { lines.push(l) },
    }
    expect(await runBuild([carrierEntry, good], [], deps)).toBe(1)
    expect(written).toEqual(['content/ships/good-cv.glb'])
    expect(lines[0]).toMatch(/^FAILED toy-cv, nothing written: ship essex-cv: .*island mean z/)
  })
})
```

- [x] **Step 2: Run it to see it fail.**

Run: `npx vitest run tests/tools/models/shipStages.test.ts --maxWorkers=2`
Expected: FAIL. `tools/models/stages/shipFit.js` does not resolve.

- [x] **Step 3: The `ship` block.** Apply to `tools/models/manifest.ts`:

```diff
--- a/tools/models/manifest.ts
+++ b/tools/models/manifest.ts
@@ -2,6 +2,7 @@
 import { readdirSync, readFileSync } from 'node:fs'
 import { basename, join } from 'node:path'
 import { z } from 'zod'
+import { SHIP_PALETTES, SHIP_ROLES, type ShipPaletteId } from '../../src/render/scene/shipPalette.js'
 
 /**
  * One JSON file per shipped model, under `tools/models/entries/`
@@ -45,6 +46,36 @@ const SplitSchema = z.object({
   pivot: PivotSchema.optional(),
 }).strict()
 
+const shipRole = z.enum(SHIP_ROLES)
+
+/**
+ * A ship's fit to its ShipSpec and its paint (ship-models spec §4.1). Only
+ * `content/ships/` outputs carry it, and they must.
+ */
+const ShipSchema = z.object({
+  /** The content/ships/<spec>.json the model is fitted to; the sim is authoritative (§4). */
+  spec: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
+  /** `deck`: a carrier, fitted to flightDeck. `hull`: length from normalize, beam at the waterline. */
+  fit: z.enum(['deck', 'hull']),
+  /** `waterline`: cut flat at y = 0, gets a skirt. `full-hull`: keeps its own underwater hull. */
+  kind: z.enum(['waterline', 'full-hull']),
+  palette: z.enum(Object.keys(SHIP_PALETTES) as [ShipPaletteId, ...ShipPaletteId[]]),
+  /** Per source material: a palette role, `keep` (its textures, metalness 0) or `mask` (a lattice, alpha MASK 0.5). */
+  materials: z.record(z.string().min(1), z.union([shipRole, z.enum(['keep', 'mask'])])).default({}),
+  /** Every material `materials` does not name. `classify`: split by geometry (§5.1). */
+  otherMaterials: z.union([shipRole, z.enum(['classify', 'keep'])]),
+  /** Fitted meters, +x bow: where the damage smoke rises (a funnel top). */
+  smokeOrigin: vec3,
+  /** How the output proves its bow is at +x (§4.2). A pinned ratio records a hull form the narrow-end rule cannot read. */
+  bow: z.union([
+    z.enum(['narrow-end', 'island-starboard']),
+    z.object({ pinnedNarrowEnd: positive, evidence: z.string().min(1) }).strict(),
+  ]),
+  /** full-hull only: the keel's fitted depth, measured once and pinned, so a moved waterline origin fails. */
+  keelM: finite.optional(),
+}).strict()
+export type ShipEntry = z.infer<typeof ShipSchema>
+
 export const ModelEntrySchema = z.object({
   /** Unique, and the output file's basename. */
   id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
@@ -84,6 +115,8 @@ export const ModelEntrySchema = z.object({
   budget: z.object({ maxBytes: positiveInt, maxTriangles: positiveInt, maxDrawCalls: positiveInt }).strict(),
   /** An output node whose center must be the scene's max-X point. */
   noseNode: z.string().min(1).optional(),
+  /** Ships only (ship-models spec §4.1). */
+  ship: ShipSchema.optional(),
 }).strict().superRefine((e, ctx) => {
   const fail = (path: (string | number)[], message: string): void => { ctx.addIssue({ code: z.ZodIssueCode.custom, path, message }) }
   if (e.output.replace(/^.*\//, '').replace(/\.glb$/, '') !== e.id) fail(['output'], `basename must equal id "${e.id}"`)
@@ -101,6 +134,15 @@ export const ModelEntrySchema = z.object({
   }
   e.remove.forEach((r, i) => { if (e.keep.some((k) => k.node === r || k.as === r)) fail(['remove', i], `"${r}" is also kept`) })
   if (e.noseNode !== undefined && !outNames.includes(e.noseNode)) fail(['noseNode'], `"${e.noseNode}" is not a keep or split output name`)
+  const toShips = e.output.startsWith('content/ships/')
+  if (toShips && !e.ship) fail(['ship'], 'a content/ships/ output needs a ship block')
+  if (e.ship) {
+    if (!toShips) fail(['ship'], 'only a content/ships/ output takes a ship block')
+    if (!e.normalize) fail(['normalize'], 'a ship needs normalize: the fit runs on its output')
+    if (e.opaque) fail(['opaque'], 'must be false for a ship: shipMaterials owns alpha (§5.3)')
+    if ((e.ship.fit === 'deck') !== (e.ship.bow === 'island-starboard')) fail(['ship', 'bow'], 'a carrier (fit "deck") proves its bow by "island-starboard", and only a carrier does')
+    if ((e.ship.kind === 'full-hull') !== (e.ship.keelM !== undefined)) fail(['ship', 'keelM'], 'required for a full-hull model, and only for one')
+  }
 })
 
 export type ModelEntry = z.infer<typeof ModelEntrySchema>
```

- [x] **Step 4: The stages.** `tools/models/stages/shipMaterials.ts`:

```ts
// tools/models/stages/shipMaterials.ts
import type { Document, Material, Primitive } from '@gltf-transform/core'
import type { ShipEntry } from '../manifest.js'
import { SHIP_ROUGHNESS, linearFactor, SHIP_PALETTES, type ShipRole } from '../../../src/render/scene/shipPalette.js'
import { UP_NY, PLANE_TOL_M } from '../../../src/render/scene/shipFit.js'
import { meshNodes } from '../document.js'
import { carve, ensureIndices } from './geometry.js'

const ROLE_PREFIX = 'ship:'

/** The one material for `role` in this document, created on first use. Named `ship:<role>`, so Tier 1 can find a role by name. */
export function roleMaterial(doc: Document, palette: ShipEntry['palette'], role: ShipRole): Material {
  const name = `${ROLE_PREFIX}${role}`
  const existing = doc.getRoot().listMaterials().find((m) => m.getName() === name)
  if (existing) return existing
  return doc.createMaterial(name).setBaseColorFactor(linearFactor(SHIP_PALETTES[palette][role]))
    .setMetallicFactor(0).setRoughnessFactor(SHIP_ROUGHNESS).setAlphaMode('OPAQUE')
}

export const isRoleMaterial = (m: Material | null): boolean => m !== null && m.getName().startsWith(ROLE_PREFIX)

/** An untextured role draws nothing from UVs or tangents; dropping them lets `join` merge every primitive of a role into one draw. */
function stripSurfaceAttributes(prim: Primitive): void {
  for (const s of prim.listSemantics()) if (s.startsWith('TEXCOORD_') || s === 'TANGENT' || s.startsWith('COLOR_')) prim.setAttribute(s, null)
}

const TRIANGLES = 4

/**
 * Splits `prim` by geometry (spec §5.1, "single untextured materials"):
 * up-facing triangles are `deck`, or `flightDeck` within PLANE_TOL_M of a
 * carrier's fitted deck plane; the rest are `superstructure` when their
 * centroid is over a carrier's deck, else `hull`. Returns the new primitives.
 */
function classify(doc: Document, prim: Primitive, flightDeckY: number | null): Map<ShipRole, Primitive> {
  const indices = ensureIndices(doc, prim)
  const p = prim.getAttribute('POSITION')!.getArray()!
  const buckets = new Map<ShipRole, number[]>()
  for (let t = 0; t < indices.length / 3; t++) {
    const a = indices[3 * t]!, b = indices[3 * t + 1]!, c = indices[3 * t + 2]!
    const ux = p[3 * b]! - p[3 * a]!, uy = p[3 * b + 1]! - p[3 * a + 1]!, uz = p[3 * b + 2]! - p[3 * a + 2]!
    const vx = p[3 * c]! - p[3 * a]!, vy = p[3 * c + 1]! - p[3 * a + 1]!, vz = p[3 * c + 2]! - p[3 * a + 2]!
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const up = ny / (Math.hypot(nx, ny, nz) || 1) > UP_NY
    const cy = (p[3 * a + 1]! + p[3 * b + 1]! + p[3 * c + 1]!) / 3
    const role: ShipRole = up
      ? (flightDeckY !== null && Math.abs(cy - flightDeckY) <= PLANE_TOL_M ? 'flightDeck' : 'deck')
      : (flightDeckY !== null && cy > flightDeckY + PLANE_TOL_M ? 'superstructure' : 'hull')
    const list = buckets.get(role) ?? []
    list.push(a, b, c)
    buckets.set(role, list)
  }
  const out = new Map<ShipRole, Primitive>()
  for (const [role, list] of buckets) out.set(role, carve(doc, prim, Uint32Array.from(list)))
  return out
}

/**
 * Stage: every source material becomes a palette role, a kept texture, or a
 * masked lattice (spec §5), per the entry's `ship.materials` and
 * `ship.otherMaterials`. Afterward no material is BLEND and every
 * metallicFactor is 0. Runs after shipFit (classification reads the fitted
 * deck height) and before join.
 */
export function shipMaterials(doc: Document, ship: ShipEntry, flightDeckY: number | null): void {
  for (const node of meshNodes(doc)) {
    const mesh = node.getMesh()!
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== TRIANGLES) continue
      const src = prim.getMaterial()
      if (isRoleMaterial(src)) continue
      const rule = ship.materials[src?.getName() ?? ''] ?? ship.otherMaterials
      if (rule === 'keep' || rule === 'mask') {
        if (!src) throw new Error(`ship ${ship.spec}: an untextured primitive has no material to ${rule}`)
        src.setMetallicFactor(0)
        if (rule === 'mask') src.setAlphaMode('MASK').setAlphaCutoff(0.5).setRoughnessFactor(SHIP_ROUGHNESS)
        else {
          src.setAlphaMode('OPAQUE')
          // Tangents: three.js derives them for a normal map that lacks them; they cost the Liberty 1.04 MB (measured 2026-09-25).
          prim.setAttribute('TANGENT', null)
        }
        continue
      }
      if (rule === 'classify') {
        for (const [role, part] of classify(doc, prim, flightDeckY)) {
          stripSurfaceAttributes(part)
          mesh.addPrimitive(part.setMaterial(roleMaterial(doc, ship.palette, role)))
        }
        mesh.removePrimitive(prim)
        prim.dispose()
        continue
      }
      stripSurfaceAttributes(prim)
      prim.setMaterial(roleMaterial(doc, ship.palette, rule))
    }
  }
  // Every KHR_materials_* extension goes, with its textures: KHR_materials_specular makes
  // three.js build a MeshPhysicalMaterial, and its texture is the Liberty's largest
  // (689,750 B as WebP, measured 2026-09-25). Ships are MeshStandardMaterial, like the boxes.
  for (const ext of doc.getRoot().listExtensionsUsed()) if (ext.extensionName.startsWith('KHR_materials_')) ext.dispose()
  for (const m of doc.getRoot().listMaterials()) {
    if (m.getAlphaMode() === 'BLEND') throw new Error(`ship ${ship.spec}: material "${m.getName()}" is still BLEND`)
    m.setMetallicFactor(0)
  }
}
```

`tools/models/stages/shipFit.ts`:

```ts
// tools/models/stages/shipFit.ts
import type { Accessor, Document } from '@gltf-transform/core'
import { transformMesh } from '@gltf-transform/functions'
import type { ShipSpec } from '../../../src/sim/world/ships.js'
import type { ShipEntry } from '../manifest.js'
import { meshNodes, onlyScene, ownMesh } from '../document.js'
import {
  applyFit, deckFit, fitProblems, hullFit, residualProblems, skirtOutline, skirtWall, SKIRT_BOTTOM_M,
  surfaceBelow, bounds, type ShipFit, type TriangleSoup,
} from '../../../src/render/scene/shipFit.js'
import { roleMaterial } from './shipMaterials.js'

/** How far above the surface under it a smoke origin may sit, meters (spec §4.6). */
export const SMOKE_REACH_M = 5

/** Every triangle in the document, in the scene frame (node translations applied: after `bakeTranslations`, none remain). */
export function documentSoup(doc: Document): TriangleSoup {
  const pos: number[] = [], idx: number[] = []
  for (const node of meshNodes(doc)) {
    const w = node.getWorldMatrix()
    for (const prim of node.getMesh()!.listPrimitives()) {
      if (prim.getMode() !== 4) continue
      const a = prim.getAttribute('POSITION')!.getArray()!
      const base = pos.length / 3
      for (let i = 0; i < a.length / 3; i++) {
        const x = a[3 * i]!, y = a[3 * i + 1]!, z = a[3 * i + 2]!
        pos.push(w[0] * x + w[4] * y + w[8] * z + w[12], w[1] * x + w[5] * y + w[9] * z + w[13], w[2] * x + w[6] * y + w[10] * z + w[14])
      }
      const ind = prim.getIndices()?.getArray() ?? Uint32Array.from({ length: a.length / 3 }, (_, i) => i)
      for (const i of ind) idx.push(i + base)
    }
  }
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx) }
}

/** After `normalize` every mesh node carries a translation only; bake it, so vertices are in the ship frame. */
function bakeTranslations(doc: Document): void {
  for (const node of meshNodes(doc)) {
    const [tx, ty, tz] = node.getTranslation()
    if (tx === 0 && ty === 0 && tz === 0) continue
    transformMesh(ownMesh(doc, node)!, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, tx, ty, tz, 1])
    node.setTranslation([0, 0, 0])
  }
}

/** Applies `fit` once per accessor: every NORMAL against its primitive's ORIGINAL positions first, then every POSITION. */
function applyToDocument(doc: Document, fit: ShipFit): void {
  const originals = new Map<Accessor, Float32Array>()
  const pairs: [Accessor, Accessor | null][] = []
  for (const node of meshNodes(doc)) {
    for (const prim of node.getMesh()!.listPrimitives()) {
      const pos = prim.getAttribute('POSITION')!
      if (!originals.has(pos)) originals.set(pos, new Float32Array(pos.getArray()!))
      pairs.push([pos, prim.getAttribute('NORMAL')])
    }
  }
  const doneNormals = new Set<Accessor>()
  for (const [pos, nor] of pairs) {
    if (!nor || doneNormals.has(nor)) continue
    doneNormals.add(nor)
    const scratch = new Float32Array(originals.get(pos)!)
    const normals = new Float32Array(nor.getArray()!)
    applyFit(scratch, normals, fit)
    nor.setArray(normals)
  }
  for (const [pos, original] of originals) {
    const out = new Float32Array(original)
    applyFit(out, null, fit)
    pos.setArray(out)
  }
}

export interface ShipFitResult {
  readonly fit: ShipFit
  /** The fitted flight-deck height for shipMaterials' classification, or null for a non-carrier. */
  readonly flightDeckY: number | null
  /** Carriers with a trap zone: the band half-width the model leaves clear (TrapBand's extras). */
  readonly trapLaneHalfWidthM: number | null
}

/**
 * Stage (ship-models spec §4): the residual fit after `normalize`, the skirt
 * for waterline-cut models, then every §4.4 tolerance on the result. Throws,
 * listing every problem, if any fails; nothing is written. Records the fit in
 * `asset.extras.shipFit`, which Tier 1 re-checks.
 */
export function shipFitStage(doc: Document, ship: ShipEntry, spec: ShipSpec): ShipFitResult {
  if (spec.id !== ship.spec) throw new Error(`ship block names spec "${ship.spec}", got "${spec.id}"`)
  bakeTranslations(doc)
  const fit = ship.fit === 'deck' ? deckFit(documentSoup(doc), spec) : hullFit(documentSoup(doc), spec)
  const residual = residualProblems(fit, ship)
  if (residual.length) throw new Error(`ship ${spec.id}: ${residual.join('; ')}`)
  applyToDocument(doc, fit)
  if (ship.kind === 'waterline') {
    const wall = skirtWall(skirtOutline(documentSoup(doc)), 0, SKIRT_BOTTOM_M)
    const prim = doc.createPrimitive()
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(wall.positions))
      .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(wall.normals))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(wall.indices))
      .setMaterial(roleMaterial(doc, ship.palette, 'boot'))
    onlyScene(doc).addChild(doc.createNode('Skirt').setMesh(doc.createMesh('Skirt').addPrimitive(prim)))
  }
  const soup = documentSoup(doc)
  const { problems, measures } = fitProblems(soup, spec, ship)
  const [sx, sy, sz] = ship.smokeOrigin
  const b = bounds(soup)
  // Inside the fitted bounds in plan, and at most SMOKE_REACH_M over the top: a funnel's mouth is its top.
  if (sx < b.min[0] || sx > b.max[0] || sz < b.min[2] || sz > b.max[2] || sy < b.min[1] || sy > b.max[1] + SMOKE_REACH_M) problems.push(`smokeOrigin [${ship.smokeOrigin}] lies outside the fitted bounds`)
  const under = surfaceBelow(soup, sx, sz, sy)
  if (under === null || sy - under > SMOKE_REACH_M) problems.push(`smokeOrigin [${ship.smokeOrigin}]: no surface within ${SMOKE_REACH_M} m below it (found ${under?.toFixed(2) ?? 'none'})`)
  if (problems.length) throw new Error(`ship ${spec.id}: ${problems.join('; ')}`)
  const asset = doc.getRoot().getAsset()
  asset.extras = { ...(asset.extras ?? {}), shipFit: { spec: spec.id, ...fit } }
  return { fit, flightDeckY: ship.fit === 'deck' ? spec.flightDeck!.heightM : null, trapLaneHalfWidthM: measures.trapLaneHalfWidthM ?? null }
}

/**
 * After `prune` (which drops empty leaf nodes): the runtime's markers, as
 * empty nodes at the scene root. `SmokeOrigin` at the entry's point; on a
 * carrier with a trap zone, `TrapBand` at the band's center on the deck with
 * `extras.halfWidthM`, which GLTFLoader surfaces as `userData.halfWidthM`.
 */
export function addShipMarkers(doc: Document, ship: ShipEntry, spec: ShipSpec, result: ShipFitResult): void {
  const scene = onlyScene(doc)
  scene.addChild(doc.createNode('SmokeOrigin').setTranslation([...ship.smokeOrigin]))
  if (spec.flightDeck && spec.trapZone && result.trapLaneHalfWidthM !== null) {
    const x = -spec.flightDeck.lengthM / 2 + (spec.trapZone.fromSternM + spec.trapZone.toSternM) / 2
    scene.addChild(doc.createNode('TrapBand').setTranslation([x, spec.flightDeck.heightM, 0]).setExtras({ halfWidthM: result.trapLaneHalfWidthM }))
  }
}
```

- [x] **Step 5: The wiring.** Apply to `tools/models/build.ts`. The ship stages go after `normalizeDocument` and before `joinExcept`, as Z1's handoff says; the markers go after `prune` (departure 4):

```diff
--- a/tools/models/build.ts
+++ b/tools/models/build.ts
@@ -30,6 +30,10 @@ import { simplifyDocument } from './stages/simplify.js'
 import { joinExcept } from './stages/join.js'
 import { compressTextures } from './stages/textures.js'
 import { forceOpaque } from './stages/opaque.js'
+import { addShipMarkers, shipFitStage } from './stages/shipFit.js'
+import { shipMaterials } from './stages/shipMaterials.js'
+import { loadShipSpec } from '../content/load.js'
+import type { ShipSpec } from '../../src/sim/world/ships.js'
 
 export const ALLOWED_REQUIRED_EXTENSIONS: readonly string[] = ['EXT_texture_webp']
 
@@ -43,7 +47,7 @@ export function partNames(entry: ModelEntry): string[] {
 }
 
 /** Every stage, in order, on a document already read. Mutates and returns it. */
-export async function runPipeline(doc: Document, entry: ModelEntry): Promise<Document> {
+export async function runPipeline(doc: Document, entry: ModelEntry, shipSpec: (id: string) => ShipSpec = loadShipSpec): Promise<Document> {
   doc.setLogger(new Logger(Logger.Verbosity.WARN))
   const splitNames = new Set(entry.split.map((s) => s.name))
   // 1. remove (source nodes)
@@ -66,12 +70,18 @@ export async function runPipeline(doc: Document, entry: ModelEntry): Promise<Doc
     }
     normalizeDocument(doc, entry.normalize)
   }
+  // Ships (ship-models spec §4-§5): the residual fit and skirt, then the palette roles.
+  const ship = entry.ship ? { block: entry.ship, spec: shipSpec(entry.ship.spec) } : null
+  const fitted = ship ? shipFitStage(doc, ship.block, ship.spec) : null
+  if (ship && fitted) shipMaterials(doc, ship.block, fitted.flightDeckY)
   // 5. join everything except the parts
   await joinExcept(doc, new Set([...entry.keep.map((k) => k.as ?? k.node), ...entry.keep.map((k) => k.node), ...splitNames]))
   // 6. textures, 7. opaque
   await compressTextures(doc, entry.textures.maxSize)
   if (entry.opaque) forceOpaque(doc)
   await doc.transform(prune({ keepSolidTextures: true, keepLeaves: false }))
+  // After prune, which drops empty leaf nodes: the runtime's markers are exactly that.
+  if (ship && fitted) addShipMarkers(doc, ship.block, ship.spec, fitted)
   // Provenance travels inside the file (checked by tests/tools/models/outputs.test.ts).
   const asset = doc.getRoot().getAsset()
   asset.extras = { ...(asset.extras ?? {}), source: entry.source.url, author: entry.source.author, license: entry.source.license }
@@ -90,13 +100,18 @@ export function checkOutput(doc: Document, byteLength: number, entry: ModelEntry
   if (m.drawCalls > b.maxDrawCalls) out.push(`${m.drawCalls} draw calls > budget ${b.maxDrawCalls}`)
   const badExt = m.extensionsRequired.filter((e) => !ALLOWED_REQUIRED_EXTENSIONS.includes(e))
   if (badExt.length) out.push(`extensionsRequired has ${badExt.join(', ')}: GLTFLoader has no decoder for it`)
-  if (entry.opaque && m.blendMaterials.length) out.push(`BLEND materials: ${m.blendMaterials.join(', ')}`)
+  if ((entry.opaque || entry.ship) && m.blendMaterials.length) out.push(`BLEND materials: ${m.blendMaterials.join(', ')}`)
   if (m.maxTextureSize > entry.textures.maxSize) out.push(`a ${m.maxTextureSize}px texture > maxSize ${entry.textures.maxSize}`)
   const names = doc.getRoot().listNodes().map((n) => n.getName())
   for (const p of partNames(entry)) {
     const count = names.filter((n) => n === p).length
     if (count !== 1) out.push(`part "${p}": expected exactly one node, found ${count}`)
   }
+  if (entry.ship) {
+    const metallic = doc.getRoot().listMaterials().filter((mat) => mat.getMetallicFactor() !== 0).map((mat) => mat.getName())
+    if (metallic.length) out.push(`metallicFactor is not 0: ${metallic.join(', ')}`)
+    if (names.filter((n) => n === 'SmokeOrigin').length !== 1) out.push('a ship needs exactly one SmokeOrigin node')
+  }
   if (entry.noseNode !== undefined && names.includes(entry.noseNode)) {
     const centerX = (name: string): number => { const bb = getBounds(findNode(doc, name)); return (bb.min[0] + bb.max[0]) / 2 }
     const nose = centerX(entry.noseNode)
@@ -138,7 +153,16 @@ export async function runBuild(entries: readonly ModelEntry[], argv: readonly st
       if (explicit) failed = true
       continue
     }
-    const doc = await runPipeline(await deps.read(entry.input), entry)
+    let doc: Document
+    try {
+      doc = await runPipeline(await deps.read(entry.input), entry)
+    } catch (error) {
+      // A stage that refuses its input (a ship fit out of tolerance, a missing node) fails
+      // this entry by name and writes nothing; the rest still build.
+      deps.log(`FAILED ${entry.id}, nothing written: ${error instanceof Error ? error.message : String(error)}`)
+      failed = true
+      continue
+    }
     const bytes = await deps.encode(doc)
     const problems = checkOutput(doc, bytes.byteLength, entry)
     if (problems.length) {
```

- [x] **Step 6: Run the new tests and Z1's.**

Run: `npx vitest run tests/tools/models/ --maxWorkers=2`
Expected: PASS, 44 tests in 7 files (Z1's 37, unchanged, plus these 7).

- [x] **Step 7: Verify and commit.** Re-diff `manifest.ts` and `build.ts` against `HEAD` first: only the hunks above.

```bash
flock /tmp/ww2airsim-fullsuite.lock sh -c 'npm run typecheck && npm run lint && npm run depcruise && npx vitest run --maxWorkers=2'; rc=$?; echo "rc=$rc"
git add tools/models/manifest.ts tools/models/build.ts tools/models/stages/shipFit.ts tools/models/stages/shipMaterials.ts tests/tools/models/shipStages.test.ts
git commit -m "S1: the ship block, the shipFit and shipMaterials stages, ship markers after prune, and a per-entry build failure (S1 Task 2)"
```

---

### Task 3: The raw inputs, the three entries, the build, and the committed glbs with their `ASSETS.md` rows

**Files:**
- Create: `tools/models/entries/essex-cv.json`, `fletcher-dd.json`, `type-b-maru.json`
- Create (built): `content/ships/essex-cv.glb`, `fletcher-dd.glb`, `type-b-maru.glb`
- Modify: `ASSETS.md`
- Test: `tests/tools/models/outputs.test.ts` (Z1's, unchanged; it now runs on the ship entries too)

**Interfaces:**
- Consumes: Task 2's `ship` block and stages.
- Produces: the three committed glbs at `content/ships/<id>.glb`, each carrying `asset.extras.shipFit`, a `SmokeOrigin` node, and for `essex-cv` a `TrapBand` node with `extras.halfWidthM`.

- [x] **Step 1: Put the raw inputs where the entries read them.** `tools/models/cache/` is gitignored (`/tools/**/cache/`) and does not exist in this worktree yet.

```bash
mkdir -p tools/models/cache
C=/home/mark/projects/ww2airsim/content/models/candidates
cp $C/enterprise-cv6.glb $C/fletcher-dd.glb $C/liberty-ship.glb tools/models/cache/
sha256sum -c <<'EOF'
74a85f09b7fb3d79af14efe38924284ad3dd23fce9f1846c839a36d72edfb515  tools/models/cache/enterprise-cv6.glb
847a5fe51a34b7bc1caba03dbebb28d310789f3f9b0ff409e1ff9cee802de127  tools/models/cache/fletcher-dd.glb
d20e2d2719dd8e6a4175658c36ba5173ca873911d2c44856225ae34e634871ad  tools/models/cache/liberty-ship.glb
EOF
```

Expected: three `OK` lines. If a file is missing, re-fetch it with `tools/models/sketchfab-fetch.sh <uid> <name>` (uids in the entries below; the token comes from 1Password and the script never prints it), then re-check. **If a hash differs, stop and report it:** every number in this plan was measured on these bytes.

- [x] **Step 2: Re-read each license from the API, and cross-check the provenance the file carries.** A download is not a license check (`ASSETS.md`).

```bash
for u in bf79e093d4c94b0eb02097c178dd6e98 5cddc3309139413e8c08462c8741b884 a1db8e8414464c5d8b11383e202fcf26; do
  curl -sS https://api.sketchfab.com/v3/models/$u | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['uid'], d['user']['username'], d['license']['slug'], d['isDownloadable'], d.get('price'))"
done
for f in enterprise-cv6 fletcher-dd liberty-ship; do
  python3 -c "import json,struct,sys; b=open('tools/models/cache/$f.glb','rb').read(); n=struct.unpack('<I',b[12:16])[0]; print('$f', json.loads(b[20:20+n])['asset'].get('extras'))"
done
```

Expected: `KTKloss by True None`, `hellomynameis.jeffz by True None`, `AlanTinka by True None`; each `asset.extras` names the same author and `CC-BY-4.0`. Record both outputs in the ledger. **Anything other than `by`, downloadable and unpriced: stop and report.** Spec §4.4 says a model that fails is replaced by its §2 alternate, never forced; that is Mark's call.

- [x] **Step 3: Write the entries.** The numbers are this plan's measurements (above).

`tools/models/entries/essex-cv.json`:

```json
{
  "id": "essex-cv",
  "input": "tools/models/cache/enterprise-cv6.glb",
  "output": "content/ships/essex-cv.glb",
  "source": {
    "url": "https://sketchfab.com/3d-models/uss-enterprise-model-for-small-scale-printing-bf79e093d4c94b0eb02097c178dd6e98",
    "uid": "bf79e093d4c94b0eb02097c178dd6e98",
    "author": "KTKloss",
    "license": "CC-BY-4.0"
  },
  "normalize": { "forward": "-z", "up": "+y", "origin": [0, 0, 0.6621], "fit": { "extent": "length", "meters": 265.8 } },
  "textures": { "maxSize": 1024, "format": "webp" },
  "opaque": false,
  "budget": { "maxBytes": 1500000, "maxTriangles": 60000, "maxDrawCalls": 8 },
  "ship": {
    "spec": "essex-cv",
    "fit": "deck",
    "kind": "waterline",
    "palette": "usn-1944",
    "otherMaterials": "classify",
    "smokeOrigin": [6, 32.5, 15],
    "bow": "island-starboard"
  }
}
```

`tools/models/entries/fletcher-dd.json`:

```json
{
  "id": "fletcher-dd",
  "input": "tools/models/cache/fletcher-dd.glb",
  "output": "content/ships/fletcher-dd.glb",
  "source": {
    "url": "https://sketchfab.com/3d-models/fletcher-5cddc3309139413e8c08462c8741b884",
    "uid": "5cddc3309139413e8c08462c8741b884",
    "author": "JZHU",
    "license": "CC-BY-4.0"
  },
  "normalize": { "forward": "+x", "up": "+y", "origin": [0.0021, 0, 0], "fit": { "extent": "length", "meters": 114.8 } },
  "textures": { "maxSize": 1024, "format": "webp" },
  "opaque": false,
  "budget": { "maxBytes": 3000000, "maxTriangles": 45000, "maxDrawCalls": 12 },
  "ship": {
    "spec": "fletcher-dd",
    "fit": "hull",
    "kind": "full-hull",
    "palette": "usn-1944",
    "materials": {
      "hullgrey": "hull", "deck": "deck", "hullred": "antifouling", "hulldark": "boot",
      "mesh": "mask", "mesh1": "mask", "mesh2": "mask", "radar": "mask"
    },
    "otherMaterials": "fitting",
    "smokeOrigin": [8.5, 15, 0],
    "bow": "narrow-end",
    "keelM": -3.885
  }
}
```

`tools/models/entries/type-b-maru.json`:

```json
{
  "id": "type-b-maru",
  "input": "tools/models/cache/liberty-ship.glb",
  "output": "content/ships/type-b-maru.glb",
  "source": {
    "url": "https://sketchfab.com/3d-models/liberty-ship-a1db8e8414464c5d8b11383e202fcf26",
    "uid": "a1db8e8414464c5d8b11383e202fcf26",
    "author": "AlanTinka",
    "license": "CC-BY-4.0"
  },
  "normalize": { "forward": "+z", "up": "+y", "origin": [-0.0003, 0.0075, 0], "fit": { "extent": "length", "meters": 112 } },
  "textures": { "maxSize": 1024, "format": "webp" },
  "opaque": false,
  "budget": { "maxBytes": 4000000, "maxTriangles": 45000, "maxDrawCalls": 4 },
  "ship": {
    "spec": "type-b-maru",
    "fit": "hull",
    "kind": "full-hull",
    "palette": "usn-1944",
    "otherMaterials": "keep",
    "smokeOrigin": [-1, 15, 0],
    "bow": { "pinnedNarrowEnd": 0.938, "evidence": "rudder and propeller at -x, raked stem and anchors at +x, ensign aft (side render 2026-09-25)" },
    "keelM": -5.348
  }
}
```

- [x] **Step 4: Build them, by id.** Never a bare `models:build` (the frozen Wildcat is skipped by one, but by id is the rule here), and never `--force`.

Run: `npm run models:build -- essex-cv fletcher-dd type-b-maru`
Expected, measured with this plan's drafts on 2026-09-25:

```text
built essex-cv -> content/ships/essex-cv.glb: 671660 bytes, 15465 triangles, 5 draw calls
built fletcher-dd -> content/ships/fletcher-dd.glb: 1782996 bytes, 43316 triangles, 9 draw calls
built type-b-maru -> content/ships/type-b-maru.glb: 2900088 bytes, 42735 triangles, 1 draw calls
```

A `FAILED <id>, nothing written: …` line names the tolerance and its measured value. Do not loosen a tolerance or edit a sim number to pass it: stop and report (spec §4.4). A few bytes' difference from the figures above is not a failure, but record it.

- [x] **Step 5: Confirm nothing else moved.**

```bash
sha256sum content/aircraft/wildcat.glb   # 3f7a6ccff7ea1e2f1362cfa44f9b13dbba1fea4130d015dbd4c3d9b704d58d6e
git status --short                       # the three entries and the three glbs, nothing else
```

- [x] **Step 6: `ASSETS.md`.** In the "3D models" table, add these three rows after the `wildcat.glb` row:

```markdown
| `content/ships/essex-cv.glb` | https://sketchfab.com/3d-models/uss-enterprise-model-for-small-scale-printing-bf79e093d4c94b0eb02097c178dd6e98 | KTKloss | CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/), author credit required |
| `content/ships/fletcher-dd.glb` | https://sketchfab.com/3d-models/fletcher-5cddc3309139413e8c08462c8741b884 | JZHU (@hellomynameis.jeffz) | CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/), author credit required |
| `content/ships/type-b-maru.glb` | https://sketchfab.com/3d-models/liberty-ship-a1db8e8414464c5d8b11383e202fcf26 | AlanTinka | CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/), author credit required |
```

After the Wildcat's paragraph, add:

```markdown
The three ship glbs (S1, <today>) are built by `npm run models:build` from
`tools/models/entries/{essex-cv,fletcher-dd,type-b-maru}.json`. Each license
was read from `api.sketchfab.com/v3/models/<uid>` on the fetch date,
2026-09-25, and re-read on <today>: CC BY 4.0, downloadable, unpriced. The
build changed each download: it fitted it to its `content/ships/*.json`
(deck- or hull-fit, spec `docs/superpowers/specs/2026-09-25-ship-models-design.md`
§4), recolored it in palette roles with metalness 0, set lattice alpha to MASK,
dropped unused attributes, tangents and `KHR_materials_specular`, and
re-encoded textures as WebP. Two are stand-ins: USS Enterprise (CV-6),
Yorktown class, 15,339 triangles, rendered as the Essex-class `essex-cv`, with
a 3 m skirt below its waterline cut; and a Liberty ship, 42,735 triangles,
rendered as the Japanese Type B freighter `type-b-maru`. The Fletcher, 43,316
triangles, is its own class. `src/render/scene/ship.ts`'s procedural hulls stay
as the fallback for a ship with no model.
```

In "Candidate models", delete the `fletcher-dd.glb` row: it is no longer a candidate.

- [x] **Step 7: Run Z1's committed-output tests on the new entries.**

Run: `npx vitest run tests/tools/models/outputs.test.ts --maxWorkers=2`
Expected: PASS, 13 tests (3 per entry across 4 entries, and the Wildcat's clip): each ship glb exists, meets its budget and extensions, carries its provenance, and has its `ASSETS.md` row.

- [x] **Step 8: Record, verify and commit.** Write the three build lines, the license output and the hashes into the ledger.

```bash
flock /tmp/ww2airsim-fullsuite.lock sh -c 'npm run typecheck && npm run lint && npm run depcruise && npx vitest run --maxWorkers=2'; rc=$?; echo "rc=$rc"
git add tools/models/entries/essex-cv.json tools/models/entries/fletcher-dd.json tools/models/entries/type-b-maru.json content/ships/essex-cv.glb content/ships/fletcher-dd.glb content/ships/type-b-maru.glb ASSETS.md
git commit -m "S1: the CV-6, Fletcher and Liberty entries, their fitted glbs, and their ASSETS.md rows (S1 Task 3)"
```

---

### Task 4: Tier 1 acceptance of the committed ship glbs

**Files:**
- Create: `tests/tools/shipModels.test.ts`
- Modify: `tests/build/dist.test.ts`

**Interfaces:**
- Consumes: Task 1's `fitProblems`, `residualProblems`, `trapLaneHalfWidth`, `surfaceBelow`, `bounds`; Task 2's `documentSoup`, `SMOKE_REACH_M`; Task 3's glbs; `loadShipSpec`.
- Produces: nothing new. This is spec §9's Tier 1 items 1 to 5 for what `outputs.test.ts` does not already check.

This test reads the **committed** bytes and re-measures them against the **live** `content/ships/*.json`. It passes on its first run, because Task 3 built what it checks; the negative control in it (a raised deck) is what shows it bites.

- [x] **Step 1: Write the test.** `tests/tools/shipModels.test.ts`:

```ts
// tests/tools/shipModels.test.ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadModelEntries } from '../../tools/models/manifest.js'
import { findNode, modelIO } from '../../tools/models/document.js'
import { documentSoup, SMOKE_REACH_M } from '../../tools/models/stages/shipFit.js'
import { bounds, fitProblems, residualProblems, surfaceBelow, trapLaneHalfWidth, type ShipFit } from '../../src/render/scene/shipFit.js'
import { loadShipSpec } from '../../tools/content/load.js'

/**
 * Tier 1 for every committed ship glb (ship-models spec §9, items 1-5), on a
 * fresh clone: the COMMITTED bytes, re-measured against the LIVE
 * content/ships/<id>.json. Budgets, extensions, BLEND, metalness, source,
 * license and the ASSETS.md row are tests/tools/models/outputs.test.ts's,
 * which runs on every entry, ships included. If Plan 8 moves the deck, this
 * fails naming the quantity. The fix: tools/models/sketchfab-fetch.sh to
 * re-acquire the gitignored raw input, then `npm run models:build -- <id>`.
 */
const ships = loadModelEntries().filter((e) => e.ship !== undefined)
const read = async (path: string) => modelIO().readBinary(new Uint8Array(readFileSync(path)))

describe('the committed ship models', () => {
  it('are the three S1 ships', () => {
    expect(ships.map((e) => e.id)).toEqual(['essex-cv', 'fletcher-dd', 'type-b-maru'])
  })
})

describe.each(ships.map((e) => [e.id, e] as const))('committed ship %s', (_id, entry) => {
  const ship = entry.ship!

  it('names the entry\'s author inside the file (§9 item 1)', async () => {
    const extras = (await read(entry.output)).getRoot().getAsset().extras as Record<string, unknown>
    expect(extras['author']).toBe(entry.source.author)
  })

  it('records a fit whose residuals lie inside §4.4\'s design ranges', async () => {
    const extras = (await read(entry.output)).getRoot().getAsset().extras as Record<string, unknown>
    const fit = extras['shipFit'] as ShipFit & { spec: string }
    expect(fit.spec).toBe(ship.spec)
    expect(residualProblems(fit, ship)).toEqual([])
  })

  it('still fits the live ShipSpec: every §4.4 tolerance, the bow and the waterline (§9 items 3-4)', async () => {
    expect(fitProblems(documentSoup(await read(entry.output)), loadShipSpec(ship.spec), ship).problems).toEqual([])
  })

  it('carries SmokeOrigin at the entry\'s point, within reach of the surface below it (§4.6)', async () => {
    const doc = await read(entry.output)
    const at = findNode(doc, 'SmokeOrigin').getTranslation()
    expect(at).toEqual(ship.smokeOrigin)
    const soup = documentSoup(doc)
    expect(at[1]).toBeLessThanOrEqual(bounds(soup).max[1] + SMOKE_REACH_M)
    const under = surfaceBelow(soup, at[0], at[2], at[1])
    expect(under).not.toBeNull()
    expect(at[1] - under!).toBeLessThanOrEqual(SMOKE_REACH_M)
  })
})

describe('essex-cv specifically', () => {
  const entry = ships.find((e) => e.id === 'essex-cv')!
  const cv = loadShipSpec('essex-cv')

  it('carries TrapBand at the trap zone\'s center on the deck, as wide as its own island leaves clear', async () => {
    const doc = await read(entry.output)
    const band = findNode(doc, 'TrapBand')
    const fd = cv.flightDeck!, tz = cv.trapZone!
    expect(band.getTranslation()[0]).toBeCloseTo(-fd.lengthM / 2 + (tz.fromSternM + tz.toSternM) / 2, 6)
    expect(band.getTranslation()[1]).toBe(fd.heightM)
    expect(band.getExtras()['halfWidthM']).toBeCloseTo(trapLaneHalfWidth(documentSoup(doc), cv), 9)
  })

  it('fails, naming the deck, if Plan 8 raises the deck to 18 m (the check bites)', async () => {
    const raised = { ...cv, deckHeightM: 18, flightDeck: { ...cv.flightDeck!, heightM: 18 } }
    const { problems } = fitProblems(documentSoup(await read(entry.output)), raised, entry.ship!)
    expect(problems.join('; ')).toMatch(/deck plane at 17\.0\d\d m vs flightDeck\.heightM 18/)
  })
})

describe('fletcher-dd specifically', () => {
  it('has its waterline on its own boot-top seam: the antifouling role tops out at y = 0 amidships (§4.2)', async () => {
    const doc = await read(ships.find((e) => e.id === 'fletcher-dd')!.output)
    let top = -Infinity
    for (const p of doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())) {
      if (p.getMaterial()?.getName() !== 'ship:antifouling') continue
      const a = p.getAttribute('POSITION')!.getArray()!
      for (let i = 0; i < a.length / 3; i++) if (Math.abs(a[3 * i]!) < 10) top = Math.max(top, a[3 * i + 1]!)
    }
    expect(Math.abs(top)).toBeLessThanOrEqual(0.05)
  })
})
```

- [x] **Step 2: Run it.**

Run: `npx vitest run tests/tools/shipModels.test.ts --maxWorkers=2`
Expected: PASS, 16 tests. (Measured through a probe on this plan's scratch builds: every assertion held, `TrapBand` 9.25 m against 9.25 m re-measured, the Fletcher's antifouling top 0.0000.)

- [x] **Step 3: The build artifact.** In `tests/build/dist.test.ts`, add the import:

```ts
import { loadModelEntries } from '../../tools/models/manifest.js'
```

and, directly after the `expect(statSync(join(outDir, WILDCAT_MODEL_PATH)).size).toBe(5_573_316)` line:

```ts
      // Ship models (ship-models spec §9): every ship entry's glb reaches
      // dist/ whole. Compared with the committed file, not a literal: a
      // rebuild is legitimate, and tests/tools/shipModels.test.ts re-measures it.
      for (const e of loadModelEntries().filter((x) => x.ship !== undefined)) {
        expect(statSync(join(outDir, e.output)).size, e.output).toBe(statSync(e.output).size)
      }
```

Run, alone on the machine (it builds twice into `os.tmpdir()`): `flock /tmp/ww2airsim-fullsuite.lock npx vitest run tests/build/dist.test.ts --maxWorkers=2`
Expected: PASS.

- [x] **Step 4: Verify and commit.** Re-diff `dist.test.ts` against `HEAD` first.

```bash
flock /tmp/ww2airsim-fullsuite.lock sh -c 'npm run typecheck && npm run lint && npm run depcruise && npx vitest run --maxWorkers=2'; rc=$?; echo "rc=$rc"
git add tests/tools/shipModels.test.ts tests/build/dist.test.ts
git commit -m "S1: Tier 1 on the committed ship glbs against the live ShipSpecs, and their dist bytes (S1 Task 4)"
```

---

### Task 5: `ship.ts`: the model view, the list fix, the sink depth, and the deck probe

**Files:**
- Modify: `src/render/scene/ship.ts`
- Test: `tests/render/ship.test.ts`

**Interfaces:**
- Consumes: `ModelInstance` (`models/modelCache.ts`), `disposeMeshTree` (`models/dispose.ts`), Task 1's `SHIP_PALETTES`.
- Produces:
  - `interface ShipView { root: Object3D; model: string | null; setDamage(fire, sinkingFraction): void; dispose(): void }`
  - `createShipMesh(spec): ShipView`, the boxes, now with `model: null` and a `dispose` that frees its own tree
  - `createShipView(spec, modelId, instance): ShipView`, which throws, naming it, when a node it needs is missing
  - `probeShipSurface(view, points, space: 'ship' | 'world'): (number | null)[]`

Photoreal Task 12 has landed (`1fd81d1`) and did not edit `ship.ts` (spec §5.4's sequencing is met). The boxes keep their exact colors: the palette's `hull` and `flightDeck` are the two literals `ship.ts` drew before.

- [x] **Step 1: Change the tests first.** In `tests/render/ship.test.ts`, replace the imports with:

```ts
import { describe, it, expect, vi } from 'vitest'
import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, Object3D } from 'three'
import { createShipMesh, createShipView, probeShipSurface } from '../../src/render/scene/ship.js'
import { createModelCache } from '../../src/render/models/modelCache.js'
import { loadShipSpec } from '../../tools/content/load.js'
```

In the `setDamage sinks and lists…` test, the list moves from a trim to a roll (spec §6):

```diff
     const hullGroup = root.getObjectByName('hull group')!
     expect(hullGroup.position.y).toBe(0)
-    expect(hullGroup.rotation.z).toBe(0)
+    expect(hullGroup.rotation.x).toBe(0)
     expect(root.visible).toBe(true)
 
     setDamage(0, 0.5)
     expect(hullGroup.position.y).toBeLessThan(0)
-    expect(hullGroup.rotation.z).not.toBe(0)
+    // A list is a roll about the keel (+x). Before S1 this was rotation.z, a bow-down trim (ship-models spec §6).
+    expect(hullGroup.rotation.x).toBeCloseTo(-4 * Math.PI / 180, 12)
+    expect(hullGroup.rotation.z).toBe(0)
```

Append at the end of the file:

```ts
/**
 * A synthetic fitted model, as a committed ship glb parses: bow +x,
 * waterline y = 0, a mast top at 30 m, `SmokeOrigin`, and on a carrier
 * `TrapBand` with its half-width. GLTFLoader never runs in Node, so the
 * cache's parse is injected (Z1's pattern, tests/render/scenarioEntities.test.ts).
 */
function syntheticShip(opts: { trapBand?: boolean; smoke?: boolean } = {}): Object3D {
  const root = new Group()
  const hull = new Mesh(new BoxGeometry(100, 10, 12), new MeshStandardMaterial({ color: 0x5c6670 }))
  hull.position.y = 2
  const mast = new Mesh(new BoxGeometry(1, 20, 1), new MeshStandardMaterial())
  mast.position.set(10, 20, 0)
  root.add(hull, mast)
  if (opts.smoke !== false) { const s = new Object3D(); s.name = 'SmokeOrigin'; s.position.set(-4, 18, 1); root.add(s) }
  if (opts.trapBand) { const t = new Object3D(); t.name = 'TrapBand'; t.userData['halfWidthM'] = 9.25; root.add(t) }
  return root
}

describe('ship models (ship-models spec §3, §6)', () => {
  const cv = loadShipSpec('essex-cv'), dd = loadShipSpec('fletcher-dd')

  it('a model view hangs the instance unmoved in hull group, smokes at SmokeOrigin, and sinks by its top plus 2 m about the keel', async () => {
    const cache = createModelCache(async () => syntheticShip())
    const view = createShipView(dd, 'fletcher-dd', await cache.acquire('x.glb'))
    const hullGroup = view.root.getObjectByName('hull group')!
    expect(view.model).toBe('fletcher-dd')
    const box = new Box3().setFromObject(hullGroup.children[0]!)
    expect([box.min.x, box.max.x, box.max.y]).toEqual([-50, 50, 30]) // unmoved: bow +x, waterline 0
    expect(view.root.getObjectByName('ship smoke')!.position.toArray()).toEqual([-4, 18, 1])
    view.setDamage(0, 0.5)
    expect(hullGroup.position.y).toBeCloseTo(-0.5 * (30 + 2), 9)
    expect(hullGroup.rotation.x).toBeCloseTo(-4 * Math.PI / 180, 12)
    view.setDamage(0, 1)
    expect(view.root.visible).toBe(false)
  })

  it('a carrier model draws the trap band from the spec, as wide as the model leaves clear', async () => {
    const cache = createModelCache(async () => syntheticShip({ trapBand: true }))
    const view = createShipView(cv, 'essex-cv', await cache.acquire('cv.glb'))
    const band = view.root.getObjectByName('trap zone') as Mesh
    band.geometry.computeBoundingBox()
    const bb = band.geometry.boundingBox!
    expect(bb.max.z - bb.min.z).toBeCloseTo(18.5, 6)
    expect(bb.min.x + band.position.x).toBeCloseTo(-cv.flightDeck!.lengthM / 2 + cv.trapZone!.fromSternM, 6)
    expect(bb.max.y + band.position.y).toBeCloseTo(cv.flightDeck!.heightM + 0.05, 6)
  })

  it('every mesh of a model view receives shadow (Plan 16b), and two instances share === materials', async () => {
    const cache = createModelCache(async () => syntheticShip())
    const a = createShipView(dd, 'fletcher-dd', await cache.acquire('dd.glb'))
    const b = createShipView(dd, 'fletcher-dd', await cache.acquire('dd.glb'))
    const meshes = (v: typeof a): Mesh[] => { const out: Mesh[] = []; v.root.traverse((o) => { if (o instanceof Mesh) out.push(o) }); return out }
    for (const m of meshes(a)) expect(m.receiveShadow).toBe(true)
    const hullA = meshes(a).find((m) => m.geometry instanceof BoxGeometry && m.geometry.parameters.width === 100)!
    const hullB = meshes(b).find((m) => m.geometry instanceof BoxGeometry && m.geometry.parameters.width === 100)!
    expect(hullA.material).toBe(hullB.material)
  })

  it('dispose releases the instance (never disposes shared materials) and frees the smoke and band it owns', async () => {
    const cache = createModelCache(async () => syntheticShip({ trapBand: true }))
    const view = createShipView(cv, 'essex-cv', await cache.acquire('cv.glb'))
    const other = createShipView(cv, 'essex-cv', await cache.acquire('cv.glb'))
    const shared = (view.root.getObjectByName('hull group')!.children[0]!.children[0] as Mesh).material as MeshStandardMaterial
    const spy = vi.spyOn(shared, 'dispose')
    expect(cache.refCount('cv.glb')).toBe(2)
    view.dispose()
    view.dispose()
    expect(cache.refCount('cv.glb')).toBe(1)
    expect(spy).not.toHaveBeenCalled()
    other.dispose()
    expect(cache.refCount('cv.glb')).toBe(0)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('the boxes still sink by their own top plus 2 m, and carry no model id', () => {
    const view = createShipMesh(dd)
    const hullGroup = view.root.getObjectByName('hull group')!
    // The hull's own top, without the smoke plume, which rides above it.
    const smoke = hullGroup.getObjectByName('ship smoke')!
    hullGroup.remove(smoke)
    const top = new Box3().setFromObject(hullGroup).max.y
    hullGroup.add(smoke)
    expect(top).toBe(21) // the escort's stack: deck 6 + superstructure 7 + stack 8
    view.setDamage(0, 1)
    expect(view.model).toBeNull()
    expect(view.root.getObjectByName('hull group')!.position.y).toBeCloseTo(-(top + 2), 9)
  })
})

describe('probeShipSurface (the Tier 2 deck probe, spec §9)', () => {
  it('finds the posed deck under ship-frame and world points, the trap band on top of it, and nothing off the ship', () => {
    const cv = loadShipSpec('essex-cv')
    const fd = cv.flightDeck!, tz = cv.trapZone!
    const view = createShipMesh(cv)
    view.root.position.set(1000, 0, -500)
    view.root.rotation.y = Math.PI / 2 // ship +x (bow) -> world -z
    view.setDamage(1, 0) // the smoke is showing, and must not count as a surface
    const trapCenter = -fd.lengthM / 2 + (tz.fromSternM + tz.toSternM) / 2
    const bow = fd.lengthM / 2 - 5
    const [onBand, nearBow] = probeShipSurface(view, [{ x: trapCenter, z: 0 }, { x: bow, z: 0 }], 'ship')
    expect(onBand).toBeCloseTo(fd.heightM + 0.05, 4)
    expect(nearBow).toBeCloseTo(fd.heightM, 4)
    expect(probeShipSurface(view, [{ x: 1000, z: -500 - bow }], 'world')[0]).toBeCloseTo(fd.heightM, 4)
    expect(probeShipSurface(view, [{ x: 0, z: 0 }], 'world')).toEqual([null])
  })
})
```

- [x] **Step 2: Run it to see it fail.**

Run: `npx vitest run tests/render/ship.test.ts --maxWorkers=2`
Expected: FAIL. `createShipView` and `probeShipSurface` are not exported, and the list test reads `rotation.x` as 0.

- [x] **Step 3: Implement.** `src/render/scene/ship.ts` becomes:

```ts
import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, Raycaster, Vector3, type Object3D } from 'three'
import type { ShipSpec } from '../../sim/world/ships.js'
import { createEngineSmoke } from './smoke.js'
import { disposeMeshTree } from '../models/dispose.js'
import type { ModelInstance } from '../models/modelCache.js'
import { SHIP_PALETTES } from './shipPalette.js'

/** A fixed list angle once a hull is taking on water, degrees (Plan 6b Task
 *  8, spec §4). Always the same side -- a ship that could list either way
 *  randomly would look like it was rocking, not sinking. */
const LIST_DEG = 8

/** How far below its own top a sinking ship goes before `root` hides, meters (ship-models spec §6). */
const SINK_MARGIN_M = 2

/** The trap band's color, and its thickness: it sits 0.025 m proud of the deck (Plan 8). */
const TRAP_BAND_COLOR = 0x6b7480
const TRAP_BAND_THICKNESS_M = 0.05

/**
 * One ship as the renderer sees it: `root` is what `main.ts` poses each
 * frame; `setDamage` sinks, lists and smokes an inner `hull group`; `dispose`
 * frees what this view owns. `model` is the registry id drawn, or null for
 * the procedural boxes.
 */
export interface ShipView {
  readonly root: Object3D
  readonly model: string | null
  setDamage(fire: number, sinkingFraction: number): void
  /** Idempotent. A model view RELEASES its shared instance; it never disposes it (modelCache.ts). */
  dispose(): void
}

/** The carrier's trap band, fromSternM..toSternM along a deck `lengthM` long, `halfWidthM` either side of the centerline. */
function trapBand(spec: ShipSpec, halfWidthM: number): Mesh | null {
  if (spec.flightDeck === undefined || spec.trapZone === undefined) return null
  const { lengthM, heightM } = spec.flightDeck
  const { fromSternM, toSternM } = spec.trapZone
  const band = new Mesh(new BoxGeometry(toSternM - fromSternM, TRAP_BAND_THICKNESS_M, 2 * halfWidthM), new MeshStandardMaterial({ color: TRAP_BAND_COLOR, roughness: 0.9 }))
  band.name = 'trap zone'
  band.position.set(-lengthM / 2 + (fromSternM + toSternM) / 2, heightM + TRAP_BAND_THICKNESS_M / 2, 0)
  return band
}

/**
 * The part of a view both paths share: the damage smoke at `smokeAt`, the
 * sink depth from the hull's own top, `receiveShadow` on every mesh (Plan
 * 16b), and `setDamage`. The list is a roll about the keel (+x), 8 degrees to
 * a fixed side: before S1 it was `rotation.z`, which with the bow on +x is a
 * bow-down trim, not the list the strike design §4 specifies (ship-models
 * spec §1, §6).
 */
function finishView(root: Group, hullGroup: Group, smokeAt: { x: number; y: number; z: number }, model: string | null, release: () => void): ShipView {
  const sinkDepthM = new Box3().setFromObject(hullGroup).max.y + SINK_MARGIN_M
  const smoke = createEngineSmoke()
  smoke.object.name = 'ship smoke'
  // Scaled up: the airplane version is authored at airframe scale, and a ship's stack is an order of magnitude bigger.
  smoke.object.scale.setScalar(5)
  smoke.object.position.set(smokeAt.x, smokeAt.y, smokeAt.z)
  hullGroup.add(smoke.object)
  root.traverse((o) => { o.receiveShadow = true }) // Plan 16b, see hellcat.ts
  let disposed = false
  return {
    root,
    model,
    setDamage(fire: number, sinkingFraction: number): void {
      const sinking = Math.min(1, Math.max(0, sinkingFraction))
      hullGroup.position.y = -sinking * sinkDepthM
      hullGroup.rotation.x = -sinking * (LIST_DEG * Math.PI / 180)
      root.visible = sinking < 1
      smoke.set(1 - Math.min(1, Math.max(0, fire)), sinking >= 1)
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      hullGroup.remove(smoke.object)
      disposeMeshTree(smoke.object)
      release()
    },
  }
}

/**
 * A ship as boxes, scaled from its class record. Bow along local +x, the
 * waterline at local y = 0, so `main.ts` poses it with the same yaw the
 * parked airplane uses (`pi/2 - headingRad` about +y, `parkedAttitude` in
 * `src/sim/world/airfields.ts`) and sets `position.y` to the state's
 * `SEA_LEVEL_M`. Original geometry, AGPL (ASSETS.md).
 *
 * Every dimension that the record carries comes from the record, including
 * the carrier's `flightDeck` and `trapZone` blocks (Plan 8); what is
 * hardcoded is what no record has: the draft, the island's size and where
 * the superstructure sits. Those are shape, not data, and a `draft` field
 * invented here would look like a sourced figure.
 *
 * Deliberately `MeshStandardMaterial`, not the `MeshStandardNodeMaterial`
 * the terrain and the strip use: these hulls need no TSL node graph, and a
 * plain material is what `hellcat.ts` already builds its airframe from.
 */
export function createShipMesh(spec: ShipSpec): ShipView {
  if (spec.role === 'carrier' && spec.flightDeck === undefined) {
    throw new Error(`Carrier ${spec.id} is missing flightDeck`)
  }
  // `root` is the object `main.ts` poses every frame from the ship's
  // kinematic position and heading (`current.shipPoses.forEach`), so
  // `setDamage`'s sink/list below moves `hullGroup`, an inner child, instead
  // -- writing to `root.position`/`root.rotation` here would be overwritten
  // by the very next frame's pose (Plan 6b Task 8).
  const root = new Group()
  root.name = `${spec.name} hull`
  const hullGroup = new Group()
  hullGroup.name = 'hull group'
  root.add(hullGroup)
  const paint = SHIP_PALETTES['usn-1944']
  const grey = new MeshStandardMaterial({ color: paint.hull, roughness: 0.8 })
  const deck = new MeshStandardMaterial({ color: paint.flightDeck, roughness: 0.9 })
  // An ESTIMATE, and the reason it is not in the content record: neither
  // class's draft is sourced anywhere in this repository, and the hull is a
  // box either way. It decides only how much of the hull sits below the
  // waterline, which nothing but the eye reads.
  const draft = spec.role === 'carrier' ? 8.5 : 4
  const hullHeightM = spec.deckHeightM + draft
  const hull = new Mesh(new BoxGeometry(spec.lengthM, hullHeightM, spec.beamM), grey)
  hull.position.set(0, (spec.deckHeightM - draft) / 2, 0)
  hullGroup.add(hull)
  let smokeOrigin = { x: -spec.lengthM * 0.05, y: spec.deckHeightM + 12, z: 0 }
  if (spec.role === 'carrier' && spec.flightDeck !== undefined) {
    // What the eye lands on is what the sim thinks is there (Plan 8): the
    // slab's TOP is at `flightDeck.heightM`, the exact `Deck.center.y` the
    // ground constraint rests the wheels on, with the sourced 862 x 108 ft
    // planform rather than the hull's maximum beam.
    const { lengthM, widthM, heightM } = spec.flightDeck
    const slabM = 1.2
    const flightDeck = new Mesh(new BoxGeometry(lengthM, slabM, widthM), deck)
    flightDeck.name = 'flight deck'
    flightDeck.position.set(0, heightM - slabM / 2, 0)
    hullGroup.add(flightDeck)
    const band = trapBand(spec, widthM * 0.45)
    if (band) hullGroup.add(band)
    const island = new Mesh(new BoxGeometry(spec.lengthM * 0.12, 14, 6), grey)
    // Keep the island outboard of the usable 32.9 m flight deck.
    island.position.set(spec.lengthM * 0.05, heightM + 7, widthM / 2 + 3)
    hullGroup.add(island)
    smokeOrigin = { x: island.position.x, y: heightM + 14, z: island.position.z }
  } else if (spec.role === 'merchant') {
    // Spec §2.2: "the merchant gets a taller box amidships ... so it is not
    // a second destroyer at a glance" -- named distinctly from the escort's
    // `superstructure` below (both are boxes; this is the one that makes a
    // merchant read as a merchant), taller, and centred amidships (x = 0)
    // rather than offset toward the bow the way the escort's is.
    const superstructure = new Mesh(new BoxGeometry(spec.lengthM * 0.22, 11, spec.beamM * 0.6), grey)
    superstructure.name = 'merchant superstructure'
    superstructure.position.set(0, spec.deckHeightM + 5.5, 0)
    hullGroup.add(superstructure)
    smokeOrigin = { x: 0, y: spec.deckHeightM + 11 + 3, z: 0 }
  } else {
    const superstructure = new Mesh(new BoxGeometry(spec.lengthM * 0.3, 7, spec.beamM * 0.7), grey)
    superstructure.name = 'superstructure'
    superstructure.position.set(spec.lengthM * 0.1, spec.deckHeightM + 3.5, 0)
    hullGroup.add(superstructure)
    const stack = new Mesh(new BoxGeometry(3, 8, 3), deck)
    stack.position.set(-spec.lengthM * 0.05, spec.deckHeightM + 7 + 4, 0)
    hullGroup.add(stack)
    smokeOrigin = { x: stack.position.x, y: spec.deckHeightM + 7 + 8 + 2, z: 0 }
  }
  // Damaged-fire smoke, reusing `smoke.ts`'s existing engine-smoke curve
  // (`createEngineSmoke`/`smokeAppearance`) rather than a second particle
  // implementation: `fire` (0..1, `ShipDamage.fire`) plays the role
  // `engineHealth` plays for an airplane, inverted (fire is already a
  // damage fraction, not a health one).
  return finishView(root, hullGroup, smokeOrigin, null, () => { disposeMeshTree(root) })
}

/**
 * A ship drawn from its committed model (ship-models spec §3.3): `instance`
 * is this ship's own clone from the shared model cache, already fitted to
 * `spec` at build time, so it hangs in `hull group` with no transform: bow
 * +x, waterline y = 0. The glb carries what the runtime needs (§4.6): the
 * `SmokeOrigin` node, and on a carrier the `TrapBand` node whose
 * `userData.halfWidthM` keeps the band clear of the island. A missing node
 * throws, naming it, and the loader falls back to the boxes loudly.
 *
 * No material is touched: they are shared with every other instance of the
 * same URL. The trap band and the smoke are this view's own, and are
 * disposed with it; the instance is released.
 */
export function createShipView(spec: ShipSpec, modelId: string, instance: ModelInstance): ShipView {
  const root = new Group()
  root.name = `${spec.name} hull`
  const hullGroup = new Group()
  hullGroup.name = 'hull group'
  root.add(hullGroup)
  const smokeAt = instance.node('SmokeOrigin').position.clone()
  let band: Mesh | null = null
  if (spec.flightDeck !== undefined && spec.trapZone !== undefined) {
    const half = instance.node('TrapBand').userData['halfWidthM']
    if (typeof half !== 'number' || !(half > 0)) throw new Error(`ship ${spec.id}: model ${modelId}'s TrapBand has no positive userData.halfWidthM`)
    band = trapBand(spec, half)
  }
  hullGroup.add(instance.root)
  if (band) hullGroup.add(band)
  return finishView(root, hullGroup, smokeAt, modelId, () => {
    if (band) disposeMeshTree(band)
    instance.release()
  })
}

/**
 * The world height of the topmost rendered surface of `view` straight below
 * each point, or null where the ray misses it (ship-models spec §9: the Tier 2
 * proof that what the eye lands on is what the sim rests the wheels on, in the
 * real renderer and not only in Node math). `'ship'` points are in the ship's
 * own frame (+x bow, midships 0); `'world'` points are world x, z. The smoke
 * plume is not a surface and is skipped.
 */
export function probeShipSurface(view: ShipView, points: readonly { readonly x: number; readonly z: number }[], space: 'ship' | 'world'): (number | null)[] {
  view.root.updateWorldMatrix(true, true)
  const hullGroup = view.root.getObjectByName('hull group')
  if (!hullGroup) return points.map(() => null)
  const targets = hullGroup.children.filter((c) => c.name !== 'ship smoke')
  const above = new Box3().setFromObject(hullGroup).max.y + 10
  const ray = new Raycaster()
  const down = new Vector3(0, -1, 0)
  return points.map((p) => {
    const origin = space === 'ship' ? new Vector3(p.x, 0, p.z).applyMatrix4(view.root.matrixWorld) : new Vector3(p.x, 0, p.z)
    origin.y = above
    ray.set(origin, down)
    return ray.intersectObjects(targets, true)[0]?.point.y ?? null
  })
}
```

- [x] **Step 4: Run it, and the files that build boxes.**

Run: `npx vitest run tests/render/ship.test.ts tests/render/scenarioEntities.test.ts tests/render/cloudShadow.test.ts tests/render/hangar/models.test.ts --maxWorkers=2`
Expected: PASS. `ship.test.ts` has 13 tests (7 before, plus 5 model-view tests and the deck probe). The others are unchanged: `scenarioEntities.ts` still builds boxes, and a `ShipView` still has `root` and `setDamage`.

- [x] **Step 5: Verify and commit.**

```bash
flock /tmp/ww2airsim-fullsuite.lock sh -c 'npm run typecheck && npm run lint && npm run depcruise && npx vitest run --maxWorkers=2'; rc=$?; echo "rc=$rc"
git add src/render/scene/ship.ts tests/render/ship.test.ts
git commit -m "S1: ShipView, the model path, a list about the keel, sink by the hull's own top, and the deck probe (S1 Task 5)"
```

---

### Task 6: The `view` block, the ship model registry, and the loud-fallback loader

**Files:**
- Modify: `src/sim/world/ships.ts`, `content/ships/essex-cv.json`, `fletcher-dd.json`, `type-b-maru.json`, `src/render/content.ts`
- Create: `src/render/scene/shipModels.ts`
- Test: `tests/render/shipModels.test.ts` (create), `tests/render/ship.test.ts`, `tests/sim/world/ships.test.ts`

**Interfaces:**
- Consumes: Task 5's `createShipMesh`, `createShipView`, `ShipView`; `acquireModel`.
- Produces:
  - `ShipSpec['view']?: { model: string }` (render-only; `sim/` never reads it)
  - `shipModelPath(id)`, `shipModelUrl(id)` (`content.ts`)
  - `SHIP_MODELS: Record<string, { url }>`, `shipModelUrlFor(id)`, `type LoadShipView = (spec: ShipSpec) => Promise<ShipView>`, `makeShipViewLoader(reportError, acquire?)`, `loadRegisteredShipView`

After this task the three specs name their models, but nothing loads them yet: `scenarioEntities.ts` and the Hangar still call `createShipMesh` until Task 7.

- [x] **Step 1: Write the failing tests.** `tests/render/shipModels.test.ts`:

```ts
// tests/render/shipModels.test.ts
import { describe, expect, it } from 'vitest'
import { readdirSync } from 'node:fs'
import { loadShipSpec } from '../../tools/content/load.js'
import { SHIP_MODELS, shipModelUrlFor } from '../../src/render/scene/shipModels.js'
import { shipModelUrl } from '../../src/render/content.js'

const shipIds = readdirSync('content/ships').filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort()

describe('the ship model registry (ship-models spec §3.1)', () => {
  it('every content/ships JSON that names a model names a registered one', () => {
    for (const id of shipIds) {
      const model = loadShipSpec(id).view?.model
      if (model !== undefined) expect(Object.hasOwn(SHIP_MODELS, model), `${id} names "${model}"`).toBe(true)
    }
  })

  it('every registered id is its own spec id, at its own content/ships URL (spec §3.2)', () => {
    for (const [id, { url }] of Object.entries(SHIP_MODELS)) {
      expect(shipIds, id).toContain(id)
      expect(url).toBe(shipModelUrl(id))
    }
  })

  it('the three shipped specs name their models (S1)', () => {
    expect(['essex-cv', 'fletcher-dd', 'type-b-maru'].map((id) => loadShipSpec(id).view?.model)).toEqual(['essex-cv', 'fletcher-dd', 'type-b-maru'])
  })

  it('an unregistered or prototype-named id throws, naming the registry', () => {
    expect(() => shipModelUrlFor('nope')).toThrow(/no ship model "nope" \(registered: essex-cv, fletcher-dd, type-b-maru\)/)
    expect(() => shipModelUrlFor('constructor')).toThrow(/no ship model "constructor"/)
  })
})
```

In `tests/render/ship.test.ts`, add the import:

```ts
import { makeShipViewLoader, SHIP_MODELS } from '../../src/render/scene/shipModels.js'
```

and insert this `describe` between the `ship models` block and the `probeShipSurface` block:

```ts
describe('makeShipViewLoader: the loud fallback (spec §3.4)', () => {
  const dd = loadShipSpec('fletcher-dd')

  it('no view.model draws the boxes and reports nothing', async () => {
    const errors: string[] = []
    const view = await makeShipViewLoader((m) => errors.push(m), async () => { throw new Error('never asked') })({ ...dd, view: undefined })
    expect(view.model).toBeNull()
    expect(errors).toEqual([])
  })

  it('a registered model loads through the cache by its registry URL', async () => {
    const asked: string[] = []
    const cache = createModelCache(async (url) => { asked.push(url); return syntheticShip() })
    const view = await makeShipViewLoader(() => {}, (url) => cache.acquire(url))(dd)
    expect(view.model).toBe('fletcher-dd')
    expect(asked).toEqual([SHIP_MODELS['fletcher-dd']!.url])
  })

  it('a model that fails to load draws the boxes AND reports it, naming the ship and the model', async () => {
    const errors: string[] = []
    const view = await makeShipViewLoader((m) => errors.push(m), async () => { throw new Error('404 Not Found') })(dd)
    expect(view.model).toBeNull()
    expect(errors).toEqual([expect.stringMatching(/^ship fletcher-dd: model "fletcher-dd" failed.*404 Not Found/)])
  })

  it('a model missing SmokeOrigin is released, drawn as boxes, and reported', async () => {
    const errors: string[] = []
    const cache = createModelCache(async () => syntheticShip({ smoke: false }))
    const view = await makeShipViewLoader((m) => errors.push(m), (url) => cache.acquire(url))(dd)
    expect(view.model).toBeNull()
    expect(cache.refCount(SHIP_MODELS['fletcher-dd']!.url)).toBe(0)
    expect(errors[0]).toMatch(/required node "SmokeOrigin" not found/)
  })

  it('an unregistered or prototype-named model id is reported, never looked up on Object.prototype', async () => {
    for (const id of ['nope', 'constructor']) {
      const errors: string[] = []
      await makeShipViewLoader((m) => errors.push(m))({ ...dd, view: { model: id } })
      expect(errors[0]).toMatch(new RegExp(`no ship model "${id}" \\(registered: essex-cv, fletcher-dd, type-b-maru\\)`))
    }
  })
})
```

In `tests/sim/world/ships.test.ts`, append:

```ts
describe('the render-only view block (ship-models spec §3.1)', () => {
  it('is optional and strict, and names a lowercase model id', () => {
    expect(parseShipSpec({ ...cv, view: undefined }).view).toBeUndefined()
    expect(parseShipSpec({ ...cv, view: { model: 'essex-cv' } }).view).toEqual({ model: 'essex-cv' })
    expect(() => parseShipSpec({ ...cv, view: { model: 'Essex CV' } })).toThrow(/view\.model: must be a lowercase model id/)
    expect(() => parseShipSpec({ ...cv, view: { model: 'essex-cv', lod: 1 } })).toThrow(/view: Unrecognized key/)
  })
})
```

- [x] **Step 2: Run them to see them fail.**

Run: `npx vitest run tests/render/shipModels.test.ts tests/render/ship.test.ts tests/sim/world/ships.test.ts --maxWorkers=2`
Expected: FAIL. `shipModels.js` does not resolve, and `parseShipSpec` rejects the `view` key.

- [x] **Step 3: The schema key and the content.** Apply to `src/sim/world/ships.ts`:

```diff
--- a/src/sim/world/ships.ts
+++ b/src/sim/world/ships.ts
@@ -62,6 +62,10 @@ const ShipSpecObject = z
       .refine((z) => z.toSternM > z.fromSternM, { message: 'toSternM must exceed fromSternM', path: ['toSternM'] })
       .optional(),
     paddles: PaddlesObject.optional(),
+    /** Render-only; `sim/` never reads it (ship-models spec §3.1). `model` is a key of
+     *  src/render/scene/shipModels.ts's registry. Optional: a spec without it is drawn
+     *  as the procedural boxes, a supported state. */
+    view: z.object({ model: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, { message: 'must be a lowercase model id' }) }).strict().optional(),
     reference: z.object({ source: z.string().min(1) }).strict(),
   })
   .strict()
```

In each of `content/ships/essex-cv.json`, `fletcher-dd.json` and `type-b-maru.json`, add one line directly before `"reference"`, naming its own id (for example `"view": { "model": "essex-cv" },`):

```diff
--- a/content/ships/essex-cv.json
+++ b/content/ships/essex-cv.json
@@ -20,6 +20,7 @@
     "cutRangeM": 120,
     "waveOffRangeM": 250
   },
+  "view": { "model": "essex-cv" },
   "reference": {
     "source": "lengthM (872 ft overall, short-hull group), beamM (93 ft waterline), deckWidthM (147 ft 6 in / 147.5 ft maximum beam at flight-deck level) and maxSpeedMps (33 kn) from the English Wikipedia article 'Essex-class aircraft carrier', read 2026-09-18. flightDeck.lengthM and widthM are the 862 ft x 108 ft flight deck of the early (short-hull) ships, from globalsecurity.org 'CV-9 Essex Class - Original Design' and the same Wikipedia article, read 2026-09-18 (Plan 8). flightDeck.heightM and deckHeightM are the SAME ESTIMATE of the flight deck above the waterline: searched 2026-09-18 (Wikipedia, globalsecurity.org, naval-encyclopedia.com), no freeboard figure was found, only the hangar's 17 ft 6 in overhead; it decides only where the surface is. trapZone is an ESTIMATE laid over globalsecurity's 'sixteen wire MK 4 arresting gear ... spaced from the stern to just aft of the island' with the island near the deck's midpoint (Plan 8 design section 10). paddles are CHOICES, tuned by flying (Plan 8 design section 7). turnRateRadPerS (1 deg/s, about a 440 m turning radius at 15 kn) is an ESTIMATE; no tactical diameter was found. hullHp is a gameplay choice (Plan 6b)."
   }
```

Apply to `src/render/content.ts`:

```diff
--- a/src/render/content.ts
+++ b/src/render/content.ts
@@ -164,6 +164,12 @@ export const TITLE_ART_BYTES = 2_077_706
 export const WILDCAT_MODEL_PATH = 'content/aircraft/wildcat.glb'
 export const WILDCAT_MODEL_URL = `${import.meta.env.BASE_URL}${WILDCAT_MODEL_PATH}`
 
+/** A ship's committed model (ship-models spec §3.2): one glb per ship spec id,
+ *  built by `tools/models/entries/<id>.json`. `shipModels.ts` fetches the URL;
+ *  tests/build/dist.test.ts checks the path, so the two cannot name different files. */
+export const shipModelPath = (id: string): string => `content/ships/${id}.glb`
+export const shipModelUrl = (id: string): string => `${import.meta.env.BASE_URL}${shipModelPath(id)}`
+
 /** Plan 16a's cloud noise volumes, gzipped on disk, inflated in the browser
  *  (src/render/sky/load.ts) exactly as the land-cover raster is. */
 export const SHAPE_NOISE_PATH = 'content/sky/shape.bin.gz'
```

- [x] **Step 4: The registry and the loader.** `src/render/scene/shipModels.ts`:

```ts
// src/render/scene/shipModels.ts
import type { ShipSpec } from '../../sim/world/ships.js'
import { shipModelUrl } from '../content.js'
import { acquireModel, type ModelInstance } from '../models/modelCache.js'
import { createShipMesh, createShipView, type ShipView } from './ship.js'

/**
 * Model id (a ship spec's `view.model`) to its committed glb (ship-models
 * spec §3.1), the ships twin of airframes.ts. An id equals its spec id and its
 * entry id (§3.2). tests/render/shipModels.test.ts checks that every
 * content/ships JSON that names a model names one registered here, and that
 * every id here has its entry and its committed glb.
 */
export const SHIP_MODELS: Readonly<Record<string, { readonly url: string }>> = {
  'essex-cv': { url: shipModelUrl('essex-cv') },
  'fletcher-dd': { url: shipModelUrl('fletcher-dd') },
  'type-b-maru': { url: shipModelUrl('type-b-maru') },
}

export function shipModelUrlFor(modelId: string): string {
  if (!Object.hasOwn(SHIP_MODELS, modelId)) {
    throw new Error(`no ship model "${modelId}" (registered: ${Object.keys(SHIP_MODELS).join(', ')}); register it in src/render/scene/shipModels.ts`)
  }
  return SHIP_MODELS[modelId]!.url
}

/** Builds one ship's view. Never rejects: a model that fails draws the boxes (below). */
export type LoadShipView = (spec: ShipSpec) => Promise<ShipView>

/**
 * The loader, with its error sink and its cache injected (§3.4). A spec with
 * no `view.model` draws the boxes, a supported state. A model that fails to
 * load or lacks a node the view needs ALSO draws the boxes, so the game still
 * runs, AND reports the failure: `main.ts` and the hangar pass a sink that
 * pushes into their `validationErrors`, which Tier 2 asserts empty. A silent
 * fallback would ship a broken asset as boxes and nothing would notice.
 */
export function makeShipViewLoader(reportError: (message: string) => void, acquire: (url: string) => Promise<ModelInstance> = acquireModel): LoadShipView {
  return async (spec) => {
    const modelId = spec.view?.model
    if (modelId === undefined) return createShipMesh(spec)
    let instance: ModelInstance | null = null
    try {
      instance = await acquire(shipModelUrlFor(modelId))
      return createShipView(spec, modelId, instance)
    } catch (error) {
      instance?.release()
      reportError(`ship ${spec.id}: model "${modelId}" failed, drawing the procedural boxes instead: ${error instanceof Error ? error.message : String(error)}`)
      return createShipMesh(spec)
    }
  }
}

/** The default for callers with no `validationErrors` of their own. */
export const loadRegisteredShipView: LoadShipView = makeShipViewLoader((message) => { console.error(message) })
```

- [x] **Step 5: Run them to see them pass.**

Run: `npx vitest run tests/render/shipModels.test.ts tests/render/ship.test.ts tests/sim/world/ships.test.ts tests/render/hangar/ --maxWorkers=2`
Expected: PASS. `shipModels.test.ts` has 4 tests, `ship.test.ts` 18. The Hangar tests still pass: its content parses the new key through the same schema.

- [x] **Step 6: Verify and commit.** Re-diff `ships.ts`, the three JSONs and `content.ts` against `HEAD`: only the lines above.

```bash
flock /tmp/ww2airsim-fullsuite.lock sh -c 'npm run typecheck && npm run lint && npm run depcruise && npx vitest run --maxWorkers=2'; rc=$?; echo "rc=$rc"
git add src/sim/world/ships.ts content/ships/essex-cv.json content/ships/fletcher-dd.json content/ships/type-b-maru.json src/render/content.ts src/render/scene/shipModels.ts tests/render/shipModels.test.ts tests/render/ship.test.ts tests/sim/world/ships.test.ts
git commit -m "S1: view.model on ship specs, the ship model registry, and a loader that falls back to boxes loudly (S1 Task 6)"
```

---

### Task 7: Scenario entities, `main.ts` and the Hangar load ships through the loader

**Files:**
- Modify: `src/render/scenarioEntities.ts`, `src/render/main.ts`, `src/render/diagnostics.ts`, `src/render/hangar/models.ts`, `src/render/hangar/main.ts`
- Test: `tests/render/scenarioEntities.test.ts`, `tests/render/hangar/models.test.ts`

**Interfaces:**
- Consumes: Task 6's `LoadShipView`, `makeShipViewLoader`, `loadRegisteredShipView`, `SHIP_MODELS`; Task 5's `ShipView`, `probeShipSurface`.
- Produces:
  - `buildScenarioEntities(scene, world, previous, loadAirframe = loadRegisteredAirframe, loadShip = loadRegisteredShipView)`; `ScenarioEntities.shipHandles: readonly ShipView[]`
  - `loadHangarModel(entry, loadAirframe = loadRegisteredAirframe, loadShip = loadRegisteredShipView)`
  - `__ww2.shipModels(): (string | null)[]` and `__ww2.shipDeckProbe(shipId, points, space): (number | null)[]` (DEV builds, as every `__ww2` member)

`main.ts` and the Hangar each build their own loader whose error sink is their own `validationErrors`, which Tier 2 asserts empty in both pages. This is the first task that changes what the game draws.

- [ ] **Step 1: Change the tests first.** In `tests/render/scenarioEntities.test.ts`, add these imports after the `WILDCAT_MODEL_URL` import:

```ts
import { createShipMesh, createShipView } from '../../src/render/scene/ship.js'
import { makeShipViewLoader, SHIP_MODELS } from '../../src/render/scene/shipModels.js'
import type { ShipSpec } from '../../src/sim/world/ships.js'
```

and this stub directly after `const stubAirframe = async () => createHellcat()`:

```ts

/** The ship twin of `stubAirframe`: the procedural boxes, so no GLTFLoader runs. */
const stubShips = async (spec: ShipSpec) => createShipMesh(spec)
```

Then pass it to every existing call, so no test in this file ever reaches GLTFLoader:

```bash
sed -i -e 's/, stubAirframe)/, stubAirframe, stubShips)/g' \
  -e 's/buildScenarioEntities(scene, deckQuals, before, flaky)/buildScenarioEntities(scene, deckQuals, before, flaky, stubShips)/' \
  -e 's/buildScenarioEntities(scene, deckQuals, null, load)/buildScenarioEntities(scene, deckQuals, null, load, stubShips)/' \
  -e 's/buildScenarioEntities(scene, strikeRange, first, load)/buildScenarioEntities(scene, strikeRange, first, load, stubShips)/' \
  -e 's/return createHellcat() })/return createHellcat() }, stubShips)/' tests/render/scenarioEntities.test.ts
grep -c stubShips tests/render/scenarioEntities.test.ts   # 18
```

Append at the end of the file:

```ts
describe('ships through the model cache (ship-models spec §3.3)', () => {
  /** A fitted model as a ship glb parses: a hull mesh, SmokeOrigin, and (for every URL here) a TrapBand. */
  const parse = async (): Promise<Group> => {
    const root = new Group()
    root.add(new Mesh(new BoxGeometry(100, 10, 10), new MeshStandardMaterial()))
    const s = new Group(); s.name = 'SmokeOrigin'; s.position.set(0, 12, 0); root.add(s)
    const t = new Group(); t.name = 'TrapBand'; t.userData['halfWidthM'] = 9; root.add(t)
    return root
  }

  it('each ship loads by its spec, and a switch disposes every previous ship through its own dispose()', async () => {
    const scene = new Scene()
    const asked: string[] = []
    const before = await buildScenarioEntities(scene, deckQuals, null, stubAirframe, async (spec) => { asked.push(spec.id); return createShipMesh(spec) })
    expect(asked).toEqual(deckQuals.ships.map((s) => s.spec.id))
    const spies = before.shipHandles.map((h) => vi.spyOn(h, 'dispose'))
    await buildScenarioEntities(scene, strikeRange, before, stubAirframe, stubShips)
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1)
  })

  it('switching between two scenarios with the same ship models parses each glb once and frees nothing still drawn', async () => {
    let parses = 0
    const cache = createModelCache(async () => { parses++; return parse() })
    const load = makeShipViewLoader((m) => { throw new Error(m) }, (url) => cache.acquire(url))
    const scene = new Scene()
    const first = await buildScenarioEntities(scene, deckQuals, null, stubAirframe, load) // essex-cv + 2 x fletcher-dd
    const second = await buildScenarioEntities(scene, deckQuals, first, stubAirframe, load)
    expect(parses).toBe(2)
    expect(cache.refCount(SHIP_MODELS['essex-cv']!.url)).toBe(1)
    expect(cache.refCount(SHIP_MODELS['fletcher-dd']!.url)).toBe(2)
    for (const h of second.shipHandles) expect(h.model).not.toBeNull()
    for (const h of first.shipHandles) expect(scene.children).not.toContain(h.root)
  })

  it('if an airframe fails to load, the ships that loaded are disposed too and the previous scenario is untouched', async () => {
    const scene = new Scene()
    const before = await buildScenarioEntities(scene, strikeRange, null, stubAirframe, stubShips)
    const made: ReturnType<typeof createShipMesh>[] = []
    const ships = async (spec: ShipSpec) => { const v = createShipMesh(spec); made.push(v); vi.spyOn(v, 'dispose'); return v }
    await expect(buildScenarioEntities(scene, deckQuals, before, async () => { throw new Error('model fetch 404') }, ships)).rejects.toThrow('model fetch 404')
    expect(made).toHaveLength(deckQuals.ships.length)
    for (const v of made) expect(v.dispose).toHaveBeenCalledTimes(1)
    for (const h of [...before.airframes, ...before.shipHandles]) expect(scene.children).toContain(h.root)
  })

  it('never walks a model view with disposeMeshTree: the shared materials survive a switch away', async () => {
    const cache = createModelCache(parse)
    const load = makeShipViewLoader(() => {}, (url) => cache.acquire(url))
    const scene = new Scene()
    const a = await buildScenarioEntities(scene, strikeRange, null, stubAirframe, load)
    const other = createShipView(strikeRange.ships[0]!.spec, 'type-b-maru', await cache.acquire(SHIP_MODELS['type-b-maru']!.url))
    const mesh = other.root.getObjectByName('hull group')!.children[0]!.children[0] as Mesh
    const spy = vi.spyOn(mesh.material as MeshStandardMaterial, 'dispose')
    await buildScenarioEntities(scene, gunneryRange, a, stubAirframe, load)
    expect(spy).not.toHaveBeenCalled()
    expect(cache.refCount(SHIP_MODELS['type-b-maru']!.url)).toBe(1)
  })
})
```

Apply to `tests/render/hangar/models.test.ts`:

```diff
--- a/tests/render/hangar/models.test.ts
+++ b/tests/render/hangar/models.test.ts
@@ -3,6 +3,7 @@ import { describe, expect, it, vi } from 'vitest'
 import { buildCatalog } from '../../../src/render/hangar/catalog.js'
 import { flatField, loadHangarModel, partSpecsFor } from '../../../src/render/hangar/models.js'
 import { createHellcat } from '../../../src/render/scene/hellcat.js'
+import { createShipMesh } from '../../../src/render/scene/ship.js'
 import { heightAt } from '../../../src/sim/world/terrain.js'
 import { nodeHangarContent } from './content.js'
 
@@ -41,13 +42,27 @@ describe('loadHangarModel (Node, with a stub airframe)', () => {
 
   it('a ship and a building load with no articulated parts and a non-zero triangle count', async () => {
     for (const id of ['essex-cv', 'hangar']) {
-      const m = await loadHangarModel(byId(id))
+      // The ship loader is the game's (S1); a stub keeps GLTFLoader out of Node.
+      const m = await loadHangarModel(byId(id), undefined, async (spec) => createShipMesh(spec))
       expect(m!.parts, id).toEqual([])
       expect(m!.counts().triangles, id).toBeGreaterThan(0)
       m!.dispose()
     }
   })
 
+  it("a ship loads through the game's ship loader, and disposes through its view", async () => {
+    const asked: string[] = []
+    let disposed = 0
+    const m = await loadHangarModel(byId('fletcher-dd'), undefined, async (spec) => {
+      asked.push(spec.id)
+      const v = createShipMesh(spec)
+      return { ...v, dispose: () => { disposed++; v.dispose() } }
+    })
+    expect(asked).toEqual(['fletcher-dd'])
+    m!.dispose()
+    expect(disposed).toBe(1)
+  })
+
   it('"Not yet in service" loads nothing', async () => {
     expect(await loadHangarModel(catalog.find((e) => e.subject === null)!)).toBeNull()
   })
```

- [ ] **Step 2: Run them to see them fail.**

Run: `npx vitest run tests/render/scenarioEntities.test.ts tests/render/hangar/models.test.ts --maxWorkers=2`
Expected: FAIL. `buildScenarioEntities` ignores the ship loader, so the asked-for list is empty and no view has a model; `loadHangarModel` ignores its third argument.

- [ ] **Step 3: Scenario entities.** `src/render/scenarioEntities.ts` becomes:

```ts
import type { Scene } from 'three'
import type { ShipView } from './scene/ship.js'
import { loadRegisteredShipView, type LoadShipView } from './scene/shipModels.js'
import { createEngineSmoke } from './scene/smoke.js'
import { airframeFor } from './scene/airframes.js'
import type { Airframe } from './scene/airframe.js'
import { disposeMeshTree } from './models/dispose.js'
import type { World } from '../sim/loop.js'

export { disposeMeshTree }

/**
 * Every mesh handle sized to one scenario's entity lists. `main.ts`'s render
 * loop indexes `airframes[i]`/`shipHandles[i]`/`smokes[i]` against
 * `frame.poses`/`frame.shipPoses`/`frame.world.aircraft`, which are built in
 * the same world order (Plan 12) -- so these three stay parallel arrays, not
 * maps. `player` is the PLAYER's own `Airframe`, picked out by id rather than
 * assumed to be index 0: a scenario is free to list the wingman first.
 */
export interface ScenarioEntities {
  readonly airframes: readonly Airframe[]
  readonly shipHandles: readonly ShipView[]
  readonly smokes: readonly ReturnType<typeof createEngineSmoke>[]
  readonly player: Airframe
}

/** Builds the airframe a spec's `view.model` names. Injectable so tests
 *  substitute a cheap synchronous stand-in and never run GLTFLoader in Node. */
export type LoadAirframe = (modelId: string) => Promise<Airframe>

export const loadRegisteredAirframe: LoadAirframe = (modelId) => airframeFor(modelId)()

/**
 * Builds one airframe mesh per `world.aircraft` entry and one hull per
 * `world.ships` entry, in world order, plus one engine-smoke trail per
 * airframe as a child of its own root so it rides the airplane (Plan 6) --
 * the exact construction `main.ts`'s `boot()` always did inline, extracted
 * so it can run again from `loadScenario` (Plan 9 Task 7) without also
 * rebuilding terrain, ocean or sky: those are world geography, not scenario
 * content (design doc §5), and are untouched by this function and its
 * caller alike.
 *
 * `previous`, when given, is torn down AFTER the new airframes and ships have
 * loaded: each airframe and each ship through its own `dispose()` (which
 * releases a shared model instance, never walks it -- modelCache.ts), each
 * smoke trail through `disposeMeshTree`. Loading first means a model both scenarios use
 * keeps its one parse through the switch, and a load that fails leaves the
 * running scenario exactly as it was.
 */
export async function buildScenarioEntities(
  scene: Scene,
  world: Pick<World<undefined>, 'aircraft' | 'ships' | 'player'>,
  previous: ScenarioEntities | null,
  // Defaulted for production; tests substitute a cheap synchronous stand-in
  // (createHellcat) so they never run a real GLTFLoader parse in Node.
  loadAirframe: LoadAirframe = loadRegisteredAirframe,
  // Ship-models spec §3.3-3.4: never rejects; a model that fails draws boxes
  // and reports through the loader's own sink (main.ts passes validationErrors).
  loadShip: LoadShipView = loadRegisteredShipView,
): Promise<ScenarioEntities> {
  const [settled, shipSettled] = await Promise.all([
    Promise.allSettled(world.aircraft.map((a) => loadAirframe(a.spec.view.model))),
    Promise.allSettled(world.ships.map((s) => loadShip(s.spec))),
  ])
  const failed = [...settled, ...shipSettled].find((r): r is PromiseRejectedResult => r.status === 'rejected')
  if (failed !== undefined) {
    for (const r of settled) if (r.status === 'fulfilled') r.value.dispose()
    for (const r of shipSettled) if (r.status === 'fulfilled') r.value.dispose()
    throw failed.reason
  }
  const airframes = settled.map((r) => (r as PromiseFulfilledResult<Airframe>).value)
  const shipHandles = shipSettled.map((r) => (r as PromiseFulfilledResult<ShipView>).value)

  if (previous !== null) {
    previous.airframes.forEach((a, i) => {
      scene.remove(a.root)
      disposeMeshTree(previous.smokes[i]!.object)
      a.dispose()
    })
    // Through each view's own dispose(): a model view RELEASES its shared
    // instance. disposeMeshTree on its root would free geometry and materials
    // every other instance of that glb is still drawing (modelCache.ts).
    for (const handle of previous.shipHandles) {
      scene.remove(handle.root)
      handle.dispose()
    }
  }

  for (const a of airframes) scene.add(a.root)
  const smokes = airframes.map((a) => {
    const smoke = createEngineSmoke()
    a.root.add(smoke.object)
    return smoke
  })
  const playerIndex = world.aircraft.findIndex((a) => a.id === world.player)
  const player = airframes[playerIndex]!
  for (const h of shipHandles) scene.add(h.root)

  return { airframes, shipHandles, smokes, player }
}
```

- [ ] **Step 4: `main.ts` and its diagnostics.** Apply to `src/render/main.ts` (re-find each anchor by its text, not its line number):

```diff
--- a/src/render/main.ts
+++ b/src/render/main.ts
@@ -2,7 +2,9 @@ import { Group, PerspectiveCamera, Scene } from 'three'
 import { positionWorld } from 'three/tsl'
 import { initRenderer, normalizeGpuError } from './renderer.js'
 import { showFailure, type FailureKind } from './failure.js'
-import { buildScenarioEntities, type ScenarioEntities } from './scenarioEntities.js'
+import { buildScenarioEntities, loadRegisteredAirframe, type ScenarioEntities } from './scenarioEntities.js'
+import { makeShipViewLoader } from './scene/shipModels.js'
+import { probeShipSurface } from './scene/ship.js'
 import { airframeUpdateFor } from './airframeUpdate.js'
 import { createRafLoop, type RafLoop } from './rafLoop.js'
 import { CAMERA_VFOV_DEG, cameraTransformFor, lookFromQuery, type CameraMode } from './camera.js'
@@ -123,6 +125,10 @@ const root = document.getElementById('app')!
 // to rediscover.
 const validationErrors: string[] = []
 
+/** Ship models load through the shared cache; one that fails draws boxes AND lands in
+ *  `validationErrors`, which Tier 2 asserts empty (ship-models spec §3.4). */
+const loadShips = makeShipViewLoader((message) => { validationErrors.push(message) })
+
 /**
  * Frame intervals, milliseconds, since the last `window.__ww2.resetFrameTimes()`
  * -- the same `now - last` the dev overlay already shows, collected so Tier 2's
@@ -349,7 +355,7 @@ async function boot(): Promise<void> {
     // The nullable binding the diagnostics hook above closes over, now that
     // there is an answer to put in it.
     spawnPosition = nextSpawnedAt
-    scenarioEntities = await buildScenarioEntities(scene, nextScenarioWorld, scenarioEntities)
+    scenarioEntities = await buildScenarioEntities(scene, nextScenarioWorld, scenarioEntities, loadRegisteredAirframe, loadShips)
   }
   /**
    * The live flight, `null` until boot's own first `initialFrameStateFor`
@@ -848,6 +854,13 @@ async function boot(): Promise<void> {
         const g = groundUnder(frame.world.terrain, decksOf(frame.world.ships), p.position.x, p.position.z)
         return g?.deck ? { shipId: g.deck.shipId, heightM: g.heightM, velocity: g.velocity } : null
       },
+      // Ship-models spec §9. `shipHandles` is built in `world.ships` order (buildScenarioEntities).
+      shipModels: () => scenarioEntities?.shipHandles.map((h) => h.model) ?? [],
+      shipDeckProbe: (shipId, points, space) => {
+        const i = frame?.world.ships.findIndex((s) => s.id === shipId) ?? -1
+        const view = i >= 0 ? scenarioEntities?.shipHandles[i] : undefined
+        return view ? probeShipSurface(view, points, space) : points.map(() => null)
+      },
       // The world wind, the velocity of the air; `null` is calm (Plan 8).
       wind: () => frame?.world.wind ?? null,
       // Read fresh every call, same reason `scenarioEntities` is read fresh
```

Apply to `src/render/diagnostics.ts`:

```diff
--- a/src/render/diagnostics.ts
+++ b/src/render/diagnostics.ts
@@ -294,6 +294,16 @@ export type Ww2Diagnostics = {
   readonly paddles: () => PaddlesCue | null
   /** The deck under the player's wheels, or `null` (Plan 8). */
   readonly deck: () => { readonly shipId: string; readonly heightM: number; readonly velocity: Vec3 } | null
+  /** Each ship's drawn model id, in world order, or null where the procedural boxes are drawn (ship-models spec §9). */
+  readonly shipModels: () => readonly (string | null)[]
+  /**
+   * The world height of the topmost rendered surface of ship `shipId` straight
+   * below each point, read from the loaded, posed view (`probeShipSurface`,
+   * ship.ts); null where a ray misses it. Ship-models spec §9: Tier 2 compares
+   * it with `deck().heightM`, so a deck that floats or sinks under the wheels
+   * fails in the real renderer, not only in Node math.
+   */
+  readonly shipDeckProbe: (shipId: string, points: readonly { readonly x: number; readonly z: number }[], space: 'ship' | 'world') => readonly (number | null)[]
   /** The world wind, the velocity of the air; `null` is calm (Plan 8). */
   readonly wind: () => Vec3 | null
   /**
```

- [ ] **Step 5: The Hangar's ships** (Open question 1). Apply to `src/render/hangar/models.ts`:

```diff
--- a/src/render/hangar/models.ts
+++ b/src/render/hangar/models.ts
@@ -2,7 +2,7 @@
 import { Group, Mesh, type Object3D } from 'three'
 import type { Airframe, PartId } from '../scene/airframe.js'
 import { loadRegisteredAirframe, type LoadAirframe } from '../scenarioEntities.js'
-import { createShipMesh } from '../scene/ship.js'
+import { loadRegisteredShipView, type LoadShipView } from '../scene/shipModels.js'
 import { batched, createBuildingMaterials, drawBuilding, makeCollector } from '../scene/buildings.js'
 import { disposeMeshTree } from '../models/dispose.js'
 import { createTerrainField, type TerrainField } from '../../sim/world/terrain.js'
@@ -114,11 +114,11 @@ function aircraftModel(airframe: Airframe, gearHeightM: number): HangarModel {
 /**
  * The ONLY module that knows where geometry comes from (Hangar spec §7).
  * Aircraft load through Z1's registry, by `spec.view.model`, exactly as the
- * game does; ships through `createShipMesh`; buildings through
- * `drawBuilding` on a flat field. H2 swaps ships to Lane C's loader here and
- * nowhere else. null = "Not yet in service".
+ * game does; ships through the ship-models loader (S1), also exactly as the
+ * game does, boxes included when a spec has no model; buildings through
+ * `drawBuilding` on a flat field. null = "Not yet in service".
  */
-export async function loadHangarModel(entry: CatalogEntry, loadAirframe: LoadAirframe = loadRegisteredAirframe): Promise<HangarModel | null> {
+export async function loadHangarModel(entry: CatalogEntry, loadAirframe: LoadAirframe = loadRegisteredAirframe, loadShip: LoadShipView = loadRegisteredShipView): Promise<HangarModel | null> {
   const s = entry.subject
   if (s === null) return null
   if (s.kind === 'aircraft') {
@@ -127,7 +127,11 @@ export async function loadHangarModel(entry: CatalogEntry, loadAirframe: LoadAir
     model.update(0)
     return model
   }
-  if (s.kind === 'ship') return staticModel(createShipMesh(s.spec).root)
+  if (s.kind === 'ship') {
+    // Through the view's own dispose: a model view releases its shared instance.
+    const view = await loadShip(s.spec)
+    return { ...staticModel(view.root), dispose: () => view.dispose() }
+  }
   // The largest footprint of this kind stands for all of them.
   const b = [...s.placements].sort((x, y) => y.building.widthM * y.building.lengthM - x.building.widthM * x.building.lengthM)[0]!.building
   const collector = makeCollector()
```

Apply to `src/render/hangar/main.ts`:

```diff
--- a/src/render/hangar/main.ts
+++ b/src/render/hangar/main.ts
@@ -10,6 +10,8 @@ import { createPanel } from './panel.js'
 import { mountBench } from './bench.js'
 import { benchEnabled } from './benchFlag.js'
 import { installHangarHooks, type HangarWindow } from './hooks.js'
+import { loadRegisteredAirframe } from '../scenarioEntities.js'
+import { makeShipViewLoader } from '../scene/shipModels.js'
 
 /**
  * hangar.html's entry: the object library and articulation bench (Hangar
@@ -20,6 +22,8 @@ const root = document.getElementById('app')!
 
 async function boot(): Promise<void> {
   const validationErrors: string[] = []
+  // A ship model that fails draws boxes and lands here, which Tier 2 check 1 asserts empty (ship-models spec §3.4).
+  const loadShips = makeShipViewLoader((message) => { validationErrors.push(message) })
   let resolveReady!: () => void
   const ready = new Promise<void>((r) => { resolveReady = r })
 
@@ -60,7 +64,7 @@ async function boot(): Promise<void> {
   const select = async (id: string): Promise<void> => {
     const entry = catalog.find((e) => e.library.id === id)
     if (!entry) throw new Error(`hangar: no library entry "${id}"`)
-    const next = await loadHangarModel(entry)
+    const next = await loadHangarModel(entry, loadRegisteredAirframe, loadShips)
     model?.dispose()
     model = next
     selected = entry
```

- [ ] **Step 6: Run them to see them pass.**

Run: `npx vitest run tests/render/scenarioEntities.test.ts tests/render/hangar/ tests/render/ship.test.ts tests/render/cloudShadow.test.ts --maxWorkers=2`
Expected: PASS. `scenarioEntities.test.ts` has 16 tests (12 before), `hangar/models.test.ts` 7 (6 before).

- [ ] **Step 7: Verify and commit.** Re-diff all five shared files against `HEAD`: only the hunks above.

```bash
flock /tmp/ww2airsim-fullsuite.lock sh -c 'npm run typecheck && npm run lint && npm run depcruise && npx vitest run --maxWorkers=2'; rc=$?; echo "rc=$rc"
git add src/render/scenarioEntities.ts src/render/main.ts src/render/diagnostics.ts src/render/hangar/models.ts src/render/hangar/main.ts tests/render/scenarioEntities.test.ts tests/render/hangar/models.test.ts
git commit -m "S1: ships load through the model cache in the game and the Hangar, release on switch, and report a failed model (S1 Task 7)"
```

---

### Task 8: The in-app models credit

**Files:**
- Create: `src/render/modelCredits.ts`, `src/render/modelCreditsIndex.ts`
- Modify: `src/render/legend.ts`
- Test: `tests/render/modelCredits.test.ts`

**Interfaces:**
- Consumes: `tools/models/entries/*.json` (Task 3), `WORLDCOVER_LICENCE_URL` (the CC BY 4.0 deed, `legend.ts`).
- Produces: `CreditSource`, `ModelCredit`, `modelCredits(entries)`, `modelCreditsText(credits)`, `MODEL_CREDITS`.

Spec §13 item 3, approved: one "Models:" line in the legend's credits, generated from the entries, each author linked to the model and the license linked to the deed. It covers the Wildcat, which has had no in-app credit, as well as the ships, and Z3's Zero joins it by adding its entry.

- [ ] **Step 1: Write the failing test.** `tests/render/modelCredits.test.ts`:

```ts
// tests/render/modelCredits.test.ts
import { describe, expect, it } from 'vitest'
import { loadModelEntries } from '../../tools/models/manifest.js'
import { modelCredits, modelCreditsText } from '../../src/render/modelCredits.js'
import { MODEL_CREDITS } from '../../src/render/modelCreditsIndex.js'

const src = (url: string, author: string, license = 'CC-BY-4.0') => ({ source: { url, author, license } })

describe('the models credit line (ship-models spec §10)', () => {
  it('credits every CC BY entry once per source, in order, and nothing else', () => {
    const credits = modelCredits([src('https://a', 'A'), src('https://b', 'B', 'CC0-1.0'), src('https://a', 'A'), src('https://c', 'C')])
    expect(credits).toEqual([{ author: 'A', url: 'https://a' }, { author: 'C', url: 'https://c' }])
    expect(modelCreditsText(credits)).toBe('Models: A, C (CC BY 4.0)')
    expect(modelCreditsText([])).toBe('')
  })

  it("the page's bundled credits are exactly the entries on disk, so no model ships uncredited", () => {
    expect(MODEL_CREDITS).toEqual(modelCredits(loadModelEntries()))
    for (const e of loadModelEntries().filter((x) => x.source.license === 'CC-BY-4.0')) {
      expect(MODEL_CREDITS.map((c) => c.url), e.id).toContain(e.source.url)
    }
  })

  it('reads, after S1, as the four CC BY authors in entry-file order', () => {
    expect(modelCreditsText(MODEL_CREDITS)).toBe('Models: KTKloss, JZHU, AlanTinka, rojatsu (CC BY 4.0)')
  })
})
```

- [ ] **Step 2: Run it to see it fail.**

Run: `npx vitest run tests/render/modelCredits.test.ts --maxWorkers=2`
Expected: FAIL. `modelCredits.js` does not resolve.

- [ ] **Step 3: Implement.** `src/render/modelCredits.ts`:

```ts
// src/render/modelCredits.ts
/**
 * The in-app credit for every CC BY model the game draws (ship-models spec
 * §10, Open item 3, approved by Mark 2026-09-25): one "Models:" line in the
 * legend's credits, derived from tools/models/entries/*.json, so a model
 * cannot ship without its credit. CC BY 4.0 §3(a) asks for the creator, a
 * link to the material and one to the licence "in any reasonable manner";
 * the legend meets WorldCover's the same way (legend.ts). Before this, the
 * committed Wildcat (CC BY, rojatsu) had no in-app credit at all.
 */
export interface CreditSource { readonly source: { readonly url: string; readonly author: string; readonly license: string } }
export interface ModelCredit { readonly author: string; readonly url: string }

/** One credit per CC BY entry, in the order given, once per source URL (two entries built from one download credit it once). */
export function modelCredits(entries: readonly CreditSource[]): ModelCredit[] {
  const seen = new Set<string>()
  const out: ModelCredit[] = []
  for (const e of entries) {
    if (e.source.license !== 'CC-BY-4.0' || seen.has(e.source.url)) continue
    seen.add(e.source.url)
    out.push({ author: e.source.author, url: e.source.url })
  }
  return out
}

/** The line as plain text, which is all a `node` test can see; `createLegend` links each author and the licence. */
export function modelCreditsText(credits: readonly ModelCredit[]): string {
  return credits.length === 0 ? '' : `Models: ${credits.map((c) => c.author).join(', ')} (CC BY 4.0)`
}
```

`src/render/modelCreditsIndex.ts`:

```ts
// src/render/modelCreditsIndex.ts
import { modelCredits, type CreditSource } from './modelCredits.js'

/**
 * Every model entry, bundled at build time by Vite's glob import (a browser
 * cannot list tools/models/entries/), sorted by file name so the line is
 * stable. The same pattern as src/render/hangar/contentIndex.ts.
 */
const entries = import.meta.glob('/tools/models/entries/*.json', { eager: true, import: 'default' })

export const MODEL_CREDITS = modelCredits(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)).map(([, e]) => e as CreditSource))
```

Apply to `src/render/legend.ts`:

```diff
--- a/src/render/legend.ts
+++ b/src/render/legend.ts
@@ -12,6 +12,7 @@
  * changes.
  */
 import { BINDINGS, type BindingName } from '../input/bindings.js'
+import { MODEL_CREDITS } from './modelCreditsIndex.js'
 
 export type LegendRow = {
   /** What the pilot is trying to do, not what the code calls it. */
@@ -233,6 +234,13 @@ export function createLegend(root: HTMLElement): LegendHandle {
   }
   credit.append(CREDITS.before, makeLink(CREDITS.worldCover, WORLDCOVER_LICENCE_URL), CREDITS.between,
     makeLink(CREDITS.link, OSM_COPYRIGHT_URL))
+  // The models' CC BY credit (ship-models spec §10): each author links to the
+  // model, and the licence to the same deed WorldCover's link names.
+  if (MODEL_CREDITS.length) {
+    credit.append(document.createElement('br'), 'Models: ')
+    MODEL_CREDITS.forEach((c, i) => credit.append(...(i ? [', '] : []), makeLink(c.author, c.url)))
+    credit.append(' (', makeLink('CC BY 4.0', WORLDCOVER_LICENCE_URL), ')')
+  }
   el.appendChild(credit)
 
   let open = true
```

- [ ] **Step 4: Run it to see it pass.**

Run: `npx vitest run tests/render/modelCredits.test.ts tests/render/legend.test.ts --maxWorkers=2`
Expected: PASS, 3 and 10 tests. The line reads `Models: KTKloss, JZHU, AlanTinka, rojatsu (CC BY 4.0)`: entry files in name order.

- [ ] **Step 5: Verify and commit.**

```bash
flock /tmp/ww2airsim-fullsuite.lock sh -c 'npm run typecheck && npm run lint && npm run depcruise && npx vitest run --maxWorkers=2'; rc=$?; echo "rc=$rc"
git add src/render/modelCredits.ts src/render/modelCreditsIndex.ts src/render/legend.ts tests/render/modelCredits.test.ts
git commit -m "S1: a Models credit line in the legend, generated from the model entries (S1 Task 8)"
```

---

### Task 9: Tier 2 on the reference GPU

**Files:**
- Create: `tests/e2e/ships.spec.ts`
- Modify: `tests/e2e/deckQuals.spec.ts` (one new test; photoreal's luminance test is not edited)

**Interfaces:**
- Consumes: `__ww2.shipModels`, `__ww2.shipDeckProbe` (Task 7); `__hangar` (H1).

Run by the executing agent, never by Mark, on the `ww2airsim-2` slot so the timings do not skew another session's.

- [ ] **Step 1: Write the ship spec.** `tests/e2e/ships.spec.ts`:

```ts
// tests/e2e/ships.spec.ts
import { test, expect } from '@playwright/test'
import { percentile, spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'
import { SCENARIO_PARAM } from '../../src/render/spawn.js'
import { loadScenarioBundle } from '../../tools/content/load.js'
import type { HangarWindow } from '../../src/render/hangar/hooks.js'

/**
 * Tier 2, ship models (ship-models spec §9). Same platform and caveats as
 * adapter.spec.ts: the Windows reference desktop, never hosted CI. The agent
 * reads the broadside PNGs itself; Mark is not in this loop.
 */
test.setTimeout(180_000)

const MODELS: Record<string, readonly (string | null)[]> = {
  'free-flight': ['essex-cv', 'fletcher-dd', 'fletcher-dd'],
  'deck-quals': ['essex-cv', 'fletcher-dd', 'fletcher-dd'],
  'strike-range': ['type-b-maru'],
}

for (const [scenario, models] of Object.entries(MODELS)) {
  test(`${scenario}: every ship draws its model, with no validation errors`, async ({ page }) => {
    await page.goto(`/?${SCENARIO_PARAM}=${scenario}`)
    await waitForTerrain(page)
    const r = await page.evaluate(() => {
      const d = (window as DiagWindow).__ww2!
      return { models: d.shipModels(), errors: d.validationErrors }
    })
    expect(r.models).toEqual(models)
    expect(r.errors, `validation errors:\n${JSON.stringify(r.errors, null, 2)}`).toEqual([])
  })
}

test.describe('broadsides and budgets at 1440p', () => {
  test.use({ viewport: { width: 2560, height: 1440 } })

  test('each ship model from the side, in the Hangar (the agent reads the PNGs)', async ({ page }) => {
    await page.goto('/hangar.html')
    await page.waitForFunction(() => (window as HangarWindow).__hangar !== undefined, undefined, { timeout: 30_000 })
    await page.evaluate(() => (window as HangarWindow).__hangar!.ready)
    await page.evaluate(() => (window as HangarWindow).__hangar!.freeze())
    for (const id of ['essex-cv', 'fletcher-dd', 'type-b-maru']) {
      await page.evaluate((i) => (window as HangarWindow).__hangar!.select(i), id)
      await page.evaluate(() => (window as HangarWindow).__hangar!.camera('side'))
      await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => r())))))
      await page.locator('#hangar-canvas').screenshot({ path: `test-results/ships-${id}-side.png` })
    }
    expect(await page.evaluate(() => (window as HangarWindow).__hangar!.validationErrors)).toEqual([])
  })

  const GPU_BUDGET_P95_MS = 6.0
  const maru = loadScenarioBundle('strike-range').scenario.ships[0]!
  const [mx, mz] = maru.waypoints[0]!
  const views: Record<string, string> = {
    // Parked on the carrier's deck, looking up it.
    'deck-quals': `/?${SCENARIO_PARAM}=deck-quals`,
    // 1.5 km short of the freighter's first waypoint, 800 m up, as entities.spec.ts does for the task force.
    'strike-range': `${spawnUrl({ x: mx - 1500, y: 800, z: mz })}&${SCENARIO_PARAM}=strike-range`,
  }
  for (const [scenario, url] of Object.entries(views)) {
    test(`${scenario}: gpu p95 under ${GPU_BUDGET_P95_MS} ms with the ship models`, async ({ page }) => {
      await page.goto(url)
      await waitForTerrain(page)
      await page.waitForTimeout(1500)
      await page.evaluate(() => { (window as DiagWindow).__ww2!.resetFrameTimes() })
      await page.waitForTimeout(5000)
      const gpu = await page.evaluate(() => (window as DiagWindow).__ww2!.gpuFrameTimesMs())
      expect(gpu.length).toBeGreaterThan(100)
      const p95 = percentile(gpu, 0.95)
      console.log(`${scenario} ship models gpu p95 ${p95.toFixed(3)} ms over ${gpu.length} samples`)
      await page.screenshot({ path: `test-results/ships-${scenario}.png` })
      expect(p95).toBeLessThan(GPU_BUDGET_P95_MS)
    })
  }
})
```

- [ ] **Step 2: Add the deck probe to `tests/e2e/deckQuals.spec.ts`.** Extend its `tools/content/load.js` import to `import { loadAircraftSpec, loadShipSpec } from '../../tools/content/load.js'`, and append:

```ts
/**
 * Ship models (S1, spec §9): the rendered deck of the LOADED, POSED carrier
 * model is where the sim rests the wheels. `shipDeckProbe` ray-casts the
 * ship's own view straight down, ignoring the airplane. Under the parked
 * airplane it reads the origin and 1.7 m either side (half the F6F's main-gear
 * track, an ESTIMATE; the sim has one contact point). In ship coordinates it
 * reads the trap zone's center, where the band sits 0.05 m proud, and 5 m
 * short of the bow. The deck is rigid, so the deck run adds nothing to these.
 */
test('the rendered carrier deck is where the sim rests the wheels (ship models S1)', async ({ page }) => {
  const cvSpec = loadShipSpec('essex-cv')
  const fd = cvSpec.flightDeck!, tz = cvSpec.trapZone!
  const marks = [{ x: -fd.lengthM / 2 + (tz.fromSternM + tz.toSternM) / 2, z: 0 }, { x: fd.lengthM / 2 - 5, z: 0 }]
  await page.goto(URL)
  await waitForTerrain(page)
  await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.supportedContact()), { timeout: 20_000 }).toBe(true)
  const r = await page.evaluate((m) => {
    const d = (window as DiagWindow).__ww2!
    const me = d.aircraft().find((a) => a.id === 'f6f-1')!
    const right = { x: Math.cos(me.headingRad), z: Math.sin(me.headingRad) }
    const wheels = [0, -1.7, 1.7].map((s) => ({ x: me.x + s * right.x, z: me.z + s * right.z }))
    return { models: d.shipModels(), deck: d.deck(), wheels: d.shipDeckProbe('cv-1', wheels, 'world'), marks: d.shipDeckProbe('cv-1', m, 'ship'), errors: d.validationErrors }
  }, marks)
  expect(r.models[0]).toBe('essex-cv')
  expect(r.deck?.shipId).toBe('cv-1')
  const simDeck = r.deck!.heightM
  for (const [i, y] of [...r.wheels, ...r.marks].entries()) {
    expect(y, `probe ${i} hit nothing`).not.toBeNull()
    expect(Math.abs(y! - simDeck), `probe ${i}: rendered ${y} vs sim ${simDeck}`).toBeLessThanOrEqual(0.2)
  }
  expect(r.errors).toEqual([])
})
```

- [ ] **Step 3: Typecheck and lint the specs** (Tier 2 is not in `vitest`, so this is their only static check): `npm run typecheck && npx eslint --max-warnings 0 tests/e2e/ships.spec.ts tests/e2e/deckQuals.spec.ts; rc=$?; echo "rc=$rc"`. Expected `rc=0`.

- [ ] **Step 4: Run Tier 2 on the spare slot.** The repo `CLAUDE.md` ("GPU work") and `README.md`'s "Tier 2: the GPU harness" are the authority. In this worktree, point `vite.config.ts`'s `TUNNEL_HOST` at `ww2airsim-2.windomlane.org` and its `server.port` at `5175`. That edit is local scratch: never commit it.

```bash
WW2AIRSIM_TUNNEL=1 npx vite --port 5175 &
curl -sS -o /dev/null -w '%{http_code}\n' https://ww2airsim-2.windomlane.org/   # 200
ss -ltn | grep 39001 || ssh -N -L 39001:127.0.0.1:3000 ryzen &
PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim-2.windomlane.org npx playwright test tests/e2e/ships.spec.ts tests/e2e/deckQuals.spec.ts tests/e2e/hangar.spec.ts tests/e2e/entities.spec.ts tests/e2e/strike.spec.ts; rc=$?; echo "rc=$rc"
```

Expected `rc=0`:
- `ships.spec.ts`: every ship draws its model in all three scenarios with no validation errors; the three broadsides are written; gpu p95 < 6.0 ms at 1440p in deck-quals and strike-range.
- `deckQuals.spec.ts`: the new deck probe within 0.2 m at all five points; the existing parked, deck-run and budget tests; and photoreal Task 12's luminance test, deck/runway within [0.5, 1.5] (it measured 0.64 with the boxes).
- `hangar.spec.ts`: check 1 now masks the three ship models (2% to 80% of the frame) with no validation errors.
- `entities.spec.ts`: the task force sails, and the 1440p budget over it holds with the models.
- `strike.spec.ts`: unchanged, because the hit box did not move (spec §9). Photoreal's Task 1 report recorded this spec as uncollectable before S1. If it still is, run it on `main` too and record the same result there as pre-existing, not an S1 failure.

- [ ] **Step 5: Look at every PNG yourself** (`test-results/ships-*-side.png`, `ships-deck-quals.png`, `ships-strike-range.png`, `deck-quals-parked.png`): bow toward +x, the island to starboard, the waterline at the sea, no black or see-through hull, the Fletcher's railings as lattices and not sheet steel. Never argue about a picture you have not looked at. Record what you saw in the ledger.

- [ ] **Step 6: If a check fails, report it red with its numbers.** Do not re-tune to pass, with one sanctioned exception (spec §5.4): if only the Task 12 luminance ratio leaves [0.5, 1.5], adjust `SHIP_PALETTES['usn-1944'].flightDeck` in `shipPalette.ts`, rebuild with `npm run models:build -- essex-cv`, re-run Tier 1 (`tests/tools/shipModels.test.ts`, `tests/tools/models/outputs.test.ts`) and this step, and record the old and new colors and ratios. Never re-baseline the gate.

- [ ] **Step 7: Clean up and commit.** Stop the dev server. Restore `vite.config.ts`: `git diff vite.config.ts` must be empty.

```bash
flock /tmp/ww2airsim-fullsuite.lock sh -c 'npm run typecheck && npm run lint && npm run depcruise && npx vitest run --maxWorkers=2'; rc=$?; echo "rc=$rc"
git add tests/e2e/ships.spec.ts tests/e2e/deckQuals.spec.ts
git commit -m "S1: Tier 2 for the ship models: drawn with no errors, broadsides, the deck probe under the wheels, and the 1440p budget (S1 Task 9)"
```

(If Step 6 retuned the palette, add `src/render/scene/shipPalette.ts` and `content/ships/essex-cv.glb` to that commit, and say so in its message.)

---

### Task 10: The handoff, §15's row, the README pointer, and the superseded-section pointers

**Files:**
- Create: `docs/handoff/<today>-s1-ship-models.md`
- Modify: `docs/superpowers/specs/2026-09-12-ww2airsim-design.md` (§15), `README.md`, `docs/superpowers/specs/2026-09-24-visual-realism-pass-design.md` (§3.3), `docs/superpowers/specs/2026-09-25-hangar-library-design.md` (§12, H2 item 4; only if Open question 1 kept its default)

- [ ] **Step 1: The handoff**, `docs/handoff/<today>-s1-ship-models.md`. It must contain:
  1. **First paragraph:** what shipped (three fitted ship models, drawn in the game and the Hangar, with a loud box fallback) and on which branch and commits.
  2. **Measured results:** each ship's built bytes, triangles and draw calls; the CV-6's `rx`, `ry`, `sy/sx`, `kWaterline`, `kDeck`, overall length, deck grid shares and trap-lane width; the Liberty's keel and pinned ratio. Whatever differs from this plan's table, say so.
  3. **Tier 2 results, with numbers:** each p95, each deck-probe reading, the luminance ratio, and what the broadsides showed.
  4. **The interface S2 and H3 consume,** as exact names with paths: the `ship` block (`ShipEntry`, `otherMaterials`, `bow`, `keelM`), `shipFitStage`, `shipMaterials`, `roleMaterial`, `addShipMarkers`, `documentSoup`, `fitProblems`, `SHIP_PALETTES` (S2 adds `ijn`), `SHIP_MODELS`, `makeShipViewLoader`, `ShipView`, `createShipView`, and the `SmokeOrigin` and `TrapBand` nodes.
  5. **What changed visibly:** real ship models; ships list about the keel; the boxes sink deeper before hiding; the Models credit line.
  6. **Traps,** one line each:
     - A ship glb is fitted to the spec's numbers at build time: changing `content/ships/<id>.json`'s dimensions fails Tier 1 until the glb is rebuilt.
     - Never `disposeMeshTree` a `ShipView`'s root; call `dispose()`.
     - The markers are added after `prune`; a stage added between them and `prune` would lose them.
     - The raw inputs are gitignored in `tools/models/cache/`; a fresh clone re-fetches them with `sketchfab-fetch.sh`.
  7. **The departures,** pointing at this plan's list rather than restating it, plus any execution departures from its steps.
- [ ] **Step 2: Master spec §15.** Add this row directly after the "A6M Zero (Z1-Z3)" row, with the real date and results:

`| Ship models (S1-S2) | any | Licensed ship models fitted to the sim's ShipSpecs: the three shipped ships (S1), the rest of the roster (S2) | §4, §10 | S1 complete YYYY-MM-DD with Tier 1 and reference-GPU Tier 2 ([design](2026-09-25-ship-models-design.md), [plan](../plans/2026-09-25-s1-ship-models.md), [handoff](../../handoff/YYYY-MM-DD-s1-ship-models.md)): the CV-6 as the Essex, the Fletcher, the Liberty as the Type B maru; box fallback kept. S2 open |`

- [ ] **Step 3: README.** After the "Models build from a manifest (Z1…)" paragraph, add one paragraph: the three shipped ships are licensed models fitted at build time to their `content/ships/*.json`, so the sim stays authoritative; a model that fails to load draws the procedural boxes and says so in `validationErrors`; for status, see master spec §15. Do not restate the order.
- [ ] **Step 4: The superseded section.** At the top of the visual-realism spec's §3.3, add one dated line: `**Superseded 2026-09-25** by [the ship-models design](2026-09-25-ship-models-design.md) §0; S1 shipped the models on <today> ([handoff](../../handoff/<today>-s1-ship-models.md)).`
- [ ] **Step 5: The Hangar spec** (only if Open question 1 kept its default). At §12's H2 item 4, add: `Done in S1 (<today>): src/render/hangar/models.ts loads ships through makeShipViewLoader.`
- [ ] **Step 6: Verify and commit.**

```bash
flock /tmp/ww2airsim-fullsuite.lock sh -c 'npm run typecheck && npm run lint && npm run depcruise && npx vitest run --maxWorkers=2'; rc=$?; echo "rc=$rc"
git add docs/handoff/ docs/superpowers/specs/2026-09-12-ww2airsim-design.md README.md docs/superpowers/specs/2026-09-24-visual-realism-pass-design.md docs/superpowers/specs/2026-09-25-hangar-library-design.md
git commit -m "S1 handoff: ship models; §15 row, README pointer, and pointers at the sections S1 superseded or completed"
```


---

## Self-review against the spec (done while writing)

- **Coverage of spec §11's S1 list.** Task 1 of the spec (inspect and confirm) is folded into this plan's Task 3 Steps 1 and 2, because its deliverable is the build's input; its measurements are this plan's "Measured" section. Spec Task 2 is Task 1; spec 3 is Task 6; spec 4 is Task 2; spec 5 is Task 3; spec 6 is Task 4; spec 7 is Task 5; spec 8 is Task 7 plus Task 4's dist lines; spec 9 is Task 9; spec 10 is Tasks 8 and 10.
- **Spec §9's Tier 1 list.** Item 1, provenance: `outputs.test.ts` (source, license, the `ASSETS.md` row) and Task 4 (author). Item 2, budgets, extensions, BLEND, metalness: `checkOutput` through `outputs.test.ts`. Item 3, the fit against the live spec: Task 4's `fitProblems`. Item 4, the carrier grid and the trap band: `fitProblems`' grid and lane, and Task 4's `TrapBand` test. Item 5, `SmokeOrigin` and sink depth: Task 4 and Task 5. The runtime list (bow and waterline in the posed frame, `setDamage` about x, smoke at `SmokeOrigin`, the trap band on carriers, boxes without a model, the loud fallback, release on switch, shared materials, registry coverage): Tasks 5, 6 and 7.
- **Spec §4.4's tolerances** each have a failing case in Task 1: hull length, deck length (through the raised deck), overall length, k, sy/sx, main deck, deck share, lane (centerline and trap), below-deck corners, fittings, narrow end, pinned ratio, island side, keel, skirt.
- **Placeholders:** none. `<today>` and `YYYY-MM-DD` in Task 10 are dates the executor fills in at the time.
- **Names across tasks:** `ShipView`, `createShipView(spec, modelId, instance)`, `makeShipViewLoader(reportError, acquire?)`, `LoadShipView`, `SHIP_MODELS`, `shipModelUrl`, `shipFitStage`, `addShipMarkers`, `shipMaterials(doc, ship, flightDeckY)`, `fitProblems(soup, spec, opts)` and `documentSoup` are spelled the same in every task that uses them, and every one of them ran together in this worktree.
