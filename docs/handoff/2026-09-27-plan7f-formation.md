# Plan 7f handoff: formation, wingmen and escort

Dated 2026-09-27. Branch `worktree-ai-7f-formation`, cut from `main` at the
merge-base `134fe22` (the 7f design commit), pushed; **not merged** (Mark's
call). Design: [2026-09-27-ai-7f-formation-design.md](../superpowers/specs/2026-09-27-ai-7f-formation-design.md)
(amends [7c-7g design](../superpowers/specs/2026-09-25-ai-7c-design.md) §5).
Plan: [2026-09-27-ai-7f-formation.md](../superpowers/plans/2026-09-27-ai-7f-formation.md).
Ledger: `.superpowers/sdd/2026-09-27-ai-7f-formation/progress.md`. Master
spec §15 holds the status. Mark's viewing checkpoint: final product only,
unattended run (see §5 below).

Every figure below was measured on 2026-09-27, headless through production
`advance` on node, unless marked "reference GPU" (not run this plan — Task 9
waits on the sortie forms, see Open item 3).

## 1. What shipped, per task

| Commit(s) | Task | What |
| --- | --- | --- |
| `dfa718e` | Task 1 | `pilot.leader` / `pilot.slot` content, `FormationOrders`, `PilotDecisionState.coverUntilS?`; `checkLeaders` schema validation (self-leading, unknown leader, cross-side leader, chained leader, taken slot) for both starting aircraft and held groups. |
| `938ad6e` | Task 2 | `src/sim/ai/formation.ts` created: `STATIONS`, `TRAIL_COVER`, `stationPoint`, `stationDesiredVelocity`, `formationThrottle`, `formationControls`, `stationErrorM` — pure, `sim/`-only. |
| `0c14e11`, `c037dab` | Task 3 | Wired into `pilotTick`; round 1 (`0c14e11`) shipped `DONE_WITH_CONCERNS` with 3 of 4 bounds missed (root-caused, not guessed at — see the task-3 report). Round 2 (`c037dab`, fresh implementer) fixed the station-keeping law itself: leader velocity fed forward through the turn, a stiffer vertical gain, retuned throttle and closure gains. All bounds pass (§1b below). |
| `47bb568`, `22794bc` | Task 4 | Cover rule: `COVER_RANGE_M`, `COVER_RELEASE_RANGE_M`, `COVER_LATCH_S`, `leaderIsFighting`, `wingmanAccepts`. Fix round 1 (`22794bc`) retracted a wrong R-F1 diagnosis and un-skipped the escort formation-hold test after the review found the real cause (§3 ruling below). |
| `985053e` | Task 5 | `leaderlessPilot` (a wingman whose leader is down or gone takes on the leader's ingress route, or just flies on); the parked-leader loiter case; the join-once-airborne case. |
| `dc4f692` | Task 6 | `formationSoak.test.ts`: a flight of four follows an ingress leader end to end (478.6 s full route, measured — the plan's 360 s loop bound was short and was corrected, not loosened); determinism/array-order/`structuredClone` soak; a jinking-player-leader case (controller ruling). |
| `6f09f99` | Task 7 | `furball-range`'s `ally-1` flies as the player's wingman (`leader: "f6f-1", slot: 1`). The R-F1 opening-bounce kill (`bandit-2` by `ally-1`) held unchanged in all four loadouts. |
| `398fccc`..`fb90a6c` | Final-review fix wave | See §3 — five findings, all fixed: C1 (parked-flag bug), I2 (duplicate slot bookkeeping), I3 (escort skip comment), M4 (no turn feed-forward on trail cover), M6 (target retained after leader dies). |

### 1b. Task 3 round 2 — final measured bounds

| Scenario | Measured | Bound |
| --- | --- | --- |
| Straight RMS, slot 1 / 2 / 3 | 11.6 / 11.3 / 18.4 m | < 25 m |
| Turn RMS, slot 1 / 2 | 16.2 / 18.2 m | < 60 m |
| Rejoin from 2 km astern | 75.8 s | < 90 s |
| Ahead-of-station final error | 6.2 m | < 50 m |
| Ahead-of-station min speed | 73.4 m/s | > 52.6 m/s (1.2 x stall) |

## 2. Every tuning constant in `src/sim/ai/formation.ts`

All measured 2026-09-27, method and sensitivity in the file's own comments
(`.superpowers/7f/r2sweep.sh` + `r2measure.ts`, Task 3 round 2). Not
restated here beyond the chosen value — read the file for the full sweep
tables:

| Constant | Value | Note |
| --- | --- | --- |
| `CLOSURE_GAIN_PER_S` | 0.2 | Mid-plateau of a flat 0.1-0.8 range once the closure clamp binds. |
| `MAX_CLOSURE_MPS` | 40 | Spec's own figure; kept, not re-derived. |
| `MAX_FORMATION_VERTICAL_MPS` | 25 | 10 fails the turn bound (35/115 m); 15+ passes. |
| `VERTICAL_GAIN_PER_S` | 1 | Stiffer than horizontal, like `holdHeight`; 0.5 settles 23-28 m low, 2 buys only 1-3 m more. |
| `TURN_LEAD_PER_BANK` | 0.6 | Next to the velocity controller's own 0.625 (1/1.6 bank gain); 0.5-0.65 passes, 0 or 0.7 does not. |
| `MIN_SPEED_STALL_FACTOR` | 1.3 | Never binds in any scenario tested (1.2/1.3/1.5 identical results). |
| `FORMATION_THROTTLE_BASE` | 0.85 | |
| `FORMATION_THROTTLE_GAIN` | 0.2 | 0.05 fails the straight bound (26/25/29 m); 0.1+ passes. |
| `COVER_RANGE_M` | 3000 | Spec-set (spec §4), not measured — same scale as `INGRESS_ENGAGE_RANGE_M`. |
| `COVER_RELEASE_RANGE_M` | 4500 (1.5x `COVER_RANGE_M`) | Spec-set, not measured. |
| `COVER_LATCH_S` | 5 | Spec-set, not measured. |

## 3. Rulings made on Mark's behalf

All 23 `Ruling:` lines from the ledger (`.superpowers/sdd/2026-09-27-ai-7f-formation/progress.md`), in ledger order, each with its cost if wrong. (An earlier draft of this handoff listed 19 of the 23 — the four added below are marked **[added in fix round 1]**.)

1. **Pre-flight, T4 escort test geometry.** The plan's own escort test measured "entered cover" as range to the leader only, but the filter (spec §4) also accepts range to the wingman — the plan's test contradicted its own filter. *Cost if wrong: only a test's timing reference moves.*
2. **Pre-flight, T5 join case — THIS RULING WAS WRONG, superseded by final-review fix C1.** Added the "joins once airborne" case by flipping the parked leader to airborne mid-test (edit the world: `parked: false`, airborne state at 3,000 m heading east, 120 m/s) and asserting `mode === 'formation'` within 1 s and station error < 50 m within 90 s, because the spec's Acceptance lists "then joins once airborne." *Cost if unneeded: one more test — but the cost that actually landed was different: `parked` is a one-time spawn flag nothing in the sim ever clears in flight, so hand-flipping it in the test exercised a state the game itself never produces. The final review caught this (finding C1) and replaced the `!leader.parked` reads with `leaderAirborne`, a state-based ground-contact test; see the fuller account after this list and Open item 1, which the mistake led to finding.*
3. **Pre-flight, Task 9 precondition.** Task 9 is not dispatched this run; the sortie-forms precondition is unmet as of 2026-09-27, and the spec lets 7f merge without it. *Cost: none — Tier 2 stays open, tracked in §5.*
4. **T1 held-group schema test.** The plan's test was missing required trigger scaffolding (`checkMission` requires each held group spawned by exactly one trigger); added the minimal triggers so the leader rule, not an unrelated scaffolding gap, is what the test proves. *Cost if wrong: none, test-only.*
5. **`npm run verify` cadence.** Ran on ryzen after each task's review, before the next dispatch, rather than deferred to Task 8 as the plan text said, because repo `CLAUDE.md` says verify ends every task. *Cost if unneeded: ~2.5 min per task.*
6. **T2 review "tuning constants lack measured-when comments."** Closed by Task 3 Step 5's rewrite of the comments (with measured values and dates), since Task 3 is where the measurement exists. *Cost if Task 3 had missed it: caught by the final review instead — it didn't.*
7. **T3 turn-test fixture.** The plan's leader script (`levelTurn(1.155)`) stalled a *lone* aircraft in 60 s (confirmed by probe), independent of any formation code — replaced it in `formationWorlds.ts` with a speed- and altitude-holding turn; `maneuverWorlds.ts` (the shared fixture) was left untouched. *Cost if wrong: the turn case tests a different leader flight than the plan specified.*
8. **T3 leader speed.** Rejoin/straight tests fly the leader at 110 m/s, not 120-130, so an F6F wingman has overtake margin below its ~150 m/s ceiling, because real formation leaders fly reduced power and spec §3 needs a closable station. *Cost if wrong: the bounds only hold for a leader with margin — true of every real formation, so treated as low-risk.*
9. **T3 round-1 finding.** The round-1 80 m straight-line floor was flat across gain 0.1-0.8 — a steady offset, not an acceleration limit — so the task was re-dispatched to a more capable implementer (opus) to decompose the error and fix the law itself, rather than accept the loosened bound. Allowed: new terms (held as plain decision data), changing `MAX_CLOSURE_MPS`; bounds unchanged. *Cost if wrong: a rework of Task 2's law, which is what happened regardless — round 2 fixed it.*
10. **Spec §3 sentence, deferred to Task 8.** The shipped law (leader velocity fed forward through its turn; stiffer vertical gain) should be described in spec §3's own words. *Done in this task, §7 below. Cost if wrong: trivial — a sentence.*
11. **Jinking-leader risk, deferred to Task 6.** A noisy one-tick turn-rate estimate under a jinking player leader was named a risk at Task 3 round 2 and given a bounded-error/no-NaN case in Task 6's soak. *Cost if unneeded: one more test — it ran clean (89.5 m max error, 7.3 m after 30 s level).*
12. **`skyLoad.test.ts` timeout, first sighting (Task 3).** Judged load flakiness in an untouched render test; ruled that the next verify must come back green or it gets re-examined. *Cost if wrong: it would recur — it did (item 13), and was later confirmed environmental (item 17), not a 7f regression.*
13. **[added in fix round 1] `skyLoad.test.ts` timeout, second sighting (Task 3).** After the next verify failed the same way, ruled it a pre-existing slow render test under machine contention, not this branch (untouched by 7f; passes alone) — recorded in the handoff as an open item (timeout margin), not fixed. *Cost if wrong: it's a real regression, and it would show on `main` too — worth re-checking there if it recurs.*
14. **[added in fix round 1] The escort-hits stop condition (Task 4 dispatch).** If escort hits fail on AI gunnery, only that one test is `it.skip`, with a comment pointing at R-F1 and the handoff, and everything else commits; Mark decides the assertion. Ruled because the plan said stop and report on this specific gap, but an unattended run must not stall waiting for that. *Cost if wrong: one skipped test sits open until Mark rules on it — no other cost, since it was an explicit, bounded stop condition, not a guess. (In the event, the round-1 diagnosis behind the first skip was itself wrong — see ruling 15 below — but the stop-condition mechanism this ruling set up is what let that get corrected without stalling the run.)*
15. **T4 escort ruling — no Pursue bias for wingmen.** Defending when attacked from astern is correct 7b behavior; the spec does not ask to override it. The escort test's geometry was changed so the attacker approaches from the leader's left rear quarter (off the wingman's own six) instead of directly astern; if that geometry still never reached Pursue, only the hit assertion could be skipped, with the measured cause in the comment. It didn't reach Pursue either. *Cost if Mark wants escorts that ignore their own six: a new ruling and a 7b follow-up.*
16. **T4 fix-round ruling — escort "attacker takes hits" stays unmet.** 7b never picks Pursue against an attacker the wingman turns to meet, in either geometry measured; this is inherited 7b/7c behavior (cf. 7c ruling R4, head-on passes at ~22 m), not a 7f defect. The hit assertion stays skipped with the measured cause; raised to Mark as an open question (§4.2 below). *Cost if Mark wants escorts that shoot: a 7b weighting follow-up.*
17. **`skyLoad.test.ts` timeout, confirmed by measurement (Task 5 dispatch).** Re-ran `verify` at the branch base `2a1f37f` (no 7f code) at 14:37 on 2026-09-27: it also failed `skyLoad` (121 s), with `gunzip.test` at 166 s (was 68 s at 13:25) — ryzen's WSL got roughly 2.5x slower on the inflate tests after a restart around 14:03. Branch verify is judged "green except skyLoad" until that clears. *Cost if wrong: a real regression would show on main too, and hasn't been re-checked there.*
18. **[added in fix round 1] T6 does not tune `formation.ts` even if the 150 m leg-end bound fails.** The plan said tune, but Task 3's constants are already tuned against the bounded tests, and retuning them inside a soak risks regressing those bounds unreviewed. *Cost if the bound fails: a later, separate tuning pass — moot here, since the bound did not fail (Task 6 measured every wingman within 150 m of station at each leg end, and the soak passed 4/4).*
19. **[added in fix round 1] The final whole-branch review runs BEFORE Task 8 (docs/handoff/push).** So the handoff records the reviewed final state and every ruling, rather than a mid-review snapshot; Task 8 becomes documentation of the already-reviewed result. *Cost if wrong: none — this is the ordering that was actually followed, and this handoff is written after the fix wave, over `398fccc..fb90a6c`.*
20. **Final review — fix-wave scope.** The fix wave covers C1, I2 (with Task 1's deferred slot-bookkeeping minor folded in), I3, M4 (omit the turn feed-forward for `TRAIL_COVER`) and M6; M5 is recorded in this handoff, not fixed; every other deferred minor stays deferred per the review's own triage. *Cost if any of the deferred minors matter: a follow-up task.*
21. **Final review — escort skip cause, superseding my Task 4 ruling.** The escort never pursues mainly because of the energy deficit (the 110 m/s escort against a 150 m/s attacker), not "threat astern" as my Task 4 ruling's text said. The skip of the hit assertion stands; the question to Mark is now framed on energy, not on the geometry. **This supersedes ruling 15/16's stated cause, not the skip itself.**
22. **Final review — `targeting.ts`'s `isContact` excluding `c.parked` is raised to Mark, not fixed here.** It is 7e's code (a forbidden file for this plan) and a live bug on `main`, not a 7f defect. See Open item 1.
23. **Task 8 (this task) — no checkpoint capture.** Both `ww2airsim-2`/`-3` dev-server slots returned 200 (in use by other sessions) and the primary serves `main`, so no capture was taken this run. The handoff instead gives Mark the post-merge viewing steps (§6). *Cost: Mark takes one look after merge instead of reading a capture now.*

**Fuller account of ruling 2 being wrong, and its fix (final-review C1).** I
ruled that the join test should hand-flip the leader's spawn flag
(`parked: false`) mid-test to simulate takeoff. That flag is a one-time
spawn marker nothing in the sim ever clears in flight, so a real player who
launches from a deck or runway stays `parked === true` forever —
my test exercised a state my own ruling had manufactured, not what the game
ever produces. The final review caught it (finding C1) and replaced the
`!leader.parked` reads with `leaderAirborne`, a state-based ground contact
test (`onGround` against `groundUnder`, the same test `canRelease` in
`weapons/combat.ts` uses for "parked"). The join test in
`formationLeader.test.ts` was rewritten to launch a leader from an actual
deck spawn through production `advance`, rather than hand-flip the flag. See
`src/sim/ai/formation.ts`'s `leaderAirborne` doc comment for the full
reasoning, and Open item 1 below for the live-bug consequence elsewhere in
the sim that this ruling's mistake led to finding.

## 4. Open for Mark

### 1. LIKELY LIVE BUG ON MAIN (not 7f's code): AI may never target a player who took off from a deck or runway

`parked` is a spawn flag nothing clears in flight. `src/sim/ai/targeting.ts:54`
(`isContact` rejects `c.parked`) and `src/sim/ai/autoPursuit.ts:51` both read
it, so an AI's target selection and its Shift-pursuit autopilot may both
silently exclude a player who spawned parked and took off, for the rest of
the flight. Airfield Strike (M3) spawns the player parked on the ground with
two green defenders that choose their targets through `isContact` — that
mission's own M3 handoff says its dogfight was "never flown headlessly"
(the verdict path is proven, not the actual AI engagement). This is
indicated by code reading and by 7f's own C1 probe (`leader.parked` stayed
`true` at 213-399 m of altitude, confirmed independently); it was **not**
run against Airfield Strike itself, so whether its defenders actually fail
to engage is unconfirmed, not proven. Suggested fix: the same state-based
check 7f uses for its own leader (`leaderAirborne` in `formation.ts`, built
on the same test `canRelease` already uses).

### 2. Escort pursuit: an escort wingman never chooses Pursue against an attacker on its leader

0 Pursue ticks in both geometries measured (directly astern and 45° off the
leader's left quarter), mainly from the energy deficit: the escort holds
its leader's 110 m/s while the attacker flies 150 m/s, a relative energy
deficit of about -4,900 J/kg, and 7b's decision layer picks Extend on
roughly 65% of ticks under that deficit. The spec's "attacker takes hits"
acceptance item is skipped (`it.skip`, with this measured cause in the
comment) rather than met. This is a 7b weighting question, not a 7f defect:
**should an escort pursue an attacker despite an energy deficit, when the
attacker is on its own leader?**

### 3. Tier 2 (Task 9) waits on the sortie forms landing on `main`

Unchanged from the pre-flight ruling — the precondition is still unmet as
of 2026-09-27.

### 4. Mission content follow-ups

- CAP raider pairs could use `pilot.leader`/`pilot.slot` so a raid pair
  flies as a real formation instead of two independent ingress routes.
- A player wingman in Combat Air Patrol (mirroring `furball-range`'s
  `ally-1`).

### 5. Wingman commands are still unbuilt

7c-7g design's Open item 5 (unchanged; not attempted by 7f).

### 6. Wingman speed can fall to ~38 m/s after following a vertical roll

Below the 1.2x stall floor bound this plan uses elsewhere. Recorded (final
review M5), not fixed — out of the fix wave's scope per ruling 20 above.

### 7. Deferred minors (ledger triage; not fixed by the final fix wave)

- **Task 3:** the controller's private 1.6 bank gain is duplicated by
  `TURN_LEAD_PER_BANK` and `formationWorlds.ts`'s
  `LEADER_BANK_PER_HEADING_ERROR` — export it instead.
- **Task 3:** anisotropic gains feed an isotropic 40 m/s norm clamp; a
  large height error could starve horizontal closure (untested — every
  case tried is co-altitude).
- **Task 3:** `LEADER_THROTTLE_GAIN` (a test fixture constant) lacks its
  own measurement.
- **Task 3:** the turn feed-forward unit test checks sign only, not
  magnitude.
- **Task 3:** `STANDARD_GRAVITY_MPS2` is redeclared locally in
  `formation.ts` (matches house style elsewhere; not a defect, just noted).
- **Task 4:** the left-quarter escort geometry's closest approach is 7.8 m
  (no aircraft-vs-aircraft collision model exists to catch it) — a
  razor-thin canned case, worth a look if that test is ever extended
  toward an `impact` assertion.
- **Task 6:** `SOAK_S` is a module `const`, not an `export const` (matches
  the test-local fixture style used elsewhere in the suite).
- **Final review:** `formationCover.test.ts:463-464` has an odd line wrap
  (cosmetic).
- **Final review:** `boundary.test.ts`'s "leaves no probe in the real
  source tree" case sits close to its 30 s timeout under a full parallel
  `verify` on ryzen (21-31 s measured across this branch's runs, pre-existing
  and not caused by 7f — passes alone in 5.9 s).
- **Final review:** `leaderAirborne` goes true the tick the wheels leave the
  surface; a bounce during takeoff roll could flip the mode to `'formation'`
  at a rescore, bounded to one `reactionS` by the flight guard re-checking
  every tick. Not observed in the launch test.

## 5. Full verify

`remote-run npm run verify` was not re-run by this task per the controller's
instruction (the controller already holds the results from the final fix
wave's own verify runs). Status as of the final fix wave (`fb90a6c`,
`.superpowers/sdd/2026-09-27-ai-7f-formation/final-fix-report.md`):
typecheck, lint (zero warnings) and depcruise clean; 3,243 tests passed, 2
skipped, against two known, environmental failures, neither caused by this
branch:

- **`tests/render/skyLoad.test.ts`** times out under full parallel `verify`
  on ryzen. Measured failing identically at the branch base `2a1f37f` (no
  7f code) at 14:37 on 2026-09-27, alongside a `gunzip.test` that had grown
  from 68 s to 166 s in the same window — ryzen's WSL got roughly 2.5x
  slower on its inflate tests after a restart around 14:03. It passes alone
  (74 s, well under its 120 s budget). Untouched by 7f; render-only.
- **`tests/architecture/boundary.test.ts`**'s "leaves no probe in the real
  source tree" case occasionally lands at 21-31 s against its 30 s timeout,
  under the same full-parallel load. It passes alone in 5.9 s. Pre-existing
  (unrelated to 7f's `sim/`-only changes); the final fix wave measured this
  once, and earlier task verifies on this branch ran the same case at
  21.5-27.7 s, so it is a margin problem under load, not a new flake this
  plan introduced.

## 6. Viewing checkpoint (final product only, unattended)

No capture was taken this run: both dev-server slots
(`ww2airsim-2.windomlane.org`, `ww2airsim-3.windomlane.org`) returned 200 at
the time of writing — in use by other sessions — and the primary serves
`main`. After this branch is merged (Mark's call), open
`https://ww2airsim.windomlane.org/?scenario=furball-range` (pick "Furball
(dev)" on the title screen), chase view. `ally-1` starts on the player's
right wing (slot 1) and should break off to bounce `bandit-2`, then rejoin
formation once it's down. Before sending Mark there, assert the host is
actually up:
`curl -sS -o /dev/null -w '%{http_code}\n' https://ww2airsim.windomlane.org/`
should print `200`.
