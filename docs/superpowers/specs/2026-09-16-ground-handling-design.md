# Ground handling, gear and take-off — design (Plan 11a)

**Status:** design, 2026-09-16. Master spec §15 orders this next; §4 and §5 are
the sections it belongs to.

Plan 10 made the ground something you can hit. This makes it something you can
roll on. At the end of it the F6F starts on a runway at Tacloban, accelerates,
rotates, and flies — and the graded historical take-off card measures that
rather than a harness trick.

It deliberately stops before landing. 11b owns flaps, the approach, the flare
and the touchdown. The split was taken on 2026-09-16 when the original Plan 11's
scope was read out in full; see §15.

## 1. The thing that is actually hard

Not the forces. **The flight model commands rates, not moments.**

`ratesFromDynamicPressure` (`src/sim/flight/model.ts`) turns stick deflection
straight into a body rotation rate, scaled by dynamic pressure against a
reference. Master spec §5 chose this deliberately: no moments of inertia, no
damping derivatives, controls that go mushy near the stall for free.

In the air that is a good trade. On the ground it is simply wrong:

- An airplane on its wheels **cannot roll at all**. Aileron deflection moves the
  ailerons; the airframe stays put because the gear holds it.
- It **cannot pitch freely** either. It rotates about the main wheels, and only
  once there is enough elevator authority to lift the tail — which, for a
  taildragger like the F6F, happens partway down the roll, not at the start.
- It **can** yaw, but not aerodynamically: that is the tailwheel and differential
  braking, not the rudder, until the rudder has airflow over it.

So the central work of this plan is a **second control regime**, not a new force.
Weight-on-wheels has to suppress roll entirely, gate pitch, and reroute yaw.
Anything that adds ground reaction forces while leaving the rate command intact
produces an airplane that barrel-rolls down the runway.

## 2. The ground model: a constraint, not a spring

**Taken: a kinematic constraint.** When the airplane is on the surface, its
vertical position is the surface and its vertical velocity is zero; rolling
friction and braking act along the ground track.

| Option | Verdict |
| --- | --- |
| Kinematic constraint | **Taken** |
| Spring-damper gear, per-wheel compression | Rejected |
| Per-wheel raycast suspension | Rejected |

A spring-damper gear model would be **more physically detailed than the flight
model it attaches to**. That model carries no moments of inertia, so there is
nothing for a per-wheel moment to act on; the suspension would be simulating
detail the airframe cannot express. It also needs stiffness tuned against a
fixed 60 Hz step or it oscillates, and this project's determinism guarantee
makes a tuning-sensitive integrator a liability rather than a detail.

The constraint is also **what the codebase already does by hand**.
`measureTakeoffRun` pins `position.y` and `velocity.y` to zero after every step
precisely because there is no ground. This plan moves that pin into the
simulation, where it belongs, and deletes it from the harness.

### The energy invariant, which this can break

`stepChecked` asserts via `assertNoEnergyGain` that airmass specific energy
never rises at idle throttle (`src/sim/invariants.ts`). The constraint interacts
with it in one direction only:

- **Killing vertical velocity removes energy.** Safe.
- **Raising the airplane onto the surface from below adds potential energy.**
  Not safe — `g * h` goes up, and at idle throttle that trips the invariant.

So the constraint must never lift. An airplane found below the surface is Plan
10's business: `advance` records an impact and freezes. The constraint applies
to an airplane resting ON the surface within a tolerance, and the plan must
state that tolerance and test the boundary rather than discovering it in a soak
failure.

## 3. Weight on wheels

One predicate, derived rather than stored: the airplane is on the ground when it
is within a small height tolerance of the surface beneath it AND its gear is
down. It is a function of state, not a flag that can disagree with the state.

Everything else in this plan reads it:

| Consumer | Behavior when weight is on wheels |
| --- | --- |
| Roll rate | Zero. Not reduced — zero. |
| Pitch rate | Zero until the tail can be lifted, then the normal rate command |
| Yaw rate | From the tailwheel and differential braking, blended into rudder authority as speed builds |
| Vertical velocity | Clamped to zero |
| Altitude | Clamped to the surface |
| Drag | Gains rolling resistance and braking |

## 4. Landing gear

A new field on `AircraftState`, not on the spec: gear position is a thing the
pilot changes in flight, so it belongs with the state that changes. Its
retraction is not instantaneous — a Hellcat's gear takes several seconds — which
matters because retracting early is a real technique and because the drag
changes over that interval rather than in one tick.

Gear contributes **parasitic drag** while extended. The aircraft spec gains a
gear-drag term; the plan must state how it was sourced or, honestly, that it was
estimated.

Gear also feeds Plan 10's severity judgment. `contactOutcome` already takes
`(spec, state, surface)` and was written so this plan adds inputs rather than a
second judgment. Here 11a adds only what take-off needs — gear down and a
survivable surface — and 11b adds the approach criteria.

**Flaps are explicitly 11b's**, even though the take-off card's historical figure
is a full-flaps number. See §7.

## 5. The runway

**A visual strip on the real terrain.** Decided 2026-09-16 after measuring the
committed heightfield: north-south through Tacloban the ground runs 1.2 m to
1.7 m over 1.8 km — a 0.03% grade. The real ground is already a table, so
nothing needs flattening and there is no second source of ground truth to keep
in sync. The physics reads `heightAt` exactly as it does everywhere else.

Tacloban's world coordinate is `(-29666, 47605)` and is **taken from
`tests/tools/terrainBuild.test.ts`, never re-derived** — it was sourced
independently and cross-checked against the Copernicus tiles on 2026-09-14, and
an equirectangular back-of-envelope lands about 80 m away. Two nearly-equal
coordinates for one airfield is the drift this project keeps writing down.

Two facts the plan must confirm rather than assume:

1. The measurement above is **L4, at 391 m sample spacing**. Finer levels have
   more texture, and contact reads whichever level is loaded. The plan must
   measure the same line at the finest committed level before relying on it, and
   state what it found.
2. East-west through the airfield the spread is 3.1 m because the coastline
   falls to the sea. The strip's **orientation is therefore not free** — it wants
   to run north-south, as the historical one did.

The strip is render-only: geometry and a surface treatment distinct from the
terrain shading. It is not an entity, has no collision of its own, and nothing in
`src/sim/` knows it exists.

## 6. Controls

Take-off needs inputs the airplane does not have. Each needs a key, and
`src/input/bindings.ts` is the only place a key is chosen — `legend.test.ts`
fails the build if a binding ships without a legend row, which is the mechanism
that catches an undocumented control.

| Input | Shape |
| --- | --- |
| Gear | Toggle, with travel time |
| Brakes | Held, proportional if the keyboard allows it, otherwise on/off |

`G` is the conventional gear key and is unbound. The brake key must be chosen
against the existing table; note that `B` is free but that several obvious
letters are already assists (`L`, `R`, `H`) and the assists' own comment warns
that a later plan wanting `L` for landing gear would have to move a toggle.

## 7. Verification

**The acceptance test already exists and is currently faked.**
`measureTakeoffRun` pins the airplane to `y = 0` after every step. This plan
deletes that pin and lets the card run against real ground. The card is graded
against a cited Patuxent River figure — 755 ft, 230.124 m — and
`content/aircraft/f6f-hellcat.json` already records honestly that the model runs
short of it because it has **no flaps, no rolling friction and no ground
effect**.

This plan adds rolling friction, which pushes the simulated roll **longer**, and
leaves flaps and ground effect to 11b. So the card's tolerance will move, and the
plan must **re-measure and restate it with evidence** rather than widening it to
whatever passes. If the roll lands further from the trial figure than before,
that is a real result and belongs in the handoff — the trial figure is a
full-flaps number and this airplane has no flaps.

Beyond that: Tier 1 for the weight-on-wheels predicate, the constraint's
boundary, gear travel and drag, and the suppressed rate regime; the soak extended
to cover an airplane that lands on its wheels rather than crashing; Tier 2 for an
actual take-off in a browser; Tier 3 for whether the roll and rotation feel
right, which is Mark's.

## 8. Out of scope, stated so it is not drifted into

- **Flaps, the approach, the flare, touchdown severity and roll-out after
  landing.** All 11b.
- **Ground effect.** 11b, with the flaps that make it matter.
- **Carrier decks.** Plan 8. A moving reference frame is a different problem and
  the whole reason a fixed runway comes first.
- **Airfield content** — buildings, revetments, parked aircraft, a control tower.
  Plan 12. This plan lays one strip.
- **Taxiing as a modeled discipline.** Steering exists so the airplane can be
  kept straight on the roll, not so it can be navigated around an apron.
- **Per-wheel anything.** See §2.
- **Damage from a heavy arrival on the gear.** Plan 6 owns damage; Plan 10 owns
  whether a contact was survivable.

## 9. Open questions for the plan

1. **Where the regime switch lives.** The constraint and the suppressed rates
   both belong to `step`, which means terrain reaching `SimContext` — the field
   Plan 10 deliberately refused to add speculatively, on the grounds that "later
   plans add a field when they have a consumer for it." This plan is that
   consumer. The plan must add it deliberately and check what the addition
   costs at every existing `step` call site.
2. **Whether the golden trajectory moves.** It flies with `terrain: null`, so the
   constraint should be unreachable for it — but that must be confirmed rather
   than assumed, because a regime predicate that reads a null field wrongly is
   exactly the kind of thing that moves a golden and gets re-baselined in a
   hurry.
3. **How the tail comes up.** Gating pitch on speed is the simple answer and may
   feel arbitrary. The alternative — elevator authority against a moment arm —
   reintroduces the moments this model does not have. The plan should take the
   simple one and say so, and treat the feel as a Tier 3 question.
