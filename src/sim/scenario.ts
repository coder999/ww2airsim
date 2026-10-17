import { z } from 'zod'
import type { AircraftSpec } from './flight/schema.js'
import { createState, type Controls } from './flight/state.js'
import { createWorldOf, type AircraftEntity, type ShipEntity, type World } from './loop.js'
import { type Vec3, v3 } from './math/vec3.js'
import { type Airfield, localToWorld, parkedAttitude, runwayHeadingRad } from './world/airfields.js'
import { deckOf } from './world/deck.js'
import { restPitchRad } from './gearContact.js'
import { deckParkSpots, runwayParkSpots } from './ai/parkSpots.js'
import { armedForAttack } from './ai/attack.js'
import { qFromAxisAngle, qMul } from './math/quat.js'
import { assertLoopOverWater, bearingTo, createShipState, type ShipSpec } from './world/ships.js'
import { SEA_LEVEL_M, type TerrainField } from './world/terrain.js'
import { emptyStores, storesFromLoadout, type Loadout, type StoresState } from './weapons/stores.js'
import { GREEN_SKILL, VETERAN_SKILL, initialDecision, type IngressDestination, type IngressOrders, type RecoveryHome } from './ai/pilot.js'
import { airfieldSideOf, sideOf, type Side } from './sides.js'
import { checkScenarioSides } from './sidesCheck.js'
import type { PilotAssignment } from './ai/pursuit.js'
import { BadgeObject, BriefingObject, FieldRuleObject, HistoryObject, LoadoutObject, ObjectiveObject, TriggerObject, innerBelowOuter, innerMessage, planeStateIsEmpty } from './mission/schema.js'
import { createMission, type Taggable } from './mission/create.js'
import type { HeldGroup, MissionState } from './mission/state.js'
import { stateOnDeck } from './mission/respot.js'
import { initialMainBattery } from './weapons/mainBattery.js'
import { createVehicleState, type VehicleEntity, type VehicleSpec } from './world/vehicles.js'
import { LightsSchema } from './lights/lights.js'
import { waterSurfaceAt, waterSurfaceContext, type WaterSurfaceContext } from './waterSurface.js'

/** The mission schema's loadout enum and the weapons module's `Loadout` type
 *  must name the same four values; a mismatch here is a compile error. */
const _loadouts: z.infer<typeof LoadoutObject> extends Loadout ? (Loadout extends z.infer<typeof LoadoutObject> ? true : never) : never = true
void _loadouts

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

const positive = finite.refine((n) => n > 0, { message: 'must be greater than zero' })

/** 7e spec §4.5: the ingress pilot's orders. Each waypoint carries the
 *  altitude and speed of the leg flown TO it. */
const IngressObject = z.object({
  route: z.array(z.object({ x: finite, z: finite, altitudeM: positive, speedMps: positive }).strict()).min(1),
  /** An airfield destination is its runway center, or with `aim` (Escort plan, 2026-10-10) the middle of the
   *  airfield's buildings with that id or tag, so a level-bombing formation can be sent at its hangars. */
  destination: z.union([z.object({ ship: id }).strict(), z.object({ airfield: id, aim: id.optional() }).strict()]).optional(),
  /** E2: what the raider does on arrival at its destination: a dive-bombing, torpedo or level-bombing
   *  run on it (the airplane is armed with its full racks). Absent: orbit it, as every raider before E2. */
  attack: z.enum(['dive-bomb', 'torpedo', 'level-bomb']).optional(),
}).strict().refine((i) => i.attack === undefined || i.destination !== undefined, {
  message: 'attack needs a destination: a ship or an airfield to attack', path: ['attack'],
})

const PilotObject = z.object({
  /** A static target (7a/7b). Absent: the pilot chooses (7e spec §4.2). */
  target: id.optional(),
  skill: z.enum(['veteran', 'green']).default('green'),
  ingress: IngressObject.optional(),
  /** 7f spec §1: a same-side aircraft to fly formation on; the player may lead. */
  leader: id.optional(),
  slot: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  /** 7g: where this pilot recovers (spec §7). May accompany `leader`/`slot`
   *  (a wingman has a home) and `ingress` (a raider may have a home). */
  home: z.union([z.object({ airfield: id }).strict(), z.object({ ship: id }).strict()]).optional(),
  /** 7h: a parked aircraft that takes off under its own pilot (needs an
   *  airfield `parkedAt`, not chocked). */
  takeoff: z.literal(true).optional(),
  /** A sitting duck (Range Test): loiters in a circle of this radius and never
   *  engages, evades or fires. Excludes every other order. */
  passive: z.object({ orbitRadiusM: positive }).strict().optional(),
}).strict().refine((p) => p.target === undefined || p.ingress === undefined, {
  message: "ingress excludes target: a raider's target is chosen, never fixed", path: ['ingress'],
}).refine((p) => p.leader === undefined || (p.target === undefined && p.ingress === undefined), {
  message: 'leader excludes target and ingress: a wingman goes where its leader goes', path: ['leader'],
}).refine((p) => (p.leader === undefined) === (p.slot === undefined), {
  message: 'leader and slot go together', path: ['slot'],
}).refine((p) => p.takeoff === undefined || p.leader === undefined, {
  message: "takeoff excludes leader: a wingman flies its leader's formation", path: ['takeoff'],
}).refine((p) => p.passive === undefined || (p.target === undefined && p.ingress === undefined && p.leader === undefined && p.home === undefined && p.takeoff === undefined), {
  message: 'passive excludes target, ingress, leader, home and takeoff: a sitting duck takes no orders', path: ['passive'],
})

/** Plan 7e (spec §4.1). Absent: the player is allied, every other aircraft
 *  axis (`sideOf`, src/sim/sides.ts). */
const SideField = z.enum(['allied', 'axis']).optional()

/** Maps a parsed scenario's `pilot` content to a runtime `PilotAssignment`,
 *  seeding the initial decision state -- every already-shipped scenario
 *  omits `skill`, so the `'green'` default reproduces its exact behavior. */
function pilotAssignmentFrom(
  id: string, pilot: z.infer<typeof PilotObject> | undefined, airfields: Readonly<Record<string, Airfield>>,
  homes: ReadonlyMap<string, RecoveryHome>, airfieldSides?: Readonly<Record<string, Side>>,
): PilotAssignment | null {
  if (pilot === undefined) return null
  const ingress = pilot.ingress === undefined ? {} : { ingress: ingressOrdersFrom(pilot.ingress, airfields, airfieldSides) }
  const orders = pilot.leader === undefined || pilot.slot === undefined ? undefined : { leader: pilot.leader, slot: pilot.slot }
  const mode = pilot.takeoff === true ? 'takeoff'
    : orders !== undefined ? 'formation' : pilot.ingress === undefined ? 'engage' : 'ingress'
  const home = homes.get(id)
  return {
    target: pilot.target ?? null,
    ...ingress,
    ...(orders === undefined ? {} : { formation: orders }),
    ...(home === undefined ? {} : { home }),
    ...(pilot.passive === undefined ? {} : { passive: { orbitRadiusM: pilot.passive.orbitRadiusM } }),
    skill: pilot.skill === 'veteran' ? VETERAN_SKILL : GREEN_SKILL,
    // Immediately overwritten at the first rescore (nextRescoreS: 0
    // guarantees tick 1 triggers one). The noise cursor is seeded from the
    // entity id (7e spec §4.5 item 2), not a shared constant.
    decision: pilot.takeoff === true
      ? { ...initialDecision(id, mode), takeoff: { phase: 'wait', sinceS: 0, headingRad: null, pitchIntegral: 0 } }
      : initialDecision(id, mode),
  }
}

/** An airfield destination is fixed, so it is resolved here to its runway
 *  center; a ship is read live every tick by the pilot (ruling W6). */
function ingressOrdersFrom(i: z.infer<typeof IngressObject>, airfields: Readonly<Record<string, Airfield>>, airfieldSides?: Readonly<Record<string, Side>>): IngressOrders {
  const d = i.destination
  const destination: IngressDestination | null = d === undefined
    ? null
    : 'ship' in d
      ? { kind: 'ship', id: d.ship }
      : {
          kind: 'point', ...airfieldAim(lookup(airfields, d.airfield, 'airfield'), d.aim),
          // E2: an attacker must know whose strip it is, so it never bombs its own. Present only on an attacker's orders.
          ...(i.attack === undefined ? {} : { side: airfieldSideOf(lookup(airfields, d.airfield, 'airfield'), airfieldSides) }),
        }
  return { route: i.route, destination, ...(i.attack === undefined ? {} : { attack: i.attack }) }
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
  side: SideField,
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
  side: SideField,
  pilot: PilotObject.optional(),
}).strict()
const AfloatAircraftObject = z.object({
  id,
  spec: id,
  afloatAt: z.object({
    /** Open-water world meters, `[x, z]`; the shared support sea supplies y. */
    position: z.tuple([finite, finite]),
    /** True compass heading: 0 north (-Z), 90 east (+X). */
    headingDeg: finite,
  }).strict(),
  tags: tagList,
  side: SideField,
  pilot: PilotObject.optional(),
}).strict()
const ScenarioAircraftObject = z.union([ParkedAircraftObject, AirborneAircraftObject, AfloatAircraftObject])

/** A ship on a closed waypoint loop, OR -- when `speedMps` is 0 -- a single
 *  anchored point (Plan 6b's maru): the loop-closing second waypoint has no
 *  meaning for a ship that never moves, so only a moving ship needs two. */
const ScenarioShipObject = z.object({
  id,
  spec: id,
  waypoints: z.array(z.tuple([finite, finite])).min(1),
  speedMps: finite,
  tags: tagList,
  /** Friendly fire (spec 2026-09-26 §2): absent means axis, through
   *  `sideOf`, the same default 7e gave every aircraft but the player. */
  side: SideField,
  /** M4: what its main batteries engage first (`ShipOrders.fireAt`). */
  fireAt: z.array(id).min(1).optional(),
  /** A range hulk: ordnance still contacts and detonates, but cannot alter
   *  hull damage, flooding or sinking state. Scenario-local by design. */
  practiceTarget: z.boolean().optional(),
}).strict().refine((s) => s.speedMps === 0 || s.waypoints.length >= 2, {
  message: 'waypoints must have at least 2 entries unless speedMps is 0', path: ['waypoints'],
})

const ScenarioVehicleObject = z.object({
  id,
  spec: id,
  waypoints: z.array(z.tuple([finite, finite])).min(1),
  speedMps: finite.refine((n) => n >= 0, { message: 'speedMps must not be negative' }),
  loop: z.boolean().default(false),
  /** Optional authored heading, chiefly for a one-point stationary route. */
  headingDeg: finite.optional(),
  /** Optional scenario durability override; the vehicle spec remains the default. */
  hp: positive.optional(),
  tags: tagList,
  side: SideField,
}).strict().refine((v) => v.speedMps === 0 || v.waypoints.length >= 2, {
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
  vehicles: z.array(ScenarioVehicleObject).optional(),
}).strict().refine((g) => (g.aircraft?.length ?? 0) + (g.ships?.length ?? 0) + (g.vehicles?.length ?? 0) > 0, {
  message: 'a held group must hold at least one aircraft, ship or vehicle',
})

const ScenarioShape = z.object({
  id,
  player: id,
  airfields: z.array(id).min(1),
  /** F8: canonical site ids (`content/sites/<id>.json`). A loader merges each site's chosen window (airfield, vehicles, parked
   *  aircraft, lights) into this scenario before the world is built (`expandScenario`, src/sim/world/sites.ts); absent means none. */
  sites: z.array(id).min(1).optional(),
  /** Legitimate strike targets (Plan 6b, spec §2.4): which of `airfields`'
   *  structures count toward the `RAZED` counter. Absent means none do --
   *  matching every scenario shipped before this field existed. */
  enemyAirfields: z.array(id).optional(),
  /** Per-scenario override of an airfield's side (friendly-fire spec §2,
   *  ruling FF-1): a mission can fly from a field its base content calls
   *  axis. Absent keeps each base's own `side`. */
  airfieldSides: z.record(id, z.enum(['allied', 'axis'])).optional(),
  /** F5C (2026-10-16): friendly stretches of water a seaplane may stop on and relaunch from (D2, D8); world
   *  metres, the player's side by definition. The smallest per-scenario data until F8's canonical base data
   *  replaces it (docs/campaign-data.md, "Legs"). Absent means none. */
  anchorages: z.array(z.object({
    id, name: z.string().min(1), position: z.tuple([finite, finite]), radiusM: positive,
  }).strict()).optional(),
  aircraft: z.array(ScenarioAircraftObject).min(1),
  ships: z.array(ScenarioShipObject),
  vehicles: z.array(ScenarioVehicleObject).default([]),
  /** M4: warships' main batteries fire at hostile ships and batteries in reach. Absent: they lay
   *  (M3) but hold fire, as every scenario before M4 (ruling R1 of the M4 plan). */
  mainBatteries: z.boolean().optional(),
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
  /** Night lights (F6A, docs/night.md): content the RENDERER and F6B read through
   *  `lightsAt`; `World` never carries them, so the checksum cannot see them. Absent means none. */
  lights: LightsSchema.optional(),
  /** Missions (spec 2026-09-25 §2). Present together or not at all:
   *  `checkMission` rejects triggers, held groups or a badge without
   *  objectives. `briefing` and `history` are display-only (M2); `World`
   *  never sees them. */
  objectives: z.array(ObjectiveObject).min(1).optional(),
  triggers: z.array(TriggerObject).min(1).optional(),
  /** F10-0: serviceability derived from a field's own structures (`FieldRuleObject`). */
  fieldRules: z.array(FieldRuleObject).min(1).optional(),
  /** F10-0 (Mark, 2026-10-17): the mission ends at a gate, not on a runway. `objective` names the `reach` objective whose completion is the egress; a
   *  badge then needs every primary complete and that crossing, and a landing at a friendly base is NOT a success (J2, J4, J5). */
  /** F10-0 (Mark, 2026-10-17, Decision 13): after the landing that completes the mission, the script freezes (no new waves, objective changes or
   *  triggers); a Continue Sortie is then a free sortie. A landing that does not qualify leaves the script running. Chapters set it; a pooled mission without it keeps today's behavior. */
  freezeOnSuccess: z.boolean().optional(),
  recovery: z.object({ kind: z.literal('egress'), objective: z.string().min(1) }).strict().optional(),
  /** F10-0: simultaneous maxima the scenario promises (F3 section 2: the finales are 24 airborne, 10 ships, 16 in the close set). Checked at load against
   *  the start entities plus the worst case of the held groups: a group admitted by another's `when.gone` never overlaps it. `close` counts aircraft
   *  tagged `close`. */
  population: z.object({ airborne: z.number().int().positive(), ships: z.number().int().nonnegative(), close: z.number().int().nonnegative().optional() }).strict().optional(),
  heldGroups: z.array(HeldGroupObject).min(1).optional(),
  badge: BadgeObject.optional(),
  briefing: BriefingObject.optional(),
  history: HistoryObject.optional(),
}).strict()

type AnyAircraft = z.infer<typeof ScenarioAircraftObject>

/**
 * 7f spec §1: every leader rule, reported by name, for the starting aircraft
 * and every held group. A starting pilot may name a starting aircraft as
 * leader; a held pilot, a starting aircraft or one in its own group. A slot
 * is "unique among that leader's wingmen" across the whole scenario, so one
 * `taken` set spans the starting list and every held group: a starting and a
 * held wingman of the same leader cannot share a slot, nor can two held
 * groups' (final review I2, 2026-09-27). An entry already rejected for its
 * leader (self, unknown, cross-side, chain) takes no slot, so it cannot
 * cause a second, spurious "taken".
 */
function checkFormations(s: z.infer<typeof ScenarioShape>, ctx: z.RefinementCtx): void {
  const issue = (message: string, path: (string | number)[]): void => {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message, path })
  }
  const taken = new Set<string>()
  checkLeaders(s, s.aircraft.map((a, i) => [a, ['aircraft', i]] as const), new Map(s.aircraft.map((a) => [a.id, a])),
    'pilot leader must name a starting aircraft', issue, taken)
  for (const [gi, g] of (s.heldGroups ?? []).entries()) {
    const visible = new Map([...s.aircraft, ...(g.aircraft ?? [])].map((a) => [a.id, a]))
    checkLeaders(s, (g.aircraft ?? []).map((a, ai) => [a, ['heldGroups', gi, 'aircraft', ai]] as const), visible,
      "a held pilot's leader must be a starting aircraft or one in its own group", issue, taken)
  }
}

/** One list's leader rules. `visible` is what this list's pilots may name
 *  as leader; `at` locates each entry; `taken` is `checkFormations`'
 *  scenario-wide slot set, added to here. */
function checkLeaders(
  s: z.infer<typeof ScenarioShape>, list: readonly (readonly [AnyAircraft, (string | number)[]])[],
  visible: ReadonlyMap<string, AnyAircraft>, unknownMessage: string,
  issue: (message: string, path: (string | number)[]) => void, taken: Set<string>,
): void {
  for (const [a, at] of list) {
    const leader = a.pilot?.leader
    if (leader === undefined) continue
    const path = [...at, 'pilot', 'leader']
    const named = visible.get(leader)
    const invalid = leader === a.id ? 'a pilot cannot lead itself'
      : named === undefined ? unknownMessage
      : sideOf(s, named) !== sideOf(s, a) ? 'pilot leader must be on the same side'
      : named.pilot?.leader !== undefined ? `leader "${leader}" cannot itself be a wingman: no chains`
      : null
    if (invalid !== null) {
      issue(invalid, path)
      continue
    }
    const key = `${leader}#${a.pilot!.slot}`
    if (taken.has(key)) issue(`slot ${a.pilot!.slot} of leader "${leader}" is taken`, [...at, 'pilot', 'slot'])
    taken.add(key)
  }
}

/** 7h: what a `pilot.takeoff` aircraft must be. Start and held aircraft
 *  alike; held ship parks get R3's message from `checkMission`. */
function checkTakeoff(s: z.infer<typeof ScenarioShape>, ctx: z.RefinementCtx): void {
  const all = [...s.aircraft.map((a, i) => [a, ['aircraft', i]] as const),
    ...(s.heldGroups ?? []).flatMap((g, gi) => (g.aircraft ?? []).map((a, i) => [a, ['heldGroups', gi, 'aircraft', i]] as const))]
  for (const [a, at] of all) {
    if (a.pilot?.takeoff !== true) continue
    if (!isParkedAircraft(a) || isShipParked(a.parkedAt)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'takeoff needs a parkedAt airfield', path: [...at, 'pilot', 'takeoff'] })
    } else if (a.chocked) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'a takeoff pilot cannot be chocked', path: [...at, 'chocked'] })
    }
  }
}

const ScenarioObject = ScenarioShape
  .refine((s) => (s.enemyAirfields ?? []).every((e) => s.airfields.includes(e)), {
    message: 'every enemyAirfields entry must be one of airfields', path: ['enemyAirfields'],
  })
  .refine((s) => Object.keys(s.airfieldSides ?? {}).every((a) => s.airfields.includes(a)), {
    message: 'every airfieldSides key must be one of airfields', path: ['airfieldSides'],
  })
  .superRefine((s, ctx) => {
    const ids = [...s.aircraft, ...s.ships, ...(s.vehicles ?? [])].map((e) => e.id)
    ids.forEach((entityId, index) => {
      if (ids.indexOf(entityId) !== index) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `entity id "${entityId}" is already used; ids are unique across the whole scenario`, path: [] })
      }
    })
    const heldShips = (s.heldGroups ?? []).flatMap((g) => g.ships ?? []).map((e) => e.id)
    const heldAircraft = (s.heldGroups ?? []).flatMap((g) => g.aircraft ?? []).map((e) => e.id)
    for (const [index, light] of (s.lights ?? []).entries()) {
      const shipId = 'ship' in light.at ? light.at.ship : null
      const planeId = 'aircraft' in light.at ? light.at.aircraft : null
      if (shipId !== null && ![...s.ships.map((e) => e.id), ...heldShips].includes(shipId)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `light "${light.id}" names unknown ship "${shipId}"`, path: ['lights', index] })
      }
      if (planeId !== null && ![...s.aircraft.map((e) => e.id), ...heldAircraft].includes(planeId)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `light "${light.id}" names unknown aircraft "${planeId}"`, path: ['lights', index] })
      }
    }
    const byId = new Map(s.aircraft.map((a) => [a.id, a]))
    for (const [index, aircraft] of s.aircraft.entries()) {
      const target = aircraft.pilot?.target
      if (target === undefined) continue
      const path = ['aircraft', index, 'pilot', 'target']
      const named = byId.get(target)
      if (target === aircraft.id) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'pilot cannot target itself', path })
      } else if (named === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'pilot target must name an aircraft in this scenario', path })
      } else if (sideOf(s, named) === sideOf(s, aircraft)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'pilot target must be on the opposite side', path })
      }
    }
    // 7e spec §4.5: an ingress destination names a starting ship or one of
    // the scenario's airfields (ruling W6).
    const all = [...s.aircraft.map((a, i) => [a, ['aircraft', i]] as const),
      ...(s.heldGroups ?? []).flatMap((g, gi) => (g.aircraft ?? []).map((a, i) => [a, ['heldGroups', gi, 'aircraft', i]] as const))]
    for (const [a, at] of all) {
      const d = a.pilot?.ingress?.destination
      if (d === undefined) continue
      const path = [...at, 'pilot', 'ingress', 'destination']
      if ('ship' in d && !s.ships.some((sh) => sh.id === d.ship)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `ingress destination ship "${d.ship}" is not a starting ship`, path })
      }
      if ('airfield' in d && !s.airfields.includes(d.airfield)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `ingress destination airfield "${d.airfield}" is not one of airfields`, path })
      }
    }
    // 7g spec §7: a pilot's home names a scenario airfield or a starting
    // ship -- a held ship is not one, same as ingress's own destination
    // check above. The "no flight deck" and park-count rules need ship
    // specs and airfield records the schema does not have; those are
    // checked in worldFromScenario's checkHomes.
    for (const [a, at] of all) {
      const home = a.pilot?.home
      if (home === undefined) continue
      const path = [...at, 'pilot', 'home']
      if ('ship' in home && !s.ships.some((sh) => sh.id === home.ship)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `home ship "${home.ship}" is not a starting ship`, path })
      }
      if ('airfield' in home && !s.airfields.includes(home.airfield)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `home airfield "${home.airfield}" is not one of airfields`, path })
      }
    }
  })
  .superRefine(checkFormations)
  .superRefine(checkTakeoff)
  .superRefine(checkMission)

export type Scenario = z.infer<typeof ScenarioObject>

export type ScenarioAircraft = z.infer<typeof ScenarioAircraftObject>
export type ParkedScenarioAircraft = z.infer<typeof ParkedAircraftObject>
export type AfloatScenarioAircraft = z.infer<typeof AfloatAircraftObject>

export const isParkedAircraft = (a: ScenarioAircraft): a is ParkedScenarioAircraft =>
  'parkedAt' in a

export const isAfloatAircraft = (a: ScenarioAircraft): a is AfloatScenarioAircraft =>
  'afloatAt' in a

export const isShipParked = (p: ParkedScenarioAircraft['parkedAt']): p is { ship: string; spot: { x: number; z: number } } => 'ship' in p

export type ScenarioShip = z.infer<typeof ScenarioShipObject>
export type ScenarioVehicle = z.infer<typeof ScenarioVehicleObject>
export type ScenarioHeldGroup = z.infer<typeof HeldGroupObject>

/**
 * F10-0: the worst-case simultaneous population of a scenario against the maxima it declares. Start entities are always present. A held group is
 * present whenever it has spawned and not yet gone, so two groups can coexist unless one waits (a `when.gone` trigger) on the other, directly or
 * through a chain. The peak is the heaviest set of held groups with no such waiting between any pair, found by trying every subset (a scenario has
 * a handful of groups, and more than 16 is refused as unreviewable).
 */
function checkPopulation(
  s: z.infer<typeof ScenarioShape>,
  cap: NonNullable<z.infer<typeof ScenarioShape>['population']>,
  issue: (message: string, path: (string | number)[]) => void,
): void {
  const held = s.heldGroups ?? []
  if (held.length > 16) { issue('population: more than 16 held groups cannot be checked; split the mission', ['population']); return }
  const isAirborne = (a: ScenarioAircraft): boolean => !isParkedAircraft(a) || a.id === s.player || a.pilot?.takeoff === true
  const closeOf = (a: ScenarioAircraft): boolean => (a.tags ?? []).includes('close')
  const startAircraft = s.aircraft.filter(isAirborne)
  const names = held.map((g) => new Set([g.id, ...[...(g.aircraft ?? []), ...(g.ships ?? []), ...(g.vehicles ?? [])].flatMap((e) => [e.id, ...(e.tags ?? [])])]))
  // waits[i] = the groups group i waits on (its spawning trigger's `gone` targets name one of their members or tags).
  const waits = held.map((g) => {
    const trigger = (s.triggers ?? []).find((t) => t.then.some((a) => 'spawn' in a && a.spawn === g.id))
    const gone = trigger !== undefined && 'gone' in trigger.when ? trigger.when.gone.targets : []
    return held.flatMap((other, j) => (other.id !== g.id && gone.some((ref) => names[j]!.has(ref)) ? [j] : []))
  })
  const before = held.map((): boolean[] => held.map(() => false)) // before[i][j]: j must be gone before i spawns
  const mark = (i: number, j: number): void => { if (!before[i]![j]) { before[i]![j] = true; for (const k of waits[j]!) mark(i, k) } }
  waits.forEach((ws, i) => ws.forEach((j) => mark(i, j)))
  const comparable = (i: number, j: number): boolean => before[i]![j]! || before[j]![i]!
  const weigh = (pick: (g: (typeof held)[number]) => number) => held.map(pick)
  const airborneW = weigh((g) => (g.aircraft ?? []).length)
  const shipW = weigh((g) => (g.ships ?? []).length)
  const closeW = weigh((g) => (g.aircraft ?? []).filter(closeOf).length)
  const peak = { airborne: 0, ships: 0, close: 0 }
  for (let mask = 0; mask < 1 << held.length; mask++) {
    const idx = held.flatMap((_, i) => (mask & (1 << i) ? [i] : []))
    if (idx.some((i) => idx.some((j) => i < j && comparable(i, j)))) continue
    peak.airborne = Math.max(peak.airborne, idx.reduce((n, i) => n + airborneW[i]!, 0))
    peak.ships = Math.max(peak.ships, idx.reduce((n, i) => n + shipW[i]!, 0))
    peak.close = Math.max(peak.close, idx.reduce((n, i) => n + closeW[i]!, 0))
  }
  const airborne = startAircraft.length + peak.airborne
  const ships = s.ships.length + peak.ships
  if (airborne > cap.airborne) issue(`population: ${airborne} aircraft can be airborne at once, over the declared ${cap.airborne}`, ['population', 'airborne'])
  if (ships > cap.ships) issue(`population: ${ships} ships can be present at once, over the declared ${cap.ships}`, ['population', 'ships'])
  if (cap.close !== undefined) {
    const close = startAircraft.filter(closeOf).length + peak.close
    if (close > cap.close) issue(`population: ${close} aircraft can be in the close set at once, over the declared ${cap.close}`, ['population', 'close'])
  }
}

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
    if (s.freezeOnSuccess !== undefined) issue('freezeOnSuccess needs objectives: a scenario without objectives is not a mission', ['freezeOnSuccess'])
    if (s.population !== undefined) issue('population needs objectives: a scenario without objectives is not a mission', ['population'])
    if (s.recovery !== undefined) issue('recovery needs objectives: a scenario without objectives is not a mission', ['recovery'])
    if (s.fieldRules !== undefined) issue('fieldRules need objectives: a scenario without objectives is not a mission', ['fieldRules'])
    if (s.badge !== undefined) issue('badge needs objectives: a scenario without objectives is not a mission', ['badge'])
    if (s.briefing !== undefined) issue('briefing needs objectives: a scenario without objectives is not a mission', ['briefing'])
    if (s.history !== undefined) issue('history needs objectives: a scenario without objectives is not a mission', ['history'])
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
  if (s.population !== undefined) checkPopulation(s, s.population, issue)
  if (s.recovery !== undefined && objectives.find((o) => o.id === s.recovery!.objective)?.kind !== 'reach') {
    issue(`recovery.objective "${s.recovery.objective}" must name a reach objective (the egress gate)`, ['recovery', 'objective'])
  }
  for (const [ri, r] of (s.fieldRules ?? []).entries()) {
    if (!s.airfields.includes(r.airfield)) issue(`fieldRules names "${r.airfield}", which is not one of airfields`, ['fieldRules', ri, 'airfield'])
  }

  const startAircraft = new Set(s.aircraft.map((a) => a.id))
  const startShips = new Set(s.ships.map((sh) => sh.id))
  const used = new Set([...startAircraft, ...startShips, ...s.vehicles.map((v) => v.id)])
  for (const [gi, g] of held.entries()) {
    const groupAircraft = new Set((g.aircraft ?? []).map((a) => a.id))
    const visible = new Map([...s.aircraft, ...(g.aircraft ?? [])].map((a) => [a.id, a]))
    for (const [ai, a] of (g.aircraft ?? []).entries()) {
      const path = ['heldGroups', gi, 'aircraft', ai]
      if (used.has(a.id)) issue(`entity id "${a.id}" is already used; ids are unique across the whole scenario`, [...path, 'id'])
      used.add(a.id)
      if (isParkedAircraft(a) && (isShipParked(a.parkedAt) || a.pilot?.takeoff !== true)) {
        issue('a held aircraft must start airborne (airborneAt), plan ruling R3; the one exception is an airfield park with pilot.takeoff', [...path, 'parkedAt'])
      }
      const target = a.pilot?.target
      if (target !== undefined && (target === a.id || (!startAircraft.has(target) && !groupAircraft.has(target)))) {
        issue('a held pilot must target a starting aircraft or one in its own group', [...path, 'pilot', 'target'])
      } else if (target !== undefined && sideOf(s, visible.get(target)!) === sideOf(s, a)) {
        issue('pilot target must be on the opposite side', [...path, 'pilot', 'target'])
      }
    }
    for (const [si, sh] of (g.ships ?? []).entries()) {
      if (used.has(sh.id)) issue(`entity id "${sh.id}" is already used; ids are unique across the whole scenario`, ['heldGroups', gi, 'ships', si, 'id'])
      used.add(sh.id)
    }
    for (const [vi, v] of (g.vehicles ?? []).entries()) {
      if (used.has(v.id)) issue(`entity id "${v.id}" is already used; ids are unique across the whole scenario`, ['heldGroups', gi, 'vehicles', vi, 'id'])
      used.add(v.id)
    }
  }

  const player = s.aircraft.find((a) => a.id === s.player)
  const playerStart = player !== undefined && isAfloatAircraft(player)
    ? 'open-water'
    : player !== undefined && isParkedAircraft(player)
      ? (isShipParked(player.parkedAt) ? player.parkedAt.ship : player.parkedAt.airfield)
      : null
  const objectiveIds = new Set(objectives.map((o) => o.id))
  /** Whether an objective can ever read failed: a standing order, a corridor, a group test, or anything with a window. */
  const canFail = (o: (typeof objectives)[number]): boolean =>
    o.kind === 'protect' || o.kind === 'deny' || o.kind === 'approaches' || o.kind === 'atLeast' || o.kind === 'preventRelease'
    || (o.kind === 'field' && o.keep === true) || (o.kind === 'state' && o.failOnExit === true) || o.until !== undefined
  /** `when` references that name objectives (shared by triggers and `until`). */
  const checkWhen = (w: z.infer<typeof TriggerObject>['when'], path: (string | number)[]): void => {
    if ('completed' in w && !objectiveIds.has(w.completed)) issue(`when.completed names "${w.completed}", which is not an objective`, [...path, 'completed'])
    if ('failed' in w) {
      const o = objectives.find((x) => x.id === w.failed)
      if (o === undefined) issue(`when.failed names "${w.failed}", which is not an objective`, [...path, 'failed'])
      else if (!canFail(o)) issue(`when.failed names "${o.id}", a ${o.kind} objective, which can never fail`, [...path, 'failed'])
    }
  }
  objectives.forEach((o, i) => {
    const path = ['objectives', i]
    if (o.after !== undefined && !objectives.slice(0, i).some((x) => x.id === o.after)) {
      issue(`after must name an earlier objective; "${o.after}" is not one`, [...path, 'after'])
    }
    if (o.kind === 'takeoff' && o.from !== playerStart) {
      issue(`takeoff.from must be where the player starts (${playerStart ?? 'airborne'}), not "${o.from}"`, [...path, 'from'])
    }
    if (o.kind === 'land' && o.at !== 'open-water' && !s.airfields.includes(o.at) && !startShips.has(o.at)) {
      issue(`land.at "${o.at}" is neither open-water, one of airfields nor a starting ship`, [...path, 'at'])
    }
    if (o.kind === 'land' && o.suggestedRecovery === true && (o.count !== undefined || o.respot === true)) {
      issue(`objective "${o.id}": a suggestedRecovery landing is one landing at any friendly base; it takes no count or respot`, [...path])
    }
    if (o.kind === 'land' && o.respot === true
        && !(player !== undefined && isParkedAircraft(player) && isShipParked(player.parkedAt) && player.parkedAt.ship === o.at)) {
      issue(`objective "${o.id}": respot needs the player parked on "${o.at}"`, [...path, 'respot'])
    }
    if (o.kind === 'deny' && typeof o.around === 'string' && !startAircraft.has(o.around) && !startShips.has(o.around)) {
      issue(`deny.around "${o.around}" is not a starting aircraft or ship`, [...path, 'around'])
    }
    if (o.kind === 'release' && o.target !== undefined && !startAircraft.has(o.target) && !startShips.has(o.target)) {
      issue(`release.target "${o.target}" is not a starting aircraft or ship`, [...path, 'target'])
    }
    if (o.kind === 'state' && planeStateIsEmpty(o)) {
      issue(`objective "${o.id}": a state objective needs at least one of gear, flaps, bayDoors, airspeedMps, altitudeM, throttle`, path)
    }
    if (o.kind === 'approaches' && objectives.findIndex((x) => x.kind === 'approaches') !== i) {
      issue('a mission may declare one approaches objective (M3-R11)', [...path, 'kind'])
    }
    // F10-0 vocabulary.
    if ((o.kind === 'reach' || o.kind === 'hold') && !innerBelowOuter(o)) issue(innerMessage.message, [...path, 'innerRadiusM'])
    if (o.kind === 'atLeast') {
      for (const ref of o.of) {
        if (!objectives.slice(0, i).some((x) => x.id === ref)) issue(`atLeast.of must name earlier objectives; "${ref}" is not one`, [...path, 'of'])
      }
      if (o.n > o.of.length) issue(`atLeast asks for ${o.n} of ${o.of.length} objectives`, [...path, 'n'])
    }
    if (o.kind === 'land' && o.requires !== undefined) {
      for (const field of [...(o.requires.serviceable ?? []), ...(o.requires.unserviceable ?? [])]) {
        if (!s.airfields.includes(field)) issue(`land.requires names "${field}", which is not one of airfields`, [...path, 'requires'])
      }
    }
    if (o.kind === 'field') {
      for (const field of o.airfields) if (!s.airfields.includes(field)) issue(`field.airfields names "${field}", which is not one of airfields`, [...path, 'airfields'])
      if (o.min !== undefined && o.min > o.airfields.length) issue(`field asks for ${o.min} of ${o.airfields.length} airfields`, [...path, 'min'])
    }
    if (o.until !== undefined) checkWhen(o.until, [...path, 'until'])
    if (o.kind === 'destroy' && o.fresh === true && o.after === undefined) {
      issue('fresh counts from when the objective wakes up, so it needs an after', [...path, 'fresh'])
    }
  })

  const byId = new Map(objectives.map((o) => [o.id, o]))
  const spawnCount = new Map(held.map((g) => [g.id, 0]))
  triggers.forEach((t, i) => {
    const path = ['triggers', i]
    checkWhen(t.when, [...path, 'when'])
    t.then.forEach((a, ai) => {
      if ('complete' in a || 'fail' in a) {
        const target = 'complete' in a ? a.complete : a.fail
        if (!byId.has(target)) issue(`then names "${target}", which is not an objective`, [...path, 'then', ai])
        return
      }
      if ('setServiceable' in a || 'setSide' in a) {
        const field = 'setServiceable' in a ? a.setServiceable.airfield : a.setSide.airfield
        if (!s.airfields.includes(field)) issue(`then names airfield "${field}", which is not one of airfields`, [...path, 'then', ai])
        return
      }
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

export const scenarioVehicleSpecIds = (s: Scenario): string[] =>
  [...s.vehicles, ...(s.heldGroups ?? []).flatMap((g) => g.vehicles ?? [])].map((v) => v.spec)

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
  readonly vehicleSpecs?: Readonly<Record<string, VehicleSpec>>
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

/** Where an airfield destination points: its runway center, or the middle of the buildings `aim` names (an id or
 *  a tag). An `aim` that names none is a content error, thrown like an unknown id. */
function airfieldAim(a: Airfield, aim: string | undefined): { x: number; z: number } {
  if (aim === undefined) return { x: a.runway.center.x, z: a.runway.center.z }
  const hit = a.buildings.filter((b) => b.id === aim || (b.tags ?? []).includes(aim))
  if (hit.length === 0) throw new Error(`scenario aims at "${aim}", which names no building at airfield "${a.id}"`)
  const n = hit.length
  return localToWorld(a, hit.reduce((s, b) => s + b.x, 0) / n, hit.reduce((s, b) => s + b.z, 0) / n)
}

function lookup<T>(table: Readonly<Record<string, T>>, key: string, kind: string): T {
  const v = table[key]
  if (v === undefined) throw new Error(`scenario refers to ${kind} "${key}", which is not in the bundle`)
  return v
}

/** One scenario ship as a `ShipEntity`: a start ship, or a held one built
 *  at world creation (missions M1). Moved out of `worldFromScenario`
 *  verbatim. */
function buildShip(bundle: ScenarioBundle, sh: ScenarioShip, terrain: TerrainField | null): ShipEntity {
  const spec = lookup(bundle.shipSpecs, sh.spec, 'ship spec')
  const orders = { waypoints: sh.waypoints.map(([x, z]) => ({ x, z })), speedMps: sh.speedMps, ...(sh.fireAt === undefined ? {} : { fireAt: sh.fireAt }) }
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
  return {
    id: sh.id, spec, state, previous: state, orders,
    ...(sh.side === undefined ? {} : { side: sh.side }),
    ...(sh.practiceTarget === undefined ? {} : { practiceTarget: sh.practiceTarget }),
  }
}

function buildVehicle(bundle: ScenarioBundle, v: ScenarioVehicle, terrain: TerrainField | null): VehicleEntity {
  const loaded = lookup(bundle.vehicleSpecs ?? {}, v.spec, 'vehicle spec')
  const spec = v.hp === undefined ? loaded : { ...loaded, hp: v.hp }
  const orders = {
    waypoints: v.waypoints.map(([x, z]) => ({ x, z })), speedMps: v.speedMps, loop: v.loop,
    ...(v.headingDeg === undefined ? {} : { headingRad: (v.headingDeg * Math.PI) / 180 }),
  }
  const state = createVehicleState(spec, orders, terrain)
  return { id: v.id, spec, state, previous: state, orders, ...(v.side === undefined ? {} : { side: v.side }) }
}

/** The entity's `side`, only when the content says one, so a scenario
 *  without sides builds exactly the entities it built before 7e. */
const sideFrom = (a: ScenarioAircraft): { side?: 'allied' | 'axis' } => (a.side === undefined ? {} : { side: a.side })

/** One scenario aircraft as an `AircraftEntity`: a start aircraft, or a
 *  held one built at world creation (missions M1). Moved out of
 *  `worldFromScenario` verbatim. */
function buildAircraft(
  bundle: ScenarioBundle,
  a: ScenarioAircraft,
  ships: readonly ShipEntity[],
  homes: ReadonlyMap<string, RecoveryHome>,
  water: WaterSurfaceContext,
): AircraftEntity<undefined> {
  const spec = lookup(bundle.aircraftSpecs, a.spec, 'aircraft spec')
  if (isAfloatAircraft(a)) {
    if (spec.waterOperations === undefined) throw new Error(`scenario floats "${a.id}" but aircraft spec "${spec.id}" has no waterOperations`)
    const [x, z] = a.afloatAt.position
    const headingRad = a.afloatAt.headingDeg * Math.PI / 180
    const attitude = qMul(
      qFromAxisAngle(v3(0, 1, 0), Math.PI / 2 - headingRad),
      qFromAxisAngle(v3(0, 0, 1), spec.waterOperations.restPitchDeg * Math.PI / 180),
    )
    const state = createState({
      position: v3(
        x,
        waterSurfaceAt(water, x, z).heightM + spec.waterOperations.hullDepthM - spec.waterOperations.displacementDraftM,
        z,
      ),
      velocity: v3(0, waterSurfaceAt(water, x, z).verticalSpeedMps, 0),
      attitude,
      gearFraction: 0,
      flapFraction: 1,
    })
    const controls: Controls = { ...NEUTRAL, gearDown: false, flapDown: true }
    return { id: a.id, spec, state, previous: state, controls, assistMemory: undefined, impact: null, parked: true, pilot: pilotAssignmentFrom(a.id, a.pilot, bundle.airfields, homes, bundle.scenario.airfieldSides), ...sideFrom(a) }
  }
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
      assistMemory: undefined, impact: null, parked: false, pilot: pilotAssignmentFrom(a.id, a.pilot, bundle.airfields, homes, bundle.scenario.airfieldSides),
      ...sideFrom(a),
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
    const state = stateOnDeck(spec, deck, parkedAt.spot)
    const controls: Controls = a.chocked ? { ...NEUTRAL, gearDown: true, brake: 1 } : NEUTRAL
    return { id: a.id, spec, state, previous: state, controls, assistMemory: undefined, impact: null, parked: true, pilot: pilotAssignmentFrom(a.id, a.pilot, bundle.airfields, homes, bundle.scenario.airfieldSides), ...sideFrom(a) }
  }
  const field = lookup(bundle.airfields, parkedAt.airfield, 'airfield')
  const spot = parkedAt.spot === 'runwayCenter' ? { x: 0, z: 0 } : parkedAt.spot
  const at = localToWorld(field, spot.x, spot.z)
  const state = createState({
    position: v3(at.x, PARKED_PLACEHOLDER_Y_M, at.z),
    velocity: v3(0, 0, 0),
    attitude: parkedAttitude(field, restPitchRad(spec.gear)),
    gearFraction: 1,
  })
  const controls: Controls = a.chocked ? { ...NEUTRAL, gearDown: true, brake: 1 } : NEUTRAL
  return { id: a.id, spec, state, previous: state, controls, assistMemory: undefined, impact: null, parked: true, pilot: pilotAssignmentFrom(a.id, a.pilot, bundle.airfields, homes, bundle.scenario.airfieldSides), ...sideFrom(a) }
}

/** Every start or held aircraft with a `pilot.home`, grouped by target (a
 *  `home:` prefix so an airfield and a ship can never collide on id), each
 *  group id-sorted -- never by array position (7g spec §7, global
 *  constraint). Shared by `checkHomes` and `homesFrom` so the two never
 *  disagree on which aircraft are homed where. */
function groupedHomes(s: Scenario): ReadonlyMap<string, readonly AnyAircraft[]> {
  const all: AnyAircraft[] = [...s.aircraft, ...(s.heldGroups ?? []).flatMap((g) => g.aircraft ?? [])]
  const groups = new Map<string, AnyAircraft[]>()
  for (const a of all) {
    const home = a.pilot?.home
    if (home === undefined) continue
    const key = 'airfield' in home ? `airfield:${home.airfield}` : `ship:${home.ship}`
    const list = groups.get(key)
    if (list === undefined) groups.set(key, [a])
    else list.push(a)
  }
  for (const list of groups.values()) list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return groups
}

/** 7g spec §7, §3: the two `pilot.home` rules that need ship specs and
 *  airfield records the schema does not have (existence of the named
 *  airfield/ship is checked at parse time, in `ScenarioObject`'s own
 *  `superRefine`, alongside ingress's destination check). `ships` are the
 *  scenario's own starting ships, already built, so `deckOf` reads a real
 *  spec. */
function checkHomes(s: Scenario, bundle: ScenarioBundle, ships: readonly ShipEntity[]): void {
  for (const [key, list] of groupedHomes(s)) {
    const maxSpan = Math.max(...list.map((a) => lookup(bundle.aircraftSpecs, a.spec, 'aircraft spec').geometry.wingSpanM))
    if (key.startsWith('ship:')) {
      const shipId = key.slice('ship:'.length)
      const deck = deckOf(ships.find((sh) => sh.id === shipId)!)
      if (deck === null) throw new Error(`home ship "${shipId}" has no flight deck`)
      const n = deckParkSpots(deck, maxSpan).length
      if (list.length > n) throw new Error(`home ship "${shipId}" parks ${n} aircraft but ${list.length} are homed to it`)
    } else {
      const airfieldId = key.slice('airfield:'.length)
      // F8A: an AI's home is where it lands; a field its window leaves unserviceable cannot be one.
      if (lookup(bundle.airfields, airfieldId, 'airfield').noStrip === true) throw new Error(`home airfield "${airfieldId}" has no strip`)
      if (lookup(bundle.airfields, airfieldId, 'airfield').serviceable === false) throw new Error(`home airfield "${airfieldId}" is not serviceable in this world`)
      const n = runwayParkSpots(lookup(bundle.airfields, airfieldId, 'airfield'), maxSpan).length
      if (list.length > n) throw new Error(`home airfield "${airfieldId}" parks ${n} aircraft but ${list.length} are homed to it`)
    }
  }
}

/** `pilot.home` resolved to plain data (spec §7): a runway's approach
 *  geometry and park spot are fixed here, since `ctx` carries no airfields; a
 *  ship home only carries the id and park spot, and is read live from
 *  `ctx.ships` every tick. Assumes `checkHomes` already passed. */
function homesFrom(s: Scenario, bundle: ScenarioBundle, ships: readonly ShipEntity[]): ReadonlyMap<string, RecoveryHome> {
  const result = new Map<string, RecoveryHome>()
  for (const [key, list] of groupedHomes(s)) {
    const maxSpan = Math.max(...list.map((a) => lookup(bundle.aircraftSpecs, a.spec, 'aircraft spec').geometry.wingSpanM))
    if (key.startsWith('ship:')) {
      const shipId = key.slice('ship:'.length)
      const spots = deckParkSpots(deckOf(ships.find((sh) => sh.id === shipId)!)!, maxSpan)
      list.forEach((a, rank) => result.set(a.id, { kind: 'ship', id: shipId, parkSpot: spots[rank]! }))
    } else {
      const airfieldId = key.slice('airfield:'.length)
      const a = lookup(bundle.airfields, airfieldId, 'airfield')
      const spots = runwayParkSpots(a, maxSpan)
      const aim = localToWorld(a, 0, a.runway.lengthM / 4)
      const headingRad = runwayHeadingRad(a)
      list.forEach((ac, rank) => {
        const spot = spots[rank]!
        const w = localToWorld(a, spot.x, spot.z)
        result.set(ac.id, {
          kind: 'runway', airfieldId, aimX: aim.x, aimZ: aim.z, headingRad,
          parkSpot: spot, parkWorld: { x: w.x, z: w.z, headingRad },
        })
      })
    }
  }
  return result
}

/** The friendly-fire spec's scenario-load side checks (§3), over the start
 *  and held entities as content. */
function checkSides(s: Scenario, airfields: readonly Airfield[]): void {
  const heldAircraft = (s.heldGroups ?? []).flatMap((g) => g.aircraft ?? [])
  const heldShips = (s.heldGroups ?? []).flatMap((g) => g.ships ?? [])
  checkScenarioSides({
    scenarioId: s.id,
    player: s.player,
    aircraft: [...s.aircraft, ...heldAircraft].map((a) => ({
      id: a.id,
      ...sideFrom(a),
      parkedOnShip: isParkedAircraft(a) && isShipParked(a.parkedAt) ? a.parkedAt.ship : null,
      ingressShip: a.pilot?.ingress?.destination !== undefined && 'ship' in a.pilot.ingress.destination
        ? a.pilot.ingress.destination.ship : null,
    })),
    ships: [...s.ships, ...heldShips],
    airfields,
    airfieldSides: s.airfieldSides,
    landAt: (s.objectives ?? []).flatMap((o) => (o.kind === 'land' ? [{ objective: o.id, at: o.at }] : [])),
  })
}

/** Everything a mission objective may name (spec §2.1): start and held
 *  aircraft and ships with their scenario tags, and every building of the
 *  scenario's `airfields` (the ones `buildStructures` turns into world
 *  structures) with its base-content tags. */
function missionEntities(bundle: ScenarioBundle): Taggable[] {
  const s = bundle.scenario
  const heldAircraft = (s.heldGroups ?? []).flatMap((g) => g.aircraft ?? [])
  const heldShips = (s.heldGroups ?? []).flatMap((g) => g.ships ?? [])
  const heldVehicles = (s.heldGroups ?? []).flatMap((g) => g.vehicles ?? [])
  const tagged = (kind: NonNullable<Taggable['kind']>) => (e: { id: string; tags?: string[] | undefined } & Parameters<typeof sideOf>[1]): Taggable => ({ id: e.id, tags: e.tags ?? [], side: sideOf(s, e), kind })
  const mobile = [
    ...[...s.aircraft, ...heldAircraft].map(tagged('aircraft')),
    ...[...s.ships, ...heldShips].map(tagged('ship')),
    ...[...s.vehicles, ...heldVehicles].map(tagged('vehicle')),
  ]
  const buildings = s.airfields.flatMap((a) => {
    const field = lookup(bundle.airfields, a, 'airfield')
    const side = airfieldSideOf(field, s.airfieldSides)
    return field.buildings.map((b): Taggable => ({ id: b.id, tags: b.tags ?? [], side, kind: 'structure' }))
  })
  return [...mobile, ...buildings]
}

/**
 * The initial `World`. Pure; `terrain` may be `null` (the browser has none
 * at boot) in which case the ship loops are not checked here -- the Deterministic
 * test does that against the real field on every commit.
 *
 * `loadout` seeds the PLAYER's stores only (spec §2.4: loadout is a title-
 * screen choice, not scenario content); every other aircraft -- a chocked
 * target, a wingman -- gets `emptyStores`, matching every call site's
 * behavior before this parameter existed. Defaults to `'clean'`, which is
 * `storesFromLoadout`'s zero-stores case, so an omitted third argument is
 * bit-identical to the pre-Task-7 hardcode it replaces.
 */
/** M4: the same world with its warships' main batteries free to fire (scenario `mainBatteries`, or
 *  the DEV `?mainBatteries=all` alternative to ruling R1). */
export const withMainBatteries = <M>(w: World<M>): World<M> =>
  w.combat.mainBattery !== undefined ? w : { ...w, combat: { ...w.combat, mainBattery: initialMainBattery() } }
/** M4: the same world with every main battery holding fire (DEV `?mainBatteries=off`). */
export const withoutMainBatteries = <M>(w: World<M>): World<M> => {
  const { mainBattery, ...combat } = w.combat
  return mainBattery === undefined ? w : { ...w, combat }
}

/** F7B, DEV `?paradrop=6` or `?paradrop=6,2`: the same world with its player aircraft releasing that many men (then
 *  bundles) two seconds in. Anything unparseable leaves the world untouched. Test scaffolding for the canopies and the
 *  drop primitive; the real J5 drop is F10D's. */
export const TEST_DROP_TICK = 120
export const withTestDrop = <M>(w: World<M>, query: string): World<M> => {
  const [men, bundles = '0'] = query.split(',')
  const count = (text: string | undefined): number => (/^\d{1,2}$/.test(text ?? '') ? Number(text) : 0)
  const orders = ([['trooper', count(men)], ['bundle', count(bundles)]] as const)
    .filter(([, n]) => n > 0)
    .map(([kind, n]) => ({ tick: TEST_DROP_TICK, aircraft: w.player, count: n, kind }))
  return orders.length === 0 ? w : { ...w, drops: [...(w.drops ?? []), ...orders] }
}

export function worldFromScenario(bundle: ScenarioBundle, terrain: TerrainField | null, loadout: Loadout = 'clean'): World<undefined> {
  const s = bundle.scenario
  const wind = s.weather.windMps === 0 ? null : windVectorFrom(s.weather.windFromDeg, s.weather.windMps)
  const water = waterSurfaceContext(0, wind)
  const airfields = s.airfields.map((a) => lookup(bundle.airfields, a, 'airfield'))
  const ships: ShipEntity[] = s.ships.map((sh) => buildShip(bundle, sh, terrain))
  const vehicles: VehicleEntity[] = s.vehicles.map((v) => buildVehicle(bundle, v, terrain))

  checkHomes(s, bundle, ships)
  const homes = homesFrom(s, bundle, ships)
  const aircraft: AircraftEntity<undefined>[] = s.aircraft.map((a) => buildAircraft(bundle, a, ships, homes, water))

  const stores: Record<string, StoresState> = Object.fromEntries(
    aircraft.map((a) => [a.id, a.id === s.player ? storesFromLoadout(a.spec, loadout) : armedForAttack(a, aircraft) ? storesFromLoadout(a.spec, 'bombs') : emptyStores]),
  )
  // Missions (spec 2026-09-25). Held groups are built NOW, by the same
  // functions as the start entities, so a spawn is exactly what
  // `worldFromScenario` would have built (spec §1); a scenario without
  // objectives builds none of this and passes `mission: null`.
  let mission: MissionState<undefined> | null = null
  if (s.objectives !== undefined) {
    for (const o of s.objectives) {
      if (o.kind !== 'land') continue
      const ship = ships.find((sh) => sh.id === o.at)
      if (ship !== undefined && deckOf(ship) === null) {
        throw new Error(`scenario "${s.id}": objective "${o.id}" lands on "${o.at}", which has no flight deck`)
      }
    }
    // M3-R11: a pass needs a Paddles window, and only a ship with `paddles` has one.
    for (const o of s.objectives) {
      if (o.kind === 'approaches' && ships.find((sh) => sh.id === o.at)?.spec.paddles === undefined) {
        throw new Error(`scenario "${s.id}": objective "${o.id}" names "${o.at}", which has no Paddles`)
      }
    }
    const held: HeldGroup<undefined>[] = (s.heldGroups ?? []).map((g) => ({
      id: g.id,
      aircraft: (g.aircraft ?? []).map((a) => buildAircraft(bundle, a, ships, homes, water)),
      ships: (g.ships ?? []).map((sh) => buildShip(bundle, sh, terrain)),
      vehicles: (g.vehicles ?? []).map((v) => buildVehicle(bundle, v, terrain)),
    }))
    // M3-R1: the respot order is the player's own start spot, computed only
    // when a `land` objective asked for one and the player starts parked on
    // a ship -- `checkMission` already rejected every other combination.
    const wantsRespot = s.objectives.some((o) => o.kind === 'land' && o.respot === true)
    const playerContent = s.aircraft.find((a) => a.id === s.player)!
    const respot = wantsRespot && isParkedAircraft(playerContent) && isShipParked(playerContent.parkedAt)
      ? { ship: playerContent.parkedAt.ship, spot: playerContent.parkedAt.spot } : null
    mission = createMission<undefined>({
      scenarioId: s.id,
      playerSide: sideOf(s, s.aircraft.find((a) => a.id === s.player)!),
      objectives: s.objectives,
      triggers: s.triggers ?? [],
      fieldRules: s.fieldRules ?? [],
      egress: s.recovery?.objective ?? null,
      freezeOnSuccess: s.freezeOnSuccess === true,
      badge: s.badge ?? null,
      held,
      respot,
      entities: missionEntities(bundle),
    })
  }
  checkSides(s, airfields)
  const anchorages = (s.anchorages ?? []).map((a) => ({ id: a.id, name: a.name, x: a.position[0], z: a.position[1], radiusM: a.radiusM }))
  const world = createWorldOf({ aircraft, ships, vehicles, player: s.player, airfields, terrain, wind, stores, enemyAirfields: s.enemyAirfields, airfieldSides: s.airfieldSides, mission, anchorages })
  return s.mainBatteries === true ? withMainBatteries(world) : world
}
