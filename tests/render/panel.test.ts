import { describe, it, expect } from 'vitest'
import { Box3, Group, Quaternion, Vector3 } from 'three'
import { createPanel, updatePanel, type Panel } from '../../src/render/scene/panel.js'
import { GAUGES } from '../../src/render/gauges.js'
import { cameraTransformFor } from '../../src/render/camera.js'
import { toThreeOrientation } from '../../src/render/frame.js'
import { createState, type AircraftState } from '../../src/sim/flight/state.js'
import { v3 } from '../../src/sim/math/vec3.js'
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
