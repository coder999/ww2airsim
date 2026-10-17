# F8 canonical Leyte campaign world: program plan (2026-10-16)

MASTER_PLAN Track F8 (plans 13-15 of the 22 in the
[F3 dependency table](../specs/2026-10-14-leyte-campaign-definition.md#11-dependency-checked-plan-count)).
**Status: plan only. Nothing is implemented. Do not start building until F5C has landed on `main`** (Mark, 2026-10-16:
F5C edits `loop.ts`, `outcome.ts`, `main.ts`, `recorder.ts`, and F8's state selection reads its shape).
Grilled with Mark 2026-10-16 (decisions below). F8A is task-level; F8B and F8C are outlined and get their own detail when reached.

## Header

- **Branch:** worktree `~/projects/ww2airsim-worktrees/f8a`, cut from `main` after F5C lands.
- **Run mode: fully unattended, final result only** (Mark, 2026-10-16). One attended exception: any **new** building model
  (see Finding 1; may be none) goes through the Hangar for his approval first, as F4 did. He will review once rendered.
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
   mostly **make the existing ten placeable**, not new Blender work. Proposed **new** models: none (F3 section 9 classes
   tents, sandbags, mats, drums, crates, mud, ruts, craters and construction states as procedural). If you want any, name
   them in review; each is an F3 amendment plus a Hangar gate and pauses F8A until approved.
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
| 10 | Final-result viewing only; fully unattended; plan proposes, Mark approves any new building list by email review. |

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

Each names its failing test first. All run after F5C is on `main`; re-read its world, leg and recovery changes before Task 6.

1. **Schema and loader.** Test: a malformed site file fails; every site has all five windows; window ids come from one list.
2. **Chapter-to-windows table.** Test: for each of the twelve chapters, the produced windows equal F3 sections 4 and 5; an unknown
   chapter throws; `world` after A1 has Tacloban and Dulag in `assault`.
3. **Ten building kinds placeable.** Extend the enum, load the existing glbs through `staticModels` (kind `building`), keep the
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
