/**
 * The headless flight kit (M3 Task 4): the helpers a mission test flies its
 * sortie with, through production `advance`, so the mission's own trackers
 * see every tick. Tasks 5, 6 and M4 build on these.
 *
 * Every flying helper returns the world after the run, and throws
 * `<helper>: <what> at tick <n>` on an impact or a timeout, so a failed run
 * names the moment it went wrong.
 *
 * The approaches are lifted from `tests/sim/carrierLanding.test.ts` (the
 * carrier) and `tests/sim/landing.test.ts` (Tacloban), not reinvented.
 */
import { existsSync } from 'node:fs'
import { hasRealLevelFile, loadTerrainHeader, loadTerrainLevel, terrainHeaderPath } from '../../../tools/terrain/load.js'
import { finestFetchedLevelFor, INTERIM_ASSET_QUALITY_TIER } from '../../../src/render/content.js'
import { createTerrainField, heightAt, SEA_LEVEL_M, type TerrainField } from '../../../src/sim/world/terrain.js'
import { advance, playerAircraft, withAircraftState, withControls, type World } from '../../../src/sim/loop.js'
import { createState, DT, type AircraftState, type Controls } from '../../../src/sim/flight/model.js'
import { deckOf, deckWorld, decksOf } from '../../../src/sim/world/deck.js'
import { groundUnder } from '../../../src/sim/world/ground.js'
import { runwayHeadingRad } from '../../../src/sim/world/airfields.js'
import { approachControls, VREF_STALL_MULTIPLE } from '../../../tools/autopilot/approach.js'
import { ticksFor } from '../../../src/sim/mission/state.js'
import { attitudeAngles } from '../../../src/sim/flight/attitude.js'
import { qFromAxisAngle, qMul, type Quat } from '../../../src/sim/math/quat.js'
import { v3, sub, length } from '../../../src/sim/math/vec3.js'

/** `carrierLanding.test.ts`'s level: the one a real page load flies over. */
const LEVEL = finestFetchedLevelFor(INTERIM_ASSET_QUALITY_TIER)

/** The committed terrain field at the level `carrierLanding.test.ts` uses, or
 *  `null` when its data is absent (an LFS pointer, or a checkout without
 *  tiles). Callers `describe.skipIf(terrain === null)`, a named skip. */
export function terrainOrSkip(): TerrainField | null {
  if (!existsSync(terrainHeaderPath())) return null
  const header = loadTerrainHeader()
  if (!hasRealLevelFile(LEVEL, header)) return null
  return createTerrainField(header, LEVEL, loadTerrainLevel(LEVEL, header))
}

/** Compass heading to attitude: the construction `buildAircraft` uses for
 *  `airborneAt` (0 is north, -z; 90 is east, +x). */
export function headingAttitude(deg: number): Quat {
  return qFromAxisAngle(v3(0, 1, 0), Math.PI / 2 - (deg * Math.PI) / 180)
}

/** Level flight at `point`, `altitudeM` above sea level, gear and flaps up,
 *  velocity along the heading. */
export function levelAt(point: { readonly x: number; readonly z: number }, altitudeM: number, speedMps: number, headingDeg = 0): AircraftState {
  const h = (headingDeg * Math.PI) / 180
  return createState({
    position: v3(point.x, altitudeM, point.z),
    velocity: v3(Math.sin(h) * speedMps, 0, -Math.cos(h) * speedMps),
    attitude: headingAttitude(headingDeg),
    gearFraction: 0,
    flapFraction: 0,
  })
}

function checkImpact(helper: string, w: World<undefined>): void {
  const impact = playerAircraft(w).impact
  if (impact !== null) throw new Error(`${helper}: impact (${impact.kind}, ${impact.surface}) at tick ${impact.tick}`)
}

const landings = (w: World<undefined>): number => w.mission?.log.filter((e) => e.kind === 'landing').length ?? 0

/** `ticks` production ticks with the player's controls set to `controls`
 *  over a neutral base (stick centered, throttle closed). */
export function stepsWithControls(w: World<undefined>, ticks: number, controls: Partial<Controls>): World<undefined> {
  let world = w
  for (let i = 0; i < ticks; i++) {
    world = withControls(world, world.player, { pitch: 0, roll: 0, yaw: 0, throttle: 0, ...controls })
    world = advance(world, DT).world
  }
  return world
}

/** Pins the player to `state` for `ticks` ticks: `withAircraftState` (with
 *  the world's tick) and then one `advance`, every tick. For staged "the
 *  player is here" reach and hold checks. */
export function hold(w: World<undefined>, state: AircraftState, ticks: number): World<undefined> {
  let world = w
  for (let i = 0; i < ticks; i++) {
    world = withAircraftState(world, world.player, { ...state, tick: world.tick })
    world = advance(world, DT).world
  }
  return world
}

/**
 * The player's wheels put on the surface under them, as the frame's
 * `settleOnTerrain` (src/render/frame.ts) does for a parked entity before
 * the first tick: a start parked at an airfield has its origin at
 * `PARKED_PLACEHOLDER_Y_M` (src/sim/scenario.ts), 1.3 m below where the
 * wheels meet Tacloban's ground, and without this the take-off roll is an
 * impact at tick 26 (measured 2026-09-27). A deck start is already exact
 * and is returned untouched, as is anything not `parked`.
 */
function settled(w: World<undefined>): World<undefined> {
  const p = playerAircraft(w)
  const ground = groundUnder(w.terrain, decksOf(w.ships), p.state.position.x, p.state.position.z)
  if (ground === null) return w
  const wheelsM = p.state.position.y - p.spec.gear.heightM - ground.heightM
  if (!p.parked || wheelsM === 0) return w
  const pos = p.state.position
  return withAircraftState(w, w.player, { ...p.state, position: v3(pos.x, ground.heightM + p.spec.gear.heightM, pos.z) })
}

/** Airspeed above which `deckRun` pulls (the Measured deck-run law). */
const ROTATE_MPS = 38
const ROTATE_PITCH = 0.6
/** Wheels this far above the start surface end the roll-and-rotate law and
 *  begin the climb-out hold: the landing tracker's airborne latch height. */
const CLIMB_OUT_M = 10
/** The climb-out's flight-path angle, and the airspeed below which it holds
 *  level instead, to accelerate. */
const CLIMB_OUT_DEG = 10
const CLIMB_OUT_MIN_MPS = 50
const DECK_RUN_MAX_S = 120

/**
 * A take-off roll and climb: full throttle, gear down, hook up, flaps as
 * asked (default down). On the surface and up to 10 m, the plan's Measured
 * deck-run law: pitch 0.6 whenever the airspeed is above 38 m/s (from the
 * Essex's start spot, 72.7 m over the deck at the bow with flaps, 36.7 m
 * without; measured 2026-09-26). Above 10 m, a climb-out hold: a steady
 * 10 degree climb (level below 50 m/s, to accelerate), wings level. Runs
 * until the wheels are `climbToM` (default 150) above where they started
 * (the deck, or a runway's elevation, after settling a parked start onto
 * the real ground: `settled`).
 *
 * Why not the Measured law all the way (measured 2026-09-27, 60 s of each
 * over real terrain): pitch 0.6 is a rate demand, so held it keeps pulling.
 * From the Essex it tops out at 196 m with flaps (136 m without) and falls
 * into the sea 33 s (28 s) after the brakes come off; from Tacloban, flaps
 * up, it tops out at 135 m and crashes at 31 s. So `climbToM: 300` (Task 5)
 * was unreachable, flaps-up 150 m too, and the default returned at 150 m at
 * 28 m/s, below the stall. With the hold, all four climb at a steady 10
 * degrees past 540 m in 60 s; the lowest point after the switch is 19 m.
 */
export function deckRun(w: World<undefined>, opts: { readonly flaps?: boolean; readonly climbToM?: number } = {}): World<undefined> {
  const climbToM = opts.climbToM ?? 150
  let world = settled(w)
  const start = playerAircraft(world)
  const floorM = start.state.position.y - start.spec.gear.heightM
  const wind = world.wind ?? v3(0, 0, 0)
  let integral = 0
  for (let i = 0; i < ticksFor(DECK_RUN_MAX_S); i++) {
    const s = playerAircraft(world).state
    const wheelsM = s.position.y - start.spec.gear.heightM - floorM
    if (wheelsM >= climbToM) return world
    const air = length(sub(s.velocity, wind))
    let pitch = air > ROTATE_MPS ? ROTATE_PITCH : 0
    let roll = 0
    if (wheelsM > CLIMB_OUT_M) {
      const gammaDeg = (Math.atan2(s.velocity.y, Math.hypot(s.velocity.x, s.velocity.z)) * 180) / Math.PI
      const error = (air < CLIMB_OUT_MIN_MPS ? 0 : CLIMB_OUT_DEG) - gammaDeg
      integral = clamp(integral + (error * DT) / 40, -0.5, 1)
      pitch = clamp(error / 20 + integral, -1, 1)
      roll = clamp(-2 * attitudeAngles(s).rollRad, -1, 1)
    }
    world = withControls(world, world.player, {
      pitch, roll, yaw: 0, throttle: 1,
      gearDown: true, hookDown: false, flapDown: opts.flaps ?? true, brake: 0,
    })
    world = advance(world, DT).world
    checkImpact('deckRun', world)
  }
  throw new Error(`deckRun: not ${climbToM} m up after ${DECK_RUN_MAX_S} s at tick ${world.tick}`)
}

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x))

/** The go-around: Task 3's control law (`tests/sim/mission/passes.test.ts`).
 *  Held, `pitch: 0.5` goes vertical, stalls at 311 m and hits the sea 28.5 s
 *  after the switch (measured 2026-09-26); released after 2 s it climbs
 *  away at 18 m/s. */
const GO_AROUND: Controls = { pitch: 0.5, roll: 0, yaw: 0, throttle: 1, gearDown: false, hookDown: false }
const GO_AROUND_PULL_S = 2
const GO_AROUND_FLY_S = 30
const APPROACH_M = 4000
const APPROACH_SLOPE_RAD = (3.5 * Math.PI) / 180

/**
 * `carrierLanding.test.ts`'s approach: the player 4 km astern of `shipId`'s
 * trap zone near edge, on a 3.5 degree slope, at vref plus the ship's speed,
 * gear and flaps down, flown by `approachControls` against the moving deck
 * (read every tick) and the wind. Aims at the zone's NEAR edge, because the
 * autopilot's flare floats about 67 m (that file says why).
 *
 * Stops at the first new `landing` in the mission log. With `goAroundAtM`,
 * it switches to the go-around inside that range of the aim point and
 * returns 30 s later. Throws on an impact, or when `maxS` (default 300)
 * passes first.
 */
export function carrierApproach(
  w: World<undefined>, shipId: string,
  opts: { readonly hookDown?: boolean; readonly goAroundAtM?: number; readonly maxS?: number } = {},
): World<undefined> {
  const maxS = opts.maxS ?? 300
  const ship0 = w.ships.find((s) => s.id === shipId)
  const deck0 = ship0 === undefined ? null : deckOf(ship0)
  if (ship0 === undefined || deck0 === null) throw new Error(`carrierApproach: "${shipId}" has no flight deck at tick ${w.tick}`)
  const spec = playerAircraft(w).spec
  const aimLocalZ = -deck0.lengthM / 2 + deck0.trapFromSternM
  const startLocal = deckWorld(deck0, 0, aimLocalZ - APPROACH_M)
  const vref = VREF_STALL_MULTIPLE * spec.reference.stallSpeedFlapMps
  const closing = vref + ship0.state.speedMps
  const along = v3(Math.sin(deck0.headingRad), 0, -Math.cos(deck0.headingRad))
  let world = withAircraftState(w, w.player, createState({
    position: v3(startLocal.x, deck0.center.y + spec.gear.heightM + APPROACH_M * Math.tan(APPROACH_SLOPE_RAD), startLocal.z),
    velocity: v3(along.x * closing, 0, along.z * closing),
    attitude: qFromAxisAngle(v3(0, 1, 0), Math.PI / 2 - deck0.headingRad),
    gearFraction: 1,
    flapFraction: 1,
    tick: w.tick,
  }))
  world = { ...world, aircraft: world.aircraft.map((a) => (a.id === world.player ? { ...a, parked: false } : a)) }
  const landed = landings(world)
  const hookDown = opts.hookDown ?? true
  let switchTick: number | null = null
  for (let i = 0; i < ticksFor(maxS); i++) {
    const before = playerAircraft(world).state
    const deck = deckOf(world.ships.find((s) => s.id === shipId)!)!
    const aim = deckWorld(deck, 0, aimLocalZ)
    if (opts.goAroundAtM !== undefined && switchTick === null
      && Math.hypot(before.position.x - aim.x, before.position.z - aim.z) <= opts.goAroundAtM) switchTick = before.tick
    let controls: Controls
    if (switchTick !== null) {
      if ((before.tick - switchTick) * DT >= GO_AROUND_FLY_S) return world
      const pull = (before.tick - switchTick) * DT < GO_AROUND_PULL_S
      controls = { ...GO_AROUND, pitch: pull ? GO_AROUND.pitch : 0 }
    } else {
      controls = approachControls(spec, before, {
        aimX: aim.x, aimZ: aim.z, runwayHeadingRad: deck.headingRad,
        touchdownElevationM: deck.center.y, surfaceVelocity: deck.velocity,
        windVelocity: world.wind ?? v3(0, 0, 0), hookDown,
      })
    }
    world = advance(withControls(world, world.player, controls), DT).world
    checkImpact('carrierApproach', world)
    if (landings(world) > landed) return world
  }
  throw new Error(`carrierApproach: no landing within ${maxS} s at tick ${world.tick}`)
}

const FIELD_APPROACH_M = 5000
const FIELD_SLOPE_RAD = (3 * Math.PI) / 180

/**
 * `landing.test.ts`'s Tacloban approach, generalized to any airfield in the
 * world by its runway center and heading: lined up 5 km out on a 3 degree
 * path, at vref, gear and flaps down, aiming a quarter of the strip in from
 * the approach end, in the world's wind. Stops at the first new `landing`
 * in the mission log; throws on an impact or after `maxS` (default 300).
 *
 * Crosswind is its limit, because `approachControls` holds the centerline
 * with yaw proportional to the offset and nothing else. Measured 2026-09-27
 * from dev-mission-circuit: calm, and Task 5's 3 m/s from 000, land on the
 * centerline at Tacloban and Dulag; Task 6's 5 m/s from 060 stops 83.7 m
 * west of Tacloban's centerline, which is no landing at the field (`at`
 * null), and deck-quals' 7.7 m/s from 342 stops 20.9 m west, also `at`
 * null. An aim-point integral in this helper did not converge (tried at
 * three gains); a crosswind needs the autopilot's own lateral law.
 */
export function fieldApproach(w: World<undefined>, airfieldId: string, opts: { readonly maxS?: number } = {}): World<undefined> {
  const maxS = opts.maxS ?? 300
  const field = w.airfields.find((a) => a.id === airfieldId)
  if (field === undefined) throw new Error(`fieldApproach: no airfield "${airfieldId}" in this world at tick ${w.tick}`)
  if (w.terrain === null) throw new Error(`fieldApproach: needs terrain at tick ${w.tick}`)
  const terrain = w.terrain
  const spec = playerAircraft(w).spec
  const h = runwayHeadingRad(field)
  const along = v3(Math.sin(h), 0, -Math.cos(h))
  const c = field.runway.center
  const elevationM = heightAt(terrain, c.x, c.z)
  const target = {
    aimX: c.x - along.x * (field.runway.lengthM / 4),
    aimZ: c.z - along.z * (field.runway.lengthM / 4),
    runwayHeadingRad: h,
    touchdownElevationM: elevationM,
    windVelocity: w.wind ?? v3(0, 0, 0),
  }
  const vref = VREF_STALL_MULTIPLE * spec.reference.stallSpeedFlapMps
  let world = withAircraftState(w, w.player, createState({
    position: v3(
      target.aimX - along.x * FIELD_APPROACH_M,
      elevationM + spec.gear.heightM + FIELD_APPROACH_M * Math.tan(FIELD_SLOPE_RAD),
      target.aimZ - along.z * FIELD_APPROACH_M,
    ),
    velocity: v3(along.x * vref, 0, along.z * vref),
    attitude: qFromAxisAngle(v3(0, 1, 0), Math.PI / 2 - h),
    gearFraction: 1,
    flapFraction: 1,
    tick: w.tick,
  }))
  world = { ...world, aircraft: world.aircraft.map((a) => (a.id === world.player ? { ...a, parked: false } : a)) }
  const landed = landings(world)
  for (let i = 0; i < ticksFor(maxS); i++) {
    const before = playerAircraft(world).state
    world = advance(withControls(world, world.player, approachControls(spec, before, target)), DT).world
    checkImpact('fieldApproach', world)
    if (landings(world) > landed) return world
  }
  throw new Error(`fieldApproach: no landing within ${maxS} s at tick ${world.tick}`)
}

/**
 * Spec §5's "injected hits": each id's combat record in its destroyed form
 * at `w.tick`, attributed to `by` (default the player). Structures and ships
 * go to 0 HP; an aircraft gets `damage.destroyedAt`. Throws on an id with no
 * combat record.
 */
export function destroyNow<M>(w: World<M>, ids: readonly string[], by: string = w.player): World<M> {
  let combat = w.combat
  for (const id of ids) {
    const structure = combat.structures[id]
    const ship = combat.ships[id]
    const aircraft = combat.aircraft[id]
    if (structure !== undefined) {
      combat = { ...combat, structures: { ...combat.structures, [id]: { ...structure, hp: 0, destroyedTick: w.tick, attacker: by } } }
    } else if (ship !== undefined) {
      combat = { ...combat, ships: { ...combat.ships, [id]: { ...ship, hp: 0, destroyedTick: w.tick, attacker: by } } }
    } else if (aircraft !== undefined) {
      combat = { ...combat, aircraft: { ...combat.aircraft, [id]: { ...aircraft, damage: { ...aircraft.damage, destroyedAt: w.tick, attacker: by } } } }
    } else {
      throw new Error(`destroyNow: no combat record for "${id}" at tick ${w.tick}`)
    }
  }
  return { ...w, combat }
}

/**
 * The staged ditch (M3 Task 4; exported for M4 by ruling M4-PF2): the player
 * 1 m over the water at `at`, northbound, wings level, nose 5 deg up, 45 m/s,
 * no sink. Returns that world, just before water contact, with no impact
 * check; the caller steps it (throttle closed) to the contact and checks the
 * surface is water (`heightAt` at `at` at or below `SEA_LEVEL_M`).
 *
 * Why this staging (measured 2026-09-27): `contactOutcome`
 * (src/sim/contact.ts) calls a water contact a ditching only with pitch in
 * [-2, 12] deg, sink at most 3 m/s and speed at most 1.2 x the clean stall
 * (52.6 m/s). A 5 m drop, nose down 20 deg at 60 m/s, hits at 15.3 m/s of
 * sink ("destroyed", which `recoveryOf` reads as Killed). Even this attitude
 * arrives at 3.55 m/s of sink from 5 m (destroyed), 2.78 m/s from 2 m, and
 * 2.19 m/s from 1 m (ditched, the margin kept).
 */
export const DITCH = { heightM: 1, speedMps: 45, sinkMps: 0, pitchDeg: 5 } as const

export function stageDitch(w: World<undefined>, at: { readonly x: number; readonly z: number }): World<undefined> {
  return withAircraftState(w, w.player, createState({
    position: v3(at.x, SEA_LEVEL_M + DITCH.heightM, at.z),
    velocity: v3(0, -DITCH.sinkMps, -DITCH.speedMps),
    attitude: qMul(headingAttitude(0), qFromAxisAngle(v3(0, 0, 1), (DITCH.pitchDeg * Math.PI) / 180)),
    tick: w.tick,
  }))
}
