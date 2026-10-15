# F5B headquarters, roster UI and progression screens: plan (2026-10-15)

MASTER_PLAN Track F5, second half (plan 8 of the 22 in the
[F3 dependency table](../specs/2026-10-14-leyte-campaign-definition.md#11-dependency-checked-plan-count)).
F5A (the pure campaign core, merged 2026-10-14) is the frozen input; this plan is every screen and the shell
wiring that makes it playable, and it deletes the resurrection-era roster. **Status: plan only. Nothing is implemented.**

## Header

- **Branch:** `plan-f5b-hq`, worktree `/home/mark/projects/ww2airsim-plan-f5b-hq`, cut from `main` at `d477d854`.
- **Merge order (Mark, 2026-10-15):** F5B merges **first**. F6B (night perception, sights) and F7A (bailout/rescue,
  branch `plan-f7a-bailout-rescue`) rebase onto it. See "Collision notes".
- **Run mode: attended.** Stop at each checkpoint below, send captures and the named host, and wait for Mark.
- **Viewing checkpoints (Mark, 2026-10-15): intermediate steps plus the final result.** Mark's viewing is a
  checkpoint, never a test gate (AGENTS.md). Named tasks:
  - **CP0, Task 1 (design lock, before any build):** the HQ mockups in
    [`docs/handoff/2026-10-15-f5b-hq-mockups/`](../../handoff/2026-10-15-f5b-hq-mockups/) (HQ first view in three
    variants, Personnel Files, the pilot archive, the mission-first picker). **Passed for the first view (Mark,
    2026-10-15): variant A (pilots table at left, Commander's dossier at right) is chosen and "looks great".** Variants B
    and C and the other mockups were not commented on and are treated as accepted (B is rejected as a first-view layout; C
    is the same layout A for a Japanese campaign). Mark's other reactions, if any, update "Decisions" before build.
  - **CP1, after Task 7:** new campaign (both nations), Personnel Files list, HQ first view and every secondary view,
    on fixture campaigns, in the live page.
  - **CP2, after Task 9:** mission-first picker, pilot assignment, the three following memo forms, Launch, and Dev mode inside the same
    UI (dev scenarios, God mode, test beds, the Dev campaign button), up to takeoff.
  - **CP3, after Task 10:** the whole loop in flight: land, debrief with tier promotion and bonus rows, no Continue,
    Return to Headquarters, Quit/Abandon from the pause screen, a death with replacement.
  - **CP4, final (Task 12):** everything together including export/import with Replace or Cancel on an id clash, the Japanese
    rank devices, and the archive with real losses.
- **Dev slots:** only `5174` or `5175`, and only when the coordinator says; otherwise headless. Before naming any
  windomlane host to Mark, assert it is up (`curl -sS -o /dev/null -w '%{http_code}\n' https://<host>/` prints `200`).
- **Heavy jobs:** vitest, `tsc`, eslint and `npm run verify` through `remote-run` on ryzen (AGENTS.md); E2E on a GPU
  per `docs/testing.md`. Never `pkill -f`; kill only PIDs this plan started. No `rm -rf`.
- **Delivery:** commit and push the branch. Do not merge, deploy or email (the coordinator mails the plan).
- **Size:** L (slightly smaller after the 2026-10-15 rulings: no `rekeyCampaign`, no second pilotless flow). About 12
  tasks, 2,800 to 3,500 new source lines (about 1,700 of them DOM), about 1,900 new test lines,
  and about 2,300 lines deleted (`roster.ts` 463, `roster.test.ts` 485, the roster half of `titleScreen.ts`, the
  banking half of `main.ts`). Two things make it larger than it reads: the E2E harness every spec starts through
  changes (14 spec files, 46 call sites), and `main.ts` is the file three other plans also edit.
- **Rulings:** Mark's rulings of 2026-10-15 are binding and recorded under "Decisions (Mark, 2026-10-15)". Nothing in
  this plan changes the frozen F5A schema or any `src/sim` contract (verified; see "Frozen-contract check").

## Goal

Ship, on top of the F5A core and **without changing it** (no frozen-module edit of any kind, Mark 2026-10-15):

1. a **Personnel Files** screen to open, create, import and delete campaigns, and a **new-campaign** form (player name
   plus a permanent American or Japanese choice);
2. a new **Air Group Headquarters** screen: first view is the five living pilots (rank, score, status) and the
   Commander's dossier (command rating, cumulative and adjusted score); everything else is behind buttons;
3. a **mission-first picker** built on `offers` and `lifeline`, then **pilot assignment**, then the existing memo forms
   as the launch steps (Flight Conditions, Aircraft Assignment, Ordnance Requisition);
4. the **Commander's dossier**, the **pilot dossier**, the **lost-pilot archive**, the **chapter and briefing** view,
   **non-campaign missions**, **Training Grounds and Single Missions** (inside the campaign's HQ, unscored), **Dev mode in
   that same UI**, and **export / import** with the D4 choice on an id clash reduced to **Replace or Cancel** (Mark);
5. the sortie lifecycle in `main.ts`: `launchSortie` at Launch, `bankSortie` **exactly once** per sortie, **no Continue**
   after a landing in campaign mode, a **Quit/Abandon** button that forfeits the whole sortie, tier-based promotion in
   the debrief, and a visible save-failure warning;
6. **Japanese rank devices** (original vector art) so the Japanese campaign stops showing USN insignia;
7. deletion of `src/render/roster.ts` and every consumer, with the test reconciliation AGENTS.md requires.

Out of scope, by ruling or by ownership: callsigns (a schema bump, MASTER_PLAN "Deferred"), mid-flight save, the Wall of
Fame, a storage quota warning (Mark: leave as is; a database comes later), chapter content and briefings (F10), canonical
world (F8), scenes (F9), night perception and sights (F6B), bailout (F7).

## Fixed inputs

- `GAMEPLAY.md` "Planned Leyte campaigns" (lines 152-344) owns the player rules; `docs/campaign-data.md` and the F5A
  plan's contract C1-C7 own the data; the F5A handoff's "Handed to F5B" is the inherited scope.
- Testing rules: `docs/testing.md` "Philosophy" (enroll, don't clone; a test can fail; behavior over constants;
  worktree closeout reconciliation).
- The Naval Communications style: `src/render/ui/naval-comms.css`, `ui/navalComms.ts`, and the memo helpers at
  `titleScreen.ts:435-488` (`memoPanel`, `letterhead`, `sectionTitle`, `inkButton`, `buttonRow`).

## Scoping findings

All paths relative to the repo root; line numbers verified 2026-10-15 against `d477d854`.

### S1. Screen inventory today

| Screen | Where | What it is |
| --- | --- | --- |
| Title overlay (six memo forms plus the administrative memo) | `src/render/titleScreen.ts`, 1,561 lines; the forms are `TITLE_FORMS` `:121-128`, built inside one `build()` closure | Form 1 roster `:610-670`; Form 2 flight type `:733-768`; Form 3 sortie orders `:770-807`; Form 4 flight conditions `:808-929`; Form 5 aircraft `:931-975`; Form 6 ordnance `:977-1016`; admin memo (Hangar, Sounds, About, Settings) `:1018-1072`; About popup `:1074-1140` |
| Pilot dossier popup | `src/render/dossier.ts`, 243 lines (`dossierModel` pure, `openDossier` DOM) | Header, service record, kills, badge rack, mission log; reads `PilotRecord` |
| Debrief dialog | `src/render/debrief.ts`, 701 lines | Pure model builders (`landingModel` `:202`, `debriefModel`, `destructionModel`) plus `createDebrief` `:434`; buttons Continue (landing only), Watch replay, Export flight record, Restart `:448`, Return to title `:468` |
| Pause dossier | `src/render/pauseScreen.ts`, 463 lines | Tabs; footer `Resume`, `Restart Mission` `:255`, `Abort Mission` `:256` (banks nothing today) |
| Rank and ribbon art | `src/render/insignia.ts`, 118 lines | `RIBBONS` per badge id; `INSIGNIA` keyed by USN abbreviation `:100`; `insigniaElement(rank)` `:114` |
| Settings, About, Hangar, Sounds | `settings.ts`, titleScreen admin memo | Unaffected except Difficulty (S5) |

The title is created first in `boot()` and `main.ts` holds the world while `title.up()` (`titleScreen.ts:24-46`). Tests of
the title are Node-environment: pure models asserted, DOM covered only by E2E. This plan keeps that split: **every new
screen is a pure model plus thin DOM**.

### S2. Every consumer of `roster.ts` (the deletion list)

`grep -rn "roster.js" src tests` (2026-10-15), excluding `src/campaign/roster.ts` which is a different file:

| Consumer | Line | Uses |
| --- | --- | --- |
| `src/render/main.ts` | `:48` | `bankSortie`, `loadRoster`, `saveRoster`, `LogOutcome`, `SortieFacts`. State at `:363-364` (`roster`, `currentPilotId`); launch closure `:813-832`; `sortieFacts` `:2193`; `bankMissionResult` `:2223-2243`; `showDebrief` `:2255`; pause snapshot `:2461-2470`; abort `:2486-2494`; three bank sites at `:3369-3445` (impact, destruction, landing) |
| `src/render/titleScreen.ts` | `:7` | `createPilot`, `loadRoster`, `saveRoster`, `startSortie`, `PilotRecord`, `PilotStatus`; `pilotButtonLabel` `:307`, `pilotStatusChip` `:321`, `selectedPilotLabel` `:332`, `sortiePilotLabel` `:337`, `isValidPilotName` `:347`; Form 1 `:595-670`, `advance` `:1192`, `makePilotRow` `:1226`, enlist form `:1303-1329`, resurrection in `start` `:1405-1429` |
| `src/render/dossier.ts` | `:2` | `RANK_LADDER` (`nextRankProgress` `:22-33`), `PilotRecord`, the old log shape |
| `src/render/debrief.ts` | `:11` | `RANK_LADDER` (promotion found by rank *name*, `:603`) |
| `tests/render/roster.test.ts` | 485 lines | everything; names the key 12 times |
| `tests/render/dossier.test.ts` | `:4` | `RANK_LADDER`, `applyMissionResult`, `createPilot`, `dischargePilot` |
| `tests/render/debrief.test.ts` | `:8`, `:245-282` | `applyMissionResultToRoster` in the "bank only kills since last bank" test |
| `tests/render/devSortie.test.ts` | `:2` | `bankSortie`, `createPilot` |
| `tests/render/insignia.test.ts` | `:3`, `:28-29` | `RANK_LADDER` |
| `tests/render/titleScreen.test.ts` | `:12` and `:198-274`, `:307-312` | `createPilot`, the roster-step block |

Not consumers (looked, left alone): `tests/render/hangar/roster.test.ts` and `tests/sim/world/shipRoster.test.ts` are about
ships; `src/render/hangar/*` "roster" is the ship library. The old key `ww2airsim.roster.v1` is named in `roster.ts:319`
and `storage.ts:20` (`LEGACY_ROSTER_KEY`, read by nothing).

E2E touching pilots or the old flow (searched `roster|New pilot|Enlist|Dossier|startGame`):
`tests/e2e/{harness,meta-game,meta-game-relaunch,dossier,sortie,friendly-fire,title,scenarioPicker,mission-ui,boot,settingsUi}.spec.ts`
directly, and 14 spec files through `startGame` (`tests/e2e/harness.ts:166-197`; 46 call sites). `startGame` is the
single choke point: it picks `button[aria-pressed]` or goes through "New pilot", then walks the six forms.

### S3. Pre-existing facts the plan depends on

1. **The F5A shell seam is a type contract only.** `src/campaign/` has no shell: nothing builds a `SortieReport` from a
   `World`, nothing turns `tagCredits` into `Counts`, nothing calls `listCampaigns`/`saveCampaign`. All of that is this plan.
2. **The catalog needs runtime scenario facts.** `buildCatalog(rows, factsOf)` (`src/campaign/catalog.ts:59`) needs each
   row's solar hour, aircraft nation and friendly formations. Today that is computed only in a test fixture
   (`tests/fixtures/catalog.ts:15`, `scenarioFacts`, reading `tools/content/load.js`). In the browser the facts must come
   from `loadScenarioFile` (`src/render/scenarioLoad.ts:28`, async) and the flyable specs' `side`. So the fixture's
   function must become one shared pure function used by both (enroll, don't clone).
3. **`success` is already computed, in a place that does not return it.** `missionOutcome(...).result === 'success'` is
   what makes a badge (`mission/debriefMission.ts:30-35`); `withMissionDebrief` returns only `badgeId`. A mission with no
   badge returns `'MISSION COMPLETE'`. The report's `success` must come from that verdict (and not from `badgeId !== null`).
4. **Counts: the debrief and the pause tally still read the old last-blow `killsByType`** (`main.ts:3374`, `:2467`,
   `debrief.ts:114-121`), while campaign credit is `AircraftCombat.tagCredits` (`src/sim/weapons/combat.ts:105`).
   F5B switches every reader to `tagCredits` (one scoring table for all play, ruling D14). It does **not** delete the sim
   field `killsByType`; see "Frozen-contract check".
5. **A landing today does not end the flight.** The landing debrief carries `continueLabel: 'Continue'`
   (`debrief.ts:228`); Continue re-arms the sim (the handler passed to `showDebrief`, `main.ts:3443-3448`) and `scoredThroughKillsByType` exists only to make a
   second landing bank a delta (`main.ts:366-377` (the state itself is `:374`)). In campaign mode both disappear; in an unscored sortie (Training, Single Missions, Dev) Continue may stay
   (nothing banks there).
6. **Restart is incompatible with bank-once.** `createDebrief(root, restartMission)` (`main.ts:2126`) and the pause
   screen's Restart (`pauseScreen.ts:255`) re-fly the same world. After a campaign sortie banks (or after a death closes the
   pilot) a restart would fly a closed pilot against a cleared `pending`. Campaign sorties get neither Restart; the
   unscored sorties keep both (nothing banks there).
7. **`loadCampaign` resolves an interrupted sortie in memory only** (`src/campaign/storage.ts:77`, "The stored record is
   never modified here"). If the shell does not save after loading a campaign that had `pending`, the abandonment is
   re-applied on every load and never persisted. The shell must `saveCampaign` the resolved record.
8. **`saveCampaign` has no revision check.** Two tabs on one campaign: the second tab's load resolves the first tab's live
   sortie as abandoned, and last write wins. A cheap shell guard: compare the stored index revision with the revision the
   tab last loaded or saved before writing; refuse and show a banner if storage is newer. No schema change.
9. **Import "keep both" is not possible without re-keying every id, so it is dropped (Mark, Q1).** Pilot ids must be
   `<campaignId>:p<serial>` (invariants `pilot-owned` and `pilot-serial`, `src/campaign/schema.ts:197-211`) and the pending
   sortie id `<campaignId>:s<serial>` (`pending-valid`), so a second copy under a new campaign id would need a new core
   function in the frozen `exchange.ts`. Mark ruled **no frozen-module change**: an id clash offers **Replace or Cancel**
   only (`importCampaign` already returns `{ conflict }` and "does not decide", `exchange.ts:53`).
10. **Difficulty is a global Setting, not a sortie choice.** `quality.difficulty()` (`main.ts:667`) bakes it into the world
    at launch; `SortieChoice` (`src/sim/sortie.ts`) has no difficulty field. Ruling D13 says per sortie, stored on
    `PendingSortie`. F5B reads the Setting at Launch and passes it to `launchSortie`; it adds no field to a `src/sim` type.
11. **Takeoff time is a free choice in Form 4** (`titleScreen.ts:832-866`, Morning, Midday, Dusk, plus Dev-only night at
    `:842-849`, whose comment says "a Dev tool until F5 gates them by rank"). Dusk is 18:30 or earlier in this table
    (`DEV_TAKEOFF_HOURS` `src/render/sky/sun.ts:61`), so a player cannot make a day mission night today. F5B must not let
    Form 4 turn an authored night chapter into noon, and F6A's Dev-only night stays Dev-only.
12. **Quick launch is pilotless and banks nothing** (`main.ts:680-709`, `:930`); it stays as is (a developer URL
    shortcut, not a player flow). It is also the precedent that an unscored sortie creates no `pending`.
13. **Only 11 pooled missions exist, one Japanese.** `SCENARIO_OPTIONS` (`titleScreen.ts:199-263`) pooled rows
    (`pool: 'noncampaign'`): water-quals, airfield-strike, convoy-strike, tank-buster, combat-air-patrol, scramble,
    single-combat, flattop-hunt, escort, surigao-strait (ten American) and field-patrol (the Japanese lifeline).
    Flattop Hunt and Escort derive `coordinated` (tier 5) and water-quals needs tier 2 (ruling D5), so a fresh American
    squadron has **seven** open missions and a Japanese one has **one**. No chapter descriptor exists until F10.
    The HQ must be honest about that (R4).
14. **Chapter titles are not content.** `chaptersOf(faction)` gives ids only. Titles, dates and labels exist only in
    `GAMEPLAY.md`'s table (`tests/fixtures/catalog.ts` parses it for tests). The HQ needs them to show "current chapter".

### S4. Seams other plans touch (measured on `plan-f7a-bailout-rescue`, `git diff main...origin/plan-f7a-bailout-rescue`)

F7A edits `roster.ts` (+4/-2: `LogOutcome` gains `rescued|captured`), `dossier.ts` (`OUTCOME_LABEL`), `debrief.ts`
(`RecoveryOutcome`, `RECOVERY_LABEL`, a `bailoutModel`, the stamp table), `main.ts` (+143 lines) and the recorder. F6B is not
started; its known needs are `abilities(tier)` at launch and a recorded launch input. Detail in "Collision notes".

## Design

House style for every new screen: a Naval Communications **memo sheet** (`.sheet`, `.letterhead` kicker/title/form number,
`.routing` header block, `.form-table`, `.ink-button`, `.stamp`, `.stamp-chip`), built from the helpers in `titleScreen.ts`
(which move to `src/render/ui/memo.ts` in Task 6 so the new screens share one copy). Every screen is a pure model plus DOM;
every pilot-supplied or player-supplied string reaches the DOM through `textContent` only (the `dossier.ts` rule). Units
are imperial in anything shown (`formatFeet`, `formatKnots`, miles). US spelling.

Where the screens live: a new directory **`src/render/hq/`** (`model.ts`, `select.ts`, `headquarters.ts`, `picker.ts`,
`archive.ts`, `dossier.ts`, `exchange.ts`, `chapters.ts`) and a shell glue module **`src/render/campaignSession.ts`**.
`titleScreen.ts` stays the host of the sortie forms and the administrative memo and changes **surgically** (Task 8).

### D1. Flow

```
boot (title art + loading strip)
  Personnel Files  --(open)-->  Air Group Headquarters  --(Choose a mission)-->
        |  \--(New campaign)     |   \--Chapter & briefing / Non-campaign missions / Pilot archive
        |  \--(Import)           |   \--Commander's dossier / pilot Dossier
        |  \--(Create dev campaign, Dev only)  \--Save, export, import / Training grounds & single missions / Switch campaign
        |                        v
        |              Sortie Orders (mission)  ->  Squadron Roster (pilot)  ->  Flight Conditions
        |                  ->  Aircraft Assignment  ->  Ordnance Requisition  ->  Launch
        |                                                                           |
        |                                         launchSortie (autosave)  -->  flight  -->  bankSortie once
        |                                                                           |
        +<---- Return to Headquarters <---- debrief (no Continue, no Restart) <-----+
Training Grounds, Single Missions and Dev test beds are rows in the same picker: same steps, unscored (no launchSortie, no pending).
```

### D2. Personnel Files (the first screen) and new campaign

- A memo "Personnel Files" listing `listCampaigns(port)` entries: player name, service (U.S. Navy / Imperial Japanese
  Navy), command title (from the stored `points`), `points`, revision. **No dates:** the frozen record carries no clock
  (C6), so "last played" would be a schema change (Q9). Buttons per row: **Open**, **Export**, **Delete** (two-step,
  typed confirmation, offers export first). Below: **New campaign**, **Import campaign**, and the **Dev**
  checkbox (session state, as today, `titleScreen.ts:1332-1360`). **A campaign is always required to play** (Mark, Q2): there
  is no campaign-free flight. While Dev is checked a **Create dev campaign** button appears: one click makes a U.S. campaign
  named "Dev" (a second button for a Japanese one) through the normal `createCampaign` and `saveCampaign`, no form. **This
  button is my assumption (cheap and safe: it is the same reducer path, a normal career that the player may delete); Mark
  can veto it.**
- A list that failed validation (`listCampaigns` `{ ok:false }`, or `loadCampaign` `{ ok:false, id, issues }`) is shown as
  a red damaged-file row naming the issues, with **Export raw** (the stored text) and **Leave alone**; it is never
  repaired or reset (C5).
- **New campaign** memo: typed field "Player name" (1 to 40 characters, `isValidPlayerName`), prefilled from
  `loadProfile().lastPlayerName`; two ballot rows "U.S. Navy" and "Imperial Japanese Navy" **with no default**; the line
  "This choice is permanent for this campaign. You can start a separate campaign for the other side." Confirm opens a
  second step: "Enlist as <name>, <service>? This cannot be changed." then `createCampaign({ id, faction, playerName,
  seed, now })` with `id` from `crypto.randomUUID()` and `seed` from `crypto.getRandomValues` (shell-injected, C1),
  `saveCampaign`, `saveProfile`, then HQ. A save failure stays on the form with the error.

### D3. Air Group Headquarters (the new screen; mockups in the handoff directory)

First view, in this order, in the memo style:

1. letterhead "Bureau of Aeronautics / Air Group Headquarters", form number `HQ-1`, a corner stamp;
2. a `.routing` block: Service, Commander (the player), Current chapter, Campaign file (revision);
3. **Squadron: five living pilots**: one row each, columns Pilot (rank device and name, `formatName(name, faction)`:
   family-first for Japanese), Rank, Points (with "n to next"), Sorties, **Cleared for** (DAY, NIGHT, ADV., SIGHTS, COORD.
   chips from `abilities(tier)`), Status. **Status is always ACTIVE for the five by invariant** (`live-active`); the
   "Cleared for" column is what actually varies, which is why it is there (Q8). A per-row **Dossier** button.
4. **Commander's dossier** panel: command rating (title plus a bar to the next title), cumulative score, adjusted score
   (one decimal, "per sortie"), sorties launched, campaign badges, pilots lost (K.I.A. / P.O.W. / discharged), abandoned,
   chapters complete. A **Full Dossier** button.
5. **Operations**: **Choose a mission** (primary), then **Chapter & briefing**, **Non-campaign missions**,
   **Pilot archive**, **Save / export / import**, **Training grounds & single missions**, **Switch campaign**. The button list is
   data (`HQ_DEPARTMENTS`) so F8 can add a "World" button and F9 an "Opening scene" without editing the layout.

**Layout: variant A (Mark, CP0, 2026-10-15)** is the first view: pilots table at left, Commander's dossier at right,
the Operations grid below. Variant C is the same layout for a Japanese campaign. The rejected variant B (a stat band
across the top, the pilots as the main table, no right column) stays in the mockups directory as
`hq-first-view-B-banner-us.*` for the record only. A persistent red **save-failure banner** sits above the letterhead whenever the last
`saveCampaign` failed, with an **Export now** button (Q6). A discharge never appears in the live five; it appears in the
archive and the debrief.

Secondary views (each a memo with **Back to headquarters**):

- **Chapter & briefing** (`HQ-2`): the twelve-row chapter table for the campaign's faction from `chapters.ts` (id, title,
  date and label, aircraft, minimum rank), with completed, current, locked state from `progress` and `attempts`; for the
  current chapter the cited briefing once F10 supplies a descriptor, and until then "Orders for this chapter are not yet
  issued in this build." It never invents a briefing (R4). `chapters.json` is checked against `GAMEPLAY.md`'s table by a
  parsed-table test (the F5A pattern), so it cannot drift.
- **Non-campaign missions** (`HQ-3`): the repeatable missions with their ribbons (faded until earned), the needed rank and
  how many of the five can fly each, and **Assign a pilot** into the same flow as Choose a mission, preselected.
- **Pilot archive** (`HQ-4`, mockup): `Object.values(pilots)` minus `roster.live`, newest first by `closure.at`, filter
  chips All / K.I.A. / P.O.W. / Discharged with counts, columns Pilot, Rank held (`tierOf(points)`), Points, Sorties, Fate
  chip, Lost on (mission label from `closure.missionId`), Date (`closure.at` date part), **Dossier**. Read-only. A new
  campaign shows "No pilots have left the squadron."
- **Commander's dossier** and **pilot dossier** (`HQ-5`, `HQ-6`): see D6.
- **Save, export, import** (`HQ-7`): see D8.

### D4. Mission-first picker (Squadron "Sortie Orders", step 1 of 5)

Mark ruled mission first, then pilot, then the existing forms. The picker **replaces Forms 1 to 3**
(Squadron Roster, Flight Type, Sortie Orders) with two steps built from them (Mark, Q3), so a sortie is: Headquarters,
picker (mission, then pilot), then Flight Conditions, Aircraft Assignment, Ordnance Requisition. Flight Type does not
survive as a form; its Missions / Training Grounds split becomes **section headers inside step 1** (Campaign, Non-campaign
missions, Training Grounds, Single Missions). The Training Grounds and Single Missions headers are also the targets of the
HQ department button, which opens the picker scrolled there:

| Step | Memo | Source |
| --- | --- | --- |
| 1 Mission | Sortie Orders | `offers(campaign, catalog)` plus the chapter table |
| 2 Pilot | Squadron Roster | the same `offers` row's `pilots[]` |
| 3 Conditions | Flight Conditions (Form 4) | unchanged, takeoff locked for authored night |
| 4 Aircraft | Aircraft Assignment (Form 5) | `aircraftFor` intersected with `eligibility(pilot, mission, aircraft, faction)` |
| 5 Ordnance | Ordnance Requisition (Form 6) | unchanged |

Step 1 lists, in sections, the **current chapter first** (tagged CAMPAIGN, shown only when F10 has supplied a descriptor), then the open
non-campaign missions with their ribbons, then the Training Grounds (ranges and the three qualifications) and the Single
Missions (**with Dev checked, also the dev-only fixtures and test beds**). A mission no live pilot can fly (Flattop Hunt, Escort for a fresh squadron) is
**shown dimmed with the rank it wants and "No pilot of the five can fly this yet"**, not hidden, so rank gates read as goals.
A completed chapter is not listed (`missionLock` `completed`, D11); a locked later chapter is not listed (the chapter view
shows it). The right column shows the briefing (`renderBriefing`, `briefingRequest`, `badgeName`) from the existing
machinery, with the selected pilot's ribbons filled in once a pilot exists.

Step 2 lists the five pilots from `offers`'s `pilots[]`: **Assign** enabled for `eligible`, dimmed with the reason and
exact tier gap otherwise ("NEEDS LTJG", "NEEDS LTJG (1,260 more points)", computed from `PILOT_TIER_POINTS`). **No pilot is
preselected** (Q5). If `lifeline(c, catalog)` is non-null a quiet line says so; the no-deadlock proof is surfaced by a test
(Task 4), not by chrome. Step 4 shows aircraft the pilot cannot fly dimmed with the rank needed, never silently removed (Q7).

**Takeoff lock.** For a descriptor with `night: true`, Form 4 offers only the authored hour (one row, labeled with it).
Daytime missions keep Morning, Midday, Dusk. Dev-only night stays behind the Dev checkbox, in this same Form 4. A synthetic night descriptor tests this, since no night chapter ships before F10.

**Unscored rows (Training Grounds, Single Missions, dev fixtures) go through the same steps.** Step 2 still asks for a
pilot (so the production selectors are mimicked), but eligibility is shown and **not enforced**, and nothing is banked.
**This is my assumption** (the ruling says Training and Single Missions live inside the HQ and Dev uses the same UI; it does
not say whether they ask for a pilot). Alternative: skip step 2 for unscored rows.

**The Dev rule inside a campaign (Task 2, pure `unscoredReason(...)`).** A sortie is **scored** (calls `launchSortie`, banks
once) only if it is a campaign or non-campaign row *and* no Dev override is in effect. It is **unscored** (no `launchSortie`,
no `pending`, no bank, the debrief stamped "not recorded" as `DEV_SORTIE_STAMP` does today) if the row is Training or
Single, or if Dev was needed to get past a gate: a dev scenario, an aircraft or loadout `sortieIsDev` flags
(`devRecord.ts:11`), an ineligible pilot assigned, a Dev takeoff time, or God mode. The **Dev checkbox unlocks, inside the
same HQ and picker:** dev scenarios and test beds, God mode, ineligible pilots and aircraft, Dev takeoff times, the Sounds
button, flight-record export and the Create dev campaign button. Unchecked, none of it is visible.

**Launch** (the one place a scored sortie starts): `launchSortie(c, { pilotId, mission, aircraft, difficulty, loadout, facts, now })`
with `difficulty` mapped from the Setting (`easy`/`normal`/`hard` are the same ids as `Difficulty`), then `saveCampaign`
(autosave, so a closed tab leaves a `pending` the next load abandons, D7), then `onNewGame(choice, launchContext)`. A
rejected `launchSortie` shows its `error.message` on the form and does not launch.

### D5. Quit/Abandon, and what ends a sortie

- **The pause screen's `Abort Mission` becomes `Abandon sortie`** in campaign sorties, with the confirmation text
  "Abandon this sortie? You score nothing for it, it still counts against your adjusted score, and the pilot returns
  unharmed." Confirm calls `session.bank('abandoned')` once and returns to Headquarters (`bankSortie` with `end:
  'abandoned'`, zero counts: pilot survives, denominator already ticked at launch). **`Restart Mission` is not offered** in a
  scored sortie (S3.6). Both stay in unscored sorties (their `Abort` just returns to Headquarters, banking nothing).
- **The three existing end paths** (impact `main.ts:3369`, destruction `:3392`, landing `:3413`) each call
  `session.bank(end)` once. Landing: no Continue, the debrief's only buttons are Watch replay, Export flight record (dev),
  and **Return to Headquarters**. The session refuses a second bank (`bankSortie` already rejects `no-pending`; the session
  also latches per `sortieId`, and a test proves a double call banks nothing twice).
- **A tab closed mid-sortie** is an abandonment at next load (D7), saved (S3.7).
- Unscored sorties (Training, Single Missions, Dev overrides) create no `pending` and call neither reducer (the old
  `devUnrecorded` rule, now decided once by `unscoredReason`).

### D6. Debrief changes (surgical, `debrief.ts`)

- `missionScore` takes `Counts` from `tagCredits`, not `killsByType`; the table keeps its 13 rows.
- Promotion is by **tier**: `promotedTo` becomes a `{ faction, fromTier, toTier }`-derived label from `rankLabel`, and the
  stamp's device is `rankDevice(faction, tier)` (D9), not `RANK_LADDER.find` (`debrief.ts:603`).
- New campaign rows, in the existing `figureRow` style: a **Score breakdown** (destruction, difficulty bonus, completion
  bonus, and, for the human, roster bonus) taken from the banked `LogEntry.bonuses`; **Pilot** and **Commander** totals; any
  **closure notice** (a pilot lost with the replacement's name; "Dishonorably discharged" with the existing stamp; "P.O.W."
  and "Rescued" once F7 produces them); the **forfeit** line for abandonment.
- Buttons: scored sortie shows **Return to Headquarters** (replaces `Return to title`; an unscored one also returns there) and no Restart, no Continue; the
  unscored sorties are unchanged. `DebriefModel.continueLabel` stays for unscored sorties; campaign mode simply does not
  set it (the existing "present only when the flight can go on" contract).
- `discharge.ts` is not touched (R9 of the F5A plan): the discharge overlay still sets `model.discharge`, and the shell
  maps it to the report's `friendlyDestroyed` from the existing `friendlyDestroyedBy` (`src/render/discharge.ts`), as the
  F5A docs describe.

### D7. Dossiers

- **Pilot dossier** (rewrite of `dossier.ts` over the campaign `Pilot`): header with rank device, status chip, points and
  a progress bar to the **next tier** (`PILOT_TIER_POINTS`), the service record (flight hours, sorties, banked, landings
  trap/field/ditched/water, rescues, highest altitude and fastest speed in feet and knots), kills by type from `counts`
  (13 classes), badge rack, closure block for an archived pilot (fate, mission, date), mission log newest first from
  `LogEntry` (date, mission label, aircraft, outcome from `end` with six labels, points, kills, time, peaks). Same
  keyboard contract (Escape closes, Tab trapped, `inert` siblings) as today's `openDossier`, reused, not rewritten.
- **Commander's dossier**: header with command title and bar, cumulative and adjusted score, sorties launched, badges,
  losses, rescues, abandoned, warnings, chapters and victory, roster strength (the bonus the live five would earn now,
  `rosterBonusOf`, labeled "Roster bonus on a successful sortie"), and the human log (500 cap) with the same columns.

### D8. Save, export, import (and delete)

- **Export:** `exportCampaign(c)` as a Blob download named by `exportFileName(c, date)` (date injected by the shell).
- **Import:** a file input; `importCampaign(text, existingRevisions)`. On `{ ok:false, issues }` a list of every issue
  (including the pre-campaign-roster message). On `{ ok:true, conflict:null }` the career is added and saved. On
  `{ conflict }` an explicit **Replace** / **Cancel** memo that states both revisions and both point totals: Replace
  overwrites the stored career with the incoming one (after offering Export of the current one first); Cancel leaves storage
  untouched. **There is no Keep both** (Mark, decision 1; see S3.9).
- **Delete:** `deleteCampaign`, two-step.
- **Storage failures:** every `saveCampaign` result is surfaced (the D3 banner). **No quota or size warning UI** (Mark).
  The 4 MB capped worst case and the single-origin ceiling are recorded in R6, not shown.
- The old `ww2airsim.roster.v1` key is **removed once at boot** (Q10) and never read.

### D9. Japanese insignia (original art, labeled estimates)

`insigniaElement(rank)` is keyed by USN abbreviation (`insignia.ts:100-116`); Japanese ranks have no abbreviation
(`rankLabel('ja', t)` returns `{ name }` only). New API `rankDevice(faction, tier, heightPx)`; the USN devices are reused
verbatim for `us` (tier to abbreviation) and a new set of six original IJN-style devices for `ja`.

- **Basis:** the Imperial Japanese Navy marked officer grade on **dark-blue shoulder boards and sleeve lace with gold
  stripes and gold cherry-blossom (sakura) stars**, grade band by stripes and step within the band by blossoms. The
  mockup (variant C) shows the proposed set: a dark board with **one** gold stripe and one to three blossoms for Shōi,
  Chūi, Taii, and **two** stripes and one to three blossoms for Shōsa, Chūsa, Taisa.
- **Honest label:** the *pattern* (stripes by band, blossoms by step) is a legible simplification drawn by the author from
  general knowledge of the IJN scheme; **the exact stripe and blossom counts per rank are an estimate, not copied from a
  source chart, and are labeled as such** in `ASSETS.md` and in a code comment. Task 5 includes a source check against the
  published IJN officer rank tables (for example the Wikipedia article "Ranks and insignia of the Imperial Japanese Navy"
  and its cited primary sources) and a one-line outcome ("matches" or the exact corrections) in `ASSETS.md`; the art is
  original SVG either way, never traced from a photograph or a copyrighted drawing.
- **Test:** twelve distinct devices (2 factions x 6 tiers), an exhaustive enrollment that fails on an empty list and on a
  duplicate, the faction of the campaign selecting the set, and the old `INSIGNIA` USN table untouched.

### D10. Where Training, Single Missions and Dev live (Mark, Q2 as changed)

**Inside a campaign's Headquarters, in the same UI.** There is no "no-pilot flights" button and no second flow: Training
Grounds and Single Missions are picker sections (D4) reached from the HQ department button, and the **Dev checkbox unlocks
dev-only features inside that same UI** (dev scenarios, God mode, test beds, flight-record export, ineligible pilots and
aircraft, Dev takeoff times, Sounds), so Mark can test and mimic the future production selectors. A campaign is still
required; the **Create dev campaign** convenience (D2, my assumption) makes that one click. **"Single Missions"** (my assumption A3) is the picker section listing the pooled missions flown unscored with no rank gates, plus the dev fixtures under Dev. Unscored sorties never touch `Campaign` state. Consequence for E2E: every
spec starts through a campaign (Task 9).

## Tasks

Each task lands with its tests; `npm run verify` stays green at every commit (the new screens are built beside the old
title and switched over in Task 10; deletion is Task 11). Heavy runs through `remote-run`.

1. **Design lock (CP0).** Mark reviews the mockups. **First view: variant A chosen** (recorded in "Decisions", CP0 row). Any
   further reaction from Mark to the other mockups (status vs cleared-for, Japanese device set, department list, archive,
   Personnel Files, picker) is recorded in "Decisions" before build. *No code.* **Stop and
   wait.**
2. **The Dev rule and the Dev campaign (pure, no frozen-module change).** `unscoredReason(row, pilotEligibility, dev, god,
   takeoff, aircraft, loadout)` in `src/render/campaignSession.ts` returns `null` (scored) or the reason the sortie is not
   recorded; `createDevCampaign(faction, now)` over `createCampaign`. *Tests (red first):* a table over (row pool x Dev x
   override) pinning scored vs unscored, enrolled over `SCENARIO_OPTIONS` so a new row is covered (pinned list, so an empty
   filter fails); a scored row with Dev checked but no override stays scored; each single override flips it; Training and
   Single are always unscored; a dev campaign validates and is deterministic for equal inputs. Mutation: dropping the
   ineligible-pilot case turns the table red.
3. **Shell glue, pure (`src/render/campaignSession.ts`, `campaignStore.ts`).** (a) `factsFromScenario(scenario, specSide)`
   as the single function the shell and `tests/fixtures/catalog.ts` both use; `buildShellCatalog(options, loadScenario)`
   async, cached. (b) `buildReport(...)`: `SortieReport` from the world at an end (`counts` from `tagCredits`,
   `friendlyDestroyed`, `warnings`, `success` from the mission verdict (S3.3), `authoredBonus` from the descriptor, `flight`
   from the segment, `badgeId`), and `SORTIE_END_OF: Record<RecoveryOutcome, SortieEndKind>` (exhaustive, so F7A's two new
   `RecoveryOutcome` members fail the compiler until mapped). (c) `createSession(port, now)`: open campaign in memory,
   write-through `saveCampaign` after every reducer, **bank-once latch** per `sortieId`, `launch`, `bank(end, ...)`,
   `abandon()`, `resolveInterruptedAndSave` on open (S3.7), the **stale-revision guard** (S3.8), the legacy-key purge, the
   `SaveResult` surfaced for the banner. (d) `CampaignLaunch = { pilotId, tier, facts }`, the object `onNewGame` receives
   instead of `pilotId: string | null` (the F6B/F7 seam). *Tests:* a Map-backed port; a throwing port (quota) surfaces and
   does not corrupt; double `bank` banks once and returns the rejection; abandon banks zero, denominator ticked once; a
   crash-then-load leaves one abandoned sortie and a saved record (not re-applied on the next load); the stale-revision
   guard refuses an older writer; `buildReport` for each of six ends against hand-built worlds; the catalog built from the
   real scenario files equals the fixture catalog for every pooled row (enrolled, pinned list) and **a mutation (dropping
   Field Patrol's facts) turns the Japanese lifeline test red**.
4. **HQ pure models (`src/render/hq/model.ts`).** `hqModel`, `pickerModel` (rows from `offers`, dimming, gap text),
   `archiveModel`, `commanderDossierModel`, `pilotDossierModel`, `importConflictModel`, `chaptersModel`. *Tests:* over
   `makeCampaign` for both factions across tiers; imperial units; family-first Japanese names; "n to next" arithmetic;
   adjusted score one decimal and 0 when no sorties; archive order and filter counts; archive empty state. **The UI half of
   the no-deadlock proof** (F5A's handoff: "it does not prove a UI can show the lifeline; that is F5B's headquarters
   test"): enumerate the same 3,528 states (`2 x 7 x 252`) and assert that `pickerModel` has at least one row with an
   assignable pilot and that the **assign action is enabled for it**; mutation: removing the entry-rank mission from the
   catalog turns it red with the state named. Cost: about 5 s on nexus per F5A's measurement.
5. **Rank devices (`src/render/insignia.ts`).** `rankDevice(faction, tier, h)`; the six IJN-style devices (D9); `ASSETS.md`
   entry with the basis, the estimate label and the source-check result; `RANK_LADDER`-free. *Tests:* the 12-device
   enrollment; the USN set unchanged byte-for-byte (pinned by the existing `INSIGNIA` table); the faction selects the set;
   the debrief and dossier both call `rankDevice`.
6. **Personnel Files and new-campaign screens (DOM).** Move `memoPanel`, `letterhead`, `sectionTitle`, `inkButton`,
   `buttonRow` from `titleScreen.ts:435-488` into `src/render/ui/memo.ts` (re-exported from `titleScreen.ts` so no import
   outside this plan changes); `hq/select.ts`. Boot lock: every campaign control disabled until `boot.ready` (the existing
   `lockable()` rule, `titleScreen.ts:1487`). Persistent sheet language, focus order, Enter handling as the title does.
   *Tests:* the model half is Task 4; E2E `hq.spec.ts` (new): create an American and a Japanese campaign, reload, both
   listed, the right one opens; empty name refused inline; no nation preselected; typed delete confirmation.
7. **Headquarters screen and secondary views (DOM) (CP1).** `hq/headquarters.ts`, `archive.ts`, `chapters.ts`, `dossier.ts`
   (the pilot and Commander dossiers over the existing `openDossier` panel mechanics), `exchange.ts` UI (export download,
   import file input, conflict memo, damaged-file row). *Tests:* E2E: first view shows five pilots and the dossier; Dossier
   opens and closes with Escape; the archive shows a fixture loss; export then import of the same career shows the Replace or Cancel memo, Cancel leaves storage byte-identical and Replace
   overwrites; import of a bare roster array shows the rejection message; save failure banner appears when the page's
   storage is forced to throw. **Stop at CP1 and wait.**
8. **Mission-first picker, pilot assignment, launch (titleScreen.ts, surgical).** Form 1 (roster) code and the enlist form
   are deleted; Forms 2 and 3 are replaced by `hq/picker.ts` steps 1
   and 2 (one mode only, no 'practice' branch), Form 5's list is intersected with eligibility, Form 4 locks the authored night hour, and Launch runs D4's
   sequence. Training, Single and Dev rows go through the same steps via `unscoredReason`. `TITLE_FORMS` keys and numbering change
   (campaign steps are "Step n of 5"). *Tests:* pure `pickerModel` and aircraft-eligibility intersection (Task 4 style, new
   cases: an advanced aircraft for a tier 2 pilot is dimmed with "needs LT"); the takeoff lock with a synthetic night
   descriptor; E2E: Choose a mission, pick an open mission, an ineligible pilot's Assign is disabled, an eligible pilot
   assigns, Launch reaches a flying world, `__ww2`'s campaign diagnostic (below) shows the pending sortie.
9. **Dev mode inside the same UI, and the E2E harness (CP2).** Training Grounds, Single Missions and the dev rows as picker
   sections; the Dev checkbox on Personnel Files and HQ unlocking the list in D4; the **Create dev campaign** button.
   Rewrite `startGame` (`tests/e2e/harness.ts:166`) to: click **Create dev campaign** (Dev checked), open it, Choose a
   mission, pick the row by its label, assign the first pilot, walk Conditions, Aircraft, Ordnance, Launch. Same signature
   (`scenario`, `aircraft`, `loadout`, `dev`, `cloudiness`), so the ~10 specs that only need a world are unchanged; add
   `startCampaignGame(page, { faction, scenario, pilot })` for the scoring specs. Add a read-only `__ww2.campaign()`
   diagnostic (id, revision, pending, live roster summary) so E2E asserts state rather than pixels (testing.md rule 4).
   *Tests:* the harness-only specs pass unmodified; `title.spec.ts` rewritten for the new first screens. **Stop at CP2
   and wait.**
10. **`main.ts` rewrite and the debrief (CP3).** Replace `roster`/`currentPilotId`/`bankMissionResult`/`sortieFacts`
    (`main.ts:363-364`, `:813-832`, `:2193-2243`) with the session from Task 3; the three bank sites call
    `session.bank(end, model, ...)` once; delete `scoredThroughKillsByType` and `segment` baseline use for campaign sorties
    (keep for the unscored Continue); the debrief gets D6's changes; the pause screen gets `Abandon sortie` and loses
    Restart in campaign sorties; `returnToTitle` returns to Headquarters (`title.show(...)` with the open campaign);
    `onNewGame` takes `CampaignLaunch | null`; Analytics `track` calls kept (the privacy line stays true: campaigns are local).
    *Tests:* `debrief.test.ts` reconciled (see table) plus new model tests for the breakdown rows and the tier promotion
    stamp; `pauseScreen` model test for the two confirmations and the absent Restart; E2E: land and bank once (the campaign
    diagnostic shows `pending: null`, one more log entry, points up), a death archives the pilot and the replacement is
    named, `friendly-fire.spec.ts` discharges into the archive, Quit/Abandon forfeits (points unchanged, `abandoned` +1,
    sorties +1), a second debrief cannot bank a second time. **Stop at CP3 and wait.**
11. **Delete the roster and reconcile the suite.** Delete `src/render/roster.ts`, `tests/render/roster.test.ts`, and the
    roster-era assertions per the reconciliation table; remove `LEGACY_ROSTER_KEY`'s only comment dependence; update every
    E2E spec in the table; `grep -rn "roster.js\|loadRoster\|ww2airsim.roster" src tests` returns only the purge and its
    test. Run focused tests, then the whole suite.
12. **Docs and closeout (CP4).** Replace `GAMEPLAY.md`'s stale shipped sections (Roster, Persistence, Scoring, Mission
    selector, lines 60-150) with the shipped behavior and move the F5 parts of "Planned Leyte campaigns" out of "(not yet
    shipped)"; add a shell section to `docs/campaign-data.md` (session, store, the F6/F7 seam, the Dev rule);
    `MASTER_PLAN.md` F5 status line; `ASSETS.md`; the handoff `docs/handoff/2026-10-15-f5b-headquarters.md` with
    `Tests updated`, `Tests still valid`, `Known gaps`; `npm run verify` via `REMOTE_RUN_OVERFLOW=0 remote-run`, gated on
    its exit status (not a grep'd pipeline); merge `main`, rerun the affected gates, commit, push. **Final checkpoint: stop
    and wait.**

## Tests

Philosophy applied (`docs/testing.md`): behavior against an outside truth first (the F5A reducers and the GAMEPLAY.md
tables), then invariants (bank once, never reset a damaged file, ids), then seams other plans touch (`CampaignLaunch`,
`SORTIE_END_OF`, `HQ_DEPARTMENTS`), then wiring (E2E reading `__ww2.campaign()`, never pictures).

**Enrollment (no clones):** insignia 2 factions x 6 tiers; the shell catalog against the fixture catalog for every pooled
row; the chapter table against `GAMEPLAY.md` (parsed, 12 rows asserted so an empty parse fails); the no-deadlock UI proof
over the same 3,528 states F5A enumerated; `SORTIE_END_OF` over every `RecoveryOutcome`.

**E2E (new or rewritten):** `hq.spec.ts` (create both factions, first view, archive, dossiers, department buttons),
`campaignSortie.spec.ts` (launch, land and bank once, death and replacement, abandon, discharge, no Continue, no Restart),
`campaignExchange.spec.ts` (export, import, Replace, Cancel, rejected roster array, save-failure banner),
`devMode.spec.ts` (an unscored Training or Dev sortie banks nothing: `__ww2.campaign()` unchanged; Dev unchecked hides every dev feature; the Create dev campaign button; quick launch unchanged). They need a GPU: run per `docs/testing.md`
(nexus's local GPU is acceptable for correctness; ryzen for the budget-adjacent specs, none here). The two friendly-fire
specs' 120-sample frame check is a known ryzen-only red from F5A and stays so; this plan neither hides nor fixes it.

**Mutation checks (a test must be able to fail):** drop the ineligible-pilot case in `unscoredReason`; drop Field Patrol's
facts; remove the entry-rank mission from the catalog; make the session bank twice; skip `saveCampaign` after resolving an
interrupted sortie. Each must turn a named test red before the green is trusted.

### Reconciliation table (what the diff touches and what happens to each assertion)

| Test | Contract changed | Action |
| --- | --- | --- |
| `tests/render/roster.test.ts` (485 lines) | the whole file is the old roster | **Delete** (replaced by `tests/campaign/*` and Task 3's store tests) |
| `tests/render/dossier.test.ts` | pilot shape, `nextRankProgress`, log labels | **Rewrite** for campaign `Pilot`/`Human`; keep the `formatHours/Feet/Knots` cases |
| `tests/render/debrief.test.ts:245-282` | segment-bank over `killsSince` | **Replace** with a `Counts`-from-`tagCredits` test; `:241-243` Continue cases **remain valid** for unscored sorties; **add** campaign model (no `continueLabel`), breakdown rows, tier promotion |
| `tests/render/devSortie.test.ts` | `bankSortie(roster, ...)` | **Replace** with: an unscored (Dev, Training, Single) sortie never reaches `launchSortie`, via `unscoredReason`; `sortieIsDev` cases **remain valid** |
| `tests/render/insignia.test.ts:28-29` | `RANK_LADDER` | **Rewrite** to the 2 x 6 enrollment; the ribbon enrollment (`RIBBONS`) **remains valid** |
| `tests/render/titleScreen.test.ts:198-274, 307-312, 335-357` | roster step, pilot labels, six-form numbering, dossier lifecycle | **Delete** the pilot-label tests; **update** `TITLE_FORMS` pins; **keep** the Settings, About, Hangar, loadout and scenario-picker blocks; **rewrite** the Dossier lifecycle block for the HQ dossier host |
| `tests/render/discharge.test.ts`, `combatReadout.test.ts` | none | **Still valid** (not touched) |
| `tests/render/bootQuality.test.ts` | none | **Still valid** (the `settings` argument pin) |
| `tests/architecture/boundary.test.ts` | none | **Still valid**; confirm `src/render/hq` does not import `src/sim` internals beyond types |
| `tests/e2e/harness.ts` (`startGame`, `openOrdersFor`, `launchFromOrders`) | first screens | **Update**: starts through a dev campaign and the picker; new `startCampaignGame` |
| `tests/e2e/meta-game.spec.ts`, `meta-game-relaunch.spec.ts` | pilot score and relaunch | **Rewrite** onto campaign helpers; relaunch asserts a second banked sortie |
| `tests/e2e/dossier.spec.ts` | pilot dossier after a landing | **Rewrite** (HQ dossier) |
| `tests/e2e/sortie.spec.ts:166` (AD-2 resurrection) | resurrection no longer exists | **Delete** the resurrection test; **keep** the form-capture, Dev-Zero, Wildcat, quick-launch and "unchecking Dev" tests through the dev campaign and picker |
| `tests/e2e/friendly-fire.spec.ts` | "DISCHARGED on the roster and Dossier" | **Update** to the archive; KILLED, forfeit and K.I.A. assertions **unchanged** |
| `tests/e2e/title.spec.ts`, `scenarioPicker.spec.ts`, `mission-ui.spec.ts`, `boot.spec.ts` | "New pilot", the Form 1 flow | **Update** to Personnel Files; the picker's scenario-entity assertions **remain valid** (note: `scenarioPicker.spec.ts:148` and `meta-game.spec.ts:39` already fail on current `main` on `gunnery-range`'s entity list, F5A handoff; unrelated, left alone) |
| `tests/e2e/settingsUi.spec.ts:451` ("roster screen composites ...") | the roster screen | **Rewrite** for the HQ sheet (same compositing and stamp assertions) |
| the other `startGame` specs (`launchFlow`, `missions`, `nightTakeoff`, ...) | none beyond the harness | **Still valid** via the new default path |

## Decisions (Mark, 2026-10-15)

Binding rulings given with this assignment. Nothing below is open.

| # | Ruling |
| --- | --- |
| M1 | **Order:** F5B merges first; F6B and F7A rebase onto it. Keep `main.ts`, `debrief.ts` and `titleScreen.ts` changes surgical where possible and name the seams F6B and F7A need. |
| M2 | **Viewing:** intermediate steps plus the final result; attended (stop at checkpoints and wait). Checkpoint tasks are named in the header. Dev slots only 5174 or 5175, only when the coordinator says. |
| M3 | **Headquarters is a new screen, designed with Mark before any build,** in the existing typed Bureau-of-Aeronautics memo style. First view: the five living pilots (rank, score, status) and the human-player dossier (command rating, cumulative and adjusted score). Everything else (current chapter and briefing, lost-pilot archive of K.I.A./P.O.W./discharged, non-campaign missions, save/export/import) is behind buttons or secondary views. |
| M4 | **Mission first, then pilot assignment.** The existing six memo forms become the sortie-launch steps after the mission and pilot are chosen. |
| M5 | **Landing ends the sortie in campaign mode (no Continue). Quit/Abandon forfeits the whole sortie** (zero points, denominator +1, pilot survives). `bankSortie` is called exactly once per sortie. |
| M6 | **Existing roster pilots are deleted, no migration.** Delete `roster.ts` and its consumers and tests per the F5A handoff; never read `ww2airsim.roster.v1` as a campaign. |
| M7 | **Name lists are approved.** |
| M8 | **Save size: leave as is** (no quota warning UI); Mark expects a database later. |
| M9 | **Import policy D4 UI (revised 2026-10-15, Q1):** on an id clash **Replace or Cancel only**; no Keep both, no `rekeyCampaign`, **no change to any frozen F5A module**. |
| M10 | **Japanese insignia:** original vector art for IJN-style rank devices; cite what they are based on and label estimates. |
| M11 | **Ambiguities were batched; Mark ruled on all fifteen (2026-10-15):** see "Rulings on the ambiguity batch". Anything that would change the frozen F5A schema (a version bump) or a `src/sim` contract is stopped on and listed (next section). |

### Rulings on the ambiguity batch (Mark, 2026-10-15)

| Q | Ruling |
| --- | --- |
| 1 | **No `rekeyCampaign`; no frozen-module change.** An import id clash offers **Replace or Cancel** only. "Keep both", its UI and its tests are dropped. |
| 2 | **Changed.** No pilotless "no-pilot flights" button. **Training Grounds and Single Missions live inside a campaign's HQ.** **Dev uses the same UI** (HQ, picker, memos): the Dev checkbox unlocks dev-only features inside it (dev scenarios, God mode, test beds, flight-record export, etc.) so Mark can test and mimic the future production selectors. A campaign is still required; a **one-click "Create dev campaign"** is added if cheap and safe (my assumption, below). |
| 3 | **Fold** Roster, Flight Type and Sortie Orders into the mission-first picker. A campaign sortie is: HQ, picker (mission then pilot), then Flight Conditions, Aircraft, Ordnance. |
| 4 | Difficulty is read from Settings at Launch and recorded per sortie; no `src/sim` change. |
| 5 | No pilot preselected. |
| 6 | A failed save shows a red banner with **Export now**; no proactive quota UI. |
| 7 | An aircraft the assigned pilot is not eligible for is shown dimmed with the rank needed. |
| 8 | Keep the "Cleared for" column beside Status. |
| 9 | No dates on the Personnel Files list (no schema change). |
| 10 | Remove the old `ww2airsim.roster.v1` key once at boot. |
| 11 | Leave `killsByType` in the sim, unread. |
| 12 | Lock takeoff only for authored night missions. |
| 13 | Always show the Personnel Files list first. |
| 14 | Ship the HQ honestly before F10 supplies chapters. |
| 15 | Ship the labeled Japanese insignia estimate (source-checked in Task 5). |
| CP0 | **HQ first view: variant A chosen** (2026-10-15, "looks great"). Other mockups unremarked, treated as accepted. |

### My assumptions (not rulings; Mark may veto)

- **A1. "Create dev campaign"** appears on Personnel Files only while Dev is checked: a U.S. campaign named "Dev" (and a
  Japanese one) via the normal `createCampaign` and `saveCampaign`, deletable like any other. It is also what the E2E
  harness uses.
- **A2. Unscored rows still ask for a pilot** in the picker's step 2 (to mimic production selectors), with eligibility shown
  but not enforced and nothing banked. Alternative: skip step 2 for them.
- **A3. "Single Missions"** is a picker section listing the pooled missions flown **unscored, with no rank gates**, plus
  (Dev only) the dev fixtures; the same mission is scored when launched from "Non-campaign missions".
- **A4. A sortie is unscored when Dev was needed to get past a gate** (dev scenario, flagged aircraft or loadout, an
  ineligible pilot, Dev takeoff time, God mode), by the single pure `unscoredReason` (Task 2).

## Frozen-contract check (read this first)

**No schema version bump and no `src/sim` contract change is required by this plan.** Verified against the code on
2026-10-15 by walking every screen's data needs against `schema.ts`: the five pilots, archive (`closure`), human dossier
(`ledger`, `stats`, `progress`), badges, adjusted score, chapter state, export/import and abandonment are all derivable
from the frozen shapes. Items that **would** need a bump, a frozen-module edit or a sim change, none of which this plan does:

1. **Keep-both import** would need a new function in the frozen `exchange.ts` (S3.9). **Dropped by ruling (Q1):** this
   plan edits no frozen F5A module and adds no core export.
2. **Retiring the sim field `AircraftCombat.killsByType`** (the F5A docs say "until F5B retires it"). That is a `src/sim`
   world change: it alters `World` and therefore every `.ww2flight` checksum, and F5A's own R3 already spent that
   allowance once. **Not done.** F5B stops *reading* it (S3.4). Retire it in a later sim plan if wanted (Q11).
3. **A "last played" or "created" date on a campaign** would be a new field on the frozen `Campaign` (a version bump, a
   migration, a note to F6-F10). **Not done** (Q9).
4. **Callsigns** are a bump (MASTER_PLAN "Deferred"). Not done.
5. **A per-campaign difficulty or an HQ-chosen difficulty on `SortieChoice`** would touch `src/sim/sortie.ts`. Not done:
   the Setting is read at Launch (Q4).

## Risks (honest)

- **R1: `titleScreen.ts` is one 1,100-line closure,** and the sortie forms live inside it. Reusing Forms 4 to 6 in two modes
  without copying means parameterizing `build()`; the surgical edit is real but not small (the roster half, `advance`, the
  enlist form, `start`, the Form 3 row source, Form 5 filter, Form 4 lock). If a clean parameterization proves impossible the
  fallback is extracting the forms into `src/render/sortieForms.ts` (a larger diff that F6B and F8 would conflict with);
  say so at CP2 rather than silently choosing it.
- **R2: `main.ts` is the collision hot spot** (F7A adds 143 lines, F6B will add more). Mitigated by moving all campaign
  logic out of it into `campaignSession.ts` so `main.ts` keeps only calls; still, the three bank sites and the launch closure
  are edited here.
- **R3: E2E cost and fragility.** 14 spec files start through `startGame`. Starting through a dev campaign keeps ten unchanged (same `startGame` signature), but
  the harness is shared infrastructure for every plan; a regression there reds everything. Mitigation: Task 9 lands the
  harness with the ten unchanged specs as its proof.
- **R4: the shipped game is thin for a campaign until F10.** American: seven open missions and no chapter; Japanese: one
  mission and no chapter. The HQ will honestly show that. A player who creates a Japanese campaign today can only fly Field
  Patrol. Not a bug, but Mark should expect the first look to feel empty (decision 14).
- **R5: the interrupted-sortie and two-tab behaviors are guards, not a database.** The stale-revision check refuses an
  older writer; it cannot merge. Two tabs on one career is unsupported beyond "the second one is told".
- **R6: storage.** Unchanged from F5A: 1.29 MB for a long career, 3.72 MB at the caps, about 5 MiB per origin. Per Mark, no
  UI; a failure shows only after it happens (Q6).
- **R7: the Japanese insignia estimate** could be wrong in its counts. Labeled, source-checked in Task 5, and easy to correct
  (data, not code).
- **R8: name-pool review.** The American list "needs Mark's review before F5B ships it" (F5A handoff); Mark approved the lists
  (M7). Recorded so the closeout does not re-raise it.
- **R9: unscored sorties sit beside scored ones in one picker,** so a player may not see that a Training or Single Missions
  row earns nothing. Each such row carries an "Unscored" tag and the debrief the existing not-recorded stamp.
- **R12: Dev inside the same UI** means the Dev checkbox can change what the picker enforces (ineligible pilots, dev rows). A
  bug in `unscoredReason` could bank a Dev-overridden sortie into a real career; Task 2's table and mutation check exist for
  exactly that, and the session refuses `launchSortie` when `unscoredReason` is non-null.
- **R10: Hangar and About copy** mention "pilot roster" in places (`titleScreen.ts:105-106` privacy line). Still true
  (campaigns are local); the sentence is updated in Task 12, not assumed.
- **R11: mockup fidelity.** The mockups use system fonts, not the game's typewriter and stencil faces, and pilot-row "Dossier"
  buttons sit under the name to fit; the real build self-hosts the fonts (`naval-comms.css`). Layout, not typography, is what
  they test.

## Collision notes (F6B, F7A, F8, F9, F10) and merge-order consequences

**F5B merges first (M1).** Everything below is what each follower must do after rebasing, and the seam F5B leaves for it.

| Plan | Overlaps F5B in | Seam F5B provides | What the follower does after rebase |
| --- | --- | --- | --- |
| **F7A** (branch `plan-f7a-bailout-rescue`, +1,249/-46) | `roster.ts` (deleted by F5B: a **modify/delete conflict**), `dossier.ts` (`OUTCOME_LABEL` for `rescued|captured`), `debrief.ts` (`RecoveryOutcome`, `RECOVERY_LABEL`, `bailoutModel`, stamp table), `main.ts` (+143: bailout command, parachutist follow, a bank call) | `session.bank(end: SortieEndKind, model, ...)` in `campaignSession.ts`; `SORTIE_END_OF: Record<RecoveryOutcome, SortieEndKind>` (exhaustive, so F7A's two new members **fail to compile until mapped**: that is the intended prompt); the dossier already labels all six `SortieEndKind`s | Drop its `roster.ts` hunk (take F5B's deletion); drop its `dossier.ts` `OUTCOME_LABEL` edit (F5B's labels cover `rescued` and `captured`); keep its `RecoveryOutcome`, `RECOVERY_LABEL`, `bailoutModel` and stamp table (F5B did not touch those tables); re-point its bank call from the old `bankMissionResult` to `session.bank('rescued' \| 'captured')`. **The bailout outcome path into `bankSortie` is exactly `SortieEndKind` `rescued`/`captured` through `session.bank`**; closure to POW and the replacement are automatic in the F5A reducer, so F7A (or F7B) writes no roster code. Expect conflicts in `tests/render/debrief.test.ts` (F7A edits 48 lines near the roster-based tests F5B rewrites). |
| **F6B** | `titleScreen.ts` Form 4 (night takeoff gating) and the launch closure; `main.ts` launch | `onNewGame(choice, launch: CampaignLaunch \| null)` with `CampaignLaunch = { pilotId, tier, facts }`; `abilities(tier)` is read in one place (`campaignSession.launch`) and written into `facts` (reserved keys `aircraft`, `loadout` are F5A's; F6B adds `sights`); Form 4's night lock is data from the descriptor | Add `sights: abilities(tier).sights` to `facts`, copy `facts` into the recorder `launch` (the recorder change F5A assigned to F7/F6), gate the HUD aid on it. It does **not** edit `titleScreen.ts` for rank gating: that is the descriptor and `eligibility`. |
| **F8** | none in F5B's files at launch; HQ gains a "World" view | `HQ_DEPARTMENTS` is a data list; `CampaignLaunch.facts` can carry per-site world state ids | Add a department entry and read `campaign.world` into the scenario load at Launch. |
| **F9** | the debrief's Return handler | `session.bank` returns `{ campaign, victory }` after the synchronous save; "Return to Headquarters" is a single handler in `main.ts` | Play the victory scene from that handler **after** the save (F5A's guarantee), and the opening scene between Launch and the world appearing. |
| **F10** | chapter table, catalog | `buildShellCatalog` merges the pooled rows with chapter descriptors; `chapters.json` is the stand-in (checked against `GAMEPLAY.md`) | Replace `chapters.json` with authored descriptors; the HQ and picker need no change. |
| **N2 recorder** | none | `facts` flows through `CampaignLaunch` only | F7/F6 copy it into the recorder's `launch`. |

**Textual conflicts to expect on rebase (and how to avoid them):** `main.ts` regions `:363-390`, `:813-832`, `:2193-2260`,
`:2461-2494`, `:3369-3445`; `debrief.ts` `:11`, `:603`, `:675-687`; `titleScreen.ts` `:595-670`, `:1178-1208`, `:1303-1429`,
and the Form 4 night comment `:842`; `MASTER_PLAN.md` F5 and F7 status lines; `GAMEPLAY.md`. F5B keeps its `main.ts` edits
to call-site replacements (no reordering, no new top-level state beyond `session`), so a follower's hunks that touch the same
lines are the only ones that conflict.

## Acceptance

- **Every GAMEPLAY.md campaign rule has a screen path:** create with name and permanent nation; five living pilots; closed
  archive of K.I.A./P.O.W./discharged; the Commander's dossier with command rating, cumulative and adjusted score and badges;
  mission first then pilot; rank gates shown as goals; Quit/Abandon; no Continue; bank once; export and import with replace
  and keep-both.
- **A campaign can never be locked out in the UI:** the 3,528-state proof shows an enabled assignable pilot for a lifeline
  mission in every state, red under mutation.
- **Bank-once, abandon and interrupted-load are proven** at the session level (Task 3) and in the browser (Task 10).
- `roster.ts` is gone and `grep -rn "roster.js\|loadRoster\|ww2airsim.roster" src tests` finds only the one-time purge and
  its test.
- No stored shape, reducer order or `src/sim` contract changed (the "Frozen-contract check" list).
- `npm run verify` green via `remote-run`, exit status gated; reconciliation recorded; the five checkpoints held.

## Stop conditions

- If a screen cannot be built without a new field on `Campaign` (a version bump) or a change to a `src/sim` type, **stop and
  list it** (see "Frozen-contract check"); do not edit the schema in place.
- If parameterizing `titleScreen.ts`'s `build()` for two modes is not possible with a surgical diff (R1), stop at CP2 and
  say so.
- If the stale-revision guard or the interrupted-sortie save cannot be made reliable against the storage port, stop: a
  career-losing bug outranks the schedule.
- Do not add a dependency. Do not touch `combat.ts`, `discharge.ts` or `TargetType` (F5A R9 stands). Do not email or deploy.
