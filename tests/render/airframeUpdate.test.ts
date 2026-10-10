// tests/render/airframeUpdate.test.ts
import { describe, expect, it } from 'vitest'
import { airframeUpdateFor, TURRET_TRACK_RANGE_M, turretAimFor, WINDMILL_THROTTLE } from '../../src/render/airframeUpdate.js'
import { ENGINE_DEAD_BELOW, healthyDamage } from '../../src/sim/damage/model.js'
import { DT } from '../../src/sim/flight/model.js'
import { qFromAxisAngle, qIdentity } from '../../src/sim/math/quat.js'
import { createState } from '../../src/sim/flight/state.js'
import { v3 } from '../../src/sim/math/vec3.js'
import type { AircraftEntity } from '../../src/sim/loop.js'

const aiControls = { pitch: 0.1, roll: -0.2, yaw: 0.3, throttle: 0.6 }
const alive = { state: createState({ gearFraction: 0.25, flapFraction: 0.5 }), controls: aiControls, impact: null }
const wreck = { ...alive, impact: {} as NonNullable<AircraftEntity['impact']> }
const origin = v3(0, 0, 0)

describe('airframeUpdateFor', () => {
  it("an AI aircraft reads its own entity's controls, gear and flaps", () => {
    const u = airframeUpdateFor(alive, null, v3(3, 4, 12), origin, 0.016)
    expect(u).toEqual({ gearFraction: 0.25, flapFraction: 0.5, bayDoorFraction: 0, throttle: 0.6, controls: { roll: -0.2, pitch: 0.1, yaw: 0.3 }, frameS: 0.016, cameraDistanceM: 13, debris: null, propThrottles: null })
  })

  it("the player's aircraft reads the frame's raw controls instead", () => {
    const player = { pitch: 0, roll: 0, yaw: 0, throttle: 1 }
    expect(airframeUpdateFor(alive, player, origin, origin, 0.016).throttle).toBe(1)
  })

  it('a dead engine windmills its propeller; a cutting-out one between cuts runs at the throttle', () => {
    const dead = { ...healthyDamage(), engine: ENGINE_DEAD_BELOW / 2 }
    expect(airframeUpdateFor(alive, null, origin, origin, 0.016, dead, 10, 'z').throttle).toBe(WINDMILL_THROTTLE)
    const burning = { ...healthyDamage(), burningSince: 3 }
    expect(airframeUpdateFor(alive, null, origin, origin, 0.016, burning, 10, 'z').throttle).toBe(WINDMILL_THROTTLE)
    expect(airframeUpdateFor(alive, null, origin, origin, 0.016, healthyDamage(), 10, 'z').throttle).toBe(0.6)
  })

  it('destroyed in the air: the propeller stops and the parts get the seconds since and a seed', () => {
    const blown = { ...healthyDamage(), destroyedAt: 100 }
    const u = airframeUpdateFor(alive, null, origin, origin, 0.016, blown, 160, 'z')
    expect(u.throttle).toBe(0)
    expect(u.debris!.ageS).toBeCloseTo(60 * DT, 12)
    expect(u.debris!.seed).toBe(airframeUpdateFor(alive, null, origin, origin, 0.016, blown, 300, 'z').debris!.seed)
  })

  it('a wreck, player or AI, gets throttle 0 so its propeller stops', () => {
    expect(airframeUpdateFor(wreck, null, origin, origin, 0.016).throttle).toBe(0)
    expect(airframeUpdateFor(wreck, { pitch: 0, roll: 0, yaw: 0, throttle: 1 }, origin, origin, 0.016).throttle).toBe(0)
  })
})

describe('turretAimFor (turret aim plan, 2026-10-09)', () => {
  const level = qIdentity()
  const pose = (x: number, z = 0, attitude = level) => ({ position: v3(x, 1000, z), attitude })
  const world = (aircraft: { id: string; impact: null | object; side?: 'allied' | 'axis' }[]) =>
    ({ player: 'p', aircraft: aircraft as { id: string; impact: null; side?: 'allied' | 'axis' }[] })

  it('points at the nearest hostile in range, in the body frame', () => {
    const w = world([{ id: 'b', impact: null, side: 'allied' }, { id: 'f1', impact: null }, { id: 'f2', impact: null }])
    // A fighter 400 m dead astern and one 900 m ahead: the nearer one wins.
    const d = turretAimFor(w, [pose(0), pose(-400), pose(900)], 0)!
    expect([d.x, d.y, d.z].map((v) => Math.round(v * 1e9) / 1e9 + 0)).toEqual([-1, 0, 0])
    // Yawed a quarter turn, the bomber sees the same fighter on its beam.
    const yawed = turretAimFor(w, [pose(0, 0, qFromAxisAngle(v3(0, 1, 0), Math.PI / 2)), pose(-400), pose(5000)], 0)!
    expect(Math.abs(yawed.z)).toBeCloseTo(1, 9)
  })

  it('stows (null) with no hostile in range, for friends, and for a wreck either way', () => {
    expect(turretAimFor(world([{ id: 'b', impact: null, side: 'allied' }, { id: 'f', impact: null }]), [pose(0), pose(TURRET_TRACK_RANGE_M + 1)], 0)).toBeNull()
    expect(turretAimFor(world([{ id: 'b', impact: null, side: 'axis' }, { id: 'f', impact: null }]), [pose(0), pose(100)], 0)).toBeNull()
    expect(turretAimFor(world([{ id: 'b', impact: null, side: 'allied' }, { id: 'f', impact: {} }]), [pose(0), pose(100)], 0)).toBeNull()
    expect(turretAimFor(world([{ id: 'b', impact: {}, side: 'allied' }, { id: 'f', impact: null }]), [pose(0), pose(100)], 0)).toBeNull()
  })
})
