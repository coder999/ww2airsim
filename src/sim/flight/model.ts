import { type Vec3, v3, add, sub, scale, dot, length, normalize, cross, ZERO } from '../math/vec3.js'
import { qRotate, qIntegrateBodyRates } from '../math/quat.js'
import { densityAt } from '../atmosphere.js'
import { piecewiseLinear } from '../math/piecewise.js'
import { liftCoefficient, dragCoefficient, alphaCritRad, windmillDragCd0, groundEffectFactor, sideForceN, attachedFlowFraction } from '../aero.js'
import {
  gearAfter,
  gearDragN,
  restOnSurface,
  lateralGripAfter,
  supportedContact,
  onGround,
  rollingResistanceN,
  groundBodyRates,
  GEAR_DOWN_FRACTION,
} from '../ground.js'
import { groundUnder } from '../world/ground.js'
import { insideTrapZone, type Deck } from '../world/deck.js'
import { flapAfter, flapClIncrement, flapDragN } from '../flaps.js'
import type { AircraftSpec } from './schema.js'
import type { AircraftState, Controls } from './state.js'
import type { SimContext } from '../loop.js'

export { createState } from './state.js'
export type { AircraftState, Controls } from './state.js'

/** The fixed timestep the whole simulation is designed around, seconds.
 *  Spec: 60 Hz. This is a constant every caller is expected to pass, not
 *  something `step` enforces -- `step` integrates whatever positive, finite
 *  `dt` it is handed (see `assertUsableDt`). Who owns the fixed-step contract,
 *  and how a variable frame time is accumulated into 60 Hz ticks, is a
 *  deliberately deferred design decision for the next plan. */
export const DT = 1 / 60
/** Constant deceleration of an arrested airplane relative to the deck: 2.0 s
 *  and 34 m of run-out from a 34 m/s arrival, about 1.7 g, in the range of a
 *  real pendant run-out (design section 5, amended during planning to a
 *  constant so the rule needs no memory of the arrival speed). */
export const TRAP_DECEL_MPS2 = 17
/** The "no decks in this world" argument for `groundUnder`, shared and frozen
 *  rather than a fresh `[]` at each of `step`'s two ground lookups: `step`
 *  runs 60 times a second per airplane, and nearly every world in the suite
 *  and every pre-Plan-8 flight has no decks at all. Frozen so a caller cannot
 *  push a deck into the constant every world shares. */
const EMPTY_DECKS: readonly Deck[] = Object.freeze([])
const G = 9.80665
/** kg of fuel per joule of work, tuned so a full internal load lasts a
 *  realistic few hours at cruise. Refined when range matters. */
const FUEL_KG_PER_JOULE = 7.5e-8

export const airspeed = (state: AircraftState): number => length(state.velocity)

/**
 * The airplane's velocity through the AIR, world frame: ground velocity minus
 * the velocity of the air. With `wind` null the ground velocity is returned
 * as the same object, so the calm path performs no arithmetic at all and
 * stays bit-identical to the model before Plan 8 (the golden's exact-equality
 * case pins this).
 */
export function airVelocity(state: AircraftState, wind: Vec3 | null): Vec3 {
  return wind == null ? state.velocity : sub(state.velocity, wind)
}

/** The model's only mass expression: empty weight plus whatever fuel remains,
 *  no separate payload term. `step` and `autopilot.ts`'s `holdLevelFlight`
 *  both need exactly this quantity to trim lift against weight, so it is
 *  exported rather than duplicated -- a payload term added here later would
 *  otherwise have to be found and added in two places to keep the autopilot
 *  trimming for the airplane's actual weight. */
export const massKg = (spec: AircraftSpec, state: AircraftState): number =>
  spec.mass.emptyKg + state.fuelKg

/** Body-frame forward and up axes for the current attitude. (Body right is
 *  not needed anywhere in this module -- dropped to avoid paying for two
 *  unused quaternion rotations every step.) */
const bodyAxes = (state: AircraftState) => ({
  forward: qRotate(state.attitude, v3(1, 0, 0)),
  up: qRotate(state.attitude, v3(0, 1, 0)),
})

/**
 * Angle of attack, radians, positive when the airflow comes from below the
 * wing. This is the standard flight-dynamics definition -- the angle, measured
 * in the airplane's plane of symmetry, between the body forward axis and the
 * velocity projected into that plane.
 *
 * It IS already measured in the plane of symmetry, and open item 8 in
 * `docs/superpowers/specs/2026-09-12-renderer-and-flight-controls-design.md`
 * was wrong to say otherwise (retracted there 2026-09-13, with the numbers).
 * Derivation, because that item was believed for a day and is the kind of
 * claim this codebase has shipped wrongly before. Write the velocity in the
 * body basis, which `qRotate` keeps orthogonal for any attitude:
 *
 *     v = u * forward + n * up + s * right
 *     u = dot(v, forward)   n = dot(v, up)   s = dot(v, right)
 *
 * Projecting the lateral component out gives `vSym = v - s * right`, and
 * because `right` is orthogonal to both `forward` and `up`:
 *
 *     dot(vSym, forward) = u        dot(vSym, up) = n
 *
 * -- so `atan2(-n, u)` below is already the in-plane angle, and doing the
 * subtraction first cannot change it. Verified numerically 2026-09-13 over
 * 20,000 random attitude/velocity pairs: the largest disagreement between
 * this function and the explicitly-projected form is 1.2e-14 rad (7e-13
 * degrees), i.e. the rounding cost of the extra subtraction and nothing else.
 * `tests/sim/flight/angleOfAttack.test.ts` asserts the identity rather than
 * leaving it as this paragraph.
 *
 * What open item 8 mistook for an artefact is real: yaw the nose away from a
 * fixed flight path and alpha grows as `tan(alpha) = tan(alpha_0) / cos(beta)`
 * -- 3.5% at 15 degrees of sideslip, 34% at 42. That is what the definition
 * says, not a bug in it. Crabbing cuts the chordwise component of the flow
 * (`u`) while leaving the component normal to the wing (`n`) alone, so the
 * flow does meet the chord at a larger angle. The same test file pins that
 * relation, so a future "fix" that removes it has to fail a test first.
 *
 * `normalize(v)` is not load-bearing: both arguments are scaled by the same
 * positive `1/|v|`, which `atan2` is invariant to. It is kept because it
 * costs one sqrt in a function that is not the hot path (`step` calls it
 * once) and it keeps the arguments in a readable range for anyone debugging.
 *
 * Note also that this form degrades gracefully where the projected form does
 * not: in a purely lateral flow (90 degrees of sideslip) `vSym` is the zero
 * vector, so normalizing it yields NaN, while `atan2(0, 0)` is 0.
 */
export function angleOfAttack(state: AircraftState): number {
  const v = state.velocity
  if (length(v) < 1e-6) return 0
  const { forward, up } = bodyAxes(state)
  const vn = normalize(v)
  // Positive alpha = airflow coming from below the wing.
  return Math.atan2(-dot(vn, up), dot(vn, forward))
}

function powerFractionAt(spec: AircraftSpec, altitudeM: number): number {
  return piecewiseLinear(spec.engine.powerFractionByAltitudeM, altitudeM)
}

/** Clamps to [lo, hi], and maps any non-finite input to 0 rather than letting
 *  it propagate. This is the simulation's only external input boundary --
 *  Important 4: without this, a NaN or out-of-range control channel (a
 *  malformed input event, a bad replay file, ...) poisons the whole state,
 *  and `qNormalize`'s zero-length guard cannot catch a NaN because a NaN
 *  quaternion's hypot is itself NaN, not 0. */
export const clampFinite = (n: number, lo: number, hi: number): number =>
  Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : 0

function thrustMagnitude(spec: AircraftSpec, state: AircraftState, rawThrottle: number): number {
  const throttle = clampFinite(rawThrottle, 0, 1)
  const v = Math.max(airspeed(state), 1)
  const power = spec.engine.maxPowerW * powerFractionAt(spec, state.position.y) * throttle
  // Propeller thrust from power, capped at static thrust so it does not blow up
  // toward zero airspeed.
  return Math.min((spec.engine.propEfficiency * power) / v, spec.engine.staticThrustN * throttle)
}

/**
 * True while a float-carburetted engine is starved of fuel (A6M spec §4.4,
 * Mark's decision 2026-09-25): `engine.negativeGCutout` is set and the wing's
 * lift this step is negative. Eglin, 1942: "Inability of the Zero engine to
 * continue operating under negative acceleration."
 *
 * STRICTLY negative. Zero lift -- a parked airplane, or any q = 0 -- keeps the
 * engine running, or a Zero could never start its take-off roll.
 *
 * Never on the ground (`onGroundNow`, the wheels in contact at the start of
 * the step): there the ground reaction holds the airframe at positive g
 * whatever the wing does, so the carburetor is fed. Keyed on lift alone, a
 * forward tap on the take-off roll put the nose below the zero-lift attitude,
 * cut the engine, and -- with pitch gated to 0 below `tailUpSpeedMps` --
 * stranded the Zero on the runway for good (Z2 final review, 2026-09-25).
 *
 * Stateless on purpose: no new AircraftState field, so no state migration and
 * no golden churn. The real engine sputtered and caught again over about a
 * second; a timer would model that and needs state. Windmilling-propeller
 * drag still follows the throttle, not this flag: the spec cuts thrust only.
 */
export function engineCutOut(spec: AircraftSpec, liftN: number, onGroundNow = false): boolean {
  return spec.engine.negativeGCutout === true && liftN < 0 && !onGroundNow
}

const DEG = Math.PI / 180

/**
 * Fraction of the maximum commanded rate available at dynamic pressure `q`:
 * `min(1, sqrt(q / qRef))`, with `qRef` the sea-level dynamic pressure at
 * `rates.rateRefSpeedMps`. At one air density that is the airspeed as a
 * fraction of the reference speed, capped at 1. Every commanded rate and the
 * weathercock share it, so the controls and the fin go mushy together.
 *
 * **Proportional to speed, not to dynamic pressure -- changed 2026-09-17 at
 * Mark's decision.** The master spec's section 5 said "scales with dynamic
 * pressure", which this implemented literally as `q / qRef`, i.e. speed
 * SQUARED. Measured at the shipped 80 deg/s reference roll rate: 12 deg/s at
 * 40 m/s, 15 at 45, 23 at 55 -- the approach speeds flaps put the airplane
 * at -- which Mark reported as the airplane refusing to bank with the flaps
 * down. Flaps were never the cause (they reach only lift and drag); the
 * square law was. Aileron roll rate in a real airplane scales with speed
 * (constant helix angle pb/2V), so the square root is also the better
 * physics for roll. It was applied to all three axes and the fin, not roll
 * alone, because Mark chose consistency over keeping the rudder tuning
 * untouched: at 50 m/s the rudder and fin rates roughly double and the
 * heading retention he had just tuned drops from 88% -- he accepted about
 * 80%. Under the new law the same roll figures read 31, 35 and 43 deg/s.
 *
 * `qRef` is always > 0: schema.ts validates rateRefSpeedMps as positive.
 * `q` is clamped at 0 before the root so a non-physical negative input
 * cannot produce NaN.
 */
export function rateAuthority(spec: AircraftSpec, q: number): number {
  const qRef = 0.5 * densityAt(0) * spec.rates.rateRefSpeedMps * spec.rates.rateRefSpeedMps
  return Math.min(1, Math.sqrt(Math.max(0, q) / qRef))
}

/** Equivalent airspeed, m/s: the speed that gives dynamic pressure `q` at
 *  sea-level density. What an airspeed indicator reads, less instrument and
 *  position error, which is how the Zero's sources quote their speeds. */
export function equivalentAirspeedMps(q: number): number {
  return Math.sqrt((2 * Math.max(0, q)) / densityAt(0))
}

/**
 * The share of the pilot's commanded rates that heavy controls still allow at
 * dynamic pressure `q`, from `rates.controlFadeByEasMps` (A6M spec §4.4,
 * Mark's decision 2026-09-25). Exactly 1 when the field is absent, so an
 * aircraft that does not set it commands the same bits as before.
 *
 * It exists because `rateAuthority` stays at 1 at any speed above the
 * reference speed, so nothing could make the controls heavy at high speed.
 * The Zero's trial reports say they were ("above 300 M.P.H. all maneuvers
 * become increasingly difficult", ENG-47-1673-A).
 *
 * Applied to the pilot's commands only, never to the weathercock: a heavy
 * stick does not weaken the fin.
 */
export function controlFade(spec: AircraftSpec, q: number): number {
  const fade = spec.rates.controlFadeByEasMps
  return fade === undefined ? 1 : piecewiseLinear(fade, equivalentAirspeedMps(q))
}

/** Shared by `commandedBodyRates` and `step`, which both need it but must not
 *  recompute rho/v/q a second time when `step` already has them in hand
 *  (this is the hottest function in the project). */
function ratesFromDynamicPressure(spec: AircraftSpec, q: number, controls: Controls): Vec3 {
  const authority = rateAuthority(spec, q) * controlFade(spec, q)

  const clamp = (n: number) => clampFinite(n, -1, 1)
  return v3(
    clamp(controls.roll) * spec.rates.maxRollRateDegPerSec * DEG * authority,
    // Negated: a positive rotation rate about body +Y (right-hand rule) turns
    // +X (forward) toward -Z (left) in this right-handed frame, but the
    // documented convention is yaw > 0 = nose right (+Z). See Controls.yaw.
    -clamp(controls.yaw) * spec.rates.maxYawRateDegPerSec * DEG * authority,
    clamp(controls.pitch) * spec.rates.maxPitchRateDegPerSec * DEG * authority,
  )
}

/**
 * Spec §5: control input commands a body rotation rate, not a torque. The
 * achievable fraction of the maximum rate is `rateAuthority` -- proportional
 * to airspeed up to the reference speed (see that function for why it is no
 * longer proportional to dynamic pressure). This is what makes controls mushy
 * near the stall and stiff at speed, without modelling moments of inertia or
 * damping derivatives.
 */
export function commandedBodyRates(
  spec: AircraftSpec,
  state: AircraftState,
  controls: Controls,
): Vec3 {
  const rho = densityAt(state.position.y)
  const v = airspeed(state)
  const q = 0.5 * rho * v * v
  return ratesFromDynamicPressure(spec, q, controls)
}

/** Wing-drop roll rate injected at the stall, rad/s. Deterministic in sign so
 *  the behaviour is reproducible; a randomised drop would need the seeded RNG. */
const STALL_WING_DROP_RAD_PER_S = 0.6

export function isStalled(spec: AircraftSpec, state: AircraftState): boolean {
  return Math.abs(angleOfAttack(state)) > alphaCritRad(spec)
}

/**
 * Finding I8: `step` would previously integrate a NaN, a negative or a 0.25 s
 * frame-time `dt` perfectly happily -- a NaN poisons the whole state, a
 * negative one runs the physics backwards, and neither produces anything a
 * caller would recognise as an error. `dt` is the one `step` argument that is
 * not otherwise validated: `spec` is Zod-checked at load and `controls` go
 * through `clampFinite`.
 *
 * Deliberately narrow: it rejects only what cannot be integrated at all, and
 * says nothing about the 60 Hz constraint. A large-but-finite `dt` is still
 * accepted, because rejecting it needs a decision about who owns the
 * fixed-step contract -- the `SimContext` (`../loop.js`) carries `dt` as of
 * this task, but its accumulator, which is what would actually own that
 * contract, is Task 3's work, not this one's.
 */
function assertUsableDt(dt: number): void {
  if (!Number.isFinite(dt) || dt <= 0) {
    throw new Error(`step() requires a positive, finite dt in seconds, got ${dt}`)
  }
}

export function step(
  spec: AircraftSpec,
  state: AircraftState,
  controls: Controls,
  ctx: SimContext,
): AircraftState {
  assertUsableDt(ctx.dt)
  const dt = ctx.dt
  const mass = massKg(spec, state)
  // Every aerodynamic quantity below reads `air`, the state seen by the
  // airflow; integration, the ground constraint, rolling and tire grip keep
  // reading `state`, which is the ground frame. With no wind `air` IS `state`.
  const air = ctx.wind == null ? state : { ...state, velocity: airVelocity(state, ctx.wind) }
  // Ground under the airplane at the START of this step, or null when there
  // is neither a terrain field nor a deck here (50 of the pre-Plan-8
  // `SimContext` construction sites pass neither). Hoisted ABOVE the
  // aerodynamics because ground effect needs the height here, and computed
  // ONCE for every consumer below -- the comment on `onGroundStart` further
  // down states that principle, and this now serves one more reader rather
  // than adding a second `groundUnder` call for the same position. A deck
  // wins over the water beneath it (`groundUnder`'s own doc comment); a
  // still deck's `velocity` is `ZERO`, so this is bit-identical to the
  // pre-Plan-8 terrain-only lookup wherever no deck is present.
  const decks = ctx.decks ?? EMPTY_DECKS
  const startGround = groundUnder(ctx.terrain ?? null, decks, state.position.x, state.position.z)
  const startGroundHeightM = startGround === null ? null : startGround.heightM
  const rho = densityAt(state.position.y)
  const v = airspeed(air)
  const q = 0.5 * rho * v * v
  const { forward, up } = bodyAxes(state)

  const alpha = angleOfAttack(air)
  // Flaps raise the whole lift curve, so they enter the coefficient rather
  // than being added to the force -- see `liftCoefficient`'s attached-flow
  // comment for why the increment has to go inside it.
  const cl = liftCoefficient(spec, alpha, flapClIncrement(spec, state.flapFraction))
  // Ground effect: less induced drag within a wingspan of the surface. The
  // height fed in is the WING's above the terrain, which is `position.y` minus
  // the ground -- `position` names the body origin and the wing sits
  // essentially at it (src/render/scene/hellcat.ts puts it at -0.25 m of a
  // 1.5 m fuselage). It is NOT the wheels' height: those are `gear.heightM`
  // = 2.2 m lower, and using them would be a 2.2 m error, a factor of 1.4 on
  // induced drag in the flare, which would read as a tuning problem.
  const groundEffect =
    startGroundHeightM !== null
      ? groundEffectFactor(spec, state.position.y - startGroundHeightM)
      : 1
  const cd = dragCoefficient(spec, cl, alpha, groundEffect)

  const liftN = q * spec.geometry.wingAreaM2 * cl
  // Two parasitic terms beyond the wing's own drag, both folded into this one
  // scalar rather than added as separate force vectors: each acts along the
  // relative wind exactly as drag does, so one direction is enough.
  //
  //  - a propeller that is not pulling (`windmillDragCd0`), a Cd0 increment, so
  //    it joins `cd` inside the wing-area product;
  //  - extended gear (`gearDragN`), already a force from its own drag AREA, so
  //    it is added outside that product;
  //  - extended flaps (`flapDragN`, Plan 11b), the same shape as the gear and
  //    added the same way;
  //  - carried stores (`spec.storesLoad?.dragAreaM2`, Plan 6b), a drag AREA
  //    like gear and flaps, baked in by `storesSpec` in
  //    `src/sim/weapons/stores.ts` (see that module's doc comment) -- a spec
  //    with nothing carried has no `storesLoad` at all, so `?? 0` makes this
  //    term exactly zero and this function's own code is unchanged either way.
  //
  // Merged from two branches on 2026-09-16 and worth stating plainly, because a
  // conflict resolution that kept only one side would silently delete a whole
  // drag term and look entirely reasonable while doing it.
  const dragN =
    q * spec.geometry.wingAreaM2 * (cd + windmillDragCd0(spec, controls.throttle)) +
    gearDragN(spec, state.gearFraction, q) +
    flapDragN(spec, state.flapFraction, q) +
    q * (spec.storesLoad?.dragAreaM2 ?? 0)
  // The ground test runs only for an engine that can cut out, so an aircraft
  // without `negativeGCutout` does exactly the work it did before.
  const starved = spec.engine.negativeGCutout === true &&
    engineCutOut(spec, liftN, startGround !== null && onGround(spec, state, startGround.heightM))
  const thrustN = starved ? 0 : thrustMagnitude(spec, air, controls.throttle)

  const vdir = v > 1e-6 ? normalize(air.velocity) : forward
  // Lift acts perpendicular to the relative wind, in the plane of the body up axis.
  const liftDir = v > 1e-6 ? normalize(cross(cross(vdir, up), vdir)) : up

  // Sideslip, and the lateral force it generates. **The model had neither
  // until 2026-09-17**, which is why holding rudder crabbed the airplane
  // without ever changing its heading: the nose reached the weathercock
  // equilibrium below and the flight path never bent round to follow it.
  // `sideForceN`'s doc comment carries the whole finding.
  //
  // `right` is the body +Z axis, the same one the weathercock further down
  // resolves sideslip against -- deliberately the same convention, because two
  // terms disagreeing about which way sideslip is positive would fight each
  // other and look like a tuning problem.
  const right = qRotate(state.attitude, v3(0, 0, 1))
  const sideslipRad = v > 1e-6 ? Math.asin(Math.max(-1, Math.min(1, dot(vdir, right)))) : 0
  // Along -right: positive sideslip means the velocity has a component toward
  // the body's right, so the relative wind strikes the right side and pushes
  // the airplane left -- opposing the sideways motion that created it, which is
  // what makes this term remove energy rather than add it.
  // Faded out past the stall: this is an attached-flow term, and in a departed
  // airplane the separated-flow drag blend already dominates. See
  // `attachedFlowFraction` for the measurement that forced this.
  const sideN = sideForceN(spec, q, sideslipRad) * attachedFlowFraction(spec, alpha)

  let force: Vec3 = ZERO
  force = add(force, scale(forward, thrustN))
  force = add(force, scale(vdir, -dragN))
  force = add(force, scale(liftDir, liftN))
  force = add(force, scale(right, -sideN))
  force = add(force, v3(0, -mass * G, 0))

  // Ground reaction (Task 5b, found while making a supported contact never
  // read as a crash): while the airplane is ALREADY resting on its wheels at
  // the START of this step AND NOT ALREADY separating from it, the ground
  // supplies whatever upward force is needed to stop it falling through --
  // the normal force in any rigid-contact model, which only ever PUSHES and
  // never PULLS (Finding 1, whole-branch review: the `state.velocity.y <= 0`
  // half of the gate just below is what enforces "never pulls" -- a
  // unilateral contact force may act only while the bodies are not
  // separating). A force that is already lifting (e.g. once airspeed has
  // built enough lift to fly) passes through untouched, so this never holds
  // a genuinely take-off-capable airplane down.
  //
  // Without this, a supported airplane still integrates one tick of
  // unopposed gravity before the POST-integration clamp below (gated on
  // `supportedContact` too) catches it, and that clamp only ever pulls a
  // sunk airplane back up to the surface when it arrived from ABOVE it
  // (`restOnSurface` must not do so once it is already at-or-below --
  // that direction is `assertNoEnergyGain`'s hazard). That one-tick sliver
  // of unopposed fall compounds every following tick, because the
  // post-integration clamp never restores it either, and silently walks the
  // airplane through the ground over a couple of seconds: verified, an idle,
  // gear-down, stationary airplane on this same plateau sank 0.25 m and was
  // wrongly recorded as a crash 91 ticks (1.5 s) in, without this term.
  // Gated on `startGround` (above) being non-null -- "no terrain field AND no
  // deck here" -- not on `ctx.terrain` alone, same as the block below: a
  // world with a carrier in it has ground under the airplane whatever its
  // terrain field is doing (Plan 8).
  // Whether the airplane was on the ground at the START of this step -- read
  // by the rolling-resistance force below and, later, by the ground control
  // regime that replaces `bodyRates`. Computed once here and reused rather
  // than re-querying `groundUnder` a second time for the same position.
  let onGroundStart = false
  // Whether the surface under the airplane at the START of this step is LAND
  // OR A DECK (Task 16, extended by Plan 8): both carry weight the same way,
  // and water does neither. Rolling resistance and the ground control regime
  // are wheel-on-surface phenomena exactly as much as the gravity-cancelling
  // reaction force just below is -- wheels cannot roll on water any more
  // than they can hold an airplane up on it -- so this is read by the same
  // two consumers `onGroundStart`'s own comment names. `supportedContact`
  // already requires land or deck for the gravity-cancelling force
  // (`src/sim/ground.ts`), so only these other two needed a separate flag,
  // computed once here for the same reason `onGroundStart` is.
  let onLandStart = false
  // Fix round 1, Important 2: design §3 says the gear-down requirement
  // "belongs to the consumers that need it -- rolling friction and the
  // ground rate regime below", not to `onGround` itself (which is
  // deliberately gear-agnostic -- a belly landing is still on the ground,
  // see that function's own doc comment). Without this, a retracted
  // tailwheel still steers at full rate and rolling friction still charges
  // tire-on-runway drag to a belly. Reuses `GEAR_DOWN_FRACTION`, the same
  // threshold `supportedContact` already uses, rather than inventing a
  // second one.
  const wheelsDownStart = state.gearFraction >= GEAR_DOWN_FRACTION
  if (startGround !== null) {
    onGroundStart = onGround(spec, state, startGround.heightM)
    onLandStart = startGround.surface === 'land' || startGround.surface === 'deck'
    // `state.velocity.y <= 0`: a unilateral contact force may act only while
    // the bodies are not separating (Finding 1, whole-branch review).
    // `supportedContact` bounds SINK but places no bound on CLIMB, so without
    // this an airplane already moving away from the surface still had its
    // gravity cancelled here, which does positive work on it -- measured, 434
    // `assertNoEnergyGain` violations over a 400-run idle-throttle roll-out,
    // worst +1.272 J/kg. Gated separately from `supportedContact` itself
    // rather than folded into it, because the post-integration clamp below
    // needs the un-narrowed predicate: an airplane that starts a step
    // sinking and ends it climbing (this same force removing the sink) must
    // still be recognized as supported once integrated.
    if (
      force.y < 0 &&
      state.velocity.y <= 0 &&
      supportedContact(spec, state, startGround.heightM, startGround.surface, startGround.velocity)
    ) {
      force = v3(force.x, 0, force.z)
    }

    // Rolling resistance: the runway (or deck) drags on the wheels, brakes
    // off or on (Task 6). Opposes the GROUND TRACK -- the horizontal
    // component of velocity RELATIVE TO THE SURFACE (Plan 8: a deck's own
    // velocity does not drag on wheels moving with it), not `vdir`, which
    // includes whatever vertical component the airplane has -- using the
    // state at the START of this step, matching the ground-reaction block
    // just above. Guarded exactly as `step` already guards `vdir`: a
    // stationary airplane (or one with only vertical motion, relative to the
    // surface) gets zero resistance rather than a NaN direction. Gated on
    // `wheelsDownStart` too (fix round 1, Important 2): a retracted gear
    // must not charge tire-on-runway drag to a belly. Gated on `onLandStart`
    // too (Task 16): a wheel over open water gets no traction to roll
    // against either.
    if (onGroundStart && wheelsDownStart && onLandStart) {
      const relStart = sub(state.velocity, startGround.velocity)
      const track = v3(relStart.x, 0, relStart.z)
      const trackSpeed = length(track)
      if (trackSpeed > 1e-6) {
        const trackDir = normalize(track)
        const resistanceN = rollingResistanceN(spec, mass, controls.brake)
        // Clamped to at most the force that would exactly null the ground
        // track this step -- fix round 1, Minor 4: unclamped, a resistance
        // force below this bound overshoots past zero and reverses the
        // track direction, and since a reversed track immediately draws an
        // equal and opposite resistance force next tick, it never settles --
        // measured, braking from 5 m/s and holding, `vx` buzzed between
        // -0.0353 and +0.0300 m/s forever instead of coming to rest. A real
        // wheel stops decelerating once the ground track reaches zero; it
        // does not run the airplane backward.
        const maxResistanceN = (trackSpeed * mass) / dt
        const clampedResistanceN = Math.min(resistanceN, maxResistanceN)
        force = add(force, scale(trackDir, -clampedResistanceN))
      }
    }
  }

  const accel = scale(force, 1 / mass)
  let velocity = add(state.velocity, scale(accel, dt))
  let position = add(state.position, scale(velocity, dt))

  // The ground constraint: a surface projection, not a one-sided clamp --
  // see `restOnSurface`'s doc comment (amended 2026-09-16, design doc §2)
  // for why it now follows rising ground within tolerance, paying for the
  // climb out of kinetic energy rather than refusing to lift at all
  // (`assertNoEnergyGain` is what bounds which direction is safe).
  // With neither terrain nor a deck, `groundUnder` returns null and skips
  // the constraint. EMPTY_DECKS avoids allocating an array for the lookup.
  //
  // Gated on `supportedContact`, not the bare `onGround`: a gear-up airplane
  // or one arriving too hard must pass straight through untouched and be
  // caught by `advance` as the crash it is, rather than have its sink rate
  // quietly zeroed here first (Task 5b -- `supportedContact`'s own doc
  // explains why the two checks have to agree on this). Task 2 (Plan 8):
  // `ground.surface`/`ground.velocity` carry a deck's own velocity through,
  // so a supported contact and the rest/grip below are judged and applied
  // RELATIVE TO THE DECK -- a chocked airplane matching the ship's velocity
  // reads as at rest, not as rolling at the ship's speed.
  const ground = groundUnder(ctx.terrain ?? null, decks, position.x, position.z)
  if (ground !== null) {
    const integrated: AircraftState = { ...state, position, velocity }
    if (supportedContact(spec, integrated, ground.heightM, ground.surface, ground.velocity)) {
      const rested = restOnSurface(spec, integrated, ground.heightM, ground.velocity)
      position = rested.position
      // Tire grip, applied ONLY while the wheels are carrying the airplane.
      // An airplane in the air has no tires on anything, and one arriving too
      // hard has not landed yet -- `supportedContact`'s own gates are what
      // decide both, which is why this sits inside this branch rather than
      // beside the rolling friction above.
      velocity = lateralGripAfter(spec, { ...rested, velocity: rested.velocity }, dt, ground.velocity)
    }
  }

  // The arcade trap (Plan 8). Engages on the first step the wheels are
  // supported on a deck inside its trap zone with the hook down; holds while
  // the wheels stay on that deck; drops the instant they are not. While
  // engaged the deck-relative horizontal velocity decays at a constant rate,
  // whatever the throttle is doing -- a pendant does not care.
  let arrested = false
  if (ground !== null && ground.deck !== null) {
    const integrated: AircraftState = { ...state, position, velocity }
    const onDeckWheels = supportedContact(spec, integrated, ground.heightM, ground.surface, ground.velocity)
    const engages = controls.hookDown === true && onDeckWheels && insideTrapZone(ground.deck, position.x, position.z)
    arrested = onDeckWheels && (state.arrested || engages)
    if (arrested) {
      const rel = sub(velocity, ground.velocity)
      const relFlat = v3(rel.x, 0, rel.z)
      const relSpeed = length(relFlat)
      const drop = Math.min(relSpeed, TRAP_DECEL_MPS2 * dt)
      const kept = relSpeed > 1e-9 ? scale(relFlat, (relSpeed - drop) / relSpeed) : ZERO
      velocity = v3(ground.velocity.x + kept.x, velocity.y, ground.velocity.z + kept.z)
    }
  }

  const workJ = thrustN * Math.max(v, 1) * dt
  const fuelKg = Math.max(0, state.fuelKg - workJ * FUEL_KG_PER_JOULE)

  const airRates = ratesFromDynamicPressure(spec, q, controls)

  // Weathercock: the fin swings the nose into the relative wind.
  //
  // Added 2026-09-13 after Mark flew it twice and reported the same thing both
  // times -- roll into a turn, level out, and the airplane keeps travelling
  // diagonally instead of straightening. Correct: master spec section 5's
  // rate-command model states it carries no damping derivatives, and
  // directional stability is one, so nothing here produced a yaw moment from
  // sideslip at all. Measured before this, hands off at 120 m/s from 10
  // degrees of sideslip, the nose heading did not move by a hundredth of a
  // degree in a full minute.
  //
  // Deliberately a RATE, not a moment, because that is the model this project
  // chose: the fin is treated as commanding a yaw rate proportional to the
  // sideslip it sees, scaled by the same dynamic-pressure authority as every
  // other rate here, so it goes mushy near the stall exactly as the controls
  // do. Sideslip then decays as exp(-t / weathercockSeconds) at full
  // authority.
  //
  // Saturated at the fin's own commanded maximum: a large sideslip cannot
  // produce a yaw rate the pilot could not command with full rudder, which
  // keeps a violent entry from snapping the nose round faster than the
  // airplane can physically yaw.
  const weathercockY = (() => {
    if (v < 1e-6) return 0
    const right = qRotate(state.attitude, v3(0, 0, 1))
    const sideslipRad = Math.asin(Math.max(-1, Math.min(1, dot(vdir, right))))
    const authority = rateAuthority(spec, q)
    const maxRad = spec.rates.maxYawRateDegPerSec * DEG
    const rate = (sideslipRad / spec.rates.weathercockSeconds) * authority
    // Negated for the same reason `ratesFromDynamicPressure` negates yaw: a
    // positive rotation about body +Y turns the nose toward -Z, i.e. LEFT,
    // while positive sideslip means the airflow is coming from the right and
    // the nose must go right to meet it.
    return -Math.max(-maxRad, Math.min(maxRad, rate))
  })()
  const stalled = isStalled(spec, air)
  const withWeathercock = v3(airRates.x, airRates.y + weathercockY, airRates.z)
  const ratesWithStall = stalled
    ? v3(withWeathercock.x + STALL_WING_DROP_RAD_PER_S, withWeathercock.y, withWeathercock.z)
    : withWeathercock

  // On the ground, the wheels are the rotation constraint, not the air --
  // spec §5's rate command is right in the air and wrong on a runway, where
  // an airplane cannot roll about its own axis and pitches about its main
  // gear only once the tail can be lifted (Task 7; see `groundBodyRates`'s
  // own doc comment). Applied LAST, after the weathercock and stall
  // wing-drop terms, and not merely blended in, because of a case that
  // actually occurs, not a hypothetical one: a hard rotation. Measured, full
  // back stick from a standing start gives 38 consecutive ticks (0.63 s) of
  // `isStalled` true while still on the ground, starting at 42.3 m/s -- the
  // stall wing-drop term unconditionally adds `STALL_WING_DROP_RAD_PER_S` to
  // `x` whenever that is true, and left unordered (blended with, rather than
  // overridden by, the ground regime) that alone rolled the airplane to
  // 23.47 degrees of bank before it ever left the runway. "Roll must go to
  // exactly zero" means exactly that, not "reduced by whatever came before
  // it" -- so the ground override has to be the last word on every axis it
  // governs, not one contributor among several. (A parked, nose-up
  // three-point attitude is NOT the case this guards: measured, that alpha
  // is under the stall angle for a realistic sit, and `groundBodyRates`
  // already refuses any pitch command below `tailUpSpeedMps` regardless of
  // ordering, so it could not command the nose up into a stall from rest
  // even if it were.) Gated on the state at the START of this step, matching
  // `onGroundStart` and `wheelsDownStart` above: the rates command THIS
  // step's rotation, so using the integrated (end-of-step) state here would
  // apply a ground rate one half-step late -- a twitch at the moment of
  // rotation, on the step the airplane actually leaves the ground. Gated on
  // `onLandStart` too (Task 16): the tailwheel and the wheels' rigid roll
  // constraint are both surface contact, and neither exists over water --
  // without this, an airplane that drove off the end of a runway kept its
  // wheels locked to zero roll and its tailwheel steering all the way across
  // the ocean.
  const bodyRates =
    startGround !== null && onGroundStart && wheelsDownStart && onLandStart
      ? groundBodyRates(spec, state, controls, ratesWithStall, startGround.velocity)
      : ratesWithStall
  const attitude = qIntegrateBodyRates(state.attitude, bodyRates, dt)

  // `gearFraction` is state, and `step` is what produces the next state, so
  // advancing it is `step`'s job, not a later task's -- `gearAfter`
  // (src/sim/ground.ts) is this plan's command for that, driven by
  // `controls.gearDown`.
  const gearFraction = gearAfter(spec, state.gearFraction, controls.gearDown, dt)
  // Flap travel, for the same reason and driven by `controls.flapDown`.
  const flapFraction = flapAfter(spec, state.flapFraction, controls.flapDown, dt)

  return { position, velocity, attitude, bodyRates, fuelKg, tick: ctx.tick, gearFraction, flapFraction, arrested }
}
