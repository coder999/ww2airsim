import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { runwayParkSpots } from '../../src/sim/ai/parkSpots.js'
import { localToWorld } from '../../src/sim/world/airfields.js'
import { heightAt } from '../../src/sim/world/terrain.js'
import { loadAircraftSpec, loadAirfield, loadScenario } from '../../tools/content/load.js'
import { terrainOrSkip } from '../sim/mission/fly.js'

const terrain = terrainOrSkip()

/** The shore threshold 13d uses. */
const LAND_M = 0.5
const FLAT_M = 2

const scenarioIds = readdirSync('content/scenarios').filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort()

/** Every airfield a scenario homes AI to, with the spans of the aircraft homed there. */
function homedSpans(id: string): Map<string, number[]> {
  const s = loadScenario(id)
  const out = new Map<string, number[]>()
  for (const a of [...s.aircraft, ...(s.heldGroups ?? []).flatMap((g) => g.aircraft ?? [])]) {
    const home = a.pilot?.home
    if (home === undefined || !('airfield' in home)) continue
    out.set(home.airfield, [...(out.get(home.airfield) ?? []), loadAircraftSpec(a.spec).geometry.wingSpanM])
  }
  return out
}

describe.skipIf(terrain === null)('a homed AI\'s park spots are on flat land (7g spec §7)', () => {
  it('at least one shipped scenario homes an AI to an airfield, so the loop below checks something', () => {
    expect(scenarioIds.some((id) => homedSpans(id).size > 0)).toBe(true)
  })

  it.each(scenarioIds)('%s', (id) => {
    for (const [airfieldId, spans] of homedSpans(id)) {
      const airfield = loadAirfield(airfieldId)
      const aim = localToWorld(airfield, 0, airfield.runway.lengthM / 4)
      const aimHeight = heightAt(terrain!, aim.x, aim.z)
      const spots = runwayParkSpots(airfield, Math.max(...spans)).slice(0, spans.length)
      expect(spots.length, `${airfieldId} spots`).toBe(spans.length)
      for (const spot of spots) {
        const w = localToWorld(airfield, spot.x, spot.z)
        const h = heightAt(terrain!, w.x, w.z)
        expect(h, `${id}: ${airfieldId} spot ${JSON.stringify(spot)} is land`).toBeGreaterThan(LAND_M)
        expect(Math.abs(h - aimHeight), `${id}: ${airfieldId} spot ${JSON.stringify(spot)} vs the aim point`).toBeLessThanOrEqual(FLAT_M)
      }
    }
  })
})
