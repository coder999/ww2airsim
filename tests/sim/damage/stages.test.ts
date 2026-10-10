import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BURN_S, ENGINE_DEAD_BELOW, FIRE_AT_STRUCTURE, SPUTTER_BELOW, SPUTTER_MAX_CUT, ageDamage, damageFromHit, engineOutput, healthyDamage, isDoomed, type Damage } from '../../../src/sim/damage/model.js'
import { DT } from '../../../src/sim/flight/model.js'
import { advance, WRECK_TERMINAL_MPS, type World } from '../../../src/sim/loop.js'
import { length } from '../../../src/sim/math/vec3.js'
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

describe('every combat airframe catches fire before a single-caliber stream destroys it', () => {
  it('enrolls every airframe with a combat block (the four bombers have none, so take no hits)', () => {
    expect(COMBAT_IDS).toEqual(['a6m2-zero', 'd3a-val', 'f4f-wildcat', 'f4u-corsair', 'f6f-hellcat', 'ki-43-oscar', 'ki-84-frank', 'p-38-lightning'])
  })
  it.each(COMBAT_IDS)('%s', (id) => {
    const spec = loadAircraftSpec(id)
    let d: Damage = healthyDamage()
    let hits = 0
    while (d.destroyedAt === null) {
      d = damageFromHit(spec, d, 'roll', 10 + hits, 'shooter')
      hits++
      if (d.burningSince === null) expect(d.structure, `${id} hit ${hits}`).toBeGreaterThan(FIRE_AT_STRUCTURE)
    }
    // It burned on some hit before the last, and that hit named the shooter.
    expect(d.burningSince, id).not.toBeNull()
    expect(d.burningSince!, id).toBeLessThan(d.destroyedAt)
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
