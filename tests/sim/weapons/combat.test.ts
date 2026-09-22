import { describe, it, expect } from 'vitest'
import { loadAircraftSpec, loadScenarioBundle } from '../../../tools/content/load.js'
import { parseAircraftSpec } from '../../../src/sim/content.js'
import { createState, type Controls } from '../../../src/sim/flight/state.js'
import { advance, createWorldOf, withControls, type AircraftEntity, type Stepper } from '../../../src/sim/loop.js'
import { DT } from '../../../src/sim/flight/model.js'
import { v3 } from '../../../src/sim/math/vec3.js'
import { createCombat, flyProjectile, stepCombat, type Projectile } from '../../../src/sim/weapons/combat.js'
import { segmentBox } from '../../../src/sim/weapons/geometry.js'
import { ageDamage, damagedSpec, damageFromHit, healthyDamage } from '../../../src/sim/damage/model.js'
import { worldFromScenario } from '../../../src/sim/scenario.js'
import { createTerrainField } from '../../../src/sim/world/terrain.js'
import { parseTerrainHeader } from '../../../src/sim/world/schema.js'

const spec = loadAircraftSpec('f6f-hellcat')
const controls: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0, fire: true }
const still: Stepper = (_spec, state, _controls, ctx) => ({ ...state, tick: ctx.tick })
const plane = (id: string, x: number, fire = false): AircraftEntity => {
  const state = createState({ position: v3(x, 1000, 0) })
  return { id, spec, state, previous: state, controls: { ...controls, fire }, assistMemory: undefined, impact: null, parked: false }
}
const world = () => createWorldOf({ aircraft: [plane('shooter', 0, true), plane('target', 300)], player: 'shooter' })
const run = (w = world(), ticks = 60) => {
  for (let i = 0; i < ticks; i++) w = advance(w, DT, still).world
  return w
}
const projectile: Projectile = {
  id: 1, owner: 'shooter', position: v3(0, 1000, 0), previous: v3(0, 1000, 0),
  velocity: v3(100, 0, 0), lifeS: 3, tracer: false, kind: 'round', ageS: 0,
}

describe('combat content', () => {
  it('rejects malformed ammunition, geometry and non-finite ballistics', () => {
    expect(spec.combat!.guns).toHaveLength(6)
    expect(spec.combat!.guns.reduce((s, g) => s + g.rounds, 0)).toBe(2400)
    for (const value of [NaN, Infinity, -1, 0]) {
      expect(() => parseAircraftSpec({ ...spec, combat: { ...spec.combat, muzzleVelocityMps: value } })).toThrow(/muzzleVelocityMps/)
    }
    expect(() => parseAircraftSpec({ ...spec, combat: { ...spec.combat, typo: 1 } })).toThrow(/typo/)
    expect(() => parseAircraftSpec({ ...spec, combat: { ...spec.combat, guns: [{ ...spec.combat!.guns[0], rounds: 0.5 }] } })).toThrow(/rounds/)
    expect(() => parseAircraftSpec({ ...spec, combat: { ...spec.combat, zones: [spec.combat!.zones[0], spec.combat!.zones[0]] } })).toThrow(/duplicate/)
  })
})

describe('ballistics and swept contacts', () => {
  it('has real flight time and gravitational drop', () => {
    const p = flyProjectile(projectile, 0.5, null, 0)
    expect(p.position.x).toBe(50)
    expect(p.position.y).toBeCloseTo(1000 - 0.5 * 9.80665 * 0.25, 10)
    expect(p.velocity.y).toBeCloseTo(-9.80665 * 0.5, 10)
    expect(p.lifeS).toBe(2.5)
    expect(p.previous).toEqual(projectile.position)
  })
  it('drag reads wind while calm gravity stays unchanged', () => {
    const calm = flyProjectile(projectile, 0.1, null, 0.001)
    const tail = flyProjectile(projectile, 0.1, v3(50, 0, 0), 0.001)
    expect(calm.velocity.x).toBeLessThan(tail.velocity.x)
    expect(tail.velocity.x).toBeLessThan(100)
  })
  it('catches a thin box crossed between endpoints and rejects a nearby miss', () => {
    expect(segmentBox(v3(-20, 0, 0), v3(20, 0, 0), v3(0, 0, 0), v3(0.01, 1, 1))).toBeCloseTo(0.49975, 10)
    expect(segmentBox(v3(-20, 2, 0), v3(20, 2, 0), v3(0, 0, 0), v3(0.01, 1, 1))).toBeNull()
    expect(segmentBox(v3(0, 0, 0), v3(0, 0, 0), v3(0, 0, 0), v3(1, 1, 1))).toBe(0)
  })
  it('intersects a target that crosses the bullet during the tick', () => {
    const shooter = plane('shooter', -100)
    const target = plane('target', 0)
    const moving = { ...target, previous: { ...target.previous, position: v3(0, 1000, -10) }, state: { ...target.state, position: v3(0, 1000, 10) } }
    const c = { ...createCombat([shooter, moving]), projectiles: [{ ...projectile, position: v3(-10, 1000, 0), velocity: v3(1200, 0, 0) }] }
    const after = stepCombat(c, [shooter, moving], [], [], null, null, [], 1, DT)
    expect(after.aircraft.target!.damage.structure).toBeLessThan(1)
    expect(after.projectiles).toHaveLength(0)
  })
  it('consumes a shot on terrain before a target behind it', () => {
    const terrain = createTerrainField(parseTerrainHeader({ centreLatDeg: 10.8, centreLonDeg: 125.3, halfExtentM: 100000, finestSamples: 8193, levels: 13, encoding: 'int16-decimetres' }), 12, new Int16Array(9).fill(10000))
    const a = [plane('shooter', -100), plane('target', 10)]
    const c = { ...createCombat(a), projectiles: [{ ...projectile, position: v3(0, 999, 0), velocity: v3(1200, 0, 0) }] }
    const after = stepCombat(c, a, [], [], terrain, null, [], 1, DT)
    expect(after.projectiles).toHaveLength(0)
    expect(after.aircraft.target!.damage.structure).toBe(1)
  })
})

describe('production fixed-step gunnery', () => {
  it('emits at 800 rpm per gun, with every fifth round a tracer and no damage before arrival', () => {
    const one = run(world(), 1)
    expect(one.combat.aircraft.shooter!.shots).toBe(6)
    expect(one.combat.aircraft.shooter!.hits).toBe(0)
    expect(one.combat.projectiles).toHaveLength(6)
    const clear = createWorldOf({ aircraft: [plane('shooter', 0, true)], player: 'shooter' })
    const three = run(clear, 180)
    expect(three.combat.aircraft.shooter!.shots).toBe(240)
    expect(three.combat.aircraft.shooter!.guns.map(g => g.ammo)).toEqual(Array(6).fill(360))
    expect(three.combat.projectiles.filter(p => p.tracer)).toHaveLength(48)
    expect(three.combat.aircraft.shooter!.damage.structure).toBe(1)
  })
  it('stops on the nearest target and never awards duplicate kills', () => {
    const w = createWorldOf({ aircraft: [plane('shooter', 0, true), plane('far', 500), plane('near', 300)], player: 'shooter' })
    const after = run(w, 180)
    expect(after.combat.aircraft.near!.damage.destroyedAt).not.toBeNull()
    expect(after.combat.aircraft.far!.damage.structure).toBe(1)
    expect(after.combat.aircraft.shooter!.kills).toBe(1)
    expect(after.combat.aircraft.shooter!.hits).toBe(12)
    expect(after.combat.aircraft.near!.damage.attacker).toBe('shooter')
  })
  it('empties finite ammo, stops after release and expires all rounds', () => {
    const initial = createWorldOf({ aircraft: [plane('shooter', 0, true)], player: 'shooter' })
    const spent = run(initial, 1900)
    expect(spent.combat.aircraft.shooter!.shots).toBe(2400)
    expect(spent.combat.aircraft.shooter!.guns.every(g => g.ammo === 0)).toBe(true)
    expect(run(spent, 180).combat.projectiles).toHaveLength(0)
    const released = run(withControls(run(initial, 60), 'shooter', { ...controls, fire: false }), 200)
    expect(released.combat.aircraft.shooter!.shots).toBe(84)
    expect(released.combat.projectiles).toHaveLength(0)
  })
  it('preserves deterministic continuation through a clone and multi-tick calls', () => {
    const halfway = run(world(), 18)
    expect(run(structuredClone(halfway), 42)).toEqual(run(halfway, 42))
    let batched = world()
    for (let i = 0; i < 20; i++) batched = advance(batched, 3 * DT, still).world
    expect(batched.combat).toEqual(run(world(), 60).combat)
    expect(advance(halfway, 0, still).world).toBe(halfway)
    expect(world().combat.aircraft.shooter!.guns[0]!.ammo).toBe(400)
  })
  it('cannot fire a disabled gun group or a destroyed airplane', () => {
    let w = world()
    const rec = w.combat.aircraft.shooter!
    w = { ...w, combat: { ...w.combat, aircraft: { ...w.combat.aircraft, shooter: { ...rec, damage: { ...rec.damage, leftGuns: 0 } } } } }
    expect(run(w, 1).combat.aircraft.shooter!.shots).toBe(3)
    w = { ...w, combat: { ...w.combat, aircraft: { ...w.combat.aircraft, shooter: { ...rec, damage: { ...rec.damage, destroyedAt: 0, structure: 0 } } } } }
    expect(run(w, 10).combat.aircraft.shooter!.shots).toBe(0)
  })
  it('loads the range through the same scenario constructor as the browser', () => {
    const range = worldFromScenario(loadScenarioBundle('gunnery-range'), null)
    expect(range.aircraft.map(a => a.id)).toEqual(['f6f-1', 'target-1', 'target-2'])
    expect(range.combat.aircraft['f6f-1']!.guns).toHaveLength(6)
  })
})

describe('damage effects', () => {
  it('preserves the healthy spec and reduces only the hit system', () => {
    expect(damagedSpec(spec, healthyDamage())).toBe(spec)
    const hit = damageFromHit(spec, healthyDamage(), 'roll', 1, 'other')
    const effective = damagedSpec(spec, hit)
    expect(effective.rates.maxRollRateDegPerSec).toBeLessThan(spec.rates.maxRollRateDegPerSec)
    expect(effective.rates.maxPitchRateDegPerSec).toBe(spec.rates.maxPitchRateDegPerSec)
    expect(effective.engine.maxPowerW).toBe(spec.engine.maxPowerW)
  })
  it('progresses a hit engine to seizure without healing or negative health', () => {
    let d = damageFromHit(spec, healthyDamage(), 'engine', 1, 'other')
    expect(damagedSpec(spec, d).engine.staticThrustN).toBeLessThan(spec.engine.staticThrustN)
    for (let i = 0; i < 6000; i++) d = ageDamage(spec, d, DT)
    expect(d.engine).toBe(0)
    expect(damagedSpec(spec, d).engine.maxPowerW).toBe(0)
    expect(ageDamage(spec, healthyDamage(), 100)).toEqual(healthyDamage())
  })
  it('applies fuel leakage and reduced engine power through advance', () => {
    let w = createWorldOf({ aircraft: [{ ...plane('shooter', 0), controls: { ...controls, fire: false, throttle: 1 } }], player: 'shooter' })
    const rec = w.combat.aircraft.shooter!
    w = { ...w, combat: { ...w.combat, aircraft: { shooter: { ...rec, damage: { ...rec.damage, fuel: 0, engine: 0 } } } } }
    let power = -1
    const probe: Stepper = (s, state, _c, ctx) => { power = s.engine.maxPowerW; return { ...state, tick: ctx.tick } }
    const after = advance(w, DT, probe).world
    expect(power).toBe(0)
    expect(after.aircraft[0]!.state.fuelKg).toBeCloseTo(400 - spec.combat!.fuelLeakKgPerS * DT, 10)
  })
})
