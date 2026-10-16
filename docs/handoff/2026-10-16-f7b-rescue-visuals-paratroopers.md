# F7B handoff: rescue visuals and the paratrooper drop (2026-10-16)

Plan: [`docs/superpowers/plans/2026-10-16-f7b-rescue-visuals-paratroopers.md`](../superpowers/plans/2026-10-16-f7b-rescue-visuals-paratroopers.md).
Branch `f7b-rescue-paratroopers` (worktree `~/projects/ww2airsim-worktrees/f7b`), run unattended on nexus, **nothing on ryzen**
(Mark, 2026-10-16: a budget run held it). Not merged, not deployed. Captures: [`2026-10-16-f7b-shots/`](2026-10-16-f7b-shots/).

## What changed

- **POW and replacement presentation: nothing to build.** F5B already shows both (`src/render/campaignBank.ts`, the archive's
  P.O.W. filter), covered by `tests/render/campaignBank.test.ts`. MASTER_PLAN, `docs/campaign-data.md` and GAMEPLAY said F7B
  owed it; corrected.
- **Drop primitive (sim).** `dropStick` (`src/sim/bailout.ts`) releases N men or bundles, strung out behind the track at
  `dropIntervalS`, deterministic. `World.drops` (scripted `DropOrder`s, run at the start of their tick in `advance`). Both
  omitted when unused, so every earlier world and recording is byte-identical.
- **`ParachutistEntity.kind?: 'trooper' | 'bundle'`.** Absent for a pilot's own jump. `isPilotJump` now guards every place
  that assumed all parachutists were pilots: the abandoned-airframe set (a dropping transport kept flying only because of it),
  the rescue roll, `playerParachutist`, `recoveryOf`, and the recorder's bailout evidence. Bundles sink at `bundleSinkMps` and always
  land (no lethal contact).
- **Pooled view.** `loadParachutistView` now draws any number of entities from 24 man rigs and 8 bundle rigs
  (`MAX_MEN`, `MAX_BUNDLES`); overflow is not drawn (ponytail note in the file).
- **Rescue visuals.** `src/render/scene/rescue.ts`: a pilot who comes down on water is drawn in the approved life raft
  (the standing rig is hidden for him: `inRaft`); if rescued, the approved 63-ft rescue launch comes in at about 29 knots,
  holds alongside 8 s and leaves. A captured pilot keeps his raft and no launch comes. Pure function `rescueScene`; the view
  runs on a **wall clock** because the frame holds the world still once the descent has an outcome (`holding` in
  `src/render/frame.ts`), so the pickup plays behind the debrief.
- **DEV `?paradrop=18,6`** (`withTestDrop`, `src/sim/scenario.ts`): the player's aircraft releases that many men and bundles
  at tick 120. Part of how the world is built, like `?mainBatteries`.

## Numbers that are estimates

`bundleSinkMps` 7 m/s, `dropIntervalS` 0.5 s, `dropLateralM` 2 m (`src/sim/bailoutTuning.ts`); `RESCUE_VISUAL` standoff 300 m, 15 m/s,
20 m alongside, 8 s pickup, 20 s departure (`src/render/scene/rescue.ts`). No source cited; all cosmetic or tuning.

## Verification (2026-10-16, nexus, local GPU)

- Focused: `tests/sim/paradrop.test.ts` (9), `tests/render/rescue.test.ts` (8), `tests/render/parachutistView.test.ts`, plus architecture,
  flightRecorder, bailout, bailoutTuning, campaignBank, scenario: 161 passed. Mutations that turned tests red: drop the
  `isPilotJump` filter on the abandoned set (transport stops flying, two tests fail); set `bundleSinkMps` to the man's rate.
- `npm run verify` on the branch (nexus, alone, 2026-10-16 06:34, before the docs-only edits that follow): typecheck, lint, depcruise clean; **481 files passed, 2 skipped; 7,100 tests passed, 60 skipped**, exit 0. Skips are the terrain-tile and GPU-gated ones named in `docs/testing.md`.
- Capture `tests/e2e/paradropCapture.spec.ts` (`npm run capture:e2e -- paradropCapture.spec.ts`, local `PW_BASE_URL` on a
  one-off vite on port 5190, stopped after): 18 men + 6 bundles under canopy in a line behind the aircraft, and the raft,
  launch approaching, alongside and gone. Local Radeon 680M numbers (49 to 90 fps, 11 to 20 ms) mean nothing and are not a budget.

## Tests updated / still valid / known gaps

- **Updated:** `tests/render/parachutistView.test.ts` (the node check now covers the bundle rig too; the view's `sync` takes a list).
- **Still valid:** `bailout.test.ts`, `bailoutTuning.test.ts`, `campaignBank.test.ts`, the flight-recorder suite and the e2e
  `bailout*` specs (their `modelVisible` reads are all during the canopy phase, which is unchanged).
- **Known gaps:**
  - **`paradrop-budget` is RED, by design of the gate (Mark's ruling, 2026-10-16: keep gates as written, do not tune to meet them).**
    View measured: Tacloban at 300 m, free-flight, 1440p High, look-back held so the 18 men + 6 bundles fill the view behind the
    transport (a solo view, not a battle). Ryzen, under `hwlock ryzen-budget`, a fresh vite per mode, 6 interleaved loads per
    arm, median of the per-load GPU p95, 2026-10-16:

    | Mode | no drop | drop | delta | gate |
    | --- | --- | --- | --- | --- |
    | `BUDGET_PARAMS=trees=off` | 5.26 ms | 6.85 ms | **+1.58 ms** | 1.0 ms, fails |
    | trees on | 15.32 ms | 16.70 ms | **+1.38 ms** | 1.0 ms, fails |

    The delta barely moves with the forest, so the cost is the canopies (the drop arm also yields about 20% fewer samples). One
    trees-off drop load was a 13.8 ms outlier. An earlier 4-load run on a long-lived dev server gave +1.99 ms. The 1.0 ms is a
    tripwire I chose (the effects budget's number), not a ruling; the two-tier bar proposed in
    `docs/handoff/2026-10-16-budget-reevaluation.md` is Mark's call and is not applied. Likely cost: each pooled rig draws a canopy,
    ribs, person, head, boots, helmet and suspension lines (no draw-call profile taken yet).
  - **No E2E assertion** for the stick or the pickup, only the capture tool; the logic is covered by pure tests. The wall-clock
    pickup is not part of a replay (view-only).
  - **A drop is not a recorded action.** `?paradrop` is rebuilt from the URL, so a Dev flight record of such a flight reproduces
    only if the same query is used. A player drop key (J5) is F10D and would need a flight-record schema change.
  - **Dropped men are not in the recorder's evidence list** (it would need a new `kind`); they are in the world checksum.
  - **A stick assumes straight, level flight** while it leaves (ponytail comment on `dropStick`).
  - Dropped men and landed bundles are never removed; they persist for the sortie.
  - Rescue visuals: water only. On land or a carrier deck there is no extra actor; the debrief says so.
  - The launch is not ocean-wave-aware (it rides the touchdown height).
