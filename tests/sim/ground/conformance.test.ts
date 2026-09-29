import { describe, expect, it } from 'vitest'
import { attitudeAngles } from '../../../src/sim/flight/attitude.js'
import { restPitchRad, wheelDepthM } from '../../../src/sim/gearContact.js'
import { onGround } from '../../../src/sim/ground.js'
import { length, v3 } from '../../../src/sim/math/vec3.js'
import { allGroundSpecs } from './fixtures.js'
import { run } from './run.js'

describe.each(allGroundSpecs.map((s) => [s.id, s] as const))('ground conformance: %s', (_id, spec) => {
  it('1. the layout is valid: a rest pitch exists and both wheels touch at it', () => {
    const rest = restPitchRad(spec.gear)
    expect(Number.isFinite(rest)).toBe(true)
    const third = spec.gear.thirdHeightM * Math.cos(rest) - spec.gear.thirdX * Math.sin(rest)
    expect(wheelDepthM(spec.gear, rest)).toBeCloseTo(third, 9)
  })

  it('2. parked for 60 s on level ground it stays put', () => {
    const { trace } = run(spec, { pitch: 0, roll: 0, yaw: 0, throttle: 0, gearDown: true, brake: 1 }, 60)
    const end = trace[trace.length - 1]!
    expect(length(v3(end.position.x - trace[0]!.position.x, 0, end.position.z - trace[0]!.position.z))).toBeLessThan(0.05)
    expect(Math.abs(end.position.y - trace[0]!.position.y)).toBeLessThan(0.01)
    expect(onGround(spec, end, 1)).toBe(true)
  })

  it('3. idling straight it holds its heading over 100 m, apart from the modeled engine torque', () => {
    const { trace } = run(spec, { pitch: 0, roll: 0, yaw: 0, throttle: 0.3, gearDown: true }, 40)
    const head = (i: number) => Math.atan2(-trace[i]!.velocity.z, trace[i]!.velocity.x)
    const last = trace.findIndex((s) => s.position.x - trace[0]!.position.x >= 100)
    expect(last, 'never covered 100 m').toBeGreaterThan(0)
    // Torque acts, faded by speed, until the tail lifts; that is the only thing
    // allowed to turn a hands-off roll (ledger, Task 7). Layouts with no
    // torque get the plan's strict 0.1 rad; the others get that plus the
    // torque yaw rate integrated over the seconds spent below tail-lift speed.
    const below = trace.slice(0, last + 1).filter((s) => Math.hypot(s.velocity.x, s.velocity.z) < spec.gear.tailLiftSpeedMps).length
    const torqueRad = (Math.abs(spec.gear.torqueYawRateDegPerSec) * 0.3 * (below / 60) * Math.PI) / 180
    expect(Math.abs(head(last) - head(Math.min(last, 60)))).toBeLessThan(0.1 + torqueRad)
  })

  it('4. full power, stick neutral: the tail (or nose) settles to level and the roll ends at speed', () => {
    const { trace } = run(spec, { pitch: 0, roll: 0, yaw: 0, throttle: 1, gearDown: true }, 20)
    const end = trace[trace.length - 1]!
    expect(length(end.velocity)).toBeGreaterThan(spec.gear.tailLiftSpeedMps)
    expect(Math.abs(attitudeAngles(end).pitchRad)).toBeLessThan(0.05 + Math.max(0, restPitchRad(spec.gear)))
  })

  it('5. a wheel drop and a three-point drop settle without gaining energy', () => {
    const rest = restPitchRad(spec.gear)
    for (const pitch of [0, rest]) {
      const { trace } = run(spec, { pitch: 0, roll: 0, yaw: 0, throttle: 0, gearDown: true }, 8, { pitchRad: pitch, dropM: 0.3, speedMps: 35 })
      const energy = (i: number) => 0.5 * length(trace[i]!.velocity) ** 2 + 9.80665 * trace[i]!.position.y
      expect(energy(trace.length - 1)).toBeLessThanOrEqual(energy(0) + 1e-6)
    }
  })
})
