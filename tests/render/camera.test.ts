import { describe, it, expect } from 'vitest'
import { cameraTransformFor, CHASE_OFFSET_M, lookFromQuery } from '../../src/render/camera.js'
import { v3, length, sub } from '../../src/sim/math/vec3.js'
import { qIdentity, qFromAxisAngle, qMul, qNormalize, qRotate } from '../../src/sim/math/quat.js'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { LOOK_CENTRE } from '../../src/input/lookAround.js'

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
    // wrong way whenever the airplane is not level.
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

  it('points roughly at the airplane, not off into open sky', () => {
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

  it('applies look-around to chase too, not just the cockpit', () => {
    // Chase discards roll when it rebuilds its attitude (see "discards roll
    // instead of tracking it" above), so a banked base attitude -- the case
    // that discriminates body vs. world frame for the cockpit -- would prove
    // nothing here: chase's own reconstructed attitude never has roll to
    // begin with. What chase DOES keep is heading and pitch, so that's what
    // has to carry this case: a climbing turn, not a bank.
    //
    // This also isn't just "look changes something": deleting the
    // `withLook(attitude, look)` call from the chase branch of
    // cameraTransformFor (returning plain `attitude` regardless of `look`)
    // makes `right` identical to `straight` and this assertion fails --
    // verified 2026-09-13, see the report's Fix round 1 section.
    const climbingTurn = qNormalize(
      qMul(qFromAxisAngle(v3(0, 1, 0), Math.PI / 2), qFromAxisAngle(v3(0, 0, 1), Math.PI / 4)),
    )
    const straight = cameraTransformFor('chase', f6f, at(v3(0, 1000, 0), climbingTurn))
    const right = cameraTransformFor('chase', f6f, at(v3(0, 1000, 0), climbingTurn), {
      yawRad: -Math.PI / 2,
      pitchRad: 0,
    })
    // Looking right rotates about the aircraft's own (body) up axis. A yaw
    // about the WORLD's up axis cannot change the forward vector's Y
    // component at all -- rotating about world Y preserves Y exactly, for
    // any input. Hand-verified 2026-09-13 with this exact attitude and look:
    // swapping the multiplication order in withLook to world-frame drops
    // this diff to 0.000, against ~0.661 for the correct body-frame order.
    const straightFwd = qRotate(straight.attitude, v3(1, 0, 0))
    const rightFwd = qRotate(right.attitude, v3(1, 0, 0))
    expect(Math.abs(rightFwd.y - straightFwd.y)).toBeGreaterThan(0.5)
  })
})

describe('look default parity', () => {
  it('camera default look and LOOK_CENTRE produce identical output', () => {
    // camera.ts deliberately does NOT import LOOK_CENTRE (a value-level
    // dependency from render/ on input/ would be architecturally backwards:
    // the camera should not care where an offset came from), so it has its
    // own "no rotation" default. Two constants meaning the same thing in two
    // files is exactly how this plan's six false-comment incidents started
    // -- this asserts they agree instead of just commenting that they should.
    const r = at(v3(0, 1000, 0), qFromAxisAngle(v3(1, 0, 0), Math.PI / 5))
    for (const mode of ['cockpit', 'chase'] as const) {
      const withDefault = cameraTransformFor(mode, f6f, r)
      const withCentre = cameraTransformFor(mode, f6f, r, LOOK_CENTRE)
      expect(withCentre).toEqual(withDefault)
    }
  })
})

describe('chase offset sign (review 2026-09-13)', () => {
  it('pins each component, not just the magnitude', () => {
    // The existing rigid-attachment test compares the eye distance against
    // `length(CHASE_OFFSET_M)`, which is invariant under any permutation or
    // sign flip of the components. Flipping the vertical to [-22,-6,0] put the
    // camera below the airplane looking up through the sea, and moving it to
    // [-22,0,6] put it on the right wingtip; both left the whole suite green.
    const [x, y, z] = CHASE_OFFSET_M
    expect(x).toBeLessThan(0) // behind: the nose is body +X
    expect(y).toBeGreaterThan(0) // above
    expect(z).toBe(0) // on the centreline
    expect(Math.abs(x)).toBeGreaterThan(y) // further back than up, or it is a top-down view
  })

  it('places the eye behind and above the airplane in the world, wings level', () => {
    // The component check above is on the constant; this one is on the
    // transform, so a sign lost between the two still fails.
    const pose = at(v3(0, 600, 0), qIdentity())
    const eye = cameraTransformFor('chase', f6f, pose, LOOK_CENTRE)
    expect(eye.position.x).toBeLessThan(pose.position.x)
    expect(eye.position.y).toBeGreaterThan(pose.position.y)
    expect(Math.abs(eye.position.z - pose.position.z)).toBeLessThan(1e-9)
  })
})

describe('DEV ?look= (Cloud Fidelity II photo view)', () => {
  it('parses yaw,pitch in degrees and rejects anything else', () => {
    expect(lookFromQuery('?x=1')).toBeUndefined()
    const l = lookFromQuery('?look=180,30')!
    expect(l.yawRad).toBeCloseTo(Math.PI, 12)
    expect(l.pitchRad).toBeCloseTo(Math.PI / 6, 12)
    for (const bad of ['30', '30,', 'a,b', '0,85', '1,2,3']) expect(() => lookFromQuery(`?look=${bad}`)).toThrow(/look/)
  })
})
