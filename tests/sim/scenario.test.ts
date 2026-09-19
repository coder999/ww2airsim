import { describe, it, expect } from 'vitest'
import { parseScenario, worldFromScenario, PARKED_PLACEHOLDER_Y_M, type ScenarioBundle } from '../../src/sim/scenario.js'
import { playerAircraft } from '../../src/sim/loop.js'
import { assertLoopOverWater, stepShip } from '../../src/sim/world/ships.js'
import { insideRect, insideRunway, worldToLocal } from '../../src/sim/world/airfields.js'
import { createTerrainField, heightAt, SEA_LEVEL_M } from '../../src/sim/world/terrain.js'
import { loadTerrainHeader, loadTerrainLevel, FIRST_COMMITTED_LEVEL } from '../../tools/terrain/load.js'
import { loadScenarioBundle } from '../../tools/content/load.js'
import { DT } from '../../src/sim/flight/model.js'
import { AIRFIELD_BUILDINGS } from '../../src/render/scene/airfield.js'

const bundle = loadScenarioBundle('free-flight')
const header = loadTerrainHeader()
const terrain = createTerrainField(header, FIRST_COMMITTED_LEVEL, loadTerrainLevel(FIRST_COMMITTED_LEVEL, header))

const withScenario = (patch: Partial<typeof bundle.scenario>): ScenarioBundle => ({
  ...bundle,
  scenario: { ...bundle.scenario, ...patch },
})

describe('the free-flight scenario', () => {
  it('parses, and names two aircraft, three ships and two airfields', () => {
    const w = worldFromScenario(bundle, null)
    expect(w.aircraft.map((a) => a.id)).toEqual(['f6f-1', 'f6f-2'])
    expect(w.ships.map((s) => s.id)).toEqual(['cv-1', 'dd-1', 'dd-2'])
    expect(w.airfields.map((a) => a.id)).toEqual(['tacloban', 'dulag'])
    expect(w.player).toBe('f6f-1')
    expect(w.tick).toBe(0)
    expect(w.terrain).toBeNull()
  })

  it('parks the player at the Tacloban runway center, nose north, gear down, at the placeholder height', () => {
    const p = playerAircraft(worldFromScenario(bundle, null))
    const tacloban = bundle.airfields['tacloban']!
    expect(p.state.position.x).toBe(tacloban.runway.center.x)
    expect(p.state.position.z).toBe(tacloban.runway.center.z)
    expect(p.state.position.y).toBe(PARKED_PLACEHOLDER_Y_M)
    expect(p.state.velocity).toEqual({ x: 0, y: 0, z: 0 })
    expect(p.state.gearFraction).toBe(1)
    expect(p.parked).toBe(true)
    expect(p.controls.brake ?? 0).toBe(0)
    expect(p.previous).toBe(p.state)
  })

  it('chocks the second Hellcat on the apron, clear of the strip and every building', () => {
    const w = worldFromScenario(bundle, null)
    const wingman = w.aircraft[1]!
    const tacloban = bundle.airfields['tacloban']!
    expect(wingman.controls.brake).toBe(1)
    expect(wingman.controls.gearDown).toBe(true)
    expect(wingman.parked).toBe(true)
    const { x, z } = wingman.state.position
    expect(insideRect(tacloban, tacloban.apron!, x, z)).toBe(true)
    expect(insideRunway(tacloban, x, z)).toBe(false)
    const local = worldToLocal(tacloban, x, z)
    for (const b of AIRFIELD_BUILDINGS) {
      const clearX = Math.abs(local.x - b.x) > b.width / 2 + 8
      const clearZ = Math.abs(local.z - b.z) > b.length / 2 + 8
      expect(clearX || clearZ, `wingman sits inside the ${b.kind} at (${b.x}, ${b.z})`).toBe(true)
    }
  })

  it('starts each ship at its first waypoint, pointing at its second, steering for it', () => {
    const w = worldFromScenario(bundle, null)
    for (const s of w.ships) {
      const wp = s.orders.waypoints
      expect(s.state.position.x).toBe(wp[0]!.x)
      expect(s.state.position.z).toBe(wp[0]!.z)
      expect(s.state.position.y).toBe(SEA_LEVEL_M)
      expect(s.state.waypoint).toBe(1)
      expect(s.state.speedMps).toBe(s.orders.speedMps)
      expect(s.previous).toBe(s.state)
    }
  })

  it('places the task force about 10.5 km from the Tacloban strip', () => {
    const w = worldFromScenario(bundle, null)
    const tac = bundle.airfields['tacloban']!.runway.center
    const cv = w.ships[0]!.state.position
    const km = Math.hypot(cv.x - tac.x, cv.z - tac.z) / 1000
    expect(km).toBeGreaterThan(9)
    expect(km).toBeLessThan(12)
  })
})

describe('the shipped loops on the real terrain (spec §5.4)', () => {
  it('every ideal leg is water', () => {
    for (const s of bundle.scenario.ships) {
      expect(() => assertLoopOverWater(s.id, { waypoints: s.waypoints.map(([x, z]) => ({ x, z })), speedMps: s.speedMps }, terrain)).not.toThrow()
    }
  })

  it('every ship sails one full lap of the track it actually steers, over water throughout', () => {
    const w = worldFromScenario(bundle, terrain)
    for (const ship of w.ships) {
      let s = ship.state
      let laps = 0
      let prevWaypoint = s.waypoint
      let maxHeight = -Infinity
      // 3 hours of simulated time is comfortably more than one lap of 42 km at 15 kn.
      for (let i = 0; i < 60 * 3600 * 3 && laps < 1; i++) {
        s = stepShip(ship.spec, s, ship.orders, { dt: DT, tick: i + 1 })
        maxHeight = Math.max(maxHeight, heightAt(terrain, s.position.x, s.position.z))
        if (s.waypoint === 0 && prevWaypoint !== 0) laps++
        prevWaypoint = s.waypoint
      }
      expect(laps, `${ship.id} never completed a lap`).toBe(1)
      expect(maxHeight, `${ship.id} touched land`).toBeLessThanOrEqual(SEA_LEVEL_M)
    }
  })

  it('worldFromScenario itself rejects a loop over land when handed terrain', () => {
    const overLand = withScenario({
      ships: [{ ...bundle.scenario.ships[0]!, waypoints: [[-29666, -47605], [-29666, -40000]] }],
    })
    expect(() => worldFromScenario(overLand, terrain)).toThrow(/cv-1.*leg/)
  })
})

describe('validation', () => {
  it('rejects a duplicate id across kinds, a missing player, an unknown spec and an unknown airfield', () => {
    expect(() => worldFromScenario(withScenario({ ships: [{ ...bundle.scenario.ships[0]!, id: 'f6f-1' }] }), null)).toThrow(/duplicate.*f6f-1/)
    expect(() => worldFromScenario(withScenario({ player: 'nobody' }), null)).toThrow(/player.*nobody/)
    expect(() => worldFromScenario(withScenario({ aircraft: [{ ...bundle.scenario.aircraft[0]!, spec: 'p-38' }] }), null)).toThrow(/p-38/)
    expect(() => worldFromScenario(withScenario({ aircraft: [{ ...bundle.scenario.aircraft[0]!, parkedAt: { airfield: 'ormoc', spot: 'runwayCenter' } }] }), null)).toThrow(/ormoc/)
  })

  it('the schema rejects an unknown key and a one-point loop', () => {
    const raw = JSON.parse(JSON.stringify(bundle.scenario)) as Record<string, unknown>
    expect(() => parseScenario({ ...raw, loadout: {} })).toThrow(/loadout/)
    expect(() => parseScenario({ ...raw, ships: [{ id: 'x', spec: 'essex-cv', waypoints: [[0, 0]], speedMps: 5 }] })).toThrow(/waypoints/)
    expect(() => parseScenario({ ...raw, weather: { windFromDeg: 0, windMps: -1 } })).toThrow(/windMps/)
    expect(() => parseScenario({ ...raw, weather: { windFromDeg: 0 } })).toThrow(/windMps/)
  })
})
