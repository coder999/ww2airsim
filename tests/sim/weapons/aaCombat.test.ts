import { describe, expect, it } from 'vitest'
import { parseScenario, worldFromScenario } from '../../../src/sim/scenario.js'
import { bundleForScenario, loadScenarioBundle } from '../../../tools/content/load.js'
import { advance, playerAircraft, withControls, type World } from '../../../src/sim/loop.js'
import { DT } from '../../../src/sim/flight/model.js'
import { controlsForDesiredVelocity } from '../../../src/sim/ai/controller.js'
import { healthyDamage } from '../../../src/sim/damage/model.js'
import { v3 } from '../../../src/sim/math/vec3.js'
import { healthyShipDamage } from '../../../src/sim/weapons/combat.js'
import { AA_TUNING } from '../../../src/sim/weapons/aaFire.js'
import { crowdedWorld, runAa, worldFor } from './aaHarness.js'

/**
 * M2 through the real loop: a ship or battery shoots at the airplane of the other side, never its own,
 * a hit is credited to the ship that made it, and the cost stays bounded.
 */
const id = 'f6f-1'

/** Flies the harness's orbit for `seconds`, calling `each` after every tick. */
function orbit(w0: World<undefined>, seconds: number, each: (w: World<undefined>) => void = () => undefined, heal = false, c = { x: -27916, z: -48605 }): World<undefined> {
  let w = w0
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const me = playerAircraft(w)
    const p = me.state.position
    const dx = p.x - c.x, dz = p.z - c.z
    const r = Math.hypot(dx, dz) || 1
    w = withControls(w, id, controlsForDesiredVelocity(me.state, me.spec, v3((-dz / r) * 100, (91 - p.y) * 0.4, (dx / r) * 100 + ((500 - r) * 0.1 * dz) / r)))
    w = advance(w, DT).world
    if (heal) w = { ...w, combat: { ...w.combat, aircraft: { ...w.combat.aircraft, [id]: { ...w.combat.aircraft[id]!, damage: healthyDamage() } } } }
    each(w)
  }
  return w
}

describe('a hostile destroyer shoots at the Hellcat circling it', () => {
  it('fires AA rounds and flak, all owned by the ship', () => {
    const owners = new Set<string>()
    let flak = 0
    const w = orbit(worldFor('orbit', 3), 25, (x) => {
      for (const p of x.combat.projectiles) if (p.aa !== undefined) owners.add(p.owner)
      flak = Math.max(flak, x.combat.impacts.filter((i) => i.cause === 'flak').length)
    }, true)
    expect([...owners]).toEqual(['dd-1'])
    expect(flak).toBeGreaterThan(0)
    expect(w.combat.aircraft[id]!.lastHitBy).toBe('dd-1')
  })

  it('shot down, the airplane names the ship as its attacker; nobody scores, nothing friendly is recorded', () => {
    const r = runAa('orbit', 3, 'fletcher-dd', 80)
    expect(r.lostS).not.toBeNull()
    // Let the fire finish it.
    const w = orbit(r.world, 25)
    const rec = w.combat.aircraft[id]!
    expect(rec.damage.attacker).toBe('dd-1')
    expect(rec.damage.burningSince !== null || rec.damage.destroyedAt !== null).toBe(true)
    expect(rec.friendlyFire).toBeNull()
    // The ship is no airplane: it has no kill record to credit, and it is untouched.
    expect(w.combat.aircraft['dd-1']).toBeUndefined()
    expect(w.combat.ships['dd-1']!.hp).toBe(160)
    expect(w.combat.ships['dd-1']!.destroyedTick).toBeNull()
  })

  it('never fires at its own side: the same ship flagged allied leaves the Hellcat alone', () => {
    const w0 = worldFor('orbit', 3, 'fletcher-dd', 'allied')
    const w = orbit(w0, 40, (x) => {
      expect(x.combat.projectiles.some((p) => p.aa !== undefined)).toBe(false)
    })
    expect(w.combat.aa).toBe(w0.combat.aa) // not even a timer was touched
    expect(w.combat.aircraft[id]!.damage.structure).toBe(1)
  })

  it('a ship that has been destroyed stops firing', () => {
    const w0 = worldFor('orbit', 3)
    const sunk: World<undefined> = { ...w0, combat: { ...w0.combat, ships: { ...w0.combat.ships, 'dd-1': { ...healthyShipDamage(160), hp: 0, destroyedTick: 1 } } } }
    const w = orbit(sunk, 20, (x) => expect(x.combat.projectiles.some((p) => p.aa !== undefined)).toBe(false))
    expect(w.combat.aircraft[id]!.damage.structure).toBe(1)
  })

  it('light rounds hurt only an airplane: no ship or building takes one, no splash is recorded per round', () => {
    const w = orbit(worldFor('orbit', 3), 25, undefined, true)
    expect(w.combat.ships['dd-1']!.hp).toBe(160)
    // The impact ring holds hits on the airplane and flak, never a round into the sea.
    for (const i of w.combat.impacts) {
      if (i.cause === 'round') expect(i.surface).toBe('aircraft')
      else expect(i.cause).toBe('flak')
    }
  })
})

describe('both sides fire: an allied ship shoots a Japanese raider', () => {
  it('a sitting-duck Zero circling an allied destroyer at 300 ft is hit, and its attacker is the ship', () => {
    const base = JSON.parse(JSON.stringify(loadScenarioBundle('aa-range').scenario)) as Record<string, unknown>
    const scenario = parseScenario({
      ...base, airfieldSides: { tacloban: 'allied' },
      aircraft: [
        { id, spec: 'f6f-hellcat', airborneAt: { position: [-20000, 1500, -48605], headingDeg: 90, speedMps: 120 } },
        { id: 'duck', spec: 'a6m2-zero', side: 'axis', airborneAt: { position: [-27916 + 600, 91, -48605], headingDeg: 0, speedMps: 56, throttle: 0.4 }, pilot: { skill: 'green', passive: { orbitRadiusM: 600 } } },
      ],
      ships: [{ id: 'dd-1', spec: 'fletcher-dd', side: 'allied', waypoints: [[-27916, -48605]], speedMps: 0 }],
    })
    let w = worldFromScenario(bundleForScenario(scenario), null)
    for (let i = 0; i < 60 * 60 && w.combat.aircraft['duck']!.damage.structure === 1; i++) w = advance(w, DT).world
    const duck = w.combat.aircraft['duck']!
    expect(duck.damage.structure, 'the destroyer shot the raider').toBeLessThan(1)
    expect(duck.lastHitBy).toBe('dd-1')
    expect(duck.friendlyFire).toBeNull()
    // And the player, on the ship's side and far away, was never a target.
    expect(w.combat.aircraft[id]!.damage.structure).toBe(1)
  })
})

describe('a ground battery shoots too', () => {
  it('Tacloban made hostile: tacloban-aaa-1 fires at a Hellcat that circles it', () => {
    const base = JSON.parse(JSON.stringify(loadScenarioBundle('aa-range').scenario)) as Record<string, unknown>
    // The battery's world position, read off the world itself, so the test follows the content.
    const probe = worldFromScenario(loadScenarioBundle('aa-range'), null)
    const aaa = probe.structures.find((s) => s.kind === 'aaa')!
    const scenario = parseScenario({
      ...base, ships: [],
      aircraft: [{ id, spec: 'f6f-hellcat', airborneAt: { position: [aaa.position.x + 500, 91, aaa.position.z], headingDeg: 180, speedMps: 100 } }],
    })
    const owners = new Set<string>()
    const w = orbit(worldFromScenario(bundleForScenario(scenario), null), 40, (x) => {
      for (const p of x.combat.projectiles) if (p.aa !== undefined) owners.add(p.owner)
    }, false, { x: aaa.position.x, z: aaa.position.z })
    expect([...owners]).toEqual([aaa.id])
    expect(w.combat.aircraft[id]!.damage.structure).toBeLessThan(1)
    expect(w.combat.aircraft[id]!.damage.attacker === null || w.combat.aircraft[id]!.damage.attacker === aaa.id).toBe(true)
  })

  it('a destroyed battery stops firing', () => {
    const w0 = worldFromScenario(loadScenarioBundle('aa-range'), null)
    const aaa = w0.structures.find((s) => s.kind === 'aaa')!
    expect(aaa.kind).toBe('aaa')
    const down = { ...w0, combat: { ...w0.combat, structures: { ...w0.combat.structures, [aaa.id]: { hp: 0, destroyedTick: 1, attacker: null } } } }
    let w = withControls(down, id, down.aircraft[0]!.controls)
    w = advance(w, DT).world
    expect(w.combat.aa.nextFire[`${aaa.id}#0`]).toBeUndefined()
  })
})

describe('worlds without an armed hostile are untouched', () => {
  it('a scenario with no armed ship and no battery keeps the very same AA state through 5 s', () => {
    const w0 = worldFromScenario(loadScenarioBundle('gunnery-range'), null)
    const w = advance(w0, 5).world
    expect(w.combat.aa).toBe(w0.combat.aa)
  })
})

describe('cost: the Range Test with every warship armed and hostile', () => {
  // Measured 2026-10-10 on ryzen: 13 ships (11 armed), the Hellcat circling in the middle for 60 s with
  // the guns never losing it: 0.27 ms per 60 Hz tick, 598 live AA rounds at the peak (the cap is 600),
  // 70 bursts pending at the peak. A tick has 16.7 ms of real time, so the sim uses under 2 percent.
  it('steps faster than real time, and the live rounds and bursts stay inside their caps', () => {
    const w0 = crowdedWorld()
    expect(w0.ships.filter((s) => s.spec.armament !== undefined).length).toBeGreaterThanOrEqual(11)
    let maxLive = 0, maxBursts = 0, firedAt = 0
    const t0 = performance.now()
    const w = ((): World<undefined> => {
      let x = w0
      for (let i = 0; i < 10 * 60; i++) {
        const me = playerAircraft(x)
        const p = me.state.position
        const dx = p.x + 27916, dz = p.z + 48105
        const r = Math.hypot(dx, dz) || 1
        x = withControls(x, id, controlsForDesiredVelocity(me.state, me.spec, v3((-dz / r) * 100, (91 - p.y) * 0.4, (dx / r) * 100)))
        x = advance(x, DT).world
        x = { ...x, combat: { ...x.combat, aircraft: { ...x.combat.aircraft, [id]: { ...x.combat.aircraft[id]!, damage: healthyDamage() } } } }
        const live = x.combat.projectiles.filter((q) => q.aa !== undefined).length
        if (live > 0 && firedAt === 0) firedAt = i
        maxLive = Math.max(maxLive, live)
        maxBursts = Math.max(maxBursts, x.combat.aa.bursts.length)
      }
      return x
    })()
    const elapsedMs = performance.now() - t0
    expect(w.tick).toBe(600)
    expect(maxLive).toBeGreaterThan(100) // the guns really were firing: not a vacuous pass
    expect(maxLive).toBeLessThanOrEqual(AA_TUNING.maxLiveRounds)
    expect(maxBursts).toBeLessThanOrEqual(AA_TUNING.maxPendingBursts)
    // Ten simulated seconds in well under ten real ones (generous: a loaded machine, a cold JIT).
    expect(elapsedMs).toBeLessThan(10_000)
  }, 30_000)
})
