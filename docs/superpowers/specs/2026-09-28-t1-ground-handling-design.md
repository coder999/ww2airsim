# T1: the undercarriage in the physics (tailwheel first, any gear layout)

Date: 2026-09-28. Status: design, awaiting Mark's review.
Scope source: W1 spec, "Out of scope: T1" (`2026-09-28-w1-real-wildcat-design.md`).
Supersedes the ground-yaw and tail-up choices of Plan 11a
(`2026-09-16-ground-handling-design.md`); its rulings still bind (see Constraints).

## 1. Intent

Mark's stated concern: how tailwheel aircraft taxi, take off and land. The
F6F, F4F and A6M2 are all taildraggers, and each currently fakes the ground:
attitude is forced level below `tailUpSpeedMps` (15 m/s), yaw is a rate
override that fades to zero at that same speed, and the tail-down look is drawn
by the renderer only. Measured failure (Hellcat, 60% throttle, full rudder):
yaw rate 5.5 deg/s falling to 1.5 deg/s, about 12 m off line in 73 m.

Mark added (2026-09-28): the approach must be standard, so that the P-38
Lightning (tricycle, twin-boom, counter-rotating props) and bombers (tricycle
B-24/B-25/B-29, tailwheel B-17) drop in without a new ground model each.

**Success criteria** (each is an assertion, not an eyeball):

1. Taxi at 5-15 m/s holds a heading and follows rudder, brake and prop-wash
   steering; the 12 m lateral-in-73 m failure is a regression test that passes.
2. The tail rises on the take-off roll from elevator authority and prop wash,
   at a speed that follows from the moments, not from a gate. Left alone, a
   full-power take-off shows a torque swing that the pilot can correct.
3. Wheel and three-point landings both occur from the same model, and a
   sloppy touchdown can swing toward a ground loop.
4. The parked attitude is derived from the contact points and held by the sim
   (F6F 9.49 deg, F4F 12 deg 20 min); the renderer draws what the sim says.
5. A synthetic tricycle aircraft and a synthetic twin-engine aircraft, defined
   only as spec fixtures, pass the same ground conformance battery as the
   taildraggers. No P-38 or bomber content ships in T1.

**Out of scope:** AI take-off and landing (7g), which sits on top of this;
P-38 and bomber content and flight models; carrier arresting-gear changes
beyond keeping `carrierLanding` and `trap` green.

## 2. The standard: one undercarriage model, layouts are data

The gear block stops being "one wheel height plus rate gates" and becomes a
list of **contacts** plus the few numbers the moments need. No layout is
special-cased in code; a taildragger and a tricycle differ only in data.

`gear.contacts[]`, each entry (body frame, metres, origin as `position`):

| Field | Meaning |
| --- | --- |
| `id` | `mainL`, `mainR`, `tail`, `nose`, extra mains for bombers |
| `pos` | `[x, y, z]` of the wheel's ground point with the strut extended |
| `strut` | spring and damping, so compression, bounce and porpoise are real |
| `sideGrip` | tire lateral force limit as a fraction of load |
| `steering` | `fixed`, `caster`, `casterLock` (lockable), or `steered` with `maxDeg` and a source (`rudder`, `nosewheel`) |
| `brakeGroup` | `left`, `right`, or `none`, for differential braking |

Per-aircraft extras: `gear.inertia` (pitch and yaw, kg m^2; bombers differ by
an order of magnitude), and `propulsion.engines[]` carrying position, spin
direction and a `propwashOnTail` factor. The P-38's counter-rotating props
cancel torque by data (opposite spin), and a twin's differential thrust steers
through the same engine list. Whether existing specs already carry an engine
list is checked in Phase A's first task; if not, the list is added and derived
from existing fields, not invented.

`heightM`, `tailUpSpeedMps` and `tailwheelYawRateDegPerSec` are removed, not
kept alongside. Every reader is enumerated in section 5.

**Parked attitude is derived.** The rest pitch is the pitch at which all
contacts touch, computed from `pos`; the content author does not type it. A
load-time validator asserts: the CG projects inside the contact polygon, the
derived angle matches the reference (Grumman's 12 deg 20 min for the F4F) to a
stated tolerance, and contacts sit inside the drawn model within tolerance
(the W1 gap list: hub 2.347 m vs 2.10 m, wheelbase 5.04 vs 5.46 m, track 1.28
vs 1.96 m is where the Wildcat model and its specs first disagree, and this
validator is what stops that recurring).

## 3. Dynamics

Ground pitch and yaw become integrated states, replacing the rate override.
Per step, with contacts touching terrain or deck:

- **Normal forces** from strut compression at each contact; sum gives weight
  support, moments about CG give pitch and roll. Tail-up is the tail contact
  losing load as elevator force plus prop wash exceed the tail-down moment,
  then rotation about the main axle. Landing is the reverse: the same
  contacts loading in a different order gives a wheel or a three-point
  touchdown with no mode switch.
- **Tire forces** per contact: rolling drag (existing coefficients), brake
  drag per `brakeGroup` (so differential braking is the left/right difference
  about the yaw axis), and lateral force limited by `sideGrip`. The existing
  `lateralGripSeconds` decay stays the fallback so a ground loop remains
  possible (Plan 11a's reasoning: rails would make it impossible).
- **Steering** by `steering` mode: `caster` swivels freely and gives a small
  restoring moment, `casterLock` behaves as fixed above a speed threshold or
  when the lock input is set, `steered` follows its source. The F4F tailwheel
  is not steerable ([HB]) and is data-declared `caster`.
- **Yaw sources:** rudder authority scaled by dynamic pressure plus prop wash
  over the tail (per engine, `propwashOnTail`); engine torque and P-factor
  from the engine list; differential thrust for multi-engine.
- **Autopilots and assists:** `autoRudder` (`src/assists/index.ts:673`) is
  gated off while any contact bears load, so it never opposes the pilot on
  the ground.
- **Energy:** the surface projection in `restOnSurface` keeps the "never gain
  energy" ruling; contact forces do work only through friction and strut
  damping.

Determinism: fixed-step, no `Math.random`, no wall clock, same as everything
in `src/sim`. `src/sim` keeps its import boundary.

## 4. Phases

Each phase merges on its own and leaves `npm run verify` green.

- **Phase A, attitude.** Contacts and inertia in the three specs; the
  validator; derived rest attitude in the sim; tail-up and rotation from
  moments (steering still on the old override). The render stance is pointed
  at the sim attitude and its tilt ramp retired. Re-read: take-off cards,
  landing rest-point pins, `restOnSurface` tolerance.
- **Phase B, taxi and yaw.** Caster and lock, differential brakes (a
  `brakeLeft`/`brakeRight` control pair beside the existing `brake`, with
  bindings), prop wash and torque swing, auto-rudder gating. The taxi failure
  above becomes a permanent regression test.
- **Phase C, landing.** Wheel and three-point touchdowns, porpoise damping
  through strut damping, ground-loop tendency. Re-read `landing`,
  `carrierLanding`, `trap`, `soak` (seed 7 is known marginal).

The conformance battery (section 6) is written in Phase A and grows each phase.

## 5. What this touches (from the code map, 2026-09-28)

Sim: `src/sim/flight/schema.ts` (gear block, strict), `src/sim/ground.ts`
(`onGround`, `restOnSurface`, `supportedContact`, `groundBodyRates`,
`lateralGripAfter`, `rollingResistanceN`), `src/sim/flight/model.ts`
(ground start and force blocks, attitude write), `src/sim/loop.ts:744`
(impact check stays on raw position.y on purpose), `src/sim/world/airfields.ts`
(`parkedAttitude` gains pitch), `src/sim/scenario.ts`, `src/render/spawn.ts`.
Content: `f6f-hellcat.json`, `a6m2-zero.json`, `f4f-wildcat.json`.
Input and assists: `src/input/bindings.ts`, `src/assists/index.ts`.
Render: `src/render/scene/stance.ts`, `src/render/frame.ts`.
Tests that pin ground behavior and will move or be re-graded:
`tests/sim/ground.test.ts`, `tests/sim/testcards/{graded,f6f,f4f,a6m}.test.ts`
(via `tools/testcards/measure.ts`), `landing`, `carrierLanding`, `trap`,
`terrainContact`, `soak`, `flight/negativeG`, `flight/schema`,
`assists/autoRudder`, `render/frame`, `render/stance`, `tools/models/stance`,
`e2e/takeoff.spec.ts`, `render/runway`. Golden trajectory and replay tests are
expected not to move; if they do, that is a finding to report, not to absorb.

## 6. Standards Mark asked for: the conformance battery

`tests/sim/ground/conformance.test.ts` runs, per aircraft spec and per
fixture, the same checks. A new aircraft passes it or does not ship.

1. Contacts valid: CG inside the polygon; derived rest attitude equals the
   reference within tolerance; contacts inside the drawn model.
2. Parked: at rest the aircraft stays at rest for 60 s with brakes off on
   level ground (no creep, no bounce drift).
3. Taxi: straight line holds heading (no yaw drift over 100 m at idle
   throttle); a rudder step gives a bounded turn; differential brake turns
   the right way.
4. Take-off: tail-up or nose-up speed found from the model is recorded and
   compared to the reference where one exists (a gap is reported, never tuned
   away, R36); the roll ends airborne.
5. Landing: a 3-point drop and a wheel drop from stated sink rates settle
   without energy gain and without a bounce above a stated height.
6. Synthetic fixtures: a tricycle single and a twin with counter-rotating
   engines run the same battery from spec data only.

`docs/aircraft.md` (the W1 onboarding runbook) gains an "undercarriage" step
pointing at this battery, so adding the P-38 later is: author contacts and
engine list, pass the battery.

## 7. Constraints carried over

- R36: report a gap; never tune a coefficient to pass a card. Graded-card
  tolerances only tighten. The F6F take-off card at -0.605% is two uncorroborated
  guesses cancelling (Plan 11a); Phase A re-grades it honestly and may move it.
- `src/sim` never imports `render/`, `input/`, `assists/`, `audio/`, Node core
  or a rendering library; aircraft schema objects stay `.strict()`.
- Plan 11a's "never gain energy" and "no rails" rulings hold.
- Open Plan 11a/11b items this addresses: directional stability on the ground,
  porpoise, over-rotation. Not addressed: seed-7 soak (tracked, not owned here).
- Verification goes through `remote-run npm run verify`; Tier 2 through the
  GPU harness.

## 8. Risks

- **Numerical stiffness** of strut springs at the fixed step: the strut
  constants are chosen with the step size in view and a test pins stability.
- **Card churn:** Phase A will move take-off runs. Expected; each move is
  recorded in the ledger with cause, not absorbed.
- **Data honesty:** contact positions and inertias are estimates until sourced.
  Each is labeled ESTIMATE or cited, as W1 did for the fuel zones.
- **Carrier/deck contact** shares `supportedContact`; Phase C is where it is
  most likely to regress.

## 9. Open for the plan (not for this spec)

Mark's viewing checkpoints and whether the run is attended are recorded in the
plan header, per repo convention.
