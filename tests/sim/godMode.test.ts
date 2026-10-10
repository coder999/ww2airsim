import { describe, it, expect } from 'vitest'
import { bounceState, BOUNCE_MIN_CLIMB_MPS } from '../../src/sim/godMode.js'
import { qRotate } from '../../src/sim/math/quat.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { createState } from '../../src/sim/flight/state.js'

describe('god mode: bounceState', () => {
  const base = createState({ position: v3(0, 100, 0), velocity: v3(60, 0, 0) })
  it('turns a dive into a climb, keeps the heading and lifts clear of the surface', () => {
    const hit = { ...base, position: v3(10, 20, 30), velocity: v3(60, -40, 0) }
    const out = bounceState(hit, 20)
    expect(out.velocity.y).toBeGreaterThanOrEqual(BOUNCE_MIN_CLIMB_MPS)
    expect(out.velocity.x).toBeCloseTo(60, 6)
    expect(out.velocity.z).toBeCloseTo(0, 6)
    expect(out.position.y).toBeGreaterThan(20)
    expect(out.bodyRates).toEqual(v3(0, 0, 0))
    // The nose points along the climb, wings level.
    const nose = qRotate(out.attitude, v3(1, 0, 0))
    expect(nose.x).toBeGreaterThan(0.8)
    expect(nose.y).toBeGreaterThan(0)
    const up = qRotate(out.attitude, v3(0, 1, 0))
    expect(up.y).toBeGreaterThan(0.9)
  })
  it('keeps a sideways heading (south, +z)', () => {
    const out = bounceState({ ...base, velocity: v3(0, -5, 70) }, 0)
    const nose = qRotate(out.attitude, v3(1, 0, 0))
    expect(nose.z).toBeGreaterThan(0.8)
  })
})

import { advance as advanceWorld, withAircraftState, withControls, playerAircraft as player } from '../../src/sim/loop.js'
import { heightAt } from '../../src/sim/world/terrain.js'
import { worldFromScenario } from '../../src/sim/scenario.js'
import { loadScenarioBundle } from '../../tools/content/load.js'
import { groundTruthTerrain } from '../pilot/rangePass.js'
import { healthyDamage } from '../../src/sim/damage/model.js'

describe('god mode: advance', () => {
  const terrain = groundTruthTerrain()
  const world0 = worldFromScenario(loadScenarioBundle('gunnery-range'), terrain)
  const id = world0.player
  const god = { stores: world0.combat.aircraft[id]!.stores }

  it('is a no-op when off: the same world comes out with or without the argument absent', () => {
    const a = advanceWorld(world0, 1)
    const b = advanceWorld(world0, 1, undefined, undefined, false, undefined)
    expect(b.world).toEqual(a.world)
  })

  it('keeps every gun full while the trigger is held, and spends them without it', () => {
    const firing = withControls(world0, id, { ...player(world0).controls, fire: true })
    const spent = advanceWorld(firing, 3).world.combat.aircraft[id]!.guns.map((g) => g.ammo)
    const full = world0.combat.aircraft[id]!.guns.map((g) => g.ammo)
    expect(spent.some((n, i) => n < full[i]!)).toBe(true)
    const kept = advanceWorld(firing, 3, undefined, undefined, false, god).world.combat.aircraft[id]!.guns.map((g) => g.ammo)
    expect(kept).toEqual(full)
  })

  it('heals the player but leaves everyone else alone', () => {
    const other = world0.aircraft.find((a) => a.id !== id)!.id
    const hurt = { ...world0, combat: { ...world0.combat, aircraft: {
      ...world0.combat.aircraft,
      [id]: { ...world0.combat.aircraft[id]!, damage: { ...healthyDamage(), structure: 0.2, engine: 0.1 } },
      [other]: { ...world0.combat.aircraft[other]!, damage: { ...healthyDamage(), structure: 0.2 } },
    } } }
    const out = advanceWorld(hurt, 0.1, undefined, undefined, false, god).world.combat.aircraft
    expect(out[id]!.damage).toEqual(healthyDamage())
    expect(out[other]!.damage.structure).toBeCloseTo(0.2, 6)
  })

  it('refuels the tank', () => {
    const me = player(world0)
    const dry = withAircraftState(world0, id, { ...me.state, fuelKg: 1 })
    const out = player(advanceWorld(dry, 0.1, undefined, undefined, false, god).world)
    expect(out.state.fuelKg).toBe(me.spec.mass.fuelCapacityKg)
  })

  /** `advance` clamps one call's elapsed time (MAX_ELAPSED_SECONDS), so fly in frames, as the browser does. */
  const fly = (w: typeof world0, seconds: number, g?: typeof god): typeof world0 => {
    let cur = w
    for (let i = 0; i < seconds * 60; i++) cur = advanceWorld(cur, 1 / 60, undefined, undefined, false, g).world
    return cur
  }

  it('bounces off the ground instead of crashing, and a plain flight still crashes', () => {
    const me = player(world0)
    const x = me.state.position.x, z = me.state.position.z
    const ground = heightAt(terrain, x, z)
    const diving = withAircraftState(world0, id, { ...me.state, position: v3(x, ground + 60, z), velocity: v3(70, -70, 0), fuelKg: me.spec.mass.fuelCapacityKg })
    expect(player(fly(diving, 4)).impact).not.toBeNull()
    const bounced = fly(diving, 4, god)
    expect(player(bounced).impact).toBeNull()
    const p = player(bounced).state.position
    expect(p.y).toBeGreaterThan(heightAt(terrain, p.x, p.z))
  })

  it('keeps bouncing: ten seconds of diving at the ground never ends the flight', () => {
    const me = player(world0)
    const x = me.state.position.x, z = me.state.position.z
    const diving = withAircraftState(world0, id, { ...me.state, position: v3(x, heightAt(terrain, x, z) + 60, z), velocity: v3(70, -70, 0), controls: { ...me.controls, pitch: -1 } })
    expect(player(fly(diving, 10, god)).impact).toBeNull()
  })
})
