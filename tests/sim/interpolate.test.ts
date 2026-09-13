import { describe, it, expect } from 'vitest'
import { interpolateAircraft, qSlerp } from '../../src/sim/interpolate.js'
import { createState } from '../../src/sim/flight/state.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { qFromAxisAngle, qIdentity, qRotate, type Quat } from '../../src/sim/math/quat.js'

const near = (a: number, b: number, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(eps)

/** Angle, in radians, of the rotation that carries p to q (or q to p --
 *  `|dot|` makes this direction-agnostic, which is what double cover requires). */
const angleBetween = (p: Quat, q: Quat): number => {
  const dot = Math.abs(p.x * q.x + p.y * q.y + p.z * q.z + p.w * q.w)
  return 2 * Math.acos(Math.min(1, dot))
}

describe('qSlerp', () => {
  it('returns the endpoints exactly at t=0 and t=1', () => {
    const a = qIdentity()
    const b = qFromAxisAngle(v3(0, 1, 0), Math.PI / 2)
    expect(qSlerp(a, b, 0)).toEqual(a)
    expect(qSlerp(a, b, 1)).toEqual(b)
  })

  it('takes the short way round when the inputs are in opposite hemispheres', () => {
    // Double cover: q and -q are the same rotation. Naive slerp between them
    // takes the 360-degree path, which shows up as a full spin at 60 Hz.
    const a = qFromAxisAngle(v3(0, 1, 0), 0.2)
    const negated: Quat = { x: -a.x, y: -a.y, z: -a.z, w: -a.w }
    const mid = qSlerp(a, negated, 0.5)
    // Halfway between a rotation and itself must be that rotation, not a
    // half-turn away from it.
    const p = qRotate(mid, v3(1, 0, 0))
    const q = qRotate(a, v3(1, 0, 0))
    near(p.x, q.x); near(p.y, q.y); near(p.z, q.z)
  })

  it('stays unit length across the sweep', () => {
    const a = qFromAxisAngle(v3(0.3, 0.9, 0.2), 0.7)
    const b = qFromAxisAngle(v3(-0.5, 0.4, 0.7), 2.4)
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const q = qSlerp(a, b, t)
      near(Math.hypot(q.x, q.y, q.z, q.w), 1, 1e-12)
    }
  })

  it('handles near-identical inputs without dividing by a vanishing sine', () => {
    const a = qFromAxisAngle(v3(0, 1, 0), 0.5)
    const b = qFromAxisAngle(v3(0, 1, 0), 0.5 + 1e-12)
    const q = qSlerp(a, b, 0.5)
    expect(Number.isFinite(q.x + q.y + q.z + q.w)).toBe(true)
    near(Math.hypot(q.x, q.y, q.z, q.w), 1, 1e-12)
  })

  it('renormalizes in the small-angle (lerp) branch at a realistic tick-to-tick delta', () => {
    // The "stays unit length" test above uses dot ~= 0.46, which is the arc
    // branch -- it never exercises the lerp branch's renormalization at all.
    // This pair is 2 rad/s of roll integrated over one 1/60 s tick, i.e. the
    // actual delta this branch exists for: dot ~= 0.999861 (measured
    // 2026-09-12), comfortably inside the lerp branch (dot > 0.9995).
    const dtheta = 2 * (1 / 60)
    const a = qFromAxisAngle(v3(1, 0, 0), 0)
    const b = qFromAxisAngle(v3(1, 0, 0), dtheta)
    const q = qSlerp(a, b, 0.5)
    // Un-normalized, this pair's lerp midpoint measures norm 0.99996528
    // (deviation 3.47e-5 from unity, measured 2026-09-12) -- three orders of
    // magnitude above this tolerance, so deleting the renormalization fails
    // this assertion without coming close to ordinary floating-point noise.
    near(Math.hypot(q.x, q.y, q.z, q.w), 1, 1e-9)
  })

  it('is genuinely spherical: angle traversed is proportional to t, not the nlerp chord', () => {
    // A hemisphere-corrected nlerp (linear-interpolate-then-normalize, no arc
    // branch) passes every other test here, because the "opposite hemispheres"
    // case degenerates to a bit-identical input once corrected, and t=0.5 is a
    // fixed point where nlerp's normalized chord midpoint is ALWAYS the exact
    // angular bisector of two equal-length vectors -- a symmetry of the
    // average, not a slerp-specific property (verified 2026-09-12: this
    // pair's slerp and nlerp midpoints at t=0.5 agree to 4e-16). t=0.5 alone
    // cannot tell slerp and nlerp apart.
    //
    // Constant angular velocity -- the angle from `a` grows linearly with t --
    // is a real, t != 0.5 property that only slerp has. This pair (dot ~=
    // 0.362, well inside the arc branch, well separated) shows the two
    // schemes diverging by ~0.054 rad at t=0.3 (measured 2026-09-12), far
    // above this tolerance and far above any floating-point noise floor.
    const a = qFromAxisAngle(v3(0, 1, 0), 0)
    const b = qFromAxisAngle(v3(0, 1, 0), 2.4)
    const total = angleBetween(a, b)
    const t = 0.3
    const mid = qSlerp(a, b, t)
    near(angleBetween(a, mid), t * total, 1e-9)
  })
})

describe('interpolateAircraft', () => {
  it('lerps position and returns the endpoints at the bounds', () => {
    const prev = createState({ position: v3(0, 1000, 0), tick: 1 })
    const curr = createState({ position: v3(10, 1020, -4), tick: 2 })
    expect(interpolateAircraft(prev, curr, 0).position).toEqual(prev.position)
    expect(interpolateAircraft(prev, curr, 1).position).toEqual(curr.position)
    const mid = interpolateAircraft(prev, curr, 0.5).position
    near(mid.x, 5); near(mid.y, 1010); near(mid.z, -2)
  })

  it('clamps alpha rather than extrapolating past the newest tick', () => {
    // A frame that overruns must not invent a future the sim has not simulated.
    const prev = createState({ position: v3(0, 0, 0), tick: 1 })
    const curr = createState({ position: v3(10, 0, 0), tick: 2 })
    expect(interpolateAircraft(prev, curr, 1.7).position).toEqual(curr.position)
    expect(interpolateAircraft(prev, curr, -0.4).position).toEqual(prev.position)
  })
})
