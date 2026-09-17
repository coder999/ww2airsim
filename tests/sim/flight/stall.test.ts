import { describe, it, expect } from 'vitest'
import { v3 } from '../../../src/sim/math/vec3.js'
import { qIdentity } from '../../../src/sim/math/quat.js'
import { createState, step, isStalled, angleOfAttack, DT, type Controls }
  from '../../../src/sim/flight/model.js'
import { assertFinite } from '../../../src/sim/invariants.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'

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
    for (let i = 0; i < 30; i++) s = step(f6f, s, neutral, { dt: DT, tick: i + 1 })
    expect(Math.abs(s.attitude.x)).toBeGreaterThan(0.005)
  })

  it('is recoverable: unloading reduces alpha below critical', () => {
    // Asserts the RECOVERY, not the state after 15 s of held full forward
    // stick. Re-written 2026-09-17 when rate authority became proportional to
    // speed rather than dynamic pressure: at this entry (43 m/s at 4000 m)
    // pitch authority went from 0.12 to 0.34, so full forward now unstalls
    // the wing in 1.08 s -- and then, held for 15 s, keeps pushing over
    // through 60 degrees nose-down into a NEGATIVE-alpha stall at 5.5 s,
    // which is the correct outcome of that input and what the old assertion
    // was inadvertently failing on. Under the old law the same 15 s never got
    // that far, which is the only reason the end-state check used to pass.
    let s = createState({ position: v3(0, 4000, 0), velocity: v3(35, -25, 0), attitude: qIdentity() })
    expect(isStalled(f6f, s)).toBe(true)
    const unload: Controls = { pitch: -1, roll: 0, yaw: 0, throttle: 1 }
    let recoveredAtTick: number | null = null
    for (let i = 0; i < 60 * 15 && recoveredAtTick === null; i++) {
      s = step(f6f, s, unload, { dt: DT, tick: i + 1 })
      if (!isStalled(f6f, s)) recoveredAtTick = i + 1
    }
    expect(recoveredAtTick, 'never unstalled in 15 s of unloading').not.toBeNull()
    // Measured 2026-09-17: tick 65. A generous ceiling, because the claim is
    // that unloading works, not how fast the elevator is.
    expect(recoveredAtTick!).toBeLessThan(60 * 5)
  })

  it('loses altitude in a sustained stall', () => {
    let s = createState({ position: v3(0, 4000, 0), velocity: v3(30, -20, 0), attitude: qIdentity() })
    const neutral: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0 }
    const y0 = s.position.y
    for (let i = 0; i < 60 * 5; i++) s = step(f6f, s, neutral, { dt: DT, tick: i + 1 })
    expect(s.position.y).toBeLessThan(y0)
  })

  it('produces no non-finite state through a full stall and recovery', () => {
    let s = createState({ position: v3(0, 5000, 0), velocity: v3(30, -30, 0), attitude: qIdentity() })
    // Finding I7: this checked 3 of the 14 fields in `invariants.ts`'s
    // canonical FIELDS list (via a sum, which also cannot say which one went
    // bad). It calls the canonical checker now.
    //
    // Minor fix, kept: one expect() per iteration over 3600 steps buried the
    // single failure that mattered, so the first failure's message is
    // captured and asserted once.
    let firstFailure: string | undefined
    for (let i = 0; i < 60 * 60; i++) {
      const controls: Controls = i < 1800
        ? { pitch: 1, roll: 0, yaw: 0, throttle: 0 }
        : { pitch: -0.5, roll: 0, yaw: 0, throttle: 1 }
      s = step(f6f, s, controls, { dt: DT, tick: i + 1 })
      if (firstFailure === undefined) {
        try {
          assertFinite(s, `step ${i}`)
        } catch (err) {
          firstFailure = (err as Error).message
        }
      }
    }
    expect(firstFailure).toBeUndefined()
  })
})
