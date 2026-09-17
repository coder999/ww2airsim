# Ground handling, gear and take-off — Plan 11a, 2026-09-16

The F6F starts parked on the runway at Tacloban and takes off. The ground is a
surface it rolls on rather than one it falls through.

Merged to `main` as `de85b54` **before the plan finished**, at Mark's request, so
he could fly it over the HTTPS dev loop. Two planned tasks and several findings
from flying it remain — see "What is not done" at the bottom, which is the
section to read if you are picking this up.

Master spec §15 has the plan numbering and ordering; this document does not
restate it.

## What the flight model gained

**The hard part was never the forces.** The model commands *rates*, not moments
(master spec §5), which is a good trade in the air and simply wrong on the
ground: an airplane on its wheels cannot roll at all and pitches about its main
gear only once the tail can be lifted. So the center of this plan is a second
control regime, not a new force. The measured proof: with the rate override
applied in the wrong order, the airplane reaches **23.47° of bank with its
wheels on the runway**. It is now exactly zero, and provably so — `step`'s
`qIntegrateBodyRates` call is the only writer of attitude anywhere in `src/sim/`,
and the ground regime returns a literal zero on that axis.

**The constraint is a surface projection, not a spring.** A spring-damper gear
model would have been more physically detailed than the airframe it attaches to,
which carries no moments of inertia. The rule is **"never gain energy"**, not the
"never lift" the design first said — that earlier rule could not follow rising
ground, so the airplane buried itself on any upslope and died after 81 m of roll.
The projection places the airplane on the surface, up or down, and pays for any
rise out of kinetic energy. Verified by sweeping 6,528 cases: specific energy
non-increasing everywhere, worst change +7.3e-12 J/kg, with 1,512 of those cases
actually climbing — so it holds because the trade is exact, not because the
constraint refuses to move.

**`SimContext` gained a terrain field**, the one Plan 10 deliberately refused to
add speculatively. There are 51 construction sites and exactly one is production,
so it is optional and only `advance` passes it.

## Measurements that matter

**The graded historical take-off card stopped faking the ground.**
`measureTakeoffRun` used to pin `position.y` and `velocity.y` to zero after every
step, because the model had none. It now runs on real ground physics:

| | Roll measured | Against the 230.124 m trial figure |
| --- | --- | --- |
| Before, with the pinned state | 214.632 m | −6.73% |
| **Now** | **228.733 m** | **−0.605%** |

The tolerance was **tightened from 10% to 2%**, not widened. But read the comment
on it before trusting the number: **that agreement is two uncorroborated round
guesses cancelling**, not evidence of fidelity. It locks `engine.staticThrustN`
(20000, round, uncorroborated), `gear.rollingResistanceCoeff` (0.02, likewise)
and `reference.testMassKg` (sourced) against a **full-flaps** trial figure for an
airplane with no flaps. Measured sensitivity: μ 0.03 gives +2.60% (red), a 5%
thrust cut gives +5.10% (red), and 11b's flaps project to about +4% (red).
`propEfficiency` is entirely inert because the roll sits at the static-thrust cap.
**Retuning any of those three re-measures this number in the same commit.** That
is a pre-authorised re-measure, never a widen.

**Take-off works on real terrain**, which was in doubt: the constraint's first
version could not climb a slope at all.

| Grade | Roll to liftoff | Climb rate leaving the ground |
| --- | --- | --- |
| flat, control | 410 m | 0.98 m/s |
| 0.30% — L4, what a fresh clone sees | 417 m | 1.20 m/s |
| 2.12% — L0, what the main checkout sees | 453 m | 2.35 m/s |

From the actual Tacloban spawn, full throttle, rotation comes up at **185 m**.
(The card's 228.7 m differs because it measures to a fixed liftoff speed with a
fixed technique on flat synthetic ground.)

Liftoff used to be a **15.001 m/s catapult** — exactly
`GROUND_CONTACT_TOLERANCE_M / DT`, which is the signature of a position clamp
fighting a climbing airplane rather than of any physics.

## Every number that is a guess

Nothing here is a trial figure. All are labeled as estimates in
`content/aircraft/f6f-hellcat.json`'s `reference.source`, following the
`rollRateDegPerSec` precedent, and all are expected to be retuned by someone who
has flown them.

| Constant | Value | Notes |
| --- | --- | --- |
| `gear.heightM` | 2.2 m | Body origin to wheel contact. Derived: the real propeller is 3.99 m across with ~0.23 m of three-point tip clearance; the repo's own mesh disc reaches 1.95 m down, so 2.2 m clears it by 0.25 m |
| `gear.travelSeconds` | 7 | |
| `gear.dragAreaM2` | 0.3 | 46% of the airframe's own zero-lift drag area, so it is not a rounding error |
| `gear.rollingResistanceCoeff` | 0.02 | Generic tire-on-pavement. **Pinned by the 2% card — see above** |
| `gear.brakingResistanceCoeff` | 0.4 | |
| `gear.tailUpSpeedMps` | 15 | |
| `gear.tailwheelYawRateDegPerSec` | 20 | |
| `GROUND_CONTACT_TOLERANCE_M` | 0.25 m | Sized so a roll up a 2.12% grade at 50 m/s does not flicker between airborne and grounded |
| `GEAR_DOWN_FRACTION` | 0.95 | |
| `MAX_SUPPORTED_SINK_MPS` | 4.0 | A landing criterion that had to arrive early — an airplane must not-crash while stationary before it can roll. **11b tunes it** |
| `MAX_SUPPORTED_SPEED_STALL_MULTIPLE` | 1.6 | |
| `ARRIVAL_SINK_THRESHOLD_MPS` | 0.1 | Separates an arrival from a roll |

## What "on the ground" turned out to mean

Recorded because it was got wrong four separate times, each caught by review or
by Mark flying it, and each time the fix was another qualifier on a predicate
that started out purely geometric. A contact is **supported** — the wheels are
carrying the airplane — only when all of these hold:

1. within `GROUND_CONTACT_TOLERANCE_M` of the surface, measured at the **wheels**
   (`position.y - gear.heightM`), not at the body origin;
2. the gear is down;
3. it is not arriving faster than `MAX_SUPPORTED_SINK_MPS`;
4. if it *is* descending, it is not doing so above the speed cap — a level roll
   is supported at any speed, because the cap exists to stop a 150 m/s arrival
   counting as a landing, not to kill a take-off roll at 70 m/s;
5. **the surface is land.** Wheels do not roll on water.

Every gate is a positive comparison combined with `&&`, so a non-finite state
fails all of them and reads as a crash. Written as negations, a NaN would have
read as a successful landing.

**One asymmetry is deliberate and must not be tidied away:** `advance`'s impact
check in `src/sim/loop.ts` compares the **raw** `position.y` to the terrain, not
the gear-offset height. An airplane whose body origin is below the ground has
crashed whatever its wheels are doing. There is a comment saying so.

## Verification

- `npm run verify`: exit 0. The take-off card, the golden trajectory and the soak
  all sit inside it.
- The **soak's new assertions were shipped dead and then fixed**, which is the
  finding most worth carrying forward. At the shipped seed they covered
  `supportedContact` on **0 of 417,539 ticks**, and breaking the ground
  constraint left the suite green. A dedicated landing cohort plus a floor on
  `supportedContactTicks` — the same medicine the existing `terrainHits > 100`
  floor applies for the same reason — took that to tens of thousands of ticks,
  and the same mutation now fails immediately. **An assertion that never fires is
  worse than none**, because it reports "zero failures" indistinguishably from a
  working check.
- **Tier 2 (Playwright, real GPU): NOT executed.** Run on the Windows desktop:
  `npx playwright test tests/e2e/takeoff.spec.ts` — but note Task 13 never ran,
  so that spec does not exist yet.
- **Tier 3: partially done.** Mark took off successfully on 2026-09-16 and found
  two defects doing it, both since fixed: the airplane spawned buried to its wing
  root, and it could drive across the ocean instead of crashing.

## What is not done

**Planned but never executed:**

- **Task 11, the visual runway strip.** You take off from ordinary terrain at the
  real airfield location. Tacloban's ground there is essentially a table —
  measured 1.2 m to 1.7 m over 1.8 km north-south — so it flies correctly; it
  just does not look like an airfield. The strip must run **north-south**: east-
  west has 3.1 m of spread because the coastline falls to the sea.
- **Task 13, docs and Tier 2.** This document is the docs half, written early and
  by hand. The Tier 2 spec does not exist.

**Known gaps, deliberately left:**

- **Landing is 11b and is currently not achievable in practice.** The machinery
  exists — a gentle, wings-level, gear-down arrival on land inside the gates
  rolls out rather than crashing — but the window is narrow and untuned, and
  Mark reports only crashes. 11b owns flaps, ground effect, an approach speed
  that can actually be hit, and gates tuned by someone who has flown approaches.
- **No directional stability and no lateral gear force on the ground.** A
  measured taxi turn reaches **113.6° of sideslip** — the airplane skids, because
  nothing makes it go where its wheels point. Restoring the fin's weathercock
  term would be the wrong fix: a real taildragger is directionally *unstable* on
  the ground, so that term models the wrong sign of the right effect and would
  fight the tailwheel. Doing it properly needs a lateral tire force. Tier 3 / 11b.
- **Downhill rolling costs energy.** Coasting down a 2.12% slope loses 1493 J/kg
  where a flat coast loses 858 — the constraint discards potential energy going
  down rather than converting it to speed. Pre-existing, noticed during review.
- **A full held nose-up input over-rotates into a stall and porpoises.** Existing
  flight-model behavior, not introduced here, but it is the first thing a pilot
  meets on take-off.
- **The runway is bumpier in the main checkout than in a fresh clone.** The fine
  L0 tiles are gitignored and optional: 2.12% worst local grade at L0 against
  0.30% at L4, through the same line at Tacloban.

## The record

Twenty-five rulings were taken during execution and live in the plan's ledger.
Four defects on this branch traced to the plan text or to a controller ruling
rather than to an implementer: a double-applied camera offset, a dropped assists
argument on restart, a speed cap that killed the take-off roll, and the rate
override applied in an order that barrel-rolled the airplane down the runway.
Every one was caught by a review that measured rather than reasoned, or by Mark
flying it. That is the part of this process worth keeping.
