import { describe, it, expect } from 'vitest'
import { v3, length, sub } from '../../../src/sim/math/vec3.js'
import { qIdentity, qFromAxisAngle, qMul, qNormalize, qRotate, qIntegrateBodyRates }
  from '../../../src/sim/math/quat.js'

describe('quat', () => {
  it('identity rotation leaves a vector unchanged', () => {
    const v = v3(1, 2, 3)
    expect(length(sub(qRotate(qIdentity(), v), v))).toBeCloseTo(0, 12)
  })

  it('rotates 90 degrees about +Y taking +X to -Z', () => {
    const q = qFromAxisAngle(v3(0, 1, 0), Math.PI / 2)
    const r = qRotate(q, v3(1, 0, 0))
    expect(r.x).toBeCloseTo(0, 10)
    expect(r.y).toBeCloseTo(0, 10)
    expect(r.z).toBeCloseTo(-1, 10)
  })

  it('composes rotations: two 90 degree turns equal one 180', () => {
    const q90 = qFromAxisAngle(v3(0, 1, 0), Math.PI / 2)
    const composed = qMul(q90, q90)
    const r = qRotate(composed, v3(1, 0, 0))
    expect(r.x).toBeCloseTo(-1, 10)
  })

  it('stays normalized under repeated integration', () => {
    let q = qIdentity()
    for (let i = 0; i < 10_000; i++) q = qIntegrateBodyRates(q, v3(0.5, 0.3, -0.2), 1 / 60)
    const n = Math.hypot(q.x, q.y, q.z, q.w)
    expect(n).toBeCloseTo(1, 9)
  })

  it('integrating a pure roll rate for a known duration gives the expected angle', () => {
    // 1 rad/s of roll for 1 second, stepped at 60 Hz, should be ~1 rad about +X.
    let q = qIdentity()
    for (let i = 0; i < 60; i++) q = qIntegrateBodyRates(q, v3(1, 0, 0), 1 / 60)
    const expected = qFromAxisAngle(v3(1, 0, 0), 1)
    // Small-angle integration accumulates error; 1% is acceptable at 60 Hz.
    expect(Math.abs(q.w - expected.w)).toBeLessThan(0.01)
  })

  it('never produces NaN from a zero rate', () => {
    const q = qIntegrateBodyRates(qIdentity(), v3(0, 0, 0), 1 / 60)
    expect(Number.isFinite(q.x + q.y + q.z + q.w)).toBe(true)
  })

  it('qNormalize returns identity for a degenerate quaternion', () => {
    expect(qNormalize({ x: 0, y: 0, z: 0, w: 0 })).toEqual(qIdentity())
  })
})
