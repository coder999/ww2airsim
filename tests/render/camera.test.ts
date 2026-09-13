import { describe, it, expect } from 'vitest'
import { cameraTransformFor, CHASE_OFFSET_M } from '../../src/render/camera.js'
import { v3, length, sub } from '../../src/sim/math/vec3.js'
import { qIdentity, qFromAxisAngle, qRotate } from '../../src/sim/math/quat.js'
import { loadAircraftSpec } from '../../tools/content/load.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const at = (pos = v3(0, 1000, 0), att = qIdentity()) => ({ position: pos, attitude: att })

describe('cockpit camera', () => {
  it('sits at the eye point, rigidly attached', () => {
    const r = at()
    const eye = cameraTransformFor('cockpit', f6f, r)
    const [ex, ey, ez] = f6f.view.eyePointM
    const expected = qRotate(r.attitude, v3(ex, ey, ez))
    expect(eye.position.x).toBeCloseTo(r.position.x + expected.x, 9)
    expect(eye.position.y).toBeCloseTo(r.position.y + expected.y, 9)
    expect(eye.position.z).toBeCloseTo(r.position.z + expected.z, 9)
  })

  it('tracks roll exactly — the horizon must rotate with you', () => {
    // Damping roll here would be a bug, not a comfort feature: from the
    // cockpit, the horizon turning over IS the information.
    const rolled = qFromAxisAngle(v3(1, 0, 0), Math.PI / 3)
    const eye = cameraTransformFor('cockpit', f6f, at(v3(0, 1000, 0), rolled))
    expect(eye.attitude).toEqual(rolled)
  })

  it('applies look-around in body frame, not world frame', () => {
    // Steeply banked (90 degrees), where body frame and world frame disagree
    // most about which way "left" points. Straight and level cannot tell the
    // two apart -- with rolled = identity, "left" is the same direction in
    // both frames and this test would pass against either multiplication
    // order.
    const rolled = qFromAxisAngle(v3(1, 0, 0), Math.PI / 2)
    const straight = cameraTransformFor('cockpit', f6f, at(v3(0, 1000, 0), rolled))
    const left = cameraTransformFor('cockpit', f6f, at(v3(0, 1000, 0), rolled), {
      yawRad: Math.PI / 2,
      pitchRad: 0,
    })
    // Banked 90 degrees, "look left" must swing the view about the
    // aircraft's own up axis, not the world's -- otherwise the head turns the
    // wrong way whenever the aeroplane is not level.
    const straightFwd = qRotate(straight.attitude, v3(1, 0, 0))
    const leftFwd = qRotate(left.attitude, v3(1, 0, 0))
    expect(Math.abs(leftFwd.y - straightFwd.y)).toBeGreaterThan(0.5)
  })
})

describe('chase camera', () => {
  it('sits behind and above at the configured distance', () => {
    const r = at()
    const eye = cameraTransformFor('chase', f6f, r)
    const d = length(sub(eye.position, r.position))
    expect(d).toBeCloseTo(length(v3(...CHASE_OFFSET_M)), 6)
  })

  it('discards roll instead of tracking it', () => {
    // Plan 1's own golden trajectory is four continuous barrel rolls. A camera
    // welded to the roll axis through that is nauseating, and the flight model
    // gets blamed for a camera problem.
    const rolled = qFromAxisAngle(v3(1, 0, 0), Math.PI / 2)
    const eye = cameraTransformFor('chase', f6f, at(v3(0, 1000, 0), rolled))
    // Up stays near world-up rather than rotating 90 degrees with the aircraft.
    const up = qRotate(eye.attitude, v3(0, 1, 0))
    expect(up.y).toBeGreaterThan(0.9)
  })

  it('stays finite and upright through a full continuous roll', () => {
    let eye = cameraTransformFor('chase', f6f, at())
    for (let i = 0; i < 600; i++) {
      const angle = (i / 600) * Math.PI * 8
      const r = at(v3(i, 1000, 0), qFromAxisAngle(v3(1, 0, 0), angle))
      eye = cameraTransformFor('chase', f6f, r)
      const up = qRotate(eye.attitude, v3(0, 1, 0))
      expect(Number.isFinite(eye.position.x + up.y)).toBe(true)
      expect(up.y).toBeGreaterThan(0)
    }
  })

  it('points roughly at the aeroplane, not off into open sky', () => {
    // Weaker than it looks: the offset and the returned attitude are both
    // built from the same `heading`, so this dot product is geometrically
    // guaranteed positive (it reduces to a constant, independent of heading)
    // and cannot by itself catch a broken or frozen heading -- that is what
    // the next test, comparing output heading against distinct known input
    // yaws, is for. Kept anyway as a basic "camera looks the right general
    // direction, not backwards" sanity check.
    const yawed = qFromAxisAngle(v3(0, 1, 0), Math.PI / 2)
    const eye = cameraTransformFor('chase', f6f, at(v3(0, 1000, 0), yawed))
    const fwd = qRotate(eye.attitude, v3(1, 0, 0))
    const toAircraft = sub(v3(0, 1000, 0), eye.position)
    const dotted = (fwd.x * toAircraft.x + fwd.y * toAircraft.y + fwd.z * toAircraft.z)
    expect(dotted).toBeGreaterThan(0)
  })

  it('tracks the aircraft heading itself, across distinct yaw values', () => {
    // The test above cannot catch a broken heading: its dot product reduces
    // algebraically to a heading-independent constant (proven by hardcoding
    // `heading = 0` in cameraTransformFor -- every other test, including that
    // one, still passed; see the report's Fix round 1 section). This one
    // reads the camera's own output heading back out and compares it against
    // the known input yaw, at two distinct values so a constant answer
    // cannot satisfy it.
    for (const yawDeg of [30, -100]) {
      const yaw = (yawDeg * Math.PI) / 180
      const yawed = qFromAxisAngle(v3(0, 1, 0), yaw)
      const eye = cameraTransformFor('chase', f6f, at(v3(0, 1000, 0), yawed))
      const outFwd = qRotate(eye.attitude, v3(1, 0, 0))
      const outputHeading = Math.atan2(-outFwd.z, outFwd.x)
      expect(outputHeading).toBeCloseTo(yaw, 9)
    }
  })
})
