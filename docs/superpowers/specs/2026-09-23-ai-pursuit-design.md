# Plan 7a — AI flight controller and pursuit pilot

2026-09-23. This is the first bounded slice of Plan 7 (master spec §7): one
AI aircraft can fly the shared flight model, pursue an assigned aircraft and
fire when it has a valid short-range gun solution. It establishes the control
and world-update seams that every later maneuver and decision rule will use.

## 1. Player-visible result

A new `pursuit-range` development scenario starts the player and a second F6F
airborne. The second aircraft closes from astern, flies lead pursuit through
the same `Controls` and `step` path as the player, and fires only while its
nose has a close gun solution.

The second F6F is deliberately a systems-test stand-in, not a historical enemy
claim. The project has no second airframe yet. Aircraft identity, teams and
historical matchups remain later content work.

## 2. Controller boundary

`src/sim/ai/` owns two pure layers:

1. The flight controller accepts an aircraft state, its coefficient set and a
   desired world-space velocity vector. It emits ordinary `Controls`. Attitude
   errors are measured in the aircraft body frame; proportional terms command
   roll, pitch and yaw, and body-rate terms damp the response. Desired speed
   drives throttle. Every output is finite and clamped to the player control
   ranges.
2. The pursuit pilot predicts a bounded intercept point from target position
   and velocity, turns that into the desired velocity, and asks the flight
   controller to fly it. It holds the trigger only inside a bounded range and
   angular cone around a muzzle-velocity lead solution.

There is no privileged AI kinematics path. The controller never writes
position, velocity or attitude.

## 3. Fixed-tick integration and authority

An aircraft may carry a static pilot assignment naming its target. On every
fixed tick, `advance` first snapshots the aircraft array, derives all assigned
pilots' controls from that snapshot, and only then steps any aircraft. Thus:

- controller cadence is 60 Hz, independent of render frame rate;
- every pilot reads every aircraft at the start of the same tick;
- reversing entity array order cannot change a trajectory;
- the assignment and the last emitted controls are serialized in `World`;
- an assigned pilot can fly the player entity in headless tests.

Missing targets are rejected when a world is created. Impacted or destroyed
aircraft do not receive new pilot commands, and the existing flight/combat
paths remain responsible for stopping motion and weapons.

The no-pilot path performs no controller arithmetic and preserves existing
world behavior.

## 4. Scenario content

Scenario aircraft gain a second start form:

```json
{
  "id": "bandit-1",
  "spec": "f6f-hellcat",
  "airborneAt": {
    "position": [-1200, 3100, -350],
    "headingDeg": 90,
    "speedMps": 125
  },
  "pilot": { "target": "f6f-1" }
}
```

Exactly one of `parkedAt` and `airborneAt` is present because the schema uses
two strict alternatives. Compass heading follows the existing world
convention: 0 degrees is north (`-Z`), 90 degrees is east (`+X`). Airborne
starts have gear retracted, are not terrain-settled, and do not hold the world
while terrain loads. Existing scenario records remain valid without edits.

Pilot targets must name another aircraft in the same scenario. A pilot block is
optional, so existing parked targets and wingmen remain inert.

## 5. Deliberate boundary

This slice does not implement the full Plan 7 maneuver and decision layers. It
does not add pilot skill, reaction delay, energy-state utility scoring,
disengagement, defensive maneuvers, formation keeping, landing AI or teams.
Those features require persistent pilot decision state and are Plan 7b/7c work
built on this controller seam. Keeping them out makes the first acceptance
claim narrow: an AI pilot can physically fly and attack through the fair path.

## 6. Acceptance

### Tier 1

- Controller commands have the correct sign for targets above, below, left and
  right; damping opposes existing body rates; all channels remain finite and
  bounded.
- Pursuit leads a moving target, closes rather than flies pure pursuit, and
  fires only within the specified range and lead-angle cone.
- AI controls are recomputed once per fixed tick from start-of-tick states.
- Reversing aircraft array order produces the same per-id result.
- A pilot assignment can fly the player seat.
- Missing/self targets and malformed airborne starts are rejected.
- The shipped pursuit-range bundle loads in Node and through the browser loader.
- Existing flight, combat, landing and replay goldens remain unchanged.

### Tier 2

On the reference GPU, boot `pursuit-range`, observe the AI aircraft maneuvering
under production physics and eventually emitting gunfire, and assert zero
validation errors within the existing render-time budget.
