import { z } from 'zod'
import type { AircraftSpec } from './flight/schema.js'
import { createState, type Controls } from './flight/state.js'
import { createWorldOf, type AircraftEntity, type ShipEntity, type World } from './loop.js'
import { v3 } from './math/vec3.js'
import { type Airfield, localToWorld, parkedAttitude } from './world/airfields.js'
import { assertLoopOverWater, bearingTo, createShipState, type ShipSpec } from './world/ships.js'
import { SEA_LEVEL_M, type TerrainField } from './world/terrain.js'

/**
 * A scenario says where everything starts (spec §7). It is the data contract
 * Plan 14's map and Plan 9's mission selector read; it deliberately carries
 * NO flights, targets, objectives, weather or loadout -- those are master
 * spec §9's fields and belong to the plans that consume them.
 */

const finite = z.number().refine(Number.isFinite, { message: 'must be a finite number' })
const id = z.string().min(1)

const ScenarioObject = z.object({
  id,
  player: id,
  airfields: z.array(id).min(1),
  aircraft: z.array(z.object({
    id,
    spec: id,
    parkedAt: z.object({
      airfield: id,
      /** `'runwayCenter'`, or a runway-local spot (meters, `x` across, `z` along). */
      spot: z.union([z.literal('runwayCenter'), z.object({ x: finite, z: finite }).strict()]),
    }).strict(),
    /** Wheel chocks: `brake: 1` in the held controls. The honest model of an
     *  airplane nobody is flying. */
    chocked: z.boolean(),
  }).strict()).min(1),
  ships: z.array(z.object({
    id,
    spec: id,
    waypoints: z.array(z.tuple([finite, finite])).min(2),
    speedMps: finite,
  }).strict()),
}).strict()

export type Scenario = z.infer<typeof ScenarioObject>

export function parseScenario(raw: unknown): Scenario {
  const result = ScenarioObject.safeParse(raw)
  if (!result.success) {
    const detail = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Invalid scenario: ${detail}`)
  }
  return result.data
}

export type ScenarioBundle = {
  readonly scenario: Scenario
  readonly aircraftSpecs: Readonly<Record<string, AircraftSpec>>
  readonly shipSpecs: Readonly<Record<string, ShipSpec>>
  readonly airfields: Readonly<Record<string, Airfield>>
}

/**
 * A parked airplane's altitude before terrain exists. NOT the truth: the
 * real ground height depends on which level loads, and no terrain has been
 * requested when the world is first built. `settleOnTerrain` (frame.ts)
 * overwrites it the instant a field arrives, and `nextFrameState` holds a
 * parked world at zero elapsed time until then, which is the only reason a
 * placeholder is safe. 1.9 m is what `DEFAULT_SPAWN_POSITION.y` was.
 */
export const PARKED_PLACEHOLDER_Y_M = 1.9

const NEUTRAL: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0 }

function lookup<T>(table: Readonly<Record<string, T>>, key: string, kind: string): T {
  const v = table[key]
  if (v === undefined) throw new Error(`scenario refers to ${kind} "${key}", which is not in the bundle`)
  return v
}

/**
 * The initial `World`. Pure; `terrain` may be `null` (the browser has none
 * at boot) in which case the ship loops are not checked here -- the Tier 1
 * test does that against the real field on every commit.
 */
export function worldFromScenario(bundle: ScenarioBundle, terrain: TerrainField | null): World<undefined> {
  const s = bundle.scenario
  const airfields = s.airfields.map((a) => lookup(bundle.airfields, a, 'airfield'))

  const aircraft: AircraftEntity<undefined>[] = s.aircraft.map((a) => {
    const spec = lookup(bundle.aircraftSpecs, a.spec, 'aircraft spec')
    const field = lookup(bundle.airfields, a.parkedAt.airfield, 'airfield')
    const spot = a.parkedAt.spot === 'runwayCenter' ? { x: 0, z: 0 } : a.parkedAt.spot
    const at = localToWorld(field, spot.x, spot.z)
    const state = createState({
      position: v3(at.x, PARKED_PLACEHOLDER_Y_M, at.z),
      velocity: v3(0, 0, 0),
      attitude: parkedAttitude(field),
      gearFraction: 1,
    })
    const controls: Controls = a.chocked ? { ...NEUTRAL, gearDown: true, brake: 1 } : NEUTRAL
    return { id: a.id, spec, state, previous: state, controls, assistMemory: undefined, impact: null, parked: true }
  })

  const ships: ShipEntity[] = s.ships.map((sh) => {
    const spec = lookup(bundle.shipSpecs, sh.spec, 'ship spec')
    const orders = { waypoints: sh.waypoints.map(([x, z]) => ({ x, z })), speedMps: sh.speedMps }
    if (terrain !== null) assertLoopOverWater(sh.id, orders, terrain)
    const first = orders.waypoints[0]!
    const second = orders.waypoints[1]!
    const state = createShipState({
      position: v3(first.x, SEA_LEVEL_M, first.z),
      headingRad: bearingTo(first, second),
      speedMps: sh.speedMps,
      waypoint: 1,
    })
    return { id: sh.id, spec, state, previous: state, orders }
  })

  return createWorldOf({ aircraft, ships, player: s.player, airfields, terrain })
}
