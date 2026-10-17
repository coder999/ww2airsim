# Campaign data, persistence and scoring

Standing reference for `src/campaign/` (plan F5A, written 2026-10-14). The types are authoritative
in code (`src/campaign/schema.ts`); the design history and the consumer table are the plan's
[Schema contract C1-C7](superpowers/plans/2026-10-14-f5a-campaign-data-scoring.md#schema-contract-frozen-at-the-end-of-task-3).
Player-facing rules are `GAMEPLAY.md`, "Planned Leyte campaigns"; this file does not restate them.
What the plan measured and what is still open is `handoff/2026-10-14-f5a-campaign-data-scoring.md`.

## Status of the contract

**Frozen at the end of Task 3 (2026-10-14); bumped to `schemaVersion` 2 by F5C (2026-10-16, "Legs" below).** A change to `schema.ts` shapes,
the `bankSortie` order, or `SCORING_RULES_VERSION` is a version bump with a migration and a note to
F5B, F6, F7, F8, F9 and F10. Nobody edits the shapes in place. Nothing was changed after the freeze;
the additions that follow it (`SortieReport`, `Result`, the `aircraft`/`loadout` fact keys) are new
exports, not edits to a persisted shape.

## Rules that are easy to break

- **Pure.** `src/campaign/` imports only itself, `src/sim/rng.ts`, `src/flightRecorder/canonical.ts`, zod and
  `content/campaign/`. No DOM, no `localStorage`, no clock, no `Math.random`. Enforced by
  `campaign-must-stay-pure` in `.dependency-cruiser.cjs` and an ESLint restriction; both are proven to
  bite in `tests/architecture/boundary.test.ts`. `src/sim` may not import `src/campaign`
  (`sim-must-not-import-campaign`). `src/render` may, and does (`debrief.ts` reads `SCORE_POINTS`).
- **Integers only, SI internally.** Points and counters are non-negative safe integers; altitude is metres,
  speed metres per second (D9). `bankSortie` rounds the sim's floats. Imperial is a display concern.
- **Derived, never stored:** pilot tier, adjusted score, command title, eligibility, mission locks.
- **Faction (`'us' | 'ja'`) is not sim `Side`.** A Japanese player flies axis-flagged aircraft.
- **Every state change is a reducer** that returns a new `Campaign` with `revision` + 1, or
  `{ ok: false, error, campaign }` carrying the SAME reference. Unchanged nested objects are shared with the
  input, so a caller must not mutate a campaign.
- **The old roster is not a campaign.** `ww2airsim.roster.v1` is never read as one (D1); `importCampaign`
  rejects a bare roster array with a message.
- **`SortieFacts` reserved keys.** `launchSortie` writes `aircraft` and `loadout` into `pending.facts` (the
  frozen `PendingSortie` has no field for either, and the log entry needs both). F6 and F7 hang their own keys
  beside them and must not reuse those two. F6B writes `sights` (boolean, `abilities(tier).sights` at launch).
- **F7A recovery boundary (2026-10-15).** The simulator resolves a bailout to `rescued`, `captured` or `killed`
  and the shell banks it through `session.bank` (`SORTIE_END_OF`, `src/render/campaignSession.ts`). **`bankSortie`
  already does the campaign half**: `captured` closes the pilot as `pow` and refills the roster in the same call,
  `rescued` keeps the pilot and counts a rescue (`tests/render/campaignBank.test.ts`, "after a bailout"). A bailout
  is never a success: the sim decides (`missionOutcome`), and `bankScored` forces `success` false for every end but
  `landed`. F7A writes no `SortieFacts` key and `src/campaign/` is untouched. The seed and the resolver evidence live
  in the debrief and the Dev flight record, not the campaign log (`LogEntry` has no field for them; persisting them
  would be a `schemaVersion` bump). The POW and replacement were already shown
  by F5B (`src/render/campaignBank.ts`, the archive's P.O.W. filter; verified 2026-10-16). F7B (2026-10-16) added the
  water-rescue raft and launch and the paratrooper drop primitive (`dropStick`, `World.drops`, `ParachutistEntity.kind`),
  and touched nothing here.
- **One closing transaction per sortie.** `bankSortie` is called exactly once per sortie and closes it; since F5C a
  landing at a friendly base first calls `bankLeg` (see "Legs"). A sortie left pending at load is an abandonment (D7),
  applied by `loadCampaign`; what its landings banked stays.

## Legs (F5C, 2026-10-16)

A **sortie** is launch to close; a **leg** is take-off to a full stop on a friendly airfield, carrier deck or anchorage
(`GAMEPLAY.md`, "The sortie, the stop and the recovery rule"). Decisions D1-D12 are in
[the plan](superpowers/plans/2026-10-16-f5c-multi-leg-sorties.md); this section is the data contract.

- **Schema version 2.** `SCHEMA_VERSION` is 2. A version-1 campaign or export is refused with an "older version"
  message and left untouched in storage; there is no migration (D12, as F5A did with the old roster). The index
  file keeps its own `INDEX_VERSION` 1 (its shape did not change), so an old campaign still lists and says why it cannot open.
- **`PendingSortie` gains `legs` and `banked`.** `legs[]` is `{ place, at, counts, pilotPoints, humanPoints }` per banked
  landing (`counts` cumulative at the landing). `banked` is the running total every later bank is measured against:
  cumulative `counts` and `flightSeconds`, the pieces `destruction`/`difficulty`/`completion`/`roster`, `pilotPoints`,
  `humanPoints`, and `qualified`. Invariant `pending-legs`: the pieces sum to `pilotPoints` and the legs sum to the totals.
- **`LogEntry` gains `legs: { place, points }[]`.** One entry per sortie (D10), written by the closing call; empty
  when the sortie banked only at its end. `counts`, `destruction`, `bonuses` and `points` are what the ledgers actually received.
- **`SortieReport` is cumulative for the sortie** (counts, flight seconds, maxima). Every bank takes the delta against `pending.banked`.
- **`bankLeg(c, LegReport, now)`** where `LegReport = SortieReport & { leg, place }`. Banks the delta (destruction points)
  to the pilot and commander ledgers, and the pilot's career (the landing, flight seconds, maxima). At the **first qualifying
  bank** (`success`, the sim's verdict, and `banked.qualified` still false) it also applies the badge, the difficulty and
  completion bonuses, the commander roster bonus and the chapter, once (D4). Keeps `pending` open. It does not touch
  `pilot.sorties`, `ledger.sorties`, `banked` counters, the log, the roster or the attempts. Refused with the same
  campaign reference: `leg` is not the next one (`leg-mismatch`, so a repeat banks nothing), a report that is not a
  landing, a destroyed friendly, counts that went down.
- **`bankSortie(c, SortieReport, now)`** is the closing call. It banks any remaining delta, applies the end kind, closure,
  replacement, the attempts (a failure or abandonment counts only if the sortie never qualified), the stats and the log
  entry, and clears `pending`. With no leg banked it is the whole sortie in one call.
- **What a close forfeits (D5).** `FORFEITING_ENDS` in `scoring.ts`: `abandoned` and any destroyed friendly forfeit
  the **unbanked** part only; banked stays banked. `killed`, `captured`, `ditched` and `rescued` bank their delta as before
  F5C (Mark ruled 2026-10-16, after the first F5C build had made a death forfeit it too); the single constant is the switch.
- **`resolveInterrupted`** is `bankSortie` with an abandon report: banked legs stay, the pilot is not killed (D11).
- **Where the shell calls them.** `session.bankLeg` at each friendly stop, `session.bank` (the close) at the end; see "The shell".

## World keys (F8A, 2026-10-16; F8B, 2026-10-17; F8C, 2026-10-17)

`Campaign.world` stays an opaque `Record<string, string>` to F5A; F8 owns the keys and values. **Key = a site id**
(`content/sites/<id>.json`), **value = a window id** from the one list in `content/campaign/site-windows.json`:
`pre-invasion`, `assault`, `buildup`, `endgame`, `j6-alternate` (the F3 section 5 columns). An absent key reads as
`pre-invasion` (`windowOf`, `src/sim/world/sites.ts`). Keys F8A writes: `tacloban`, `dulag`, `tanauan`; F8B writes `buri`, `bayug`,
`san-pablo`; F8C writes `ormoc`, `landing-beaches` and `jinamoc` (the San Pedro Bay anchorage), nine sites in all; a key a table does not
own is passed through untouched.

- **The table is `src/campaign/worldStates.ts`** (pure, in `src/campaign/`): `windowsForChapter(chapter)` is the window each F8A
  site is drawn in while that chapter is played (F3 sections 3 and 5, by date and hour; A1 launches before H-hour, so its
  fields are still Japanese), and `applyChapterSuccess(world, chapter)` is the `world` after the chapter succeeds, from F3
  section 4's "State transition" lines: A1 puts Tacloban and Dulag in `assault` and the landing beaches in `buildup` ("advances from assault to
  established beachhead"; no Burauen field, no Ormoc, no anchorage); A6 puts all nine sites in `endgame`; J6 puts all nine in `j6-alternate`; every
  other chapter changes nothing (J5 "captures no field by itself"). Three readings are recorded, not hidden: A1 plays the fields in `pre-invasion`
  and the beaches in `assault`, and J4 (3 Dec) plays in `buildup`.
- **A launch reads the stored world; a chapter's success writes it (F8C, Mark's ruling 2026-10-16).** `launchWindows(world, chapter)`
  (`src/campaign/worldStates.ts`) is the window each site is drawn in when a chapter launches: the stored `world[site]` when the key is present,
  the chapter's own window only for an absent key (a new campaign), unowned stored keys passed through; `null` (a flight with no chapter: Dev,
  Single Missions, Training) is `{}`. The shell asks `launchWindowsOf(session.current())` (`src/render/campaignSession.ts`) and hands the result
  to `loadScenarioBundle` unless DEV `?siteState=` is given. `applyChapterSuccess` is called by `credit()` in `src/campaign/bank.ts`, in the same
  `if` that appends the chapter to `progress.completed`, so the world moves at the first qualifying bank and at no other moment: not on a failed
  sortie, a loss, an abandon, a later leg or the close, and not for a chapter banked out of order. That is one added field in the object `credit()`
  already returned; `bankSortie`/`bankLeg` scoring, ledgers, attempts, roster and the call order are unchanged, and `schemaVersion` stays 2
  (`world` was already in the schema). Proof: `tests/campaign/worldRoundTrip.test.ts` (launch rule, chapter hook, save/load/export/import, pending
  sortie resolved at load) and `tests/flightRecorder/storedWorld.test.ts` (a flight launched from a stored window replays bit for bit and cannot be
  replayed against the chapter's own window). No shipped scenario names `sites` yet (F10 authors them), so the seam is proven with test scenarios.
- **A scenario draws a site by naming it:** `Scenario.sites: string[]`, expanded at bundle time by
  `expandScenario(scenario, sites, windows)` (`src/sim/world/sites.ts`; node loader `bundleForScenario`, browser loader
  `loadScenarioBundle`'s `siteWindows` argument). The window's side, `serviceable`, buildings with their states, stationary
  vehicles, parked aircraft and lights become ordinary scenario content before the world is built, so a scenario with no
  `sites` is byte-identical to before F8. DEV `?siteState=tacloban:buildup,dulag:assault` merges sites into any scenario.
- **`serviceable` is read, not just stored:** `isFriendlyAirfield` (`src/sim/friendly.ts`) needs the field to be held by the
  player's side AND serviceable, so a stop on an unserviceable field is no leg and no steering target; a `land` objective at
  one, or an AI `pilot.home` on one, fails at scenario load.
- **The Burauen fields (F8B):** `buri`, `bayug`, `san-pablo`. Their strips are the Army history's (*Leyte*, ch. VIII; San Pablo
  4,920 x 164 ft, Buri 5,000 ft east-west) fitted to the terrain, except **Bayug, whose runway is `content/bases/bayug.json`
  verbatim** (Convoy Strike lands there) and so sits 2.7 km west of its true position; each file's `reference.source` says which.
  Two readings are recorded, not hidden: San Pablo is `serviceable` in the `endgame` and not in the `j6-alternate` (F8 plan, F8B
  detail, ruling 3), and the chapter table plays J3 (3 Nov) in `buildup`, where Bayug is American although J3 recovers a Japanese
  pilot there; `content/campaign/mission-fit.json` reports that row as a finding (`expectFail`).
- **Sites without a strip (F8C):** `ormoc`, `landing-beaches`, `jinamoc`. A site file with `noStrip: true` becomes an `Airfield` record with
  `noStrip` (`src/sim/world/airfields.ts`): its `runway` is only the site's local frame (center and heading; 2 x 2 m), nothing lands on it, it
  draws no strip or huts and it is never a recovery field, steering target, `land` objective or AI home, whoever holds it. `serviceable` keeps
  its meaning as "usable for its job" (a port working, a beach in use, an anchorage open). A recovery at the anchorage is a `Scenario.anchorages`
  circle F10 declares; the site only supplies the coordinates. Waterfront buildings carry `seatM`, an absolute height above the sea, because the shipped
  terrain is coarse and the highest-footprint-corner rule would float a pier; `lcvp` and `usaaf-63ft-rescue-boat` carry `floats` (rest on the sea
  surface). `pby-mooring-buoy` is a placeable kind whose glb is an `equipment` model. Jinamoc has no field in `pre-invasion` (`built: false`).
  Each file's `reference.source` says how its frame was fitted to the shipped terrain.
- **The mission-fit table** (`content/campaign/mission-fit.json`, checked by `tests/sim/missionFit.test.ts`, arithmetic in
  `tools/sites/missionFit.ts`; run `npx tsx tools/sites/fitReport.ts`) is filled for all twelve rows (F8A A6; F8B J1, J3, J5, J6; F8C A1-A5, J2,
  J4, which add deck and afloat starts, fixed recovery points for the carrier traps and a night lamp check). A row checks the 420 s ceiling to the first action, F3's range where it gives one, the flight home to the nearest
  *legal* named recovery field (held by the player's side and serviceable in the window `windowsForChapter` plays that chapter in)
  against F3's recovery budget, and that every named field is legal. Every start or first-action point F3 does not locate is
  `invented` in its row.
- **What a site file holds and how to read it** is the schema in `src/sim/world/sites.ts`; every placement carries a
  `basis` (`sourced`, `inferred` or `invented`) and a `cite`, and `tests/sim/world/sites.test.ts` fails a `sourced` placement
  that cites nothing in its file's own `sources`. Do not restate a layout here; the files are the layout.

## Modules

| File | Owns |
| --- | --- |
| `schema.ts` | types, constants, the zod validators, the named invariants (`INVARIANTS`, `validateCampaign`), `SortieReport` |
| `ranks.ts` | `tierOf`, `commandTitleOf`, `rankLabel`, `abilities`, `adjustedScore` |
| `scoring.ts` | the difficulty bonuses, `rosterBonusOf`, `scoreSortie` |
| `names.ts` | seeded name draws over `content/campaign/names-{us,ja}.json` (sources in `ASSETS.md`) |
| `roster.ts` | `createCampaign`, entry-rank pilots |
| `eligibility.ts` | `MissionDescriptor`, `eligibility`, `missionLock`, `offers`, `lifeline`, `missionProblems`, the advanced-aircraft list |
| `catalog.ts` | `describeScenario` / `buildCatalog`: descriptors for the shipped non-campaign pool, from picker rows plus scenario facts |
| `bank.ts` | `launchSortie`, `bankSortie`, `resolveInterrupted` |
| `exchange.ts` | `exportCampaign`, `importCampaign`, `campaignFromJson` |
| `worldStates.ts` | F8: the site window ids and the chapter-to-windows table (`windowsForChapter`, `applyChapterSuccess`); see "World keys" |
| `storage.ts` | `saveCampaign`, `loadCampaign`, `listCampaigns`, `deleteCampaign`, the profile, over an injected `StoragePort` |

## Scenes (F9, 2026-10-17)

An opening or victory scene is **the first N seconds of a mission's own scenario**, played before the flight (openings, 10-20 s) or before Headquarters shows the campaign won
(victory, 45-60 s). Plan: `superpowers/plans/2026-10-17-f9-campaign-scenes.md`; what is built and what is not: `handoff/2026-10-17-f9-scenes.md`.

| File | Owns |
| --- | --- |
| `content/scenes/<id>.json` | the scene: `id`, `chapter` (`A1`-`A6`, `J1`-`J6`), `kind` (`opening`\|`victory`), `durationS`, `world` (`{source:'mission', scenario}`, a union so later sources need no format change), `camera` keys, `cues`, `handoff.player` (`held`\|`ai`) |
| `src/sim/scene/schema.ts` | the zod-strict schema. Camera keys are position, yaw, pitch, `ease` (no roll, no FOV: Mark, 2026-10-17, scenes never use the cockpit or HUD view) |
| `src/sim/scene/camera.ts` | `sceneAt(scene, t)`: position lerp, yaw the short way round, pitch lerp, clamped to the first and last key. The ease belongs to the segment that ENDS at a key |
| `src/sim/scene/cues.ts` | `checkScene` (an `order` naming a missing entity, or a `spawn` naming a missing held group, throws at load, not in flight) and `applyDueCues`, applied at the tick boundary before the step |
| `src/sim/scene/preroll.ts` | `beginPreroll` / `stepPreroll` / `handoffPreroll` / `skipScene`. The mission is set aside while it runs (clock, objectives and radio are inert); `held` is brakes on, `ai` is `holdLevelFlight` at the start altitude. At handoff the mission returns with `clockOriginTick` = the handoff tick, so a trigger `{at: s}` counts from there |
| `src/sim/scene/keyframes.ts` | the pure edit model director mode uses (`dropKey`, `deleteKey`, `recordPath`) |
| `src/render/sceneFlow.ts` | `loadScene` (a missing or invalid scene is `null`, never an error), playback by real time, `skipPlayback`, `sceneView` |
| `src/render/director.ts` | director mode's bar and pure model |
| `src/campaign/scenes.ts` | `markSceneSeen` (idempotent, `revision + 1`, nothing else changes, no schema bump) and the scene ids: `a1-opening`..`j6-opening`, `a6-victory`, `j6-victory` |

**Cues** (`t` seconds from the start): `message` (the subtitle; the voice plays only when `RADIO_LINES` maps that exact text to a recorded stem, otherwise it is text-only),
`order` (`{attack: id|null}` for an aircraft pilot, `{course:{waypoints,speedMps}}` for a ship or vehicle, `{fireAt:[ids]}` for a ship), `fx` (renderer only; no shipped renderer hook yet) and
`spawn` (releases a held group). Every cue goes through existing sim primitives and is deterministic.

**Skip equals completion.** Live playback and skip both finish through `stepPreroll`, so they end in the same world (`tests/render/sceneFlow.test.ts` compares `worldChecksum` for live, mid-way skip and a
straight skip) and write the same `scenesSeen`. A scene writes nothing else.

**Flow (`main.ts`).** An opening plays after Launch for a scored chapter sortie whose opening is not in `scenesSeen`, on the launched world, and only when the scene's `world.scenario` is the launched scenario.
The flight (and the Dev recorder) starts at handoff. The victory scene plays after the final debrief, so after banking, when `progress.victory` is true and it is unseen: on the way out of the
debrief, before Headquarters. HQ has Watch opening (current chapter) and Watch epilogue (once won); a watch writes nothing. Esc, Enter or Space skips.

**Dev.** `?scenario=<scene's scenario>&launch&scene=<id>` plays a scene (nothing is written). `?scenario=<...>&launch&director=<id>` opens director mode: the scene's world held, a free camera (WASD, Q/E, drag,
wheel dollies 500 ft a notch along the view), a key bar to drop and delete keys, drag a key along the timeline (it stops a label-width short of its neighbors), scrub, preview, record a
flown path, and Save timeline JSON (downloads `<id>.json` and copies it to the clipboard; nothing writes into `content/`, so commit it). Drag is grab-and-drag: the world point under the pointer when the drag starts stays under it, 1:1 (`src/render/grabLook.ts`). Save frame JSON downloads and copies a snapshot of the screen (scene, time, camera, build, time of day) whose `url` reopens it: director mode takes `&t=<s>&eye=x,y,z,yawDeg,pitchDeg`. Save timeline JSON is the scene's keys and cues only, not the frame.
Esc opens the director sheet (a pause-style overlay) on its Director controls tab and M on its Map tab; right click on the map puts the camera over that point at its current height.
The world follows
the bar: forward at up to 120 ticks a frame, restarted from the top when the bar goes back, so a long scrub re-simulates.

## Chapter missions (F10-0, 2026-10-17)

Plan: `superpowers/plans/2026-10-17-f10-campaign-missions-master.md`. The twelve chapters are built by five batches (F10A-E) on
what F10-0 added; this is the contract they share.

**The registry.** `content/campaign/chapter-missions.json` has one entry per chapter, all empty until its batch fills it:
`scenario` (the scenario file's id, a slug of the title), `badge`, `start`, `aircraft` (the chapter's OWN list, the authored
airplane first: Decision 11; J6 offers two), `recommendedLoadout`, `coordinated` (authored, not derived), `authoredBonus` (A4:
2500). `src/campaign/chapterMissions.ts` reads it. **A chapter is enrolled only when its entry is complete AND its scenario file
loads**: otherwise it has no descriptor, no picker row and no Headquarters mission, so a half-built chapter cannot reach a player or
crash the shell (`buildShellCatalog`; a test). An enrolled chapter is a `kind: 'campaign'` descriptor and a picker row in the new
`campaign` pool (`SCENARIO_OPTIONS` derives them, between the pooled rows and the Dev fixtures), and is never also in
Single Missions. The minimum rank comes from `chapters.json` through the rank table (`chapterMinTier`).

**The mission vocabulary** (`src/sim/mission/schema.ts`; evaluated in `step.ts`; every addition is optional, so every existing
scenario plays as before): objective kinds `arrive` (AI entities reach a zone, remembered), `released` (AI aircraft have released a
store, read from their combat records), `preventRelease` (F10E: at least n of the named aircraft were destroyed before their record shows a release; fails once n is out of reach), `damage` (a ship below a fraction of its hull, or sunk), `atLeast` (n of earlier objectives:
any/all), and `field` (airfield state; with `keep` it is a standing order); on any objective `until` (a window: a `protect` or `deny`
completes when it closes, anything else fails) and on `destroy` `fresh` (count only kills after the objective woke up); `state` gains
`headingDeg`, `groundSpeedMps`, `dwellS` (a continuous match, a break zeroes it) and `failOnExit` (a corridor); `hold` gains
`resetOnExit` and `relativeTo` (the station follows a group's centroid); a station may be an annulus (`innerRadiusM`); trigger
`when.gone` (named entities destroyed, on the ground, or beyond a radius; an unspawned held entity has not left) and `then`
`complete`, `fail`, `setServiceable`, `setSide`; `land.requires` (a landing counts only while named fields are (un)serviceable).

**Airfield state is mutable** (`src/sim/mission/fields.ts`): a trigger's `setServiceable` / `setSide` and a scenario's `fieldRules`
(serviceable while a fraction of the field's own structures live) override the content's value. The recovery rule (`friendlyBaseAt`),
`land.requires` and the `field` objective all read it through `fieldState`; a mission with none of these reads the content. Known
limit: the AI's home and steering choices still read the content's value, not the mission's.

**Egress** (Decision 9): a scenario's `recovery: { kind: 'egress', objective }` names a `reach` objective; completing it with every
primary done is the recovery and earns the badge (`recoveryOf` returns `egressed`), and a landing at a friendly base is NOT a success
there. The shell ends the sortie when the player crosses (`egressModel`, banked as a landing's outcome with no touchdown; no Continue).

**Continue Sortie** (Decision 13): a scenario that sets `freezeOnSuccess` freezes its script at the landing that completes it
(`MissionState.latched`: no objective, trigger, spawn, respot or pass changes; landings are still logged), so Continue is a free
sortie. A landing that does not qualify leaves the script running. Every chapter sets it (an egress chapter ends at its gate).

**Population** (`population: { airborne, ships, close? }`): checked at load against the start entities plus the heaviest set of held
groups that can coexist; a group spawned by another's `when.gone` never overlaps it. The close set is the aircraft tagged `close`.

**Scoring fix:** a downed transport AIRCRAFT (the Ki-57) credits the bomber row, 750, not the merchant `transport` row, 500
(`aircraftTargetType`). The Ki-57 also has an unarmed `combat` block now; before it, a hit did nothing.

**The airdrop pipeline (F10D, 2026-10-17; J5, and J6 builds on it).** A transport drops a stick of `CARGO_DROP` = six squad rigs and two supply bundles (`dropStick`, `cargoStick`), each carrying the
envelope it left in (`ParachutistEntity.release`: air and ground speed, altitude, heading). The player's drop is the `Y` key: `requestDrop` (fully open doors, a transport, not already dropped), recorded as a
`drop` flight-record action (additive, version 1; see `docs/flight-recorder.md`). An AI transport drops with `ingress: { attack: 'airdrop', dropAt: {x, z, radiusM} }`: the doors open
`AIRDROP_DOOR_LEAD_M` before the circle and the whole stick leaves the first tick it is inside with the doors fully open (derived in `advance`, so it replays with no action). It is not one of E2's
attack runs (`attack.ts` never sees it); the route's last legs are its egress. Objectives: `drop { targets, count?, zone, corridor?, minLanded? }` counts a transport whose men released inside the
`corridor` (speed, altitude, heading) and at least `minLanded` (default 3) came down ALIVE on land inside `zone` (`src/sim/mission/airdrop.ts`); `bundles { targets, zone, min }` counts landed bundles.
Limits: the AI's safety floor (300 m above the ground plus a buffer) puts an AI drop about 400 m up, a stick released under 75 m above the ground is lost (`lowAltitude`), rigs persist for the sortie
and the pooled view draws at most 24 men and 8 bundles. **A valid release** (J4): `release { store, targets, withinM, window }` judges each new release once, where and when it left (range to any
named ship, the mission clock window, a torpedo's own drop envelope `torpedoDropOk`), and only releases after the objective woke up count; the window closing unmet fails it.
**Scheduled lights are on the mission clock** (`docs/night.md`).

**Proof:** `tests/campaign/chapterMatrix.test.ts` runs the nine generic paths (success, normal failure, abandon, KIA, POW, bailout,
discharge, restart, retry) for every chapter, against a fixture descriptor now and the real one once authored. A fit row in
`mission-fit.json` may name a `scenario`; it must then start where that scenario starts (`linkProblem`).

## The shell (F5B, 2026-10-15)

`src/render/campaignSession.ts` is the only code that touches storage and the reducers. It owns the
open campaign, `launchSortie` before takeoff (the pending sortie is persisted so a reload resumes as
interrupted), `bankLeg` once per landing and `bankSortie` once per sortie (two latches, F5C), abandon-as-lost, the stale-revision guard
and the purge of the legacy roster key. `campaignBank.ts` turns a finished sortie into the debrief's
Campaign Ledger. `src/render/hq/` is the UI: `model.ts` (screen state), `launchRules.ts` (what a row,
pilot and aircraft allow), `missionAircraft.ts` (reads `content/campaign/mission-aircraft.json`),
`chapters.ts` (reads `content/campaign/chapters.json`).
**Unscored rule:** Training, Single and any Dev override never call `launchSortie` (`unscoredReason`).
**F6/F7 seam:** a new NON-CAMPAIGN mission is a picker row plus its aircraft in `mission-aircraft.json`;
`tests/render/hq/missionAircraft.test.ts` fails if any offered aircraft is refused by `eligibility`. A CHAPTER is not wired
that way: see "Chapter missions" below (a stale version of this line said a chapter was a row in `chapters.json`; that file
is only titles, dates and the minimum rank, and the catalog never read a chapter from it). Nothing in `src/campaign/`
changed for F5B.

## How the sim feeds it

`AircraftCombat.tagged` and `tagCredits` (`src/sim/weapons/combat.ts`) are the sim half of destruction credit.
The shell builds `SortieReport.counts` from the player's `tagCredits`, `friendlyDestroyed` from
`friendlyKills > 0` (`friendlyDestroyedBy`, `src/render/discharge.ts`) and `warnings` from `friendlyFire !== null`.
Credit is at the destruction moment; for a ship that is the bottom of its 90 s sinking (ruling D15), so a sortie
that ends inside the window credits nothing for that hull and a friendly hull destroyed inside it does not
discharge. Both are pinned by `tests/sim/weapons/destructionTags.test.ts`. `AircraftCombat.killsByType` keeps its
last-blow rule beside the tags until F5B retires it.

Landing craft enter as a **vehicle** `targetType` (`landing-craft`), because F4 put the LCVP under
`content/vehicles/`. There is no landing-craft ship role; an F10 plan that authors them as hulls adds one.

## The non-campaign pool

`ScenarioOption.pool` (`src/render/titleScreen.ts`) is `noncampaign`, `training` or `single` (ruling D2). Only
`noncampaign`, non-dev rows become descriptors. The authored player airplane of a scenario is never an "enemy
airplane" for the Dev rule (`SortieFacts.authored`, `eligibleAircraft`'s fourth argument), which is what lets the
Japanese **Field Patrol** (`content/scenarios/field-patrol.json`) launch without Dev.

## Proof, and what it does not cover

`tests/campaign/noDeadlock.test.ts` is the acceptance gate: a static per-faction check, an exhaustive model check
(2 factions x 7 chapter positions x 252 tier multisets = 3,528 states, against the shipped and the planned
catalog), and 200 seeds x 400 steps of random play, each with a mutation check that turns it red. It proves the
reducers and the catalog. It does not prove a UI can show the lifeline; that is F5B's headquarters test.
