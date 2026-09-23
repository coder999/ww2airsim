import { describe, it, expect } from 'vitest'
import { combatDiagnosticsFor, combatReadoutLabel, damagedSystems } from '../../src/render/combatReadout.js'
import { initialFrameState } from '../../src/render/frame.js'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { createState } from '../../src/sim/flight/state.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { createCombat } from '../../src/sim/weapons/combat.js'
import { damageFromHit, healthyDamage } from '../../src/sim/damage/model.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const armed = () => createCombat([{ id: 'p', spec: f6f, state: createState({}), previous: createState({}), controls: { pitch: 0, roll: 0, yaw: 0, throttle: 0 }, impact: null }]).aircraft.p!

describe('the combat readout (Plan 6)', () => {
  it('shows a full load, no hits and full health for a fresh armed airplane', () => {
    expect(combatReadoutLabel(armed())).toBe('AMMO 2400   HITS 0   KILLS 0   HP 100%')
  })

  it('shows nothing for an airplane with no guns', () => {
    expect(combatReadoutLabel(undefined)).toBeNull()
    expect(combatReadoutLabel({ ...armed(), guns: [] })).toBeNull()
  })

  it('counts ammunition down across every gun and names each damaged system', () => {
    const rec = armed()
    const spent = { ...rec, guns: rec.guns.map((g, i) => ({ ...g, ammo: i === 0 ? 100 : g.ammo })), hits: 3, kills: 1 }
    const hurt = { ...spent, damage: damageFromHit(f6f, damageFromHit(f6f, healthyDamage(), 'engine', 1, 'x'), 'fuel', 2, 'x') }
    expect(combatReadoutLabel(hurt)).toBe('AMMO 2100   HITS 3   KILLS 1   HP 83%   DMG ENGINE, FUEL')
    expect(damagedSystems(hurt.damage)).toEqual(['engine', 'fuel'])
  })

  it('says DESTROYED instead of listing systems once the airplane is gone', () => {
    const rec = armed()
    const dead = { ...rec, damage: { ...rec.damage, structure: 0, engine: 0, destroyedAt: 9, attacker: 'x' } }
    expect(combatReadoutLabel(dead)).toBe('AMMO 2400   HITS 0   KILLS 0   HP 0%   DESTROYED')
  })

  it('shows current structural-limit warnings with measured values', () => {
    const rec = armed()
    const stressed = {
      ...rec,
      stress: {
        ...rec.stress,
        loadFactorG: 8.24,
        airspeedMps: 229.6,
        overG: true,
        overspeed: true,
        peakLoadFactorG: 9.1,
        peakAirspeedMps: 240,
      },
    }
    expect(combatReadoutLabel(stressed)).toBe(
      'AMMO 2400   HITS 0   KILLS 0   HP 100%   OVER-G 8.2   OVERSPEED 230',
    )
  })

  it('reports the frame the Tier 2 hook reads: the trigger the sim saw, the player and every target', () => {
    const frame = initialFrameState(f6f, createState({ position: v3(0, 1000, 0), velocity: v3(120, 0, 0) }))
    const d = combatDiagnosticsFor(frame)
    expect(d.player).toEqual({
      shots: 0, hits: 0, kills: 0, ammo: 2400, structure: 1, destroyed: false, firing: false,
      stores: { bombs: 0, rockets: 0 }, shipsSunk: 0, structuresDestroyed: 0,
      stress: {
        loadFactorG: 1, airspeedMps: 120, overG: false, overspeed: false,
        peakLoadFactorG: 1, peakAirspeedMps: 120,
      },
    })
    expect(d.aircraft.map((a) => a.id)).toEqual(frame.world.aircraft.map((a) => a.id))
    expect(d.projectiles).toBe(0)
    expect(d.tracers).toBe(0)
    expect(combatDiagnosticsFor({ ...frame, controls: { ...frame.controls, fire: true } }).player.firing).toBe(true)
  })

  it('shows stores remaining, B n  R n, only while any are carried (Plan 6b Task 9, spec §4)', () => {
    const rec = armed()
    expect(combatReadoutLabel(rec)).not.toContain('B ')
    const loaded = { ...rec, stores: { bombs: 2, rockets: 6 } }
    expect(combatReadoutLabel(loaded)).toBe('AMMO 2400   B 2  R 6   HITS 0   KILLS 0   HP 100%')
    const bombsOnly = { ...rec, stores: { bombs: 1, rockets: 0 } }
    expect(combatReadoutLabel(bombsOnly)).toBe('AMMO 2400   B 1  R 0   HITS 0   KILLS 0   HP 100%')
    const empty = { ...rec, stores: { bombs: 0, rockets: 0 } }
    expect(combatReadoutLabel(empty)).toBe('AMMO 2400   HITS 0   KILLS 0   HP 100%')
  })

  it('shows SUNK and RAZED beside KILLS, only when non-zero (spec: "The readout counts SUNK and RAZED beside KILLS")', () => {
    const rec = armed()
    expect(combatReadoutLabel(rec)).not.toContain('SUNK')
    expect(combatReadoutLabel(rec)).not.toContain('RAZED')
    const sunkOne = { ...rec, shipsSunk: 1 }
    expect(combatReadoutLabel(sunkOne)).toBe('AMMO 2400   HITS 0   KILLS 0   SUNK 1   HP 100%')
    const razedTwo = { ...rec, structuresDestroyed: 2 }
    expect(combatReadoutLabel(razedTwo)).toBe('AMMO 2400   HITS 0   KILLS 0   RAZED 2   HP 100%')
    const both = { ...rec, shipsSunk: 1, structuresDestroyed: 2 }
    expect(combatReadoutLabel(both)).toBe('AMMO 2400   HITS 0   KILLS 0   SUNK 1   RAZED 2   HP 100%')
  })
})
