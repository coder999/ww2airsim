# F5A campaign data, persistence and scoring: plan (2026-10-14)

MASTER_PLAN Track F5, first half (plan 7 of the 22 in the
[F3 dependency table](../specs/2026-10-14-leyte-campaign-definition.md#11-dependency-checked-plan-count)).
F5B (headquarters, roster UI, progression screens) is the other half and is **not** in
scope. F5A builds the pure, DOM-free campaign core and freezes the schema contract that F5B,
F6, F7, F8 and F9 consume. It changes no screen.

## Header

- **Branch:** `plan-f5a-campaign`, worktree `/home/mark/projects/ww2airsim-plan-f5a-campaign`, cut from `main` at `c3b8b299`.
- **Viewing checkpoints:** none. Automated gates decide pass or fail; Mark's viewing is never a test gate (AGENTS.md). Answered by Mark, relayed 2026-10-14.
- **Run:** unattended, to completion. Collect any dumps (the exhaustive-search report, the size-budget table) in the handoff. Answered by Mark, relayed 2026-10-14.
- **Heavy jobs:** the full suite and `npm run verify` go through `remote-run` (AGENTS.md). The exhaustive no-deadlock search is CPU-only and sized to run in seconds (Task 10).
- **Delivery:** commit and push the branch. Do not merge, deploy, or email (the coordinator mails it).
- **Size:** M (one plan, 14 tasks); about 1,200 lines of `src/campaign/` plus about 2,700 lines of tests, a small-but-risky sim change (Task 7), and one new Japanese scenario with its briefing and flyable check (Task 9; about 300 lines of JSON, TypeScript and tests). Net change from the first draft: the legacy migration (about 250 lines plus tests) is gone, Task 9 (Japanese mission) is added; still one plan.
- **Rulings:** Mark ruled on D1-D16 on 2026-10-14; see "Decisions (Mark, 2026-10-14)". Changing any after Task 3 freezes the schema is a version bump.

## Goal

Ship, as pure functions with no DOM, no `localStorage`, no clock and no `Math.random`:

1. faction-bound independent American and Japanese campaign records;
2. exactly five living pilots, closed archives (KIA, POW, discharged), deterministic entry-rank replacement with generated names;
3. two score ledgers (pilot, human player), adjusted points per sortie, destruction credit by damage tag, difficulty and completion and roster bonuses, warning-only friendly fire, destruction-triggered dishonorable discharge, zero-point abandonment;
4. the six-tier pilot ladders, the five command titles and the rank/aircraft/night eligibility rules;
5. chapter sequencing, mission locks and the always-available entry-rank non-campaign lifeline;
6. a versioned save and a canonical export/import format; the pre-campaign roster (`ww2airsim.roster.v1`) is discarded, never read as a campaign (D1);
7. one Japanese entry-rank non-campaign mission, so both factions have a real lifeline (D3);

and **freeze the contract** (section "Schema contract") so the five downstream plans can build against it in parallel.

## Fixed inputs

- `GAMEPLAY.md`, "Planned Leyte campaigns", owns the player rules. The F3 lock owns chapter ids, ranks and recovery graphs. This plan restates neither; where they are ambiguous it says so under "Decisions for Mark" instead of choosing.
- `MASTER_PLAN.md` F5 acceptance gate: loss, POW, discharge, replacement, cross-faction isolation, rank eligibility, mission locks, every score path, export/import are deterministic and covered, and the old roster is discarded safely (Mark's D1 ruling replaces "old-save migration"); a campaign with five replacement Ensigns can always reach an entry-rank non-campaign mission.
- N2 (done): the flight recorder checksums `World` only and is build-id-bound (`src/flightRecorder/checksum.ts:24-28`, `schema.ts:57`).
- `docs/testing.md` Philosophy: enroll don't clone; a test must be able to fail; assert behavior not constants.

## Scoping findings

All paths are relative to the repo root; line numbers verified 2026-10-14 against `c3b8b299`.

### F1. The persisted schema today

- **One key, one writer.** `ww2airsim.roster.v1` is read and written only in `src/render/roster.ts` (`STORAGE_KEY` :319, `loadRoster` :427, `saveRoster` :447). It stores a JSON array of `PilotRecord` (:83-96): `id` (a `crypto.randomUUID()`, :109), `name`, `rank` (the whole `{abbrev,name,threshold}` object), `cumulativeScore`, `missionsFlown`, `sorties`, `killsByType` (11 rows, `src/sim/weapons/targetType.ts:9-16`), `badges` (mission badge ids), `status` (`'active'|'kia'|'discharged'`, :80), `resurrections`, `career` (flight seconds, landings by trap/field/ditched, two peaks), `log` (<= 200 `MissionLogEntry`, cap :78, with an optional `discharged: true`).
- **No version field.** The `v1` is only in the key. Compatibility so far is "zero-fill on read": `validatePilot` (:368-410) and `validateLogEntry` (:344-366) tolerate missing `career`/`log`/new kill rows/unknown `status`; a pilot missing a core field throws and `loadRoster` (:427-436) swallows it and returns `[]` (the whole roster is dropped). `rank` is matched by `abbrev` only (:375-385) so retuned thresholds do not orphan saves.
- **No campaign concept:** no faction, no human-player record, no archive, no cap on pilot count (`createPilot` is unlimited), resurrection flips `kia` back to `active` (:124-133, :199).
- **Other keys are unrelated settings** (`quality.ts`, `settings.ts`, `graphicsCheck.ts`); none carries progression. Verified by `grep -rn localStorage src`.
- **Export/import exist and are unwired:** `exportRoster`/`importRoster` (:455-463) have no UI caller (plan 9 handoff, "Deliberate boundaries"); replace-vs-merge was never decided.
- **No determinism:** ids from `crypto.randomUUID()`, timestamps passed in by `main.ts`; saved log entries carry wall-clock `at`.

### F2. Call-site count (what depends on the schema)

- **`src/` importers of `roster.ts`: 4 files.** `main.ts:48` (`bankSortie`, `loadRoster`, `saveRoster`; `roster` and `currentPilotId` live at :351-352, `bankMissionResult` :2176-2199, three debrief call sites :3318, :3343, :3375), `titleScreen.ts:7` (`createPilot`, `loadRoster`, `saveRoster`, `startSortie`; the `start` launch closure :1375-1397 is where resurrection happens), `dossier.ts:2` and `debrief.ts:10` (both only `RANK_LADDER`; debrief :610 finds a promotion by rank *name*).
- **Rank is read by identity in 5 more places:** `insignia.ts:114` (`INSIGNIA[rank.abbrev]`, USN devices only, ten entries), `dossier.ts:22-32`, `titleScreen.ts:301,320,325,1212`, `main.ts:2197`.
- **Tests: 7 unit files** import it (`tests/render/{roster,dossier,debrief,devSortie,titleScreen,insignia}.test.ts`; `roster.test.ts` alone is 485 lines and names the key 12 times) **and 5 E2E files** touch pilots or the key (`tests/e2e/{harness,meta-game,meta-game-relaunch,sortie,friendly-fire}.spec.ts`; `harness.ts`'s `startGame()` is called by about 20 specs, plan 9 handoff).
- **Friendly-fire/discharge consumers:** `src/render/discharge.ts` (`withDischarge` keys on `friendlyFire !== null`), `combatReadout.ts:43`, `mission/hud.ts:38-50`, `tests/render/{discharge,combatReadout,titleScreen,dossier,roster}.test.ts`, `tests/e2e/friendly-fire.spec.ts`.
- **Consequence:** F5A must be **additive** (a new `src/campaign/` tree). The live title screen keeps working on `roster.ts` until F5B swaps the front end; F5B deletes `roster.ts` and rewrites `startGame()`. F5A ships a test fixture builder so F5B does not hand-build campaigns.

### F3. The old roster is discarded (Mark, D1, 2026-10-14)

Existing pilots may simply be deleted: no legacy dossiers, no migration. The old ladder (10 ranks, different thresholds), the missing faction and the "nothing crosses campaigns" rule would make any transplant wrong anyway. F5A stays additive and does not touch `roster.ts` or `ww2airsim.roster.v1`. **Handed to F5B:** delete `roster.ts` and its consumers, and clear or ignore the old key. Campaign code never reads `ww2airsim.roster.v1` as a campaign, and the old key is not required to survive (F5B may remove it). One guard stays in F5A: `importCampaign` rejects a bare roster.v1 array with a clear message (an array is not a campaign), tested.

### F4. Where each new rule fits (and what it forces)

| Rule | Where it lives | Evidence / consequence |
| --- | --- | --- |
| Two independent faction careers | new `Campaign` records, one per career | Nothing in `roster.ts` is faction-aware. Sim `Side` is `'allied'\|'axis'` with the player defaulting to allied (`src/sim/sides.ts:12-20`); **faction (`'us'\|'ja'`) is a different axis** and must not reuse `Side`. A Japanese player flies `axis`-flagged aircraft; that is F10's scenario authoring. |
| Five living pilots, closed archives | `Campaign.roster.live` (exactly 5) + `pilots` map holding archived dossiers | Replaces `status:'kia'` + resurrection. `startSortie` and `PilotStatus` have no campaign analogue. |
| Entry-rank replacement, generated names | `replaceVacancies` + seeded name generator | No name data or generator exists (`grep -rn "given\|surname" src` finds none). Needs curated, source-reviewed lists (Task 4). |
| POW / bailout outcomes | `SortieEnd` kinds `rescued`, `captured` | `RecoveryOutcome` is `'landed'\|'ditched'\|'killed'` only (`debrief.ts:88`); F7 produces the new kinds, F5A consumes them (the reducer paths exist and are tested before F7 lands). |
| Two ledgers + adjusted score | `Ledger` per pilot and for the human | Today one `cumulativeScore` per pilot. Adjusted score = points / score-eligible sorties launched; denominator increments at *launch*. |
| Destruction credit by damage tag | **sim change** (Task 7) | Today credit goes to the *last-blow* owner at kill time (`combat.ts:754-764`, :797-807, :1156-1165) and a sunk ship credits only after the 90 s sink completes (:1144-1166). The campaign rule is "any player-caused durability damage tags the target; credited once if it is later destroyed by anyone". `lastHitBy` is single-valued (`combat.ts:71-80`), so tags cannot be reconstructed after the fact. |
| New target classes | extend `TargetType` | Campaign table has `light-vehicle` (100) and `landing-craft` (250), which do not exist; `transport` goes 400 to 500, `destroyer` 750 to 1,000. Scout cars score as Building today (GAMEPLAY.md vehicle roster). |
| Warning-only friendly fire | narrow `withDischarge` | Today the *first friendly damage* sets `friendlyFire` (`combat.ts:736`, :792, :818, :826; `friendlyFire.ts:48`) and `discharge.ts:70` forfeits and discharges on it. `friendlyKills` already counts destructions of own-side aircraft/ship/structure/vehicle (`combat.ts:754,799,832,1154,1235`) and is the ready-made discharge trigger. |
| Dishonorable discharge | `Pilot.status='discharged'` in archive | Exists as a status today (`roster.ts:80`); the new rule makes it a closure with replacement, and removes the old "the dead cannot be discharged" FF-7 carve-out question (D6). |
| Zero-point abandonment | `SortieEnd` kind `abandoned` | No Quit/Abandon action exists in `src/` today. F5B owns the button; F5A owns what it banks. |
| Persistence between sorties only | autosave after each banked debrief | Mid-flight save is deferred (GAMEPLAY.md). A launched-but-unbanked sortie needs a `pending` marker (D7). |

### F5. Scenario picker and the "no deadlock" input

- `SCENARIO_OPTIONS` (`src/render/titleScreen.ts:193-246`) has 30 rows: 19 non-dev (13 missions, 6 ranges) and 11 dev, with `kind`, `dev`, `aircraft`, `badge`. **Every non-dev row flies an American aircraft** (`f6f-hellcat`, `tbm-3-avenger`, `pby-5a-catalina`). No scenario has a Japanese player. `tests/render/mission/options.test.ts` pins the rows against `content/scenarios/`.
- **Finding:** "each side always has an entry-rank non-campaign option" is **false for Japan today.** The no-deadlock test against the shipped catalog cannot pass for `ja` until a Japanese entry-rank day single-engine mission exists (D3, resolved: Task 9 adds one).
- Ranges (`kind:'range'`), Training Grounds missions (Basic Flying, Torpedo Qualification, Carrier Qualification) and Single Missions are excluded from score by GAMEPLAY.md, yet "the existing scenario set seeds the non-campaign pool". The picker has no field saying which is which (D2).
- The PBY-5A is twin-engine: not entry-rank day single-engine, and GAMEPLAY.md grants it to LTJG only for A4. `water-quals` (a non-campaign PBY mission) therefore has no stated rank (D5).

### F6. Flight recorder (N2) interaction

N2 records launch settings, applied controls, events and a `World`-only checksum; the debrief rides along as opaque JSON (`schema.ts:78-81`). Campaign state is **not** in `World` and must stay out of it, so the recorder is unaffected by anything in `src/campaign/`. Two things are not free:

1. **Task 7 changes `World`** (the tag ledger and new `TargetType` rows enter `combat`, which `worldChecksum` hashes, `checksum.ts:24-28`). Every previously exported `.ww2flight` stops verifying. This is already true for any sim change because records are build-id-bound and fail closed (MASTER_PLAN N2); no test pins a checksum literal (`grep -rn worldChecksum tests` only compares). Accepted, but stated (R3).
2. **Seeded decisions are inputs to a sortie, not sim state:** F7's bailout seed, and any rank-gated aid F6 turns on (sights), must reach the recorder through `launch.dev`/`launch` fields, or a replay would diverge. F5A freezes `SortieLaunch.facts` (below) as the single object F6/F7 hang such inputs on, and the recorder's `launch` must copy it (recorder change is F7's, noted in the contract).

### F7. Boundaries

- `.dependency-cruiser.cjs` forbids `src/sim` importing `src/render`/`src/audio`/`src/input`/`src/assists`; `src/campaign/` is new. Add: `campaign-must-stay-pure` (campaign may import only `src/sim/` type modules, `src/flightRecorder/canonical.ts`, and itself; never `src/render`, three, or DOM), and `sim-must-not-import-campaign`. Prove both bite in `tests/architecture/boundary.test.ts` (house pattern).
- `src/render/roster.ts` imports types from `debrief.ts` and `flightRecord.ts` while `debrief.ts` imports `RANK_LADDER` from `roster.ts` (a type/value cycle that works only because one side is type-only); the campaign tree must not copy that.
- No property-test library is installed (`package.json`: no `fast-check`). Exhaustive and seeded-walk tests use `createRng` (`src/sim/rng.ts`, mulberry32). No new dependency.

## Schema contract (FROZEN at the end of Task 3)

Everything here is the contract. After Task 3 merges, a change is a version bump (`schemaVersion`) plus a migration plus a note to every consumer; no consumer plan edits these types in place. Types live in `src/campaign/schema.ts`; runtime validators are `zod` (already a dependency, used by `flightRecorder/schema.ts`).

### C1. Conventions

- **Pure.** No `window`, `localStorage`, `Date`, `crypto`, `Math.random`. The shell injects `ctx: { now: string; newCampaignId: string }` where needed; the core never reads a clock.
- **Integers only.** All points and counters are non-negative safe integers. No stored float anywhere. Adjusted score is derived: `adjusted = sorties === 0 ? 0 : points / sorties`, displayed to one decimal, never persisted.
- **Immutable.** Every reducer returns a new `Campaign` and bumps `revision` by exactly 1 (0 on a rejected call, which returns the same reference plus an error value).
- **Derived, not stored:** rank tier (from points), adjusted score, command title (from human points), eligibility, locks. Retuning a threshold can never orphan a save.
- **Ids are deterministic:** pilot id `"<campaignId>:p<serial>"`, sortie id `"<campaignId>:s<serial>"`. Only `campaignId` is random, injected once.

### C2. State shapes

```ts
export type Faction = 'us' | 'ja'                       // NOT sim Side
export type Tier = 1 | 2 | 3 | 4 | 5 | 6                // pilot rank tier
export const PILOT_TIER_POINTS = [0, 2500, 7500, 15000, 25000, 40000] as const
export const COMMAND_TITLE_POINTS = [0, 20000, 50000, 90000, 140000] as const   // 5 titles
export const LIVE_ROSTER_SIZE = 5
export const SCORING_RULES_VERSION = 1

export type ScoreClass =       // destroyed-object classes; 11 existing TargetType rows + 2 new
  | 'light-vehicle' | 'building' | 'landing-craft' | 'aaa' | 'tank' | 'fighter' | 'runway'
  | 'transport' | 'bomber' | 'destroyer' | 'cruiser' | 'battleship' | 'carrier'
export const SCORE_POINTS: Record<ScoreClass, number>   // 100 150 250 250 300 500 500 500 750 1000 1500 3000 5000

export type Counts = Readonly<Record<ScoreClass, number>>

export type PilotName = { given: string; family: string; suffix?: 'Jr.' | 'Sr.' | 'II' | 'III' | 'IV'; kanji?: string }  // suffix: us only; display order by faction

export type PilotStatus = 'active' | 'kia' | 'pow' | 'discharged'
export type Closure = { sortieId: string; at: string; reason: PilotStatus /* not 'active' */; missionId: string | null }

export type Career = { flightSeconds: number; landings: { trap: number; field: number; ditched: number; water: number };
                       rescues: number; maxAltitudeM: number; maxTrueAirspeedMps: number }   // SI internally (D9); imperial at display only

export type LogEntry = {
  sortieId: string; at: string; missionId: string; chapterId: string | null; aircraft: string; loadout: string
  difficulty: 'easy' | 'normal' | 'hard'; end: SortieEndKind; success: boolean
  counts: Counts; destruction: number; bonuses: { difficulty: number; completion: number; roster: number }  // roster is human-only
  points: number                                    // total this ledger received
  flightSeconds: number; flags: ('forfeit-abandoned' | 'forfeit-friendly-destroyed' | 'warned')[]
}

export type Ledger = { points: number; sorties: number /* score-eligible LAUNCHED */; banked: number /* debriefs */; counts: Counts; badges: string[] }

export type Pilot = {
  id: string; serial: number; name: PilotName; status: PilotStatus; closure: Closure | null
  points: number; sorties: number; banked: number; counts: Counts; badges: string[]
  career: Career; log: LogEntry[]                  // live cap 200, closed cap 50 (D10)
}

export type Human = {
  playerName: string
  ledger: Ledger                                   // points = raw cumulative; sorties = adjusted-score denominator
  stats: { losses: { kia: number; pow: number; discharged: number }; rescues: number; abandoned: number; warnings: number }
  log: LogEntry[]                                  // cap 500, chronological; the human dossier's log
}

export type ChapterId = 'A1'|'A2'|'A3'|'A4'|'A5'|'A6'|'J1'|'J2'|'J3'|'J4'|'J5'|'J6'
export type Progress = { completed: ChapterId[]; victory: boolean
                         attempts: Partial<Record<ChapterId, { launched: number; failed: number; abandoned: number }>> }

export type PendingSortie = { sortieId: string; pilotId: string; missionId: string; chapterId: ChapterId | null
                              difficulty: 'easy'|'normal'|'hard'; scoreEligible: boolean; launchedAt: string; facts: SortieFacts }
export type SortieFacts = Readonly<Record<string, string | number | boolean>>   // F6/F7 hang launch-time inputs here (bailout seed, sight gate); copied into the recorder `launch`

export type Campaign = {
  format: 'ww2airsim-campaign'; schemaVersion: 1; scoringRulesVersion: 1
  id: string; revision: number; faction: Faction
  human: Human
  roster: { live: [string, string, string, string, string] }       // pilot ids, exactly 5, stable slot order
  pilots: Record<string, Pilot>                                    // live + archived
  nameDraws: { seed: number; next: number }                        // seeded generator cursor
  serials: { pilot: number; sortie: number }
  progress: Progress
  world: Record<string, string>                                    // F8 owns keys and values (site id -> state id); opaque to F5A
  scenesSeen: string[]                                             // F9: set semantics, written identically on skip and completion
  pending: PendingSortie | null
}
```

### C3. Reducer API (the only way state changes)

```ts
createCampaign(args: { id: string; faction: Faction; playerName: string; seed: number; now: string }): Campaign
launchSortie(c: Campaign, a: { pilotId: string; mission: MissionDescriptor; aircraft: AircraftDescriptor;
             difficulty; loadout: string; facts?: SortieFacts; now: string }): Result<Campaign>      // checks eligibility+locks; sets pending; ++human.ledger.sorties if score-eligible
bankSortie(c: Campaign, r: SortieReport, now: string): Result<Campaign>                              // clears pending; the whole score/closure/replacement/progress transaction
resolveInterrupted(c: Campaign, now: string): Campaign                                              // pending left over at load == abandoned
renamePlayer / noop-free: no other mutators
```

```ts
export type SortieEndKind = 'landed' | 'ditched' | 'killed' | 'rescued' | 'captured' | 'abandoned'
export type SortieReport = {
  sortieId: string                       // must equal c.pending.sortieId
  end: SortieEndKind
  success: boolean                       // sim verdict: primary objective AND authored recovery (never computed here)
  counts: Counts                         // enemy objects tagged by the assigned pilot AND destroyed by sortie end
  friendlyDestroyed: boolean             // player-caused friendly destruction (combat.friendlyKills > 0)
  warnings: number                       // nonfatal friendly damage events (0 or 1 today)
  authoredBonus: number                  // mission-declared completion bonus (A4 = 2500), applies only if success
  flight: { flightSeconds: number; maxAltitudeM: number; maxTrueAirspeedMps: number; landing: 'trap'|'field'|'ditched'|'water'|null }
  badgeId: string | null                 // mission badge id if the mission awards one
}
```

`bankSortie` is one deterministic transaction, in this order (the order is part of the contract):

1. Reject if `pending` is null or ids mismatch.
2. **Forfeit test:** `end==='abandoned'` or `friendlyDestroyed` forfeits everything: `destruction = difficulty = completion = roster = 0`, no badge, no progress. (Precedence if both: discharge wins the closure, abandoned the log flag; D6.)
3. Else `destruction = sum(counts[k] * SCORE_POINTS[k])`. If `success`: `difficulty` = 0/500/1000 by `pending.difficulty`, `completion = authoredBonus`, badge awarded. Not success: both 0, no badge.
4. **Pilot ledger** += `destruction + difficulty + completion`. **Human ledger** += the same, then `roster` bonus (success only) computed from the *post-sortie, post-promotion* live roster (D8). Banked pilot points are never removed.
5. **Closure:** `killed` -> `kia`; `captured` -> `pow`; `friendlyDestroyed` -> `discharged`. `landed|ditched|rescued|abandoned` keep the pilot active. A closed pilot moves out of `roster.live`, keeps the points from this sortie, and its log is trimmed to the closed cap.
6. **Replacement:** every vacated slot is refilled in the same call with a new Tier-1 pilot (zero everything), name from the seeded generator, `serial` from `serials.pilot`. Postcondition: `roster.live.length === 5`, all active.
7. **Progress:** only `success` on a campaign chapter that is the current one adds it to `completed` (and sets `victory` on A6/J6). A non-campaign mission never touches `progress` or `world`.
8. `attempts`, `human.stats`, `revision`, `pending = null`.

### C4. Pure queries (what UI and F6/F7/F10 call)

```ts
tierOf(points): Tier;  commandTitleOf(points): 0|1|2|3|4;  adjustedScore(h: Human): number
rankLabel(faction, tier): { abbrev?: string; name: string }     // 'Ensign'.. / 'Kaigun Shōi'..
abilities(tier): { night: boolean; advanced: boolean; sights: boolean; coordinated: boolean; finale: boolean }
   // tier>=2 night, >=3 advanced, >=4 sights, >=5 coordinated, >=6 finale  (GAMEPLAY.md ladder table)
eligibility(pilot, mission: MissionDescriptor, aircraft: AircraftDescriptor): { ok: true } | { ok: false; reason: 'rank'|'night'|'advanced'|'coordinated'|'finale'|'pilot-closed'|'faction'; needTier: Tier }
missionLock(c, mission): { open: true } | { open: false; reason: 'previous-chapter'|'completed'|'faction'; needs: ChapterId | null }
offers(c, catalog: readonly MissionDescriptor[]): { mission; pilots: { pilotId; eligible: boolean; reason? }[] }[]     // mission-first screen, F5B
lifeline(c, catalog): { mission; pilotId } | null            // the no-deadlock query: non-null for every reachable campaign
```

```ts
export type MissionDescriptor = {            // supplied by content (F10 authors; F5A ships a validator + the shipped seed)
  id: string; faction: Faction; kind: 'campaign' | 'noncampaign'
  chapterId: ChapterId | null; minTier: Tier; night: boolean; coordinated: boolean
  aircraftIds: readonly string[]; scoreEligible: true            // anything not score-eligible is not in the catalog (D2)
  authoredBonus: number; badgeId: string | null
}
export type AircraftDescriptor = { id: string; advanced: boolean }   // advanced list: P-38, B-17, B-29 / G4M, Ki-21, Ki-57 (GAMEPLAY.md)
```

### C5. Storage keys and shell I/O (thin, outside the pure core)

- `ww2airsim.campaigns.v1` : index `{ schemaVersion:1, campaigns: { id, faction, playerName, revision, points }[] }`.
- `ww2airsim.campaign.<id>.v1` : one `Campaign` JSON per career, so one corrupt career cannot take another down.
- `ww2airsim.profile.v1` : `{ schemaVersion:1, lastPlayerName?: string }` (the only cross-campaign state; a remembered name, no progression).
- `ww2airsim.roster.v1` : the discarded pre-campaign roster. F5A neither reads it as a campaign nor writes it; F5B clears or ignores it (D1).
- Autosave after every `bankSortie`, `launchSortie` and `createCampaign`. `saveCampaign` returns `{ ok: true } | { ok: false; error }`; the shell shows a visible warning on failure. Silent loss (as in `saveRoster`'s `console.warn`, `roster.ts:447-453`) is not allowed for a career save.
- Load: parse -> validate (zod) -> migrate by `schemaVersion` -> `resolveInterrupted`. A campaign that fails validation is left untouched in storage and reported (`{ ok:false, id, issues }`), never reset to empty (the old `loadRoster` returned `[]` on any error, `roster.ts:431-435`).
- Size, **corrected 2026-10-14 against the repo** (the first draft said a worst-case campaign serializes under 1.5 MB; that is unreachable at the D10 caps, because a `LogEntry` with its dense `counts` map is about 500 bytes and the caps allow 6,500 entries). Measured through the real reducers (`tests/campaign/storage.test.ts`): new career 3.1 KB; long career (20 closed dossiers of 50, live pilots at 200, human at 500) 1.29 MB; the capped worst case (100 closed dossiers, every class counted, long ids) **3.72 MB** (American, 3.71 MB Japanese). The test pins worst case < 4 MB (one origin's quota is about 5 MiB, shared with every other career and setting) and a 20-death career < 1.5 MB. **Two worst-case careers do not fit one origin**; F5B should warn from `listCampaigns` and offer export, and a v2 bump could store `counts` sparsely.

### C6. Export / import (deterministic)

- **Export:** `exportCampaign(c): string` = `canonicalStringify` (reused from `src/flightRecorder/canonical.ts`: sorted keys, `-0` to `0`, no `undefined`) of `{ format:'ww2airsim-campaign', schemaVersion, scoringRulesVersion, campaign, digest }`, where `digest` is `fnv1a64` of the canonical campaign (a corruption check, not security). No wall-clock inside the body; the filename carries the date.
- **Guarantees tested:** `export(import(export(c))) === export(c)` byte-for-byte; import validates, upgrades older `schemaVersion`s of the new format, and fails with an actionable message listing every issue.
- **Import policy (D4):** import always *adds* a career; if the same `campaign.id` exists, compare `revision` and require an explicit replace/keep-both choice from the shell; the core returns `{ conflict: { existingRevision, incomingRevision } }` and does not decide.
- A bare roster.v1 array on import is rejected with a message (it is not a campaign); there is no legacy path (D1).

### C7. What each downstream plan may depend on

| Plan | Consumes | Must not |
| --- | --- | --- |
| F5B headquarters/UI | all of C3-C6; `offers`, `lifeline`, `rankLabel`, `adjustedScore`; the fixture builder | Mutate a `Campaign` except through reducers; compute score, rank or eligibility itself. Owns Quit/Abandon button, `startGame()` rewrite, `roster.ts` and old-key deletion (D1), **no Continue after a landing in campaign mode: a landing ends the sortie and the shell calls `bankSortie` exactly once per sortie (D12)**, Japanese insignia (`insignia.ts` is USN-only). |
| F6 night/aids | `abilities(tier)`, `SortieFacts` for any sim-visible gate | Read `Campaign` inside `src/sim`. |
| F7 bailout/POW | `SortieEndKind` `rescued`/`captured`/`killed`; closure to `pow`; `SortieFacts` for the bailout seed and resolver inputs; replacement is automatic | Add a status or a roster path; archive layout is frozen. |
| F8 canonical world | `Campaign.world` as an opaque `Record<string,string>` and "state changes only on `success` of a current campaign chapter" | Change when a transition fires (a `bankSortie` rule). |
| F9 scenes | `scenesSeen`; banking happens before victory playback (`bankSortie` is synchronous and returns before any scene) | Write progress from a scene. Skip and completion must write the identical `scenesSeen`. |
| F10 missions | `MissionDescriptor`, `authoredBonus`, `success` verdict from the sim | Add score paths; all points flow through `bankSortie`. |

## Tasks

Each task lands with its tests; `npm run verify` stays green at every commit (the new tree is additive).

1. **Boundary and scaffolding.** Create `src/campaign/` (`schema.ts`, `scoring.ts`, `ranks.ts`, `roster.ts`, `eligibility.ts`, `bank.ts`, `names.ts`, `storage.ts`, `exchange.ts`, `index.ts`) and `tests/campaign/`. Add the two depcruise rules (F7) and their `boundary.test.ts` proofs (a deliberately violating fixture must fail). *Test:* boundary tests red against a violating fixture, green on the tree.
2. **Ranks and titles.** `PILOT_TIER_POINTS`, `COMMAND_TITLE_POINTS`, `tierOf`, `commandTitleOf`, `rankLabel` for both factions, `abilities`. *Tests:* boundary sweep at `t-1`/`t`/`t+1` for all 6 and 5 thresholds on both factions; tiers are identical for `us` and `ja` at every score 0..45,000 step 1 (enrolled, exhaustive, 45k cheap iterations); labels table pinned against GAMEPLAY.md's text by a parsed-table test, not a copied constant.
3. **Schema, validators, FREEZE.** `schema.ts` per C2 with zod validators and `createCampaign`. Write `docs/campaign-data.md` (subsystem reference per README "Where docs go", pointing at this plan's C1-C7 as history). *Tests:* a created campaign validates; every invariant (5 live, all active, ids unique, live ids exist, no live pilot closed, integers only, faction fixed) is a named validator check that has a negative test proving it fails; `createCampaign` is deterministic for equal inputs.
4. **Names.** `names.ts`: seeded draw from curated lists using `createRng`; `nameDraws.next` advances deterministically; no duplicate full name among live+archived while the pool allows; **exhausted pool falls back to a repeat with a distinct pilot id** (never throws, never blocks replacement). Data in `content/campaign/names-us.json`, `names-ja.json`, at least 60 given x 150 family names per faction (about 9,000 combinations; D16, an assumption Mark may change), with a per-list source ledger (provenance rule from `ASSETS.md`). The American list needs Mark's review before F5B ships it. `Jr./Sr./II/III/IV` only for `us`. *Tests:* same seed => same sequence across 10,000 draws; Japanese names never carry a suffix; exhaustion with a 2x2 injected pool across 50 replacements; no stored ethnicity field exists (schema keys asserted); formatting for both display orders.
5. **Scoring.** `SCORE_POINTS`, `scoreSortie(report, pending)` returning `{ destruction, difficulty, completion, forfeited }`; roster bonus from live tiers (0/100/200/300/400/500). *Tests:* one case per score path: every class x count; each difficulty; success vs not; authored bonus only on success; abandon; friendly-destroyed; both; roster bonus for all 252 multisets of five tiers; "never negative" property over a seeded walk; sums reconcile (`ledger.points === sum(log.points)` while the log is uncapped).
6. **Roster lifecycle and bank transaction.** `bank.ts` per C3 steps 1-8. *Tests (the acceptance matrix, enumerated, one named test each):* loss (KIA keeps this sortie's points in the closed dossier), POW, discharge (zero sortie, no badge, no bonuses), replacement (new Ensign, zero inherited, serial +1, name drawn), double-closure in one call impossible (one pilot per sortie), abandon (zero, pilot survives, denominator +1), interrupted-load == abandon, rescue (alive, points kept, no badge unless mission success), success on a non-current chapter does nothing to progress, victory on A6/J6, **cross-faction isolation** (two campaigns, any reducer sequence on one leaves the other byte-identical; and a `ja` pilot id can never be assigned to a `us` campaign), a pilot promoted by this sortie counts at the new tier for the roster bonus.
7. **Sim: destruction credit and discharge narrowing.** (a) Add a per-aircraft `tagged` set to `AircraftCombat` filled whenever the aircraft's rounds, bombs, rockets, torpedoes or blast do actual durability damage to an enemy aircraft, ship, structure or vehicle, and credit of a tagged target, once, at the existing destruction moment by any cause: for aircraft, structures and vehicles that is the kill; **for ships it stays the existing sink-complete credit (`combat.ts:1144-1166`, 90 s after `destroyedTick`; D15, Mark's ruling)**. (b) Extend `TargetType` with `light-vehicle`, `landing-craft`; retarget vehicle specs (`targetType` on the vehicle spec) and `shipTargetType`. (c) `withDischarge` keys on `friendlyKills > 0`; first friendly damage keeps the immediate radio warning and nothing else. (d) `pointsForTargetType` is replaced by `SCORE_POINTS` and the Hangar cards that read it (`debrief.ts:61`) follow. *Tests:* tag-then-wingman-kills credits once; untouched wingman kill credits nothing; hit-without-damage tags nothing; damaged-but-survives credits nothing; double credit impossible; **accepted, tested limitation (D15):** a sortie that ends inside a ship's 90 s sinking window credits nothing for that ship, and a friendly ship destroyed inside the window does not discharge (named tests pin both, so a later change is deliberate); a ship that finishes sinking before the sortie ends credits once; friendly damage warns, friendly destruction discharges; replaces the affected assertions in `tests/render/discharge.test.ts` and `tests/e2e/friendly-fire.spec.ts` in the same commit (AGENTS.md closeout). A mutation check: reverting (a) turns the tag tests red.
8. **Eligibility, locks, catalog.** `eligibility`, `missionLock`, `offers`, `lifeline`, `MissionDescriptor` validator, the descriptor builder for the shipped missions (the 13 plus Task 9's) (derived from `SCENARIO_OPTIONS` plus content aircraft class, so a new scenario is enrolled without a new test). *Tests:* the full rank x night x advanced x aircraft x faction truth table, enumerated; chapter lock sequence A1..A6 and J1..J6 (no skipping, no replay of completed per D11, retry after failure allowed); `offers` lists ineligible pilots with the exact missing tier.
9. **Japanese entry-rank non-campaign mission (D3).** One minimal A6M2 Zero Combat Air Patrol clone: `content/scenarios/<id>.json` (player A6M2 flagged for the Japanese side, defending a Japanese-held field against American raiders, daytime, single engine, its own badge), a `SCENARIO_OPTIONS` row (`pool: 'noncampaign'`, D2), a `RIBBONS` design (`insignia.test.ts` fails without it), a cited briefing, and the Zero flyable check. Verify the Zero is already flyable and its recovery graph exists at a Japanese-held field (Buri or Dulag); if either is missing, stop and report (see stop conditions). *Tests:* it is enrolled by the existing table-driven scenario tests (`tests/render/mission/options.test.ts`, content schema, flyable-all), its descriptor passes the Task 8 builder as `ja`, `noncampaign`, tier 1, day, single-engine, non-advanced, and the headless verdict path is proven the way the other missions' are (staged approach, injected hits). More Japanese missions come in later plans.
10. **No-deadlock proof (the acceptance gate).** See "The no-deadlock test" below. Runs the shipped catalog for **both** `us` and `ja` (green because of Task 9).
11. **Storage, export/import, size.** `storage.ts` over an injected `Storage`-shaped port (the shell passes `window.localStorage`; tests pass a Map; a throwing port tests quota errors). *Tests:* round-trip equality over 200 seeded random campaigns (the "save/load round-trip equality is a property test" requirement, GAMEPLAY.md Persistence); `export(import(export(c)))` byte-identical; corrupt/future/partial blobs return `{ok:false}` and leave storage untouched; one corrupt career does not affect another; quota failure surfaces; a bare roster.v1 array is rejected; worst-case size (5 live x 200-entry logs + 100 archived x 50 entries + 500 human entries) measured and bounded as C5 now says (the original 1.5 MB claim was wrong), numbers recorded in the handoff; `schemaVersion` greater than supported is refused with a message, not downgraded.
12. **Legacy removal: handed to F5B (D1).** No code in F5A. The handoff names what F5B deletes: `src/render/roster.ts`, the roster-era tests (`tests/render/{roster,dossier,devSortie,titleScreen}.test.ts` assertions, `insignia.test.ts`'s `RANK_LADDER` use), `debrief.ts`'s `RANK_LADDER` import, and the old key.
13. **Fixture builder and F5B seam.** `tests/fixtures/campaign.ts`: `makeCampaign({ faction, tiers: [..5], chapter, points })` through the real reducers (never hand-built JSON). A short consumer example test that F5B copies. *Test:* the fixture's output validates and re-banks.
14. **Closeout.** `npm run verify` via `remote-run`; reconcile per AGENTS.md ("Tests updated / Tests still valid / Known gaps" in `docs/handoff/2026-10-14-f5a-campaign-data-scoring.md`); update `GAMEPLAY.md` where a ruling lands (planned-section wording; the Vehicle roster sentence, D14; no Continue, D12; completed chapters not replayable, D11); MASTER_PLAN F5 status line; commit and push.

## The no-deadlock test (Task 10)

**Claim:** for every reachable campaign, with every live pilot replaced by a fresh Ensign at any point, `lifeline(c, catalog)` is non-null and launching it is accepted by `launchSortie`.

Three layers, cheapest and strongest first:

1. **Static catalog invariant (per faction).** The catalog contains at least one descriptor with `kind==='noncampaign'`, `minTier===1`, `night===false`, `coordinated===false`, every `aircraftIds` entry non-`advanced`, single-engine, same faction. Enrolled table-driven over `{us, ja}` with the pinned list so an empty filter fails instead of passing.
2. **Exhaustive abstract model check.** The only state that can affect eligibility is `(faction, chapter index 0..6, multiset of five live tiers)`. Enumerate all `2 x 7 x C(6+5-1,5)=252` = **3,528 states**; for each state apply **every** terminal outcome for **every** pilot slot x **every** eligible mission (`SortieEndKind` x success flag x difficulty), through the **real** `bankSortie`, then assert: live is 5, all active, `lifeline` non-null, the lifeline mission is not locked, and `launchSortie` accepts it. Then apply a *mass loss* (all five slots closed in consecutive sorties) and assert the same. This is exhaustive over the contract's state space, not sampled; it runs in seconds.
3. **Seeded random walks on real campaigns.** 200 seeds x 400 steps (mulberry32) choosing random eligible launches, ends, successes, difficulties, and occasional export/import and save/load in the middle; every step asserts all schema invariants plus `lifeline !== null`. Failure prints the seed and step for replay.

**It must be able to fail (testing.md):** a mutation test removes the entry-rank non-campaign descriptor from the catalog (and, separately, empties the name pool, and, separately, lets a closure skip the refill) and asserts the layer-2 check goes red with a named message each time.

## Risks (honest)

- **R1: the Japanese lifeline depends on one new mission.** No shipped scenario had a Japanese player (F5). Mark ruled (D3) that F5A adds one A6M2 Combat Air Patrol clone (Task 9). Risks: the Zero may not be fully flyable as a player aircraft, the Japanese-side raid and recovery graph may need AI/side work the clone did not anticipate, and a single mission is a thin lifeline (one content regression removes it; the layer-1 catalog test would catch that). If Task 9 cannot be done cheaply it stops the plan rather than shipping a `ja` assertion that is skipped.
- **R2: the Task 7 sim change is the riskiest task.** It touches `combat.ts` (about 1,250 lines, several credit sites) and retargets vehicles/ships. A damage-tag ledger can double-count or miss on spawn, wreck, flood and delayed-sink edge cases; ships keep sink-complete credit (D15), so the known edge (a sortie ending inside the 90 s sinking window credits nothing for that ship) is accepted and pinned by tests. Mitigation: it is its own commit sequence, mutation-checked, and the legacy `killsByType` stays beside the tag ledger until F5B retires it.
- **R3: every `.ww2flight` exported before Task 7 stops verifying** (new combat fields enter the checksum). Acceptable because records are build-bound, but any recording Mark is keeping as a reference is invalidated. Say so in the handoff.
- **R4: Tasks 4 and 5 carry content and balance decisions that are Mark's:** the name pools need real source review (not generated syllables), and the 100-point roster step and per-mission budgets are marked "initial balance values" in the brainstorm (section 8.2). F5A freezes the structure and ships the stated numbers; it does not tune.
- **R5: a frozen contract that is wrong is expensive.** Five plans build on C2-C7. The least certain parts are `world` (opaque; F8 may want typed transitions), `SortieFacts` (loosely typed so F6/F7 can add keys), and units in `Career` (D9). The plan keeps them loose on purpose; the cost is weaker validation until F8/F7 tighten them via a version bump.
- **R6: storage.** localStorage is about 5 MB shared by the whole origin and fails silently in private modes. Mitigated by per-career keys, the measured size tests (C5: 1.29 MB for a long career, 3.72 MB at the caps), caps, and a visible save-failure result; not eliminated (two capped careers exceed the quota, and a user with three long careers is near it; export is the escape hatch).
- **R7: F5B owns the deletion.** Because F5A leaves `roster.ts` and its call sites alone (D1), the old and new systems coexist until F5B lands; the live title screen still runs the resurrection-era flow in between. Nothing in F5A reads the old key.
- **R8: interrupted sortie as abandonment** is exploitable only as intended (it costs a denominator tick), but a pilot about to die can be saved by closing the tab. That is the same as Quit; not preventable without mid-flight state, which is deferred.
- **R9: parallel-plan collision.** F5B starts from this contract while F5A is still landing Task 7; F5B must not touch `combat.ts`, `discharge.ts` or `TargetType`.

## Decisions (Mark, 2026-10-14)

Mark ruled on D1-D16 on 2026-10-14. Items marked **(ambiguity)** or **(contradiction)** were places where `GAMEPLAY.md`, the F3 lock and the brainstorm disagree or are silent. **Changing any ruling after Task 3 freezes the schema is a version bump, not an edit.**

| # | Question | Ruling |
| --- | --- | --- |
| D1 | Existing pilots | **Delete. No legacy dossiers, no migration.** F5A stays additive and does not touch `roster.ts` or `ww2airsim.roster.v1`; F5B deletes `roster.ts` and clears or ignores the old key. The old roster is never read as a campaign and the old key is not required to survive. |
| D2 | Non-campaign pool **(ambiguity)** | As recommended: add `pool: 'noncampaign' \| 'training' \| 'single'` to `ScenarioOption`. The 13 non-dev missions except the three Training Grounds are `noncampaign`; ranges, Training and dev are not score-eligible. |
| D3 | Japanese entry-rank mission | **Option (b):** F5A adds one entry-rank Japanese non-campaign mission (minimal A6M2 Zero Combat Air Patrol clone: scenario, Zero flyable check, briefing, catalog enrollment), Task 9, before the no-deadlock proof. More Japanese missions come later. |
| D4 | Import policy | As recommended: import always adds a career; same id plus different revision asks replace or keep-both. |
| D5 | PBY rank on non-campaign missions **(ambiguity)** | As recommended: Lieutenant (junior grade) for any PBY mission. |
| D6 | Friendly-destruction precedence | As recommended, all three: a pilot killed in the same sortie as a friendly destruction is archived KIA (both facts logged, sortie still zero); abandon plus friendly destruction is a discharge; "player-caused" is the existing `friendlyKills` killing-blow rule, narrower than the enemy damage tag. |
| D7 | Launched but never banked sortie | As recommended: resolved as abandoned on next load (zero points, pilot survives, denominator stays). |
| D8 | Roster-bonus timing **(ambiguity)** | As recommended: ranks after this sortie's own promotion. |
| D9 | Units in the saved record | **SI internally** (`maxAltitudeM`, `maxTrueAirspeedMps`, as the old career), formatted imperial at display. This reverses the plan's recommendation; C2 and C3 are updated. |
| D10 | Log caps | As recommended: live pilot 200, closed dossier trimmed to the last 50, human log 500. |
| D11 | Replaying a completed chapter **(ambiguity)** | Completed campaign chapters are **not** replayable; failed ones can be retried; non-campaign missions are always replayable. |
| D12 | Continue after landing **(contradiction)** | As recommended: **a landing ends the sortie in campaign mode; no Continue.** Recorded in C7 for F5B (`bankSortie` is called once per sortie). |
| D13 | Difficulty scope **(ambiguity)** | As recommended: per sortie, stored on `PendingSortie`. |
| D14 | One scoring table | As recommended: one table for all play; update the Vehicle roster sentence in `GAMEPLAY.md` when Task 7 lands. |
| D15 | Ship destruction moment | **Keep credit at sink-complete** (90 s after `destroyedTick`); do not move it. The edge (a sortie ending inside the sinking window credits nothing for that ship, and a friendly ship destroyed in the window does not discharge) is an accepted, tested limitation (Task 7). This reverses the plan's recommendation. |
| D16 | Name-pool size | Smaller than recommended. Mark gave no number; **the plan assumes a minimum of 60 given x 150 family names per faction (about 9,000 combinations)**. This number is the plan's assumption, so Mark can change it. The exhaustion fallback stays, every list cites sources, and the American list needs Mark's review before F5B ships it. |

## Contradictions and ambiguities found (not decisions, flagged)

1. GAMEPLAY.md's shipped sections (Roster, Persistence, Scoring) still describe the resurrection era; the planned section replaces them. No Quit/Abandon action exists in `src/` today, so the abandon path has no producer until F5B.
2. `GAMEPLAY.md` pilot-points line for LCDR is 17,500 in "Ranks" (current) and 15,000 in the campaign table (planned). Correct as written (different ladders), but `RANK_LADDER` and `PILOT_TIER_POINTS` must not be confused; the old ladder dies with `roster.ts` in F5B.
3. The roster bonus text says "for each living Ensign-through-Captain counterpart, summed across the five pilots" while the brainstorm table says 0/100/200/300/400/500 by rank; they agree (6 tiers), maximum 2,500. Pinned by the Task 5 multiset test.
4. The brainstorm says discharge "forfeits the entire sortie score"; GAMEPLAY.md says "scores zero and earns no completion award". Same outcome; the plan implements the zero-everything reading, including difficulty and roster bonuses (both are success-only anyway).
5. F3 matrix gives J2 (Ensign) no friendly formation specifically to avoid the Commander gate, confirming `coordinated` must be a mission-descriptor flag, not an inference from the aircraft list.
6. F3 section 11 lists F5A before F6 yet the sights rank gate (F6B) needs `abilities(tier)`: that function is therefore in F5A (C4) so F6B does not re-derive the rank table.

## Acceptance

- Every scenario in the MASTER_PLAN F5 gate has at least one named test (Task 6's matrix lists them) and the Task 10 proof passes with its three mutation checks red-then-green.
- `export(import(export(c)))` is byte-identical over the seeded corpus; round-trip equality holds for 200 seeded campaigns.
- F5A neither reads nor writes `ww2airsim.roster.v1` as a campaign; a bare roster array is rejected on import; the legacy-removal list for F5B is in the handoff (D1).
- Both factions' shipped catalogs pass the no-deadlock proof, including the new Japanese mission (D3).
- `src/campaign/` imports nothing from `src/render`, three, or the DOM (depcruise proof).
- `npm run verify` green (via `remote-run`); no pre-existing test deleted without a named replacement in the handoff.
- The contract in C1-C7 is committed in `docs/campaign-data.md` and referenced from F5B/F6/F7/F8/F9/F10 in MASTER_PLAN.

## Stop conditions

- If Task 7 cannot credit tagged targets without changing sim stepping order or any existing golden trajectory, stop and report; do not widen a tolerance.
- If Mark changes any ruling D1-D16 after Task 3 freezes the schema, treat it as a version bump, not an edit.
- If the Zero cannot be flown as a player aircraft or the Japanese-side mission needs new AI or recovery work, stop Task 9 and report rather than skipping the `ja` assertion.
- Do not add a dependency (property-test library, name generator, schema tool).
- Do not touch the live title screen, debrief or dossier rendering; that is F5B.
