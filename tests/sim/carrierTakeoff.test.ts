import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import { loadAircraftSpec, loadScenario, bundleForScenario, loadShipSpec } from '../../tools/content/load.js'
import { loadTerrainHeader, loadTerrainLevel } from '../../tools/terrain/load.js'
import { finestFetchedLevelFor, INTERIM_ASSET_QUALITY_TIER } from '../../src/render/content.js'
import { createTerrainField, SEA_LEVEL_M } from '../../src/sim/world/terrain.js'
import { worldFromScenario } from '../../src/sim/scenario.js'
import { advance, playerAircraft, withControls, type World } from '../../src/sim/loop.js'
import { DT, airVelocity } from '../../src/sim/flight/model.js'
import { deckOf, deckLocal } from '../../src/sim/world/deck.js'
import { stateOnDeck } from '../../src/sim/mission/respot.js'
import { onGround, effectiveStallSpeedMps } from '../../src/sim/ground.js'
import { wheelDepthOf } from '../../src/sim/gearContact.js'
import { length, v3 } from '../../src/sim/math/vec3.js'

/**
 * Can every shipped airplane launch off every shipped carrier deck, with no
 * catapult, at the shipped default fuel load, in calm air with the ship at
 * maximum speed? (T1, 2026-09-28.) Both lists are discovered from
 * content/, so a new aircraft spec or carrier is covered the day it lands.
 *
 * The pilot is a policy, not the game: start 7 m from the stern, full back
 * stick once airspeed reaches 40 m/s. After the airplane leaves the deck
 * (either wheels off before the bow, or rolling off the bow on its wheels) it
 * lowers the nose to 1.05 x stall speed and then pulls just enough to stop
 * sinking. Holding full stick stalls and is not a credible pilot. The
 * thresholds below come from the 2026-09-28 measurements (Casablanca's worst
 * sag was 2.6 m of its 12 m deck height; the tightest liftoff was the F6F with
 * flaps 1, 1 m before the bow).
 */

const LEVEL = finestFetchedLevelFor(INTERIM_ASSET_QUALITY_TIER)
const START_FROM_STERN_M = 7
const PULL_AIRSPEED_MPS = 40
const NOSE_DOWN_STALL_MULTIPLE = 1.05
const NOSE_DOWN_PITCH = -0.3
const POST_LIFTOFF_S = 10
/** Lowest the wheels may get above the water after leaving the deck. Measured worst case is 9.4 m over a 12 m deck. */
const MIN_CLEARANCE_M = 2
const MAX_STEPS_ON_DECK = 60 * 40

/** Known gaps. Empty: every pairing passed when this was written. A pairing added here must carry a date and a reason, and the guard below fails if it starts passing so the entry gets removed. */
const KNOWN_EXCEPTIONS: readonly string[] = []

const contentIds = (dir: string): string[] =>
  readdirSync(new URL(`../../content/${dir}/`, import.meta.url)).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort()
/**
 * Aircraft the picker can put on a deck. 2026-09-29: the B-17 (carrierCapable
 * false, docs/aircraft.md D3) runs out of the Casablanca's 139 m and touches
 * the water, as the failure text's own second fix option says to expect: "do
 * not offer this carrier to this type". The picker already does not (D3), so it
 * is not a pairing a player can reach outside Dev. It is filtered here by the
 * spec's own flag, not by a KNOWN_EXCEPTIONS entry, so no other type is
 * affected: the B-17 was the only carrierCapable false spec when this was
 * written.
 */
const aircraftIds = contentIds('aircraft').filter((id) => loadAircraftSpec(id).carrierCapable)
const carrierIds = contentIds('ships').filter((id) => loadShipSpec(id).flightDeck !== undefined)

interface Outcome { readonly ok: boolean; readonly detail: string }

function launch(terrain: ReturnType<typeof createTerrainField>, shipId: string, aircraftId: string, flaps: 0 | 1): Outcome {
  const shipSpec = loadShipSpec(shipId)
  const spec = loadAircraftSpec(aircraftId)
  const shipSpeed = shipSpec.maxSpeedMps
  const sc0 = loadScenario('deck-quals')
  const sc = {
    ...sc0,
    aircraft: sc0.aircraft.map((a) => (a.id === sc0.player ? { ...a, spec: aircraftId, parkedAt: { ship: 'cv-1', spot: { x: 0, z: -60 } } } : a)),
    ships: sc0.ships.map((x) => (x.id === 'cv-1' ? { ...x, spec: shipId } : x)),
  }
  let world: World<undefined> = worldFromScenario(bundleForScenario(sc as typeof sc0), terrain)
  world = { ...world, ships: world.ships.map((s) => {
    if (s.id !== 'cv-1') return s
    const h = s.state.headingRad
    const fwd = { x: Math.sin(h), z: -Math.cos(h) }
    const p = s.state.position
    const orders = { speedMps: shipSpeed, waypoints: [{ x: p.x + fwd.x * 5e4, z: p.z + fwd.z * 5e4 }, { x: p.x + fwd.x * 1e5, z: p.z + fwd.z * 1e5 }] }
    const st = { ...s.state, speedMps: shipSpeed, waypoint: 0, velocity: v3(fwd.x * shipSpeed, 0, fwd.z * shipSpeed) }
    return { ...s, spec: shipSpec, orders, state: st, previous: st }
  }), wind: null }
  const deck = deckOf(world.ships.find((s) => s.id === 'cv-1')!)!
  const startZ = -deck.lengthM / 2 + START_FROM_STERN_M
  // No fuelKg: the shipped default load (createState), which is what the game starts with.
  const st = stateOnDeck(spec, deck, { x: 0, z: startZ }, { flapFraction: flaps })
  world = { ...world, aircraft: world.aircraft.map((a) => (a.id === world.player ? { ...a, state: st, previous: st, parked: false } : a)) }
  const stall = effectiveStallSpeedMps(spec, flaps)
  const ctl = (pitch: number) => ({ pitch, roll: 0, yaw: 0, throttle: 1, gearDown: true, flapDown: flaps === 1 })
  const air = (w: World<undefined>) => length(airVelocity(playerAircraft(w).state, w.wind))

  let left: 'liftoff' | 'bow' | null = null
  let rollM = 0
  for (let i = 0; i < MAX_STEPS_ON_DECK && left === null; i++) {
    world = advance(withControls(world, world.player, ctl(air(world) >= PULL_AIRSPEED_MPS ? 1 : 0)), DT).world
    const n = playerAircraft(world).state
    const dn = deckOf(world.ships.find((x) => x.id === 'cv-1')!)!
    const loc = deckLocal(dn, n.position.x, n.position.z)
    rollM = loc.z - startZ
    if (playerAircraft(world).impact) return { ok: false, detail: 'impact on the deck' }
    if (!onGround(spec, n, dn.center.y, dn.velocity)) left = 'liftoff'
    else if (loc.z > dn.lengthM / 2) left = 'bow'
  }
  if (left === null) return { ok: false, detail: `never left the deck in ${MAX_STEPS_ON_DECK / 60} s` }

  let minClearance = Infinity
  for (let k = 0; k < 60 * POST_LIFTOFF_S; k++) {
    const s = playerAircraft(world).state
    const pitch = air(world) < NOSE_DOWN_STALL_MULTIPLE * stall ? NOSE_DOWN_PITCH : Math.max(0, Math.min(1, -s.velocity.y * 0.2))
    world = advance(withControls(world, world.player, ctl(pitch)), DT).world
    const a = playerAircraft(world)
    minClearance = Math.min(minClearance, a.state.position.y - wheelDepthOf(spec, a.state) - SEA_LEVEL_M)
    if (a.impact) return { ok: false, detail: `${left === 'bow' ? 'left the bow on its wheels' : 'lifted off'} after ${rollM.toFixed(0)} m of a ${(deck.lengthM - START_FROM_STERN_M).toFixed(0)} m run, then touched the water` }
  }
  const vy = playerAircraft(world).state.velocity.y
  const ok = minClearance >= MIN_CLEARANCE_M && vy > -1
  return { ok, detail: `${left} after ${rollM.toFixed(0)} m of ${(deck.lengthM - START_FROM_STERN_M).toFixed(0)} m; lowest wheel height ${minClearance.toFixed(1)} m (need ${MIN_CLEARANCE_M}); final vertical speed ${vy.toFixed(1)} m/s (need > -1)` }
}

describe('carrier take-off, every aircraft off every carrier (T1)', () => {
  it('discovers something to test', () => {
    expect(aircraftIds).toContain('f6f-hellcat')
    expect(carrierIds).toContain('essex-cv')
    expect(carrierIds).toContain('casablanca-cve')
  })

  const header = loadTerrainHeader()
  const terrain = createTerrainField(header, LEVEL, loadTerrainLevel(LEVEL, header))
  const cases: [string, string, 0 | 1][] = []
  for (const ship of carrierIds) for (const ac of aircraftIds) for (const flaps of [0, 1] as const) cases.push([ship, ac, flaps])

  it.each(cases)('%s / %s / flaps %i', (ship, ac, flaps) => {
    const out = launch(terrain, ship, ac, flaps)
    const key = `${ship}/${ac}/${flaps}`
    if (KNOWN_EXCEPTIONS.includes(key)) {
      expect(out.ok, `${key} is a listed known exception but now passes: remove it from KNOWN_EXCEPTIONS`).toBe(false)
      return
    }
    expect(
      out.ok,
      `${ship} cannot launch ${ac} with flaps ${flaps} at maximum ship speed in calm air, default fuel, no catapult: ${out.detail}. ` +
        'Fix options: give the mission wind over the deck (world wind blowing against the ship adds to the airflow), restrict the aircraft for this mission ' +
        '(do not offer this carrier to this type), or shorten the load (less fuel). Do not loosen this test.',
    ).toBe(true)
  })
})
