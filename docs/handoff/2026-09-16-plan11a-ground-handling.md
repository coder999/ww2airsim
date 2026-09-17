# Ground handling, gear and take-off — Plan 11a, 2026-09-16

The F6F starts parked on the runway at Tacloban and takes off. The ground is a
surface it rolls on rather than one it falls through.

Merged to `main` as `de85b54` **before the plan finished**, at Mark's request, so
he could fly it over the HTTPS dev loop. The remaining two tasks — the runway
strip and the Tier 2 spec — landed on 2026-09-17, along with the two defects
Mark found flying it. **Tier 2 has still never been executed**; "What is not
done" at the bottom is the section to read if you are picking this up.

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
| `RUNWAY_LENGTH_M` | 1500 | About 5,000 ft, reported as what the Tacloban strip was extended to after the October 1944 landings. Uncorroborated. Chosen against two measured things: it fits inside the 1.8 km of flat north-south ground, and it contains the 410-453 m roll about 1.6 times over from a centre start |
| `RUNWAY_WIDTH_M` | 45 | The modern field's width. A 1944 Marston-mat strip was nearer 30 m, so this is generous — deliberately, since nothing yet makes the airplane track straight on the ground |
| `RUNWAY_SURFACE_OFFSET_M` | 0.05 | Anti-z-fighting only, and therefore a 5 cm lie: the physics reads `heightAt` and knows nothing about the mesh. **Whether 5 cm is enough at a grazing angle a kilometre down the strip is unverified** — it cannot be checked headless |

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
- **Tier 2 (Playwright, real GPU): written 2026-09-17, NOT executed.** Run it on
  the Windows reference desktop:
  `npx playwright test tests/e2e/takeoff.spec.ts`. It flies the DEFAULT spawn
  with no query string — deliberately not the `?spawnX/Y/Z` the plan's brief
  suggested, because `hasSpawnOverride` turns `groundSpawn` OFF for any
  override and would hand the test an airborne airplane with its gear up. It
  asserts `supportedContact()` is true while parked (the only outside view of
  the gate chain this plan got wrong four times), that the roll goes north
  rather than east, and that the airplane leaves the ground and is still clear
  of it two seconds later. Its timeout is raised to 150 s because the roll
  happens in real time.
- **Tier 3: partially done.** Mark took off successfully on 2026-09-16 and found
  two defects doing it, both since fixed: the airplane spawned buried to its wing
  root, and it could drive across the ocean instead of crashing.

## What is not done

**Planned, and now done (2026-09-17):**

- **Task 11, the visual runway strip** — `src/render/scene/runway.ts`, 1500 m by
  45 m, north-south, draped over the real heightfield.
- **Task 13, docs and Tier 2** — the spec exists; it has not been run.

**The one decision Task 11 forced, which the plan did not anticipate.** The
strip had to run north-south, but the airplane was parked facing **east**, on a
`qIdentity()` attitude left over from the airborne spawn Task 14 replaced. Built
as specified, the strip would have gone in crossways under an airplane taking
off across it and out to sea. Measured on the committed L4 field from
`DEFAULT_SPAWN_POSITION`, sampling every 30 m:

| Direction | Height spread over ±900 m | Sea ahead of the nose |
| --- | --- | --- |
| east — the old identity nose | 3.23 m | 900 m |
| north | 0.49 m | none within 900 m |

The roll to liftoff is 410-453 m, so an east-facing take-off cleared the coast
by about half its own roll — which is why `tests/sim/soak.test.ts` already
carried a case for Mark driving off the end of the runway onto the ocean. Mark's
decision, 2026-09-17: turn the spawn north. Nothing graded moved, and that is
why it was cheap — `tests/render/frame.test.ts`'s Task 14 check REPORTS its roll
distance and only asserts it is positive, and the graded card runs over
synthetic flat ground on purpose. The three fields a spawn's kind decides
(velocity, attitude, gear) were three separate ternaries inline in `main.ts`
where no Tier 1 test could reach them, and the attitude was the one that had
rotted; they are now `initialAircraftState` in `spawn.ts`, with tests.

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
- **Moving the spawn ashore made the sea look flat, and that is this plan's
  doing.** Reported by Mark on 2026-09-17 as "the ocean waves completely
  disappeared". Nothing in `src/render/ocean/` has changed since `b6a3929`,
  well before this plan. The cause is that the ocean shader multiplies all wave
  displacement by `smoothstep(0, 100, depth)` (`src/render/ocean/mesh.ts`) —
  **full wave amplitude requires 100 m of water** — and the old default spawn
  sat over 125 m of it while the new one looks out over San Pedro Bay:

  | Viewpoint | Depth | Wave amplitude multiplier |
  | --- | --- | --- |
  | old spawn `(0, 600, 0)` | 125.0 m | **1.000** |
  | from the runway, sea 900 m east | 2.0 m | **0.001** |
  | 4 km east | 5.7 m | 0.009 |
  | 16 km east | 0.0 m | 0.000 |

  A second, much smaller term compounds it: the polar mesh's angular fade kills
  wavelengths it cannot sample, so from a 2 m eye height the 0.24 m ripples are
  gone beyond 10 m, the 4 m chop beyond 163 m, and the 32 m swell starts fading
  at 652 m and is gone past 1,304 m. At the 900 m coastline that swell still
  retains 68% weight, so **the depth term dominates by roughly a factor of
  1,000** — fix that one first. Mark's call, 2026-09-17: fix both, the depth
  ramp and an eye-height-aware angular fade. The latter touches the measured
  GPU tier budgets in `src/render/ocean/tiers.ts` and will need re-measuring on
  the reference desktop.

## The record

Twenty-five rulings were taken during execution and live in the plan's ledger.
Four defects on this branch traced to the plan text or to a controller ruling
rather than to an implementer: a double-applied camera offset, a dropped assists
argument on restart, a speed cap that killed the take-off roll, and the rate
override applied in an order that barrel-rolled the airplane down the runway.
Every one was caught by a review that measured rather than reasoned, or by Mark
flying it. That is the part of this process worth keeping.
