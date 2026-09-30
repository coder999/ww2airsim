# Handoff: Tier 2 stale specs, the Gunnery Range strafing pass, and the title silence

Branch `worktree-tier2-stale` (worktree `ww2airsim-worktrees/tier2-stale`,
dev slot `ww2airsim-2`). Plan:
`docs/superpowers/plans/2026-09-29-gunnery-range-strafing-pass.md`. Not
merged; `main` and deploys are Mark's call.

## What changed

- **Gunnery Range is an airborne strafing run-in** (Mark, 2026-09-29).
  - Since T1 (`817fbd3`), parked aircraft sit at their rest pitch, 9.45° for
    the Hellcat, so the old parked start fired about 50 m over target-1 for
    players and tests alike.
  - The player now starts 1,500 m south of the targets at 70 m, 70 m/s,
    lined up with Tacloban.
  - The targets are on the runway's southern half. They were first placed
    at z = +700, which is off the flat.
  - The pass lands straight ahead. `friendly-fire-field` has the same layout.
- **Shared test pilot** (`tests/pilot/`).
  - `strafePilot.ts` is a pure control law: the harmonized sight onto the
    target, fire inside 400 m, break at 200 m, then `approachControls`.
  - `keys.ts` turns its commands into the keys a player would press.
  - Tier 1 flies it through `nextFrameState`.
  - Tier 2 (`tests/e2e/pilot.ts`) runs the same module in the page every
    frame, reading the new read-only `__ww2.playerFlight()`.
  - Tuning numbers and their measurements are in `tests/pilot/rangePass.ts`.
- **`landAndStop` is the pilot's landing.** It flies `approachControls` onto
  Tacloban's runway 250 m ahead of wherever `hopClear` left the airplane.
  `hopAndLand` is deleted, along with `meta-game-relaunch`'s private copy of
  the timed key script.
- **Stale specs.**
  - strike:217/290: 700 m from ground + 10 m, for `0264d45`'s raised HVAR
    rails.
  - sortie:66: the Zero has its own stores (`495941c`).
  - sortie:103: Free Flight's bandit is a Zero (`6ce00eb`).
- **Title silence fix** (`6a8b842`).
  - `b8f9c25` holds audio behind the title. Nothing on the live path ever
    released the hold, so every flight after the title was silent: the
    engine at gain 0 and every cue skipped.
  - This is **live in production since the 19:14 deploy**. Mark chose to
    land it with this branch.

## Verified

- **Tier 1:**
  - `tests/sim/gunneryRangePass.test.ts`: kill, landing and FF-2.
  - `discharge.test.ts`: the field pass records the friendly hit and lands.
  - `remote-run npm run verify` on ryzen, 2026-09-29: typecheck, lint and
    depcruise were clean; 4,532 tests passed and 2 failed. The failures were
    `boundary.test.ts` and `skyLoad.test.ts`, timeouts (137 s and 33 s) under
    ryzen load shared with another session. Those two are documented as
    failing only on ryzen (`aircraft.md`). Re-run alone on nexus, both passed
    (30/30, rc 0).
- **Tier 2** on ryzen session 0 against `ww2airsim-2`, 2026-09-29. Session 0
  is fine for correctness; its frame times are not trusted.

  | Spec | Result |
  | --- | --- |
  | gunnery | 4/4 |
  | meta-game | pass |
  | meta-game-relaunch | pass |
  | dossier | pass |
  | friendly-fire | 2/2 |
  | mission-ui | 2/2 |
  | strike | 5/5 |
  | sortie:66 and :103 | pass |
  | scenarioPicker | 3/3 |

  The pilot's pass in the browser took 46 s, scored 12 hits, killed target-1
  and stopped on the runway, matching Tier 1.

## Open

- **cloudShadow:140** fails before the range: "the world never drew behind
  the title", which also fails on unchanged `main`. The other session owns
  it, along with the rest of the untriaged list. Its fixed view now loads an
  airborne start.
- **ordnance:48 passes in the console session** (2026-09-29, bomb contrast
  0.191), so its session-0 failure was an artifact.
- **takeoff:25 is the standing 1440p budget red, not an artifact.** In the
  console session under `hwlock ryzen` it measured p95 7.86 ms against 6.0.
  The 7h handoff measured 7.68 ms, with `recovery.spec` at 7.62 ms with no
  takeoff at all (`2026-09-28-plan7h-takeoff.md`, open item 1). The Tacloban
  view has been over budget since at least 2026-09-28. It is a perf item,
  not a test fix.
- **The nightly soak failure is fixed by `85fefe0`**, confirmed 2026-09-29.
  - At `85fefe0^` (`fe9e9c3`), `soak.test.ts` fails with the overnight run's
    exact numbers: iteration 59, seed 1337, tick 757, sank through 1052.66
    m.
  - With `85fefe0` all 5 soak tests pass.
  - The overnight failure (09:17 UTC) came before `85fefe0` was committed
    (16:00 UTC), and no nightly run has happened since.
  - `aircraft.md`'s "soak is known red" is stale; the plan's Phase 1 removes
    that list.
- **A Tier 1 harness trap:** `worldFromScenario` with terrain leaves parked
  aircraft with their wheels about 2 m under the ground until
  `settleOnTerrain` runs, and stepping it records an impact at tick 1. Fly
  through `initialFrameStateFor` + `settleOnTerrain` (as
  `tests/pilot/flyPass.ts` does), not bare `advance`.
- **Plan deviations:**
  - Task 1's `attitude()` became `playerFlight()`, because the pilot needs
    the full state.
  - There is no separate diagnostics unit test; Tier 2 exercises the
    accessor.
