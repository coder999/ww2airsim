import { describe, it, expect } from 'vitest'
import { v3, length, sub } from '../../../src/sim/math/vec3.js'
import { qIdentity } from '../../../src/sim/math/quat.js'
import { createState, step, DT, type Controls } from '../../../src/sim/flight/model.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import type { SimContext } from '../../../src/sim/loop.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const ctx = (dt: number, tick = 0): SimContext => ({ dt, tick })

describe('step() timestep validation (finding I8)', () => {
  const s0 = createState({ position: v3(0, 2000, 0), velocity: v3(130, 0, 0) })
  const NEUTRAL: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0.5 }

  // `step` used to integrate any of these happily: a NaN poisons the whole
  // state, a negative dt runs the physics backwards, and zero advances
  // nothing while still burning a tick. None of them produced anything a
  // caller would recognise as an error.
  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['zero', 0],
    ['negative', -DT],
  ])('rejects a %s dt', (_label, dt) => {
    expect(() => step(f6f, s0, NEUTRAL, ctx(dt, 1))).toThrow(/positive, finite dt/)
  })

  it('accepts the fixed 60 Hz timestep the simulation is designed around', () => {
    expect(() => step(f6f, s0, NEUTRAL, ctx(DT, 1))).not.toThrow()
  })

  // Deliberately NOT rejected: enforcing 60 Hz needs a decision about who owns
  // the fixed-step contract and how a variable frame time is accumulated into
  // ticks, which is a next-plan design decision. This assertion records that
  // the current boundary is "integrable", not "60 Hz", so a later change that
  // tightens it has to come here and say so.
  it('accepts a large-but-finite dt, because owning the 60 Hz contract is deferred', () => {
    expect(() => step(f6f, s0, NEUTRAL, ctx(0.25, 1))).not.toThrow()
  })
})

/**
 * Recommendation 6: pin the integrator's ORDER, so a rewrite of the
 * integration scheme has to declare itself. The golden trajectory did not
 * catch the semi-implicit -> explicit Euler rewrite that prompted this
 * (finding I2), and a convergence test catches it from a completely different
 * direction: by measuring how the solution moves as the timestep shrinks,
 * rather than by comparing against recorded numbers.
 *
 * No fine-grained reference run is needed. For a first-order scheme,
 * p(h) = p_exact + C*h + O(h^2), so successive differences halve:
 *   |p(h) - p(h/2)| = C*h/2   and   |p(h/2) - p(h/4)| = C*h/4
 * and their ratio is 2 with no knowledge of p_exact at all. 840 steps total.
 *
 * Two things are asserted, and the second is the one that catches a scheme
 * change:
 *
 *  - the HALVING RATIO pins the order at 1. Measured 2026-09-12 on this
 *    checkout, node v22.22.1: 1.99786 here, and 1.99582 / 1.99892 / 1.99945
 *    at the neighbouring rate triples (30/60/120 up to 240/480/960).
 *
 *  - the ERROR COEFFICIENT C pins the scheme. Note carefully that the ratio
 *    alone does NOT: explicit Euler is also first order, and under that
 *    mutation the ratio measures 2.00007 -- if anything closer to 2 than the
 *    real integrator. What changes is the size of the first-order term.
 *    Measured C = 2*|p(h) - p(h/2)|/h = 5.782 m/s for the shipped
 *    semi-implicit update and 13.349 m/s for explicit Euler, a factor of
 *    2.31. C is also extremely stable across timestep -- 5.770 to 5.793 over
 *    a 32x span of h -- so the band below is ~20% wide against a quantity
 *    that moves by 0.4%, which is loose enough not to flap on a Node upgrade
 *    (the positions differ by ~0.05 m, so ULP drift is ~1e-13) and tight
 *    enough to reject 13.349 by a factor of 1.9.
 */
describe('integrator convergence (recommendation 6)', () => {
  const MANOEUVRE: Controls = { pitch: 0.2, roll: 0.1, yaw: 0, throttle: 0.8 }
  const DURATION_S = 2

  const finalPosition = (dt: number) => {
    let s = createState({
      position: v3(0, 2000, 0),
      velocity: v3(130, 0, 0),
      attitude: qIdentity(),
      fuelKg: 400,
    })
    const steps = Math.round(DURATION_S / dt)
    for (let i = 0; i < steps; i++) s = step(f6f, s, MANOEUVRE, ctx(dt, i + 1))
    return s.position
  }

  const h = DT
  const p1 = finalPosition(h)
  const p2 = finalPosition(h / 2)
  const p4 = finalPosition(h / 4)
  const d1 = length(sub(p1, p2))
  const d2 = length(sub(p2, p4))

  it('halves its step-size error when the timestep halves (first order)', () => {
    expect(d1 / d2, `successive differences ${d1} and ${d2}`).toBeGreaterThan(1.8)
    expect(d1 / d2, `successive differences ${d1} and ${d2}`).toBeLessThan(2.2)
  })

  it('has the error coefficient of the semi-implicit update, not explicit Euler', () => {
    const c = (2 * d1) / h
    expect(c, `error coefficient ${c} m/s (semi-implicit 5.782, explicit Euler 13.349)`)
      .toBeGreaterThan(5.0)
    expect(c, `error coefficient ${c} m/s (semi-implicit 5.782, explicit Euler 13.349)`)
      .toBeLessThan(7.0)
  })

  it('actually moves far enough for the comparison to mean anything', () => {
    // Guards the degenerate pass where every trajectory is identical because
    // the aeroplane never went anywhere: d1/d2 = 0/0 is NaN, but a future
    // scenario edit that shrank the manoeuvre could make both differences
    // tiny and the ratio meaningless while still passing.
    expect(d1).toBeGreaterThan(1e-3)
    expect(length(sub(p1, v3(0, 2000, 0)))).toBeGreaterThan(100)
  })
})

describe('SimContext', () => {
  const level: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0.7 }

  it('carries dt to the integrator exactly as the old parameter did', () => {
    const s = createState({ position: v3(0, 2000, 0), velocity: v3(130, 0, 0) })
    const a = step(f6f, s, level, ctx(DT))
    // Same dt, same inputs -> bit-identical, since step is pure.
    const b = step(f6f, s, level, ctx(DT))
    expect(a).toEqual(b)
    expect(a.position.y).not.toBe(s.position.y)
  })

  it('still rejects an unusable dt, now from inside the context', () => {
    const s = createState({ velocity: v3(130, 0, 0) })
    for (const bad of [NaN, Infinity, -Infinity, 0, -DT]) {
      expect(() => step(f6f, s, level, ctx(bad))).toThrow(/dt/)
    }
  })
})
