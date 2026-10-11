import { parseScenario, type Scenario, type ScenarioAircraft, type ScenarioShip } from './scenario.js'
import type { Side } from './sides.js'

/**
 * Entity-scaling measurement (plan 2026-10-10-entity-scaling): N extra AI aircraft and M extra ships
 * added to a scenario, so frame and sim cost can be read against entity count. A measuring tool, not
 * content: `main.ts` reads `?swarmAircraft=&swarmShips=&swarmLayout=` only behind `import.meta.env.DEV`
 * (`tests/build/dist.test.ts` asserts the names never reach a production bundle), and the headless sweep
 * (`tools/ai/swarmSweep.ts`) calls `withSwarm` directly.
 *
 * Aircraft come in groups of four of one type and side: a veteran leader and three green wingmen in
 * formation on it. Fighter leaders engage (they pick their own targets); bomber leaders fly an ingress
 * leg and, when the other side has a ship, orbit it, so that ship's AA has work. Bombers carry their
 * gunners (E3). Ships sail a two-point loop at 15 kn; their AA fires at the other side's airplanes as
 * in every scenario, their main batteries only where the scenario (or `?mainBatteries=all`) frees them.
 */
export const SWARM_PARAMS = { aircraft: 'swarmAircraft', ships: 'swarmShips', layout: 'swarmLayout' } as const
export const SWARM_LAYOUTS = ['tight', 'mission'] as const
export type SwarmLayout = (typeof SWARM_LAYOUTS)[number]
export type Swarm = { readonly aircraft: number; readonly ships: number; readonly layout: SwarmLayout }
/** Where the camera is and which way it looks: world meters, true heading in degrees (90 = east). */
export type SwarmAnchor = { readonly x: number; readonly y: number; readonly z: number; readonly headingDeg: number }

/**
 * Where the entity-scaling capture and sweep fly from: open water about 9 mi east of Tacloban's
 * longitude, at 2,950 ft, below free-flight's 4,900 ft cumulus base, heading east (the DEV spawn
 * override's heading). Both layouts' ships stay on water from here (`tests/sim/swarm.test.ts`
 * builds them over the real terrain).
 */
export const SWARM_PROBE_ANCHOR: SwarmAnchor = { x: -15000, y: 900, z: -25000, headingDeg: 90 }

/** Group types, cycled per side: a carrier-war mix, fighters first. */
const ALLIED_TYPES = ['f6f-hellcat', 'tbm-3-avenger', 'f4u-corsair', 'p-38-lightning'] as const
const AXIS_TYPES = ['a6m2-zero', 'd3a-val', 'ki-84-frank', 'g4m-betty', 'ki-43-oscar', 'b5n2-kate', 'ki-21-sally'] as const
const BOMBERS: ReadonlySet<string> = new Set(['tbm-3-avenger', 'd3a-val', 'g4m-betty', 'b5n2-kate', 'ki-21-sally'])
const ALLIED_SHIPS = ['fletcher-dd', 'cleveland-cl', 'essex-cv', 'fletcher-dd', 'pennsylvania-bb', 'casablanca-cve'] as const
const AXIS_SHIPS = ['kagero-dd', 'mogami-ca', 'shiratsuyu-dd', 'yamato-bb', 'abukuma-cl', 'zuikaku-cv', 'type-b-maru'] as const
const SHIP_SPEED_MPS = 7.717 // 15 kn
const SHIP_LEG_M = 20000

/** Wingman slots behind the leader, meters (back, right). */
const SLOT_OFFSETS: readonly (readonly [number, number])[] = [[-40, 40], [-40, -40], [-80, 0]]

/** The query's swarm, or `null` when it asks for none. Throws on a malformed value, like `?spawnX=`. */
export function swarmFromQuery(search: string): Swarm | null {
  const q = new URLSearchParams(search)
  if (!q.has(SWARM_PARAMS.aircraft) && !q.has(SWARM_PARAMS.ships)) return null
  const count = (name: string): number => {
    const raw = q.get(name)
    if (raw === null) return 0
    const n = Number(raw)
    if (raw.trim() === '' || !Number.isInteger(n) || n < 0) throw new Error(`swarm: ${name}=${JSON.stringify(raw)} is not a whole number`)
    return n
  }
  const layout = q.get(SWARM_PARAMS.layout) ?? 'tight'
  if (!(SWARM_LAYOUTS as readonly string[]).includes(layout)) throw new Error(`swarm: ${SWARM_PARAMS.layout}=${JSON.stringify(layout)} is not one of ${SWARM_LAYOUTS.join(', ')}`)
  return { aircraft: count(SWARM_PARAMS.aircraft), ships: count(SWARM_PARAMS.ships), layout: layout as SwarmLayout }
}

/** Anchor-relative offsets (forward, right, up) to a world point. */
function place(a: SwarmAnchor, forward: number, right: number, up = 0): [number, number, number] {
  const h = (a.headingDeg * Math.PI) / 180
  const [fx, fz, rx, rz] = [Math.sin(h), -Math.cos(h), Math.cos(h), Math.sin(h)]
  return [a.x + fx * forward + rx * right, a.y + up, a.z + fz * forward + rz * right]
}

/** A group's center as (forward, right, up) from the anchor. */
function groupCenter(layout: SwarmLayout, g: number, anchorY: number): [number, number, number] {
  if (layout === 'tight') {
    // A 5 x 3 grid inside the chase camera's 60 x 91 degree view, nearest row 1,150 ft out.
    const forward = 350 + 350 * (g % 5) + 150 * Math.floor(g / 15)
    return [forward, (Math.floor(g / 5) % 3 - 1) * 0.4 * forward, ((g % 3) - 1) * 0.1 * forward]
  }
  // Mission: groups pair off (allied 2p, axis 2p+1) into engagements. Pair 0 is the camera's, half a
  // mile ahead; the rest sit 5 to 12 mi out, spread by the golden angle over a 130 degree arc from
  // 20 degrees left of the heading round to the right, which from SWARM_PROBE_ANCHOR is the open gulf.
  const p = Math.floor(g / 2)
  const split = g % 2 === 0 ? -150 : 150
  if (p === 0) return [900, split, g % 2 === 0 ? 0 : 100]
  const range = 8000 + 4000 * ((p - 1) % 4)
  const bearing = ((-20 + ((p * 137.5) % 130)) * Math.PI) / 180
  const up = Math.max(300 - anchorY, 300 * ((p % 3) - 1))
  return [range * Math.cos(bearing), range * Math.sin(bearing) + split, up]
}

/** A ship's start as (forward, right) from the anchor. */
function shipStart(layout: SwarmLayout, i: number): [number, number] {
  if (layout === 'tight') return [2500 + 900 * (i % 5), (Math.floor(i / 5) % 4 - 1.5) * 800]
  // Mission: the allied task force 2.5 mi ahead of the camera, the axis force 15 mi off to starboard.
  const k = Math.floor(i / 2)
  const [f, r] = [700 * (k % 5), 700 * Math.floor(k / 5)]
  return i % 2 === 0 ? [4000 + f, r] : [12500 + f, 21650 + r]
}

/** `scenario` with the swarm added, re-validated (formation, ingress and side rules included). */
export function withSwarm(scenario: Scenario, swarm: Swarm, anchor: SwarmAnchor): Scenario {
  const ships: ScenarioShip[] = Array.from({ length: swarm.ships }, (_, i) => {
    const side: Side = i % 2 === 0 ? 'allied' : 'axis'
    const types = side === 'allied' ? ALLIED_SHIPS : AXIS_SHIPS
    const [f, r] = shipStart(swarm.layout, i)
    const [x0, , z0] = place(anchor, f, r)
    const [x1, , z1] = place(anchor, f + SHIP_LEG_M, r)
    return { id: `swarm-s${i}`, spec: types[Math.floor(i / 2) % types.length]!, side, waypoints: [[x0, z0], [x1, z1]], speedMps: SHIP_SPEED_MPS }
  })
  const firstShipOf = (side: Side): string | undefined => ships.find((s) => s.side === side)?.id
  const aircraft: ScenarioAircraft[] = Array.from({ length: swarm.aircraft }, (_, i) => {
    const g = Math.floor(i / 4)
    const slot = i % 4
    const side: Side = g % 2 === 0 ? 'allied' : 'axis'
    const types = side === 'allied' ? ALLIED_TYPES : AXIS_TYPES
    const spec = types[Math.floor(g / 2) % types.length]!
    const bomber = BOMBERS.has(spec)
    const [f, r, u] = groupCenter(swarm.layout, g, anchor.y)
    const [back, right] = slot === 0 ? [0, 0] : SLOT_OFFSETS[slot - 1]!
    const position = place(anchor, f + back, r + right, u)
    const speedMps = bomber ? 90 : 125
    const leader = `swarm-a${g * 4}`
    const enemyShip = firstShipOf(side === 'allied' ? 'axis' : 'allied')
    const [rx, , rz] = place(anchor, f + 30000, r)
    const pilot: ScenarioAircraft['pilot'] = slot !== 0
      ? { skill: 'green', leader, slot: slot as 1 | 2 | 3 }
      : bomber
        ? { skill: 'veteran', ingress: { route: [{ x: rx, z: rz, altitudeM: position[1], speedMps }], ...(enemyShip === undefined ? {} : { destination: { ship: enemyShip } }) } }
        : { skill: 'veteran' }
    return { id: `swarm-a${i}`, spec, side, airborneAt: { position, headingDeg: anchor.headingDeg, speedMps }, pilot }
  })
  return parseScenario({ ...scenario, aircraft: [...scenario.aircraft, ...aircraft], ships: [...scenario.ships, ...ships] })
}
