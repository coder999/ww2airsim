import { describe, it, expect } from 'vitest'
import { approachControls, VREF_STALL_MULTIPLE, type ApproachTarget } from '../../tools/autopilot/approach.js'
import { createState } from '../../src/sim/flight/state.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { qFromAxisAngle } from '../../src/sim/math/quat.js'
import { loadAircraftSpec } from '../../tools/content/load.js'

const f6f = loadAircraftSpec('f6f-hellcat')
/** Nose -z (north), the Tacloban strip's axis. */
const northbound = qFromAxisAngle(v3(0, 1, 0), Math.PI / 2)
const target: ApproachTarget = {
  aimX: -29666,
  aimZ: -47605,
  runwayHeadingRad: 0,
  touchdownElevationM: 1.673,
}
const vref = VREF_STALL_MULTIPLE * f6f.reference.stallSpeedFlapMps

/** On the path, well out, at roughly the right speed. */
const onApproach = (overrides: Parameters<typeof createState>[0] = {}) =>
  createState({
    position: v3(target.aimX, 300, target.aimZ + 5000),
    velocity: v3(0, -3, -vref),
    attitude: northbound,
    gearFraction: 1,
    flapFraction: 1,
    ...overrides,
  })

/**
 * Master spec §11's item 2: a scripted approach autopilot, producing
 * player-identical `Controls`. It lives in `tools/` because it is a test
 * instrument -- §11's item 3, the AI pilot controller that flies the player's
 * seat in a mission, is a different thing and is Plan 7's.
 *
 * This exists because the acceptance loop for landing had closed back onto
 * Mark, against a standing requirement to keep him out of it: the gates were
 * chosen by calculation, nothing flew an approach headlessly, and the only
 * signal that the envelope was wrong was him crashing.
 */
describe('approachControls', () => {
  it('configures the airplane for landing, early', () => {
    // The gear and flaps take seconds to travel, so asking early is the point.
    const c = approachControls(f6f, onApproach(), target)
    expect(c.gearDown).toBe(true)
    expect(c.flapDown).toBe(true)
  })

  it('adds throttle when slow and takes it off when fast', () => {
    const slow = approachControls(f6f, onApproach({ velocity: v3(0, -3, -(vref - 15)) }), target)
    const fast = approachControls(f6f, onApproach({ velocity: v3(0, -3, -(vref + 15)) }), target)
    expect(slow.throttle).toBeGreaterThan(fast.throttle)
  })

  it('pitches up when below the glide path and down when above it', () => {
    const low = approachControls(f6f, onApproach({ position: v3(target.aimX, 40, target.aimZ + 5000) }), target)
    const high = approachControls(f6f, onApproach({ position: v3(target.aimX, 600, target.aimZ + 5000) }), target)
    expect(low.pitch).toBeGreaterThan(high.pitch)
  })

  it('steers back toward the extended centreline', () => {
    // Positive `Controls.yaw` is nose-RIGHT (src/sim/flight/state.ts). Drifted
    // left of a northbound runway means needing right rudder, and vice versa;
    // the two just have to be opposite and non-zero.
    const leftOfCentre = approachControls(f6f, onApproach({ position: v3(target.aimX - 200, 300, target.aimZ + 5000) }), target)
    const rightOfCentre = approachControls(f6f, onApproach({ position: v3(target.aimX + 200, 300, target.aimZ + 5000) }), target)
    expect(Math.sign(leftOfCentre.yaw)).toBe(-Math.sign(rightOfCentre.yaw))
    expect(leftOfCentre.yaw).toBeGreaterThan(0)
    expect(rightOfCentre.yaw).toBeLessThan(0)
  })

  it('closes the throttle and holds nose-up in the flare', () => {
    const flaring = approachControls(
      f6f,
      onApproach({
        position: v3(target.aimX, target.touchdownElevationM + f6f.gear.heightM + 3, target.aimZ),
        velocity: v3(0, -1.5, -vref),
      }),
      target,
    )
    expect(flaring.throttle).toBeLessThan(0.05)
    expect(flaring.pitch).toBeGreaterThan(0)
    // BOUNDED: a full held deflection over-rotates into a stall and porpoises,
    // which tests/render/frame.test.ts records observing.
    expect(flaring.pitch).toBeLessThan(0.8)
  })

  it('brakes once it is rolling, and not one moment before', () => {
    const rolling = approachControls(
      f6f,
      onApproach({
        position: v3(target.aimX, target.touchdownElevationM + f6f.gear.heightM, target.aimZ),
        velocity: v3(0, 0, -20),
      }),
      target,
    )
    expect(rolling.brake ?? 0).toBeGreaterThan(0.2)
    expect(rolling.throttle).toBe(0)
    // Braking in the air would be free deceleration the pilot never commanded.
    expect(approachControls(f6f, onApproach(), target).brake ?? 0).toBe(0)
  })

  it('returns finite, in-range controls for every state it is handed', () => {
    // It runs thousands of times per landing and feeds `step` directly, so a
    // NaN here reaches the integrator -- master spec §9's named hazard.
    for (const y of [0, 5, 50, 500, 5000]) {
      for (const vz of [-100, 0, 30, 120]) {
        for (const x of [target.aimX - 3000, target.aimX, target.aimX + 3000]) {
          const c = approachControls(f6f, onApproach({ position: v3(x, y, target.aimZ + 2000), velocity: v3(0, -3, vz) }), target)
          for (const v of [c.pitch, c.roll, c.yaw, c.throttle, c.brake ?? 0]) {
            expect(Number.isFinite(v), `y=${y} vz=${vz} x=${x}`).toBe(true)
          }
          expect(c.throttle).toBeGreaterThanOrEqual(0)
          expect(c.throttle).toBeLessThanOrEqual(1)
          expect(Math.abs(c.pitch)).toBeLessThanOrEqual(1)
          expect(Math.abs(c.yaw)).toBeLessThanOrEqual(1)
          expect(c.brake ?? 0).toBeGreaterThanOrEqual(0)
          expect(c.brake ?? 0).toBeLessThanOrEqual(1)
        }
      }
    }
  })

  it('is a pure function of the state, with no stored phase', () => {
    // Which is what lets a harness drop it into any loop that drives `step`,
    // restart it anywhere, and get the same answer for the same state.
    const s = onApproach()
    expect(approachControls(f6f, s, target)).toEqual(approachControls(f6f, s, target))
  })
})
