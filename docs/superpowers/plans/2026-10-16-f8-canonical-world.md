# F8 canonical Leyte campaign world: program plan (2026-10-16)

MASTER_PLAN Track F8 (plans 13-15 of the 22 in the
[F3 dependency table](../specs/2026-10-14-leyte-campaign-definition.md#11-dependency-checked-plan-count)).
**Status: plan only. Nothing is implemented. Do not start building until F5C has landed on `main`** (Mark, 2026-10-16:
F5C edits `loop.ts`, `outcome.ts`, `main.ts`, `recorder.ts`, and F8's state selection reads its shape).
Grilled with Mark 2026-10-16 (decisions below). F8A is task-level; F8B and F8C are outlined and get their own detail when reached.

## Header

- **Branch:** worktree `~/projects/ww2airsim-worktrees/f8a`, cut from `main` after F5C lands.
- **Run mode: fully unattended, final result only** (Mark, 2026-10-16). One attended exception: the four new models (below) go
  through the Hangar for his approval first, as F4 did (Task 0). He will review them once rendered. Task 0 does not depend on
  F5C and may start before it lands.
- **Heavy jobs:** `remote-run` on ryzen is allowed again; budget specs under `hwlock ryzen-budget`, on `BUDGET_PARAMS=trees=off`
  and trees on, a fresh vite, at least 6 interleaved loads (budget-analysis session, 2026-10-16).
- **Budget rule (Mark, 2026-10-16):** gates stay as written; a red spec is documented with measured numbers, never tuned.
- **Size:** F8A about 12 tasks. F8 as a whole is L (3 plans), unchanged.

## Findings that shaped this plan (verified 2026-10-16, main `6922cff2`)

1. **The ten approved building models already exist and are not in the game.** F3 section 7 names `hangar`, `tower`, `aaa`,
   `ammunition-bunker`, `barracks-and-huts`, `coastal-gun-battery`, `fuel-tank-farm`, `pier-and-warehouses`,
   `radio-radar-station`, `revetment`. All ten glbs are in `content/buildings/` with Library entries, but a base's
   `buildings[].kind` is a three-value enum (`src/sim/world/airfields.ts:25`) and the renderer draws only procedural
   shapes (`drawBuilding`); the game never loads those glbs. So "author glbs for the new building kinds" (grilling Q10) is
   mostly **make the existing ten placeable**, not new Blender work. Four **new** models are proposed in "New models (F3 amendment)" below;
   tents, sandbags, mats, drums, crates, mud, ruts, craters and construction states stay procedural (F3 section 9).
2. Only three bases exist (`content/bases/{tacloban,dulag,bayug}.json`); no Buri, San Pablo, Tanauan or Ormoc. Nothing is dated.
3. `Campaign.world` is already an opaque `Record<string,string>` that F8 owns (`src/campaign/schema.ts:104`).
4. Five F4 vehicles (`gmc-cckw-353`, `caterpillar-d7-3t`, `type94-cargo-truck`, `type38-75mm-field-gun`, `lcvp`) have glbs and
   Library entries but **no sim `VehicleSpec`**. Only four specs exist (Sherman, Kurogane, Chi-Ha, Willys).
5. No aircraft-versus-structure collision exists; structures have hit boxes for weapons only. `StructureEntity.side` is fixed
   per airfield, and `loop.ts` says structures never change side.
6. There is no authoring path for structures in a scenario, and no multi-object placed-scene view in the Hangar; a base is
   viewed by running a scenario.
7. Lights are scenario-level (`LightsSchema`), not part of a base.

## Decisions (Mark, 2026-10-16)

| # | Decision |
| --- | --- |
| 1 | One program plan; F8A in detail. F8A sites: **Tacloban, Dulag, Tanauan**. F8B: Buri, Bayug, San Pablo. F8C: Ormoc, landing beaches, San Pedro Bay anchorage, plus state integration. |
| 2 | State = one JSON per site: a base layout plus per-window overlays, selected by chapter through `Campaign.world`. |
| 3 | Layouts are hand-placed JSON on the real terrain. No procedural generator. |
| 4 | F8's gate includes a scripted mission-fit check for **all twelve** missions (start to first action within the F3 ceiling, 7 minutes at 1x). |
| 5 | Placed trucks, dozers, guns and landing craft are real `VehicleEntity`s with new `VehicleSpec`s, **hard-capped per site-state** (proposed 12), enforced by a test and a budget spec on the busiest state. |
| 6 | Collision: aircraft crash into structures using their hit boxes. Damage is **authored per window**; no new live damage. |
| 7 | Side comes from the window's overlay and is fixed within a sortie. Overlay also carries `serviceable`; recovery and AI read both. |
| 8 | F8 owns one chapter-to-windows table (F3 section 4 "State transition" lines) and window ids; F10 missions only declare their chapter. |
| 9 | The overlay lists lights per window, merged into the scenario's lights at world build (existing light kinds, F6A contract unchanged). |
| 10 | **A launch reads the stored `Campaign.world`** (Mark, 2026-10-16, after F8A), not the chapter's own window; the wiring and the save/load round trip are F8C. F8A only provides the chapter table and the `?siteState` override. |
| 11 | Final-result viewing only; fully unattended; plan proposes, Mark approves any new building list by email review. |

## New models (F3 amendment, approved by Mark 2026-10-16)

Mark approved all four. Sources were read 2026-10-16 by a research pass; the Navy 20x48 manual page failed to load and is
unverified, so dimensions the sources do not give are `ESTIMATE`. Each model gets provenance, limits, a Library entry, budget
enrollment and a Hangar card, as F4 did (`docs/models.md`, `ASSETS.md`).

| Model id | What it is | Used at | Source and limits |
| --- | --- | --- | --- |
| `quonset-hut-20x48` | Navy steel-arch-rib hut, 20 x 48 ft half-cylinder of corrugated steel | Tacloban (offices, quarters, from 24 Oct 1944), Jinamoc anchorage; Dulag and Tanauan are **inferred** and labeled so | Navy, *Building the Navy's Bases* ch. XXIX (<https://www.ibiblio.org/hyperwar/NHC/bases/bases-29.htm>): Quonsets for offices and quarters at Tacloban and Tolosa, 75 at the Jinamoc seaplane base. Seabee Museum Quonset manuals page (<https://history.navy.mil/content/history/museums/seabee/explore/online-reading-room/Publications/quonset-hut-manuals0.html>) **unverified**. Generic 20 x 48 form; no Wikipedia imagery. Nissen rejected (British, no Leyte evidence). |
| `pontoon-pier-segment` | Steel pontoon-cell pier/causeway section (about 5 x 7 x 5 ft cells, **ESTIMATE**, bolted into a pier run) | Landing beaches (from 20 Oct), San Pedro Bay anchorage | Same Navy chapter: Seabee detachment handled pontoon barges and causeways at the landing and later reassembled cells as barges and pontoon piers. Army, *Leyte* ch. XI (<https://ibiblio.org/hyperwar/USA/USA-P-Return/USA-P-Return-11.html>): an additional Tacloban dock and lighterage wharves by 1 Dec. A sand LST causeway stays procedural. |
| `jinamoc-seaplane-ramp` | Beaching ramp, steel and pre-cast concrete, 220 ft long, width **ESTIMATE** | San Pedro Bay anchorage (Jinamoc, 5 mi east of Tacloban) | Navy ch. XXIX above: first ramp a submerged pontoon barge, permanent ramp 220 ft. |
| `ormoc-customs-building` | A plain port customs building, **no light** | Ormoc | Existence only: JACAR Notice to Mariners (<https://www.jacar.archives.go.jp/acv/contents/pub/pdf/B11/B11092933500.b3_0098.3-2198.00000139.pdf>) records a customs building with a fixed red light; appearance and 1944 survival are **not sourced**. Whole appearance is an `ESTIMATE`; the light stays excluded (F3 section 8). Mark chose to include it. |

Rejected after research: a Japanese maintenance shelter or nipa utility building at Buri, Bayug or San Pablo (the Army history
describes no buildings there; San Pablo was unoccupied), and a control building, water tower or radar van (no evidence).

## Design

**Files.** `content/sites/<site>.json` (zod, strict): `{ id, airfield, base, windows }`. `base` holds what never changes between
windows (runway, terrain-fitted placements of buildings that persist). `windows` has the five F3 section 5 columns as ids:
`pre-invasion` (18-19 Oct), `assault` (20-24 Oct), `buildup` (late Oct-Nov), `endgame` (6-7 Dec), `j6-alternate`. Each overlay:
`side`, `serviceable`, `buildings` (kind from the ten, with a `state`: `intact`, `damaged`, `destroyed`, `construction`),
`vehicles` (stationary, from the cap), `parked` (`parkedAt` spots for existing aircraft), `lights`, `clutter` (procedural
density settings: mats, tents, drums, mud, ruts, craters). A building never moves between windows; a test asserts every
persisting building id keeps its position in every overlay.

**World keys.** `Campaign.world[siteId] = windowId`. The chapter-to-windows table lives in `src/campaign/worldStates.ts` (pure,
tested against F3 sections 4 and 5). `applyChapterSuccess(world, chapterId)` returns the next `world`; `bankSortie` is untouched.

**World build.** `worldFromScenario` gains an optional `sites` step: for each site in the scenario, read the window from the
campaign's `world` (or a DEV query), then merge `side`, structures, vehicles, parked aircraft and lights into the world. No
`sites` means a world byte-identical to today (the golden recordings guard it).

**Interactions.** Aircraft contact with a structure box is a crash (new sim contact test). Recovery objectives and AI landing
choice treat a field as legal only if `side` matches and `serviceable` is true.

## F8A tasks (Tacloban, Dulag, Tanauan)

0. **The four new models** (above), built serially in Blender on nexus under the compute lock, F4-style: scripts, glb, Library
   entries, provenance rows, bounds/origin/budget/deterministic-rebuild tests, `ASSETS.md`, day and dark-background captures, a
   Hangar review board. **Mark approves in the Hangar before any site file uses them.** Independent of F5C. Requires the F3
   amendment (section 13 of the F3 lock) to be on `main` first.

Each names its failing test first. All run after F5C is on `main`; re-read its world, leg and recovery changes before Task 6.

1. **Schema and loader.** Test: a malformed site file fails; every site has all five windows; window ids come from one list.
2. **Chapter-to-windows table.** Test: for each of the twelve chapters, the produced windows equal F3 sections 4 and 5; an unknown
   chapter throws; `world` after A1 has Tacloban and Dulag in `assault`.
3. **Existing ten plus the new four placeable.** Extend the enum, load the existing glbs through `staticModels` (kind `building`), keep the
   procedural `drawBuilding` as fallback and for collapsed rubble, size hit boxes from footprints. Test: each kind draws and has a
   hit box; the three current bases render unchanged.
4. **Structure collision.** Test first: an aircraft driven through a hangar box impacts; one beside it does not; existing landing
   and taxi tests stay green (the survey found no `structures` references in contact/landing/ground).
5. **Five `VehicleSpec`s and stationary placement.** Specs for the five F4 vehicles (hp, `targetType`; `landing-craft` for the LCVP).
   Test: each loads; a speed-0 vehicle stays put; **verify and record whether stationary vehicles still cost a step per tick**
   (if so, skip them in `stepVehicle`).
6. **Overlay application.** Merge side, buildings, vehicles, parked aircraft and lights at world build; recovery and AI read
   `serviceable`. Test: an `unserviceable` Dulag is not a legal recovery field; a world with no `sites` is byte-identical.
7. **Procedural clutter.** Instanced mats, tents, sandbags, drums, crates, mud, ruts, craters by density, per F3 section 9.
   Test: deterministic from the window; instance counts within a stated ceiling.
8. **Author Tacloban, Dulag, Tanauan** across all five windows against F3 section 5 and the section 10 sources: runway
   headings and lengths for Tanauan are fitted to terrain; Tanauan is a construction site only and is not operational before
   7 Dec. Test: building persistence (above); the vehicle cap; parked-aircraft spots exist.
9. **DEV `?siteState=<site>:<window>`** and a capture spec that shoots fixed views of every state, for the handoff.
10. **Mission-fit harness.** A hand-transcribed `missionFit` table (start, first-action point, cruise speed) from F3 section 4,
    and a test that checks each row against the real layout within 420 s at 1x. F8A fills the rows that start at or reach its
    sites; the remaining rows close in F8C. A row that fails is a finding to report, not to tune.
11. **Budget spec** for the busiest F8A state (Tacloban, `buildup`, at the vehicle cap) against a `sites`-free baseline; run on
    ryzen both with and without `trees=off`, six interleaved loads, fresh vite; record both; leave red if red.
12. **Docs and closeout.** `docs/campaign-data.md` (world keys), `MASTER_PLAN.md`, README, `docs/testing.md` Known gaps, the
    handoff with Tests updated / still valid / Known gaps; `npm run verify` via `remote-run`, gated on exit status; fast-forward
    merge after Mark's confirmation.

## F8B and F8C (outline)

- **F8B:** Buri, Bayug, San Pablo. Runway headings and lengths from the Army history (San Pablo about 4,920 x 164 ft, Bayug and
  Buri about 5,000 ft), fitted to terrain. San Pablo is overgrown before the invasion and the J5 lodgment area at the end.
- **F8C:** Ormoc (port and logistics hub, no customs-building light), landing beaches (LCVPs, supply dumps), San Pedro Bay anchorage
  (rescue launch, mooring buoys, PBY activity), the J6 alternate result for every site, `Campaign.world` save/load round trips,
  and the rest of the mission-fit rows.
- Both reuse Tasks 1-9 unchanged; each adds site files, tests and a capture set.

## Acceptance gate (F3, restated)

| F3 gate item | How it is proven |
| --- | --- |
| each dated state has a scene checkpoint | final-result capture set per site; Mark views once |
| mission navigation and collision use the visible layout | Task 4 and the Task 10 mission-fit table |
| campaign transitions reproduce after save/load | F8C round-trip test on `Campaign.world` |
| historical and site-source claims reconcile | each site file cites its F3 section 10 source line; a test lists any placement without one |

## Risks

- **F5C collision.** Hence "after F5C lands". Task 6 is the one that re-reads its changes; Tasks 1-5 and 7 are new files plus the
  enum and renderer.
- **Vehicle sim cost.** Task 5 measures it before the cap is trusted.
- **Visual fidelity of ten glbs in-game.** They were approved on the Hangar bench, not as placed structures at flight distance.
  Task 3 captures each in the game; if one reads badly at distance, that goes to Mark as a finding.
- **Layout versus mission.** The fit table may fail rows; that is reported, not tuned (F3 and Mark's budget-rule precedent).
- **Source gaps.** Tanauan's exact layout, Ormoc's port arrangement, and 1944 building counts are not in the F3 ledger beyond
  what section 10 says; where a layout is invented it is labeled so in the site file.

## F8B detail: Buri, Bayug, San Pablo (2026-10-17, unattended run)

**Branch:** worktree `~/projects/ww2airsim-worktrees/f8b-sites`, branch `f8b-sites`, cut from `main` `164229a3` (F8A and F5C are both merged).
Pushed, **not merged, not deployed**; the coordinator merges. F8B adds **content, tests and one DEV flag**; it changes no schema, loader,
collision, serviceable rule, clutter or vehicle-cap code. Every F8A piece below is reused unchanged unless a task says "extends".

**Reused unchanged:** the site schema and `parseSite`/`airfieldFor`/`expandScenario` (`src/sim/world/sites.ts`), `BUILDING_KINDS` and the
glb path, `structureCollision`, `serviceable` in `friendly.ts`, clutter (`clutter.ts`, 1,200 ceiling), `VEHICLE_CAP` 12 and `PARKED_CAP` 8,
the five vehicle specs, DEV `?siteState=`, `siteStateCapture.spec.ts` (extended), the glb-footprint, persistence, label, land and
clearance tests in `tests/sim/world/sites.test.ts` (they enroll by reading `content/sites`, so they cover the new files with no edit).
No new Blender model (F3 amendment section 13 rejected a Japanese shelter model): the ten approved buildings plus the four F8A kinds only.

**Source facts the layouts rest on** (U.S. Army, *Leyte*, ch. VIII, read 2026-10-17): San Pablo is about 5 mi west of Dulag and 2 mi east of
Burauen, runs east-west, **164 x 4,920 ft**, overgrown with weeds and unoccupied by the Japanese; Bayug is just north of the highway,
a half mile east of Burauen, about **5,000 ft**; Buri is about 1 mi northeast of Burauen, east-west, **5,000 ft**, the most important of the
three. Everything else (building poses, counts, vehicles, parked aircraft, clutter, lights) is invented gameplay layout and labeled so.

**Two geometry rulings, made here and recorded again in the handoff.** (1) **Bayug's runway is `content/bases/bayug.json` verbatim**
(center (-45100,-20700), heading 0, 1,500 x 45 m = 4,921 ft, which already is "about 5,000 ft"), as F8A did for Tacloban and Dulag, because
Convoy Strike lands there; a test pins the agreement. That base was fitted to the flattest 1.5 km line the terrain offers and sits
**2.7 km west of Bayug's true position**, so Bayug is not at its Army-history offset from Burauen; this is carried, not hidden.
(2) **Buri and San Pablo are fitted to the shipped terrain** near their Army-history offsets from Burauen, with the sourced length and
width, and a heading near east-west: `tools/sites/surveyStrip.ts` (this plan's B1) ranks candidate strips by relief.

| Task | Failing test first | Acceptance | Risks | F8A pieces reused |
| --- | --- | --- | --- | --- |
| **B1 Strip survey** (`tools/sites/surveyStrip.ts`, `grid.ts` gains a heading) | in `sites.test.ts`, "F8B strips are fitted to terrain": all land (min sample above 1.5 m), relief along the full length under 7 m, over every sample on a 3-sigma-wide strip; red before the files exist | Buri about (-41025,-22005) heading 80, 1,524 x 45 m; San Pablo about (-39930,-20590) heading 80, 1,500 x 50 m; both within about 1.7 km of their Army offset from Burauen; Bayug measured and its relief recorded | the shipped terrain is coarse: relief 4-6 m over 1.5 km is the best it offers near both; a flatter strip would be placed far from the sourced offset, which the sources rule out | `groundTruthTerrain`, `heightAt`, Tanauan's fit test |
| **B2 Buri** `content/sites/buri.json` | enrollment list gains `buri`; F3 section 5 table row (below); "J1's five critical groups exist in `pre-invasion`, each tagged"; the building-persistence, label, land, clearance and glb-footprint tests (existing) red until the file exists | five windows; hangars north and south, fuel farm, radio station and a dispersal of revetments, each carrying a `buri-*` tag F10 can name; AAA; parked aircraft for J1's start spot (an A6M2) and J6's | invented layout is most of it, labeled; hit boxes of the ten glbs at natural size only | schema, glb-footprint test, persistence test, vehicle and parked caps |
| **B3 Bayug** `content/sites/bayug.json` | `bayug` enrolled; runway/apron/clearing equal `content/bases/bayug.json` (extends the F8A `['tacloban','dulag']` pin list); F3 row | the base file's tower and AAA are carried as placements with their ids (`bayug-tower`, `bayug-aaa-1`), so a scenario that adds the site keeps the same targets; limited American use in `buildup` | the existing base has no `model` flag, the site always draws glbs: a base-only scenario still renders procedurally, unchanged (a F8A test) | the F8A Dulag precedent (base carried verbatim, hangar-to-Quonset stand-in is not needed here) |
| **B4 San Pablo** `content/sites/san-pablo.json` | `san-pablo` enrolled; F3 row; **"drop-zone space": no building hit box inside the clearing rectangle's open zone in `endgame` and `j6-alternate`, the clearing at least 400 m wide, and the terrain under it all land**; the Army length and width (4,920 x 164 ft = 1,500 x 50 m) pinned | overgrown and unused before the invasion, poor when captured, a construction attempt abandoned, then the J5/J6 lodgment with open ground around the strip; clutter only, no new model | a clearing is static per base and also reads as firm ground (`cover.ts`); no "overgrown weeds" clutter kind exists, so "overgrown" is shown by absence (nothing built, almost no clutter), recorded as a gap | clearing field, `cover.ts` firm rule, clutter |
| **B5 Chapter table** (`src/campaign/worldStates.ts`) | `worldStates.test.ts`: every chapter plays the three F8B sites in the F8A window; **after A6 the three Burauen fields are `endgame`, after J6 `j6-alternate`, after A1 and J5 they are untouched** (F3 section 4: A1 names Tacloban and Dulag only; J5 "captures no field by itself"; A6 and J6 name the inland fields) | `F8B_SITES` added to `SITES`; `PLAY` unchanged (it is `all(window)`); `SUCCESS` for A6 and J6 only gains the new keys through `all()`; existing F8A tests updated to the wider site list | **J3 conflict (an F3 contradiction, not mine to settle):** 3 Nov falls in the "Late Oct-Nov" column, so Bayug is American in J3's window, yet J3 recovers a Japanese pilot there. The table keeps the literal date reading and B6 reports the row as a finding. A window override for J3 is one line if Mark rules for it | `windowsForChapter`, `applyChapterSuccess` |
| **B6 Mission fit** (`tools/sites/missionFit.ts`, `content/campaign/mission-fit.json`, `tests/sim/missionFit.test.ts`) | extends the F8A harness with three things, each test-first: an airborne start; a **recovery leg** (nearest of the named fields, plus landing time, under F3's recovery budget); a **legality check** (each named recovery field is held by the player's side and serviceable in the window `windowsForChapter` plays that chapter in). Also `withinM` where F3 gives a range (J1 "inside 6 mi"). The "fails" cases are written first | fills **J1, J3, J5, J6** and adds A6's recovery leg (A6 recovers at Tacloban, Bayug or Buri); A1-A5, J2, J4 stay pending for F8C (they start at the beaches, Ormoc, the anchorage or the fleet). A failing row is **reported, not tuned**: a row may carry `expectFail` (a finding) and the test then asserts it still fails, so fixing the content flips the test | first-action points for J1, J3, J5 and J6 are invented (F3 gives no geometry), labeled so, as F8A did for A6; J5's start (west of the ridge) is F8C territory and is an invented point whose only claim is the F3 timing | `fitOf`, `groundTruthTerrain`, `windowsForChapter` |
| **B7 F8A Known gaps, where cheap** | a render test that a `damaged` and a `destroyed` building each differ from `intact` by a stated margin (scorch coverage, rubble tone) | what changed is listed in the handoff; nothing about hit boxes, collision or the sim | a visual fix is subjective: judged from the captures, not asserted by eye | `drawBuilding`, F8A's scene-graph signature test |
| **B8 DEV `?siteOmit=`** | a unit test that `siteOmit=aircraft` removes parked aircraft only, and so on for vehicles, buildings, clutter; with no flag the bundle is identical | enables the differential budget arms below | DEV only; absent from a production bundle (`dist.test.ts` already scans) | `siteStateFromQuery`, `expandScenario` |
| **B9 Captures** | the F8A capture spec extended to the three sites (it enumerates by table) | 30 JPEGs, three sites x five windows x two views, in `docs/handoff/2026-10-17-f8b-sites-shots/`; I look at each before claiming a state reads | nexus GPU is correctness quality, not the reference | `siteStateCapture.spec.ts`, `harness.ts` |
| **B10 Budget** `tests/e2e/siteBudget.spec.ts` | a second test for the busiest F8B state (chosen by count after authoring) against the sites-free base, same 1.0 ms tripwire; **trees off and trees on, a fresh vite per mode, at least six interleaved loads per arm, median**; if cheap, differential arms (`siteOmit=` buildings, aircraft, vehicles, clutter) to split the delta | numbers recorded both modes; a red stays red and is documented | ryzen shared with other sessions: take `hwlock -w 3600 ryzen-budget`; port 5175 only if free | `percentile`, `withParams`, `siteScenery()` |
| **B11 Docs** | `campaign-data.md` World keys, `MASTER_PLAN.md` F8 status, `docs/testing.md` Known gaps, README only if it names the sites | the F8B handoff has changes, estimates, Tests updated / still valid / Known gaps, both budget modes, mission-fit results and deviations | docs about another system rot: point at the files, date the claims | - |
| **B12 Verify and close** | `REMOTE_RUN_OVERFLOW=0 remote-run npm run verify` on ryzen to a log, gated on its exit status | green; branch pushed; handoff emailed once | a concurrent session on ryzen; check `origin/main..` before reporting | - |

**F3 section 5, as the F8B site files must say it** (`[side, serviceable]`; every window is `built`):

| Site | pre-invasion | assault | buildup | endgame | j6-alternate |
| --- | --- | --- | --- | --- | --- |
| Buri | axis, yes (principal inland field) | allied, no (captured after inland fighting) | allied, yes (dry-weather use; construction abandoned 25 Nov) | allied, yes (American-held, attacked, temporarily penetrated) | axis, yes (serviceable enough for recovery) |
| Bayug | axis, yes (dry-weather strip) | allied, no (captured) | allied, yes (limited American use continues) | allied, yes (finale objective) | axis, yes (serviceable recovery field) |
| San Pablo | axis, no (overgrown, unused) | allied, no (still poor) | allied, no (construction attempted, abandoned 25 Nov) | allied, yes (see ruling 3) | axis, no (lodgment, see ruling 3) |

Ruling 3 (San Pablo's `serviceable`): F3 says "abandoned" for the build-up and "principal airborne drop/lodgment area" for the endgame, and A6's
graph keeps "at least two of Buri, Bayug and San Pablo above their serviceability threshold" with a secondary "all three inland fields remain serviceable at
debrief", which a field that was never serviceable cannot satisfy. The endgame therefore reads `serviceable: true` (the strip graded for the
7 Dec defense; A6 does not list it as a recovery field, so nothing lands there), and the alternate reads `false` (J6's secondary asks only that San
Pablo "remains Japanese-controlled"). It is one boolean and one test row each; Mark may overrule. Likewise the pre-invasion side of an
unoccupied field is `axis` (the ground the Japanese held), not "neutral": the schema has two sides.

**Mission-fit rows F8B fills (all F3 section 4 chapters that touch Buri, Bayug or San Pablo):** J1 (surface start at Buri; Buri recovery),
J3 (column bound for the Buri dispersal zone; Bayug recovery), J5 (the San Pablo drop), J6 (launch from Buri or Bayug; recover at either), and
A6's recovery leg (Tacloban, Bayug or Buri). A1-A5, J2 and J4 do not touch these fields.

## F8C detail: Ormoc, the landing beaches, the San Pedro Bay anchorage, and the `Campaign.world` round trip (2026-10-17, unattended run)

**Branch:** worktree `~/projects/ww2airsim-worktrees/f8c-world`, branch `f8c-world`, cut from `main` `3a561771` (F5C, F8A and F8B merged). Pushed,
**not merged, not deployed**; the coordinator merges. Run mode: fully unattended, final result only. Another session works in worktree
`hangar-luminance` on the Hangar flat-luminance rows (`tests/e2e/fixtures/flat-luminance.json`, `hangar.spec.ts`, `docs/testing.md` Known gaps):
this branch does not touch those files, and its edits to `docs/testing.md` and `MASTER_PLAN.md` will merge textually, not semantically.

**What the repo already says that shapes this** (read 2026-10-17):

- A site file must produce an `Airfield` record, which needs a `runway` and at least one building (`airfields.ts`); Ormoc, the beaches and Jinamoc have
  no strip. Every F8B site was a flying field, so this is the first site that is not.
- `Campaign.world` already exists and is opaque (`schema.ts`, `world: z.record(str)`); `applyChapterSuccess` exists and nothing calls it; the only
  place a chapter is applied is `credit()` in `bank.ts`, at the first qualifying bank. A launch today reads no window except DEV `?siteState=`, and **no
  shipped scenario names `sites`** (F10 authors them), so the launch wiring has to be proven with a scenario the test supplies.
- `usaaf-63ft-rescue-boat` and `pby-mooring-buoy` have glbs and Library entries but are not placeable (no vehicle spec for the boat; the buoy is
  an `equipment` model, and `BUILDING_KINDS` equals the `building` model table, pinned by `tests/render/siteBuildings.test.ts`).
- `Scenario.anchorages` is a per-scenario water circle; the F5C comment says F8 may replace it. This plan does **not** (it needs the player's side at expansion
  time); it is a handoff follow-up for F10.

**Reused unchanged from F8A/F8B:** the site schema and `expandScenario`, `parseSite`/`airfieldFor`, `windowOf`, `structureCollision`, the vehicle and parked caps,
clutter (1,200 ceiling), the five F8A vehicle specs and the glb path, `?siteState=` and `?siteOmit=`, `siteStateCapture.spec.ts`, `siteBudget.spec.ts`, `missionFit`
harness and its `expectFail`, and the persistence, label, clearance and glb-footprint tests in `sites.test.ts` (they enroll by reading `content/sites`).

**Decisions made here, each recorded again in the handoff** (Mark may overrule):

1. **A non-strip site is an `Airfield` with `noStrip: true`.** Smallest change that keeps buildings, hit boxes, clutter, lights, vehicles and `serviceable`
   working. `runway` stays required but is only the site's local frame (center, heading; 2 x 2 m); with `noStrip` nothing lands on it, no strip is drawn,
   it is never a recovery field, steering target, AI home or landing objective, and no scenery huts or tree clearing come from it. `serviceable` keeps its
   meaning as "usable for its job" (a port working, a beach in use, an anchorage open).
2. **The anchorage as an `Airfield` is a recovery site only through `Scenario.anchorages`, which F10 declares.** The site supplies the coordinates; F8C does not
   add anchorage data to site files.
3. **`Jinamoc` before the invasion is `built: false`** (F3: "Japanese-controlled waters/shore" has nothing to place), as Tanauan is before its construction.
4. **Beach windows:** F3 section 4's A1 line, "the landing-beach state advances from assault to established beachhead", is taken literally: A1 is *played*
   with the beaches in `assault` (the other sites stay `pre-invasion` at 0800, as F8A ruled) and its success writes the beaches `buildup`. A6/J6 move
   them like every other site. Jinamoc, Ormoc: no A1 line, so the same `all(window)` pattern as the other sites.
5. **A launch reads the stored world** (Mark, 2026-10-16): `launchWindows(world, chapter)` returns, for every site the table owns, `world[site]` when the key is
   present and the chapter's own window only when it is absent; keys the table does not own pass through. Dev flights, Single Missions and Training carry no
   chapter, so they get `{}` (every site `pre-invasion`, or the DEV `?siteState=`), exactly as today.
6. **`applyChapterSuccess` is called inside `credit()` (`bank.ts`), at the same `if` that appends the chapter to `progress.completed`.** One added field in
   the object `credit()` already returns; no change to score, ledgers, attempts, roster or the `bankSortie`/`bankLeg` order; no schema bump (`world` exists,
   `schemaVersion` stays 2). A replayed chapter (not the next one) changes nothing, because that branch is guarded by `chapters[completed.length] === chapter`.

| Task | Failing test first | Acceptance | Risks | F8A/F8B pieces reused |
| --- | --- | --- | --- | --- |
| **C1 Non-strip sites** (`Airfield.noStrip`; `Site.noStrip`; guards in `friendly.ts`, `sidesCheck.ts`, `scenario.ts` home check, `groundStop.ts`, `airfields.ts` `airfieldAt`/`insideRunway`, `cover.ts`, `runway.ts`, `airfield.ts` scenery and tree clearing) | `tests/sim/noStrip.test.ts`: a `noStrip` field is not `isFriendlyAirfield` even when allied and serviceable; `airfieldAt` over its frame is null; a `land` objective or AI home at it fails at load; `friendlySites` omits it; a field with no flag is unchanged (a table of the shipped bases); `tests/render` : no strip mesh and no huts for it | the flag is optional and absent from every shipped file; golden recordings unchanged | a guard missed in a consumer would let a P-38 "land" at a pier: the test lists every consumer of `runway` found by grep, and a mutation removes one guard at a time | `parseAirfield`, `isFriendlyAirfield`, F8A serviceable tests |
| **C2 Dressing that can be placed** (`pby-mooring-buoy` as a placeable kind loading from the equipment table; `usaaf-63ft-rescue-boat` `VehicleSpec` with `floats`; `lcvp` gets `floats`) | `siteBuildings.test.ts` list gains the buoy and fails until the loader finds its glb; `vehicleSpecs.test.ts`: the boat loads, `floats` vehicles rest at sea level with no pitch or roll on any bottom | a buoy draws its glb; an LCVP/boat placed in shallow water sits on the surface; `heightAt` over sea is 0 so no spec needed it before, measured not assumed | a `floats` pose differs from `terrainPose` only for specs that say so, so all other vehicles are byte-identical (golden recordings); buoy hit box is a strike target, hp small, never tagged | `STATIC_MODELS`, `vehicleRig` (`rigRescueBoat` exists) |
| **C3 Ormoc** `content/sites/ormoc.json` | enrollment list gains `ormoc`; F3 section 5 table row; **damage carries**: a building destroyed in a window is destroyed in every later one, and `damaged` never returns to `intact` (Ormoc only); the customs building has no light in any window; the existing label, land (`pier-and-warehouses` and `pontoon-pier-segment` exempt for their seaward part), clearance and glb-footprint tests red until the file exists | `pier-and-warehouses`, `ormoc-customs-building` (no light), fuel and ammunition stores, a marshalling area (vehicles + clutter), shore AAA, one coastal gun battery (invented), `intact` early, `damaged` and `destroyed` accumulating through build-up and the 6-7 Dec window, the lifeline open in the alternate; every placement `sourced`/`inferred`/`invented` | the shoreline is the shipped terrain's, not Ormoc's: the port frame is fitted by a survey tool and the fit recorded; 1944 layout of the port is not in the F3 ledger beyond "port/logistics hub", so nearly all of it is invented and labeled so | F8A schema, glb path, damage drawing (F8B), vehicle specs |
| **C4 Landing beaches** `content/sites/landing-beaches.json` | enrollment; F3 row; "the American density rises after 20 Oct": the count of allied placements + vehicles + clutter is strictly larger in `buildup` than `assault`, and `assault` than `pre-invasion` (an assertion, not a look); pontoon pier segment present from `assault` | LCVPs afloat (`floats`), supply dumps (fuel drums, crates clutter, `ammunition-bunker`, `barracks-and-huts` as tents), trucks and dozers (`gmc-cckw-353`, `caterpillar-d7-3t`), `pontoon-pier-segment`; Japanese shore defenses (`aaa`, `coastal-gun-battery`, `revetment`) in `pre-invasion` and the alternate | which beach? F3 lists sectors only; **one** representative beachhead is placed on the shipped coast between Palo and Tacloban (X Corps) and labeled inferred; the Dulag beaches are not drawn | clutter kinds, vehicle cap 12 |
| **C5 San Pedro Bay anchorage** `content/sites/jinamoc.json` | enrollment; F3 row (`built: false` in `pre-invasion`); the ramp and the pier stand at the shore (land test with the water exemption); "no tender, no maintenance barge" (a test: no placement or vehicle names either, F3 section 9) | `jinamoc-seaplane-ramp`, `quonset-hut-20x48` Quonsets, `pby-mooring-buoy`s, `pontoon-pier-segment`/`pier-and-warehouses`, rescue launch `usaaf-63ft-rescue-boat`, an operations/radio hut (`radio-radar-station`), fuel store and warehouse ashore, PBYs beached on the ramp apron; **anchorage lamps in the build-up window** (existing light kinds) for A4's night | the DEM's Jinamoc may be too small or absent: if the island is not in the shipped terrain, the site goes on the nearest shore of San Pedro Bay and says so | F8A lights, `parked`, quonset and pontoon models |
| **C6 Chapter table** (`worldStates.ts`) | `worldStates.test.ts`: nine sites in every chapter's window; A1 plays the beaches in `assault` and its success writes them `buildup`; A6 and J6 move all nine; J5 and A2-A5, J1-J4 write nothing; every key in `world` after any success path is a known site and a known window | `F8C_SITES` added; table still total over `CHAPTER_IDS` | the A1 reading is a ruling above | `windowsForChapter`, `applyChapterSuccess` |
| **C7 J6-alternate for all nine** | `sites.test.ts` TABLE gains Ormoc, beaches, Jinamoc; a separate test asserts every one of the nine sites has a `j6-alternate` window whose `[side, serviceable, built]` equals F3 section 5's last column | the F3 table is covered by assertions for all nine sites, five windows each (45 rows) | none | the TABLE structure |
| **C8 `Campaign.world` round trip** (`launchWindows`, `credit()`, `main.ts` loader call) | (a) `launchWindows`: a stored key beats the chapter's window, an absent key falls back, an unowned key passes through, no chapter gives `{}`; (b) `bank`: the first qualifying bank of A1 writes `world`, a second bank, a failed sortie, an abandon, a loss (`killed`), a replay of a completed chapter and a `bankLeg` that does not qualify leave `world` byte-identical, and the score/ledger fields of every existing `bank` test are unchanged; (c) `world` survives `saveCampaign`/`loadCampaign`, `exportCampaign`/`importCampaign`; a pending sortie resolved at load (abandoned) leaves it unchanged; (d) **replay**: a flight launched from a stored `world` of `{ tacloban: 'endgame' }` (a scenario built with `launchWindows`) records, and `verify` replays it bit for bit; the record launched from the chapter's own window has a different content hash and is refused on the other bundle | `bank.ts` gains one field in `credit()`; `main.ts` passes `launchWindows(campaign.world, pending.chapterId)` to `loadScenarioBundle` unless a DEV `?siteState=` is given | `src/campaign` stays pure (imports itself); a golden recording of a world with no `sites` is unchanged | `windowOf`, `expandScenario`, `contentSha256`, the flight recorder's `verify` |
| **C9 Mission fit** (`tools/sites/missionFit.ts`, `content/campaign/mission-fit.json`, `tests/sim/missionFit.test.ts`) | extends the harness test-first with two start kinds (`deck`: A1, A5; `afloat`: A4: taxi plus water run) and `recovery.points` (a fixed point for a ship or the Essex trap); the new "fails" cases are written first | fills **A1, A2, A3, A4, A5, J2, J4**, so all twelve rows are filled: A3 and A4 against the real Ormoc and Jinamoc frames and Tacloban; A1, A2, A5, J2 start at sea or over the ridge, so F3 gives no geometry and every start and first-action point is `invented` and labeled (A5's start is read off the shipped terrain's ridge crest on the Ormoc-Tacloban line, not chosen); a failing row is REPORTED with `expectFail`, never tuned | most of these seven rows prove arithmetic only, since F10 places the actors; the handoff says which rows constrain a layout (A3 recovery, A4, J4) and which do not | the F8B harness, `expectFail`, legality |
| **C10 Captures** (`siteStateCapture.spec.ts`) | the spec enumerates by table; the three sites add 13 states (Jinamoc has no `pre-invasion` field) x 2 views = 26 JPEGs | I view every image before claiming a state reads; shore and sea views need their own framing | nexus's 680M is correctness quality | the F8B framing table pattern |
| **C11 Budget** (`siteBudget.spec.ts`) | a third test for the busiest F8C state (chosen by instance count after authoring) against the sites-free base, 1.0 ms tripwire; trees off and trees on, fresh vite each, six interleaved loads per arm, median of GPU p95; differential `?siteOmit=` arms interleaved, drift reported | numbers in the handoff; a red stays red | ryzen shared: `hwlock -w 3600 ryzen-budget env E2E_BUDGET_RUN=1 ...`, the hangar-luminance agent may hold it; port 5175 only if free | `percentile`, `siteScenery()` |
| **C12 Docs** | `docs/campaign-data.md` (world keys, launch rule, the `credit()` hook), `MASTER_PLAN.md` F8 status, `docs/testing.md` Known gaps, README only if it names the sites | the handoff has changes, estimates, Tests updated / still valid / Known gaps, budget numbers both modes, all twelve mission-fit rows, deviations | docs about another system rot: point at the files, date the claims | - |
| **C13 Verify and close** | `REMOTE_RUN_OVERFLOW=0 remote-run npm run verify` on ryzen to a log, exit status read directly | green; branch pushed; handoff emailed once after the recipient check | a concurrent session on ryzen; check `origin/main..` before reporting | - |

**F3 section 5, as the F8C site files must say it** (`[side, serviceable, built]`; "serviceable" for a non-strip site means usable for its job):

| Site | pre-invasion | assault | buildup | endgame | j6-alternate |
| --- | --- | --- | --- | --- | --- |
| Ormoc | axis, yes, built (Japanese port/logistics hub) | axis, yes (reinforcement destination) | axis, yes (repeated convoy destination; accumulated port damage) | axis, yes (route under severe interdiction) | axis, yes (lifeline remains open) |
| Landing beaches | axis, no, built (Japanese shore defenses) | allied, yes (active assault and unloading) | allied, yes (dense beachhead, supply dumps) | allied, yes (established rear/support area) | allied, no (damaged, evacuating) |
| San Pedro Bay (Jinamoc) | not built (Japanese-controlled waters/shore) | allied, no (anchorage forming) | allied, yes (PBY anchorage, rescue launch, support) | allied, yes (support/transport area) | allied, no (abandoned/contested) |

**Mission-fit rows F8C fills:** A1 (deck, 12-15 mi east of the beaches), A2 (airborne, SE of the Samar engagement), A3 (airborne west of the ridge; recovery Tacloban in 6-7
min), A4 (afloat at Jinamoc, night), A5 (westbound over the ridge to Ormoc), J2 (airborne SE of the Gulf), J4 (west of Ormoc Bay, night). The recovery of A2 and A5
(carrier trap) is checked as a fixed point; the egress gates of J2 and J4 are F10's and are not checked, as J5's was not.

**Stop conditions:** a schema bump (`schemaVersion`), a change to `bankSortie`/`bankLeg` semantics beyond the one field, a change to the recorder format, or a decision only
Mark can make (e.g. an F3 contradiction) stops that task; the rest finishes and the handoff says so.
