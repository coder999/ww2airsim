# Approach and landing ashore — design (Plan 11b)

**Status:** design, 2026-09-17. Master spec §15 orders this next; §5 is the
section it belongs to.

11a got the airplane off the ground. This gets it back on: flaps, ground
effect, a lateral tire force so it tracks where its wheels point, tuned
touchdown gates, and a scripted approach autopilot that proves all of it
without a human in the loop.

The machinery for a landing already exists — 11a's `supportedContact`
(`src/sim/ground.ts`) will accept a gentle, wings-level, gear-down arrival on
land and roll it out. **It is not achievable in practice**, and 11a's handoff
records why: the window is narrow, the gates were picked before anything could
fly an approach, and Mark reports only crashes.

## 1. The two things that are actually hard

Neither is the aerodynamics.

### `aero.clMax` is inert, so the obvious flap model does nothing

Flaps raise maximum lift, so the natural change is to raise `clMax`. That
would compile, typecheck, pass every existing test, and have **no effect
whatsoever**.

`liftCoefficient` (`src/sim/aero.ts`) does not read `clMax`. Plan 1's finding
C1 — a lift discontinuity at negative alpha, where the post-stall branch
stepped *up* onto a larger magnitude at the stall and gained 1.17 g in the
direction of more lift — was fixed by taking the post-stall peak from the
attached-flow line evaluated at the signed boundary. That function's own
comment states the consequence: "`clMax` is no longer read by this curve at
all — the peak is whatever the linear branch reaches at alphaCrit." The field
survives in the schema and in `f6f-hellcat.json` as documentation of intent.

Measured 2026-09-17 on the shipped F6F: the peak the curve actually reaches is
**1.400013** at +15.5°, against a `clMax` field of 1.4. They agree to 1.3e-4
by coincidence, which is precisely why raising the field alone would look
plausible and change nothing.

So flaps must move `clAtZeroAlpha`, `clSlopePerRad` or `alphaCritDeg`. §2 takes
the first, which is also what flaps physically do.

### The acceptance loop is currently Mark, which is a stated requirement violated

Mark asked to be **kept out of the testing loop** as much as possible; that
requirement drove the three-tier test design. Landing is the one subsystem
where the loop has closed back onto him: the gates were chosen by calculation,
nothing flies an approach headlessly, and the only signal that the envelope is
wrong is Mark crashing.

Master spec §11 already prescribes the fix and has since before Plan 1 — its
Tier 1 "input sources with no human pilot" list item 2 is a **scripted
autopilot (`hold-level-heading`, `fly-pattern`, `approach`)**, and its
mission-level end-to-end item asserts "landed, touchdown vertical speed within
limits". 11b builds the `approach` half. See §5.

## 2. Flaps: a camber shift, with one derived number

Flaps shift the lift curve up at constant angle of attack. Modeled as an
addition to `clAtZeroAlpha`, scaled by how far they are out.

**The increment is derived from two sourced figures, not estimated.**
`f6f-hellcat.json`'s `reference.source` already carries both, and already says
the second one is out of reach:

> "The same table's landing-condition power-off stall is 84.5 mph (37.77 m/s),
> which an earlier revision of this file cited by mistake — it is unreachable
> for a model with no high-lift devices."

That sentence is the specification for this section. Since stall speed varies
as 1/√CLmax at fixed weight:

| Quantity | Value | Where it comes from |
| --- | --- | --- |
| Clean power-off stall | 43.81 m/s (98.0 mph) | `reference.stallSpeedMps`, graded today |
| Landing power-off stall | 37.7749 m/s (84.5 mph) | the same Patuxent table, via `reference.source` |
| Required CLmax ratio | **×1.3451** (+34.5%) | (43.81 / 37.7749)² |
| Peak Cl reached now | 1.400013 | measured 2026-09-17 |
| Target peak Cl, full flap | 1.8831 | 1.400013 × 1.3451 |
| **Full-flap Cl increment** | **+0.4831** | 1.8831 − 1.400013 |

+0.48 Cl from a split flap on a fighter of this class is the right order, which
is a sanity check on the arithmetic rather than independent evidence.

**The 84.5 mph figure is prose today, and a graded card cannot read prose.** It
exists only inside `reference.source`'s text. This plan must promote it to a
machine-readable `reference` field so §9's card asserts against data rather
than against a number retyped from a comment — which is the same class of
mistake as the two independent copies of `Ww2Diagnostics` that typechecked
clean while disagreeing. The `source` string must keep its sentence, since that
is where the provenance lives.

**`flapFraction` mirrors `gearFraction` exactly** — a fraction in [0, 1], not a
boolean, moving over `flap.travelSeconds`, because flap travel takes time and
the lift and drag change across it rather than in one tick. 11a's `gearAfter`
is the shape to follow, and `Controls` gains an optional `flapDown` for the
same reason it gained optional `gearDown`: `Controls` literals appear
throughout the suite and `undefined` must keep meaning "unchanged".

**Deliberate simplification, stated so it is not mistaken for an oversight:**
real flaps also reduce the stalling angle of attack. `alphaCritDeg` is left
alone. Moving it would need a second number with no source behind it, and the
graded quantity — the speed at which the wing quits — is already matched by the
camber shift alone.

**Flap drag is the one free parameter, and §7 pins it** rather than guessing
it.

## 3. Ground effect: a published factor with no free parameter

Within about a wingspan of the surface the trailing vortex system is
constrained by the ground, and induced drag falls. Modeled with McCormick's
factor applied to `inducedDragFactor` (`src/sim/aero.ts`):

```
phi(h) = (16h/b)^2 / (1 + (16h/b)^2)
```

With b = `geometry.wingSpanM` = 13.06 m, computed 2026-09-17:

| Wing height above ground | Induced drag multiplier |
| --- | --- |
| 1 m | ×0.600 |
| 2 m | ×0.857 |
| 3 m | ×0.931 |
| 5 m | ×0.974 |
| one span, 13.06 m | ×0.996 |
| two spans | ×0.999 |

**No fitted constant.** That property is load-bearing for §7: it is what leaves
flap drag as the single unknown the take-off card can characterize.

`h` is the wing's height above the terrain. The airplane's own reference point
is its body origin, which sits `gear.heightM` = 2.2 m above the wheels, so the
plan must be explicit about which height it feeds this — getting it wrong by
2.2 m is a factor of 1.4 on the induced drag in the flare, exactly where it
matters most. Ground effect reads the terrain through the same `heightAt` the
rest of the model does; `SimContext.terrain` already carries it, added by 11a.

**Lift increase in ground effect is not modeled.** The induced-drag reduction
is the dominant, well-published half; the lift half is smaller and its
published forms disagree more. Stated here so a later reader knows it was a
decision.

## 4. Lateral tire force: the same projection, sideways

**A landing that skids off the side is not a landing.** 11a measured a taxi
turn reaching **113.6° of sideslip** — nothing makes the airplane travel where
its wheels point.

11a's handoff already rejected the cheap fix and said why, and that ruling
stands: restoring the fin's weathercock term "models the wrong sign of the
right effect" because a real taildragger is directionally *unstable* on the
ground, and it would fight the tailwheel.

The design mirrors 11a's ground constraint, which is a **projection rather than
a spring**, for the same reasons that decision was taken there: a spring-damper
tire model would be more physically detailed than an airframe that carries no
moments of inertia.

**Mechanism, stated exactly so the plan does not have to invent it.** On
supported contact, velocity is resolved into the wheels' rolling direction and
the direction across it, and the across component **decays toward zero with a
time constant**, `gear.lateralGripSeconds` — one new constant, labeled an
estimate exactly as 11a's seven gear figures are. The precedent for the form is
`rates.weathercockSeconds`, which is already a seconds-valued time constant in
this spec.

A first-order decay rather than outright removal, and the difference matters:
removing the lateral component completely would put the airplane on rails and
make a **ground loop impossible**, and a ground loop is the characteristic
hazard of a taildragger rather than an edge case. A time constant lets a
mishandled touchdown skid and swap ends while a competent one tracks straight.
Choosing the number is a tuning question §5's autopilot can inform and §11 hands
to Mark.

**This cannot break the energy invariant, structurally.** Removing a velocity
component removes kinetic energy; it never adds any. That is the same argument
that made 11a's surface projection safe, and `assertNoEnergyGain`
(`src/sim/invariants.ts`) is the check.

## 5. The approach autopilot: the acceptance instrument

`tools/autopilot/approach.ts`, producing a player-identical `Controls` every
tick. **In `tools/`, not `src/`**: it is a test instrument and must not reach
the shipped bundle. Master spec §11 lists the scripted autopilot (item 2) and
the AI pilot controller (item 3) as *different* things — item 3 is Plan 7's, and
it flies the player's seat in a mission. Conflating them would put a mission AI
in the shipped bundle two plans early.

It flies a fixed profile: descend on a glide path toward the strip's approach
end, hold an approach speed on throttle, extend gear and flaps, flare, cut
throttle, hold attitude to touchdown, then brake to a stop.

**What it measures, which is the whole point:** touchdown sink rate, touchdown
speed, touchdown attitude, distance from the aim point, roll-out distance, and
lateral deviation at rest. Those numbers turn "the landing envelope" from
Mark's impression into values in CI that a regression moves.

## 6. Landing gates, tuned rather than asserted into place

11a shipped four constants that decide whether an arrival is a landing or a
crash, all chosen before anything could fly an approach, and its handoff hands
them to 11b:

| Constant | 11a value | Status |
| --- | --- | --- |
| `MAX_SUPPORTED_SINK_MPS` | 4.0 | "A landing criterion that had to arrive early — 11b tunes it" |
| `MAX_SUPPORTED_SPEED_STALL_MULTIPLE` | 1.6 | Multiplies `stallSpeedMps`, which §2 changes with flaps |
| `ARRIVAL_SINK_THRESHOLD_MPS` | 0.1 | Separates an arrival from a roll |
| `GEAR_DOWN_FRACTION` | 0.95 | |

The second one deserves attention: it is a multiple of the stall speed, and §2
lowers the effective stall speed by 34.5% with flaps out. **A constant
expressed as a multiple of a number this plan changes is a constant this plan
has already changed**, whether or not anyone edits it.

Tuning them means running §5's autopilot and choosing values that admit a
competently flown approach and reject an arrival that should hurt. A gate that
admits everything is worse than no gate, for the reason 11a recorded when its
soak assertions shipped covering zero ticks: an assertion that never fires
reports "no failures" indistinguishably from a working check.

## 7. The take-off card's pre-authorised re-measure

`reference.takeoffDistanceM` = 230.124 m (755 ft) is a **full-flaps** figure at
86.5 mph and 2700 RPM. The model matches it to **−0.605%** inside a tolerance
that 11a *tightened* to 2%.

That agreement is not fidelity, and `f6f-hellcat.json` says so at length: the
model has no flaps, "which pushes a simulated roll shorter than a full-flaps
trial roll", and no ground effect, "which pushes it longer". Two errors of
opposite sign, cancelling. 11a's handoff is blunter: the card "locks
`engine.staticThrustN` (20000, round, uncorroborated), `gear.rollingResistanceCoeff`
(0.02, likewise) and `reference.testMassKg` (sourced)", and projects that 11b's
flaps move it by about **+4% (red)**.

So this plan must:

1. **Fly the card with flaps set**, since the trial was flown that way. The
   card measuring a clean-wing roll against a full-flap figure is the fake this
   plan removes, exactly as 11a removed the pinned `position.y`.
2. **Re-measure the tolerance in the same commit as any retune.** 11a declared
   this "a pre-authorised re-measure, never a widen" — the distinction being
   that the number is recomputed from what the model now does, not relaxed
   until it passes.

**The useful consequence.** Ground effect (§3) has no free parameter and the
flap lift increment (§2) is derived, so the only unknown entering the card is
**flap drag area** — which the 2% card therefore *characterizes*, in exactly
the way it already characterizes rolling resistance. A guess becomes a
measurement.

`propEfficiency` stays inert, as 11a found: the take-off roll sits at the
static-thrust cap.

## 8. Controls and indication

11a bound `G` for gear and `B` for brakes, with legend rows. This adds `F` for
flaps, the same way.

11a's Task 12 added a gear state to the follow-view numeric strip and recorded
that "a cockpit annunciator is 11b's, with the flaps indicator beside it". That
debt is this plan's: flaps in the numeric strip, and the cockpit annunciator
for both.

A pilot who cannot see the flap position cannot fly a repeatable approach, so
this is not cosmetic.

## 9. Verification

- **Tier 1, the flap model:** a new graded test card against the landing-
  condition power-off stall, 37.7749 m/s. This is the acceptance test for §2
  and it is a *sourced historical figure*, not a self-consistency check. It
  reuses `measureStallSpeed` (`tools/testcards/measure.ts`) with the flaps set
  rather than adding a second stall measurement — that function already holds
  the hard-won part, including its refusal to report "whatever the airspeed
  happened to be" when the wing never stalls inside the run.
- **Tier 1, the take-off card:** re-flown with flaps per §7.
- **Tier 1, the landing:** §5's autopilot flies an approach into Tacloban and
  asserts no impact, touchdown sink inside the gate, and that the airplane
  **comes to rest on the strip** — which is what §4 buys and what nothing
  currently checks.
- **Invariants:** `assertNoEnergyGain` must hold through the flare, the
  touchdown and the roll-out. §4 is structurally safe; ground effect reducing
  drag is not an energy source either, but the soak is where that gets proven
  rather than argued.
- **Soak:** the terrain-contact soak gains landing cohorts. 11a's lesson
  applies directly — it shipped assertions covering **0 of 417,539 ticks**, and
  breaking the ground constraint left the suite green. Any new assertion here
  needs a floor on how often it fired.
- **Tier 2:** an approach spec, written and stated as not executed unless it is
  actually run on the Windows desktop. 11a's Tier 2 take-off spec
  (`tests/e2e/takeoff.spec.ts`) is still unexecuted as of 2026-09-17; this plan
  must not pretend otherwise.
- **Tier 3:** Mark flies approaches and judges feel. That is the *last* step
  here, not the mechanism — which is the change from 11a.

## 10. Out of scope, stated so it is not drifted into

- **Carrier landings.** Plan 8. §15's third coupling is explicit: a fixed
  runway precedes a moving deck so a landing defect has one candidate cause.
- **Damage from a hard landing beyond the existing crash outcome.** Plan 10
  classifies an impact; graded touchdown severity belongs with damage in Plan 6.
- **A player-facing approach assist.** Plan 3 owns assists. If landing proves
  too hard by hand once it is tunable, that is a Plan 3 addition with its own
  decision, not something this plan should quietly add.
- **Airfield content** — buildings, markings, parked aircraft. Plan 12, with
  Plan 13's surfacing. 11a's minimal strip is what this lands on.
- **Lift increase in ground effect** (§3), and **stall-angle reduction with
  flaps** (§2).
- **Moments of inertia.** The model commands rates, not moments (§5 of the
  master spec). Every decision above is shaped by that and none of them
  relitigates it.

## 11. Open questions for the plan

1. **`MAX_SUPPORTED_SINK_MPS` stays a judgement call.** The autopilot can show
   what sink rate a flown approach *produces*; whether 4.0 m/s is the right
   line between "landed" and "broke the airplane" is Mark's, and it is the one
   number here no source settles.
2. **Downhill rolling costs energy.** 11a's review found the constraint
   discards potential energy going downhill — 1493 J/kg down a 2.12% slope
   against 858 J/kg on the flat. Pre-existing, and it sits directly underneath
   this plan's roll-out measurements. The plan should decide whether to fix it
   here or record it again; Tacloban is flat enough that it may not bind.
3. **A held full nose-up input over-rotates into a stall and porpoises.**
   Existing behavior, not introduced by 11a, but it is what a pilot meets on
   both take-off and a go-around.
4. **Whether the shallow-water waves read correctly from the runway is
   unverified.** The 2026-09-17 ocean fix — a depth-limited breaking cap and a
   Nyquist angular fade — is measured but unseen: `marktuttle.dev` is blocked on
   Mark's work network. An approach flown over San Pedro Bay is where it will be
   judged, so this plan is the natural moment, but it is not this plan's work.
5. **Which height feeds ground effect** (§3) — the plan must state it in the
   task rather than leave it to the implementer, because the wrong choice is a
   2.2 m error that looks like a tuning problem.
