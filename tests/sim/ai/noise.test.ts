import { describe, expect, it } from 'vitest'
import { applyControlNoise } from '../../../src/sim/ai/noise.js'
import { GREEN_SKILL, VETERAN_SKILL } from '../../../src/sim/ai/pilot.js'

const BASE = { pitch: 0, roll: 0, yaw: 0, throttle: 0.7 }

describe('applyControlNoise', () => {
  it('is deterministic: same seed, same inputs, twice -> bit-identical output', () => {
    expect(applyControlNoise(BASE, 0.2, 12345)).toEqual(applyControlNoise(BASE, 0.2, 12345))
  })

  it('actually jitters -- roll/pitch/yaw move off the unjittered baseline', () => {
    const { controls } = applyControlNoise(BASE, 0.2, 12345)
    expect(controls.roll).not.toBe(0)
    expect(controls.pitch).not.toBe(0)
    expect(controls.yaw).not.toBe(0)
  })

  it('never touches throttle, gearDown, flapDown, brake or fire', () => {
    const withExtras = { ...BASE, gearDown: true, flapDown: true, brake: 0.5, fire: true }
    const { controls } = applyControlNoise(withExtras, 0.5, 999)
    expect(controls.throttle).toBe(0.7)
    expect(controls.gearDown).toBe(true)
    expect(controls.flapDown).toBe(true)
    expect(controls.brake).toBe(0.5)
    expect(controls.fire).toBe(true)
  })

  it('0 noise contributes exactly 0 but still advances the cursor by a fixed amount', () => {
    const zero = applyControlNoise(BASE, 0, 12345)
    expect(zero.controls).toEqual(BASE)
    const nonZero = applyControlNoise(BASE, 0.2, 12345)
    expect(zero.cursor).toBe(nonZero.cursor)
  })

  it('clamps to [-1, 1] even with a large noiseStdDev against a near-limit baseline', () => {
    const { controls } = applyControlNoise({ ...BASE, roll: 0.95, pitch: -0.95 }, 5, 42)
    expect(controls.roll).toBeLessThanOrEqual(1)
    expect(controls.roll).toBeGreaterThanOrEqual(-1)
    expect(controls.pitch).toBeLessThanOrEqual(1)
    expect(controls.pitch).toBeGreaterThanOrEqual(-1)
  })

  it('never produces NaN/Infinity across a wide range of cursors (Box-Muller log(0) edge case)', () => {
    for (let cursor = 0; cursor < 5000; cursor += 37) {
      const { controls } = applyControlNoise(BASE, 0.3, cursor)
      expect(Number.isFinite(controls.roll)).toBe(true)
      expect(Number.isFinite(controls.pitch)).toBe(true)
      expect(Number.isFinite(controls.yaw)).toBe(true)
    }
  })

  it('green (higher controlNoise) jitters materially more than veteran on average', () => {
    const meanAbsRoll = (noiseStdDev: number): number => {
      let cursor = 777, sum = 0
      const N = 500
      for (let i = 0; i < N; i++) {
        const draw = applyControlNoise(BASE, noiseStdDev, cursor)
        sum += Math.abs(draw.controls.roll)
        cursor = draw.cursor
      }
      return sum / N
    }
    expect(meanAbsRoll(VETERAN_SKILL.controlNoise)).toBeLessThan(meanAbsRoll(GREEN_SKILL.controlNoise) * 0.5)
  })
})
