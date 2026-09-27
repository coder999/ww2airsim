import { describe, expect, it } from 'vitest'
import { length, sub, v3 } from '../../../src/sim/math/vec3.js'
import { MAX_CLOSURE_MPS, MAX_FORMATION_VERTICAL_MPS, MIN_SPEED_STALL_FACTOR, leaderTurnRate, STATIONS, TRAIL_COVER, stationDesiredVelocity, stationErrorM, stationPoint } from '../../../src/sim/ai/formation.js'
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
    expect(d.y).toBeLessThanOrEqual(MAX_FORMATION_VERTICAL_MPS + 1e-9)
    expect(length(sub(d, v3(120, 0, 0)))).toBeLessThanOrEqual(MAX_CLOSURE_MPS + 1e-9)
  })

  it('leads a turning leader: asks to turn with it, not after it', () => {
    const leader = east(0)
    // Turning right (+x toward +z) at 0.05 rad/s: the last tick's heading was 0.05 x DT less.
    const prevHeading = -0.05 / 60
    const turning = { ...leader, previous: { ...leader.state, velocity: v3(120 * Math.cos(prevHeading), 0, 120 * Math.sin(prevHeading)) } }
    expect(leaderTurnRate(turning)).toBeCloseTo(0.05, 6)
    const d = stationDesiredVelocity(east(-80, 100), turning, STATIONS[1])
    expect(d.z).toBeGreaterThan(0)
    expect(stationDesiredVelocity(east(-80, 100), leader, STATIONS[1]).z).toBe(0)
  })

  it('does not feed a hard turn forward onto trail cover (final review M4)', () => {
    // A player looping while firing: 1.3 rad/s, the rate the review's probe
    // measured, when omega x the 500 m arm asked for 646-665 m/s.
    const leader = east(0, 0, 3000, 150)
    const prevHeading = -1.3 / 60
    const turning = { ...leader, previous: { ...leader.state, velocity: v3(150 * Math.cos(prevHeading), 0, 150 * Math.sin(prevHeading)) } }
    for (const self of [east(-500, 0, 3200, 150), east(-2500, 800, 2600, 150)]) {
      const d = stationDesiredVelocity(self, turning, TRAIL_COVER)
      expect(length(d)).toBeLessThanOrEqual(150 + MAX_CLOSURE_MPS + 1e-9)
      // Exactly what a non-turning leader in the same state asks for.
      expect(d).toEqual(stationDesiredVelocity(self, leader, TRAIL_COVER))
    }
    // Slot stations keep the feed-forward (the turn-lead case above covers its sense).
    const slotSelf = east(-80, 100, 3000, 150)
    expect(stationDesiredVelocity(slotSelf, turning, STATIONS[1])).not.toEqual(stationDesiredVelocity(slotSelf, leader, STATIONS[1]))
  })
})
