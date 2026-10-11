/**
 * Surigao Strait, flown headless (Track F, 2026-10-11).
 *
 * The mission begins after the night battle: Fuso and Yamashiro are already
 * sunk. Existing classes represent the dawn remnants while the player
 * pursues Mogami. Geometry keeps Mogami beyond M4's 25 km fire-control cap,
 * so the battle line cannot complete the player's strike objective.
 */
import { describe, expect, it } from 'vitest'
import { loadAircraftSpec, loadScenarioBundle, loadShipSpec } from '../../../../tools/content/load.js'
import { worldFromScenario } from '../../../../src/sim/scenario.js'
import { advance, playerAircraft } from '../../../../src/sim/loop.js'
import { sideOf } from '../../../../src/sim/sides.js'
import { DT } from '../../../../src/sim/flight/model.js'
import { MAIN_BATTERY } from '../../../../src/sim/weapons/mainBattery.js'
import { missionOutcome, recoveryOf } from '../../../../src/sim/mission/outcome.js'
import { progressOf } from '../fixture.js'
import { carrierApproach, destroyNow, terrainOrSkip } from '../fly.js'

const MOGAMI = 'mogami'
const ESSEX = 'cv-1'
const BATTLE_LINE = ['old-battle-1', 'cruiser-1', 'destroyer-1'] as const
const REAR_GUARD = ['abukuma', 'shigure', 'rear-destroyer'] as const
const ALL_COMBATANTS = [...BATTLE_LINE, ...REAR_GUARD]

/** Compass bearing, degrees in [0, 360): 0 north (-z), 90 east (+x). */
const bearingDeg = (from: { readonly x: number; readonly z: number }, to: { readonly x: number; readonly z: number }): number =>
  ((Math.atan2(to.x - from.x, -(to.z - from.z)) * 180) / Math.PI + 360) % 360

describe('Surigao Strait content', () => {
  it('is a dawn F6F pursuit of hostile Mogami while ordered surface groups fight behind it', () => {
    const bundle = loadScenarioBundle('surigao-strait')
    const { scenario } = bundle
    const w = worldFromScenario(bundle, null, 'both')

    expect(scenario.weather.timeOfDay).toBeGreaterThanOrEqual(6)
    expect(scenario.weather.timeOfDay).toBeLessThan(8)
    expect(scenario.mainBatteries).toBe(true)
    expect(playerAircraft(w).spec.id).toBe('f6f-hellcat')
    expect(scenario.briefing?.loadout).toBe('both')

    const mogami = w.ships.find((s) => s.id === MOGAMI)!
    expect(mogami.spec.id).toBe('mogami-ca')
    expect(sideOf(w, mogami)).toBe('axis')
    for (const id of BATTLE_LINE) {
      const ship = scenario.ships.find((s) => s.id === id)!
      expect(ship.side).toBe('allied')
      expect(ship.fireAt).toEqual(REAR_GUARD)
      expect(ship.fireAt).not.toContain(MOGAMI)
    }
    for (const id of REAR_GUARD) {
      const ship = scenario.ships.find((s) => s.id === id)!
      expect(ship.side ?? 'axis').toBe('axis')
      expect(ship.fireAt).toEqual(BATTLE_LINE)
    }
  })

  it('the recommended F6F loadout can sink Mogami, while bombs alone cannot', () => {
    const f6f = loadAircraftSpec('f6f-hellcat')
    const mogami = loadShipSpec('mogami-ca')
    const types = f6f.stores!.types
    const bomb = Object.values(types).find((t) => t.kind === 'bomb')!
    const rocket = Object.values(types).find((t) => t.kind === 'rocket')!
    const bombs = f6f.stores!.racks.length
    const rockets = f6f.stores!.rails.length
    expect(bombs * bomb.damage).toBeLessThan(mogami.hullHp)
    expect(bombs * bomb.damage + rockets * rocket.damage).toBeGreaterThanOrEqual(mogami.hullHp)
  })

  it('starts the player 7-12 miles from Mogami, pointed within five degrees of the pursuit', () => {
    const bundle = loadScenarioBundle('surigao-strait')
    const w = worldFromScenario(bundle, null)
    const p = playerAircraft(w).state.position
    const target = w.ships.find((s) => s.id === MOGAMI)!.state.position
    const miles = Math.hypot(target.x - p.x, target.z - p.z) / 1609.344
    expect(miles).toBeGreaterThan(7)
    expect(miles).toBeLessThan(12)
    const spawn = bundle.scenario.aircraft.find((a) => a.id === bundle.scenario.player)!
    if (!('airborneAt' in spawn)) throw new Error('the player is not airborne')
    const off = Math.abs(((bearingDeg(p, target) - spawn.airborneAt.headingDeg + 540) % 360) - 180)
    expect(off).toBeLessThan(5)
  })

  it('the battle line fires for five minutes without putting a shell into Mogami', () => {
    let w = worldFromScenario(loadScenarioBundle('surigao-strait'), null)
    const initialHp = w.combat.ships[MOGAMI]!.hp
    const fired = new Set<string>()
    let seen = 0
    for (let i = 0; i < Math.round(300 / DT); i++) {
      w = advance(w, DT).world
      for (const h of w.combat.impacts) {
        if (h.tick > seen && h.cause === 'shell' && h.outcome === 'fired') fired.add(h.mount!.ship)
      }
      seen = w.tick
    }
    expect(BATTLE_LINE.some((id) => fired.has(id))).toBe(true)
    expect(REAR_GUARD.some((id) => fired.has(id))).toBe(true)
    expect(w.combat.ships[MOGAMI]!.hp).toBe(initialHp)
    expect(w.combat.ships[MOGAMI]!.attacker).toBeNull()
    const battle = w.ships.find((s) => s.id === BATTLE_LINE[0])!.state.position
    const mogami = w.ships.find((s) => s.id === MOGAMI)!.state.position
    expect(Math.hypot(mogami.x - battle.x, mogami.z - battle.z)).toBeGreaterThan(MAIN_BATTERY.fireControlMaxM)
  }, 120_000)
})

const terrain = terrainOrSkip()

describe.skipIf(terrain === null)('Surigao Strait, headless', () => {
  it('builds every ship loop over the real terrain field', () => {
    expect(() => worldFromScenario(loadScenarioBundle('surigao-strait'), terrain)).not.toThrow()
  })

  it('success: Mogami goes down and a trap aboard Essex earns the badge', () => {
    let w = worldFromScenario(loadScenarioBundle('surigao-strait'), terrain)
    w = advance(destroyNow(w, [MOGAMI]), DT).world
    expect(progressOf(w, 'mogami').status).toBe('complete')
    w = carrierApproach(w, ESSEX)
    expect(playerAircraft(w).impact).toBeNull()
    expect(missionOutcome(w.mission!, recoveryOf(w)!)).toMatchObject({
      result: 'success', badge: { id: 'surigao-strait', name: 'Surigao Strait' }, reasons: [],
    })
  })

  it('failure: a trap while Mogami survives earns no badge', () => {
    let w = worldFromScenario(loadScenarioBundle('surigao-strait'), terrain)
    w = destroyNow(w, ALL_COMBATANTS)
    w = carrierApproach(w, ESSEX)
    expect(w.combat.ships[MOGAMI]!.hp).toBe(loadShipSpec('mogami-ca').hullHp)
    expect(missionOutcome(w.mission!, recoveryOf(w)!)).toMatchObject({
      result: 'no-badge', badge: null, reasons: ['Mogami: incomplete', 'Recover: incomplete'],
    })
  })
})
