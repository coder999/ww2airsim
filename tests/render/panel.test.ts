import { describe, it, expect } from 'vitest'
import { Box3, BoxGeometry, Group, Mesh, Quaternion, Vector3 } from 'three'
import { createPanel, updatePanel, type Panel } from '../../src/render/scene/panel.js'
import { GAUGES, labelTextFor, tickMarksFor } from '../../src/render/gauges.js'
import type { TextTextureFactory } from '../../src/render/scene/text.js'
import { cameraTransformFor, CAMERA_VFOV_DEG } from '../../src/render/camera.js'
import { toThreeOrientation } from '../../src/render/frame.js'
import { createState, type AircraftState } from '../../src/sim/flight/state.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { qFromAxisAngle, qMul } from '../../src/sim/math/quat.js'
import { loadAircraftSpec } from '../../tools/content/load.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const deg = (rad: number) => (rad * 180) / Math.PI

/** Roll about the nose, right wing down for a positive angle. */
const banked = (bankDeg: number): AircraftState =>
  createState({
    position: v3(0, 600, 0),
    velocity: v3(120, 0, 0),
    attitude: {
      x: Math.sin((bankDeg * Math.PI) / 360),
      y: 0,
      z: 0,
      w: Math.cos((bankDeg * Math.PI) / 360),
    },
  })

/**
 * Heading and pitch with the wings held level: yaw about world up, then pitch
 * about the body's own lateral axis, which is how an aeroplane gets there.
 */
const wingsLevel = (headingDeg: number, pitchDeg: number): AircraftState =>
  createState({
    position: v3(0, 600, 0),
    velocity: v3(120, 0, 0),
    attitude: qMul(
      qFromAxisAngle(v3(0, 1, 0), (headingDeg * Math.PI) / 180),
      qFromAxisAngle(v3(0, 0, 1), (pitchDeg * Math.PI) / 180),
    ),
  })

/**
 * Poses a panel exactly as main.ts poses it -- the cockpit group carries the
 * render pose in sim convention and the panel is its child -- builds the
 * cockpit camera the same way main.ts builds it, and returns the rotation
 * that takes a world direction into that camera's own frame (screen right
 * = +X, screen up = +Y).
 *
 * Nothing here reads panel.ts. That is the point: every orientation check
 * below compares a projected screen angle against a WORLD quantity, rather
 * than restating the renderer's own convention back at it.
 */
function pose(panel: Panel, state: AircraftState): {
  readonly worldToCamera: Quaternion
  readonly eye: Vector3
} {
  const cockpit = new Group()
  cockpit.add(panel.root)
  cockpit.position.set(state.position.x, state.position.y, state.position.z)
  cockpit.quaternion.set(state.attitude.x, state.attitude.y, state.attitude.z, state.attitude.w)
  cockpit.updateMatrixWorld(true)

  const eye = cameraTransformFor('cockpit', f6f, {
    position: state.position,
    attitude: state.attitude,
  })
  const cq = toThreeOrientation(eye.attitude)
  return {
    worldToCamera: new Quaternion(cq.x, cq.y, cq.z, cq.w).invert(),
    eye: new Vector3(eye.position.x, eye.position.y, eye.position.z),
  }
}

/** Pitch then bank, applied in the body frame after a zero heading. */
const attitude = (pitchDeg: number, bankDeg: number): AircraftState =>
  createState({
    position: v3(0, 600, 0),
    velocity: v3(120, 0, 0),
    attitude: qMul(
      qFromAxisAngle(v3(0, 0, 1), (pitchDeg * Math.PI) / 180),
      qFromAxisAngle(v3(1, 0, 0), (bankDeg * Math.PI) / 180),
    ),
  })

/**
 * How far the bar's centre sits above the middle of the screen, in tangent
 * units (the projective quantity, so it does not depend on the lens).
 */
function barScreenHeight(panel: Panel, state: AircraftState, worldToCamera: Quaternion): number {
  const eye = cameraTransformFor('cockpit', f6f, {
    position: state.position,
    attitude: state.attitude,
  })
  const centre = new Vector3()
    .setFromMatrixPosition(panel.horizon.matrixWorld)
    .sub(new Vector3(eye.position.x, eye.position.y, eye.position.z))
    .applyQuaternion(worldToCamera)
  return centre.y / -centre.z
}

/**
 * The same quantity for the TRUE horizon, from world up alone.
 *
 * The horizontal direction straight ahead is the camera's own forward with
 * its vertical component removed; where that direction lands on screen is
 * where the horizon crosses the middle of the frame.
 */
function trueHorizonScreenHeight(worldToCamera: Quaternion): number {
  const cameraToWorld = worldToCamera.clone().invert()
  const forward = new Vector3(0, 0, -1).applyQuaternion(cameraToWorld)
  const horizontal = forward.clone().addScaledVector(new Vector3(0, 1, 0), -forward.y)
  if (horizontal.lengthSq() < 1e-12) return 0
  const h = horizontal.normalize().applyQuaternion(worldToCamera)
  return h.y / -h.z
}

/** The angle, on screen, of the horizon bar's right-hand end: 0 is level,
 *  positive is right-end-up. Read off the built geometry, not off any
 *  constant in panel.ts. */
function barScreenAngle(panel: Panel, worldToCamera: Quaternion): number {
  const dir = new Vector3(1, 0, 0)
    .transformDirection(panel.horizon.matrixWorld)
    .applyQuaternion(worldToCamera)
  return Math.atan2(dir.y, dir.x)
}

/**
 * The angle, on screen, of the TRUE horizon, in the same convention --
 * derived from world up (0,1,0) alone.
 *
 * World up projects onto the screen plane at (u.x, u.y); the horizon runs
 * perpendicular to it, so its right-hand direction is that vector turned 90
 * degrees clockwise, (u.y, -u.x).
 */
function trueHorizonScreenAngle(worldToCamera: Quaternion): number {
  const up = new Vector3(0, 1, 0).applyQuaternion(worldToCamera)
  return Math.atan2(-up.x, up.y)
}

describe('panel', () => {
  it('has exactly one needle per fitted gauge, and none spare', () => {
    // A needle with no gauge behind it is the failure mode this plan is most
    // determined to avoid: an instrument that appears to mean something.
    const p = createPanel(f6f)
    expect(p.needles.size).toBe(GAUGES.length)
    for (const g of GAUGES) expect(p.needles.has(g.id)).toBe(true)
  })

  it('sits ahead of and below the eye point, where a panel actually is', () => {
    // Ahead of the EYE, not of the airframe origin. A two-metre tolerance here
    // once hid a panel sitting 0.65 m behind the pilot's head.
    const p = createPanel(f6f)
    const c = new Box3().setFromObject(p.root).getCenter(new Vector3())
    const [ex, ey] = f6f.view.eyePointM
    expect(c.x).toBeGreaterThan(ex + 0.3)
    expect(c.x).toBeLessThan(ex + 1.5)
    expect(c.y).toBeLessThan(ey)
    expect(ey - c.y).toBeLessThan(0.7)
  })

  it('turns needles when the state changes', () => {
    const p = createPanel(f6f)
    const slow = createState({ velocity: v3(40, 0, 0) })
    const fast = createState({ velocity: v3(180, 0, 0) })
    updatePanel(p, f6f, slow)
    const a = p.needles.get('airspeed')!.rotation.z
    updatePanel(p, f6f, fast)
    const b = p.needles.get('airspeed')!.rotation.z
    expect(b).not.toBeCloseTo(a, 6)
  })

  it('lays the horizon bar along the true horizon, not mirrored about it', () => {
    // THE test this file exists for, and the one the previous version got
    // backwards: it asserted `horizon.rotation.z === -rollRad`, i.e. it
    // restated the implementation's own convention, so it pinned the wrong
    // value just as confidently as it would have pinned the right one. A
    // 30-degree right bank read -30 degrees on screen against a true horizon
    // of +30: a 60-degree error, scaling with bank, telling the pilot to roll
    // the wrong way in every turn (measured 2026-09-13).
    //
    // This version never mentions rollRad. It projects the built bar into the
    // cockpit camera's frame and compares it with the projection of WORLD UP
    // through the same camera. The two agree exactly for a pure roll about
    // the nose, which is what these attitudes are -- under combined pitch and
    // roll an attitude indicator legitimately differs from the visible
    // horizon, so the equality is only asserted where it is exactly true.
    const p = createPanel(f6f)
    for (const bankDeg of [0, 30, -45, 120]) {
      const state = banked(bankDeg)
      updatePanel(p, f6f, state)
      const { worldToCamera } = pose(p, state)
      const bar = barScreenAngle(p, worldToCamera)
      const truth = trueHorizonScreenAngle(worldToCamera)
      expect(deg(bar)).toBeCloseTo(deg(truth), 4)
      // Not vacuous: at these banks the angle is genuinely away from level,
      // so a bar stuck at zero (or mirrored) fails rather than matching.
      expect(deg(bar)).toBeCloseTo(bankDeg, 4)
    }
  })

  it('fits inside the field of view, labels and readouts included', () => {
    // Found by flying it, 2026-09-13. Mark asked for the instruments to be
    // labelled; they already were, and every label was off the bottom of the
    // screen. The panel sat with its label edge 38.4 degrees below the eye
    // line against a 30-degree screen edge, so the lower half of every dial,
    // every label and every digital readout were outside the frustum. Only
    // the top slivers of six discs were ever visible.
    //
    // Measured off the built geometry against the camera's own exported
    // field of view, so a bigger dial, a lower panel or a narrower lens all
    // fail here rather than being discovered in a screenshot.
    const p = createPanel(f6f, () => null)
    const box = new Box3().setFromObject(p.root)
    const [ex, ey, ez] = f6f.view.eyePointM
    const halfFovRad = ((CAMERA_VFOV_DEG / 2) * Math.PI) / 180
    // Body frame: +X forward. Worst case is the nearest slice of the panel,
    // where a given vertical offset subtends the largest angle.
    const nearestX = box.min.x - ex
    expect(nearestX).toBeGreaterThan(0)
    for (const y of [box.min.y, box.max.y]) {
      const angle = Math.atan2(Math.abs(y - ey), nearestX)
      expect(angle).toBeLessThan(halfFovRad)
    }
    expect(Math.abs(box.max.z - ez)).toBeLessThan(nearestX * Math.tan(halfFovRad) * 4)
  })

  it('starts the bar at eye level, before any update has run', () => {
    // `updatePanel` overwrites this on the first frame, so it is easy to
    // leave at whatever it was and never notice. It is still a claim: a panel
    // that has been built but not yet updated must not show a horizon at an
    // arbitrary height, because that is exactly the frame the pilot sees
    // first.
    const p = createPanel(f6f, () => null)
    const [, ey] = f6f.view.eyePointM
    p.root.updateMatrixWorld(true)
    expect(new Vector3().setFromMatrixPosition(p.horizon.matrixWorld).y).toBeCloseTo(ey, 6)
  })

  it('puts the horizon bar ON the true horizon, not merely parallel to it', () => {
    // The other half of what flying it found: the bar was pinned to the panel
    // at a fixed height and sat 15.8 degrees below the eye line at ZERO
    // pitch, so in level flight it hung well below the visible horizon and
    // read as a permanent nose-up error. C-1 and C-2 both fixed its ANGLE;
    // nothing had ever checked its POSITION.
    //
    // The screen position is computed here from world up alone, exactly as
    // the angle checks above are, and never from anything in panel.ts.
    const p = createPanel(f6f, () => null)
    for (const pitchDeg of [0, 10, -10, 25, -20]) {
      for (const bankDeg of [0, 30, -45]) {
        const state = attitude(pitchDeg, bankDeg)
        updatePanel(p, f6f, state, () => null)
        const { worldToCamera } = pose(p, state)
        expect(barScreenHeight(p, state, worldToCamera)).toBeCloseTo(
          trueHorizonScreenHeight(worldToCamera),
          3,
        )
      }
    }
  })

  it('holds the bar level on a wings-level aeroplane, at any pitch and heading', () => {
    // The gap the pure-roll cases above leave, found on the reference-class
    // hardware 2026-09-13: a cockpit screenshot showed a dead-level true
    // horizon, a level panel, and the bar tilted about 7 degrees.
    //
    // Wings level is the one combined-attitude case where the bar and the
    // visible horizon must agree EXACTLY -- a level aeroplane shows a level
    // horizon at any pitch and on any heading. So this asserts both: the bar
    // matches the true horizon, and both are level.
    //
    // `banked()` above builds pure roll about the nose, under which the old
    // roll formula happened to be right. That is why fifteen task reviews and
    // C-1's own replacement test all passed while the instrument lied in
    // ordinary flight.
    const p = createPanel(f6f)
    for (const headingDeg of [0, 30, 45, 90, 135, 180, -60]) {
      for (const pitchDeg of [0, 10, -15]) {
        const state = wingsLevel(headingDeg, pitchDeg)
        updatePanel(p, f6f, state)
        const { worldToCamera } = pose(p, state)
        const bar = barScreenAngle(p, worldToCamera)
        expect(deg(bar)).toBeCloseTo(deg(trueHorizonScreenAngle(worldToCamera)), 4)
        expect(deg(bar)).toBeCloseTo(0, 4)
      }
    }
  })

  it('turns every instrument face back toward the eye, not out through the nose', () => {
    // Same shape as the horizon case: each face normal is read off the built
    // geometry and compared with the direction to the eye point that
    // cameraTransformFor computes independently. Measured 2026-09-13, the
    // worst (outermost) dial scores 0.70 -- the panel is 0.60 m ahead of and
    // 0.35 m below the eye and is not tilted back, so nothing here can reach
    // 1. The threshold separates that from the two ways of getting the
    // authoring frame wrong: with no turn about Y the faces look out the
    // right wing and score 0.00, and turned the wrong way they face away at
    // -0.87 and the pilot sees six backs.
    const p = createPanel(f6f)
    const state = banked(0)
    const { eye } = pose(p, state)
    for (const dial of p.root.children) {
      const normal = new Vector3(0, 0, 1).transformDirection(dial.matrixWorld)
      const toEye = eye
        .clone()
        .sub(new Vector3().setFromMatrixPosition(dial.matrixWorld))
        .normalize()
      expect(normal.dot(toEye)).toBeGreaterThan(0.6)
    }
  })

  it('stays finite for a degenerate state', () => {
    const p = createPanel(f6f)
    updatePanel(p, f6f, createState({ velocity: v3(0, 0, 0) }))
    for (const n of p.needles.values()) expect(Number.isFinite(n.rotation.z)).toBe(true)
  })
})

describe('panel markings and readouts (I-2)', () => {
  // Whole-branch review, I-2: the panel had no labels, no scale markings and
  // no readouts, against design spec section 7 which asks for gauges that are
  // "oversized, high-contrast, clearly labelled, with digital readouts
  // alongside needles". Six identical dark discs with six identical pointers.
  // `GaugeSpec.label` and `.unit` were carried in GAUGES and rendered by
  // nothing: zero non-definition hits across src, tests and tools.

  /** Records every string the panel asks to have drawn. */
  function recordingText(): { factory: TextTextureFactory; drawn: string[] } {
    const drawn: string[] = []
    return {
      factory: (text: string): null => {
        drawn.push(text)
        return null
      },
      drawn,
    }
  }

  it('prints the name and unit of every gauge', () => {
    const { factory, drawn } = recordingText()
    createPanel(f6f, factory)
    for (const g of GAUGES) expect(drawn).toContain(labelTextFor(g))
  })

  it('prints a number beside every major scale mark', () => {
    const { factory, drawn } = recordingText()
    createPanel(f6f, factory)
    for (const g of GAUGES) {
      for (const m of tickMarksFor(g)) {
        if (m.major) expect(drawn).toContain(m.text)
      }
    }
  })

  it('places every scale mark at the angle its own value maps to', () => {
    // The mark has to sit where the needle will point, and this checks the
    // built GEOMETRY rather than the function that generated it -- the angle
    // is recovered from the mesh's position with atan2, independently of
    // `angleForValue`. A transposed sin/cos or a sign slip in the placement
    // would pass every test in gauges.test.ts and still scatter the marks.
    const p = createPanel(f6f, recordingText().factory)
    const dials = p.root.children.filter((c): c is Group => c instanceof Group)
    expect(dials.length).toBe(GAUGES.length)
    GAUGES.forEach((g, i) => {
      const expected = tickMarksFor(g).map((m) => m.angleRad).sort((a, b) => a - b)
      const placed = dials[i]!.children
        .filter((c) => c instanceof Mesh && c.geometry instanceof BoxGeometry)
        .map((c) => {
          const a = Math.atan2(c.position.x, c.position.y)
          return a < 0 ? a + Math.PI * 2 : a
        })
        .sort((a, b) => a - b)
      // Every mark angle appears among the placed meshes. The needle is a box
      // too and sits at the dial centre, where atan2(0, 0) is 0 -- so a mark
      // at 0 and the needle coincide, and the count is not asserted here.
      for (const want of expected) {
        expect(placed.some((got) => Math.abs(got - want) < 1e-9)).toBe(true)
      }
    })
  })

  it('shows the current value as digits, and updates them as the aeroplane moves', () => {
    const { factory, drawn } = recordingText()
    const p = createPanel(f6f, factory)
    updatePanel(p, f6f, createState({ position: v3(0, 1234, 0) }), factory)
    expect(p.readouts.get('altimeter')!.text).toBe('1234')
    expect(drawn).toContain('1234')
    updatePanel(p, f6f, createState({ position: v3(0, 2500, 0) }), factory)
    expect(p.readouts.get('altimeter')!.text).toBe('2500')
  })

  it('re-rasterises only when the digits actually change', () => {
    // Six canvases redrawn every frame at 60 fps to show the same six strings
    // is pure waste, and the strings change a few times a second at most.
    const { factory, drawn } = recordingText()
    const p = createPanel(f6f, factory)
    const state = createState({ position: v3(0, 1234, 0) })
    updatePanel(p, f6f, state, factory)
    const after = drawn.length
    updatePanel(p, f6f, state, factory)
    updatePanel(p, f6f, state, factory)
    expect(drawn.length).toBe(after)
  })

  it('has one readout per fitted gauge and none spare', () => {
    const p = createPanel(f6f, recordingText().factory)
    expect(p.readouts.size).toBe(GAUGES.length)
    for (const g of GAUGES) expect(p.readouts.has(g.id)).toBe(true)
  })

  it('builds without a canvas rather than throwing, which is how it is tested', () => {
    // The default factory is the real one. On nexus there is no `document`,
    // so it must return null and leave the geometry intact rather than throw.
    expect(typeof document).toBe('undefined')
    const p = createPanel(f6f)
    expect(p.needles.size).toBe(GAUGES.length)
    expect(p.readouts.size).toBe(GAUGES.length)
    expect(() => updatePanel(p, f6f, createState({ position: v3(0, 500, 0) }))).not.toThrow()
  })
})
