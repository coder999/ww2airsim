# R2: Complete the ship roster — Implementation Plan

**Goal:** Put a fitted, licensed or original model behind every ship in the Library, and add the seven S2 `ShipSpec`s without placing any new ship in a scenario.

**Architecture:** Four vetted Sketchfab inputs enter S1's existing ship-fit pipeline. Three original, deterministic Blender scripts use an extended model kit and enter the same pipeline. Every output is fitted to a sourced `content/ships/<id>.json`, registered in `SHIP_MODELS`, selected by the Library entry's `spec`, and re-measured from the committed glb by Tier 1. R2 changes content and rendering only; scenarios and ship simulation code stay unchanged.

**Tech stack:** TypeScript, glTF-Transform 4, Blender 5.0.1 headless, three.js WebGPU, Zod 3, Vitest, and Playwright Tier 2 on the RX 6700 XT.

**Specs and predecessors:** Read `docs/superpowers/specs/2026-09-26-model-roster-design.md` §§3–7, `docs/superpowers/specs/2026-09-25-ship-models-design.md` §§2–5 and 9, `docs/handoff/2026-09-25-s1-ship-models.md`, `docs/handoff/2026-09-26-m0-blender-kit.md`, and `docs/handoff/2026-09-26-r1-roster-pipeline.md` before execution.

## Mark's decisions for this plan (2026-09-26)

- **Where it runs:** `.claude/worktrees/r2-ships`, branch `worktree-r2-ships`. The branch may be pushed. Never merge it into `main`, push `main`, or deploy without Mark's request.
- **Checkpoint:** final product only, with one frozen Hangar capture of each of the seven ships in the handoff.
- **Attendance:** unattended. Run through completion without waiting for Mark.
- **Scope:** R2 carries out S2. It adds the seven models and their ship specs, but no scenario placement and no moving turrets (H3).
- **Sources:** confirm the roster against primary material before authoring. Every numeric content field and Blender-script dimension is either cited with a read date or labeled `ESTIMATE`; hit points and turn rates are labeled gameplay choices.

## Measured start (`main` at `a0005ff`, 2026-09-26)

- `main` and the new worktree were clean. Focused baseline: `shipModels`, Hangar roster, and Blender entries, **11/11 passed**, including the real Blender rebuild.
- R1's `NOT_YET_DRAWN` list has 25 entries, including exactly these seven ships. R2 removes all seven and lowers `CEILING` from 25 to 18.
- The Library entries already exist, but have no `spec`. Only the three S1 ship specs and glbs exist. `SHIP_MODELS` contains those same three ids.
- `SHIP_PALETTES` has only `usn-1944`; S2's Japanese ships need `ijn`.
- R0's kit has deterministic boxes, barrel vaults, and arch gables. Its handoff explicitly defers the first hull primitive to R2.
- S1's full fit, material, marker, loud-fallback, cache, deck-probe, and credits paths are already complete. R2 extends their data; it does not make a second ship pipeline.

### Licensed inputs, re-measured from the staged files

| R2 id | Raw bytes | Triangles | Draws | Source-frame bounds | Plan |
| --- | ---: | ---: | ---: | --- | --- |
| `cleveland-cl` | 612,444 | 9,407 | 1 | `[-0.560,-0.010,-5.407]..[0.560,2.180,5.957]`; bow `-z`, waterline base | fit hull, flat IJN/USN pipeline paint |
| `mogami-ca` | 354,896 | 5,603 | 2 | `[-0.893,-0.050,-7.606]..[0.893,1.925,7.342]`; bow `-z`, weak-but-passing narrow end | fit hull, confirm bow in output |
| `yamato-bb` (raw `musashi-bb`) | 649,540 | 10,132 | 1 | `[-1.616,0,-9.807]..[1.616,3.190,10.221]`; bow `-z`, waterline base | fit hull, `ijn` palette |
| `shiratsuyu-dd` (raw Samidare) | 18,393,080 | 140,199 | 17 | `[-78.686,-4.931,-7.288]..[66.655,26.561,7.288]`; bow `+x`, full hull | simplify toward 45k triangles; measure and pin its waterline/keel before entry |

All four sidecars say CC Attribution and match the vetted `ASSETS.md` candidate rows. Re-read the Sketchfab API license during execution; a download is not the license check.

### ShipSpec starting figures

Task 1 rechecks these against the cited sources before committing. Conversions use exactly `1 kn = 0.514444 m/s`; `deckHeightM`, `turnRateRadPerS`, and `hullHp` are not historical claims.

| id | role | length × beam (m) | maximum speed | deck / flight deck | gameplay HP |
| --- | --- | --- | --- | --- | ---: |
| `cleveland-cl` | cruiser | 185.95 × 20.22 | 32.5 kn | main deck height estimate | 360 |
| `mogami-ca` | cruiser | 200.6 × 20.2 | 35 kn | main deck height estimate | 420 |
| `yamato-bb` | battleship | 263.0 × 38.9 | 28 kn | main deck height estimate | 1,200 |
| `pennsylvania-bb` | battleship | 185.3 × 32.4 | 21 kn | main deck height estimate | 960 |
| `shiratsuyu-dd` | escort | 107.5 × 9.9 | 34 kn | main deck height estimate | 160 |
| `kagero-dd` | escort | 118.5 × 10.8 | 35 kn | main deck height estimate | 180 |
| `casablanca-cve` | carrier | 156.1 × 19.9 | 19.3 kn | about 145.7 × 24.4 m flight deck; height estimate | 400 |

The HP scale preserves Plan 6b's arithmetic: Fletcher 160, merchant 240, Essex 600. These seven are not placed in a scenario, so the choices change no shipped combat.

## Invariants and failure cases

1. A source/license mismatch stops that model before its entry or output is committed.
2. A ship output is always re-measured against its live spec. Moving a spec dimension makes Tier 1 fail by name.
3. Every model faces `+x`, uses `y=0` as the waterline, has `SmokeOrigin`, and a carrier has `TrapBand`. A full hull also pins `keelM`.
4. A Blender script is deterministic. The nexus rebuild suite compares its bytes to the committed glb; absence of Blender is a named skip only on hosts without Blender.
5. The three original silhouettes are distinct and class-correct at Hangar distance: Pennsylvania has four triple main turrets, Kagero has three twin main turrets and two centerline torpedo banks, and Casablanca has a narrow escort-carrier deck and starboard island. Turrets are named `Turret1...` bow to stern for H3.
6. Budgets begin at 3 MB, 45k triangles, and 12 draws per new ship. A raise requires a measured reason in the ledger. Samidare is simplified rather than exempted.
7. Runtime load failure remains loud and falls back to S1's procedural ship. R2 does not change that code path.
8. No scenario or gameplay loop changes. `git diff main...HEAD -- content/scenarios src/sim` must be empty except the new `content/ships/*.json` files under the path overlap.

## Task 0: Worktree data, ledger, and baseline (no commit)

- [ ] Confirm branch `worktree-r2-ships`, clean status, `HEAD a0005ff`, Blender 5.0.1, and enough disk.
- [ ] Create `.superpowers/sdd/2026-09-26-r2-ship-models/progress.md`. Record `unattended, final-product checkpoint`, every measured result, and every departure as `Ruling:`.
- [ ] Copy or reflink the four exact staged candidates and their sidecars from the main checkout into this worktree's gitignored `content/models/candidates/`, then place the four raw glbs at the exact `tools/models/cache/` paths their entries will name. Record SHA-256 on both sides.
- [ ] Re-run the 11-test focused baseline and record `rc` directly.

## Task 1: Sources and seven strict ShipSpecs

**Files:** create the seven `content/ships/*.json`; extend content/roster tests only where needed.

- [ ] Confirm the ship roster and Leyte context against primary material: NARA/NHHC records for the U.S. classes, and wartime/postwar U.S. Navy ONI or Naval Technical Mission records for Japanese classes. Keep secondary class tables for exact principal dimensions where the primary record does not state them, and say so.
- [ ] Write failing tests that enumerate all ten roster ids, parse each spec strictly, check role, positive dimensions/speed/HP, carrier-only `flightDeck`, and `flightDeck.heightM === deckHeightM`.
- [ ] Add the seven specs with sourced `lengthM`, `beamM`, and maximum speed; estimates for deck height and turn rate; gameplay-choice HP; `view.model` equal to the id. Casablanca alone gets `flightDeck`, `trapZone`, and the existing Essex paddles choices unless a measured reason says otherwise.
- [ ] Run the content and ship-schema tests, then typecheck and lint the changed files. Commit.

## Task 2: IJN paint and the three KTKloss ships

**Files:** `shipPalette.ts`, palette/material tests, three model entries, three outputs, `ASSETS.md`.

- [ ] Add an `ijn` role-complete palette with a neutral gray hull/superstructure, dark linoleum or steel deck, black boot top, red-brown antifouling, and dark fittings. Tests assert every palette has every `SHIP_ROLES` key and valid color values.
- [ ] Re-read all three API license records and compare uid, author, license, and viewer URL with the sidecars and `ASSETS.md`.
- [ ] Add `cleveland-cl`, `mogami-ca`, and `yamato-bb` entries. Use the measured `-z` bow, `+y` up, waterline origin, hull fit, `waterline` kind, 1,024 px maximum textures (there are none), and the initial 3 MB / 45k / 12-draw budget. Cleveland uses `usn-1944`; Mogami and Yamato use `ijn`.
- [ ] Build each by id. Inspect and record fitted dimensions, main-deck plane, bow ratio, bytes/triangles/draws, and marker positions. Add final-output rows to `ASSETS.md` in the same commit as each glb.
- [ ] Run model output, ship-stage, fit, committed-ship, palette, and dist tests. Commit.

## Task 3: Samidare becomes the Shiratsuyu model

**Files:** `shiratsuyu-dd` entry/output and committed-output tests, `ASSETS.md`.

- [ ] Use inspection and a rendered broadside to identify the texture/material roles, full-hull waterline, keel, smoke origin, and bow evidence. Record each measurement before writing the entry.
- [ ] Add the entry with `forward: +x`, `up: +y`, a measured origin, hull fit, `full-hull`, pinned `keelM`, and `ijn`. Preserve base color, force metallic to zero through S1's material stage, resize textures to 512 px unless a 1,024 px visual comparison proves necessary, and simplify near ratio 0.30 with an error that preserves the silhouette.
- [ ] Build, inspect, and render. The output must be at most 45k triangles and start inside 3 MB/12 draws; only measured visual loss can justify a budget adjustment.
- [ ] Add the final `ASSETS.md` row and tests for fit, bow, keel, opaque/masked materials, budget, and output provenance. Commit.

## Task 4: The ship-authoring kit

**Files:** `tools/models/blender/kit.py`, a Blender probe fixture, kit tests.

- [ ] Write failing Blender tests for: station-lofted hull length/beam/draft and outward normals; deterministic point/cylinder or prism fittings; a deck slab at a requested height; turret node names and ordering; degenerate or non-monotonic station tables rejected.
- [ ] Add only the primitives the three R2 ships consume. The hull takes an ordered `x` station table with half-beam, keel/draft, freeboard, and optional sheer; it closes bow/stern and the waterline-to-deck sides without randomness. Add the minimum deck, tapered superstructure, cylinder/mast, turret/barrel helpers needed by the scripts.
- [ ] Keep the glTF frame (`+x` forward, `+y` up), sorted node creation, no unapplied modifiers, and the pinned exporter unchanged.
- [ ] Run every Blender-kit and runner test on nexus, mutation-check one normals assertion and one station-validation assertion, then commit.

## Task 5: Pennsylvania, Kagero, and Casablanca

**Files:** three Blender scripts, three entries/outputs, Blender entry tests, `ASSETS.md`.

- [ ] Write the model scripts from cited principal dimensions and dated plan/photo references. Each header separates `CITED` from `ESTIMATE` and states omissions.
- [ ] Pennsylvania: waterline hull, four triple `Turret1...Turret4`, period 1944 tower/masts, funnels and secondary-battery masses. Kagero: fine destroyer hull, three twin turrets, two centerline torpedo-bank masses, bridge, two funnels and masts. Casablanca: waterline hull, fitted rectangular flight deck, starboard island, one elevator impression and stern gun mass; `TrapBand` still comes from the build stage.
- [ ] Add entries with identity axes/origin where the kit already emits meters, the correct palette, `otherMaterials` mappings, smoke origins, bow rules, and 3 MB / 45k / 12-draw starting budgets.
- [ ] Build one at a time on nexus. For each: inspect, run byte-identity twice, run committed fit checks, render front/side/three-quarter previews, and correct geometry only behind a failing measurement or a read capture.
- [ ] Add AGPL rows to `ASSETS.md`. Extend `blenderEntries.test.ts` so every ship script's cited length/beam/draft or flight-deck dimensions are measured from committed bytes without needing Blender. Commit each ship separately.

## Task 6: Register the complete roster and make completion bite

**Files:** `SHIP_MODELS`, the seven Library entries, Hangar roster test, ship registry test, committed ship/output/dist tests.

- [ ] Write the failing registry and roster assertions first: all ten ship specs name registered models; every `kind: ship` Library entry has a matching spec; the seven R2 ids are absent from `NOT_YET_DRAWN`; `CEILING === 18`.
- [ ] Register all seven ids, set each Library entry's `spec` to its id, and leave the existing `model` field absent because the spec's `view.model` is the authoritative in-game and Hangar path.
- [ ] Generalize any S1 test that says “the three shipped specs” so it asserts the complete registry without weakening its negative cases.
- [ ] Re-measure all ten committed ship outputs against the live specs. Assert `SmokeOrigin` on all, `TrapBand` on both carriers, budgets/provenance, and dist inclusion.
- [ ] Run all touched Tier 1 files, `typecheck`, `lint`, and `depcruise`; record rc directly. Commit.

## Task 7: Reference-GPU Tier 2 and unattended checkpoint

- [ ] Reserve a free worktree slot only after checking it. Point this worktree's scratch `vite.config.ts` at that slot, start its own Vite server, and assert the HTTPS Hangar URL returns 200. Never stop another worktree's server and never commit the slot edit.
- [ ] Extend `tests/e2e/hangar.spec.ts` only if its current automatic iteration does not already prove all seven ids render, are lit, fit the platform, stay inside their budgets, expose named parts, and produce no validation errors.
- [ ] Run the Hangar spec on the remote reference GPU at 2560×1440 and the repository's required Tier 2 acceptance. Record gpu p95 and retries; a page-load timeout is reported separately from a model failure.
- [ ] Capture one frozen three-quarter Hangar view per new ship under `docs/handoff/2026-09-26-r2-shots/`. Read every PNG. Check bow, waterline, island side, opaque materials, silhouette, and turret ordering.
- [ ] Restore `vite.config.ts`, remove the throwaway capture spec, stop only this worktree's server, and commit only durable spec/capture changes.

## Task 8: Verification, handoff, and status

- [ ] Run `remote-run npm run verify`, capturing `rc=$?` directly. Then run `npx vitest run tests/tools/models/blender tests/tools/models/blenderEntries.test.ts --maxWorkers=1` on nexus so Blender checks execute rather than skip.
- [ ] Confirm `git diff main...HEAD -- content/scenarios` is empty; inspect the whole branch diff; verify no cache, candidate, scratch slot, or throwaway spec is tracked.
- [ ] Write `docs/handoff/2026-09-26-r2-ship-models.md` with source rulings, fitted measurements, final budgets, test counts, Tier 2 numbers, all seven captures, commit range, and open items.
- [ ] Update master spec §15: S2 complete through R2; R2 complete with plan/handoff links and measured acceptance. Update README with one concise paragraph pointing back to §15; do not restate the roadmap.
- [ ] Final ledger entry: all rc values, named skips, measured models, GPU numbers, branch commits, and handoff written.
- [ ] Commit the completion docs, push `worktree-r2-ships`, and email the handoff as HTML. Do not merge or push `main`.

## Acceptance

- Tier 1 asserts ten Library ship entries, ten strict ShipSpecs, ten registered/committed glbs, seven R2 outputs within recorded budgets, live-spec fit, markers, provenance, and three Blender byte-identical rebuilds.
- Tier 2 draws all seven new ships in the Hangar on the reference GPU with zero validation errors and records one reviewed capture each.
- The R2 branch contains no scenario placement, no H3 turret motion, no caches/candidates, and no unrecorded budget or source departure.
- `remote-run npm run verify` and the nexus Blender suites end green.
