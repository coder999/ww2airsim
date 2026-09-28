import type { AircraftEntity } from '../loop.js'
import type { AircraftState, Controls } from '../flight/state.js'
import type { AircraftSpec } from '../flight/schema.js'
import { airVelocity } from '../flight/model.js'
import { LANDED_SPEED_MPS } from '../landing.js'
import { qRotate } from '../math/quat.js'
import { dot, length, scale, sub, v3, ZERO, type Vec3 } from '../math/vec3.js'
import { paddlesCue } from '../paddles.js'
import type { AircraftCombat } from '../weapons/combat.js'
import { deckOf, type Deck } from '../world/deck.js'
import { groundUnder } from '../world/ground.js'
import { effectiveStallSpeedMps } from '../ground.js'
import type { PaddlesParams } from '../world/ships.js'
import { heightAt, SEA_LEVEL_M } from '../world/terrain.js'
import { airborne } from './airborne.js'
import {
  approachControls, carrierAimPoint, carrierApproachProfile, DEFAULT_GLIDE_PATH_RAD, VREF_STALL_MULTIPLE, type ApproachTarget,
} from './approach.js'
import { controlsForDesiredVelocity } from './controller.js'
import { ALTITUDE_GAIN_PER_S, goalDesiredVelocity, goalThrottle, liftTowardControls, MAX_VERTICAL_MPS, orbitControls, type Goal } from './ingress.js'
import { LIFT_VECTOR_HANDOFF_RAD } from './liftVector.js'
import type { PilotDecisionState, RecoveryHome, RecoveryPhase, RecoveryState } from './pilot.js'
import type { PilotTickContext } from './pilotTick.js'
import type { PilotAssignment } from './pursuit.js'
import { isContact, type TargetingView } from './targeting.js'

/**
 * 7g, the recovery (7c-7g design §6 as amended by the 7g spec): the
 * return-to-base decision and the phase machine that flies it. This file owns
 * `PilotDecisionState.recovery`; `pilotTick` owns the mode.
 *
 * Task 5 flies `transit` to the initial point and `hold` there; Task 6 the
 * approach from `join` to `landed`. Task 7 adds the respot, Task 8 the
 * landing interval.
 */

/** 7c-7g §6 triggers (7g spec §1). */
export const RTB_FUEL_FRACTION = 0.25
export const RTB_STRUCTURE = 0.5
/** Seconds without a hostile contact before a homed pilot goes home. */
export const RTB_IDLE_S = 30
/** The initial point: this far out along the extended centerline... */
export const IP_DISTANCE_M = 8000
/** ...this high above touchdown elevation. */
export const IP_HEIGHT_M = 600
/** Horizontally this close, `transit` has reached the initial point. */
export const IP_ARRIVAL_M = 1000
/** The hold's orbit radius around the initial point, turning left. */
export const HOLD_RADIUS_M = 1500
/** A hostile contact this close in the rear cone pre-empts the recovery (§6). */
export const THREAT_ASTERN_RANGE_M = 1500
export const THREAT_ASTERN_HALF_ANGLE_RAD = Math.PI / 3
/**
 * Transit and hold speed as a fraction of `limits.diveSpeedMps`. The AI's
 * airframe envelope (`envelope.ts`) carries no cruise figure (checked
 * 2026-09-28), and every aircraft spec has a dive limit, so cruise is taken
 * as a fixed fraction of it: 130 m/s on a 216 m/s dive limit.
 */
export const CRUISE_DIVE_FRACTION = 0.6

/**
 * The hold's speed, as the same fraction. Not cruise: at cruise the orbit
 * cannot hold its speed in the turn, the throttle law pins full power, and
 * the excess climbs it. Measured 2026-09-28 (a veteran held at cv-1's IP,
 * target 617 m): at 0.6 it drifted 734 -> 813 m over 210 s, still climbing;
 * at 0.55 it was 664 m after 210 s, still descending; at 0.5 it settled at
 * 645 m within 90 s and stayed there.
 */
export const HOLD_DIVE_FRACTION = 0.5

export const cruiseSpeedMps = (spec: AircraftSpec): number => CRUISE_DIVE_FRACTION * spec.limits.diveSpeedMps

/** What the recovery reads from the pilot's tick context. */
export type RecoveryContext = Pick<PilotTickContext, 'nowS' | 'terrain' | 'ships' | 'combat' | 'decks' | 'wind'>

/** 7c-7g §6 triggers, 7g spec §1. The fuel one is practically dormant:
 *  FUEL_KG_PER_JOULE (flight/model.ts) makes a full load last hours. */
export function shouldReturn<M>(a: AircraftEntity<M>, record: AircraftCombat, decision: PilotDecisionState, nowS: number): boolean {
  if (a.state.fuelKg / a.spec.mass.fuelCapacityKg <= RTB_FUEL_FRACTION) return true
  if (record.guns.length > 0 && record.guns.every((g) => g.ammo <= 0)) return true
  if (record.damage.structure < RTB_STRUCTURE) return true
  // pilotTick seeds lastContactS at a homed pilot's first rescore (ruling
  // P10); the `?? nowS` only keeps a hand-built decision from going home.
  return nowS - (decision.lastContactS ?? nowS) >= RTB_IDLE_S
}

/** A hostile contact inside THREAT_ASTERN_RANGE_M in my rear cone. */
export function threatAstern<M>(a: AircraftEntity<M>, view: TargetingView<M>): boolean {
  const back = scale(qRotate(a.state.attitude, v3(1, 0, 0)), -1)
  return view.snapshot.some((c) => {
    if (!isContact(a, c, view)) return false
    const to = sub(c.state.position, a.state.position)
    const r = length(to)
    return r > 0 && r <= THREAT_ASTERN_RANGE_M && dot(back, scale(to, 1 / r)) >= Math.cos(THREAT_ASTERN_HALF_ANGLE_RAD)
  })
}

/** Where a recovery aims this tick. Headings are compass (0 = north, -z). */
export type RecoveryGeometry = {
  readonly aimX: number
  readonly aimZ: number
  readonly headingRad: number
  /** Terrain height at the aim (a runway) or the flight deck's height. */
  readonly touchdownM: number
  readonly deck: Deck | null
  readonly paddles: PaddlesParams | null
}

/**
 * The approach geometry for `home`, recomputed every tick (Review Focus 2:
 * a carrier's is read from its live deck). The carrier aim is
 * `carrierApproachProfile`'s. `null` when it cannot be known: a runway while
 * `ctx.terrain` is null (the pilot holds at the IP until terrain arrives,
 * 7c-7g §6), or a home ship that is gone, sunk or deckless (the caller drops
 * `home`, Review Focus 5).
 */
export function recoveryGeometry(home: RecoveryHome, ctx: Pick<RecoveryContext, 'terrain' | 'ships' | 'combat'>): RecoveryGeometry | null {
  if (home.kind === 'runway') {
    if (ctx.terrain === null) return null
    return {
      aimX: home.aimX, aimZ: home.aimZ, headingRad: home.headingRad,
      touchdownM: heightAt(ctx.terrain, home.aimX, home.aimZ), deck: null, paddles: null,
    }
  }
  const ship = ctx.ships.find((s) => s.id === home.id)
  if (ship === undefined) return null
  if ((ctx.combat.ships[home.id]?.destroyedTick ?? null) !== null) return null
  const deck = deckOf(ship)
  if (deck === null) return null
  const aim = carrierAimPoint(deck)
  return { aimX: aim.x, aimZ: aim.z, headingRad: deck.headingRad, touchdownM: deck.center.y, deck, paddles: ship.spec.paddles ?? null }
}

/** A runway's geometry while terrain is absent: sea level at the aim. */
function seaLevelGeometry(home: Extract<RecoveryHome, { kind: 'runway' }>): RecoveryGeometry {
  return { aimX: home.aimX, aimZ: home.aimZ, headingRad: home.headingRad, touchdownM: SEA_LEVEL_M, deck: null, paddles: null }
}

/** A point `distanceM` short of the aim on the extended centerline. */
function onCenterline(geo: RecoveryGeometry, distanceM: number): { x: number; z: number } {
  // The bow (landing direction), compass convention: (sin h, -cos h).
  return { x: geo.aimX - Math.sin(geo.headingRad) * distanceM, z: geo.aimZ + Math.cos(geo.headingRad) * distanceM }
}

/** The initial point: IP_DISTANCE_M short of the aim on the extended centerline. */
export const initialPoint = (geo: RecoveryGeometry): { x: number; z: number } => onCenterline(geo, IP_DISTANCE_M)

type Mutable<T> = { -readonly [K in keyof T]: T[K] }

/** `decision` with no `recovery` key at all (not `undefined`), so it compares
 *  equal to a decision that never recovered. */
export function withoutRecovery(decision: PilotDecisionState): PilotDecisionState {
  const out: Mutable<PilotDecisionState> = { ...decision }
  delete out.recovery
  return out
}

/** `pilot` with no `home` key: Review Focus 5's drop. */
export function withoutHome(pilot: PilotAssignment): PilotAssignment {
  const out: Mutable<PilotAssignment> = { ...pilot }
  delete out.home
  return out
}

/** A fresh recovery, entered at `transit`. */
export const startRecovery = (nowS: number): RecoveryState =>
  ({ phase: 'transit', sinceS: nowS, cut: false, joinedAtS: null, restAtS: null, respotted: false })

/** 7c-7g §6: the final approach fix, this far short of the aim on the
 *  centerline, on the glide path (244.6 m up at 3.5°). */
export const FIX_DISTANCE_M = 4000
/** `join` becomes `configure` this far short of the aim. */
export const CONFIGURE_FROM_M = 6000
/** `join` flies at, and `configure` slows from, the approach speed plus this. */
export const CONFIGURE_SPEED_MARGIN_MPS = 15
/** 7c-7g §6's capture window at the fix: all four inside or it goes around. */
export const CAPTURE_LATERAL_M = 60
export const CAPTURE_HEADING_RAD = (10 * Math.PI) / 180
export const CAPTURE_HEIGHT_M = 40
export const CAPTURE_SPEED_MPS = 8
/** A go-around climbs to this far above touchdown, then goes back to `transit`. */
export const GO_AROUND_HEIGHT_M = 300
/** ...at this climb rate, straight ahead. */
export const GO_AROUND_CLIMB_MPS = 8
/**
 * ...and ends only once at least this airspeed, as a multiple of the CLEAN
 * stall (Vref's multiple). A go-around begun above GO_AROUND_HEIGHT_M would
 * otherwise hand a 45 m/s airplane to `transit`, whose §3.2 floor recovery
 * pulls to the load budget whatever the speed. Measured 2026-09-28, the
 * bad-join case (the capture window missed 150 m high at 44.8 m/s): without
 * it, `transit` at once, a stall and a spin to 3,098 m below the deck; with
 * it, 3.4 s more of go-around, `transit` at 57.1 m/s, and it lands.
 */
export const GO_AROUND_EXIT_STALL_MULTIPLE = VREF_STALL_MULTIPLE
const goAroundExitMps = (spec: AircraftSpec): number => GO_AROUND_EXIT_STALL_MULTIPLE * effectiveStallSpeedMps(spec, 0)
/**
 * `join` steers for the point this far further along the centerline than
 * the aircraft's projection onto it: a pure pursuit onto the line. The plan
 * said 1,500 m. Measured 2026-09-28, lateral error at the fix after a join
 * begun heading AWAY from the deck (arriving at the IP from a go-around),
 * window ±60 m: 1,500 m -> 50 m (bad join), and 62-73 m on every pass once
 * cv-1 had turned 30° across the wind, so it never landed; 1,000 -> 10 and
 * 27 m; 750 -> -1 and -14 m; 500 -> 0 and -10 m, but the airspeed error
 * there rose to +7.7 m/s of the ±8 (750: +5.7). The clean join is 0 m at all
 * four. 750 is kept.
 */
export const JOIN_LOOKAHEAD_M = 750
/**
 * `final`'s lead on the cross-track correction (`ApproachTarget.acrossDampingS`).
 * `approachControls`' own yaw law is proportional only, and nothing had ever
 * flown it from off the centerline. Measured 2026-09-28, the bad join
 * re-flown after its go-around (20 m off the centerline at the fix): with no
 * lead the oscillation grew to 1,528 m off the centerline and it flew past
 * the deck; with 3, 5 and 8 s it stayed within 13 m and landed.
 */
export const FINAL_ACROSS_DAMPING_S = 5
/** `join` and `configure`'s speed law: throttle = base + gain x (wanted −
 *  airspeed), from idle to full. Tuning values; the base is
 *  `approachControls`' own. Measured 2026-09-28, the clean join from cv-1's
 *  IP, speed error at the fix (window ±8 m/s): base 0.5 +7.2, 0.4 +5.2,
 *  0.3 +3.2, 0.2 +1.1 m/s; height error -12.6 to -18.6 m across the four. */
export const JOIN_THROTTLE_BASE = 0.3
export const JOIN_THROTTLE_GAIN = 0.05

/** 7g spec §6: every recovery phase after `transit` and `hold` is exempt
 *  from the §3.2 floor recovery (the fix is at 244.6 m, the go-around at
 *  300 m, both under its 400 m trigger). The overspeed guard still applies. */
export const exemptFromFloor = (recovery?: RecoveryState): boolean =>
  recovery !== undefined && recovery.phase !== 'transit' && recovery.phase !== 'hold'

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v)
const lerp = (a: number, b: number, t: number): number => a + (b - a) * clamp(t, 0, 1)

/** The approach this home is flown with (7g spec §5): the LSO's numbers on a
 *  deck with paddles, the runway profile otherwise. `vA` is its approach
 *  speed, an airspeed. */
function approachProfile(spec: AircraftSpec, geo: RecoveryGeometry, wind: Vec3 | null): { target: ApproachTarget; vA: number; glideRad: number } {
  const air = { acrossDampingS: FINAL_ACROSS_DAMPING_S, ...(wind === null ? {} : { windVelocity: wind }) }
  if (geo.deck !== null && geo.paddles !== null) {
    const p = carrierApproachProfile(spec, geo.deck, geo.paddles)
    return { target: { ...p, ...air }, vA: p.approachSpeedMps, glideRad: p.glidePathRad }
  }
  const target: ApproachTarget = {
    aimX: geo.aimX, aimZ: geo.aimZ, runwayHeadingRad: geo.headingRad, touchdownElevationM: geo.touchdownM, ...air,
    // A deck with no LSO: still its motion and the hook.
    ...(geo.deck === null ? {} : { surfaceVelocity: geo.deck.velocity, hookDown: true }),
  }
  return { target, vA: VREF_STALL_MULTIPLE * spec.reference.stallSpeedFlapMps, glideRad: DEFAULT_GLIDE_PATH_RAD }
}

/** Where the aircraft is in the approach frame, as `approachControls`
 *  computes it: `alongM` short of the aim, `acrossM` starboard of the
 *  centerline, `wheelM` the wheels' height above touchdown. */
export function approachFrame(state: AircraftState, spec: AircraftSpec, geo: RecoveryGeometry): { alongM: number; acrossM: number; wheelM: number } {
  const h = geo.headingRad
  const dx = state.position.x - geo.aimX, dz = state.position.z - geo.aimZ
  return {
    alongM: -(dx * Math.sin(h) + dz * -Math.cos(h)),
    acrossM: dx * Math.cos(h) + dz * Math.sin(h),
    wheelM: state.position.y - spec.gear.heightM - geo.touchdownM,
  }
}

/** The capture window's four errors (7c-7g §6), signed. Heading is the nose's. */
export function captureErrors(
  state: AircraftState, spec: AircraftSpec, geo: RecoveryGeometry, vA: number, glideRad: number, wind: Vec3 | null,
): { lateralM: number; headingRad: number; heightM: number; speedMps: number } {
  const f = approachFrame(state, spec, geo)
  const nose = qRotate(state.attitude, v3(1, 0, 0))
  const d = Math.atan2(nose.x, -nose.z) - geo.headingRad
  return {
    lateralM: f.acrossM,
    headingRad: Math.atan2(Math.sin(d), Math.cos(d)),
    heightM: f.wheelM - FIX_DISTANCE_M * Math.tan(glideRad),
    speedMps: length(airVelocity(state, wind)) - vA,
  }
}

const insideCaptureWindow = (e: ReturnType<typeof captureErrors>): boolean =>
  Math.abs(e.lateralM) < CAPTURE_LATERAL_M && Math.abs(e.headingRad) < CAPTURE_HEADING_RAD &&
  Math.abs(e.heightM) < CAPTURE_HEIGHT_M && Math.abs(e.speedMps) < CAPTURE_SPEED_MPS

/**
 * `join` and `configure`'s steering: toward the point JOIN_LOOKAHEAD_M
 * further along the centerline than the aircraft's projection onto it, the
 * wheels on a straight ramp from IP_HEIGHT_M at the IP to the glide path's
 * height at the fix (from wherever they are: transit arrives high), at
 * `speedMps`.
 */
function joinControls<M>(
  a: AircraftEntity<M>, geo: RecoveryGeometry, glideRad: number, speedMps: number, surface: Vec3, wind: Vec3 | null,
): Controls {
  const s = a.state
  const f = approachFrame(s, a.spec, geo)
  const look = onCenterline(geo, f.alongM - JOIN_LOOKAHEAD_M)
  const fixM = FIX_DISTANCE_M * Math.tan(glideRad)
  const slope = (IP_HEIGHT_M - fixM) / (IP_DISTANCE_M - FIX_DISTANCE_M)
  const onRamp = f.alongM > FIX_DISTANCE_M && f.alongM < IP_DISTANCE_M
  const wantedM = lerp(fixM, IP_HEIGHT_M, (f.alongM - FIX_DISTANCE_M) / (IP_DISTANCE_M - FIX_DISTANCE_M))
  // The ramp's own sink at this closure, plus the ingress altitude law on the error.
  const closureMps = (s.velocity.x - surface.x) * Math.sin(geo.headingRad) - (s.velocity.z - surface.z) * Math.cos(geo.headingRad)
  const vy = clamp((onRamp ? -slope * Math.max(0, closureMps) : 0) + ALTITUDE_GAIN_PER_S * (wantedM - f.wheelM), -MAX_VERTICAL_MPS, MAX_VERTICAL_MPS)
  const horizontal = Math.sqrt(Math.max(0, speedMps * speedMps - vy * vy))
  const dx = look.x - s.position.x, dz = look.z - s.position.z
  const len = Math.hypot(dx, dz)
  // The TRACK over the surface points at the look point; the nose crabs into
  // the wind to hold it. With `c` the surface's velocity through the air and
  // `u` the track, the air velocity is `c + k u` at `horizontal` airspeed:
  // k = -c.u + sqrt((c.u)^2 - |c|^2 + horizontal^2). Without the crab, the
  // velocity controller points the NOSE at the look point and a crosswind
  // drifts it off the line: measured 2026-09-28, cv-1 turned 30° off a
  // 7.7 m/s north wind, every join reached the fix 75-76 m off the
  // centerline and went around.
  const ux = len < 1e-9 ? 0 : dx / len, uz = len < 1e-9 ? 0 : dz / len
  const cx = surface.x - (wind?.x ?? 0), cz = surface.z - (wind?.z ?? 0)
  const cu = cx * ux + cz * uz
  const k = -cu + Math.sqrt(Math.max(0, cu * cu - (cx * cx + cz * cz) + horizontal * horizontal))
  const overSurface = len < 1e-9 ? null : v3(surface.x + k * ux, vy, surface.z + k * uz)
  // The velocity controller steers the nose (air frame), the lift-vector law the track (world frame).
  const desired = overSurface === null ? v3(s.velocity.x, vy, s.velocity.z) : v3(overSurface.x - (wind?.x ?? 0), vy, overSurface.z - (wind?.z ?? 0))
  const airspeed = length(airVelocity(s, wind))
  const throttle = clamp(JOIN_THROTTLE_BASE + JOIN_THROTTLE_GAIN * (speedMps - airspeed), 0, 1)
  // Far off the nose (a join begun heading away from the deck), the velocity
  // controller dives through the turn: measured 2026-09-28, a join entered
  // 180° from the centerline at 588 m sank at 96.8 m/s and lost 450 m in 4 s.
  // There the orbit's lift-vector law turns level instead.
  const nose = qRotate(s.attitude, v3(1, 0, 0))
  const offNose = Math.acos(clamp((desired.x * nose.x + desired.y * nose.y + desired.z * nose.z) / Math.max(length(desired), 1e-9), -1, 1))
  if (offNose >= LIFT_VECTOR_HANDOFF_RAD) return liftTowardControls(a, overSurface ?? desired, throttle)
  return { ...controlsForDesiredVelocity(s, a.spec, desired), throttle }
}

/** The go-around: full power, clean, wings level, straight ahead climbing at
 *  GO_AROUND_CLIMB_MPS. */
function goAroundControls<M>(a: AircraftEntity<M>): Controls {
  const v = a.state.velocity
  const speedH = Math.hypot(v.x, v.z)
  const nose = qRotate(a.state.attitude, v3(1, 0, 0))
  const dir = speedH > 1 ? { x: v.x / speedH, z: v.z / speedH } : { x: nose.x, z: nose.z }
  const h = Math.max(speedH, 1)
  return {
    ...controlsForDesiredVelocity(a.state, a.spec, v3(dir.x * h, GO_AROUND_CLIMB_MPS, dir.z * h)),
    throttle: 1, gearDown: false, flapDown: false, hookDown: false,
  }
}

const enter = (r: RecoveryState, phase: RecoveryPhase, nowS: number): RecoveryState => ({ ...r, phase, sinceS: nowS })

/**
 * One tick of the recovery phase machine: the controls before noise (the
 * caller runs them through `finishControls`) and the next recovery state.
 * `state` is set only on the respot tick (Task 7). The transitions run first,
 * in phase order, so one tick can pass through several (`hold` straight to
 * `join` while the approach is free).
 *
 * - `transit`: straight at the initial point, IP_HEIGHT_M above touchdown,
 *   at cruise, by the ingress route's velocity and throttle laws. The §3.2
 *   safety floor stays on (7g spec §6), so a ridge on the line is a climb.
 * - `hold`: the ingress orbit, left-hand, HOLD_RADIUS_M round the IP, at
 *   HOLD_DIVE_FRACTION of the dive limit. Left for `join` at once (the
 *   landing interval, Task 8, will make it wait).
 * - `join`: onto the centerline and down the ramp to the fix, slowing from
 *   cruise to vA + CONFIGURE_SPEED_MARGIN_MPS; `configure` from
 *   CONFIGURE_FROM_M.
 * - `configure`: the same, gear, flaps and (deck) hook down, slowing to vA at
 *   the fix. At the fix, the capture window: `final`, or `go-around`.
 * - `final`: `approachControls` on the live profile. On a deck the LSO is
 *   obeyed: `cut` commits the pass, a `wave-off` before it is a go-around.
 *   Wheels on the surface: `rollout`.
 * - `rollout`: `approachControls` still (it brakes and steers); at rest
 *   relative to the surface, `landed` (pilotTick makes the mode `landed`).
 * - `go-around`: climb straight ahead to GO_AROUND_HEIGHT_M, then `transit`.
 * - `landed`: held on the brakes (Task 7 adds the respot).
 *
 * Every frame is the live one (Review Focus 2): aim, heading and fix are
 * recomputed from the deck each tick.
 */
export function recoveryControls<M>(
  a: AircraftEntity<M>, pilot: PilotAssignment, ctx: RecoveryContext, _snapshot: readonly AircraftEntity<M>[],
): { controls: Controls; recovery: RecoveryState; state?: AircraftState } {
  const home = pilot.home!
  const geo = recoveryGeometry(home, ctx) ?? (home.kind === 'runway' ? seaLevelGeometry(home) : null)
  if (geo === null) throw new Error(`recoveryControls: home ship "${home.kind === 'ship' ? home.id : ''}" is gone; pilotTick drops the home first`)
  const now = ctx.nowS
  let r = pilot.decision.recovery ?? startRecovery(now)
  const ip = initialPoint(geo)
  const goal: Goal = { x: ip.x, z: ip.z, altitudeM: geo.touchdownM + IP_HEIGHT_M, speedMps: cruiseSpeedMps(a.spec) }
  const s = a.state
  const { target, vA, glideRad } = approachProfile(a.spec, geo, ctx.wind)
  const f = approachFrame(s, a.spec, geo)
  const surface = geo.deck?.velocity ?? ZERO

  if (r.phase === 'transit' && Math.hypot(ip.x - s.position.x, ip.z - s.position.z) <= IP_ARRIVAL_M) r = enter(r, 'hold', now)
  if (r.phase === 'hold') r = { ...enter(r, 'join', now), joinedAtS: now }
  if (r.phase === 'join' && f.alongM <= CONFIGURE_FROM_M) r = enter(r, 'configure', now)
  if (r.phase === 'configure' && f.alongM <= FIX_DISTANCE_M) {
    r = enter(r, insideCaptureWindow(captureErrors(s, a.spec, geo, vA, glideRad, ctx.wind)) ? 'final' : 'go-around', now)
  }
  // 7c-7g §6: the gate is recomputed every tick from the live deck. Its
  // lateral part holds through `final` until the cut: a deck that turns under
  // the pilot swings the centerline away, and the rudder-only `final` cannot
  // follow it (Review Focus 2).
  if (r.phase === 'final' && !r.cut && Math.abs(f.acrossM) >= CAPTURE_LATERAL_M) r = enter(r, 'go-around', now)
  if (r.phase === 'final' && !airborne(a, ctx.terrain, ctx.decks)) r = enter(r, 'rollout', now)
  if (r.phase === 'rollout') {
    const under = groundUnder(ctx.terrain, ctx.decks, s.position.x, s.position.z)
    if (length(sub(s.velocity, under?.velocity ?? ZERO)) < LANDED_SPEED_MPS) r = { ...enter(r, 'landed', now), restAtS: now }
  }
  if (r.phase === 'go-around' && f.wheelM >= GO_AROUND_HEIGHT_M && length(airVelocity(s, ctx.wind)) >= goAroundExitMps(a.spec)) r = { ...enter(r, 'transit', now), cut: false, joinedAtS: null }

  switch (r.phase) {
    case 'transit': {
      const controls = {
        ...controlsForDesiredVelocity(s, a.spec, goalDesiredVelocity(a, goal, null)),
        throttle: goalThrottle(a, goal.speedMps),
      }
      return { controls, recovery: r }
    }
    case 'hold':
      return { controls: orbitControls(a, { ...goal, speedMps: HOLD_DIVE_FRACTION * a.spec.limits.diveSpeedMps }, HOLD_RADIUS_M), recovery: r }
    case 'join': {
      const speed = lerp(vA + CONFIGURE_SPEED_MARGIN_MPS, cruiseSpeedMps(a.spec), (f.alongM - CONFIGURE_FROM_M) / (IP_DISTANCE_M - CONFIGURE_FROM_M))
      return { controls: joinControls(a, geo, glideRad, speed, surface, ctx.wind), recovery: r }
    }
    case 'configure': {
      const speed = lerp(vA, vA + CONFIGURE_SPEED_MARGIN_MPS, (f.alongM - FIX_DISTANCE_M) / (CONFIGURE_FROM_M - FIX_DISTANCE_M))
      const controls = { ...joinControls(a, geo, glideRad, speed, surface, ctx.wind), gearDown: true, flapDown: true, hookDown: geo.deck !== null }
      return { controls, recovery: r }
    }
    case 'final': {
      const controls = approachControls(a.spec, s, target)
      if (geo.deck !== null && geo.paddles !== null) {
        const cue = paddlesCue(a.spec, s, controls, geo.deck, geo.paddles, ctx.wind)
        if (cue === 'cut') r = { ...r, cut: true }
        if (cue === 'wave-off' && !r.cut) {
          r = enter(r, 'go-around', now)
          return { controls: goAroundControls(a), recovery: r }
        }
      }
      return { controls, recovery: r }
    }
    case 'rollout':
      return { controls: approachControls(a.spec, s, target), recovery: r }
    case 'go-around':
      return { controls: goAroundControls(a), recovery: r }
    case 'landed':
      return {
        controls: { pitch: 0, roll: 0, yaw: 0, throttle: 0, brake: 1, gearDown: true, flapDown: false, hookDown: geo.deck !== null },
        recovery: r,
      }
  }
}
