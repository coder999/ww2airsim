import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BURN_S, ENGINE_DEAD_BELOW, FIRE_AT_STRUCTURE, SPUTTER_BELOW, SPUTTER_MAX_CUT, ageDamage, damagedSpec, damageFromHit, engineCountOf, engineHealths, engineOutput, engineOutputs, healthyDamage, isDoomed, type Damage } from '../../../src/sim/damage/model.js'
import { DT } from '../../../src/sim/flight/model.js'
import { createState } from '../../../src/sim/flight/state.js'
import { advance, createWorldOf, WRECK_TERMINAL_MPS, type World } from '../../../src/sim/loop.js'
import { length, v3 } from '../../../src/sim/math/vec3.js'
import { duelWorld } from '../../../tools/ai/duel.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { flatField } from '../mission/fixture.js'

/**
 * Damage stages (plan 2026-10-09-aircraft-damage-stages, Mark's rulings): an
 * engine hit smokes, then sputters, then stalls; at FIRE_AT_STRUCTURE the
 * airframe catches fire and is doomed; it explodes when the fire has burnt it
 * out (or the next hits finish it), and the wreck falls to the surface. The
 * kill is credited at the explosion or the impact, never at the fire.
 */

const COMBAT_IDS = readdirSync('content/aircraft').filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5))
  .filter((id) => loadAircraftSpec(id).combat !== undefined)

describe('every combat airframe catches fire from a single-caliber stream, and then only the fire finishes it', () => {
  it('enrolls every airframe: since round 2 the bombers have combat blocks too', () => {
    expect(COMBAT_IDS).toEqual(['a6m2-zero', 'b-17-flying-fortress', 'b-29-superfortress', 'b5n2-kate', 'd3a-val', 'f4f-wildcat', 'f4u-corsair', 'f6f-hellcat', 'g4m-betty', 'ki-21-sally', 'ki-43-oscar', 'ki-84-frank', 'p-38-lightning', 'pby-5a-catalina', 'tbm-3-avenger'])
  })
  it.each(COMBAT_IDS)('%s', (id) => {
    const spec = loadAircraftSpec(id)
    let d: Damage = healthyDamage()
    let hits = 0
    while (d.burningSince === null && hits < 1000) d = damageFromHit(spec, d, 'roll', 10 + hits++, 'shooter')
    expect(d.destroyedAt, id).toBeNull()
    expect(d.structure, id).toBeGreaterThan(0)
    expect(d.structure, id).toBeLessThanOrEqual(FIRE_AT_STRUCTURE + 1e-10)
    expect(d.attacker).toBe('shooter')
    // More hits change nothing: the fire burns it out (Mark: "fire drains its remaining structure").
    expect(damageFromHit(spec, d, 'engine', 999, 'someone-else')).toBe(d)
    let tick = 1000
    while (d.destroyedAt === null) d = ageDamage(spec, d, DT, ++tick)
    expect((tick - 1000) * DT).toBeLessThanOrEqual(BURN_S + DT)
    expect(d.attacker).toBe('shooter')
  })
})

describe('the fire burns an airframe out over BURN_S', () => {
  it('from the fire line to zero, then stops aging', () => {
    const spec = loadAircraftSpec('a6m2-zero')
    let d: Damage = { ...healthyDamage(), structure: FIRE_AT_STRUCTURE, burningSince: 0, attacker: 'shooter' }
    let tick = 0
    while (d.destroyedAt === null && tick < 10 * BURN_S / DT) d = ageDamage(spec, d, DT, ++tick)
    expect(tick * DT).toBeCloseTo(BURN_S, 1)
    expect(d.attacker).toBe('shooter')
    expect(ageDamage(spec, d, DT, tick + 1)).toBe(d)
  })
})

describe('the engine: health, then sputter, then dead', () => {
  const at = (engine: number, extra: Partial<Damage> = {}): Damage => ({ ...healthyDamage(), engine, ...extra })
  const windows = (d: Damage, id: string): number[] => Array.from({ length: 4000 }, (_, t) => engineOutput(d, t * 15, id, DT))
  it('runs at its health above the sputter line, never cutting out', () => {
    expect(windows(at(0.6), 'a').every((p) => p === 0.6)).toBe(true)
  })
  it('cuts out in a share of windows that grows as the health falls', () => {
    const share = (e: number): number => windows(at(e), 'a').filter((p) => p === 0).length / 4000
    const mid = (SPUTTER_BELOW + ENGINE_DEAD_BELOW) / 2
    expect(share(mid)).toBeCloseTo(SPUTTER_MAX_CUT / 2, 1)
    expect(share(ENGINE_DEAD_BELOW + 0.01)).toBeGreaterThan(share(mid))
    expect(share(SPUTTER_BELOW - 0.01)).toBeLessThan(share(mid))
  })
  it('is the same cut for the same tick and id, and differs between airplanes', () => {
    expect(windows(at(0.3), 'a')).toEqual(windows(at(0.3), 'a'))
    expect(windows(at(0.3), 'a')).not.toEqual(windows(at(0.3), 'b'))
  })
  it('is dead below the stall line, burning, or destroyed', () => {
    expect(engineOutput(at(ENGINE_DEAD_BELOW - 0.01), 0, 'a', DT)).toBe(0)
    expect(engineOutput(at(1, { burningSince: 3 }), 0, 'a', DT)).toBe(0)
    expect(engineOutput(at(1, { destroyedAt: 3 }), 0, 'a', DT)).toBe(0)
  })
})

describe('a multi-engine airplane loses its engines one at a time (round 2)', () => {
  it.each(['b-17-flying-fortress', 'b-29-superfortress', 'g4m-betty', 'ki-21-sally', 'p-38-lightning'])('%s', (id) => {
    const spec = loadAircraftSpec(id)
    const n = engineCountOf(spec)
    // One engine per prop, so a dead engine's prop is the one that windmills.
    expect(n, id).toBe(id === 'b-17-flying-fortress' || id === 'b-29-superfortress' ? 4 : 2)
    let d: Damage = healthyDamage(n)
    let hits = 0
    while (engineHealths(d)[0]! > 0 && hits < 1000) d = damageFromHit(spec, d, 'engine', ++hits, 'shooter', 1, 0)
    expect(engineHealths(d).slice(1).every((h) => h === 1), id).toBe(true)
    // Engine 0 dead, the rest whole: (n - 1) / n of the power, and not doomed by that alone.
    expect(engineOutput(d, 0, id, DT)).toBeCloseTo((n - 1) / n, 12)
    expect(engineOutputs(d, 0, id, DT)[0]).toBe(0)
    expect(isDoomed(d)).toBe(false)
  })
  it('a bomber hit only in its engines ages each one on its own', () => {
    const spec = loadAircraftSpec('b-17-flying-fortress')
    let d = damageFromHit(spec, healthyDamage(4), 'engine', 1, 'x', 1, 3)
    const hit = engineHealths(d)[3]!
    for (let t = 0; t < 600; t++) d = ageDamage(spec, d, DT, t)
    expect(engineHealths(d).slice(0, 3)).toEqual([1, 1, 1])
    expect(engineHealths(d)[3]!).toBeLessThan(hit)
  })
})

describe('asymmetric multi-engine thrust', () => {
  const ids = ['b-17-flying-fortress', 'b-29-superfortress', 'g4m-betty', 'ki-21-sally', 'p-38-lightning'] as const

  it.each(ids)('%s derives equal and opposite yaw from the measured engine arms', (id) => {
    const spec = loadAircraftSpec(id)
    const n = engineCountOf(spec)
    const whole = Array<number>(n).fill(1)
    // A fully healthy array must return the original object, not merely an equal
    // one. Other symmetric output retains old behavior but may still scale power.
    expect(damagedSpec(spec, healthyDamage(n), whole)).toBe(spec)

    const portDead = [...whole]
    portDead[0] = 0
    const starboardDead = [...whole]
    starboardDead[n - 1] = 0
    const portYaw = damagedSpec(spec, healthyDamage(n), portDead).asymmetricThrustYaw?.rateDegPerSec
    const starboardYaw = damagedSpec(spec, healthyDamage(n), starboardDead).asymmetricThrustYaw?.rateDegPerSec
    // Body +Y is nose-left. A live starboard engine therefore turns toward a
    // dead port engine; reversing the failed side reverses the turn exactly.
    expect(portYaw, id).toBeGreaterThan(0)
    expect(starboardYaw, id).toBeLessThan(0)
    expect(portYaw, id).toBeCloseTo(-starboardYaw!, 12)
  })

  it.each(['b-17-flying-fortress', 'b-29-superfortress'] as const)('%s weights an outer loss more than an inner loss', (id) => {
    const spec = loadAircraftSpec(id)
    const whole = [1, 1, 1, 1]
    const outer = damagedSpec(spec, healthyDamage(4), [0, ...whole.slice(1)]).asymmetricThrustYaw!.rateDegPerSec
    const inner = damagedSpec(spec, healthyDamage(4), [1, 0, 1, 1]).asymmetricThrustYaw!.rateDegPerSec
    expect(Math.abs(outer), id).toBeGreaterThan(Math.abs(inner))
  })

  it('keeps the damaged single-engine flight derivation unchanged and exposes its indicated output', () => {
    const spec = loadAircraftSpec('f6f-hellcat')
    const damage = { ...healthyDamage(), engine: 0.5 }
    const scalar = damagedSpec(spec, damage, 0.5)
    expect(damagedSpec(spec, damage, [0.5])).toStrictEqual({ ...scalar, engineOutputs: [0.5] })
  })

  const productionYaw = (engines: readonly [number, number], yaw: number): number => {
    const spec = loadAircraftSpec('g4m-betty')
    const state = createState({
      position: v3(0, 2000, 0),
      velocity: v3(spec.rates.rateRefSpeedMps, 0, 0),
    })
    const fixture = duelWorld('tail', 'veteran', 'green', 0)
    const player = fixture.aircraft.find((aircraft) => aircraft.id === 'p')!
    const world = createWorldOf({
      aircraft: [{
        ...player,
        pilot: null,
        spec,
        state,
        previous: state,
        controls: { ...player.controls, roll: 0, pitch: 0, yaw: 0, throttle: 1 },
      }],
      player: 'p',
    })
    const record = world.combat.aircraft.p!
    const damaged = {
      ...world,
      combat: {
        ...world.combat,
        aircraft: {
          ...world.combat.aircraft,
          p: { ...record, damage: { ...healthyDamage(2), engines, engine: 0.5, yaw } },
        },
      },
    }
    const after = advance(damaged, DT).world
    return after.aircraft.find((aircraft) => aircraft.id === 'p')!.state.bodyRates.y
  }

  it.each([
    { side: 'port', engines: [0, 1] as const, sign: 1 },
    { side: 'starboard', engines: [1, 0] as const, sign: -1 },
  ])('keeps $side engine-out yaw independent of partial and zero yaw-control health through production advance', ({ engines, sign }) => {
    const intact = productionYaw(engines, 1)
    expect(Math.sign(intact)).toBe(sign)
    for (const yaw of [0.4, 0]) {
      const damaged = productionYaw(engines, yaw)
      expect(Math.sign(damaged), `yaw health ${yaw}`).toBe(sign)
      expect(damaged, `yaw health ${yaw}`).toBeCloseTo(intact, 12)
    }
  })
})

/** b on fire, set alight by a, `heightM` up, over a flat sea. */
function burning(heightM: number): World<undefined> {
  const w = duelWorld('tail', 'veteran', 'green', 0)
  const rec = w.combat.aircraft['b']!
  return {
    ...w,
    terrain: flatField(0),
    // a is parked out of the fight, so nothing but the fire touches b.
    aircraft: w.aircraft.map((x) => x.id === 'b'
      ? { ...x, state: { ...x.state, position: { ...x.state.position, y: heightM } }, previous: { ...x.previous, position: { ...x.previous.position, y: heightM } } }
      : x.id === 'a' ? { ...x, pilot: null, state: { ...x.state, position: { ...x.state.position, z: 20000 } }, previous: { ...x.previous, position: { ...x.previous.position, z: 20000 } } } : x),
    combat: { ...w.combat, aircraft: { ...w.combat.aircraft, b: { ...rec, lastHitBy: 'a', damage: { ...rec.damage, structure: FIRE_AT_STRUCTURE, burningSince: 0, attacker: 'a' } } } },
  }
}

describe('a burning airplane through production advance', () => {
  it('falls with its engine dead, explodes after BURN_S, and only then is a kill', () => {
    let w = burning(3500)
    const start = w.aircraft.find((a) => a.id === 'b')!.state.position.y
    while (w.combat.aircraft['b']!.damage.destroyedAt === null && w.tick < 2 * BURN_S / DT) {
      w = advance(w, DT).world
      expect(w.combat.aircraft['a']!.kills, `tick ${w.tick}`).toBe(w.combat.aircraft['b']!.damage.destroyedAt === null ? 0 : 1)
      expect(w.aircraft.find((a) => a.id === 'b')!.controls.fire).toBe(false)
    }
    expect(w.tick * DT).toBeCloseTo(BURN_S, 1)
    expect(w.combat.aircraft['a']!.kills).toBe(1)
    expect(w.combat.aircraft['a']!.killsByType.fighter).toBe(1)
    // An AI pilot gives up: it went down, a long way, in 15 s.
    expect(start - w.aircraft.find((a) => a.id === 'b')!.state.position.y).toBeGreaterThan(300)
  })

  it('the wreck falls to the sea at no more than its terminal speed, and the kill is not counted twice', () => {
    let w = burning(3500)
    let peak = 0
    let explodedAtY = 0
    for (let i = 0; i < 300 / DT && w.aircraft.find((a) => a.id === 'b')!.impact === null; i++) {
      w = advance(w, DT).world
      const b = w.aircraft.find((a) => a.id === 'b')!
      if (w.combat.aircraft['b']!.damage.destroyedAt === w.tick) explodedAtY = b.state.position.y
      if (w.combat.aircraft['b']!.damage.destroyedAt !== null) peak = Math.max(peak, length(b.state.velocity))
    }
    const b = w.aircraft.find((a) => a.id === 'b')!
    expect(explodedAtY).toBeGreaterThan(0)
    expect(b.impact).not.toBeNull()
    expect(b.impact!.kind).toBe('destroyed')
    expect(b.impact!.surface).toBe('water')
    expect(w.combat.aircraft['a']!.kills).toBe(1)
    // Faster than terminal only by what it carried out of the explosion, falling off from there.
    expect(length(b.state.velocity)).toBeLessThan(Math.max(WRECK_TERMINAL_MPS * 1.05, peak))
  })

  it('a fire too low to burn out ends in the sea, and the kill is credited at the impact', () => {
    let w = burning(150)
    while (w.aircraft.find((a) => a.id === 'b')!.impact === null && w.tick < BURN_S / DT) {
      expect(w.combat.aircraft['a']!.kills).toBe(0)
      w = advance(w, DT).world
    }
    expect(w.combat.aircraft['b']!.damage.destroyedAt).toBeNull()
    expect(w.aircraft.find((a) => a.id === 'b')!.impact).not.toBeNull()
    expect(w.combat.aircraft['a']!.kills).toBe(1)
  })

  it('is doomed but not down: its pursuer drops it as a target', () => {
    const fresh = duelWorld('tail', 'veteran', 'green', 0)
    const before = advance(fresh, DT).world
    expect(before.aircraft.find((a) => a.id === 'a')!.pilot!.decision.targetId).toBe('b')
    const lit = burning(3500)
    const w = advance({ ...lit, aircraft: lit.aircraft.map((x) => x.id === 'a' ? fresh.aircraft.find((f) => f.id === 'a')! : x) }, DT).world
    expect(isDoomed(w.combat.aircraft['b']!.damage)).toBe(true)
    expect(w.aircraft.find((a) => a.id === 'b')!.impact).toBeNull()
    expect(w.aircraft.find((a) => a.id === 'a')!.pilot!.decision.targetId).toBeNull()
  })
})
