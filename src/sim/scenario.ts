import { z } from 'zod'
import type { AircraftSpec } from './flight/schema.js'
import { createState, type Controls } from './flight/state.js'
import { createWorldOf, type AircraftEntity, type ShipEntity, type World } from './loop.js'
import { type Vec3, v3, ZERO } from './math/vec3.js'
import { type Airfield, localToWorld, parkedAttitude } from './world/airfields.js'
import { deckOf, deckWorld } from './world/deck.js'
import { groundUnder } from './world/ground.js'
import { qFromAxisAngle } from './math/quat.js'
import { assertLoopOverWater, bearingTo, createShipState, type ShipSpec } from './world/ships.js'
import { SEA_LEVEL_M, type TerrainField } from './world/terrain.js'
import { emptyStores, storesFromLoadout, type Loadout, type StoresState } from './weapons/stores.js'
import { GREEN_SKILL, VETERAN_SKILL } from './ai/pilot.js'
import type { PilotAssignment } from './ai/pursuit.js'
import { BadgeObject, ObjectiveObject, TriggerObject } from './mission/schema.js'

/**
 * A scenario says where everything starts (spec §7). It is the data contract
 * Plan 14's map and Plan 9's mission selector read. `weather` is Plan 8's
 * (steady wind only; see `windVectorFrom`), clouds (16a) and time of day
 * (16c). A scenario that declares `objectives` is a MISSION (missions
 * design 2026-09-25): its `triggers`, `heldGroups` and `badge` are that
 * spec's, validated here by `checkMission` and run by src/sim/mission/.
 * A scenario without objectives is exactly what it was before M1.
 */

const finite = z.number().refine(Number.isFinite, { message: 'must be a finite number' })
const id = z.string().min(1)
/** Mission group tags (spec 2026-09-25 §2.1). Never copied onto an entity:
 *  src/sim/mission/create.ts reads them from the scenario when the world
 *  is built, so every entity record keeps its exact pre-M1 shape. */
const tagList = z.array(id).min(1).optional()

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

const PilotObject = z.object({
  target: id,
  skill: z.enum(['veteran', 'green']).default('green'),
}).strict()

/** Maps a parsed scenario's `pilot` content to a runtime `PilotAssignment`,
 *  seeding the initial decision state -- every already-shipped scenario
 *  omits `skill`, so the `'green'` default reproduces its exact behavior. */
function pilotAssignmentFrom(pilot: z.infer<typeof PilotObject> | undefined): PilotAssignment | null {
  if (pilot === undefined) return null
  return {
    target: pilot.target,
    skill: pilot.skill === 'veteran' ? VETERAN_SKILL : GREEN_SKILL,
    decision: {
      maneuver: 'pursue',
      nextRescoreS: 0,
      // Immediately overwritten at the first rescore (nextRescoreS: 0
      // guarantees tick 1 triggers one) -- a fixed, knowable seed, same
      // convention as nextRescoreS's own starting value.
      observedTargetPosition: ZERO,
      observedTargetVelocity: ZERO,
      noiseCursor: 0,
    },
  }
}

const ParkedAtObject = z.union([
  z.object({
    airfield: id,
    /** `'runwayCenter'`, or a runway-local spot (meters, `x` across, `z` along). */
    spot: z.union([z.literal('runwayCenter'), z.object({ x: finite, z: finite }).strict()]),
  }).strict(),
  /** On a carrier's flight deck, in deck-local meters from the center. */
  z.object({ ship: id, spot: z.object({ x: finite, z: finite }).strict() }).strict(),
])
const ParkedAircraftObject = z.object({
  id,
  spec: id,
  parkedAt: ParkedAtObject,
  /** Wheel chocks: `brake: 1` in the held controls. */
  chocked: z.boolean(),
  tags: tagList,
  pilot: PilotObject.optional(),
}).strict()
const AirborneAircraftObject = z.object({
  id,
  spec: id,
  airborneAt: z.object({
    /** World meters, `[x, y, z]`; altitude must start above sea level. */
    position: z.tuple([finite, finite, finite]).refine((p) => p[1] > 0, {
      message: 'airborne altitude must be greater than zero',
    }),
    /** True compass heading: 0 north (-Z), 90 east (+X). */
    headingDeg: finite,
    speedMps: finite.refine((n) => n > 0, { message: 'speedMps must be greater than zero' }),
    /** The throttle lever at spawn, 0 to 1. Absent means
     *  `AIRBORNE_SPAWN_THROTTLE`. */
    throttle: z.number().finite().min(0).max(1).optional(),
  }).strict(),
  tags: tagList,
  pilot: PilotObject.optional(),
}).strict()
const ScenarioAircraftObject = z.union([ParkedAircraftObject, AirborneAircraftObject])

/** A ship on a closed waypoint loop, OR -- when `speedMps` is 0 -- a single
 *  anchored point (Plan 6b's maru): the loop-closing second waypoint has no
 *  meaning for a ship that never moves, so only a moving ship needs two. */
const ScenarioShipObject = z.object({
  id,
  spec: id,
  waypoints: z.array(z.tuple([finite, finite])).min(1),
  speedMps: finite,
  tags: tagList,
}).strict().refine((s) => s.speedMps === 0 || s.waypoints.length >= 2, {
  message: 'waypoints must have at least 2 entries unless speedMps is 0', path: ['waypoints'],
})

/** Entities not placed at start (spec §2.3); a trigger's `spawn` brings the
 *  group in mid-flight through `spawnHeldGroup`. Same entity schema as the
 *  scenario's own lists; `checkMission` requires held aircraft to start
 *  airborne (plan ruling R3). */
const HeldGroupObject = z.object({
  id,
  aircraft: z.array(ScenarioAircraftObject).optional(),
  ships: z.array(ScenarioShipObject).optional(),
}).strict().refine((g) => (g.aircraft?.length ?? 0) + (g.ships?.length ?? 0) > 0, {
  message: 'a held group must hold at least one aircraft or ship',
})

const ScenarioShape = z.object({
  id,
  player: id,
  airfields: z.array(id).min(1),
  /** Legitimate strike targets (Plan 6b, spec §2.4): which of `airfields`'
   *  structures count toward the `RAZED` counter. Absent means none do --
   *  matching every scenario shipped before this field existed. */
  enemyAirfields: z.array(id).optional(),
  aircraft: z.array(ScenarioAircraftObject).min(1),
  ships: z.array(ScenarioShipObject),
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
  /** Missions (spec 2026-09-25 §2). Present together or not at all:
   *  `checkMission` rejects triggers, held groups or a badge without
   *  objectives. */
  objectives: z.array(ObjectiveObject).min(1).optional(),
  triggers: z.array(TriggerObject).min(1).optional(),
  heldGroups: z.array(HeldGroupObject).min(1).optional(),
  badge: BadgeObject.optional(),
}).strict()

const ScenarioObject = ScenarioShape
  .refine((s) => (s.enemyAirfields ?? []).every((e) => s.airfields.includes(e)), {
    message: 'every enemyAirfields entry must be one of airfields', path: ['enemyAirfields'],
  })
  .superRefine((s, ctx) => {
    const aircraftIds = new Set(s.aircraft.map((a) => a.id))
    for (const [index, aircraft] of s.aircraft.entries()) {
      if (aircraft.pilot === undefined) continue
      if (aircraft.pilot.target === aircraft.id) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'pilot cannot target itself', path: ['aircraft', index, 'pilot', 'target'] })
      } else if (!aircraftIds.has(aircraft.pilot.target)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'pilot target must name an aircraft in this scenario', path: ['aircraft', index, 'pilot', 'target'] })
      }
    }
  })
  .superRefine(checkMission)

export type Scenario = z.infer<typeof ScenarioObject>

export type ScenarioAircraft = z.infer<typeof ScenarioAircraftObject>
export type ParkedScenarioAircraft = z.infer<typeof ParkedAircraftObject>

export const isParkedAircraft = (a: ScenarioAircraft): a is ParkedScenarioAircraft =>
  'parkedAt' in a

export const isShipParked = (p: ParkedScenarioAircraft['parkedAt']): p is { ship: string; spot: { x: number; z: number } } => 'ship' in p

export type ScenarioShip = z.infer<typeof ScenarioShipObject>
export type ScenarioHeldGroup = z.infer<typeof HeldGroupObject>

/**
 * Every mission reference checkable from the file alone (spec 2026-09-25
 * §2; plan rulings R3, R8, R11). Ids and tags that name ENTITIES are
 * resolved later, by src/sim/mission/create.ts, when the airfields'
 * buildings are in hand (ruling R4).
 */
function checkMission(s: z.infer<typeof ScenarioShape>, ctx: z.RefinementCtx): void {
  const issue = (message: string, path: (string | number)[]): void => {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message, path })
  }
  if (s.objectives === undefined) {
    if (s.triggers !== undefined) issue('triggers need objectives: a scenario without objectives is not a mission', ['triggers'])
    if (s.heldGroups !== undefined) issue('heldGroups need objectives: a scenario without objectives is not a mission', ['heldGroups'])
    if (s.badge !== undefined) issue('badge needs objectives: a scenario without objectives is not a mission', ['badge'])
    return
  }
  const objectives = s.objectives
  const triggers = s.triggers ?? []
  const held = s.heldGroups ?? []
  const dupes = (ids: readonly string[], what: string, key: string): void => {
    ids.forEach((x, i) => { if (ids.indexOf(x) !== i) issue(`duplicate ${what} id "${x}"`, [key, i, 'id']) })
  }
  dupes(objectives.map((o) => o.id), 'objective', 'objectives')
  dupes(triggers.map((t) => t.id), 'trigger', 'triggers')
  dupes(held.map((g) => g.id), 'held group', 'heldGroups')

  const startAircraft = new Set(s.aircraft.map((a) => a.id))
  const startShips = new Set(s.ships.map((sh) => sh.id))
  const used = new Set([...startAircraft, ...startShips])
  for (const [gi, g] of held.entries()) {
    const groupAircraft = new Set((g.aircraft ?? []).map((a) => a.id))
    for (const [ai, a] of (g.aircraft ?? []).entries()) {
      const path = ['heldGroups', gi, 'aircraft', ai]
      if (used.has(a.id)) issue(`entity id "${a.id}" is already used; ids are unique across the whole scenario`, [...path, 'id'])
      used.add(a.id)
      if (isParkedAircraft(a)) issue('a held aircraft must start airborne (airborneAt), plan ruling R3', [...path, 'parkedAt'])
      const target = a.pilot?.target
      if (target !== undefined && (target === a.id || (!startAircraft.has(target) && !groupAircraft.has(target)))) {
        issue('a held pilot must target a starting aircraft or one in its own group', [...path, 'pilot', 'target'])
      }
    }
    for (const [si, sh] of (g.ships ?? []).entries()) {
      if (used.has(sh.id)) issue(`entity id "${sh.id}" is already used; ids are unique across the whole scenario`, ['heldGroups', gi, 'ships', si, 'id'])
      used.add(sh.id)
    }
  }

  const player = s.aircraft.find((a) => a.id === s.player)
  const playerStart = player !== undefined && isParkedAircraft(player)
    ? (isShipParked(player.parkedAt) ? player.parkedAt.ship : player.parkedAt.airfield)
    : null
  objectives.forEach((o, i) => {
    const path = ['objectives', i]
    if (o.after !== undefined && !objectives.slice(0, i).some((x) => x.id === o.after)) {
      issue(`after must name an earlier objective; "${o.after}" is not one`, [...path, 'after'])
    }
    if (o.kind === 'takeoff' && o.from !== playerStart) {
      issue(`takeoff.from must be where the player starts (${playerStart ?? 'airborne'}), not "${o.from}"`, [...path, 'from'])
    }
    if (o.kind === 'land' && !s.airfields.includes(o.at) && !startShips.has(o.at)) {
      issue(`land.at "${o.at}" is neither one of airfields nor a starting ship`, [...path, 'at'])
    }
    if (o.kind === 'deny' && typeof o.around === 'string' && !startAircraft.has(o.around) && !startShips.has(o.around)) {
      issue(`deny.around "${o.around}" is not a starting aircraft or ship`, [...path, 'around'])
    }
  })

  const byId = new Map(objectives.map((o) => [o.id, o]))
  const spawnCount = new Map(held.map((g) => [g.id, 0]))
  triggers.forEach((t, i) => {
    const path = ['triggers', i]
    if ('completed' in t.when && !byId.has(t.when.completed)) {
      issue(`when.completed names "${t.when.completed}", which is not an objective`, [...path, 'when', 'completed'])
    }
    if ('failed' in t.when) {
      const o = byId.get(t.when.failed)
      if (o === undefined) issue(`when.failed names "${t.when.failed}", which is not an objective`, [...path, 'when', 'failed'])
      else if (o.kind !== 'protect' && o.kind !== 'deny') issue(`when.failed names "${o.id}", a ${o.kind} objective, which can never fail`, [...path, 'when', 'failed'])
    }
    t.then.forEach((a, ai) => {
      if (!('spawn' in a)) return
      const n = spawnCount.get(a.spawn)
      if (n === undefined) issue(`spawn names "${a.spawn}", which is not a held group`, [...path, 'then', ai, 'spawn'])
      else spawnCount.set(a.spawn, n + 1)
    })
  })
  held.forEach((g, gi) => {
    const n = spawnCount.get(g.id) ?? 0
    if (n !== 1) issue(`held group "${g.id}" is spawned by ${n} trigger actions; it must be exactly one`, ['heldGroups', gi, 'id'])
  })
}

/** Every aircraft spec a scenario can put in the world, held groups
 *  included: both loaders (tools/content/load.ts and its browser twin
 *  src/render/scenarioLoad.ts) fetch exactly these. */
export const scenarioAircraftSpecIds = (s: Scenario): string[] =>
  [...s.aircraft, ...(s.heldGroups ?? []).flatMap((g) => g.aircraft ?? [])].map((a) => a.spec)

/** The ship twin of `scenarioAircraftSpecIds`. */
export const scenarioShipSpecIds = (s: Scenario): string[] =>
  [...s.ships, ...(s.heldGroups ?? []).flatMap((g) => g.ships ?? [])].map((sh) => sh.spec)

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
 * The throttle an airborne spawn starts at when its scenario does not say
 * (2026-09-25). 0.7 is the setting that holds an F6F's 120 m/s at 3,000 m
 * hands-off -- measured through production `nextFrameState`: 120.0 -> 120.3
 * m/s over 30 s, against 98.6 m/s after 10 s at the old 0 and 141.9 m/s after
 * 30 s at full throttle. A constant rather than a per-spec value because the
 * aircraft specs carry no cruise setting; `scenario.test.ts` re-measures the
 * hold, so a flight-model change that moves it fails there.
 *
 * Before this, an airborne spawn inherited the parked airplane's NEUTRAL
 * controls -- throttle 0 -- by reuse, not by any ruling (commit 732ea9d), and
 * the player bled speed from the first frame while the pursuer closed.
 */
export const AIRBORNE_SPAWN_THROTTLE = 0.7

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
    if (!isParkedAircraft(a)) {
      const [x, y, z] = a.airborneAt.position
      const headingRad = a.airborneAt.headingDeg * Math.PI / 180
      const state = createState({
        position: v3(x, y, z),
        velocity: v3(
          Math.sin(headingRad) * a.airborneAt.speedMps,
          0,
          -Math.cos(headingRad) * a.airborneAt.speedMps,
        ),
        attitude: qFromAxisAngle(v3(0, 1, 0), Math.PI / 2 - headingRad),
      })
      return {
        id: a.id, spec, state, previous: state,
        controls: { ...NEUTRAL, throttle: a.airborneAt.throttle ?? AIRBORNE_SPAWN_THROTTLE },
        assistMemory: undefined, impact: null, parked: false, pilot: pilotAssignmentFrom(a.pilot),
      }
    }
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
      return { id: a.id, spec, state, previous: state, controls, assistMemory: undefined, impact: null, parked: true, pilot: pilotAssignmentFrom(a.pilot) }
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
    return { id: a.id, spec, state, previous: state, controls, assistMemory: undefined, impact: null, parked: true, pilot: pilotAssignmentFrom(a.pilot) }
  })

  const wind = s.weather.windMps === 0 ? null : windVectorFrom(s.weather.windFromDeg, s.weather.windMps)
  const stores: Record<string, StoresState> = Object.fromEntries(
    aircraft.map((a) => [a.id, a.id === s.player ? storesFromLoadout(a.spec, loadout) : emptyStores]),
  )
  return createWorldOf({ aircraft, ships, player: s.player, airfields, terrain, wind, stores, enemyAirfields: s.enemyAirfields })
}
