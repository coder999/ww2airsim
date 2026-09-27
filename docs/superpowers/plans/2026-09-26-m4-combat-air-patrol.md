# M4: Combat Air Patrol, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Viewing checkpoints: final product only** (Mark, 2026-09-26)

**Attended: no, run unattended** (Mark, 2026-09-26). Collect Task 3's captures in the handoff.

**Goal:** Ship Combat Air Patrol. The player:
- holds a CAP station over the Essex for 180 s;
- destroys two raider waves before either comes within 5 km of the carrier;
- recovers aboard.

The mission gets a headless run to success and to failure, a Tier 2 spec, and a sourced historical paragraph.

**Architecture:** Content only, plus tests and docs. Everything the mission needs already exists, and no `src/sim/` file changes:
- M1's `hold`, `destroy`, `deny`, `land`, held groups and triggers;
- M2's UI;
- M3's side check and headless kit (`tests/sim/mission/fly.ts`);
- Plan 7e's ingress pilot (`pilot.ingress`, `src/sim/ai/ingress.ts`, merged to `main` 2026-09-26).

**Tech Stack:** TypeScript, Zod 3.25, vitest (node), Playwright on the reference GPU.

**Spec:** `docs/superpowers/specs/2026-09-25-missions-design.md` §4.4 and §9 item 4, approved by Mark 2026-09-25. Also read M3's plan (`docs/superpowers/plans/2026-09-26-m3-missions.md`, rulings M3-R1-R11) and its handoff, and the 7e handoff (`docs/handoff/2026-09-26-plan7e-sides.md`) §5.

**Where:** `worktree-missions-track`, after M3 (Mark, 2026-09-26). Do not switch branches. The branch may be pushed. Merging into `main` is Mark's call.

---

## Measured before writing this plan (2026-09-26, node v22.22.1, `main` at `a0005ff`)

These are claims to re-check. The probe is `.superpowers/m3-plan/cap-probe.ts` in the main checkout.

- **The ingress pilot's timing, with a passive player 90 km away.** Task 1's content is used exactly: the `deck-quals` ships, and raiders spawned by triggers with route `[(-20000, -52000) @ 3500 m, 130 m/s]` and destination `cv-1`. Over 700 s:

  | Wave | Spawn | First inside 5 km of `cv-1` | Spawn to breach | Closest approach |
  | --- | --- | --- | --- | --- |
  | 1 (`raid-1`, `raid-2`) | 60 s, at (−29.55, −73.34) km, 3,500 m | 380.4 s, 381.2 s | about 320 s | 594 m, 589 m |
  | 2 (`raid-3`, `raid-4`) | 240 s, at (−31.55, −74.34) km | 563.4 s, 564.0 s | about 323 s | 588 m, 588 m |

  The `deny` objective fails at tick 22,826 (380.4 s), and the engine logs `Keep the raid off: failed`. The raiders then orbit the carrier (7e's `ORBIT_RADIUS_M` 1500, relative to a moving ship) and never attack it: 7e has no torpedo or bombing AI. Cost: **0.026 ms/tick** for the whole world, so a 700 s headless run is about 1 s.
- **Ships have sides** (friendly-fire plan, merged 2026-09-26). `deck-quals`' `cv-1`, `dd-1` and `dd-2` are `"side": "allied"`. So 7e handoff §5 item 2 ("the player could score by sinking his own `cv-1`") is closed: sinking it is friendly fire, the sortie is forfeit, and it earns no badge (M2's friendly-fire note §4).
- **AI-on-AI fights do not resolve by kills** (7e handoff §5 item 1). This mission has no AI interceptors, so only the player shoots raiders, and the deferred gunnery-honesty slice does not block M4.
- **The station geometry.** The Essex's loop is `(-9084, -28558) → (-13444, -41903) → (-19988, -44130) → (-15631, -30784)`. Its centroid is `(-14537, -36349)`, and every waypoint is within 9.3 km of it. The station is a 10 km circle at the centroid, 1,500-5,000 m, so it covers the whole loop.
- **Bearings for the radio lines**, from the station center: wave 1's spawn is 39.9 km (21.5 nm) away at 338°, and wave 2's is 41.6 km (22.5 nm) at 336°.

## Preconditions

- [ ] **P1. M3 is complete on this branch.** Its handoff exists, and `tests/sim/mission/fly.ts` exports `carrierApproach`, `destroyNow` and `hold`.
- [ ] **P2. Merge main** if it moved, and record any conflicts in the ledger (`.superpowers/sdd/m4-cap/progress.md`).
- [ ] **P3. Baselines.** Run the digest probe, all shipped scenarios, and `remote-run npm run verify; rc=$?; echo "rc=$rc"`. Record both.
- [ ] **P4. Re-run the Measured probe** against the branch. It is gitignored in the main checkout, so copy it to `.superpowers/m4/`. Breach times within ±10 s of the table are fine. Beyond that, 7e's pilot changed: re-derive Task 1's tuning comment from the new numbers.

## Global Constraints

The same as M3's Global Constraints, plus:
- **No `src/sim/` change.** If the mission turns out to need one, stop and report: it is a scope change.
- The digests of every scenario without objectives must match P3 after every task.
- Raiders are `f6f-hellcat` stand-ins (spec §4, "Opponents are Hellcats … until Lane B's Zero lands"). The briefing and history say so plainly: the real raids were mostly bombers and their escorts.

## Rulings

- **M4-R1. The player starts airborne on station**, at 3,000 m heading 330°, clean. The pilots of a real CAP were already up when the raid appeared, and a deck launch would spend the first 60 s of a 180 s hold climbing out. Deck Quals already exercises the launch. Cost if wrong: a content edit to `parkedAt`, plus about 60 s more hold.
- **M4-R2. The station is fixed** at the loop centroid, not on the moving ship, because `hold` takes a `point`, not an entity. A 10 km radius covers the Essex's whole loop (Measured). Cost if wrong: none; the ship never leaves the circle.
- **M4-R3. `destroy raid` is `after: station`,** as spec §4.4 orders it ("hold … then destroy"). Raiders killed during the hold still count, because `destroy` counts every destroyed target on each evaluation (`src/sim/mission/step.ts`, `evaluate`, `destroy`). Task 1 pins that.
- **M4-R4. `deny` is primary.** Spec §4.4 makes it fail the mission, and §2.4 makes a failed primary cost the badge. It is announced, not enforced (spec §0.6): the flight continues, and the pilot can still recover and bank points.
- **M4-R5. Recovery is `land at cv-1`**, `after: raid`, as M3-R6 does for its home bases. This also rules out a landing at Tacloban.
- **M4-R6. No `protect cv-1` objective.** The raiders cannot hurt the ship, so it could only fail by the player's own hand, and friendly fire already forfeits that sortie. Adding it would give the debrief a line that can never mean anything else.

## Review Focus

1. **The player kills wave 1 before the hold completes.** Expected: when `raid` activates, it already reads 2/4. *Task 1.*
2. **Wave 1 breaches, then the player kills everything and traps.** Expected: `Keep the raid off: failed`, then no badge, with reasons in M1 R16 order: `['Keep the raid off: failed']`, because `raid` and `home` are complete. *Task 1.*
3. **The player leaves the station to intercept far out.** Expected: the hold pauses and does not reset (spec §0.9, accumulated). *Task 1.*
4. **Raiders orbiting the carrier after a breach.** Expected: the carrier's hull HP is unchanged at 700 s. *Task 1.*
5. **The player ditches alongside the task group.** Expected: `Ditched` and no badge. The recovery multiplier is 0.5 per GAMEPLAY.md, and that is the debrief's job, which M2 pins. *Task 1.*

---

### Task 1: The Combat Air Patrol mission, headless

**Files:**
- Create: `content/scenarios/combat-air-patrol.json`, `tests/sim/mission/missions/combat-air-patrol.test.ts`
- Modify: `src/render/titleScreen.ts`, `tests/render/titleScreen.test.ts`, `tests/sim/mission/content.test.ts` (add the id to the named list)

- [ ] **Step 1: The scenario.** The ships and weather are `deck-quals`', copied verbatim at Task start:

  ```json
  {
    "id": "combat-air-patrol",
    "player": "f6f-1",
    "airfields": ["tacloban"],
    "aircraft": [
      { "id": "f6f-1", "spec": "f6f-hellcat", "airborneAt": { "position": [-14537, 3000, -36349], "headingDeg": 330, "speedMps": 120 } }
    ],
    "ships": "<deck-quals' three ships, verbatim, side: allied>",
    "weather": "<deck-quals' weather, verbatim>",
    "objectives": [
      { "id": "station", "label": "CAP station", "priority": "primary", "kind": "hold", "point": { "x": -14537, "z": -36349 }, "radiusM": 10000, "altitudeM": [1500, 5000], "seconds": 180 },
      { "id": "raid", "label": "Raid", "priority": "primary", "kind": "destroy", "targets": ["raid"], "after": "station" },
      { "id": "shield", "label": "Keep the raid off", "priority": "primary", "kind": "deny", "hostiles": ["raid"], "around": "cv-1", "radiusM": 5000 },
      { "id": "home", "label": "Recover", "priority": "primary", "kind": "land", "at": "cv-1", "after": "raid" }
    ],
    "triggers": [
      { "id": "orders", "when": { "at": 1 }, "then": [{ "message": "Essex CIC: Hold CAP over the task group, angels ten. Raid expected from the northwest." }] },
      { "id": "wave-1", "when": { "at": 60 }, "then": [{ "spawn": "wave-1" }, { "message": "Essex CIC: Bogeys bearing three-three-eight, twenty miles, angels eleven, closing." }] },
      { "id": "wave-2", "when": { "at": 240 }, "then": [{ "spawn": "wave-2" }, { "message": "Essex CIC: Second raid bearing three-three-six, twenty-two miles." }] },
      { "id": "splashed", "when": { "completed": "raid" }, "then": [{ "message": "Essex CIC: All raiders splashed. Bring it aboard." }] }
    ],
    "heldGroups": [
      { "id": "wave-1", "aircraft": [
        { "id": "raid-1", "spec": "f6f-hellcat", "tags": ["raid"], "airborneAt": { "position": [-29550, 3500, -73340], "headingDeg": 160, "speedMps": 130 }, "pilot": { "skill": "green", "ingress": { "route": [{ "x": -20000, "z": -52000, "altitudeM": 3500, "speedMps": 130 }], "destination": { "ship": "cv-1" } } } },
        { "id": "raid-2", "spec": "f6f-hellcat", "tags": ["raid"], "airborneAt": { "position": [-29350, 3500, -73540], "headingDeg": 160, "speedMps": 130 }, "pilot": { "skill": "green", "ingress": { "route": [{ "x": -20000, "z": -52000, "altitudeM": 3500, "speedMps": 130 }], "destination": { "ship": "cv-1" } } } }
      ] },
      { "id": "wave-2", "aircraft": [
        { "id": "raid-3", "spec": "f6f-hellcat", "tags": ["raid"], "airborneAt": { "position": [-31550, 3500, -74340], "headingDeg": 160, "speedMps": 130 }, "pilot": { "skill": "green", "ingress": { "route": [{ "x": -20000, "z": -52000, "altitudeM": 3500, "speedMps": 130 }], "destination": { "ship": "cv-1" } } } },
        { "id": "raid-4", "spec": "f6f-hellcat", "tags": ["raid"], "airborneAt": { "position": [-31350, 3500, -74540], "headingDeg": 160, "speedMps": 130 }, "pilot": { "skill": "green", "ingress": { "route": [{ "x": -20000, "z": -52000, "altitudeM": 3500, "speedMps": 130 }], "destination": { "ship": "cv-1" } } } }
      ] }
    ],
    "badge": { "id": "combat-air-patrol", "name": "Combat Air Patrol" },
    "briefing": {
      "situation": "You are flying combat air patrol over the Essex task group. Hold the station overhead for three minutes, then destroy the raiders before any of them gets within five kilometers of the carrier. Two waves are expected from the northwest. Recover aboard the Essex. (The raiders are drawn as Hellcats until the Japanese aircraft models land.)",
      "loadout": "clean"
    },
    "history": { "text": "<Step 2>", "sources": ["<Step 2>"] }
  }
  ```

  Add the picker row `{ value: 'combat-air-patrol', label: 'Combat Air Patrol', kind: 'mission', badge: { id: 'combat-air-patrol', name: 'Combat Air Patrol' } }`. Check the label against the existing ones: "Air Combat" is not a substring of "Combat Air Patrol", but grep `tests/e2e` for `name: 'Combat` and `name: 'Patrol` and confirm there are no hits.

- [ ] **Step 2: The historical paragraph** (spec §6.3; M3 Task 4 Step 2's rules). Draft:

  > On 24 October 1944, as the naval battle for Leyte Gulf opened, waves of Japanese land-based aircraft from Luzon attacked the carriers of Task Force 38 east of the Philippines. Commander David McCampbell, leading the Essex's Air Group 15, took a handful of Hellcats against one raid and was credited with nine aircraft that morning, for which he received the Medal of Honor. Not every raider was stopped: a single bomb that got through that day sank the light carrier *Princeton*. This mission is inspired by those fights rather than a reconstruction of them. They took place off Luzon, north of this map, and here they are staged over Leyte. The raiders are the game's stand-ins for the bombers and escorts of the real attacks.

  Sources: McCampbell's Medal of Honor citation (US Army Center of Military History, or Naval History and Heritage Command); NHHC, DANFS, "Princeton (CVL-23)" and "Essex (CV-9)".

  Claims to verify:
  - the date;
  - that the aircraft came from Luzon and were land-based;
  - TF 38;
  - McCampbell's rank, Air Group 15, "nine", and "morning" (cut it if unsupported);
  - the Medal of Honor;
  - *Princeton* sunk after a single bomb hit that day;
  - where the fight happened: off Luzon, north of the map's 200 km box (spec §6.2's geography rule).

- [ ] **Step 3: Write the failing headless runs.** `tests/sim/mission/missions/combat-air-patrol.test.ts`. Put the dated tuning comment (M3-R9) at the top, with the Measured table, the 10 km station reasoning (M4-R2) and the spawn distances. The world is built with `terrainOrSkip()`.

  ```ts
  const ON_STATION = createState({ position: v3(-14537, 3000, -36349), velocity: v3(-60, 0, -104), attitude: headingAttitude(330), gearFraction: 0 })
  ```

  `headingAttitude` is `qFromAxisAngle(v3(0, 1, 0), Math.PI / 2 - deg * Math.PI / 180)`, the construction `buildAircraft` uses.

  - **Timing pins the Measured table.** Step 3,000 ticks holding a far-away player, 90 km off, by re-applying its state each tick (`hold`), then run to 700 s. Assert the first breach tick is in [360 s, 400 s] (measured 380.4). Assert `shield` failed at that tick with `Keep the raid off: failed` in the radio. Assert the `wave-2` spawn is logged at `ticksFor(240)`. Assert `cv-1`'s hull HP is unchanged at 700 s (Review Focus 4).
  - **Success, with Review Focus 1:**
    - `hold(w, ON_STATION, ticksFor(170))`, and assert `wave-1` spawned at `ticksFor(60)`;
    - `destroyNow(['raid-1', 'raid-2'])`;
    - `hold` to 190 s, so `station` completes at 180 s (`heldTicks` is 10,800); assert `raid` activates with `count` 2;
    - `hold` to 245 s, so `wave-2` spawns; then `destroyNow(['raid-3', 'raid-4'])`;
    - assert `raid` is complete, `shield` is still active, and the `splashed` message appears;
    - `carrierApproach(w, 'cv-1')`.

    The outcome is success with the `combat-air-patrol` badge, and `shield`'s final status is `complete`.
  - **Failure (Review Focus 2):**
    - hold on station to 190 s, then keep holding to 385 s with the raiders alive, so wave 1 breaches;
    - assert `shield` failed, and that the player is alive with `impact === null` (announced, not enforced, spec §0.6);
    - `destroyNow` all four raiders;
    - `carrierApproach(w, 'cv-1')`.

    The outcome is no-badge with reasons `['Keep the raid off: failed']`. `raid` and `home` are complete.
  - **The hold is accumulated (Review Focus 3):** hold on station 100 s, move the player 20 km outside the circle for 60 s, then back on station for 80 s. `station` completes at 100 + 60 + 80 = 240 s of mission time, not 180.
  - **Ditching (Review Focus 5):** complete the hold, destroy all four, then stage a ditch 5 m over open water next to `cv-1` (M3 Task 4's staged ditch). The outcome is no-badge with `reasons[0] === 'Ditched'`.

  Run: `npx vitest run tests/sim/mission/missions/combat-air-patrol.test.ts --maxWorkers=2`. Expected: FAIL (no content yet), then PASS after Step 1. The content test, `options.test.ts` and `titleScreen.test.ts` also pass.

- [ ] **Step 4: Probe, not a gate: can a player actually shoot the raiders?** A player's gunnery is Mark's to judge, not a test's. Still, record in the handoff whether a scripted interception kills a raider. Use the approach `src/sim/ai/autoPursuit.ts` provides for the player's seat, if it does; read its header first. Run it against `raid-1` from 3 km astern, in `.superpowers/m4/intercept.ts`, for 120 s, and record kills, hits and rounds. If it never hits, say so in the handoff next to 7e handoff §5 item 1. Nothing in this plan changes because of it.
- [ ] **Step 5: Verify and commit.**

  ```bash
  remote-run npm run verify; rc=$?; echo "rc=$rc"   # rc=0
  git add content/scenarios/combat-air-patrol.json tests/sim/mission/missions/combat-air-patrol.test.ts src/render/titleScreen.ts tests/render/titleScreen.test.ts tests/sim/mission/content.test.ts
  git commit -m "M4 Task 1: Combat Air Patrol: hold over the Essex, two raider waves on 7e's ingress pilot, keep them outside 5 km"
  ```

---

### Task 2: Tier 2 on the reference GPU

**Files:**
- Modify: `tests/e2e/missions.spec.ts` (M3's file; add one test)

- [ ] **Step 1: The test.**
  - Orders with a new pilot, select `Combat Air Patrol`, and assert the briefing: situation, `Background`, `Sources:`, the four objective labels, and the badge. Screenshot to `test-results/m4-cap-briefing.png`.
  - Launch, which starts airborne. Assert the objective line shows the hold. Take its exact text from `tests/render/mission/hud.test.ts`, which pins M2's hold format (seconds from `Math.floor(heldTicks * DT + 1e-9)`). Wait for the radio `Essex CIC: Hold CAP over the task group…`.
  - Wait for the `wave-1` spawn: `expect.poll(() => __ww2.mission().spawned, { timeout: 90_000 }).toEqual(['wave-1'])`. Then assert `meshes` shows `raid-1` and `raid-2` visible, and `raid-3` and `raid-4` hidden. Assert the radio shows the bogey call.
  - Open the chart (`P`): it lists the four objectives and marks the raiders. Screenshot to `test-results/m4-cap-chart.png`.
  - `diveToSea`. The debrief shows `CAP station` (INCOMPLETE or COMPLETE, whichever is true at that moment; assert only that one of the two stamps is present), `Ditched — no badge`. Screenshot to `test-results/m4-cap-debrief.png`.
- [ ] **Step 2: Run** on `ww2airsim-2` or `-3` (M3 Task 8 Step 2's commands), with spec paths: `tests/e2e/missions.spec.ts tests/e2e/mission-ui.spec.ts`. Everything must pass. Look at the screenshots, and copy the three M4 PNGs to `docs/handoff/<date>-m4-shots/`.
- [ ] **Step 3: Commit.**

  ```bash
  git add tests/e2e/missions.spec.ts docs/handoff/*-m4-shots/
  git commit -m "M4 Task 2: Tier 2 for Combat Air Patrol on the reference GPU"
  ```

---

### Task 3: Handoff, §15 row, README, GAMEPLAY, email

- [ ] **Step 1: The handoff.** Write `docs/handoff/<date>-m4-combat-air-patrol.md`. It covers:
  - what changed;
  - the re-measured table from P4;
  - the rulings, including the executor's own;
  - the verified history claims;
  - Tier 2 and the captures;
  - the Task 1 Step 4 probe result;
  - forward notes for the campaign spec (§6): the four missions exist, the respot and `approaches` are available, and AI gunnery is still open (7e §5 item 1).
- [ ] **Step 2: Master spec §15.** Mark the missions sub-track (M1-M4) complete, with the date and links, in the meta-game row. Make the Plan 7 row's pointer to M4 consistent with the new status.
- [ ] **Step 3: README and GAMEPLAY.md.** Add a README paragraph pointing at §15. In GAMEPLAY.md:
  - change item 6's one-liner from "fighter sweep" to the mission as built: "hold CAP over the carrier and turn back the raids", citing missions spec §4.4;
  - add Combat Air Patrol to "Shipped today".
- [ ] **Step 4: Verify, commit, push the branch, email.**

  ```bash
  remote-run npm run verify; rc=$?; echo "rc=$rc"   # rc=0
  git add docs/handoff/ docs/superpowers/specs/2026-09-12-ww2airsim-design.md README.md GAMEPLAY.md
  git commit -m "M4: handoff, §15 row, README and GAMEPLAY say what shipped"
  git push -u origin worktree-missions-track
  python3 tools/mail-doc.py docs/handoff/<date>-m4-combat-air-patrol.md "ww2airsim M4 handoff: Combat Air Patrol"
  ```

  Never re-run `mail-doc.py` with `--debug`. Do not merge into `main`.

---

## Self-review

- **Spec coverage:**
  - §4.4: `hold` a station over the Essex for 180 s, then `destroy raid`; two held waves at 60 s and 240 s on an ingress route; `deny` 5 km around `cv-1` → Task 1;
  - "Depends on 7e": merged, and measured against the real pilot;
  - badge, briefing and history → Task 1;
  - §5 headless success and failure → Task 1;
  - Tier 2 → Task 2;
  - content checks → M3 Task 7's test, which now includes this file.
- **Placeholders:** the history `text` and `sources` are verified drafts (M3's rule). The ships and weather are copied from `deck-quals` by instruction. There are no others.
- **Type consistency:** everything consumed is from M1, M2, M3 or 7e, by the names those plans produce (`hold`, `carrierApproach`, `destroyNow`, `terrainOrSkip`, `ticksFor`, `missionOutcome`, `recoveryOf`, `radioMessages`, `__ww2.mission()`).
