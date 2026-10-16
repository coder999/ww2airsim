# F7B rescue visuals and the paratrooper drop: plan (2026-10-16)

MASTER_PLAN Track F7, second half (plan 12 of the 22 in the
[F3 dependency table](../specs/2026-10-14-leyte-campaign-definition.md#11-dependency-checked-plan-count)).
F7A (bailout, merged 2026-10-15) and F5B (headquarters and debrief, merged 2026-10-15) are the frozen inputs.
**Status: plan approved 2026-10-16; implementation starting.** Size: M.

## Header

- **Branch:** `f7b-rescue-paratroopers`, worktree `/home/mark/projects/ww2airsim-worktrees/f7b` (Mark, 2026-10-16).
- **Run mode: unattended, final product only** (Mark, 2026-10-16). No stops; CP1 and CP2 captures are collected in the
  handoff for when he is back.
- **Decisions 1-4 below accepted as proposed** (Mark, 2026-10-16). Decision 5 is settled by the branch line above.
- **No ryzen** (Mark, 2026-10-16: a budget run holds it). Tests and `tsc` run locally on nexus, one heavy job at a time.

## What F7B is not (verified 2026-10-16)

The master plan and the F7A plan list "presentation of the POW and replacement results" as F7B work. Reading the
code shows F5B already did it:

- `src/render/campaignBank.ts` `describe()` adds the notice "<name> is gone from the squadron (P.O.W.). <new pilot>, an
  entry-rank pilot takes the slot; the file is in the archive." whenever `pilot.status !== 'active'`, naming the
  replacement from the roster diff.
- `src/render/hq/screens.ts` / `model.ts` show the archive with a P.O.W. filter and chip, and "Pilots lost" and
  "Pilots rescued" in the dossier.
- `tests/render/campaignBank.test.ts` covers `captured` (line ~135) and `rescued`/`captured`/`killed` never paying a
  completion bonus (line ~112). `tests/campaign/bank.test.ts` covers the closure and refill.

So F7B **builds no POW archive, no replacement and no debrief line.** It adds one thing: a check, in Task 5, that the
existing path is proven end to end for `captured` (an E2E already exists: `tests/e2e/bailoutCampaign.spec.ts`).
The MASTER_PLAN wording is corrected in Task 6.

## Scope

1. **Rescue visuals (generic).** When a bailout ends `rescued` on water, show a raft with survivors at the touchdown
   point and a rescue launch arriving and picking up. On land or a carrier deck, no extra actor (the debrief says
   so). View-only: nothing here may change simulation state, the recorder checksum or the outcome.
   Assets already approved in F4 (Hangar, 2026-10-14): `type-a3-life-raft-survivors`
   (`content/equipment/`), `usaaf-63ft-rescue-boat` (`content/vehicles/`).
2. **Paratrooper drop primitive.** Let a transport release N parachutists (and optionally supply bundles) in a
   deterministic stick, reusing F7A's `ParachutistEntity` ("generic now so F7B can spawn AI parachutists without another
   entity type"). Assets already approved: `parachuting-person-rig`, `paratrooper-supply-bundle`, `ki-57-ii-topsy`.
3. **Many canopies on screen.** `loadParachutistView()` drives exactly one entity. J5 needs up to 18 rigs and 6 bundles
   at once (F3 §4, J5). Add a pooled view; budget-enroll it.
4. **Proof of the F7 gate** that is not yet proven: paratrooper spawning, deterministic and replayable.

## Out of scope (owned elsewhere)

- The A4 scripted raft, boat and buoy: **F10B** (MASTER_PLAN F7, F3 §4 A4).
- J5/J6 objective logic ("effective drop", corridor, bundle-in-marked-area scoring): **F10D**. F7B provides the
  primitive and a way to test it; it does not decide what counts as effective.
- Prisoner-recovery missions and ejection seats: ruled out (GAMEPLAY.md).
- Any `src/campaign/` change. Any schema bump.

## Decisions (proposed, need Mark)

| # | Question | Proposed |
| --- | --- | --- |
| 1 | Supply bundles: new `kind` on `ParachutistEntity`, or a separate entity? | One entity type with an optional `kind: 'bundle'`, omitted for a person, so every pre-F7B world and recording stays byte-identical (the same trick F7A used for `World.parachutists`). A separate type would need a second array in `World`, `loop.ts`, the recorder and the frame. |
| 2 | How does a transport drop? | A pure function `dropStick(aircraft, count, kind, seed)` in `src/sim/bailout.ts`, called by a scripted command that F10D wires to the Ki-57 and the player's drop key. F7B adds the function and a Dev trigger, not mission logic. |
| 3 | Do dropped AI paratroopers get a rescue/capture roll? | No. They run the same descent and contact physics; `outcome` stays `null` unless it is the player (the roll is the player's `J` decision). Only surface contact is recorded, for F10D to read. |
| 4 | Rescue pickup timing | Cosmetic: a pure function of ticks since touchdown. The launch spawns at a fixed standoff, approaches in a fixed time, and the sortie's end is unchanged (it ends on touchdown, F7A). |
| 5 | Branch | Ask at start, per AGENTS.md. Recommended: `main` in place, single session, so Mark can see it on `ww2airsim.windomlane.org`. |

## Tasks

TDD throughout: each task names its failing test first. **No ryzen** (Mark, 2026-10-16: a budget run holds it): run
tests locally on nexus, one heavy job at a time (parallel agents have OOM-killed nexus). Budget enrollment is written
but not measured until ryzen is free.

1. **Drop primitive (sim).** Test first: `dropStick` returns N entities at stable spacing along the aircraft's track,
   same inputs give byte-identical output, and a world with no drop is byte-identical to before (the existing golden
   recording test is the guard). Mutation to prove the test bites: change the stick spacing, the test fails.
2. **Bundle kind and AI parachutist behavior.** Test first: a bundle sinks at its own rate (F3: separate small canopy),
   contacts ground or water, and records contact; a person with `kind` absent behaves exactly as F7A. Check recorder
   and checksum paths (`src/flightRecorder/recorder.ts`) include the new field only when present.
3. **Pooled parachutist view.** Test first: a pool of 24 views shows exactly the active entities, hides the rest, and
   `canopySway` stays a pure function of tick. Replace the single-entity call at `src/render/main.ts:3265` with the pool;
   the player's own view is unchanged.
4. **Rescue visuals.** Test first: `rescuePickup(touchdownTick, nowTick)` is a pure function with fixed phases (raft
   appears, launch approaches, pickup, gone); nothing on the sim side reads it. Wire the two approved GLBs through
   `staticModelUrl`/`acquireModel` the way `parachutist.ts` does.
5. **Gate proof.** An E2E or unit path that drops a stick in the Dev range and replays it from the recording with an
   identical checksum; confirm `bailoutCampaign.spec.ts` still passes for `captured`. Add a Dev-only entry to trigger a
   stick (Dev unlocks it, per Mark's 2026-10-15 ruling that Dev uses the production UI).
6. **Docs and closeout.** Correct `MASTER_PLAN.md` F7/F7B (the POW and replacement presentation is done by F5B), update
   `docs/campaign-data.md` line 43, the F7 paragraph in `GAMEPLAY.md` (~line 351), `docs/testing.md` Known gaps, and write
   the handoff with `Tests updated`, `Tests still valid` and `Known gaps` (AGENTS.md, worktree closeout).

## Acceptance gate (F7 as written, restated against what exists)

| F7 gate item | Status |
| --- | --- |
| impossible and low-altitude bailout, water and land contact | F7A, done |
| friendly rescue, capture, score and badge behavior | F7A and F5A, done |
| archive and replacement | F5A/F5B, done (Task 5 confirms the UI path) |
| recorder replay | F7A for the player; Task 5 for a drop |
| paratrooper spawning deterministic and tested | **Task 1, 2, 5** |
| rescue visuals (raft, launch) | **Task 4** |

## Checkpoints

Run unattended (see Header): captures go in the handoff. Mark's viewing is a checkpoint, never a test gate:

- **CP1, after Task 3:** a Dev stick of 18 rigs and 6 bundles over water and land, on `ww2airsim.windomlane.org`.
- **CP2, after Task 4:** a bailout over water ending `rescued`, with the raft and launch.

## Risks

- **Budget.** 18 animated canopies plus 6 bundles is new draw load in the J5 night scene. Enrolled now, measured on
  ryzen later; the F10E performance gate is the real limit (24 airborne, 10 ships).
- **Replay.** Any new field on `ParachutistEntity` that is always present changes every checksum. Task 2's guard is the
  existing golden recordings.
- **Scope creep into F10D.** The word "effective" appears nowhere in F7B's code.
