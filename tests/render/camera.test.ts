import { describe, it, expect } from 'vitest'
import { cameraTransformFor, CHASE_OFFSET_M, lookFromQuery, ORBIT_SURFACE_CLEARANCE_M } from '../../src/render/camera.js'
import { v3, length, sub, dot, normalize, add, scale, type Vec3 } from '../../src/sim/math/vec3.js'
import { qIdentity, qFromAxisAngle, qMul, qNormalize, qRotate, type Quat } from '../../src/sim/math/quat.js'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { LOOK_CENTRE } from '../../src/input/lookAround.js'
import { ORBIT_ZERO } from '../../src/input/orbit.js'
import { shouldResetHistory } from '../../src/render/scene/cloudHistory.js'

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

/** The airplane's direction as seen from the eye, in the eye's own frame. */
const aircraftInEye = (eye: { position: Vec3; attitude: Quat }, target: Vec3): Vec3 => {
  const d = normalize(sub(target, eye.position))
  const conj = { x: -eye.attitude.x, y: -eye.attitude.y, z: -eye.attitude.z, w: eye.attitude.w }
  return qRotate(conj, d)
}

/** Orbit camera spec 2026-09-27 and its plan's rulings P-1..P-4. */
describe('orbit', () => {
  const climbingTurn = qNormalize(qMul(qFromAxisAngle(v3(0, 1, 0), 0.7), qFromAxisAngle(v3(0, 0, 1), 0.3)))

  it('ORBIT_ZERO is bit-identical to the pre-orbit chase eye', () => {
    for (let i = 0; i < 64; i++) {
      const att = qNormalize(qMul(qFromAxisAngle(v3(0, 1, 0), i * 0.37), qFromAxisAngle(v3(1, 0, 0), i * 0.91)))
      const r = at(v3(i * 13, 1500, -i * 7), att)
      expect(cameraTransformFor('chase', f6f, r, LOOK_CENTRE, 90 + i, ORBIT_ZERO, () => 0))
        .toEqual(cameraTransformFor('chase', f6f, r, LOOK_CENTRE, 90 + i))
    }
  })

  it('+yaw swings the eye to the left, +pitch raises it (ruling P-4)', () => {
    const r = at(v3(0, 1000, 0))
    const left = cameraTransformFor('chase', f6f, r, LOOK_CENTRE, 120, { yawRad: Math.PI / 2, pitchRad: 0, zoom: 1 })
    expect(left.position.z).toBeLessThan(-10) // body -Z is left; identity attitude
    const zero = cameraTransformFor('chase', f6f, r)
    const up = cameraTransformFor('chase', f6f, r, LOOK_CENTRE, 120, { yawRad: 0, pitchRad: 0.5, zoom: 1 })
    expect(up.position.y).toBeGreaterThan(zero.position.y + 5)
  })

  it('is tethered: a fixed offset keeps its heading-relative bearing through a turn', () => {
    const orbit = { yawRad: 1.1, pitchRad: 0.2, zoom: 1.5 }
    const bearings = [0, 1, 2, 3, 4, 5].map((k) => {
      const heading = qFromAxisAngle(v3(0, 1, 0), k)
      const r = at(v3(0, 1000, 0), heading)
      const rel = sub(cameraTransformFor('chase', f6f, r, LOOK_CENTRE, 120, orbit).position, r.position)
      // Back into the airplane's heading frame: a pure yaw's inverse negates its Y component.
      return qRotate({ ...heading, y: -heading.y }, rel)
    })
    for (const b of bearings) {
      expect(b.x).toBeCloseTo(bearings[0]!.x, 6)
      expect(b.y).toBeCloseTo(bearings[0]!.y, 6)
      expect(b.z).toBeCloseTo(bearings[0]!.z, 6)
    }
  })

  it('keeps the airplane where the default view frames it, from any angle', () => {
    const r = at(v3(0, 1000, 0), climbingTurn)
    const home = aircraftInEye(cameraTransformFor('chase', f6f, r), r.position)
    for (const orbit of [
      { yawRad: 2.5, pitchRad: 0.9, zoom: 3 },
      { yawRad: -1.2, pitchRad: -1.3, zoom: 0.5 },
    ]) {
      const seen = aircraftInEye(cameraTransformFor('chase', f6f, r, LOOK_CENTRE, 120, orbit), r.position)
      expect(Math.acos(Math.min(1, dot(seen, home)))).toBeLessThan((0.1 * Math.PI) / 180)
    }
  })

  it('zoom scales the distance', () => {
    const r = at()
    const d1 = length(sub(cameraTransformFor('chase', f6f, r).position, r.position))
    const d3 = length(sub(cameraTransformFor('chase', f6f, r, LOOK_CENTRE, 120, { ...ORBIT_ZERO, zoom: 3 }).position, r.position))
    expect(d3 / d1).toBeCloseTo(3, 9)
  })

  it('never puts the eye below the surface + clearance', () => {
    const r = at(v3(0, 50, 0)) // 50 m over the sea
    const eye = cameraTransformFor('chase', f6f, r, LOOK_CENTRE, 120, { yawRad: 0, pitchRad: (-80 * Math.PI) / 180, zoom: 4 }, () => 0)
    expect(eye.position.y).toBeGreaterThanOrEqual(ORBIT_SURFACE_CLEARANCE_M)
  })

  // Final review, Important 1: lifting only the eye's height left its
  // attitude aimed for the unclamped place, so a parked airplane dropped off
  // the bottom of the screen past a ~30 deg upward drag (-38.5 deg at -40,
  // -76.9 at -80, against a +-30 deg screen). The clamp must keep spec §7's
  // framing, on the ground and on a deck floor alike.
  it('keeps the default framing when the surface clamp engages (parked, ground and deck heights)', () => {
    for (const floorM of [0, 17.4]) {
      const r = at(v3(0, floorM + f6f.gear.heightM, 0))
      const home = aircraftInEye(cameraTransformFor('chase', f6f, r, LOOK_CENTRE, 0), r.position)
      for (const zoom of [1, 4]) {
        for (const pitchDeg of [-30, -40, -60, -80]) {
          const eye = cameraTransformFor('chase', f6f, r, LOOK_CENTRE, 0, { yawRad: 0.4, pitchRad: (pitchDeg * Math.PI) / 180, zoom }, () => floorM)
          expect(eye.position.y).toBeGreaterThanOrEqual(floorM + ORBIT_SURFACE_CLEARANCE_M - 1e-6)
          const seen = aircraftInEye(eye, r.position)
          expect(Math.acos(Math.min(1, dot(seen, home))), `floor ${floorM} zoom ${zoom} pitch ${pitchDeg}`).toBeLessThan((0.1 * Math.PI) / 180)
        }
      }
    }
  })

  it('a 180 deg/s drag at zoom 1 and 200 m/s never resets cloud history (plan ruling P-2)', () => {
    const dt = 1 / 60
    let prev = cameraTransformFor('chase', f6f, at(v3(0, 1500, 0)), LOOK_CENTRE, 200)
    for (let i = 1; i <= 120; i++) {
      const pos = add(v3(0, 1500, 0), scale(v3(200, 0, 0), i * dt))
      const eye = cameraTransformFor('chase', f6f, at(pos), LOOK_CENTRE, 200, { yawRad: Math.PI * i * dt, pitchRad: 0, zoom: 1 })
      expect(shouldResetHistory({ eye: eye.position, prevEye: prev.position, frameSeconds: dt })).toBe(false)
      prev = eye
    }
  })
})
