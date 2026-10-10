import { describe, it, expect } from 'vitest'
import { advance, aircraftById } from '../../../src/sim/loop.js'
import { worldFromScenario } from '../../../src/sim/scenario.js'
import { loadScenarioBundle } from '../../../tools/content/load.js'
import { groundTruthTerrain } from '../../pilot/rangePass.js'

/**
 * The Range Test's sitting ducks (docs/superpowers/plans/2026-10-10-god-mode-range-test.md):
 * `pilot.passive` makes an AI airplane circle and never engage, evade or fire,
 * even with an enemy in front of it.
 */
const terrain = groundTruthTerrain()
/** The tightest circle this airplane's velocity controller holds at 80 m/s is about 1.8 km (measured 2026-10-10: a 1.5 km request settled at 1.82 km); ask for more than that. */
const RADIUS_M = 2000

function duckWorld() {
  const bundle = loadScenarioBundle('pursuit-range')
  // `pursuer-1` becomes the duck: the shipped scenario already puts the player
  // 2.5 km away, head-on, which is the hardest case for "never engages".
  const scenario = {
    ...bundle.scenario,
    aircraft: bundle.scenario.aircraft.map((a) => a.id === 'pursuer-1'
      ? { ...a, airborneAt: { ...a.airborneAt!, speedMps: 80 }, pilot: { skill: 'green' as const, passive: { orbitRadiusM: RADIUS_M } } }
      : a),
  }
  return worldFromScenario({ ...bundle, scenario }, terrain)
}

describe('a passive (sitting duck) pilot', () => {
  const start = duckWorld()
  const duck0 = aircraftById(start, 'pursuer-1')!
  let w = start
  const radii: number[] = []
  let minY = Infinity, maxY = -Infinity
  const centre = {
    x: duck0.state.position.x + RADIUS_M * Math.sin(Math.atan2(duck0.state.velocity.z, duck0.state.velocity.x)),
    z: duck0.state.position.z - RADIUS_M * Math.cos(Math.atan2(duck0.state.velocity.z, duck0.state.velocity.x)),
  }
  for (let i = 0; i < 120 * 60; i++) {
    w = advance(w, 1 / 60).world
    if (i % 60 === 0 && i > 20 * 60) {
      const d = aircraftById(w, 'pursuer-1')!
      radii.push(Math.hypot(d.state.position.x - centre.x, d.state.position.z - centre.z))
      minY = Math.min(minY, d.state.position.y); maxY = Math.max(maxY, d.state.position.y)
    }
  }
  const duck = aircraftById(w, 'pursuer-1')!

  it('never chooses a target, so it never engages', () => {
    expect(duck.pilot!.decision.targetId).toBeNull()
    expect(duck.pilot!.decision.mode).toBe('loiter')
  })

  it('never fires', () => {
    const rec = w.combat.aircraft['pursuer-1']!
    expect(rec.shots).toBe(0)
  })

  it('flies a circle close to the requested radius', () => {
    const mean = radii.reduce((a, b) => a + b, 0) / radii.length
    expect(Math.abs(mean - RADIUS_M) / RADIUS_M).toBeLessThan(0.15)
    expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(0.3 * RADIUS_M)
  })

  it('holds its altitude and stays alive and unhurt', () => {
    expect(maxY - minY).toBeLessThan(60)
    expect(duck.impact).toBeNull()
    expect(w.combat.aircraft['pursuer-1']!.damage.destroyedAt).toBeNull()
  })
})
