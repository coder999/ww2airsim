import { describe, expect, it } from 'vitest'
import { restPitchRad, wheelDepthM, type GearSpec } from '../../src/sim/gearContact.js'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { MODEL_STANCE } from '../../src/render/scene/stance.js'

const DEG = Math.PI / 180
const deg = (r: number) => r / DEG

const base = loadAircraftSpec('f6f-hellcat').gear
const tricycle: GearSpec = {
  ...base,
  layout: 'tricycle',
  mainX: -0.5,
  thirdX: 4,
  thirdHeightM: base.heightM,
  thirdSteering: 'steered',
}

describe('gear contact geometry', () => {
  it('a tricycle with equal wheel depths rests level', () => {
    expect(restPitchRad(tricycle)).toBeCloseTo(0, 12)
  })

  it('a tricycle with a shorter nose leg rests nose-down (negative)', () => {
    expect(restPitchRad({ ...tricycle, thirdHeightM: base.heightM - 0.2 })).toBeLessThan(0)
  })

  it('at the rest pitch both wheels are at the same depth', () => {
    const rest = restPitchRad(base)
    const main = base.heightM * Math.cos(rest) - base.mainX * Math.sin(rest)
    const third = base.thirdHeightM * Math.cos(rest) - base.thirdX * Math.sin(rest)
    expect(main).toBeCloseTo(third, 9)
    expect(wheelDepthM(base, rest)).toBeCloseTo(main, 9)
  })

  it('level, a taildragger stands on its mains: the depth is heightM', () => {
    expect(wheelDepthM(base, 0)).toBeCloseTo(base.heightM, 9)
  })

  it('pitched past the rest angle the tail wheel is the lowest point', () => {
    const past = restPitchRad(base) + 5 * DEG
    const third = base.thirdHeightM * Math.cos(past) - base.thirdX * Math.sin(past)
    expect(wheelDepthM(base, past)).toBeCloseTo(third, 9)
  })
})

describe.each([['f6f-hellcat', 'f6f-hellcat'], ['f4f-wildcat', 'wildcat'], ['a6m2-zero', 'a6m2-zero'], ['f4u-corsair', 'f4u-corsair'], ['b-17-flying-fortress', 'b-17-flying-fortress'], ['g4m-betty', 'g4m-betty'], ['b-29-superfortress', 'b-29-superfortress'], ['p-38-lightning', 'p-38-lightning']] as const)(
  '%s layout against the drawing',
  (id, model) => {
    const gear = loadAircraftSpec(id).gear
    it('derives the rest pitch the drawn model measures, within 0.25 degrees', () => {
      expect(Math.abs(deg(restPitchRad(gear) - MODEL_STANCE[model]!.tailDownPitchRad))).toBeLessThanOrEqual(0.25)
    })
    it('puts the mains where the drawn model has them, within 0.05 m', () => {
      // The P-38's drawn mains stand at x +0.439, but the schema needs a tricycle's mainX below zero, so the spec has -0.01 and the
      // drawing is left as committed (Mark, D4, 2026-09-29): a documented 0.449 m exception, the drawn wheels float about 8 cm at 10 degrees of pitch.
      const allowed = id === 'p-38-lightning' ? 0.45 : 0.05
      expect(Math.abs(gear.mainX - MODEL_STANCE[model]!.mainWheelXM)).toBeLessThanOrEqual(allowed)
    })
    it('has the center of gravity (the body origin) between the wheels', () => {
      // A taildragger's mains are ahead of the CG and its tail wheel behind; a tricycle's are the reverse.
      const sign = gear.layout === 'tricycle' ? -1 : 1
      expect(sign * gear.thirdX).toBeLessThan(0)
      expect(sign * gear.mainX).toBeGreaterThan(0)
    })
  },
)
