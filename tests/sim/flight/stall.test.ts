import { describe, it, expect } from 'vitest'
import { v3 } from '../../../src/sim/math/vec3.js'
import { qIdentity } from '../../../src/sim/math/quat.js'
import { createState, step, isStalled, angleOfAttack, DT, type Controls }
  from '../../../src/sim/flight/model.js'
import { loadAircraftSpec } from '../../../src/sim/content.js'

const f6f = loadAircraftSpec('f6f-hellcat')

describe('stall behaviour (spec §5)', () => {
  it('reports not stalled in normal cruise', () => {
    const s = createState({ position: v3(0, 2000, 0), velocity: v3(140, 0, 0), attitude: qIdentity() })
    expect(isStalled(f6f, s)).toBe(false)
  })

  it('reports stalled past the critical angle of attack', () => {
    // Descending steeply through a level attitude gives a large positive alpha.
    const s = createState({ position: v3(0, 2000, 0), velocity: v3(30, -30, 0), attitude: qIdentity() })
    expect(angleOfAttack(s)).toBeGreaterThan((f6f.aero.alphaCritDeg * Math.PI) / 180)
    expect(isStalled(f6f, s)).toBe(true)
  })

  it('injects a wing drop when stalled, breaking wings-level flight', () => {
    let s = createState({ position: v3(0, 3000, 0), velocity: v3(30, -30, 0), attitude: qIdentity() })
    const neutral: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0 }
    for (let i = 0; i < 30; i++) s = step(f6f, s, neutral, DT)
    expect(Math.abs(s.attitude.x)).toBeGreaterThan(0.005)
  })

  it('is recoverable: unloading reduces alpha below critical', () => {
    let s = createState({ position: v3(0, 4000, 0), velocity: v3(35, -25, 0), attitude: qIdentity() })
    const unload: Controls = { pitch: -1, roll: 0, yaw: 0, throttle: 1 }
    for (let i = 0; i < 60 * 15; i++) s = step(f6f, s, unload, DT)
    expect(isStalled(f6f, s)).toBe(false)
  })

  it('loses altitude in a sustained stall', () => {
    let s = createState({ position: v3(0, 4000, 0), velocity: v3(30, -20, 0), attitude: qIdentity() })
    const neutral: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0 }
    const y0 = s.position.y
    for (let i = 0; i < 60 * 5; i++) s = step(f6f, s, neutral, DT)
    expect(s.position.y).toBeLessThan(y0)
  })

  it('produces no non-finite state through a full stall and recovery', () => {
    let s = createState({ position: v3(0, 5000, 0), velocity: v3(30, -30, 0), attitude: qIdentity() })
    // Minor fix: one expect() per iteration over 3600 steps buried the single
    // failure that mattered. Track the first bad step and assert once.
    let firstBadStep = -1
    for (let i = 0; i < 60 * 60; i++) {
      const controls: Controls = i < 1800
        ? { pitch: 1, roll: 0, yaw: 0, throttle: 0 }
        : { pitch: -0.5, roll: 0, yaw: 0, throttle: 1 }
      s = step(f6f, s, controls, DT)
      if (firstBadStep === -1 && !Number.isFinite(s.position.y + s.velocity.x + s.attitude.w)) {
        firstBadStep = i
      }
    }
    expect(firstBadStep).toBe(-1)
  })
})
