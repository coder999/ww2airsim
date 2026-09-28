import { parseScenario, worldFromScenario } from '../../../src/sim/scenario.js'
import { advance, aircraftById, type World } from '../../../src/sim/loop.js'
import { DT } from '../../../src/sim/flight/model.js'
import type { AircraftCombat } from '../../../src/sim/weapons/combat.js'
import type { TerrainField } from '../../../src/sim/world/terrain.js'
import { bundleForScenario } from '../../../tools/content/load.js'

/**
 * 7g's Tier 1 worlds: raw scenario JSON, parsed, in the style of
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
const axis = (id: string, position: readonly [number, number, number], headingDeg: number, speedMps = 110) =>
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
