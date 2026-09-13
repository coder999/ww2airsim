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

  it('follows heading, so the aeroplane stays in frame through a turn', () => {
    const yawed = qFromAxisAngle(v3(0, 1, 0), Math.PI / 2)
    const eye = cameraTransformFor('chase', f6f, at(v3(0, 1000, 0), yawed))
    const fwd = qRotate(eye.attitude, v3(1, 0, 0))
    const toAircraft = sub(v3(0, 1000, 0), eye.position)
    const dotted = (fwd.x * toAircraft.x + fwd.y * toAircraft.y + fwd.z * toAircraft.z)
    expect(dotted).toBeGreaterThan(0)
  })
})
