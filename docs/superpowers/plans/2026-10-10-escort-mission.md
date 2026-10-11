# Escort mission bundle — plan

**Mark's decisions (2026-10-10, relayed with the task):**

- **Escort:** the player, in a Hellcat, escorts a US bomber formation (B-17s and/or B-29s, from E3) to a Japanese target while Zeros intercept. **Win if most bombers reach and bomb the target.**
- **Viewing checkpoint:** the final product only.
- **Run:** unattended, to completion.

**Branch:** `escort-mission`, in the worktree `.claude/worktrees/agent-a760a41b3978ca82f`, cut from `main` at `cbc7d5ff`. Not merged; merging is Mark's call.

**Parallel work (2026-10-10):** M4 main batteries and Track E fixes (wingman commands, the 7c list, `disengageThreshold`) run in other worktrees. This plan touches shared AI files (`pilotTick.ts`, `formation.ts`, `ingress.ts`, `attack.ts`) and the scenario schema (`scenario.ts`) in small, marked places; the handoff lists them.

## Three pieces, in order

### 1. Formations through turns (E3 open item 1)

**Fault, confirmed first** (a probe through production `advance`, then a test that fails): E3's mixed formation (B-17 leading a B-29, a G4M and a Ki-21) at 90 m/s, 8,200 ft, through a 90-degree waypoint. The leader's velocity controller banks it to 83 degrees. Its inside wingmen fall to 33.4 m/s (Ki-21; stall 41.8) and 52.3 m/s (B-29; stall 57.7), and station errors reach 330 to 750 m.

**Fix:**

- A bomber formation leader (a leader with wingmen and no fixed guns) flies its route, orbit and bomb run on the lift-vector law with a bank limit, `FORMATION_LEADER_MAX_BANK_RAD`.
- It counts a waypoint reached within its own turn radius at that bank, so a wide turn cannot circle a 1 km capture ring.
- Fighter leaders are unchanged: 7f tuned the station law on Hellcats.

**Test:** `formationBombing.test.ts`, "a bomber formation turns a corner": a left and a right 90-degree turn. Every wingman stays above 1.3 × its own stall speed and within 60 m of station. It must be seen red with the limit removed.

### 2. Escort pursuit (Track E fixes, 7f §4.2; MASTER_PLAN §4 decision 11)

**Today:** a wingman out-energized by an attacker on its leader picks Extend or Break, never Pursue, so it never fires. The spec's assertion is skipped in `formationCover.test.ts`, and `docs/testing.md` lists it under "Known gaps".

**Fix:** a wingman whose target is attacking its leader pursues it, whatever the energy. "Attacking" means inside the cover range, flight path within 30 degrees of the leader. The exceptions are the existing safety cases: the attacker has the wingman in its own guns, or the two are inside the collision range.

**Test:** un-skip the test under the decided wording ("fires within gun solution"): the wingman pursues, fires, and never fires outside gun range. It must be seen red with the override removed. Remove the "Known gaps" entry.

### 3. The Escort mission (Track F)

**GAMEPLAY.md's design:** "Escort: protect a B-17 formation". Reconciled with Mark's decision as rulings:

- **Bombers:** four B-17s, one finger-four, veteran pilots and gunners. GAMEPLAY names the B-17 and Mark allows B-17s or B-29s, so B-17 satisfies both.
- **Target:** the Japanese strip at Dulag, aimed at its hangars. The same strip is Airfield Strike's target.
- **Win:**
  - "most bombers" means at least three of four survive (`protect`, `maxLost: 1`);
  - "bomb the target" means at least one Dulag hangar destroyed by the bombs (`destroy`, `count: 1`);
  - every shipped mission also requires a landing for the badge (`missionOutcome`), so "Recover at Tacloban" is a primary objective after the strike.
- **Zeros:** four (one veteran leader, three green wingmen), spawned a minute in, on an ingress route to the formation's turn point. Shooting them all down is a secondary objective.
- **One engine addition:** an airfield destination may name `aim`, a building id or tag. The level-bombing run then aims at the middle of those buildings, not at the runway center.
  - Measured: aimed at the runway, the formation's 32 bombs fell on the strip and missed both hangars, which stand 146 m off its centerline.
- **Radio:** text-only lines (`null` in `RADIO_LINES`), as B4 and Flattop Hunt did.
- **Briefing and history:**
  - The history note is honest, cited and "inspired by".
  - B-17s stand in for the Far East Air Forces' B-24s, which the game lacks.
  - Dulag was in American hands within days of the landing.

**Tests, enrolled like the other missions:**

- `tests/sim/mission/missions/escort.test.ts`:
  - content shape;
  - at Recruit, Veteran and Ace: the unescorted formation loses more than one bomber, so the mission needs the escort;
  - with the Zeros gone, the formation bombs the hangars with every wingman flying;
  - success path to the badge;
  - failure path.
- Registry tests: title picker, mission list.
- `tests/e2e/missions.spec.ts`: briefing, objective line, opening call, chart and debrief on the reference GPU.

## Verification

- `REMOTE_RUN_OVERFLOW=0 remote-run npm run verify` on ryzen.
- The missions E2E case on a GPU: the nexus 680M under `hwlock nexus-compute`, or ryzen's through a dev slot.
- No rendering change, so no budget-spec run.

## Done means

- Each piece is committed on the branch.
- The handoff `docs/handoff/2026-10-10-escort-mission.md` is written and emailed.
- The MASTER_PLAN status lines say "built on branch, not merged".
- Order-table row 7's "D torpedoes" is struck if verified done.
