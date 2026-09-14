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

**Implemented 2026-09-13 (Task 4), as `altitudeHold` in `src/assists/index.ts`,
under exactly the name this section argued for.** It needs memory this
document does not discuss (which altitude was captured, and when) -- see that
function's doc comment, and `AltitudeHoldMemory`'s, for the design and why it
is threaded explicitly rather than added to `World`. The mechanism is
feed-forward plus a two-loop proportional correction, structurally the same
idea as `sim/autopilot.ts`'s pre-existing `holdLevelFlight` (cited, not
reused wholesale: that function also forces wings-level and uses gains tuned
for a repeatable measurement harness, not pilot feel). One new content
constant, `rates.altitudeHoldSeconds = 3`, measured against `step()` end to
end: unassisted, 60 s hands-off drifts 19-236 m depending on speed and
throttle; assisted, the same six conditions finish within 0.4 m, worst
excursion under 11 m.

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
| Stall limiter | Full back-stick from level flight does not exceed `alphaCritRad` at 130 and 180 m/s, where the same pull stalls without the assist; and at every tick inside the recoverable band the limiter is commanding recovery — see the amendment below |
| Combat trim | Hands off for 60 s holds altitude within a band, where it currently does not |

Each must be proven to fail with the assist disabled, because "the assist is on
and the number is good" is not evidence that the assist did it.

**Amended 2026-09-13, during Task 3: the stall-limiter row above originally read
"Full back-stick from level flight does not exceed `alphaCritRad`, at several
speeds", and that is not true of any limiter of this kind.** At 130 and 180 m/s
it holds (measured peak alpha 12.72 and 12.47 degrees against a 15.5 degree
`alphaCritDeg`, where the unassisted pull reaches 15.87 and 15.58 with 109 and
102 stalled ticks). At 70 m/s, level, full back stick, the same 30 seconds
reaches **179.8 degrees of alpha with 1,049 stalled ticks even with the assist
on** — the aeroplane loops, runs out of energy, and alpha rises because the
FLIGHT PATH falls away, which no pitch command opposes.

So the row is restated as the guarantee that does hold and is asserted:
`Controls.pitch` never asks for more than the remaining margin, and once the
boundary is crossed the limiter commands recovery at every tick until the
aeroplane is past 90 degrees of alpha and there is no authority left to ration.
`tests/assists/stallLimiter.test.ts` proves it on the 70 m/s departure (133
ticks inside that band, zero of them without a recovery command); Task 3's
review reproduced it across 192 runs, 8,756 band ticks, zero exceptions.

This was corrected for the same reason design open item 8 was retracted on the
same day: a durable document asserting a behaviour the code does not have is
this project's recurring defect, and an acceptance row is the worst place for
one, because the next person to read it will believe the assist is stall-proofing
and it is not.

## 6. What this plan does not do

No options UI, no persistence, no AI use of the assists. Those belong to
later plans in the master spec's ordering.

**Amended 2026-09-13, during Task 4: "no per-aircraft assist tuning" (the
original wording here) was already false by Task 3 and is deleted rather than
carried forward stale.** `autoRudderGainPerDeg` (Task 2), `stallLimiterSeconds`
(Task 3) and `altitudeHoldSeconds` (Task 4) are all per-aircraft content, each
with a schema entry -- exactly per-aircraft assist tuning, just not a UI for a
player to change it. What this section actually means, and should have said,
is no player-facing settings to CHOOSE those values at runtime.

## Open items carried out of Plan 3, 2026-09-13

Recorded here because the execution workspace is deleted at merge and these
would otherwise be lost. All three were found by the final review or its
re-review, all three are pre-existing rather than introduced by the fix wave,
and none blocks merge.

1. **Altitude hold does not stand down in the stalled band unless the stall
   limiter is switched on.** The pitch-authority budget narrows to the pilot's
   own command past `DEPARTED_ALPHA_RAD`, which is unconditional and holds with
   every assist combination. Below 90 degrees the narrowing comes from the
   limiter, so with the limiter OFF and altitude hold ON, altitude hold still
   commands full nose-up across the whole 15.5 to 90 degree stalled band.
   Measured, stick centred, held altitude 500 m above: +1.0000 at every alpha
   from 16 to 89.9 degrees, then 0 from 90.1 up. There is a step discontinuity
   at exactly 90.

   That is the band real stalls live in, and it is where the ruling behind the
   departed narrowing points hardest — an aeroplane near departure needs the
   nose down. The honest statement of today's behaviour is that the principle
   is enforced on one side of a cliff. The fix is for altitude hold to stand
   down whenever the aeroplane is stalled, independent of the limiter's switch,
   which is a behaviour question worth deciding at the controls rather than
   here.

2. **CLOSED 2026-09-13 (hardening wave).** The published budget was only
   truthful for a legal `Controls.pitch`: with a raw pitch of ±5 or NaN the
   stack returned that value while publishing a budget of [1,1], [-1,-1] or
   [0,0] — a false claim rather than a breach, since the command passed through
   identically to before the refactor.

   Fixed by clamping the INPUT, in `runStack`, before any stage or any budget
   sees it, rather than by widening the claim. Widening was not available
   without giving up "the budget never leaves the pilot's legal range", which
   is the property the whole arbitration rests on: a budget that has to contain
   5 is not inside [-1,1]. Clamping is also behaviour-preserving rather than
   merely defensible — `commandedBodyRates` already put every channel through
   the same `clampFinite(n, -1, 1)`, so 5 was already flown as 1 and NaN as 0,
   and `tests/assists/index.test.ts` now asserts the state reached through
   `step` is identical field-for-field either way. The two GATES that read the
   pilot's literal command (`isPitchCentred`, `nextAltitudeHoldMemory`) are
   deliberately left reading the unsanitised value: NaN means a malformed input
   event, not a centred stick, and mapping it to 0 there would engage altitude
   hold and capture a held altitude off a broken input.

3. **CLOSED 2026-09-13 (hardening wave).** `stallLimiter` clamped into its own
   bounds rather than into the narrowed authority — the one place a value went
   onto the pitch axis without going through `withinAuthority`. It now clamps
   into the intersection, and its guard test
   (`tests/assists/stallLimiter.test.ts`, total over alpha at 1-degree steps,
   14,440 direct calls to the stage) found two further holes the one-line
   description did not cover:

   - both no-bound EARLY RETURNS (departed, and no pitch authority) handed the
     command straight back alongside a budget it might not be inside. Handed
     [-0.4, 0.4] at alpha −100 the stage returned the pilot's raw +1. Both now
     put their value on the axis through the budget too, which is a no-op on
     every reachable path (departed: `runStack` has already collapsed the
     budget onto that exact command; unauthorised: nothing has narrowed it, so
     it is still [-1,1]).
   - `narrowAuthority` could publish an EMPTY budget when an incoming budget
     and the limiter's bound do not overlap — e.g. an upstream [0.25, 0.25]
     against a bound of [−1, 0]. `withinAuthority` on an empty budget returns
     `upper` for EVERY input (measured 2026-09-13: [0.25, 0] gives 0 from +1,
     from −1 and from 0.1; an earlier revision of this item said "upper or
     lower depending on which side the value came from", which is untrue — the
     correction is recorded here rather than quietly dropped). The objection is
     therefore not that the answer varies but that it comes from the order of a
     `min` and a `max` inside a helper rather than from a decision anybody
     wrote down, and that no caller can state a true invariant about a budget
     that cannot contain anything.

     The conflict is now decided rather than intersected: the bound being
     applied wins (later, more specific, and in the shipped stack the one
     keeping the wing attached), collapsed to its point nearest the budget it
     replaces, so `lower <= upper` holds of every budget this file publishes.
     Note the cost, stated where the rule is defined: on that branch the
     published budget is NOT a subset of the incoming one, so "narrowed, never
     widened" holds only where the ranges overlap. The decided point is pinned
     from both sides by a test, after review found that `lower`, `upper` and
     the midpoint each left all 453 tests green.

   All three are unreachable through `applyAssists` today and measured to be
   so: reverting any of them leaves the 442 tests as merged green, which is why
   the guard calls the stage directly. The stage is exported for exactly that
   test and has no other caller.

4. **CLOSED 2026-09-13 (hardening wave).** The architecture tests wrote four
   `src/**/__*__.ts` probe files into the real source tree and removed them in an
   `afterEach`, while vitest runs test files in parallel workers, so a concurrent
   `depcruise` — another worker's, a developer's, or a parallel CI job's — could
   see another test's probe.

   Fixed as the final review recommended: `cruiseWithProbes` copies `src/` plus
   `.dependency-cruiser.cjs` and `tsconfig.json` into a fresh `mkdtemp` root
   outside the repo, symlinks `node_modules` (needed because
   `sim-must-not-import-render-libs` matches `node_modules/(three|@webgpu)` and
   an unresolvable import produces no violation at all), writes the probes there
   and cruises that root. No config changes: every rule pattern is relative to
   the cruise root, and all seven rules were watched firing by name from a temp
   root.

   Measured, rather than argued: looping `npm run depcruise`'s exact command in
   a shell for as long as the boundary suite takes to run, 9 of 13 concurrent
   cruises failed with the old in-tree probes — seven reporting violations
   against 40 or 41 modules where the quiescent tree has 39, two dying with
   `ENOENT ... __cycle_a__.ts` — against 0 of 12 with the temp root. A new test
   asserts the four paths do not exist in the repo after a probe run and that
   the real tree still cruises clean immediately afterward; the `.gitignore`
   entry stays as a backstop, with its comment corrected to say that nothing
   writes those paths any more.
