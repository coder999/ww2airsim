import { z } from 'zod'
import type { AircraftSpec } from './flight/schema.js'
import { createState, type Controls } from './flight/state.js'
import { createWorldOf, type AircraftEntity, type ShipEntity, type World } from './loop.js'
import { type Vec3, v3 } from './math/vec3.js'
import { type Airfield, localToWorld, parkedAttitude } from './world/airfields.js'
import { deckOf, deckWorld } from './world/deck.js'
import { groundUnder } from './world/ground.js'
import { qFromAxisAngle } from './math/quat.js'
import { assertLoopOverWater, bearingTo, createShipState, type ShipSpec } from './world/ships.js'
import { SEA_LEVEL_M, type TerrainField } from './world/terrain.js'
import { emptyStores, storesFromLoadout, type Loadout, type StoresState } from './weapons/stores.js'

/**
 * A scenario says where everything starts (spec §7). It is the data contract
 * Plan 14's map and Plan 9's mission selector read; it deliberately carries
 * NO flights, targets, objectives or loadout -- those are master spec §9's
 * fields and belong to the plans that consume them. `weather` is Plan 8's
 * (steady wind only; see `windVectorFrom`), clouds (16a) and time of day
 * (16c).
 */

const finite = z.number().refine(Number.isFinite, { message: 'must be a finite number' })
const id = z.string().min(1)

/** How many layers a sky may carry; the renderer's uniform array is sized to this. */
export const MAX_CLOUD_LAYERS = 4

/**
 * One cloud layer (Plan 16a): a slab from `baseM` to `baseM + thicknessM`
 * covering `coverage` of the sky. Content the RENDERER reads; `World` never
 * carries it and nothing in sim/ samples it -- the goldens, the soak and the
 * landing snapshots are exactly as blind to clouds as they were.
 */
const CloudLayerObject = z.object({
  kind: z.enum(['cumulus', 'cirrus']),
  baseM: finite.refine((n) => n >= 0, { message: 'baseM must not be negative' }),
  thicknessM: finite.refine((n) => n > 0, { message: 'thicknessM must be greater than zero' }),
  coverage: finite.refine((n) => n >= 0 && n <= 1, { message: 'coverage must be in [0, 1]' }),
}).strict()
export type CloudLayer = z.infer<typeof CloudLayerObject>

const ScenarioObject = z.object({
  id,
  player: id,
  airfields: z.array(id).min(1),
  /** Legitimate strike targets (Plan 6b, spec §2.4): which of `airfields`'
   *  structures count toward the `RAZED` counter. Absent means none do --
   *  matching every scenario shipped before this field existed. */
  enemyAirfields: z.array(id).optional(),
  aircraft: z.array(z.object({
    id,
    spec: id,
    parkedAt: z.union([
      z.object({
        airfield: id,
        /** `'runwayCenter'`, or a runway-local spot (meters, `x` across, `z` along). */
        spot: z.union([z.literal('runwayCenter'), z.object({ x: finite, z: finite }).strict()]),
      }).strict(),
      /** On a carrier's flight deck (Plan 8): deck-local meters, `x` across
       *  to starboard, `z` along toward the bow, from the deck center. */
      z.object({ ship: id, spot: z.object({ x: finite, z: finite }).strict() }).strict(),
    ]),
    /** Wheel chocks: `brake: 1` in the held controls. The honest model of an
     *  airplane nobody is flying. */
    chocked: z.boolean(),
  }).strict()).min(1),
  /** A ship on a closed waypoint loop, OR -- when `speedMps` is 0 -- a single
   *  anchored point (Plan 6b's maru): the loop-closing second waypoint has no
   *  meaning for a ship that never moves, so only a moving ship needs two. */
  ships: z.array(z.object({
    id,
    spec: id,
    waypoints: z.array(z.tuple([finite, finite])).min(1),
    speedMps: finite,
  }).strict().refine((s) => s.speedMps === 0 || s.waypoints.length >= 2, {
    message: 'waypoints must have at least 2 entries unless speedMps is 0', path: ['waypoints'],
  })),
  /** Steady wind, meteorological convention: the true bearing it blows FROM,
   *  and its speed. Plan 8. `windMps: 0` is calm, which `worldFromScenario`
   *  turns into a `null` world wind so the calm code path is selected. */
  weather: z.object({
    windFromDeg: finite,
    windMps: finite.refine((n) => n >= 0, { message: 'must not be negative' }),
    /** Optional; absent is a clear sky (Plan 16a). Non-overlapping slabs. */
    clouds: z.array(CloudLayerObject).max(MAX_CLOUD_LAYERS).refine((layers) => {
      const sorted = [...layers].sort((a, b) => a.baseM - b.baseM)
      return sorted.every((l, i) => i === 0 || sorted[i - 1]!.baseM + sorted[i - 1]!.thicknessM <= l.baseM)
    }, { message: 'cloud layers overlap' }).optional(),
    /** Apparent solar time in decimal hours, 12 = the sun due south at its
     *  highest (Plan 16c). Optional; the renderer treats absent as 12. Content
     *  the RENDERER reads: `World` never sees it. */
    timeOfDay: finite.refine((t) => t >= 0 && t < 24, { message: 'timeOfDay must be in [0, 24)' }).optional(),
  }).strict(),
}).strict()
  .refine((s) => (s.enemyAirfields ?? []).every((e) => s.airfields.includes(e)), {
    message: 'every enemyAirfields entry must be one of airfields', path: ['enemyAirfields'],
  })

export type Scenario = z.infer<typeof ScenarioObject>

export const isShipParked = (p: Scenario['aircraft'][number]['parkedAt']): p is { ship: string; spot: { x: number; z: number } } => 'ship' in p

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

/**
 * The velocity of the air for a wind blowing FROM `windFromDeg` (true, 0 =
 * north, 90 = east) at `windMps`. Compass convention as `shipVelocity`:
 * +x east, +z south, north is -z. A wind FROM the north moves the air
 * TOWARD the south, +z.
 */
export function windVectorFrom(windFromDeg: number, windMps: number): Vec3 {
  const rad = (windFromDeg * Math.PI) / 180
  return v3(-Math.sin(rad) * windMps, 0, Math.cos(rad) * windMps)
}

function lookup<T>(table: Readonly<Record<string, T>>, key: string, kind: string): T {
  const v = table[key]
  if (v === undefined) throw new Error(`scenario refers to ${kind} "${key}", which is not in the bundle`)
  return v
}

/**
 * The initial `World`. Pure; `terrain` may be `null` (the browser has none
 * at boot) in which case the ship loops are not checked here -- the Tier 1
 * test does that against the real field on every commit.
 *
 * `loadout` seeds the PLAYER's stores only (spec §2.4: loadout is a title-
 * screen choice, not scenario content); every other aircraft -- a chocked
 * target, a wingman -- gets `emptyStores`, matching every call site's
 * behavior before this parameter existed. Defaults to `'clean'`, which is
 * `storesFromLoadout`'s zero-stores case, so an omitted third argument is
 * bit-identical to the pre-Task-7 hardcode it replaces.
 */
export function worldFromScenario(bundle: ScenarioBundle, terrain: TerrainField | null, loadout: Loadout = 'clean'): World<undefined> {
  const s = bundle.scenario
  const airfields = s.airfields.map((a) => lookup(bundle.airfields, a, 'airfield'))

  const ships: ShipEntity[] = s.ships.map((sh) => {
    const spec = lookup(bundle.shipSpecs, sh.spec, 'ship spec')
    const orders = { waypoints: sh.waypoints.map(([x, z]) => ({ x, z })), speedMps: sh.speedMps }
    if (terrain !== null) assertLoopOverWater(sh.id, orders, terrain)
    const first = orders.waypoints[0]!
    // A moving ship's heading comes from its first two waypoints, same as
    // always. An anchored ship (speedMps 0, Plan 6b's maru) may carry only
    // ONE waypoint -- the schema now allows it -- so there is no second
    // point to bear toward; heading 0 is an arbitrary but finite, stable
    // default, safe because `stepShip`'s own zero-speed pinning (Plan 6b
    // Task 1) never reads heading into a nonzero velocity for such a ship.
    const second = orders.waypoints[1] ?? first
    const state = createShipState({
      position: v3(first.x, SEA_LEVEL_M, first.z),
      headingRad: second === first ? 0 : bearingTo(first, second),
      speedMps: sh.speedMps,
      waypoint: 1,
    })
    return { id: sh.id, spec, state, previous: state, orders }
  })

  const aircraft: AircraftEntity<undefined>[] = s.aircraft.map((a) => {
    const spec = lookup(bundle.aircraftSpecs, a.spec, 'aircraft spec')
    const parkedAt = a.parkedAt
    if (isShipParked(parkedAt)) {
      const ship = ships.find((sh) => sh.id === parkedAt.ship)
      if (ship === undefined) throw new Error(`scenario parks "${a.id}" on ship "${parkedAt.ship}", which is not in the scenario`)
      const deck = deckOf(ship)
      if (deck === null) throw new Error(`scenario parks "${a.id}" on "${ship.id}", which has no flight deck`)
      const { x, z } = parkedAt.spot
      if (Math.abs(x) > deck.widthM / 2 || Math.abs(z) > deck.lengthM / 2) {
        throw new Error(`scenario parks "${a.id}" off the deck of "${ship.id}": spot (${x}, ${z}) on a ${deck.widthM} x ${deck.lengthM} m deck`)
      }
      const at = deckWorld(deck, x, z)
      const state = createState({
        position: v3(at.x, deck.center.y + spec.gear.heightM, at.z),
        velocity: groundUnder(null, [deck], at.x, at.z)!.velocity,
        attitude: qFromAxisAngle(v3(0, 1, 0), Math.PI / 2 - deck.headingRad),
        gearFraction: 1,
      })
      const controls: Controls = a.chocked ? { ...NEUTRAL, gearDown: true, brake: 1 } : NEUTRAL
      return { id: a.id, spec, state, previous: state, controls, assistMemory: undefined, impact: null, parked: true }
    }
    const field = lookup(bundle.airfields, parkedAt.airfield, 'airfield')
    const spot = parkedAt.spot === 'runwayCenter' ? { x: 0, z: 0 } : parkedAt.spot
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

  const wind = s.weather.windMps === 0 ? null : windVectorFrom(s.weather.windFromDeg, s.weather.windMps)
  const stores: Record<string, StoresState> = Object.fromEntries(
    aircraft.map((a) => [a.id, a.id === s.player ? storesFromLoadout(a.spec, loadout) : emptyStores]),
  )
  return createWorldOf({ aircraft, ships, player: s.player, airfields, terrain, wind, stores })
}
