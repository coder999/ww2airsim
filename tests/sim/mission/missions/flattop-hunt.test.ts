/**
 * Flattop Hunt, flown headless (Track F, 2026-10-10).
 *
 * Content measurements at implementation:
 * - The player starts 19.7 km (12.3 mi) from Zuikaku, with Essex 12.0 km
 *   behind. The opening call rounds the target range to twelve miles.
 * - The carrier group uses Convoy Strike's long, water-verified racetrack,
 *   so the attack meets a steady leg instead of a turn. Every loop and both
 *   escort offsets pass `assertLoopOverWater` on the committed L1 field.
 * - D3's flood tuning makes a Mk 13 worth 1.6 times its 136-point blow over
 *   60 s: two full hits leave a 600-point carrier afloat, three sink it.
 * - Three independent veteran AI Avengers support the player. This is E2's
 *   existing attack order, not E3 formation bombing.
 */
import { describe, expect, it } from 'vitest'
import { loadAircraftSpec, loadScenarioBundle, loadShipSpec } from '../../../../tools/content/load.js'
import { worldFromScenario } from '../../../../src/sim/scenario.js'
import { playerAircraft } from '../../../../src/sim/loop.js'
import { sideOf } from '../../../../src/sim/sides.js'
import { FLOOD_DAMAGE_FRACTION } from '../../../../src/sim/weapons/flooding.js'
import { missionOutcome, recoveryOf } from '../../../../src/sim/mission/outcome.js'
import { ticksFor } from '../../../../src/sim/mission/state.js'
import { progressOf } from '../fixture.js'
import { carrierApproach, destroyNow, hold, levelAt, terrainOrSkip } from '../fly.js'

const ATTACKERS = ['avenger-2', 'avenger-3', 'avenger-4']
const TARGET = 'zuikaku'
const ON_STRIKE = levelAt({ x: -70000, z: 8000 }, 800, 90, 225)

describe('Flattop Hunt content', () => {
  it('puts the player and three allied veteran Avengers on E2 torpedo attacks against hostile Zuikaku', () => {
    const bundle = loadScenarioBundle('flattop-hunt')
    const w = worldFromScenario(bundle, null, 'bombs')
    expect(playerAircraft(w).spec.id).toBe('tbm-3-avenger')
    expect(w.ships.find((s) => s.id === TARGET)?.spec.id).toBe('zuikaku-cv')
    expect(sideOf(w, w.ships.find((s) => s.id === TARGET)!)).toBe('axis')
    for (const id of ATTACKERS) {
      const a = bundle.scenario.aircraft.find((candidate) => candidate.id === id)!
      expect(a).toMatchObject({
        spec: 'tbm-3-avenger',
        side: 'allied',
        pilot: { skill: 'veteran', ingress: { destination: { ship: TARGET }, attack: 'torpedo' } },
      })
      expect(w.combat.aircraft[id]!.stores).toMatchObject({ bombs: 1, rockets: 0 })
    }
  })

  it('starts about twelve miles from the carrier and points the player at it', () => {
    const w = worldFromScenario(loadScenarioBundle('flattop-hunt'), null)
    const p = playerAircraft(w).state.position
    const target = w.ships.find((s) => s.id === TARGET)!.state.position
    const rangeM = Math.hypot(target.x - p.x, target.z - p.z)
    expect(rangeM / 1609.344).toBeGreaterThan(12)
    expect(rangeM / 1609.344).toBeLessThan(12.5)
    const headingDeg = ((Math.atan2(target.x - p.x, -(target.z - p.z)) * 180) / Math.PI + 360) % 360
    expect(headingDeg).toBeCloseTo(225, 0)
  })

  it('needs three complete Mk 13 hits to sink Zuikaku under the shipped flooding model', () => {
    const avenger = loadAircraftSpec('tbm-3-avenger')
    const torpedo = avenger.stores!.types.mk13!
    const hp = loadShipSpec('zuikaku-cv').hullHp
    const fullHit = torpedo.damage * (1 + FLOOD_DAMAGE_FRACTION)
    expect(2 * fullHit).toBeLessThan(hp)
    expect(3 * fullHit).toBeGreaterThanOrEqual(hp)
  })

  it('the supporting strike releases three torpedoes and sinks Zuikaku under live AA on the actual route', () => {
    let w = worldFromScenario(loadScenarioBundle('flattop-hunt'), null, 'bombs')
    w = hold(w, ON_STRIKE, ticksFor(420))
    expect(ATTACKERS).toHaveLength(3)
    for (const id of ATTACKERS) {
      expect(w.combat.aircraft[id]!.bombsDropped, `${id} released`).toBe(1)
    }
    expect(w.combat.ships[TARGET]!.destroyedTick).not.toBeNull()
    expect(progressOf(w, 'flattop').status).toBe('complete')
  })
})

const terrain = terrainOrSkip()

describe.skipIf(terrain === null)('Flattop Hunt, headless', () => {
  it('builds every ship loop over the real terrain field', () => {
    expect(() => worldFromScenario(loadScenarioBundle('flattop-hunt'), terrain)).not.toThrow()
  })

  it('success: Zuikaku goes down, the player traps aboard Essex, and earns the badge', () => {
    let w = worldFromScenario(loadScenarioBundle('flattop-hunt'), terrain)
    w = hold(destroyNow(w, [TARGET]), ON_STRIKE, 2)
    expect(progressOf(w, 'flattop').status).toBe('complete')
    w = destroyNow(w, ATTACKERS)
    w = carrierApproach(w, 'cv-1')
    expect(playerAircraft(w).impact).toBeNull()
    expect(missionOutcome(w.mission!, recoveryOf(w)!)).toMatchObject({
      result: 'success', badge: { id: 'flattop-hunt', name: 'Flattop Hunt' }, reasons: [],
    })
  })

  it('failure: trapping aboard Essex while Zuikaku survives earns no badge', () => {
    let w = destroyNow(worldFromScenario(loadScenarioBundle('flattop-hunt'), terrain), ATTACKERS)
    w = carrierApproach(w, 'cv-1')
    expect(missionOutcome(w.mission!, recoveryOf(w)!)).toMatchObject({
      result: 'no-badge', badge: null, reasons: ['Flattop: incomplete', 'Recover: incomplete'],
    })
  })
})
