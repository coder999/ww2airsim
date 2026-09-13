# Plan 3 design — input assists

**Status: approved by Mark 2026-09-13 ("Plan looks good"), with the four OPEN
questions left unanswered.** Rather than block, each is resolved below with the
decision recorded and marked as MINE, not his. Every one is cheap to reverse and
none is load-bearing on the others.

### Resolutions taken in the absence of an answer, 2026-09-13

- **(A) Where it runs — a third module, called from the fixed step.**
  `src/assists/`, invoked once per tick by `advance` before `step`. The master
  spec's "between `input/` and `sim/`" is honoured as a call-chain position, not
  a directory-tree one, because an assist needs `dt` and must not vary with
  frame rate. Putting it in the frame loop instead would reproduce open item 5,
  the defect we already have on the input ramp.
- **(B) The weathercock constant does NOT move in this plan.** Weakening the fin
  is only safe once auto-rudder demonstrably carries the feel, and that cannot
  be judged until Mark can fly it. Deferred, still open item 9.
- **(C) Rate damping is DROPPED from this plan, not converted.** It is a no-op
  against a rate-command model, as argued below. The rotational-inertia idea
  that would make it meaningful is a `sim/` change that alters how the aeroplane
  feels, and Mark cannot fly it today, so shipping it now would be untestable by
  the only person who can test it. Recorded as a separate proposal instead.
- **(D) Switchable by keyboard, plus the Tier 2 diagnostics hook.** No options
  UI and no persistence: neither exists, and the meta-game is far out in the
  master spec's ordering. The hook matters more than the key, because it is what
  lets a test flip each assist and assert the difference.

This plan therefore builds THREE assists, not four.

## 1. Why now

The master spec specifies this layer already:

> **Assists.** Between `input/` and `sim/`, never inside either. Each
> independently switchable: rate damping, auto-rudder coordination, stall
> limiter, combat trim. All default on.

Plan 2's design deferred it, and gave a precondition rather than a date:

> Rate damping, auto-rudder, stall limiter and combat trim all calibrate
> against how the raw model behaves, and **nobody has felt it yet**. Building
> them now would be guesswork dressed as a feature.

That precondition is now met. Mark flew the merged branch on the reference
platform on 2026-09-13 and reported two things: it "feels pretty good", and
levelling out after a bank leaves the aeroplane travelling diagonally rather
than straight. He also said explicitly that strict fidelity to the historical
data is not the goal, and should be dropped where it becomes a foot-gun. The
master spec agrees: "Arcade-sim: readable and fun, not study-level."

So this plan is calibrated by feel, against a model that has now been flown.

## 2. What an assist is

A pure function from the pilot's raw command and the current state, to the
command actually handed to the simulation.

```ts
type Assist = (state: AircraftState, spec: AircraftSpec, raw: Controls, dt: number) => Controls
```

Three consequences, all good:

- **It reads state but never writes it.** The simulation is untouched, and the
  `sim/` boundary guards already in place keep it that way.
- **It is testable headlessly**, like everything else in this project. An
  assist is deterministic arithmetic over a state, so it needs no GPU and no
  browser.
- **It composes.** The assists run in a fixed order and each one sees the
  previous one's output, so the stack is a single fold.

**OPEN (A): where does the assist run?** The natural home is inside the fixed
step, once per tick, because it needs `dt` and must not vary with frame rate --
which is already an open item against the input ramp (design open item 5). But
the master spec says assists live between `input/` and `sim/`, and the fixed
step lives inside `sim/`. Options are a third module the loop calls per tick, or
accepting that "between" means "in the call chain", not "in the directory tree".
I lean to the former. This decides the file layout, so it wants settling first.

## 3. The four assists, honestly assessed

### Auto-rudder coordination — the one that was asked for

Reads sideslip, commands rudder to drive it to zero. A proportional term on the
yaw channel, clamped into the control range, and it is what every combat sim
ships because adverse yaw without pedals is unpleasant.

What we know about the target: NACA WR L-716 measured 18.5 degrees of sideslip
in left rolls and 23.5 in right rolls at full aileron at about 100 mph on the
real F6F-3, and judged its directional stability "low" and the result
"objectionable". So the thing being suppressed is real and large, and
suppressing it is a gameplay choice rather than a correction.

**Interaction with the weathercock term added in Plan 2.** Those are different
things and must not be conflated. The weathercock is aerodynamics, inside
`sim/`: the fin's restoring moment, which the model genuinely lacked. The
auto-rudder is a pilot aid, outside it: a controller moving a control surface.
Both may be on at once, and the design intent is a weak honest fin with the
assist doing the rest, so switching the assist off leaves an aeroplane that
still flies rather than one that cannot.

**OPEN (B): does the weathercock constant move?** It is currently 1.5 s and
guessed. If auto-rudder defaults on, the fin can be weakened toward the
historical figure without the crab being felt, which would make assists-off
mode meaningfully harder in the way a sim option should be.

### Stall limiter

Bounds the pitch command so alpha stays below the critical angle. Meaningful
here, and cheap, because `alphaCritRad` and `angleOfAttack` already exist and
`isStalled` is already computed every tick.

Caveat worth stating: `angleOfAttack` currently keeps the sideways component in
its denominator, so it over-reports alpha when crabbed (design open item 8).
A limiter built on it would clamp early during a slipping turn. That open item
should probably be fixed as part of this plan rather than before it.

**Amended 2026-09-13, during Task 3: that caveat is withdrawn, because open item
8 is wrong and has been retracted.** `atan2(-dot(v, up), dot(v, forward))` is
already the angle in the plane of symmetry — projecting the lateral component
out first changes neither dot product, verified to 1.2e-14 rad over 20,000
random states. Alpha does rise with crab, which is what alpha means, not an
inflation to be corrected. So the limiter is built on the shipped
`angleOfAttack` unchanged, and it should be: it has to bound the same quantity
`isStalled` and `liftCoefficient` are driven by, or it would clamp against a
boundary the wing does not have. The retraction, with the derivation and the
numbers, is item 8 in the Plan 2 design doc.

### Combat trim

Holds the aeroplane where it is pointed with the stick centred. In a
rate-command model, hands-off already holds ATTITUDE, because a released stick
commands zero rate. What it does not hold is the flight path: the aeroplane
still climbs or sinks as speed changes. So this is an altitude or flight-path
hold, not a trim in the classical sense, and calling it "trim" would be the
kind of name-versus-behaviour mismatch this project has corrected repeatedly.

### Rate damping — I think this one is a no-op, and want to say so before building it

In a rate-command model there is nothing to damp. Control input IS the body
rate, applied directly; release the stick and rotation stops within one tick.
There is no rotational inertia and no residual oscillation for a damper to act
on. The keyboard ramp already smooths the input edge, which is what makes it
feel solid.

It would become meaningful only if the model gained rotational inertia, i.e. if
commanded rate were a target that actual rate lags toward. That is arguably the
bigger feel improvement of the two, and it is a `sim/` change rather than an
assist.

**OPEN (C): drop rate damping, or convert it into rate lag in the model?** I
would not build the assist as specified. I would either drop it, or replace it
with a first-order lag on body rates inside `sim/`, with the time constant in
content beside `weathercockSeconds`. The second gives a noticeably more
substantial aeroplane and costs one constant per axis.

## 4. Switching and defaults

All default on, per the master spec. Each independently switchable.

**OPEN (D): switchable by whom, and when?** There is no settings UI and no
persistence yet, and the meta-game is far out in the spec's ordering. The
cheapest honest thing is a keyboard toggle plus the diagnostics hook already
exposed for Tier 2, so a test can flip each one and assert the difference.
A real options screen is a later plan's.

## 5. Testing

Assists are pure, so they follow the project's existing pattern: unit tests on
the arithmetic, plus behavioural tests that fly the model and assert the
outcome, exactly as `weathercock.test.ts` does.

The property that matters for each assist, and the one to write first:

| Assist | The test that would have caught a wrong sign |
| --- | --- |
| Auto-rudder | Sideslip after a full-deflection roll is smaller with it ON than OFF, at several airspeeds and both directions |
| Stall limiter | Full back-stick from level flight does not exceed `alphaCritRad`, at several speeds |
| Combat trim | Hands off for 60 s holds altitude within a band, where it currently does not |

Each must be proven to fail with the assist disabled, because "the assist is on
and the number is good" is not evidence that the assist did it.

## 6. What this plan does not do

No options UI, no persistence, no per-aircraft assist tuning, no AI use of the
assists. Those belong to later plans in the master spec's ordering.
