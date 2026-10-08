import { parseScenario, worldFromScenario } from '../../../src/sim/scenario.js'
import { advance, aircraftById, withAircraftState, type World } from '../../../src/sim/loop.js'
import { length, scale, sub, v3 } from '../../../src/sim/math/vec3.js'
import { qFromAxisAngle } from '../../../src/sim/math/quat.js'
import { createState, DT } from '../../../src/sim/flight/model.js'
import { recoveryGeometry, type RecoveryGeometry } from '../../../src/sim/ai/recovery.js'
import type { RecoveryPhase } from '../../../src/sim/ai/pilot.js'
import { heightAboveGround } from '../../../src/sim/ai/safety.js'
import { decksOf } from '../../../src/sim/world/deck.js'
import type { AircraftCombat } from '../../../src/sim/weapons/combat.js'
import type { TerrainField } from '../../../src/sim/world/terrain.js'
import { bundleForScenario } from '../../../tools/content/load.js'

/**
 * 7g's Deterministic worlds: raw scenario JSON, parsed, in the style of
 * `formationWorlds.ts`, so every case also exercises the content path.
 * Inline; nothing ships.
 */
export const STILL_CARRIER = {
  id: 'cv-1', spec: 'essex-cv', side: 'allied',
  // Two waypoints 60 km apart on one heading: no turn for the length of any test.
  waypoints: [[0, 0], [0, -60000]], speedMps: 7.717,
}
/** Wind from the north at the ship's speed: 15.4 m/s over the deck, like deck-quals. */
export const DECK_WIND = { windFromDeg: 0, windMps: 7.717 }
export const PLAYER_FAR = { id: 'f6f-1', spec: 'f6f-hellcat', airborneAt: { position: [80000, 3000, 80000], headingDeg: 90, speedMps: 120 } }

export const homed = (id: string, home: { ship: string } | { airfield: string }, position: readonly [number, number, number], headingDeg = 0, speedMps = 110) =>
  ({ id, spec: 'f6f-hellcat', side: 'allied', airborneAt: { position, headingDeg, speedMps }, pilot: { skill: 'veteran', home } })

export function buildRecovery(aircraft: unknown[], extra: Record<string, unknown> = {}, terrain: TerrainField | null = null): World<undefined> {
  return worldFromScenario(bundleForScenario(parseScenario({
    id: 'recovery-test', player: 'f6f-1', airfields: ['tacloban', 'dulag'], aircraft: [PLAYER_FAR, ...aircraft],
    ships: [STILL_CARRIER], weather: DECK_WIND, ...extra,
  })), terrain)
}

/** Run `seconds`, calling `onTick` after every step; stops early when it returns true. */
export function fly(w: World<undefined>, seconds: number, onTick: (w: World<undefined>) => boolean | void = () => {}): World<undefined> {
  let world = w
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    world = advance(world, DT).world
    if (onTick(world) === true) break
  }
  return world
}

export const phaseOf = (w: World<undefined>, id: string) => aircraftById(w, id)!.pilot!.decision.recovery?.phase ?? null

function withRecord(w: World<undefined>, id: string, patch: (r: AircraftCombat) => AircraftCombat): World<undefined> {
  const record = w.combat.aircraft[id]
  if (record === undefined) throw new Error(`no combat record "${id}"`)
  return { ...w, combat: { ...w.combat, aircraft: { ...w.combat.aircraft, [id]: patch(record) } } }
}

/** Every gun at zero rounds. */
export const withGunsEmpty = (w: World<undefined>, id: string): World<undefined> =>
  withRecord(w, id, (r) => ({ ...r, guns: r.guns.map((g) => ({ ...g, ammo: 0 })) }))

export const withStructure = (w: World<undefined>, id: string, structure: number): World<undefined> =>
  withRecord(w, id, (r) => ({ ...r, damage: { ...r.damage, structure } }))

/** Destroyed as of this tick: `isAircraftDown` reads `destroyedAt`. */
export const withDestroyed = (w: World<undefined>, id: string): World<undefined> =>
  withRecord(w, id, (r) => ({ ...r, damage: { ...r.damage, destroyedAt: w.tick } }))

/** A hand-set fuel load, as a fraction of capacity (spec §1: one unit test, not a flown one). */
export function withFuel(w: World<undefined>, id: string, fraction: number): World<undefined> {
  return {
    ...w,
    aircraft: w.aircraft.map((a) => a.id !== id ? a : {
      ...a, state: { ...a.state, fuelKg: fraction * a.spec.mass.fuelCapacityKg },
    }),
  }
}

/** An axis veteran with no home. */
export const axis = (id: string, position: readonly [number, number, number], headingDeg: number, speedMps = 110) =>
  ({ id, spec: 'f6f-hellcat', side: 'axis', airborneAt: { position, headingDeg, speedMps }, pilot: { skill: 'veteran' } })

/** ai-1, homed to cv-1, northbound at 1,500 m; axis-1 3 km to its east,
 *  also northbound: in detection range, not pointing at ai-1, far outside
 *  the rear cone's THREAT_ASTERN_RANGE_M. */
export const worldWithHostileAbeam = (): World<undefined> => buildRecovery([
  homed('ai-1', { ship: 'cv-1' }, [0, 1500, 12000]),
  axis('axis-1', [3000, 1500, 12000], 0),
])

/** ai-1, homed to cv-1, northbound at 1,500 m; axis-1 600 m directly behind
 *  it (south, +z), same heading and a little faster: a gun solution closing. */
export const worldWithHostileAstern = (): World<undefined> => buildRecovery([
  homed('ai-1', { ship: 'cv-1' }, [0, 1500, 12000]),
  axis('axis-1', [0, 1500, 12600], 0, 125),
])

/** Moves `hostile` to `rangeM` straight behind `id`, flying its velocity and
 *  attitude: in the rear cone, closing only if it then speeds up, with a gun
 *  solution once it points its nose (which it already does). */
export function withHostileAstern(w: World<undefined>, id: string, hostile: string, rangeM = 600): World<undefined> {
  const me = aircraftById(w, id)!.state
  const behind = sub(me.position, scale(me.velocity, rangeM / length(me.velocity)))
  const h = aircraftById(w, hostile)!.state
  return withAircraftState(w, hostile, { ...h, position: behind, velocity: me.velocity, attitude: me.attitude })
}

/** `ship` sunk as of this tick. */
export function withShipSunk(w: World<undefined>, ship: string): World<undefined> {
  const d = w.combat.ships[ship]!
  return { ...w, combat: { ...w.combat, ships: { ...w.combat.ships, [ship]: { ...d, destroyedTick: w.tick } } } }
}

/** The approach frame of `id`'s live recovery geometry, computed as
 *  `approachControls` computes it: `alongM` short of the aim point,
 *  `acrossM` starboard of the centerline, `wheelM` the wheels' height above
 *  touchdown. */
export function approachFrame(w: World<undefined>, id: string): { alongM: number; acrossM: number; wheelM: number; geo: RecoveryGeometry } {
  const a = aircraftById(w, id)!
  const geo = recoveryGeometry(a.pilot!.home!, w)!
  const h = geo.headingRad
  const dx = a.state.position.x - geo.aimX, dz = a.state.position.z - geo.aimZ
  return {
    alongM: -(dx * Math.sin(h) + dz * -Math.cos(h)),
    acrossM: dx * Math.cos(h) + dz * Math.sin(h),
    wheelM: a.state.position.y - a.spec.gear.heightM - geo.touchdownM,
    geo,
  }
}

/** `id` in `rtb` with a fresh recovery at `phase` (and `cut` as given). */
export function inRecovery(w: World<undefined>, id: string, phase: RecoveryPhase, cut = false): World<undefined> {
  return {
    ...w,
    aircraft: w.aircraft.map((a) => a.id !== id ? a : {
      ...a,
      pilot: {
        ...a.pilot!,
        decision: {
          ...a.pilot!.decision, mode: 'rtb', targetId: null,
          recovery: { phase, sinceS: w.tick * DT, cut, joinedAtS: null, restAtS: null, respotted: false },
        },
      },
    }),
  }
}

/**
 * `id` placed on its approach: `alongM` short of the aim, `acrossM` to
 * starboard, wheels `wheelM` above touchdown, flying down the centerline at
 * `airspeedMps` through the world's wind (taken along the axis, as every
 * wind here is), level. `configured`: gear and flaps already down.
 */
export function onApproach(
  w: World<undefined>, id: string,
  at: { alongM: number; acrossM?: number; wheelM: number; airspeedMps: number; configured?: boolean; homeOf?: string },
): World<undefined> {
  const a = aircraftById(w, id)!
  // `homeOf`: another aircraft's approach, for one with no home of its own.
  const geo = recoveryGeometry(aircraftById(w, at.homeOf ?? id)!.pilot!.home!, w)!
  const h = geo.headingRad
  const bow = v3(Math.sin(h), 0, -Math.cos(h))
  const across = at.acrossM ?? 0
  const wind = w.wind ?? v3(0, 0, 0)
  const ground = at.airspeedMps + (wind.x * bow.x + wind.z * bow.z)
  return withAircraftState(w, id, createState({
    position: v3(
      geo.aimX - bow.x * at.alongM + Math.cos(h) * across,
      geo.touchdownM + a.spec.gear.heightM + at.wheelM,
      geo.aimZ - bow.z * at.alongM + Math.sin(h) * across,
    ),
    velocity: scale(bow, ground),
    attitude: qFromAxisAngle(v3(0, 1, 0), Math.PI / 2 - h),
    gearFraction: at.configured === true ? 1 : 0,
    flapFraction: at.configured === true ? 1 : 0,
    fuelKg: a.state.fuelKg,
    tick: a.state.tick,
  }))
}

/** Crashed: an `impact`, or the body origin at or below what is under it.
 *  The second half matters here: these worlds have no terrain, and with no
 *  heightfield the loop's impact test sees only decks, so an airplane that
 *  flies into the sea is never given an `impact` (loop.ts). */
export function crashed(w: World<undefined>, id: string): boolean {
  const a = aircraftById(w, id)!
  return a.impact !== null || heightAboveGround(a.state, w.terrain, decksOf(w.ships)) <= 0
}
