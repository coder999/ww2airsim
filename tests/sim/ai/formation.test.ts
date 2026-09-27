import { describe, expect, it } from 'vitest'
import { length, sub, v3 } from '../../../src/sim/math/vec3.js'
import { MAX_CLOSURE_MPS, MIN_SPEED_STALL_FACTOR, STATIONS, TRAIL_COVER, stationDesiredVelocity, stationErrorM, stationPoint } from '../../../src/sim/ai/formation.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { level } from './maneuverWorlds.js'

/** 7f spec §2-3: the geometry and the law, on static entities (no `advance`). */
const spec = loadAircraftSpec('f6f-hellcat')
const east = (x: number, z = 0, y = 3000, speed = 120) => level('x', spec, v3(x, y, z), v3(speed, 0, 0))

describe('stations in the leader heading frame (7f spec §2)', () => {
  it('puts slot 1 aft and right, slot 2 aft and left, heading east (+x; right is +z, south)', () => {
    const leader = east(0)
    expect(stationPoint(leader, STATIONS[1])).toEqual(v3(-80, 3000, 100))
    expect(stationPoint(leader, STATIONS[2])).toEqual(v3(-80, 3000, -100))
    expect(stationPoint(leader, TRAIL_COVER)).toEqual(v3(-500, 3200, 0))
  })

  it('ignores the leader climbing: the frame is the horizontal velocity', () => {
    const climbing = level('l', spec, v3(0, 3000, 0), v3(100, 60, 0))
    expect(stationPoint(climbing, STATIONS[1])).toEqual(v3(-80, 3000, 100))
  })

  it('falls back to the body forward with no horizontal velocity, and never returns NaN (Review Focus 2)', () => {
    const still = level('l', spec, v3(0, 3000, 0), v3(120, 0, 0))
    const hovering = { ...still, state: { ...still.state, velocity: v3(0, -3, 0) } }
    const p = stationPoint(hovering, STATIONS[1])
    expect([p.x, p.y, p.z].every(Number.isFinite)).toBe(true)
    expect(p).toEqual(v3(-80, 3000, 100))
  })
})

describe('the station-keeping law (7f spec §3)', () => {
  it('on station, asks for exactly the leader velocity', () => {
    const leader = east(0)
    const self = east(-80, 100)
    expect(stationDesiredVelocity(self, leader, STATIONS[1])).toEqual(v3(120, 0, 0))
    expect(stationErrorM(self, leader, 1)).toBe(0)
  })

  it('from 2 km astern, overtakes at no more than MAX_CLOSURE_MPS', () => {
    const d = stationDesiredVelocity(east(-2080, 100), east(0), STATIONS[1])
    expect(d.x - 120).toBeCloseTo(MAX_CLOSURE_MPS, 6)
    expect(Math.abs(d.z)).toBeLessThan(1e-9)
  })

  it('ahead of its station, never asks for less than MIN_SPEED_STALL_FACTOR x clean stall (Review Focus 1)', () => {
    const d = stationDesiredVelocity(east(2000, 100, 3000, 80), east(0, 0, 3000, 80), STATIONS[1])
    expect(length(d)).toBeGreaterThanOrEqual(MIN_SPEED_STALL_FACTOR * spec.reference.stallSpeedMps - 1e-9)
  })

  it('clamps the vertical correction', () => {
    const d = stationDesiredVelocity(east(-80, 100, 1000), east(0), STATIONS[1])
    expect(d.y).toBeLessThanOrEqual(10 + 1e-9)
    expect(length(sub(d, v3(120, 0, 0)))).toBeLessThanOrEqual(MAX_CLOSURE_MPS + 1e-9)
  })
})
