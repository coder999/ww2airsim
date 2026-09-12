import { describe, it, expect } from 'vitest'
import { v3, add, sub, scale, dot, cross, length, normalize } from '../../../src/sim/math/vec3.js'

describe('vec3', () => {
  it('adds and subtracts componentwise', () => {
    expect(add(v3(1, 2, 3), v3(4, 5, 6))).toEqual(v3(5, 7, 9))
    expect(sub(v3(4, 5, 6), v3(1, 2, 3))).toEqual(v3(3, 3, 3))
  })

  it('scales', () => {
    expect(scale(v3(1, -2, 3), 2)).toEqual(v3(2, -4, 6))
  })

  it('computes dot and cross products', () => {
    expect(dot(v3(1, 0, 0), v3(0, 1, 0))).toBe(0)
    expect(dot(v3(1, 2, 3), v3(4, 5, 6))).toBe(32)
    expect(cross(v3(1, 0, 0), v3(0, 1, 0))).toEqual(v3(0, 0, 1))
  })

  it('computes length exactly for Pythagorean triples', () => {
    // Math.sqrt is IEEE-754 exact, so this is safe to assert exactly.
    expect(length(v3(3, 4, 0))).toBe(5)
  })

  it('normalizes to unit length and returns zero for a zero vector', () => {
    expect(length(normalize(v3(0, 5, 0)))).toBeCloseTo(1, 12)
    expect(normalize(v3(0, 0, 0))).toEqual(v3(0, 0, 0))
  })
})
