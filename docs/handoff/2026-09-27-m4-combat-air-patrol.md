# M4 handoff: Combat Air Patrol (2026-09-27)

Branch `worktree-missions-track`; **merged to `main` 2026-09-27 (`5134e9f`, verified with `git merge-base --is-ancestor`)**, after this handoff was written. Plan:
[2026-09-26-m4-combat-air-patrol.md](../superpowers/plans/2026-09-26-m4-combat-air-patrol.md).
Spec: [2026-09-25-missions-design.md](../superpowers/specs/2026-09-25-missions-design.md)
§4.4, §5 and §6.3. Ledger:
`.superpowers/sdd/2026-09-26-m4-combat-air-patrol/progress.md`.

**Viewing checkpoint: none. Run: unattended (Mark, 2026-09-26).** The final
product was captured on the reference GPU for Mark to inspect later.

M4 completes the missions sub-track. **Combat Air Patrol** starts the player
airborne over the Essex task group. The pilot must hold a fixed 10 km station
for three minutes, destroy two inbound waves, keep every raider outside 5 km
of the carrier, and recover aboard Essex. The mission carries its own badge,
briefing and cited history. Two headless verdict paths and the complete browser
surface were exercised; the player still has to do the shooting.

## 1. What changed

| Commit | Task | What |
| --- | --- | --- |
| `fd2ad3e` | 1 | `content/scenarios/combat-air-patrol.json`; the title-screen mission row; six headless CAP tests; four-mission content coverage. `stageDitch` moved into the shared mission flight kit and Deck Quals now consumes it. |
| `a831207` | 2 | Reference-GPU Tier 2 for the briefing, live CAP counter, CIC calls, held raider spawn, chart objectives and no-badge debrief; three frozen captures under `docs/handoff/2026-09-27-m4-shots/`. |
| `85e8256` | Integration | Current `main`, including R4's tower and AAA work, merged into the missions branch before the final gate. |
| This commit | 3 and final review | Corrected the history to Task Group 38.3; made the success run continue beyond the natural breach time before proving the shield stayed active; corrected the Zero id in the missions spec; this handoff and the §15, README and GAMEPLAY status updates. |

The shipped mission count on this branch is now 15: the 11-scenario baseline,
M3's three missions and M4's Combat Air Patrol.

## 2. Measured numbers, re-measured

The timing probe and the headless timing test use the shipped
`a6m2-zero` raiders on 7e's ingress pilot. The player is held passive far from
the route. Measurements are from 2026-09-27:

| Wave | Spawn | First inside 5 km of `cv-1` | Spawn to breach | Closest approach |
| --- | --- | --- | --- | --- |
| 1 (`raid-1`, `raid-2`) | 60 s, tick 3,600 | 384.6 s / 385.4 s | 324.6 s | 612 m / 608 m |
| 2 (`raid-3`, `raid-4`) | 240 s, tick 14,400 | 567.6 s / 568.2 s | 327.6 s | 619 m / 603 m |

- The primary `shield` objective failed at tick **23,078**, on the first
  breach, and `Keep the raid off: failed` was logged on that same tick.
- Essex kept **600 HP before and after** the 700 s passive run. The raiders
  orbit after reaching the carrier; they have no bombing or torpedo AI.
- The measured simulation cost was **0.024 ms/tick**.
- The Essex loop's farthest waypoint is **9,509.7 m** from the fixed station
  center, not the plan's 9.3 km. All four waypoints and their connecting legs
  remain inside the 10 km station.
- The success run kills wave 1 during the hold, activates `raid` at 2/4,
  kills wave 2, then continues to **420 s**, beyond the unopposed 384.6 s
  breach. `shield` remains active before the trap and badge verdict.
- The 1,800-tick production digest changed by exactly one added line,
  `combat-air-patrol`; every pre-existing scenario digest was byte-identical.

## 3. Rulings

### Plan rulings

- **M4-R1 — airborne start.** The player starts on station at 3,000 m,
  heading 330°, clean. Deck Quals already exercises a carrier launch. Cost if
  reversed: a `parkedAt` content edit and roughly another minute of hold.
- **M4-R2 — fixed station.** `hold` accepts a point, not an entity. The fixed
  10 km circle at the Essex loop's centroid covers the entire loop. Cost:
  none while the route stays inside its tested bound.
- **M4-R3 — raid after station.** `destroy raid` activates after the hold.
  Kills made during the hold still count when it activates. Cost: none; this
  is the ordering specified by §4.4.
- **M4-R4 — the 5 km shield is primary.** A breach costs the badge but does
  not end the flight; the pilot can still recover and bank points. Cost if
  reversed: mission and verdict semantics.
- **M4-R5 — recover at Essex.** The final landing must be at `cv-1`, not an
  airfield. Cost if reversed: one objective target and its tests.
- **M4-R6 — no protect objective.** Raiders cannot damage the ship, and
  friendly fire already forfeits the sortie. A protect row would add no new
  honest failure mode.

### Execution rulings

- **M4-PF1 — Zero raiders.** The plan's Hellcats were temporary until the
  Zero landed. M4 uses `a6m2-zero`, drops the Hellcat disclaimer, and pins the
  Zero timing to [365, 405] s. Cost if reversed: a content id and retuned pin.
- **M4-PF2 — one staged ditch helper.** `stageDitch` is exported from
  `tests/sim/mission/fly.ts`; both Deck Quals and CAP consume it. Cost: none.
- **M4-PF3 — a steep sea impact is Killed.** Tier 2 asserts
  `Killed — no badge`, matching M3's measured dive outcome, not the brief's
  `Ditched` draft. Cost: none.
- **M4-T1-D1 — loop reach.** The measured farthest waypoint is 9.51 km,
  still within 10 km, and is pinned. Cost: none.
- **M4-T1-D2 — failure waits for the actual breach.** The headless failure
  run waits until `shield` fails, capped at 405 s, rather than stopping at a
  brittle fixed 385 s. Cost: none.
- **M4-T1-D3 — history follows the sources.** McCampbell flew with one
  wingman; a single bomb set Princeton afire and she was lost later that
  evening; the carriers were TG 38.3 off Luzon. Cost if reversed: historical
  accuracy.
- **M4-T2-D1 — an unfailed deny is complete when the sortie ends.** A death
  before the raid arrives leaves `Keep the raid off` stamped COMPLETE. That is
  M1's current deny semantics: none entered before the mission ended. It does
  not earn a badge because the pilot died. Cost if reversed: a mission-engine
  semantic change, not an M4 content edit.
- **M4-T3-R1 — publish after final review.** Task 3 commits before the
  controller pushes and sends this document, so the emailed copy is final.
  Cost: none.

## 4. Historical account

The briefing's history is original prose, says explicitly that the mission is
inspired by the fighting rather than a reconstruction, and cites three public
U.S. Naval History and Heritage Command sources read 2026-09-27:

1. [NH 106328, David McCampbell's Medal of Honor citation](https://www.history.navy.mil/our-collections/photography/us-people/m/mccampbell-david/nh-106328.html).
2. [DANFS, Princeton IV](https://www.history.navy.mil/research/histories/ship-histories/danfs/p/princeton-iv.html).
3. [DANFS, Essex IV](https://www.history.navy.mil/research/histories/ship-histories/danfs/e/essex-iv.html).

Those sources support the date, the Luzon-based attack, TG 38.3 and TF 38,
McCampbell's command of Essex's Air Group 15, his single wingman, the roughly
60-aircraft raid and nine credited victories, and Princeton's bomb hit, fire
and loss that evening. The final-wave edit names **Task Group 38.3, part of
Task Force 38**, instead of attributing the whole local formation only to the
larger task force. The scenario also says what is fiction: the real fight was
off Luzon, north of this map; M4 stages it over Leyte; four Zeros stand in for
the mixed bombers and escorts.

## 5. Reference-GPU Tier 2

The reference RX 6700 XT ran
`tests/e2e/missions.spec.ts tests/e2e/mission-ui.spec.ts` twice through the
remote Playwright server. Both runs passed **6/6** (`rc=0`) in 4.9 min and
4.8 min. CAP itself took about 1.5 min in each run.

- [`m4-cap-briefing.png`](2026-09-27-m4-shots/m4-cap-briefing.png) — Combat
  Air Patrol selected with its situation, Background, sources, four primary
  objectives and badge.
- [`m4-cap-chart.png`](2026-09-27-m4-shots/m4-cap-chart.png) — at about 61 s,
  the player is inside the 10 km station, the counter reads 60/180 s, wave 1
  is visible and charted, and wave 2 is still held.
- [`m4-cap-debrief.png`](2026-09-27-m4-shots/m4-cap-debrief.png) — the scripted
  sea impact produces KILLED and `Killed — no badge`; the objective stamps
  and reasons are visible.

The final integrated tree, after merging current `main`, passed
`remote-run npm run verify` with **rc=0: 279 test files passed, 3,144 tests
passed and 1 pre-existing test skipped**. Typecheck, lint and dependency
cruiser were green; no file failed.

## 6. Intercept probe: not a gate

The scripted player-seat interception produced no hit or kill in three
variants (48-180 rounds fired; minimum range 28-50 m). The ingress Zero evaded,
the pursuing autopilot overshot, zoomed, dived to 226 m/s, then commanded
about 13 g and broke the player's airframe roughly 55 s into the run. The
raiders did not fire.

This does not block M4: the mission is for the human pilot to fly, and the
plan explicitly made this a probe. It does extend 7e handoff §5 item 1. AI
gunnery is still not honest enough for AI-on-AI fights, and the player's
autopilot is not a substitute for manual interception. Mark's own gunnery is
the remaining flight check.

## 7. Campaign forward notes

- All four planned missions now exist: Deck Quals, Airfield Strike, Convoy
  Strike and Combat Air Patrol. Each has objectives, a badge, a briefing and
  a cited history.
- The carrier respot and `approaches` objective from M3 are available to a
  campaign plan. The respot raises the hook; the Paddles window requires an
  approaching aircraft.
- Campaign design must not assume AI-on-AI combat will resolve by kills. The
  gunnery-honesty work remains open.
- M4's held waves, ingress route, station and deny objective are reusable
  mission-engine examples; they do not add a bombing or torpedo AI.

## 8. Open items and limits

- A sortie that ends before any breach stamps `Keep the raid off` COMPLETE,
  even when it ends in the player's death. This is the current generic deny
  semantic (M4-T2-D1), listed for Mark rather than silently changed here.
- On the chart, `raid-1` and `raid-2` are only 280 m apart, so their markers
  and labels stack at the captured zoom. Cosmetic.
- The missions design formerly named the non-existent id `a6m-zero`; this
  final wave corrects it to the shipped `a6m2-zero`.
- Manual flight checks remain for the complete trap-respot-roll loop from M3
  and the player's ability to intercept and shoot the M4 raiders.

M4 is complete. M1-M4 now provide the mission engine, UI and four shipped
missions; merging this branch into `main` remains Mark's call.
