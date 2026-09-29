# T1: believable ground handling (tailwheel first, any gear layout)

Date: 2026-09-28. Status: design, awaiting Mark's review. Revised the same
day: the first draft modeled struts, inertia and per-tire forces; Mark's ruling
is that believable taxi, take-off and landing is the goal, not physical
realism, so this version is deliberately simple.

Scope source: W1 spec, "Out of scope: T1" (`2026-09-28-w1-real-wildcat-design.md`).
Plan 11a's rulings still bind (section 6).

## 1. Intent and success

The F6F, F4F and A6M2 are taildraggers. Today the sim fakes the ground:
attitude is forced level below `tailUpSpeedMps` (15 m/s), yaw is a rate
override that fades to zero at that same speed, and the tail-down look is
drawn by the renderer only. Measured failure (Hellcat, 60% throttle, full
rudder): 5.5 deg/s falling to 1.5 deg/s, about 12 m off line in 73 m.

The result should feel like a tail-dragger, and the layout data should be
standard so the P-38 (tricycle, counter-rotating props) and bombers fit later.
Success, each an assertion:

1. **Taxi:** heading holds, rudder and brakes steer at taxi speed, and the 12 m
   in 73 m failure is a passing regression test.
2. **Take-off:** the tail comes up during the roll and the aircraft rotates
   and leaves the ground; a mild, correctable swing to one side at full power.
3. **Landing:** a three-point touchdown settles at the rest attitude; a
   tail-up "wheel" touchdown lowers the tail as speed bleeds off; a sloppy one
   can swing.
4. **Rest attitude** comes from the sim (F6F 9.49 deg, F4F 12 deg 20 min) and
   the renderer draws it.
5. A synthetic tricycle and a synthetic twin, spec fixtures only, pass the
   same ground checks. No P-38 or bomber content ships in T1.

Out of scope: AI take-off and landing (7g); P-38 and bomber content.

## 2. The standard (light)

`gear` gains a small `layout` block; the old ground fields are replaced.

| Field | Meaning |
| --- | --- |
| `type` | `taildragger` or `tricycle` |
| `mainAxle` | `{ x, y, halfTrack }` in metres, body frame |
| `third` | `{ x, y }` for the tailwheel or nosewheel |
| `thirdSteering` | `caster`, `casterLock`, or `steered` (with `maxDeg`) |
| `differentialBrakes` | true or false (bombers may lack them) |

Engines: where an aircraft has an engine list, each engine gets a spin
direction and a prop-wash factor. Torque swing is the sum of engine spin
directions, so counter-rotating props (P-38) cancel by data. If the specs
carry no engine list yet, the plan's first task adds one derived from
existing fields.

**Rest pitch is derived** from the axle and third-wheel positions (the angle
at which all three touch), not typed in. A load-time check asserts the derived
angle matches the reference (Grumman's 12 deg 20 min for the F4F) and that the
CG lies over the wheelbase. That check is what stops the W1 gap (model hub
2.347 m vs about 2.10 m derived; wheelbase 5.04 vs 5.46 m; track 1.28 vs
1.96 m) from recurring silently.

`heightM`, `tailUpSpeedMps` and `tailwheelYawRateDegPerSec` are removed, not
kept beside the new fields; every reader is listed in section 5.

## 3. Behavior model (deliberately simple)

The existing structure stays: the surface projection (`restOnSurface`) holds
the aircraft on the ground and never gains energy, and ground attitude is
written by `groundBodyRates`. Three additions:

**Pitch on the ground** is one state, the ground pitch, moved toward a target
at a limited rate:
- Target is the rest pitch (tail down) while elevator authority is low.
- Authority = elevator input x (airspeed term + prop-wash term). Above a
  threshold the target moves toward level (tail up) and then, with more
  elevator, toward nose-up rotation, limited by the axle geometry.
- On touchdown the same state applies: it starts at the touchdown pitch and
  settles toward rest pitch as speed falls, so a three-point landing is
  already at rest pitch and a wheel landing lowers its tail. Leaving the
  ground hands the pitch to the air model unchanged.
- Tricycle: rest pitch is level, and the same state raises the nose on
  rotation.

**Yaw on the ground** keeps the rate-override form but fixes its four causes:
- Rudder authority no longer fades to zero: it is `max(airspeed term,
  prop-wash term)` so a taxiing aircraft under power steers.
- Third-wheel steering follows `thirdSteering`: `caster` gives no authority of
  its own, `casterLock` steers slowly and locks straight above a speed,
  `steered` follows the rudder up to `maxDeg`.
- Differential brakes: left and right brake controls add a yaw rate in the
  right direction (the existing single `brake` still brakes both).
- Torque swing: a small yaw bias proportional to throttle and the engines' net
  spin, fading as rudder authority builds.
- `autoRudder` (`src/assists/index.ts:673`) is off while the aircraft is on
  the ground.
- `lateralGripSeconds` stays, so a ground loop remains possible (Plan 11a).

Every numeric coefficient here is a plain per-aircraft content value labeled
ESTIMATE, in the W1 style, and is judged by feel and by the checks in
section 6, not derived from first principles.

## 4. Phases

Two, each merges on its own with `npm run verify` green.

- **Phase A, attitude.** Layout data in the three specs, the derived rest
  pitch and its check, the ground-pitch state (tail-up, rotation, landing
  settle), render stance pointed at the sim attitude and its tilt ramp
  retired. Re-read: take-off cards, landing rest-point pins.
- **Phase B, steering.** The four yaw fixes, `brakeLeft`/`brakeRight` controls
  with bindings, auto-rudder gating, and the taxi regression test.

## 5. What this touches

Sim: `src/sim/flight/schema.ts` (gear block, strict), `src/sim/ground.ts`
(`groundBodyRates`, `restOnSurface`, `supportedContact`, `onGround`),
`src/sim/flight/model.ts` (ground blocks), `src/sim/world/airfields.ts`
(`parkedAttitude` gains pitch), `src/sim/scenario.ts`, `src/render/spawn.ts`.
Content: `f6f-hellcat.json`, `a6m2-zero.json`, `f4f-wildcat.json`. Input and
assists: `src/input/bindings.ts`, `src/assists/index.ts`. Render:
`src/render/scene/stance.ts`, `src/render/frame.ts`. The impact check at
`src/sim/loop.ts:744` stays on raw position.y on purpose.
Tests that pin ground behavior and will move or be re-graded:
`tests/sim/ground.test.ts`, `tests/sim/testcards/{graded,f6f,f4f,a6m}.test.ts`,
`landing`, `carrierLanding`, `trap`, `terrainContact`, `soak`,
`flight/negativeG`, `flight/schema`, `assists/autoRudder`, `render/frame`,
`render/stance`, `tools/models/stance`, `e2e/takeoff.spec.ts`,
`render/runway`. Golden trajectory and replay tests should not move; if they
do, that is a finding to report.

## 6. Checks and constraints

`tests/sim/ground/conformance.test.ts` runs the same checks per aircraft and
per synthetic fixture; a new aircraft passes it or does not ship:
1. Layout valid: derived rest pitch matches reference; CG over the wheelbase.
2. Parked 60 s stays put on level ground.
3. Taxi: straight line holds heading over 100 m; a rudder step turns;
   differential brake turns the right way; no fade to zero under power.
4. Take-off: tail rises, aircraft rotates and becomes airborne; a
   full-power roll without correction swings a bounded amount.
5. Landing: three-point and wheel touchdowns settle with no energy gain and
   no bounce above a stated height.

Constraints carried over: R36 (report a gap, never tune a coefficient to pass
a card; graded tolerances only tighten). The F6F take-off card's -0.605% is
two uncorroborated guesses cancelling (Plan 11a) and Phase A may move it; each
move is recorded with its cause. (Dated note, 2026-09-28, Task 4: -0.605% was
the pre-11b clean figure; the card grades full flaps at 4%. Phase A moved it
from +2.579% to +3.921%, cause and figures in `tests/sim/testcards/graded.test.ts`;
the F4F card moved from -14.32% to -12.89%, inside its 20% reported gap.) `src/sim` keeps its import boundary and
determinism; aircraft schema objects stay `.strict()`. Verification through
`remote-run npm run verify`.

Not addressed: seed-7 soak (tracked elsewhere). `docs/aircraft.md` gains an
"undercarriage" step pointing at the checks above.

## 7. Open for the plan

Mark's viewing checkpoints and whether the run is attended go in the plan
header, per repo convention.

## 8. Amendments made while planning (2026-09-28)

Reading the code for the plan forced four simplifications. None changes the
behavior in section 1.

- `gear.heightM` stays. It is read in about ten sim sites as the main wheels'
  depth below the origin at level attitude, and it remains true; the new
  `wheelDepthM(gear, pitchRad)` generalizes it to a pitched body. Section 2's
  "removed, not kept beside" applies only to `tailUpSpeedMps` and
  `tailwheelYawRateDegPerSec`, which are replaced.
- `tailUpSpeedMps` becomes `tailLiftSpeedMps`: the effective airflow speed
  (ground speed combined with prop wash) at which the elevator can hold the
  tail up. It is a scale for a smooth curve, not a gate.
- No engine list exists in the specs and none is added. Torque swing is one
  signed number per aircraft, `torqueYawRateDegPerSec` (positive swings right,
  0 for counter-rotating props such as the P-38's).
- `brakeLeft` and `brakeRight` are optional `Controls` channels beside the
  existing `brake`, so no existing `Controls` literal changes.

**Amendment, 2026-09-28 (Mark's ruling after flying it):** differential toe
brakes were removed entirely. There are no `brakeLeft`/`brakeRight` channels,
no Comma/Period bindings, no `gear.differentialBrakes` or
`gear.brakeYawRateDegPerSec`, and `symmetricBrake` is gone (plain `brake`
only). Steering on the wheels is now `clamp(yaw + roll, -1, 1)`: the arrow keys
and A/D steer (ArrowRight turns the nose right) and combine with Z/X, and roll
still never banks the airplane on the wheels. In the air, on gear-up belly and
on water, roll is aileron as before. The text above is the record of what was
built first.
