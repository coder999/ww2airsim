# Missions: objectives, triggers, four missions, and the Leyte campaign outline — design

**Status: approved in conversation with Mark, 2026-09-25; this written spec is
for his review.** It is the next slice of Plan 9 (meta-game, master spec §15).
GAMEPLAY.md owns *what* the player experiences (scoring, ranks, badges, the
eight named missions); this spec owns *how* missions are built and run. It
changes none of GAMEPLAY.md's numbers.

What exists today (verified 2026-09-25 by reading the code): scoring,
ranks, the roster (`src/render/roster.ts`, badges are a `string[]` nothing
ever writes), persistence, the landing debrief and banking (`src/render/
debrief.ts`, `bankMissionResult` in `src/render/main.ts`). No scenario declares
an objective (`src/sim/scenario.ts`'s schema comment says objectives "belong
to the plans that consume them" — this is that plan), so no badge is earnable.

## 0. Mark's decisions (2026-09-25)

1. **Individual missions now; a campaign/career arc later.** This spec builds
   the mission engine and four missions, and outlines the campaign as content
   for a later plan (§6).
2. **Engine placement: sim-side.** Objectives and triggers are pure,
   deterministic code in `src/sim/mission/`, stepped with the world clock;
   the render side only displays.
3. **Mission shape: objectives + simple triggers.** No scripting language,
   no branching, no variables.
4. **First missions:** Deck Quals (real), Airfield Strike, Convoy Strike,
   Combat Air Patrol. Convoy and CAP may later move into the campaign.
5. **Badge rule: only a LANDING earns the mission badge.** Ditching (and a
   future bail-out/parachute) means the pilot survives and banks points at
   the reduced multiplier toward promotion, but earns no badge.
6. **Failure is announced, not enforced** (except death). The pilot can still
   fly home and bank points.
7. **Campaign: Leyte Gulf, October 1944**, with historical background content
   from public-domain sources only (§6.3). Battles that happened outside the
   map are **staged inside it**, with the historical note saying plainly where
   they really happened.
8. **No database.** Missions are schema-validated JSON content in git (§7).
9. `hold` counts **accumulated** time inside the station (Claude's default,
   stated to Mark and not objected to).

## 1. Architecture

```
content/scenarios/<id>.json ──parse──▶ Scenario (+ objectives, triggers, heldGroups, tags)
                                          │
worldFromScenario ─▶ World { …, mission: MissionState }
                                          │ every tick, after combat resolves
advance ─▶ stepMission(world, ctx) ─▶ MissionState' + spawn requests
                                          │
render: briefing (title memo) · objective line · radio line · chart · debrief · roster badge
```

- **`src/sim/mission/`** (new, pure; obeys `.dependency-cruiser.cjs`):
  `schema.ts` (zod objects for objectives/triggers/held groups),
  `state.ts` (`MissionState`: per-objective status and counters, fired
  trigger ids, message queue, outcome), `step.ts` (`stepMission`),
  `outcome.ts` (the success/failure/badge rules of §2.4).
- **`World.mission`** is `null` for a scenario with no objectives. A
  scenario without objectives must be **bit-identical to today** (golden and
  trajectory tests unchanged); this is an acceptance gate, not a hope.
- **Recovery moves into the sim.** `src/render/landing.ts` already imports
  only `src/sim/` modules; its pure core (`Touchdown`, `LandingReport`, the
  tracker) moves to `src/sim/landing.ts` so the mission engine and the
  debrief read ONE recovery signal. `LandingReport.at` (`airfield`/`carrier`
  + name, or `null` off-field) is what `land` objectives and the badge rule
  read. A Tier 1 test pins that the render banking path and the mission
  outcome agree on every recovery kind.
- **Held groups enter mid-flight.** `createWorldOf` rejects any entity not at
  tick 0 (`src/sim/loop.ts`, verified 2026-09-25). This spec adds one
  insertion path, `spawnHeldGroup(world, groupId)`, which builds the group's
  entities exactly as `worldFromScenario` would and stamps their
  `state.tick` to the world tick. It is the only way an entity appears after
  tick 0. Pilot initialization at tick > 0 is Lane A's (7e §4.5: first
  rescore at spawn, id-seeded noise cursor).

## 2. Vocabulary

### 2.1 Objectives

Every objective has `id`, `label` (short, for the HUD and debrief),
`priority: 'primary' | 'secondary'`, and optional `after: <objective id>`
(it becomes active only once that one completes).

| Kind | Fields | Completes when | Fails when |
| --- | --- | --- | --- |
| `destroy` | `targets` (entity ids and/or group tags), `count` (default: all) | `count` of the set are destroyed | never (it stays incomplete) |
| `protect` | `targets`, `maxLost` (default 0) | the mission ends with ≤ `maxLost` lost | the moment losses exceed `maxLost` |
| `deny` | `hostiles` (ids/tags), `around` (entity id or point), `radiusM` | the mission ends with none having entered | any hostile enters the radius |
| `takeoff` | `from` (airfield or ship id) | player airborne after starting on it | never |
| `land` | `at` (airfield or ship id), `count` (default 1) | `count` recoveries at it (a `LandingReport` whose `at` names it) | never |
| `reach` | `point` `{x, z}`, `radiusM`, optional `altitudeM: [min, max]` | player inside | never |
| `hold` | a `reach`-shaped station, `seconds` | accumulated time inside ≥ `seconds` | never |

Group tags are strings on scenario entities (`"tags": ["convoy"]`) and on
airfield structures (by base content, e.g. `dulag-hangars`, `dulag-aaa`).
A tag that matches nothing is a **parse error**, not a silent empty set.

### 2.2 Triggers

`{ id, when, then }`, each fires **once**:

- `when`: `{ at: <seconds> }` (mission time) · `{ completed: <objective id> }` ·
  `{ failed: <objective id> }` · `{ enters: { point, radiusM, altitudeM? } }` (the
  player).
- `then`: a list of `{ spawn: <held group id> }` and/or `{ message: <text> }`.

Triggers are evaluated after objectives in the same tick, in file order, so
two runs of the same inputs produce identical logs (Tier 1 asserts this).

### 2.3 Held groups

`heldGroups: [{ id, aircraft?: [...], ships?: [...] }]` — entities with the
same schema as the scenario's own lists, not placed at start. Their ids are
unique across the whole scenario (parse error otherwise) so objectives can
name them before they exist; a `destroy` target in an unspawned group simply
counts as not destroyed.

### 2.4 Outcome

- **Success:** every primary objective is complete **and** the pilot's flight
  ends in a `LandingReport` with non-null `at`. That landing **awards the
  badge** (the scenario's `badge: { id, name }`) and records it in the roster.
- **Ditched** (or a future bail-out): the pilot survives, points bank at
  GAMEPLAY.md's multiplier, **no badge**, and the debrief says why.
- **Failure:** a `protect` or `deny` objective fails. A radio message
  announces it; the flight continues so the pilot can fly home and bank
  points; the badge is no longer possible and the debrief says why.
- **Killed:** unchanged from today.
- Secondary objectives appear in the debrief and never gate the badge.

**Intermediate landings.** A landing that advances an incomplete `land`
objective (Deck Quals' traps 1 and 2) shows a radio line ("Trap 1 of 3")
instead of the full landing debrief, and the flight continues without a
pause. Any other landing behaves as today (debrief, bank, Continue), with an
objectives block added.

## 3. Mission flow and UI

All of it reuses the Naval Communications visual language
(`2026-09-24-naval-comms-ui-design.md`, `ui/naval-comms.css`) and existing
screens; no new screen.

- **Title screen, orders memo** (`src/render/titleScreen.ts`): the scenario
  picker splits into **Missions** (scenarios with objectives) and **Ranges**
  (today's `free-flight`, `gunnery-range`, `pursuit-range`, `strike-range`,
  kept for practice). A mission the selected pilot already holds the badge
  for carries a small `.stamp`. Selecting a mission shows its **briefing**:
  situation paragraph, a short historical-context paragraph (§6.3's rules
  apply), the objective list marked primary/secondary, time of day and
  weather, and a recommended loadout, preselected but still changeable.
- **In flight:**
  - **Objective line**: the current primary objective, compact
    (`CONVOY 1/3 · RECOVER`), placed beside the top-center combat readout.
    Pure label function plus thin DOM, the `paddlesBadge.ts` pattern, so the
    Node suite asserts the text.
  - **Radio line**: trigger messages and mission announcements, a few seconds
    each, queued. Same pattern; it must not collide with the Paddles cue
    (low center) or the pause badge.
  - **Mission chart (`P`, Plan 14)**: lists every objective with its status,
    and marks objective targets and stations; an objective target is
    clickable for a course and heading like any other entity.
- **Debrief** (`src/render/debrief.ts`): an objectives block — each objective
  stamped complete/incomplete/failed — then **BADGE AWARDED**, or the reason
  it was not ("Ditched — no badge", "Carrier lost"). Points, multiplier and
  promotion unchanged.

**Out of scope:** time limits, checkpoints and retries, voice audio, a
mission editor, a campaign (§6 is an outline only), multiplayer.

## 4. The four missions

Each is a new `content/scenarios/<id>.json`; the existing range scenarios
are unchanged. Opponents are Hellcats (rendered as Wildcats) until Lane B's
Zero lands, then re-pointed at `a6m-zero` by a content edit.

1. **Deck Quals** (`deck-quals-mission`, training). From the Essex:
   `takeoff` from `cv-1` → `reach` a downwind gate abeam the carrier →
   `land` at `cv-1` × 3. Secondary: no wave-offs (counted from the Paddles
   `wave-off` cue in `src/sim/paddles.ts`; the plan confirms that signal is
   edge-countable before relying on it). Radio: Paddles' "Trap n of 3". Badge "Carrier
   Qualified". The existing `deck-quals` stays as a range.
2. **Airfield Strike** (`airfield-strike`). Launch from Tacloban, strike
   Dulag. Primary `destroy` `dulag-hangars`; secondary `destroy` `dulag-aaa`.
   Dulag gains AAA emplacements as **gameplay content, labeled as such** in
   the base file (the same standing as Tacloban's `tacloban-aaa-1`). An
   `enters` trigger over Dulag spawns a pair of defending fighters (7a/7b
   pursuit pilots at `green`). Recover.
3. **Convoy Strike** (`convoy-strike`). Three `type-b-maru` and a
   `fletcher-dd` escort sailing a water-verified route (Plan 12's
   `assertLoopOverWater`) in the Camotes Sea west of Leyte. Primary `destroy`
   2 of `convoy`; secondary all 3. Strike loadout. Recover.
4. **Combat Air Patrol** (`combat-air-patrol`). `hold` a station over the
   Essex for 180 s, then `destroy` `raid`. Two held raider waves spawn at 60 s
   and 240 s and fly an ingress route toward the carrier; `deny` fails if any
   `raid` aircraft comes within 5 km of `cv-1`. **Depends on Lane A's 7e
   ingress pilot** (`pilot.ingress`, AI 7c spec §4.5), so this mission ships
   last; the other three do not wait for it.

All four set `badge`, `briefing` and `history` fields (§6.3). Numbers above
(counts, radii, times) are starting values the implementation tunes by
headless measurement, and each tuned value carries a dated comment.

## 5. Testing (Mark is kept out of the loop)

**Tier 1 (`npm run verify`):**
- Every scenario file parses; every tag and objective reference resolves.
- One unit test per objective kind and trigger condition, including `after`
  ordering, `deny`, accumulated `hold`, and held-group references before
  spawn.
- Triggers fire exactly once; two runs of identical inputs yield identical
  mission logs.
- A scenario without objectives is bit-identical to today (existing golden
  and trajectory tests, unchanged).
- Outcome rules: badge only on a landing at a named base; ditching banks
  points at the reduced multiplier and awards nothing; `protect`/`deny`
  failure announced and non-terminal; death terminal.
- The render banking path and the mission outcome agree for every recovery
  kind (the one-signal test from §1).
- Roster round-trip with badges.
- **Headless mission runs**: each mission played to success by a scripted
  player (Deck Quals via the existing approach autopilot; strike missions
  from staged state where scripting a full flight is impractical: targets
  destroyed by injected hits, then a scripted landing), and each mission to
  a scripted failure.

**Tier 2 (reference GPU, run only when the photoreal session is not taking
budget measurements, or on the `ww2airsim-2`/`-3` slots):** one spec per
mission — loads it, the briefing renders, the objective line updates, a
trigger's radio message appears, the debrief shows objective stamps.

**Content checks:** every historical image/map referenced by any content has
an `ASSETS.md` row with a public-domain basis and archive id; every
historical note carries at least one citation (§6.3).

## 6. The Leyte Gulf campaign — outline for a later plan

### 6.1 Mechanics (to be designed in its own spec)

A per-pilot campaign record (current day, missions flown); each day unlocks
one or two missions and opens with a **historical note** memo; a
**Background** reading room on the title screen collects notes read so far;
death uses the existing resurrection rule. **Airfield ownership changes by
day**: Tacloban and Dulag were Japanese fields until captured on 20-21
October; Army P-38s arrived at Tacloban on 27 October. Early days therefore
fly from the carriers, and Tacloban becomes home later.

### 6.2 Days (facts to be verified against §6.3's sources when written)

| Day | Historical event | Mission | Needs |
| --- | --- | --- | --- |
| 18-19 Oct | Pre-invasion strikes on Leyte's airfields | Airfield Strike, Dulag and Tacloban hostile | per-day airfield ownership |
| 20 Oct (A-Day) | Landings at Tacloban-Palo and Dulag | CAP over the transports | transports (Lane C), 7e ingress |
| 23-24 Oct | Japanese reinforcement convoys | Convoy Strike | — |
| 24 Oct | Sibuyan Sea: *Musashi* sunk | Capital-ship strike | battleship model (Lane C: `musashi-bb` candidate), torpedoes (deferred; needs a torpedo airframe) |
| 25 Oct | Off Samar: Taffy 3 vs Kurita's Center Force | Defend the escort carriers; strike battleships | Casablanca CVE, battleships, cruisers (Lane C), 7e |
| 25 Oct | First organized kamikaze attacks (*St. Lo*) | Kamikaze Watch | an AI dive-attack behavior (not in any lane yet) |
| 25 Oct | Cape Engaño vs Ozawa's decoy carriers | Flattop Hunt | Japanese carrier model (Lane C search) |
| 26 Oct | Strikes on the retreating Center Force | Pursuit strike | — |

**Geography rule (Mark, 2026-09-25): stage it.** The world is a 200 km box
around Leyte; the Sibuyan Sea, much of the Samar action and Cape Engaño lie
outside it. Those days are staged inside the box, and the historical note
states where the battle actually happened. Nothing on screen claims a
location it does not have.

### 6.3 Historical content: public domain only

- **Sources:** works of the US federal government (17 U.S.C. §105): US Navy
  and Army Signal Corps photographs (NHHC, NARA), the US Army official
  history *Leyte: The Return to the Philippines* (M. Hamlin Cannon, 1954)
  including its maps, official action reports and war diaries. Wikimedia
  Commons only where the file's basis is that federal-work one, checked per
  file; "PD in Japan" and other non-US bases are excluded by default.
- **Not usable for reproduction:** Morison's *History of U.S. Naval
  Operations* and most popular histories remain in copyright — fine for
  checking facts, never quoted or reproduced.
- **Text** is original prose written for the game; short PD quotations are
  allowed with attribution. Each note cites its sources in the content
  file. Each mission states honestly when it is *inspired by* events rather
  than a reconstruction (for example, this repo's Tacloban and Dulag are
  flown from as friendly fields in missions set on dates they were still
  Japanese).
- **Assets** get `ASSETS.md` rows: source URL, archive/catalog id, PD basis,
  fetch date — the same discipline as the model candidates.
- The four missions of §4 ship with their short historical-context
  paragraphs under these rules now; the campaign reuses the same format.

## 7. Why no database

Mission content lives in git as schema-validated JSON: it versions with the
engine that interprets it, reviews as a diff, and is covered by the Tier 1
runs above. The game is a static site with no backend; a database (MariaDB
or otherwise) would add an API server, auth, a container, backups and a
deploy path — the coupling GAMEPLAY.md's Persistence section already
declined. Pilot records stay per-browser with JSON export/import. **If** a
database is ever warranted — cross-device pilot sync, leaderboards, missions
authored in a UI — it would hold pilot records, not mission content, and the
existing identity database is the natural anchor. Not in scope.

## 8. Ownership and cross-lane boundaries

| This spec owns | Others own |
| --- | --- |
| `src/sim/mission/`, `src/sim/landing.ts` (moved), `scenario.objectives/triggers/heldGroups/badge/briefing/history`, entity and structure group `tags`, `spawnHeldGroup` | **Lane A (AI 7c-7g):** `side`, kill-credit rules, every `pilot` field including `pilot.ingress`; pilot init at tick > 0 |
| New mission scenario files; Dulag AAA content | **Lane B (A6M Zero):** aircraft specs and models; missions re-point opponents by content edit |
| Objective line, radio line, briefing, debrief objectives block, roster badge write | **Lane C (ships):** ship models; missions only reference ship specs |
| | **Photoreal session:** nothing here touches the render pipeline, clouds, sky, ocean or terrain shading |

Whichever of this plan and Lane A's 7e implements second rebases onto the
other's `scenario.ts` change. `pursuit-range.json`'s skill is untouched here
(the shoot-down spike of 2026-09-25 may recommend changing it; that is its
own decision).

## 9. Suggested decomposition for the implementation plan

1. **M1 — engine:** schema, state, step, outcome, `spawnHeldGroup`, recovery
   moved to the sim; Tier 1 only; bit-identity gate.
2. **M2 — UI:** briefing, objective line, radio line, chart integration,
   debrief block, roster badge.
3. **M3 — missions:** Deck Quals, Airfield Strike, Convoy Strike with their
   headless runs and Tier 2 specs; historical paragraphs.
4. **M4 — Combat Air Patrol:** after Lane A's 7e ships.

## 10. Open for Mark

None. Every decision this spec needed was taken in conversation on
2026-09-25 (§0). The campaign (§6) gets its own spec and its own questions
when it is picked up.
