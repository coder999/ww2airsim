import { z } from 'zod'
import siteWindows from '../../../content/campaign/site-windows.json' with { type: 'json' }
import { LightSpecSchema, type LightSpec } from '../lights/lights.js'
import { parseScenario, type Scenario, type ScenarioAircraft, type ScenarioVehicle } from '../scenario.js'
import { BUILDING_KINDS, BUILDING_STATES, localToWorld, parseAirfield, runwayHeadingRad, type Airfield } from './airfields.js'
import { CLUTTER_CEILING, clutterTotal } from './clutter.js'

/**
 * Canonical site files (F8A Task 1, plan docs/superpowers/plans/2026-10-16-f8-canonical-world.md, "Design"):
 * `content/sites/<id>.json` is one place, authored once, with a `base` that never changes and one overlay per window.
 * `expandScenario` turns a scenario that names `sites` into the airfields, vehicles, parked aircraft and lights of the
 * chosen window; a scenario with no `sites` never reaches this file, so its world is byte-identical to before F8.
 */

/** The window ids, from the one list shared with src/campaign/worldStates.ts. */
export const WINDOW_IDS = siteWindows.windows.map((w) => w.id) as readonly string[]
export type WindowId = string
/** What `Campaign.world` holds for a site nobody has advanced. */
export const DEFAULT_WINDOW: WindowId = 'pre-invasion'
/** Most stationary vehicles one site-state may carry (plan decision 5). */
export const VEHICLE_CAP = 12
/** Most parked aircraft one site-state may carry: each is a stepped entity, so it is capped like a vehicle. */
export const PARKED_CAP = 8

const finite = z.number().refine(Number.isFinite, { message: 'must be a finite number' })
const positive = finite.refine((n) => n > 0, { message: 'must be greater than zero' })
const id = z.string().min(1)
const windowId = z.enum(WINDOW_IDS as [string, ...string[]])

/**
 * How a placement is known. `sourced` cites a ledger entry in the site's own `sources` (F3 section 10); `inferred`
 * follows from a sourced claim by a stated step; `invented` is gameplay layout the sources do not give. The label is
 * the rule: a placement with none of these does not load.
 */
const Provenance = {
  basis: z.enum(['sourced', 'inferred', 'invented']),
  /** A key of the site's `sources` for `sourced`, otherwise the reason in a sentence. */
  cite: z.string().min(1),
}

const Placement = z.object({
  id,
  kind: z.enum(BUILDING_KINDS),
  x: finite, z: finite,
  widthM: positive, lengthM: positive,
  hp: positive,
  headingDeg: finite.optional(),
  heightM: positive.optional(),
  tags: z.array(id).min(1).optional(),
  ...Provenance,
}).strict()
export type Placement = z.infer<typeof Placement>

const Runway = z.object({ center: z.object({ x: finite, z: finite }).strict(), headingDeg: finite, lengthM: positive, widthM: positive }).strict()
const Rect = z.object({ x: finite, z: finite, widthM: positive, lengthM: positive }).strict()

const LocalLight = LightSpecSchema.refine((l) => 'x' in l.at, { message: 'a site light is placed at a runway-local { x, z }' })

const Window = z.object({
  /** `false` is "no field here yet": the airfield is not in the world at all. */
  built: z.boolean(),
  side: z.enum(['allied', 'axis']),
  serviceable: z.boolean(),
  note: z.string().min(1),
  /** Per building id (base or `added`): damaged, destroyed or construction; absent is intact. */
  states: z.record(id, z.enum(BUILDING_STATES)).default({}),
  /** Buildings that exist only from this window on. The same id in two windows is the same building (a test pins its pose). */
  added: z.array(Placement).default([]),
  vehicles: z.array(z.object({
    id, spec: id, x: finite, z: finite, headingDeg: finite, side: z.enum(['allied', 'axis']).optional(), ...Provenance,
  }).strict()).max(VEHICLE_CAP).default([]),
  parked: z.array(z.object({
    id, spec: id, x: finite, z: finite, side: z.enum(['allied', 'axis']).optional(), ...Provenance,
  }).strict()).max(PARKED_CAP).default([]),
  lights: z.array(LocalLight).default([]),
  /** Instances per 1,000 square meters, by clutter kind, per base clutter area id. */
  clutter: z.record(id, z.record(z.string(), z.number().nonnegative())).default({}),
}).strict()
export type SiteWindow = z.infer<typeof Window>

const SiteObject = z.object({
  id,
  name: id,
  /** The airfield id this site becomes in a world (what `Scenario.airfields` and `parkedAt.airfield` name). */
  airfield: id,
  base: z.object({
    runway: Runway,
    apron: Rect.nullable(),
    clearing: Rect.nullable(),
    buildings: z.array(Placement),
    clutterAreas: z.array(Rect.extend({ id }).strict()),
  }).strict(),
  /** F3 section 10 ledger keys the placements cite, with the claim each supports. */
  sources: z.record(id, z.object({ claim: id, url: z.string().min(1) }).strict()),
  reference: z.object({ source: id }).strict(),
  windows: z.object(Object.fromEntries(WINDOW_IDS.map((w) => [w, Window])) as Record<string, typeof Window>).strict(),
}).strict()
export type Site = z.infer<typeof SiteObject>

export function parseSite(raw: unknown): Site {
  const result = SiteObject.safeParse(raw)
  if (!result.success) {
    throw new Error(`Invalid site: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`)
  }
  return result.data
}

/** The window a campaign holds a site in; a site it has never advanced is `pre-invasion`. Unknown ids throw. */
export function windowOf(world: Readonly<Record<string, string>>, siteId: string): WindowId {
  const w = world[siteId] ?? DEFAULT_WINDOW
  if (!WINDOW_IDS.includes(w)) throw new Error(`world["${siteId}"] is "${w}", not a window (${WINDOW_IDS.join(', ')})`)
  return w
}

/** A stable small integer for a string (FNV-1a), the clutter seed: the same site and window always draw the same field. */
export function seedOf(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
  return h >>> 0
}

const HP_SCALE: Readonly<Record<string, number>> = { damaged: 0.5, construction: 0.5 }

/** A site's airfield in one window, or `null` when the window has no field yet. */
export function airfieldFor(site: Site, window: WindowId): Airfield | null {
  const w = site.windows[window]
  if (w === undefined) throw new Error(`site "${site.id}" has no window "${window}"`)
  if (!w.built) return null
  const placements = [...site.base.buildings, ...w.added]
  for (const key of Object.keys(w.states)) {
    if (!placements.some((p) => p.id === key)) throw new Error(`site "${site.id}" window "${window}" gives a state to unknown building "${key}"`)
  }
  const buildings = placements.map((p) => {
    const state = w.states[p.id]
    const { basis: _basis, cite: _cite, ...rest } = p
    return {
      ...rest,
      model: true,
      hp: Math.max(1, Math.round(p.hp * (state === undefined ? 1 : HP_SCALE[state] ?? 1))),
      ...(state === undefined ? {} : { state }),
    }
  })
  const clutter = Object.keys(w.clutter).length === 0 ? undefined : {
    seed: seedOf(`${site.id}:${window}`),
    areas: site.base.clutterAreas.map((a) => ({ ...a, density: w.clutter[a.id] ?? {} })),
  }
  for (const key of Object.keys(w.clutter)) {
    if (!site.base.clutterAreas.some((a) => a.id === key)) throw new Error(`site "${site.id}" window "${window}" has clutter for unknown area "${key}"`)
  }
  const airfield = parseAirfield({
    id: site.airfield, name: site.name,
    runway: site.base.runway, apron: site.base.apron, clearing: site.base.clearing,
    buildings, side: w.side, serviceable: w.serviceable,
    ...(clutter === undefined ? {} : { clutter }),
    reference: { source: site.reference.source },
  })
  if (airfield.clutter !== undefined && clutterTotal(airfield.clutter) > CLUTTER_CEILING) {
    throw new Error(`site "${site.id}" window "${window}": ${clutterTotal(airfield.clutter)} clutter instances exceed the ceiling ${CLUTTER_CEILING}`)
  }
  return airfield
}

type Expanded = { readonly scenario: Scenario; readonly airfields: Readonly<Record<string, Airfield>> }

/**
 * The scenario with its `sites` merged in for the given windows (a campaign's `world`): each built site's airfield
 * (which replaces any same-id base from `content/bases`), its stationary vehicles and parked aircraft, and its lights.
 * Returns the scenario untouched, with no airfields, when it names no sites. The result is re-parsed, so every scenario
 * rule (unique ids, light caps, known airfields) holds for the merged content too.
 */
export function expandScenario(scenario: Scenario, sites: Readonly<Record<string, Site>>, windows: Readonly<Record<string, string>>): Expanded {
  if (scenario.sites === undefined) return { scenario, airfields: {} }
  const airfields: Record<string, Airfield> = {}
  const vehicles: ScenarioVehicle[] = []
  const aircraft: ScenarioAircraft[] = []
  const lights: LightSpec[] = []
  const dropped = new Set<string>()
  for (const siteId of scenario.sites) {
    const site = sites[siteId]
    if (site === undefined) throw new Error(`scenario "${scenario.id}" names site "${siteId}", which was not loaded`)
    const window = windowOf(windows, siteId)
    const field = airfieldFor(site, window)
    if (field === null) { dropped.add(site.airfield); continue }
    airfields[field.id] = field
    const w = site.windows[window]!
    const heading = (runwayHeadingRad(field) * 180) / Math.PI
    if (w.vehicles.length > VEHICLE_CAP) throw new Error(`site "${siteId}" window "${window}": ${w.vehicles.length} vehicles exceed the cap ${VEHICLE_CAP}`)
    for (const v of w.vehicles) {
      const at = localToWorld(field, v.x, v.z)
      vehicles.push({ id: v.id, spec: v.spec, waypoints: [[at.x, at.z]], speedMps: 0, loop: false, headingDeg: heading + v.headingDeg, side: v.side ?? w.side })
    }
    for (const p of w.parked) {
      aircraft.push({ id: p.id, spec: p.spec, parkedAt: { airfield: field.id, spot: { x: p.x, z: p.z } }, chocked: true, side: p.side ?? w.side })
    }
    for (const l of w.lights) {
      const at = l.at as { x: number; z: number; altitudeM?: number }
      const world = localToWorld(field, at.x, at.z)
      lights.push({ ...l, at: { x: world.x, z: world.z, ...(at.altitudeM === undefined ? {} : { altitudeM: at.altitudeM }) } })
    }
  }
  const named = scenario.airfields.filter((a) => !dropped.has(a))
  const merged = [...new Set([...named, ...Object.keys(airfields)])]
  if (merged.length === 0) throw new Error(`scenario "${scenario.id}": none of its sites has a field in the chosen windows and it names no other airfield`)
  const next = parseScenario({
    ...scenario,
    airfields: merged,
    vehicles: [...scenario.vehicles, ...vehicles],
    aircraft: [...scenario.aircraft, ...aircraft],
    ...(lights.length === 0 && scenario.lights === undefined ? {} : { lights: [...(scenario.lights ?? []), ...lights] }),
  })
  return { scenario: next, airfields }
}

/**
 * DEV `?siteState=tacloban:buildup,dulag:assault` (F8A Task 9): which sites to merge into whatever scenario loads, and in
 * which window. `null` when the query has none. A malformed pair or an unknown window throws, loudly, because this is a
 * developer asking for a state and a silent fallback would show the wrong one.
 */
export function siteStateFromQuery(search: string): { readonly sites: readonly string[]; readonly windows: Readonly<Record<string, string>> } | null {
  const raw = new URLSearchParams(search).get('siteState')
  if (raw === null || raw === '') return null
  const windows: Record<string, string> = {}
  for (const pair of raw.split(',')) {
    const [site, window, ...rest] = pair.split(':')
    if (site === undefined || site === '' || window === undefined || rest.length > 0) throw new Error(`siteState: "${pair}" is not <site>:<window>`)
    if (!WINDOW_IDS.includes(window)) throw new Error(`siteState: "${window}" is not a window (${WINDOW_IDS.join(', ')})`)
    windows[site] = window
  }
  return { sites: Object.keys(windows), windows }
}

/** The scenario with `sites` named (kept in order, no repeats), for the loader to expand. */
export const withSiteNames = (scenario: Scenario, sites: readonly string[]): Scenario =>
  ({ ...scenario, sites: [...new Set([...(scenario.sites ?? []), ...sites])] })
