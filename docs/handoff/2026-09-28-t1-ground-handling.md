# T1 handoff: believable ground handling (2026-09-28)

T1 replaces the renderer's drawn tail-down stance and the 15 m/s tail-up speed
gate with ground physics driven by a gear layout in each aircraft spec. The
spec is [`2026-09-28-t1-ground-handling-design.md`](../superpowers/specs/2026-09-28-t1-ground-handling-design.md)
and the plan is [`2026-09-28-t1-ground-handling.md`](../superpowers/plans/2026-09-28-t1-ground-handling.md).
The run was unattended, with the final product as the one checkpoint (the
captures below). The ledger is `.superpowers/sdd/2026-09-28-t1-ground-handling/progress.md`
(gitignored).

**Branch `worktree-t1-tailwheel`, not merged.** Merging is Mark's call.

## What shipped, by phase

**Phase A: attitude (Tasks 1-4)**

- `gear` gains `layout`, `mainX`, `thirdX`, `thirdHeightM` (measured from the
  drawn models) plus steering, brake, tail-lift, prop-wash and torque fields.
- `src/sim/gearContact.ts`: pure geometry, `restPitchRad`, `wheelDepthM`,
  `wheelDepthOf`. Contact height now follows pitch; spawn is at the derived rest
  attitude (F6F 9.45 degrees nose-up).
- Ground pitch comes from airflow, stick and the rest attitude. The renderer's
  drawn stance is retired.
- Cards and pins re-graded for the new attitude (table below).

**Phase B: handling (Tasks 5-7)**

- Rudder with prop wash, a caster that locks above `steerLockSpeedMps`,
  differential brakes, and engine torque; auto-rudder is off on the ground.
- Brake keys are **Comma (left) and Period (right)**, not letters: the free-letter
  list in `bindings.ts` had only J N O U Y left, and `tests/input/bindings.test.ts`
  fails on any clash. One table to change if Mark prefers letters.
- Symmetric brake drag is `max(brake, mean(brakeLeft, brakeRight))`.
- **A real defect found and fixed (`e12c169`).** The taxi test found that ground
  yaw was integrated about the leaning body-up axis, so a tail-down airplane
  turning 180 degrees read 21.9 degrees of bank and lost 3.8 degrees of pitch.
  On the wheels, roll and pitch now integrate in the body frame and yaw about
  world +Y (`model.ts`). Measured after: roll 2.5e-14 rad throughout. Side
  effect: the swing no longer eats energy (Hellcat, 60% throttle and full
  rudder, reached 20 m/s in 12 s against 13 m/s before).
- Conformance battery (`tests/sim/ground/conformance.test.ts`): 25 tests, all
  pass across the F6F, F4F, Zero and the synthetic tricycle and twin fixtures.

## Card deltas (old to new, cause)

Nothing was tuned to any card (R36); every move is the derived rest attitude and
the airflow tail-lift (part of the roll is now flown tail-down at a higher angle
of attack).

| Item | Old | New | Note |
| --- | --- | --- | --- |
| F6F take-off, full flaps (graded, tol 4%) | 236.058 m, +2.579% | 239.148 m, +3.921% | Passes with 0.08 points to spare, untuned. The next change that lengthens the roll turns this red; the answer is then to report the gap, not to widen 4%. |
| F6F take-off, clean (reference only) | 228.737 m, -0.603% | 230.264 m, +0.061% | The "-0.605%" in the JSON source is the pre-11b clean figure, not what the card grades; dated notes added. |
| F4F take-off, full flaps (graded, tol 20%) | 179.151 m, -14.32% | 182.142 m, -12.89% | Still a reported gap: the source states neither flap setting nor lift-off speed. Direction (short) unchanged. |
| F4F take-off, clean | 174.136 m | 176.064 m | |
| Tacloban landing snapshot (`landing.test.ts`, not a graded card) | restZ -47668.7629, sink 1.349220, speed 37.733250 | restZ -47686.6756, sink 1.350419, speed 37.714176 | Geometry: wheel depth now depends on flare pitch. Re-pinned with the cause inline. |

Two ledger lines record intermediate figures that should not be read as the
final ones: Task 3 noted the F6F at 230.3 m against 230.124 m (+0.08%), which is
the clean-roll basis, not the full-flaps card the tests grade; and Task 2 noted
an interim restZ of -47669.2060 before Task 3 and Task 4 moved it.

Also re-graded by fixture, not by the sim: the parked airplane is now 9.45
degrees nose-up, so `friendlyFire` (gunnery-range) and
`discharge` (friendly-fire-field) level the shooter in the test setup.
**The shipped gunnery-range sortie itself now misses in the browser**
(Tier 2 `gunnery.spec`, recorded at Task 4): a parked airplane fires over the
target. Not fixed here; see open items.

## ESTIMATE coefficients

No card grades any of these. They are ESTIMATES, labeled in each spec's
`reference.source`. **None was changed after Task 1**; no value was tried and
rejected. `propWashSpeedMps` and the steering numbers passed the taxi and
conformance tests on the first run.

| Field | F6F | F4F | Zero |
| --- | --- | --- | --- |
| `thirdSteering` | casterLock | caster ([HB]: not steerable) | casterLock (departs from the source, which reads as a plain caster; flagged) |
| `steerYawRateDegPerSec` | 20 | 0 | 5 |
| `steerLockSpeedMps` | 8 | 8 | 8 |
| `brakeYawRateDegPerSec` | 12 | 12 | 10 |
| `tailLiftSpeedMps` | 28 | 25 | 24 |
| `propWashSpeedMps` | 12 | 11 | 10 |
| `torqueYawRateDegPerSec` | -3 | -3.5 | -2.5 (direction itself an ESTIMATE) |

Sim constants: `GROUND_YAW_FADE_MULTIPLE` 1.5 (yaw authority fades to zero at
1.5 times `tailLiftSpeedMps`), `TAILDRAGGER_MIN_ROTATION_RAD` 6 degrees.

Measured through the real step: yaw rate at 15 m/s with 60% throttle and full
rudder is 6.14 deg/s (the test's threshold is 3). Full power with the
stick neutral for 14 s reaches 44.8 m/s, pitch 0.00 degrees, and swings 10.01
degrees in heading.

## Things to know and judge

- **Zero data gap.** The measured Zero rests level on its drawn model, so the
  geometry gives no rotation room (ceiling equals rest and it could not take
  off; `negativeG.test.ts` went red). The sim floors the taildragger rotation
  ceiling at `max(rest, 6 degrees)`. The 6 degrees is a sim-side constant, not
  data: the Zero's true three-point or ground angle needs a source. A wrong
  constant changes only Zero-like layouts (a wheel deeper than rest just raises
  the origin).
- **10 degree hands-off torque swing at full power.** Accepted (within a
  0.5-30 degree window, not judged unrealistic) but still noticeable with no
  correction held. Flagged for Mark's feel judgment: the fix is
  `torqueYawRateDegPerSec`, one number per aircraft.
- **`frame.test.ts` "rolls north" ratio loosened from 1/10 to 1/5.** A hands-off
  full-power roll now drifts 22.4 m across 185 m along, from engine torque with
  nobody on the rudder. The test still guards the 113.6 degree failure it was
  written for; it no longer guards a straight line. Torque was deliberately not
  retuned to fit the old ratio.
- **Conformance test 3 has a torque allowance.** F6F (0.142 rad) and F4F
  (0.174 rad) exceeded the plan's 0.1 rad idle-straight guard because of the
  modeled torque. The threshold is now 0.1 rad plus the torque yaw rate
  integrated over the seconds below tail-lift speed, derived from the spec, so
  a zero-torque layout keeps the strict 0.1. Cost: a torque coefficient that
  grew would raise its own allowance; the remaining guards are the 100 m
  distance and the strict 0.1 for no-torque layouts. The test now runs 40 s and
  asserts the 100 m was reached instead of skipping.
- **`applyAssists` context defaults to airborne.** `Assist` takes a required
  `context: AssistContext` (`{onGround}`, `AIRBORNE` exported from `sim/loop.ts`),
  but `applyAssists` and `applyAssistsWithAuthority` take it optionally and
  default to airborne, because 30-plus air-flying test call sites omit it. The
  production path (`assistFor`) always passes the real value. Risk: a new
  production caller that forgets it silently gets airborne behavior, that is,
  auto-rudder on while rolling. There is no test that catches it.
- **The conformance battery does not cover retracted gear or water.** `gearDown`
  is always true in it. The belly-landing and water cases (no wheel steering, no
  tail-up) rely on the existing `wheelsDownStart`/`onLandStart` gate test Task 3 kept (the ledger does not
  record its file; I did not locate it, see `tests/sim/ground.test.ts` and
  `tests/sim/flight/`), which was not re-examined in Task 7.
- **Contact seating.** Contact seats on the pre-step attitude, so depth being
  pitch-dependent produced a one-tick lag (soak "sank through"). Task 3 added a
  re-seat against the post-step attitude in `step()` (position only, never gains
  energy), pinned by a test.

## Verification

`remote-run npm run verify` (2026-09-28, on the tree at `6231e9f` plus this
commit's docs only): typecheck, lint and depcruise clean; `rc=1` with 6 of 3577
tests failing (3567 passed, 4 skipped).

- **Five were load timeouts** (30 s or 120 s limits on a loaded ryzen):
  `boundary.test.ts` "leaves no probe", `gunzip.test.ts`, `skyLoad.test.ts`,
  the entity soak in `soak.test.ts`, and `ai/determinism.test.ts` "reversing the
  aircraft array". Re-run alone through `remote-run` with `-t` filters, all five
  passed (rc=0). That shows they pass unloaded, not that T1 cannot slow them.
- **One is the terrain soak**, described next.

The terrain soak is red: 7 failures on 6 of 6 seeds, against 7 failures on 4
of 6 seeds at baseline `87f2c0d`. The ruling was that this is the pre-existing
steep-terrain class (the soak flies the F6F only, so the Zero ceiling cannot
affect it). That is a judgment from the failure shape, not a proof that T1 did
not widen it: the seed count went from 4 to 6.

## Captures

In [`2026-09-28-t1-shots/`](2026-09-28-t1-shots/), taken at Task 4 on nexus's
680M (not the reference GPU, no timings). They show the Phase A attitude; there
are no captures of the Phase B taxi or brakes.

1. `1-parked-tail-down.png`: parked at the derived rest attitude.
2. `2-mid-roll-tail-up.png`: mid take-off roll, tail up.
3. `3-rotation.png`: rotation.
4. `4-after-liftoff.png`: after lift-off.

## Open items

- **Seed-7 soak marginal:** not owned here; the terrain soak is described above.
- **Hand-flown landing is still to be judged by Mark.** Landing was measured only
  through the drop cases in the conformance battery and the Tacloban snapshot.
- **The shipped gunnery-range sortie misses** because the parked airplane now
  points 9.45 degrees up (above). Needs a sortie-side fix (spawn or target
  placement), not a sim change.
- **AI take-off and landing (7g)** now has a sound base: AI aircraft use the
  same rest attitude, tail-lift and contact.
- **P-38 and bomber content** is data (a `tricycle` layout) plus the conformance
  battery; the synthetic tricycle and twin fixtures rest level and steer.
- **`MODEL_STANCE`** (`src/render/scene/stance.ts`) is now used only by tests
  (`stance.test.ts`, `gearContact.test.ts`, `tests/tools/models/stance.test.ts`);
  the drawn tilt (`tailDownFraction`, `stanceTiltRad`, `drawnPose`) is retired.
- Older plan and handoff documents still mention `tailUpSpeedMps` and the drawn
  stance; they are dated records and were left as written.

**Amendment, 2026-09-28 (Mark's ruling after flying it):** differential toe
brakes were removed entirely. There are no `brakeLeft`/`brakeRight` channels,
no Comma/Period bindings, no `gear.differentialBrakes` or
`gear.brakeYawRateDegPerSec`, and `symmetricBrake` is gone (plain `brake`
only). Steering on the wheels is now `clamp(yaw + roll, -1, 1)`: the arrow keys
and A/D steer (ArrowRight turns the nose right) and combine with Z/X, and roll
still never banks the airplane on the wheels. In the air, on gear-up belly and
on water, roll is aileron as before. The text above is the record of what was
built first.
