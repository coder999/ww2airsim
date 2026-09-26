import { describe, it, expect } from 'vitest'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { parseAircraftSpec } from '../../../src/sim/content.js'
import { createState, type Controls } from '../../../src/sim/flight/state.js'
import { advance, createWorldOf, type AircraftEntity, type Stepper } from '../../../src/sim/loop.js'
import { DT } from '../../../src/sim/flight/model.js'
import { v3, length, sub } from '../../../src/sim/math/vec3.js'
import { gunBallistics, isPrimaryGun } from '../../../src/sim/weapons/gunTypes.js'
import { damageFromHit, healthyDamage } from '../../../src/sim/damage/model.js'
import type { AircraftSpec } from '../../../src/sim/flight/schema.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const c = f6f.combat!
const still: Stepper = (_s, state, _c, ctx) => ({ ...state, tick: ctx.tick })
const idle: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0 }
const plane = (spec: AircraftSpec, id: string, x: number, fire: boolean): AircraftEntity => {
  const state = createState({ position: v3(x, 1000, 0) })
  return { id, spec, state, previous: state, controls: { ...idle, fire }, assistMemory: undefined, impact: null, parked: false }
}
const run = (shooter: AircraftSpec, target: AircraftSpec, ticks: number) => {
  let w = createWorldOf({ aircraft: [plane(shooter, 'shooter', 0, true), plane(target, 'target', 300, false)], player: 'shooter' })
  for (let i = 0; i < ticks; i++) w = advance(w, DT, still).world
  return w
}
/** The F6F with every mount typed to a type identical to its top level. */
const typedLike = (hitScale: number): AircraftSpec => parseAircraftSpec({
  ...f6f,
  combat: {
    ...c,
    gunTypes: { m2: { roundsPerMinute: c.roundsPerMinute, muzzleVelocityMps: c.muzzleVelocityMps, dragPerM: c.dragPerM, hitScale } },
    guns: c.guns.map((g) => ({ ...g, type: 'm2' })),
  },
})
/** Two slow mounts and four at the top-level ballistic. */
const mixed = parseAircraftSpec({
  ...f6f,
  combat: {
    ...c,
    gunTypes: { slow: { roundsPerMinute: 400, muzzleVelocityMps: 600, dragPerM: 0.000125, hitScale: 3 } },
    guns: c.guns.map((g, i) => (i === 0 || i === 3 ? { ...g, type: 'slow' } : g)),
  },
})

describe('combat.gunTypes: content validation', () => {
  it('rejects a mount naming a type that does not exist', () => {
    expect(() => parseAircraftSpec({ ...f6f, combat: { ...c, guns: [{ ...c.guns[0]!, type: 'nope' }] } }))
      .toThrow(/gun type "nope"/)
  })
  it('rejects a misspelled key inside a type, and a non-positive hitScale', () => {
    const t = { roundsPerMinute: 500, muzzleVelocityMps: 600, dragPerM: 0.0001, hitScale: 1 }
    expect(() => parseAircraftSpec({ ...f6f, combat: { ...c, gunTypes: { a: { ...t, hitscale: 2 } } } })).toThrow(/hitscale/)
    expect(() => parseAircraftSpec({ ...f6f, combat: { ...c, gunTypes: { a: { ...t, hitScale: 0 } } } })).toThrow(/hitScale/)
  })
  it('requires the top-level ballistic to be at least one mount\'s, since the AI leads with it', () => {
    const t = { roundsPerMinute: 500, muzzleVelocityMps: 600, dragPerM: 0.0001, hitScale: 1 }
    expect(() => parseAircraftSpec({ ...f6f, combat: { ...c, gunTypes: { a: t }, guns: c.guns.map((g) => ({ ...g, type: 'a' })) } }))
      .toThrow(/primary/)
  })
})

describe('gunBallistics and isPrimaryGun', () => {
  it('an untyped mount uses the top-level fields and hits at scale 1', () => {
    expect(gunBallistics(c, undefined)).toEqual({ roundsPerMinute: 800, muzzleVelocityMps: 883.92, dragPerM: 0.00015, hitScale: 1 })
    expect(c.guns.every((g) => isPrimaryGun(c, g))).toBe(true)
  })
  it('a typed mount uses its type; a type slower than the top level is not primary', () => {
    const m = mixed.combat!
    expect(gunBallistics(m, 'slow').muzzleVelocityMps).toBe(600)
    expect(m.guns.map((g) => isPrimaryGun(m, g))).toEqual([false, true, true, false, true, true])
    expect(() => gunBallistics(m, 'missing')).toThrow(/missing/)
  })
})

describe('per-gun firing', () => {
  it('leaves the F6F bit-identical: typing every gun to its own values changes nothing but the tag', () => {
    const plain = run(f6f, f6f, 180).combat
    const typed = run(typedLike(1), f6f, 180).combat
    const untag = (s: typeof typed) => ({
      ...s,
      projectiles: s.projectiles.map((p) => { const rest: Record<string, unknown> = { ...p }; delete rest['gunType']; return rest }),
    })
    expect(untag(typed)).toEqual(plain)
    expect(plain.projectiles.every((p) => !('gunType' in p))).toBe(true)
  })

  it('fires each mount at its own cadence and muzzle velocity', () => {
    const w = run(mixed, f6f, 60)
    const guns = w.combat.aircraft.shooter!.guns
    const fired = guns.map((g, i) => mixed.combat!.guns[i]!.rounds - g.ammo)
    // 400 rpm is 6.67 rounds a second; 800 rpm is 13.33.
    expect(fired[0]).toBeGreaterThanOrEqual(6)
    expect(fired[0]).toBeLessThanOrEqual(7)
    expect(fired[1]).toBeGreaterThanOrEqual(13)
    expect(fired[1]).toBeLessThanOrEqual(14)
    const slow = w.combat.projectiles.filter((p) => p.gunType === 'slow')
    expect(slow.length).toBeGreaterThan(0)
    for (const p of slow) expect(length(sub(p.position, p.previous)) / DT).toBeLessThan(620)
  })

  it('a round carries its hitScale to the target: three times the damage kills an F6F in 4 hits, not 12', () => {
    const w = run(typedLike(3), f6f, 180).combat
    expect(w.aircraft.target!.damage.destroyedAt).not.toBeNull()
    expect(w.aircraft.shooter!.hits).toBe(4)
  })
})

describe('damageFromHit hitScale', () => {
  const hitsToKill = (hitScale: number) => {
    let d = healthyDamage(), n = 0
    while (d.destroyedAt === null && n < 1000) { d = damageFromHit(f6f, d, 'fuel', 1, 'x', hitScale); n++ }
    return n
  }
  it('defaults to 1, bit for bit', () => {
    expect(damageFromHit(f6f, healthyDamage(), 'engine', 1, 'x')).toEqual(damageFromHit(f6f, healthyDamage(), 'engine', 1, 'x', 1))
  })
  it('scales the target\'s damagePerHit: 12 hits at 1, 4 at 3, 30 at 0.4', () => {
    expect(hitsToKill(1)).toBe(12)
    expect(hitsToKill(3)).toBe(4)
    expect(hitsToKill(0.4)).toBe(30)
  })
})
