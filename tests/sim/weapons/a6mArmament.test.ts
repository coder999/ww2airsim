import { describe, it, expect } from 'vitest'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { createState, type Controls } from '../../../src/sim/flight/state.js'
import { advance, createWorldOf, type AircraftEntity, type Stepper } from '../../../src/sim/loop.js'
import { DT } from '../../../src/sim/flight/model.js'
import { v3 } from '../../../src/sim/math/vec3.js'
import { gunBallistics, isPrimaryGun } from '../../../src/sim/weapons/gunTypes.js'
import { gunHarmonization } from '../../../src/sim/weapons/harmonization.js'
import { damageFromHit, healthyDamage } from '../../../src/sim/damage/model.js'
import { ammoRemaining } from '../../../src/render/combatReadout.js'
import type { AircraftSpec } from '../../../src/sim/flight/schema.js'

const zero = loadAircraftSpec('a6m2-zero')
const f6f = loadAircraftSpec('f6f-hellcat')
const zc = zero.combat!
const MG = 'type97-7.7mm', CANNON = 'type99-20mm'

const hitsToKill = (target: AircraftSpec, hitScale: number) => {
  let d = healthyDamage(), n = 0
  while (d.destroyedAt === null && n < 1000) { d = damageFromHit(target, d, 'fuel', 1, 'x', hitScale); n++ }
  return n
}

describe('A6M2 armament (AAF memo 23 Oct 1942; Summary 85)', () => {
  it('two cowl 7.7 mm with 500 rounds each, two wing 20 mm with 60 each', () => {
    const byType = (t: string) => zc.guns.filter((g) => g.type === t)
    expect(byType(MG).map((g) => g.rounds)).toEqual([500, 500])
    expect(byType(CANNON).map((g) => g.rounds)).toEqual([60, 60])
    expect(zc.guns.reduce((s, g) => s + g.rounds, 0)).toBe(1120)
    for (const t of [MG, CANNON]) expect(byType(t).map((g) => g.group).sort()).toEqual(['leftGuns', 'rightGuns'])
  })

  it('its primary ballistic is the 7.7 mm, which is what the AI leads with (spec §5)', () => {
    expect(gunBallistics(zc, undefined)).toEqual({ ...gunBallistics(zc, MG), hitScale: 1 })
    expect(zc.guns.map((g) => isPrimaryGun(zc, g))).toEqual(zc.guns.map((g) => g.type === MG))
  })

  it('harmonizes its sight to the cowl guns by default, not to a cannon-and-rifle average', () => {
    expect(gunHarmonization(zc, zero.view.eyePointM).gunCount).toBe(2)
  })

  it('a 20 mm shell kills an F6F in 4 hits and a 7.7 mm bullet in 30, against 12 for a .50 (spec §5)', () => {
    expect(hitsToKill(f6f, gunBallistics(zc, CANNON).hitScale)).toBe(4)
    expect(hitsToKill(f6f, gunBallistics(zc, MG).hitScale)).toBe(30)
    expect(hitsToKill(f6f, 1)).toBe(12)
  })

  it('no armor, no self-sealing tanks: the same .50 fire kills it in fewer hits, and it leaks faster', () => {
    expect(hitsToKill(zero, 1)).toBeLessThan(hitsToKill(f6f, 1))
    expect(zc.fuelLeakKgPerS).toBeGreaterThan(f6f.combat!.fuelLeakKgPerS)
  })

  it('a 10 s burst empties the cannon (60 rounds at 520 rpm is 6.9 s) and leaves the 7.7 mm firing', () => {
    const still: Stepper = (_s, state, _c, ctx) => ({ ...state, tick: ctx.tick })
    const idle: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0 }
    const state = createState({ position: v3(0, 1000, 0) })
    const me: AircraftEntity = { id: 'zero', spec: zero, state, previous: state, controls: { ...idle, fire: true }, assistMemory: undefined, impact: null, parked: false }
    let w = createWorldOf({ aircraft: [me], player: 'zero' })
    for (let i = 0; i < 600; i++) w = advance(w, DT, still).world
    const ammo = w.combat.aircraft.zero!.guns.map((g) => g.ammo)
    zc.guns.forEach((g, i) => {
      if (g.type === CANNON) expect(ammo[i]).toBe(0)
      // 650 rpm synchronized for 10 s is 108.3 rounds.
      else { expect(ammo[i]).toBeGreaterThanOrEqual(390); expect(ammo[i]).toBeLessThanOrEqual(393) }
    })
    // The HUD's AMMO readout (spec §5) still sums across the mixed battery.
    expect(ammoRemaining(w.combat.aircraft.zero!)).toBe(ammo.reduce((s, a) => s + a, 0))
  })

  it('every hit zone sits inside a 12.0 m span and a 9.06 m length', () => {
    for (const z of zc.zones) {
      expect(Math.abs(z.center[2]) + z.halfSize[2]).toBeLessThanOrEqual(6.0)
      expect(Math.abs(z.center[0]) + z.halfSize[0]).toBeLessThanOrEqual(4.53)
    }
  })
})
