# F6B night visibility, AI perception and rank-gated sights: plan (2026-10-15)

**Date:** 2026-10-15
**Branch/worktree:** `plan-f6b-perception` / `/home/mark/projects/ww2airsim-plan-f6b-perception` (from `main` at `d477d854`)
**Plan 10 of 22** in the F3 dependency table. Follows F6A (merged 2026-10-15), whose light contract is frozen at `LIGHT_CONTRACT_VERSION = 1`.
**Status:** plan only; every section 12 recommendation accepted by Mark 2026-10-15 (revision 2). Nothing is implemented.

> **PROMINENT, player-facing change (Mark 2026-10-15): the `U` impact marker, which every pilot has today, is removed for pilots below Lieutenant Commander in campaign and single-mission sorties.** Dev and every Training Ground row (including the Basic Flying tutorial, `pool: 'training'` in the picker, which teaches `U`) keep it. State this in the release notes, GAMEPLAY.md, the legend and the tutorial radio line (Task 8).

**Global rulings that apply (Mark 2026-10-15):** Dev uses the SAME UI as production (headquarters/picker); the Dev checkbox unlocks dev features inside it. F5B merges first and provides `CampaignLaunch{pilotId, tier, facts}`; F6B adds `sights` there.
**Merge order (coordinator):** F5B merges first (it rewrites `startGame`/title/debrief and deletes `src/render/roster.ts`), F7A second or third; F6B rebases onto both. Section 10 lists every collision.
**Run mode:** attended (Mark, 2026-10-15). Stop at each checkpoint, post the captures (headless unless the coordinator opens a Dev slot), and wait for him.
**Viewing checkpoints (Mark, 2026-10-15): intermediate steps plus the final result.**
- **CP1, after Task 7:** blackout is real. A Dev night patrol: fly toward an enemy Zero with position lights on, then blacked out (`N`), and see (a) it notices you from miles away versus a few hundred yards, (b) a flare or searchlight lighting you up makes you visible again. A DEV readout shows each enemy's current "sees you out to X mi".
- **CP2, after Task 11:** the bombsight and the torpedosight on the night test beds (night range, night bay), both visible at night, rank gate shown on and off.
- **CP3, final (Task 14):** representative J4-style (torpedo run amid ships) and J5-style (dusk field) scenes with every aid and the blackout behavior, plus the budget and accessibility numbers.
- Mark's viewing is a checkpoint, never a test gate (AGENTS.md). Every pass or fail below is decided by the automated tiers.

## 1. Goal

Make darkness matter, and give senior pilots their instruments. Four things:

1. **Blackout is real.** At night, an aircraft running position lights is seen by enemy AI from far away; blacked out, it is seen only from close range. Today the lights switch (`N`) is a render-only toggle with no effect on anything the AI does.
2. **One visibility number per (observer, target)**, cheap (O(contacts), never O(lights x contacts)), from the target's own lights, the ambient night, and any local light on it (flare, searchlight). Documented, tunable.
3. **Bombsight and torpedosight (Lieutenant Commander and above).** Information aids only. The bombsight marks where a bomb released now would land; the torpedosight shows a green or red "valid drop" cue plus the water-entry point. No change to weapon physics or dispersion; the aids call the sim's own prediction code.
4. **The rank gate reaches the game as a sortie fact** (`abilities(tier).sights`), never by `src/sim` reading Campaign. Dev overrides it.

Out of scope: base light layouts (F8), scene framework (F9), per-airframe landing lights (F6A D7: none installed), enemy gunner (turret) perception, AI search behavior after losing a target, the Campaign schema (F5A, frozen).

## 2. Scoping findings (read from this worktree, 2026-10-15)

### 2.1 What exists

| # | Finding | Evidence |
| --- | --- | --- |
| S1 | The lights switch has no effect outside the renderer. `N` flips a local `let playerLightsOn = true` in `main.ts`, which is passed to `nightLights.update` and recorded as an action. The world never sees it. | `src/render/main.ts:2420`, `:2714`, `:2894`, `:3512`; `src/render/lights/nightLights.ts:139,164-165` |
| S2 | **The recorded `lights` action is not replayed.** `verifyFlightRecord` applies only `wingman-order` actions to the world (gear, flaps and the rest travel inside `packet.controls`). So the moment the AI reacts to lights, a record that contains an `N` press would fail verification unless `verify.ts` applies it. | `src/flightRecorder/verify.ts:60-67`; `src/flightRecorder/schema.ts:32-37` |
| S3 | **Scenario `lights` are not in the World** (F6A: "World never carries them, so the checksum cannot see them"). The sim cannot read a light, a flare or a nav light today. | `src/sim/scenario.ts:299-301`; `src/sim/lights/lights.ts:1-9` |
| S4 | **The sim has no clock of day and no cloud cover.** "Time of day never enters the sim"; the sun clock is render-side. `ambientNightLevel(sunElevDeg, cloudCover)` needs both. `sunPosition` lives in `src/render/sky/sun.ts` (pure, imports only sim math) and `src/sim` may not import `render`. | `src/sim/scenario.ts:292-296`; `src/render/sky/sun.ts:26-34`; `tests/architecture/boundary.test.ts:107-108` |
| S5 | The AI "who do I see" rule is one predicate, `isContact`: opposite side, not doomed, airborne, within `DETECTION_RANGE_M = 8000` (comment: "the sim cannot see clouds"). It feeds `selectTarget`, the idle clock (`lastContactS`) and `threatAstern`. The `accept?` hook (type at line 55, call at line 102) runs AFTER `isContact` and is used only for engage rules (wingman, ingress). | `src/sim/ai/targeting.ts:25,55,61-67,97-110`; `src/sim/ai/pilotTick.ts:68,72,231`; `src/sim/ai/recovery.ts:97` |
| S6 | Anti-aircraft fire has its own, separate target filter: horizontal range to the weapon's reach, then per-mount range. No notion of visibility. | `src/sim/weapons/aaFire.ts:362-374` |
| S7 | **The bombsight already exists.** B2 (2026-10-10) ships `predictImpact` and a ring marker on the ground or sea, toggled by `U`, an Assist, off by default, for EVERY pilot. It handles bombs and rocket pairs, flies the real projectile step, and is held to the real sim to 1 cm. It returns `null` for a torpedo. | `src/sim/weapons/impactPrediction.ts:60-72`; `src/render/scene/impactMarker.ts`; `src/render/frame.ts:761-762`; `src/input/bindings.ts:63`; `tests/sim/weapons/impactPrediction.test.ts` |
| S8 | The torpedo drop envelope is one inline expression at release: speed (`previous.velocity`) above `maxDropSpeedMps` or rack height above the sea above `maxDropHeightM` makes a dud; a torpedo that meets anything but open sea (land, deck, hull, airplane) breaks up; bay doors must be open. Content: Mk 13 at 210.9 m/s (472 mph) and 730 m (2,395 ft); B5N2 and G4M at 91.7 m/s (205 mph). The AI uses fractions of the same limits. | `src/sim/weapons/combat.ts:548-551,908-921`; `src/sim/flight/schema.ts:57-72`; `content/aircraft/b5n2-kate.json:258`, `tbm-3-avenger.json:325`; `src/sim/ai/attack.ts:365-380` |
| S9 | The rank gate exists as data: `abilities(tier).sights` (`tier >= 4`). Nothing consumes it. The sortie reaches the game through `SortieChoice` (`timeOfDay`, `cloudiness` already ride on it); campaign `pending.facts` reserves only `aircraft` and `loadout`, and "F6 and F7 hang their own keys beside them". There are three types named `SortieFacts` (`src/sim/sortie.ts:24` rule facts; `src/campaign/schema.ts:89` log facts; `src/render/roster.ts:67`, deleted by F5B). | `src/campaign/ranks.ts:55-58`; `src/sim/sortie.ts:16`; `docs/campaign-data.md:33-35`; `src/campaign/bank.ts:36` |
| S10 | The DEV reproduction path rebuilds the world with the CURRENT session's hour and cloud choice and never compares them with `record.launch.timeOfDay`. Harmless today (time of day never enters the world); it would silently diverge once the AI depends on it. | `src/render/main.ts:2610-2620`; record `launch.timeOfDay` at `schema.ts:62` |
| S11 | A frame-level seam for "an input that must reach the world before the fixed steps, and be recorded at tick+1" already exists: the wingman call. It is applied in `nextFrameState` and noted in `main.ts`. | `src/render/frame.ts:626-633`; `src/render/main.ts:2894-2899` |
| S12 | `World` carries only what the checksum should see; the checksum is over everything but `terrain` and the accumulator, with `undefined` fields dropped. A new optional field that is absent in existing worlds leaves every existing checksum (golden trajectory, soak, records) unchanged. | `src/flightRecorder/checksum.ts:6-33`; `src/sim/loop.ts:396-465` |
| S13 | Test beds already exist: `night-range` has a lit Hellcat, a lit Avenger and an axis `dark-zero` with pilots; `night-field` and `night-bay` have lights and ships; none has an airborne enemy patrol for a player to approach. | `content/scenarios/night-range.json`; `night-field.json`; `night-bay.json` |
| S14 | F7A (parallel) computes its own `daylight`/`visibility` scalars for rescue in `main.ts` (`(elevationDeg + 6) / 30`). That is a second ambient source; F6B does not touch it (section 10). | `git show plan-f7a-bailout-rescue:src/render/main.ts` (diff hunk near the recorder launch) |

### 2.2 Computed facts (my calculation, labeled)

Sun elevation by the repo's own formula, day 294, Leyte (F6A section 2.3): J5 at 1830 is about -9 degrees (dusk), A4 at 2100 about -46, J4 at 2130 about -53. `ambientNightLevel` clamps below -18 degrees, so every deep-night chapter has the same ambient (clear sky about 0.047 lux, 0.033 lux under the heaviest Form 2 overcast), and J5 dusk is about 0.2 lux. Perception therefore distinguishes only "lit", "dark and unlit by anything", and "lit up by a flare or searchlight"; there is no hour-by-hour depth to tune inside A4 and J4.

## 3. The perception model

### 3.1 Principle

For each aircraft T, once per tick, compute one **detection range** `R(T)` in meters: "an enemy sees T out to this distance". The per-pair visibility scalar is `v(O,T) = R(T) / d(O,T)`; O sees T iff `v >= 1`. `R` depends only on the target, so the per-tick cost is O(aircraft x lights) once, and each contact test is one comparison, O(contacts) per observer. It is computed by a pure function from `World` (so it is a pure function of tick and recorded state) and is never stored.

### 3.2 Inputs and formula

All three inputs are lux on the contract's own scale.

- `A` = `ambientNightLevel(sunElevationDeg(t), cloudCover)` (sky twilight plus the fixed moon; D5).
- `L(T)` = `illuminanceAt(externalLights, T.position)`: lights from `lightsAt` of every authored light EXCEPT nav lights (a nav light 20 ft from its own wingtip must not light its own airframe). Flares, searchlight cones, pots, ship fixtures.
- `S(T) = A + L(T)`: lux falling on the target.
- Self-light `I(T)` = total candela of T's emitting nav lights, from the authored `lights` (section 3.4), zero if the aircraft is blacked out and the light is not `blackoutExempt`.

```
sun above 0 deg              R = DETECTION_RANGE_M (8000 m): exactly today's rule
otherwise
  R_amb  = clamp( R_DAY * (S / S_REF)^K ,  R_FLOOR,  R_DAY )     seen against sky, moon, flare or beam
  R_lamp = R_NAV * sqrt(I / I_NAV) * min(1, sqrt(S_GLARE / S))   position lights: dimmer against a bright sky
  R      = max(R_amb, R_lamp)  capped at R_DAY
```

The sky-glare term makes lamps matter less as the sky gets bright, and the max with `R_amb` makes the model continuous toward day.

### 3.3 Tunables (all `ESTIMATE` until Task 1 finds sources; exported constants in `src/sim/lights/perception.ts`)

| Constant | Value | Meaning | Source |
| --- | --- | --- | --- |
| `R_DAY` | 8000 m (5.0 mi) | today's `DETECTION_RANGE_M`; the day and no-night-facts path is unchanged | existing, `targeting.ts:25` |
| `S_REF` | 400 lux | sunset anchor of `TWILIGHT_LUX` | `lights.ts` |
| `K` | 0.25 | how fast the range collapses with falling light (range roughly with the fourth root of illuminance) | ESTIMATE, tuned at CP1 |
| `R_FLOOR` | 400 m (0.25 mi) | nobody is invisible inside formation distance | ESTIMATE |
| `R_NAV` at `I_NAV` | 6000 m (3.7 mi) at 40 cd | one steady position light seen by a dark-adapted pilot; below the 8000 m cap on purpose | ESTIMATE (regulatory minimums to be sourced in Task 1; not asserted here) |
| `S_GLARE` | 3.4 lux | civil twilight end; above it lamps fade into the sky | ESTIMATE |
| `HOLD_FACTOR` | 1.25 | a pilot already tracking T keeps it out to 1.25 R, so a target at the edge does not flicker in and out | ESTIMATE |

### 3.4 Where "T has lights on" comes from

Single truth: the authored `LightSpec`s of kind `nav` on that aircraft (what the renderer draws is what the AI sees). A new pure export in `src/sim/lights/lights.ts`, `navLightCd(specs, aircraftId, tS, blackedOut)`, reuses the module's own `emitting()` and `blackoutExempt` rules. It is an additive export; the contract shape does not change. An aircraft with no authored nav light is dark, always. The player's `N` switch sets `AircraftEntity.lightsOff` (section 5). Consequence for content: a night mission's player aircraft must carry a nav light spec (an enrolled test checks every night scenario; F9 and F10 author them; `night-range` already does).

### 3.5 Resulting ranges (calculated 2026-10-15 from the formula above, clear sky unless noted)

| Situation | Dark (no lights) | Lights on |
| --- | --- | --- |
| Sunset (sun 0 deg) | 8000 m (5.0 mi), unchanged | unchanged |
| Civil twilight end (-6 deg) | 2,390 m (1.5 mi) | 6,000 m (3.7 mi) |
| J5 dusk (-9 deg) | 1,200 m (0.74 mi) | 6,000 m (3.7 mi) |
| A4 and J4 night, clear | 830 m (0.52 mi) | 6,000 m (3.7 mi) |
| Same, Form 2 overcast (0.58) | 760 m (0.47 mi) | 6,000 m (3.7 mi) |
| Dark but 300 m from a parachute flare (about 8.9 lux) | 3,090 m (1.9 mi) | 6,000 m |
| Dark, 1,000 m from a flare | 1,720 m (1.1 mi) | 6,000 m |
| Dark, 3 km inside a searchlight beam (about 89 lux) | 5,490 m (3.4 mi) | 6,000 m |
| Dark, 50 m from a flare pot (0.02 lux) | 910 m, a pot barely helps | 6,000 m |

Lit versus blacked-out at deep night is about 7 to 1; the gap is the gameplay. A test asserts the shape (lit at least 5 times dark at deep night; a flare or beam closes most of it), not these constants (testing.md: assert behavior, not constants).

### 3.6 Consumers

1. **AI pilots.** A new optional `perception` on `PilotTickContext` and `TargetingView`, built once per tick in `advance` (`src/sim/loop.ts:1038`) only when the world has night facts. `isContact` adds `d <= R(c) * (c is my current target ? HOLD_FACTOR : 1)`. Mark ruled (D1) that the gate sits in the shared `isContact` check; his earlier "`accept?` hook" wording is superseded, and the hook keeps its engage-rule job.
2. **Anti-aircraft fire** (`aaFire.ts:362`): the same `R` filters `hostile`, so a blacked-out aircraft is shot at only inside `R` (flak reaches 5,500 m, so a dark aircraft past about 830 m is safe unless lit by a beam or flare). See decision D9.
3. **Not consumers:** wingmen following their leader (formation is not perception), mission-assigned targets (`pilot.target`, ruling W3 at any range), attackers finding ships (decision D11), defensive turret gunners.

### 3.7 Not modeled (stated, not hidden)

Line of sight and cloud occlusion (the sim has no clouds; cloud cover only dims the moon, through `ambientNightLevel`); observer altitude and silhouette (looking up at sky versus down at dark sea); aspect (union of the three position-light arcs is all-round, so the arc is ignored); exhaust glow and muzzle flash; the observer's own lights.

## 4. The sight designs

### 4.1 Shared rules

- Information only. No weapon, flight or dispersion code changes; the gate and the display read what the sim already computes. A test asserts the golden trajectory and the soak are bit-identical with sights on and off.
- Lower ranks may still release weapons. The gate hides the aid; it never blocks `dropBomb`.
- One key. The existing `U` (`toggleImpactMarker`) toggles the sight; the sight type follows the weapon loaded (bomb or torpedo). Legend: "Bombsight / Torpedosight (Lt Cdr and above)". Rocket pairs keep today's marker label when sights are available (B2 already predicts them; see decision D6).
- **Gate (this REMOVES the marker from low ranks, see the banner):** `sightsAllowed = dev || row.pool === 'training' || choice.sights === true`: Dev (the checkbox inside the production HQ/picker; no separate Dev UI) and every Training Ground row, the Basic Flying tutorial included, always have the sight; campaign and single missions follow rank. `SortieChoice` gains `readonly sights?: boolean` (`src/sim/sortie.ts:16`), carried on F5B's `CampaignLaunch{pilotId, tier, facts}` (`sights: abilities(tier).sights`, plus the `facts.sights` key). `main.ts` carries it into `FrameState` as `sightsAllowed`; `frame.ts:761` ANDs it into the toggle, so with the gate closed `impactMarker` can never become true and the predictor is never called. The campaign `pending.facts` also records `sights: boolean` beside the reserved keys (for the log and debrief; no schema change).

### 4.2 Bombsight (reuse of B2)

The existing ring, memoized per tick, at constant angular size, drawn over everything, with the badge `BOMBSIGHT 1.4 MI` and `UNARMED` when the fuze would not arm (the existing `armed` flag). It is drawn at night exactly as by day; the ring and badge get the contrast and size checks of section 8. There is no valid/invalid color for bombs: "valid release" for a bomb is simply that a prediction exists (bombs aboard, bay doors open for a bay load, airborne). Over a ship the point is the water beneath, as B2 documents.

### 4.3 Torpedosight (new, reuses the same flight code)

New `predictTorpedoDrop(spec, state, stores, terrain, wind, decks)` in `src/sim/weapons/impactPrediction.ts`, built on the module's existing `fly()` (the real projectile step, the torpedo's own `dragPerM` and `lifetimeS`), with `fly` also returning whether the first contact was sea or land. It returns:

```
{ entry: Vec3 | null,   // where it meets the water (or land)
  timeS, valid: boolean, reasons: ('too-fast'|'too-high'|'not-over-sea'|'doors-shut'|'no-torpedo')[],
  speedMps, maxSpeedMps, heightM, maxHeightM, armRunM, runRangeM, headingRad }
```

`valid` is true only when all of the sim's existing conditions hold: airspeed at most `maxDropSpeedMps`, rack height above the sea at most `maxDropHeightM`, the entry point is open sea, bay doors open (as `releaseBomb` requires), and a torpedo is the next store. The two numeric tests are extracted from `combat.ts:551` into one exported pure function `torpedoDropOk(type, speedMps, heightAboveSeaM)` that `releaseBomb` AND the sight call, so they cannot drift (this is a behavior-preserving extraction; the golden and torpedo tests prove it).

HUD, in the same marker family as the bombsight:
- Ring at the entry point, drawn green when `valid`, red when not. A valid ring is a plain ring; an invalid ring carries a crossbar (an X), so color is never the only signal.
- Badge text, always present with the sight on and a torpedo loaded: `TORPEDO DROP OK  ENTRY 0.9 MI` or `NO DROP: TOO FAST 212 MPH (MAX 189)`, `NO DROP: TOO HIGH 640 FT (MAX 2,395)`, `NO DROP: NOT OVER OPEN SEA`, `NO DROP: BAY DOORS SHUT`. It also shows the arming distance (`ARMS 590 FT`) from `armRunM`, since a hit inside it is a dud.
- Optional short run line from the entry point along the drop heading (decision D4).
- Imperial units in all text (mph, ft, mi); the sim values stay SI.

Known blind spot, stated on the HUD documentation and in decision D5: the real sim breaks a torpedo up if it falls onto a hull or deck; like B2 (`impactPrediction.ts:41-46`) the prediction ignores hulls, so a drop onto a ship shows green and breaks up.

### 4.4 AI wingmen and AI pilots

No sight HUD for AI, no rank gate. AI bombers and torpedo planes already use `predictImpact` and the envelope fractions themselves (`attack.ts:284,321,365`); they are untouched. (decision D2.)

## 5. Recorder and determinism

### 5.1 The determinism story

1. **Everything the AI reads is in the World or derived purely from it.** Authored lights, the launch hour and the cloud cover are set once on the world as an optional `night` fact (so the initial checksum covers them and a mismatch fails closed with "initial world mismatch"). The per-aircraft lights state is an optional `lightsOff?: true` on the aircraft entity (absent when lit). The perception table `R(T)` is a pure function of `(world.night, world.tick, aircraft poses, authored lights)`, computed each tick and never stored.
2. **Existing worlds are byte-identical.** `night` and `lightsOff` are absent from every world that does not need them (checksum drops `undefined`). `night` is attached only when the scenario authors lights OR the sun is below 0.5 degrees at the launch hour or at the launch hour plus `NIGHT_FACTS_HORIZON_H = 2` (so a dusk takeoff that crosses sunset gets it). Day worlds, the golden trajectory, the soak, the furball soak and every existing record keep their checksums; a test pins this.
3. **The lights switch becomes recorded input applied at a fixed tick.** The `control: 'lights'` action already exists (F6A D2) and now gets its sim effect: the frame applies `withPlayerLights(world, on)` before that frame's fixed steps (the wingman-call seam, S11) and `main.ts` notes the action at `tick + 1`, as it does today. `verify.ts` applies the same function when it replays a `lights` action (S2 is the bug F6B must fix, or a recording with any `N` press diverges).
4. **Time of day and cloud cover are inputs, so reproduction must check them.** Both are set by `withNightFacts` from `scenarioTimeOfDay` and the Form 2 cloudiness through the same `buildWorld` that the live path and the DEV reproduction path both call (S10). The reproduction path additionally compares `record.launch.timeOfDay` with the session's and refuses with a plain message ("record was flown at 21.0; this session is at 18.5") before verifying.
5. **No random draws and no wall clock** in perception; `tests/architecture/boundary.test.ts` already forbids `render` imports in `sim`, and `sunElevationDeg` moves into `src/sim` (a re-export keeps `render/sky/sun.ts` unchanged).

### 5.2 Exactly what changes in `src/flightRecorder/`

| File | Change | Why |
| --- | --- | --- |
| `schema.ts` | Evidence enum gains one member, `'sighted'` (additive; format version stays 1, as F6A and F7A did). **No change to the action union.** The `'lights'` control member exists from F6A. | `sighted` evidence: `{kind:'sighted', entity: observer, detail: 'sees player at 4.1 mi (limit 3.7 mi lit)'}`, emitted when an AI pilot's target first becomes the player. Debrief and verification explanations; not needed for correctness, and verification ignores events. Accepted (D14). |
| `verify.ts` | In the `for (const action of packet.actions)` loop, before `advance`: `if (action.kind === 'control' && action.control === 'lights') world = withPlayerLights(world, action.value)`. | S2: replay must apply the switch or it diverges. |
| `recorder.ts` | `evidenceBetween` emits `sighted` by comparing `decision.targetId` of enemy pilots before and after a tick. | feeds the evidence above. |
| `docs/flight-recorder.md` | Document that `lights` now has a sim effect and what `sighted` means. | ledger |
| `tests/flightRecorder/recorder.test.ts` | **Not edited.** F6B tests live in the new `tests/flightRecorder/lightsReplay.test.ts`. | F7A's dry-run merge already conflicted only in this file. |

Anything else the sim needs (the `night` fact, `lightsOff`) lives in `World`, so the record needs no new field: the record header's `launch.timeOfDay` and `launch.weather` (already recorded) are the inputs, and the checksum is the proof.

### 5.3 Version and contract status (nothing here needs a bump; two items come close)

- **F6A light contract (`LIGHT_CONTRACT_VERSION = 1`): no shape change.** D1 (8-slot render shape) and D2 (the recorded action) are untouched. Additions are one new pure export (`navLightCd`) and a new module `perception.ts`. D2 said the action "has no sim effect until F6B"; giving it one is the planned use, not a change.
- **F5A schema: no change.** `abilities(tier).sights` is consumed as is; `sights` is a new key hung beside the reserved facts keys, which `docs/campaign-data.md:33-35` allows.
- **Close calls, flagged for Mark:** (a) the additive `'sighted'` evidence member makes records that contain it unparseable by builds before F6B, by the same rule as F6A's and F7A's additive members (no such record exists yet); (b) night worlds get a new optional `night` field, so their checksums differ from pre-F6B worlds of the same scenarios; no records of night scenarios exist yet outside dev flights.

## 6. Tasks

TDD: each task lists the test written first, the work, and its mutation check. "Mutation" means: break the code in the stated way and show the new test goes red, recorded in the handoff. Heavy jobs (full suite, `tsc`, eslint, `npm run verify`, budgets) run on ryzen through `remote-run`; on nexus run only the files touched. Budget specs take `hwlock ryzen-budget`.

1. **Sources and baseline.** Find period evidence for position-light visibility distance and for dark-adapted detection of an unlit aircraft by moonlight (labels stay `ESTIMATE` where none is found). Record baselines: sim tick cost for the 24-aircraft, 100-light fixture; the nine day views and the four night views (F6A set). *Test:* `docs/night.md` gains a sources table row per constant of section 3.3; a test asserts every exported perception constant has an entry (enrolled list, pinned).
2. **Sun elevation and ambient in the sim.** Move `sunPosition`, `solarDeclinationDeg` and the scenario constants to `src/sim/lights/sun.ts`; `render/sky/sun.ts` re-exports. Add `ambientAt(night, tick)`. *Tests first:* an enrolled equality of the moved functions against a table of values frozen from the pre-move code over a day grid; boundary test still green; `ambientAt` equals `ambientNightLevel(sunPosition(...))` at five hours. *Mutation:* change the hour offset by one tick-hour; the grid test fails.
3. **Perception model, pure.** `src/sim/lights/perception.ts`: `detectionRangeM(inputs)`, constants (section 3.3), `navLightCd` in `lights.ts`. *Tests first:* table-driven over the situations in section 3.5 (calculated numbers within 1 percent, labeled as the formula's output not history); lit is at least 5 times dark at deep night; flare and beam close most of the gap; monotonic in `S`; continuous at 0 degrees within 2 percent; sun above 0 returns exactly `R_DAY`; `blackoutExempt` keeps a light on in blackout; an aircraft with no nav spec is dark. *Mutations:* drop the blackout term (lit == dark) fails the 5x test; drop the glare term fails the dusk row; set `K` to 0 fails the dusk-versus-night ordering.
4. **World seam.** `World.night?`, `AircraftEntity.lightsOff?`, `withNightFacts`, `withPlayerLights` (`src/sim/loop.ts`, small), the horizon rule, `worldFromScenario` unchanged, `buildWorld` in `main.ts` attaches facts (one call). *Tests first:* (a) every shipped day scenario has no `night` and an identical checksum to `main` after 3,600 ticks (enrolled over `content/scenarios`; pinned list); (b) night scenarios have it; (c) `lightsOff` changes the checksum (it is state); (d) golden trajectory and soak unchanged. *Mutation:* set `lightsOff: false` instead of absent; (a) fails on the checksum.
5. **AI pilots perceive.** `perception` on `PilotTickContext`/`TargetingView`, built in `advance`; `isContact` gate with `HOLD_FACTOR`. *Tests first (extend `tests/sim/ai/targeting.test.ts`, new `tests/sim/ai/perception.test.ts`):* same world, enemy at 4 mi: lit player is selected, blacked-out player is not; at 0.4 mi both are; a flare 300 m away restores a blacked-out player at 1.9 mi but not at 3 mi; the pilot already tracking a target at 1.1 R keeps it, a fresh pilot does not; the idle clock does not reset on an unseen player; `threatAstern` ignores an unseen tail-chaser; a day world (no `night`) selects exactly as before (the whole existing targeting and furball soak suites untouched and green). Two runs of the same night world produce equal checksums at every one-second checkpoint (determinism). *Mutations:* apply the gate only inside `selectTarget` (not `isContact`): the idle-clock and `threatAstern` tests go red; remove `HOLD_FACTOR`: the hold test goes red.
6. **Anti-aircraft perceives.** `R` filters `hostile` in `aaFire.ts`. *Tests first (`tests/sim/weapons/`):* a heavy mount at 2.5 mi fires at a lit aircraft and not at a dark one; a dark aircraft inside a searchlight beam is fired at; day unchanged. *Mutation:* remove the filter; the dark case fires and the test goes red.
7. **Recorder and replay.** `frame.ts` applies the switch; `main.ts` derives `playerLightsOn` from the world (surgical: the local `let` and its toggle go, the existing `pendingLights` note stays); `verify.ts` applies the action; the DEV reproduction compares hours; optional `sighted` evidence. Add `night-patrol` Dev scenario and the DEV `__ww2.perception()` readout (per enemy: `R`, distance, sees). *Tests first (`tests/flightRecorder/lightsReplay.test.ts`):* a scripted night sortie where the player blacks out mid-approach records, exports and re-verifies bit-identically at every checkpoint; a record that crosses a lights toggle verified against `main`'s verifier (no `lights` application) fails at the first reacting tick; `launch.timeOfDay` mismatch is refused with the plain message; an old record (no `lights`) still parses and verifies. *Mutations:* delete the `verify.ts` branch (replay diverges, named tick); apply the action one tick late (diverges). **Checkpoint CP1.**
8. **Sight gate (removes an aid pilots have today).** `SortieChoice.sights`, `FrameState.sightsAllowed`, the `frame.ts:761` AND, Dev override, `pending.facts.sights`, legend entry ("Lieutenant Commander and above"), GAMEPLAY.md and release-note wording stating the removal, and the Basic Flying tutorial's `U` radio line kept (the tutorial is `pool: 'training'`, so it still teaches the marker; B4 never gated on `U` and still does not). The launch supplies `sights` through F5B's `CampaignLaunch`. *Tests first:* gate table (tiers 1 to 3 closed, 4 to 6 open; Dev open; every `pool: 'training'` row open, enrolled over `SCENARIO_OPTIONS` and pinned, tutorial included; `noncampaign` and `single` rows follow tier) from `abilities(tier)`; the tutorial E2E still reaches its bomb step with the marker toggleable; no Dev-only launch path is added (Dev is the production HQ/picker with the checkbox); with the gate closed, `U` never sets `impactMarker` and `predictImpact` is never called (call counter, like the existing predictor memo test); with it closed `dropBomb` still releases (the existing release tests run with the gate closed); Dev and quick launch open; no import of `src/campaign` from `src/sim` (boundary test). *Mutation:* ignore the gate in `frame.ts`; the closed-gate test goes red.
9. **Bombsight labeling and night legibility.** Relabel the B2 marker and badge per section 4.2; no physics change. *Tests first:* label text per state; the golden trajectory, soak and `impactPrediction.test.ts` unchanged and green with the sight on; the marker color and badge meet section 8 against the night floor. *Mutation:* none beyond Task 8's; the physics-unchanged claim is the golden.
10. **Torpedo prediction.** `torpedoDropOk` extraction; `fly()` returns contact kind; `predictTorpedoDrop`. *Tests first (`tests/sim/weapons/torpedoPrediction.test.ts`, enrolled over every airframe whose content has a torpedo store, pinned):* truth is `advance`. For a matrix of speed (0.5x, 0.95x, 1.05x, 1.5x of `maxDropSpeedMps`) by height (0.5x, 0.95x, 1.05x of `maxDropHeightM`) by surface (sea, land): the sight's `valid` equals "the real torpedo entered the water and ran" (`impacts` outcome `entered`) versus `broke-up`, and `entry` is within 1 cm of the real entry point. *Mutations:* change the speed limit in `releaseBomb` only: because both call `torpedoDropOk` the tests stay green (the point), so instead mutate `torpedoDropOk` and show the matrix goes red; and break the sight to ignore the sea test, which the land cases catch.
11. **Torpedosight HUD.** Ring (plain/crossbar), colors, badge reasons, arming distance, memo per tick, hidden when gate closed or no torpedo; `__ww2.sight()` diagnostic. *Tests first:* label and reason text per state (pure function, enrolled over the five reasons); color-independent cue (shape differs between states; text differs); `aria-live` updates only on a change of state, never more than once a second; E2E wiring on the night bay reads `__ww2.sight()` and asserts valid versus invalid as the player slows (no pictures). **Checkpoint CP2.**
12. **Dev scenario and enrollment (in the production HQ/picker, revealed by the Dev checkbox).** `night-patrol` (airborne Hellcat at night, a Zero patrol on a racetrack, one lit and one unlit friendly), picker row, the three enrolled scenario lists, `night-range`/`night-bay` nav specs on the player if missing. Done AFTER the F5B rebase because F5B rewrites the title and those lists. *Tests:* the enrolled lists include it; schema validation of every shipped scenario; the enrolled "night scenario has a nav spec on its player" test.
13. **Budget gates and accessibility measurements.** Section 7 and section 8, run through `remote-run` and `hwlock ryzen-budget`.
14. **Docs, test reconciliation, handoff.** `docs/night.md` (perception section and constants with sources), `docs/flight-recorder.md`, `docs/campaign-data.md` (the `sights` key), GAMEPLAY.md (blackout and sights, imperial), MASTER_PLAN F6 status and the README pointer, `docs/handoff/2026-10-XX-f6b-night-perception-sights.md` with `Tests updated`, `Tests still valid`, `Known gaps` (AGENTS.md closeout), run `REMOTE_RUN_OVERFLOW=0 remote-run npm run verify`, rebase on F5B and F7A and re-run the affected gates. Mail the plan and handoff HTML only after the AGENTS.md exact-recipient check (not done by this planning pass). **Checkpoint CP3.**

## 7. Budget gates (measurable; frame time on ryzen is bimodal, so each gate is an alternating on/off comparison inside one page load or a median of at least 5 fresh loads, `docs/testing.md` "Known gaps")

| Gate | Method | Threshold |
| --- | --- | --- |
| (a) Sim cost of perception | node microbench on ryzen (`remote-run`), 24 aircraft and 100 lights, alternating night-facts on and off in one process, median of 7 blocks of 600 ticks | at most **+0.15 ms per tick**, and **0.00 ms** (the same branch, no allocation) with `night` absent |
| (b) Sights on versus off, GPU | `nightBudget.spec.ts`-style, one page load, sight toggled every 120 frames, median of six pairs, `night-bay` torpedo loaded and `night-range` bomb loaded | at most **+0.10 ms** p95 |
| (c) Day views unaffected | the nine `views.ts` views, median of at least 5 fresh loads each against `main`, plus the structural guarantee: with the gate closed or `night` absent no new per-frame code runs (the call-counter tests of Tasks 5 and 8) | regress by less than **0.3 ms** p95 and all within the existing 8.33 ms (10.0 for `in-deck-1900`); an inconclusive reading is reported as inconclusive, as F6A did, and the structural guarantee carries it |
| (d) Memo | the torpedo and bomb predictors run at most once per sim tick (counter) | exactly 1 per tick, 0 with the sight off |

Fallback if (a) fails: compute `R` every 6th tick and for enemy-side-relevant targets only (the perception inputs change slowly); if (b) fails: the ring becomes a single sprite (no depth pass), not fewer features.

## 8. Accessibility checks (F6 acceptance gate)

1. **Not color alone.** The green/red torpedo cue differs by shape (plain ring versus crossbar) and by text; asserted in a unit test on the pure marker state, and shown in a capture rendered under a simulated deuteranopia matrix with the two states still distinguishable by luminance difference of at least 3:1 (WCAG ratio on linear luminance, the F6A method).
2. **Contrast at night.** Ring against the night sea and against the night sky at 600 ft and 1,500 ft: at least 3:1 (non-text), measured in screenshots on the reference GPU. Badge text on its backing: at least 4.5:1, at least 14 px (the B2 badge is 12 px; raised for the sight).
3. **Screen reader and live region.** `aria-live="polite"`, updated only on a change of verdict or reason, at most once per second; it must not chatter while a pilot flies the approach.
4. **No motion dependence.** No pulsing; the marker's only change is state. Respects `prefers-reduced-motion` trivially.
5. **Keyboard.** `U` only; the legend and pause-sheet controls list it with the rank requirement; a closed gate shows nothing and explains itself in the legend ("Lieutenant Commander and above"), never a silent dead key.
6. **Blackout is never the only feedback.** When the player blacks out, a short HUD line confirms it ("POSITION LIGHTS OFF") and the legend states the trade-off; AI noticing the player is shown at debrief by the `sighted` evidence.
7. **Imperial units** in every sight and legend string (a test greps the label function's output for `m/s`, `km`, `kg`).

## 9. Risks (honest)

- **The numbers are estimates.** Every constant in section 3.3 is a feel, not a measurement; `K` and `R_NAV` decide whether blackout is a real trade or a nuisance. CP1 is where Mark's eye tunes them; the shape (lit about 7x dark) is the contract, the numbers will move.
- **Blackout may be too strong or too weak at deep night.** Ambient is flat below -18 degrees (S2.2), so A4 and J4 differ only through lights; if the dark range is too long the mission is easy, if too short the player cannot find his wingman. Wingmen are not perception-limited (formation), so this only affects enemies.
- **The AI gets stupider in the dark in one specific way.** A pilot that loses a target simply drops it and resumes loiter or patrol; there is no search behavior. At 830 m the hold factor makes this a hard edge. Acceptable for F6B (decision D15), visible in play.
- **`isContact` is shared.** Gating it changes the idle clock and `threatAstern` as well as targeting. That is intended (an unseen aircraft should not make the AI break), but it widens the blast radius into recovery behavior; the furball and recovery suites guard day worlds and the new tests guard night worlds.
- **Day-byte-identity depends on the horizon rule.** A dusk sortie that crosses sunset gets perception halfway through; if `NIGHT_FACTS_HORIZON_H` is too short, a long dusk sortie flips behavior mid-flight with no `night` fact present. The rule uses launch hour plus 2 hours; a sortie longer than that is outside the designed envelope (the campaign design says action begins in 5 to 7 minutes).
- **A new field on `World`.** Optional and absent in all existing worlds, but F7A also edits `World` and `advance`; a textual merge conflict in `loop.ts` is likely (section 10).
- **The title/launch seam is moving under us.** F5B rewrites `startGame` and deletes `roster.ts`; the one-line `sights` supply must be re-done after the rebase, and Task 12's enrollment lists are F5B's to reshape.
- **Torpedosight lies over ships.** Green over a hull, real result break-up (S8). Documented; the cost of fixing it is a hull-intersection test per tick.
- **The B2 gate removes a feature pilots have today** (the impact marker for everyone). Mark's ruling requires it; decision D6 asks how far it reaches.
- **Perception can be proven deterministic but not proven fun.** Only CP1 and CP3 can show that.

## 10. Collision notes (merge order: F5B, then F7A, then F6B rebases)

| Seam | F5B | F7A | F6B action |
| --- | --- | --- | --- |
| `src/render/main.ts` (large, shared) | rewrites `startGame`, title, debrief, deletes `roster.ts` imports (`SortieFacts`, `bankSortie`, `loadRoster`) | +143 lines (bailout, recorder launch block, `J` key, daylight scalar) | F6B touches four places only: the `playerLightsOn` declaration and toggle (`:2420`, `:2714`), `buildWorld` (one `withNightFacts` call), the `FrameState` init calls (`sightsAllowed`), and the B2 block (`:3190-3200`) for the torpedosight. Keep each edit under about 10 lines; rebase after both. |
| `src/sim/sortie.ts` `SortieChoice` | F5B's launch path constructs it | none | add `sights?: boolean`, carried on F5B's `CampaignLaunch{pilotId, tier, facts}` (`sights: abilities(tier).sights`; one-line edit after the rebase; follow F5B's names). No Dev-only UI. |
| `src/sim/loop.ts` `advance` and `World` | none expected | +113 lines (bailout import block, `requestBailout`, parachutist step) | additive: one import, one optional `World` field, one `perception` build next to `pilotContext` (`:1038`). Expect a textual conflict near the imports and the world type. |
| `src/flightRecorder/schema.ts` | none | action union gains `bailout`; evidence enum gains `bailout` | evidence enum gains `sighted` on the same line as F7A's edit: resolve by listing both. Action union untouched. |
| `src/flightRecorder/verify.ts` | none | adds a `bailout` branch at the top of the action loop and an import | adds a `lights` branch in the same loop; both branches `continue`, so they compose. |
| `src/flightRecorder/recorder.ts` | none | `evidenceBetween` gains parachutist evidence | add `sighted` evidence below it. |
| `tests/flightRecorder/recorder.test.ts` | none | +37 lines (the dry-run conflict) | **not edited**; new tests in `lightsReplay.test.ts`. |
| `src/render/frame.ts` | none | `playerParachutist` in `releaseBlocked`, camera, `holding` | lights toggle next to the wingman call (`:626-633`); `sightsAllowed` AND at `:761`; while a parachutist is out the sight is off (`live` false), a one-line condition. |
| `src/render/legend.ts`, `bindings.ts` | none | adds a `J` entry | edits the `U` and `N` entries; no new key. |
| Scenario enrollment lists (`titleScreen.test.ts`, `sortieFlow.test.ts`, `mission/options.test.ts`) | rewrites the title and likely these lists | none | Task 12 happens after the F5B rebase. |
| `docs/campaign-data.md`, `GAMEPLAY.md`, `MASTER_PLAN.md`, `docs/flight-recorder.md` | edits | edits all four | documentation-only conflicts; re-apply by hand. |
| F7A's `daylight` scalar | | `(elevationDeg + 6) / 30` in `main.ts` | **leave it**. It and `ambientNightLevel` should converge in F7B; F6B records that as a follow-up, not a change. |

`src/flightRecorder/` rule: nothing in F6B changes an existing field's meaning or an existing record's bytes; the only edits are one evidence member, one replay branch, one evidence emitter.

## 11. Decisions (Mark, 2026-10-15)

Part 1: rulings given with the task. Part 2 (D1 to D16) follows in section 12.

Rulings given with the task, binding:

| # | Decision | Ruling |
| --- | --- | --- |
| R1 | Blackout | **Real.** Lights on: seen from farther; blacked out (the recorded `N` action): seen only from close range. |
| R2 | Mechanism | One visibility scalar per (observer, target), from target self-light, ambient (`ambientNightLevel`) and local illumination (`illuminanceAt`), through the existing selection hook, O(contacts). Documented, tunable ranges. |
| R3 | Determinism | The lights switch is a recorded action; the world checksum and flight-recorder replay must still verify; any added evidence is an additive strict union member. |
| R4 | Sights | Lieutenant Commander and above only. Lower ranks may still release weapons. Bombsight marks the predicted ground impact; torpedosight shows green/red valid-drop plus predicted water entry, inside the torpedo's existing drop envelope. |
| R5 | Sights are aids | No change to weapon physics or dispersion; the aids reuse the sim's real prediction code. |
| R6 | Rank gate path | `abilities(tier).sights` reaches sim and render as a sortie fact, never by `src/sim` reading Campaign. A Dev override is acceptable. |
| R7 | Viewing | Checkpoints at intermediate steps plus the final; attended; Dev slots only when the coordinator says. |
| R8 | Merge order | F5B first, F7A second or third; F6B rebases; `main.ts` changes stay surgical. |
| R9 | Contract changes | Anything that would bump F6A's contract version or change the F5A schema is stopped and listed. Result: none required (section 5.3). |

Decisions made by this plan carrying the recommendation of each ambiguity below until Mark rules: A1 to A15.

## 12. Decisions (Mark, 2026-10-15), part 2: all recommendations accepted

Mark accepted every recommendation of the first draft's ambiguity batch. The plan above is revised to match.

| # | Decision | Ruling (accepted) | Plan effect |
| --- | --- | --- | --- |
| D1 | Where the visibility test sits | In the shared `isContact` check; the `accept?` hook wording is superseded | 3.6, Task 5 |
| D2 | AI wingmen and enemy pilots | No sight HUD, no rank gate | 4.4 |
| D3 | "Valid release" | Torpedo: the sim's existing drop rules (speed, height, open-sea entry, bay doors). Bombs are never red; the existing UNARMED dimming stays | 4.2, 4.3 |
| D4 | Torpedosight extras | Ring plus arming-distance text plus a short run line; no lead computation | 4.3, Task 11 |
| D5 | Ships under the entry point | Accept the limitation and document it (shows green, real torpedo breaks up) | 4.3, risks, Task 14 docs |
| D6 | The `U` impact marker | **Gated by rank (Lt Cdr+) in campaign and single-mission sorties; Dev and Training Ground keep it. Removes an aid new pilots have today; stated in release notes, GAMEPLAY.md, legend, tutorial line** | banner, 4.1, Task 8 |
| D7 | Contexts with sights | Always in Dev and every Training Ground row (tutorial included); campaign and single missions by tier | 4.1, Task 8 |
| D8 | Who is lit | Only authored nav lights; the player starts lit; no blacked-out start in F6B | 3.4 |
| D9 | Blackout and flak | Blackout limits anti-aircraft fire (same range) | 3.6, Task 6 |
| D10 | Flare and searchlight illumination | Makes you visible (already ruled R2) | 3.5 |
| D11 | Ship and harbor blackout | Affects illumination only, not who finds the ship | 3.6 |
| D12 | Dusk takeoff | Perception applies continuously as the sun sets | 5.1, Task 4 |
| D13 | Torpedo-valid sound | None | 8 |
| D14 | `sighted` evidence | Recorded (additive evidence member) | 5.2, 5.3, Task 7 |
| D15 | AI that loses sight | Drops the target and resumes patrol, with the 1.25x keep-sight factor | 9 |
| D16 | Range values | Keep the starting values until CP1, then tune | 9, CP1 |
| G1 | Dev UI | Dev uses the same UI as production; the Dev checkbox unlocks dev features within it | Task 8, Task 12, collisions |
| G2 | Launch data | F5B merges first and provides `CampaignLaunch{pilotId, tier, facts}`; F6B adds `sights` | 4.1, 10 |

**Stop-and-list items (version bumps):** none required. The accepted additive `sighted` evidence member and the new `night` field on night worlds are the two close calls (5.3).

## 13. Size estimate

Size M to L (unchanged). About **16 to 22 new or changed source files** (new: `perception.ts`, sim `sun.ts`, `torpedoPrediction` additions, torpedosight marker; changed: `targeting.ts`, `pilotTick.ts`, `aaFire.ts`, `loop.ts`, `combat.ts` (one extraction), `impactPrediction.ts`, `frame.ts`, `main.ts` (four small places), `verify.ts`, `recorder.ts`, `schema.ts`, `sortie.ts`, legend and bindings text, one Dev scenario), about 10 new test files, no new art. Risk-weighted **1.75 to 2.75 weeks** (revision 2: +0.25 week for the rank-gate wording, tutorial and Training Ground checks, and the F5B `CampaignLaunch` rebase) of agent time plus the three attended checkpoints; the two unknown-cost items are the tuning at CP1 (feel of the numbers) and the F5B/F7A rebase of `main.ts`/`loop.ts` (section 10).

## 14. What would change this plan

- (D1 is ruled; the `accept?` alternative is closed.)
- Task 10 finds the torpedo's in-air path differs from the bomb's `fly()` (drag or lifetime) so the entry point is off by more than 1 cm: the sight shows the point with a stated tolerance and the test records a measured bound.
- Gate (a) fails: compute perception every sixth tick and for the player and enemy-relevant targets only.
- F5B changes `SortieChoice` or the launch path in a way that cannot carry `sights`: the fact moves to the world (`World.rules`), which would be a checksum-visible field and needs a new note to Mark.
- Mark rules that the player may start blacked out in some missions: add an authored initial `lightsOff` on the aircraft spec in scenarios and an initial-state check in the world builder.
