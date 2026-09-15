import { describe, it, expect } from 'vitest'
import { Box3, BoxGeometry, Group, Mesh, PlaneGeometry, Quaternion, Vector3 } from 'three'
import {
  createPanel,
  updatePanel,
  PANEL_MIN_ASPECT,
  PANEL_BELOW_M,
  type Panel,
} from '../../src/render/scene/panel.js'
import { degreesBelowEye } from '../../src/render/scene/panelLayout.js'
import {
  GAUGES,
  angleForValue,
  gaugeValue,
  labelTextFor,
  tickMarksFor,
  type DialSpec,
} from '../../src/render/gauges.js'
import type { TextTextureFactory } from '../../src/render/scene/text.js'
import { cameraTransformFor, CAMERA_VFOV_DEG } from '../../src/render/camera.js'
import { toThreeOrientation } from '../../src/render/frame.js'
import { createState, type AircraftState, type Controls } from '../../src/sim/flight/state.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { qFromAxisAngle, qMul } from '../../src/sim/math/quat.js'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { GAUGE_SAMPLES } from './gaugeSamples.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const deg = (rad: number) => (rad * 180) / Math.PI

/** No input held. Every `updatePanel` call in later tasks uses this -- see
 *  task-1-brief.md. */
const NEUTRAL_CONTROLS: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0 }

/**
 * The gauges the panel actually builds as round dials.
 *
 * `GAUGES` gained a throttle column and a heading tape on 2026-09-15
 * (controller ruling R1); `createPanel` filters to `kind === 'dial'` when
 * building the row (panel.ts), so tests that check the BUILT geometry --
 * dial count, needle count, readout count -- have to filter the same way.
 */
const DIAL_GAUGES = GAUGES.filter((g): g is DialSpec => g.kind === 'dial')

/**
 * The dial groups, selected by NAME rather than by "every Group child".
 *
 * The structural version was correct only while dials were the sole Group on
 * the panel. Adding the gunsight reticle on 2026-09-15 made it silently count
 * the sight as a seventh dial, so the selection is explicit now and a new
 * group cannot quietly join the row again.
 */
const dialsOf = (p: Panel): Group[] =>
  p.root.children.filter((c): c is Group => c instanceof Group && c.name.startsWith('dial:'))

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
    expect(p.needles.size).toBe(DIAL_GAUGES.length)
    for (const g of DIAL_GAUGES) expect(p.needles.has(g.id)).toBe(true)
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
    updatePanel(p, f6f, slow, NEUTRAL_CONTROLS)
    const a = p.needles.get('airspeed')!.rotation.z
    updatePanel(p, f6f, fast, NEUTRAL_CONTROLS)
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
      updatePanel(p, f6f, state, NEUTRAL_CONTROLS)
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
    //
    // Excludes `p.backing`: Task 3 (2026-09-15) deliberately runs that plate
    // past the frustum on every edge -- past the bottom so it reads as
    // clipped rather than floating, and out to the frustum's own horizontal
    // edge so it spans full width at the narrowest supported window. This
    // test is about the READABLE content (dials, labels, readouts), which is
    // exactly what its own title says; the coaming behind it is checked
    // separately in "runs the bezel past the bottom of the frame".
    //
    // Excluded by IDENTITY (`child === p.backing`), not by name. Review
    // ruling R5, 2026-09-15: a name match excludes only the plate's own
    // Box3 -- anything mounted UNDER it (its natural role, since it is the
    // one full-width surface behind the dials -- exactly where a radar or
    // armament screen would eventually mount) would be silently swallowed
    // along with it and never checked here. Identity has no such hole, and
    // the sibling assertion below pins the plate bare so the hole cannot
    // reopen by something being parented there later.
    const p = createPanel(f6f, () => null)
    expect(p.backing.children).toHaveLength(0)
    p.root.updateMatrixWorld(true)
    const box = new Box3()
    for (const child of p.root.children) {
      if (child === p.backing) continue
      box.union(new Box3().setFromObject(child))
    }
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
    // The horizontal half-angle is the vertical one scaled by the ASPECT
    // RATIO. This assertion used the vertical half-angle times a bare 4,
    // which permitted a half-width of 1.386 m against an actual 0.53 -- it
    // would have passed a panel 2.3 times too wide, while reading as a guard.
    // Found by review 2026-09-13, in the same commit that fixed the vertical
    // case it was written alongside.
    const halfWidthAllowed = nearestX * Math.tan(halfFovRad) * PANEL_MIN_ASPECT
    for (const z of [box.min.z, box.max.z]) {
      expect(Math.abs(z - ez)).toBeLessThan(halfWidthAllowed)
    }
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

  it('leaves clear air between adjacent dials', () => {
    // Flying it 2026-09-13: the bezels were 0.185 m across on a 0.165 m centre
    // spacing, so every pair of neighbours overlapped by 20 mm and the row read
    // as one smear. Nothing measured the relation between the two constants.
    const p = createPanel(f6f, () => null)
    const dials = dialsOf(p)
    const centres = dials.map((d) => d.position.x).sort((a, b) => a - b)
    const bezelOuter = Math.max(
      ...dials[0]!.children
        .filter((c): c is Mesh => c instanceof Mesh)
        .map((c) => new Box3().setFromObject(c).max.x),
    )
    for (let i = 1; i < centres.length; i++) {
      expect(centres[i]! - centres[i - 1]!).toBeGreaterThan(bezelOuter * 2)
    }
  })

  it('keeps every needle inside its own dial', () => {
    // The needle reached 1.30 radii from the pivot against a rim at 1.09, so
    // each one speared its neighbour. Visible in the screenshot; measured by
    // nothing.
    const p = createPanel(f6f, () => null)
    const dial = dialsOf(p)[0]!
    const rim = Math.max(
      ...dial.children
        .filter((c): c is Mesh => c instanceof Mesh)
        .map((c) => new Box3().setFromObject(c).max.x),
    )
    for (const g of DIAL_GAUGES) {
      updatePanel(p, f6f, GAUGE_SAMPLES[g.id].high, NEUTRAL_CONTROLS, () => null)
      const needle = p.needles.get(g.id) as Mesh
      const reach = new Box3().setFromObject(needle).max.length()
      expect(reach).toBeLessThanOrEqual(rim + 1e-9)
    }
  })

  it('gives every printed scale number room not to collide with the next one', () => {
    // The fuel dial ran eight majors 38.6 degrees apart and the slip dial five
    // at 22.5, against a numeral plate more than twice the arc available. The
    // screenshot shows "-0.50.25" and "+15+8.0-5.0" as a result.
    const p = createPanel(f6f, () => null)
    const dials = dialsOf(p)
    DIAL_GAUGES.forEach((g, i) => {
      const numerals = dials[i]!.children.filter(
        (c): c is Mesh => c instanceof Mesh && c.geometry instanceof PlaneGeometry,
      )
      const majors = tickMarksFor(g).filter((m) => m.major)
      expect(numerals.length).toBeGreaterThanOrEqual(majors.length)
      const placed = numerals.map((n) => n.position)
      for (let a = 0; a < placed.length; a++) {
        for (let b = a + 1; b < placed.length; b++) {
          const dx = Math.abs(placed[a]!.x - placed[b]!.x)
          const dy = Math.abs(placed[a]!.y - placed[b]!.y)
          const w = (numerals[a]!.geometry as PlaneGeometry).parameters.width
          const h = (numerals[a]!.geometry as PlaneGeometry).parameters.height
          // Boxes must not intersect: separated on at least one axis.
          expect(dx >= w || dy >= h).toBe(true)
        }
      }
    })
  })

  it('keeps every scale number clear of the tick marks', () => {
    // Seen on the reference platform 2026-09-13: at the end of each scale the
    // numeral sat across its own major tick, because the numerals were placed
    // by radius alone with no account of their own width. The sibling tests
    // checked numeral-versus-numeral and readout-versus-numeral, and this
    // third pair was the one left out.
    const p = createPanel(f6f, () => null)
    const dials = dialsOf(p)
    for (const dial of dials) {
      const meshes = dial.children.filter((c): c is Mesh => c instanceof Mesh)
      const numerals = meshes.filter((m) => m.geometry instanceof PlaneGeometry)
      const ticks = meshes.filter(
        (m) => m.geometry instanceof BoxGeometry && m !== p.needles.get('airspeed'),
      )
      for (const n of numerals) {
        const nb = new Box3().setFromObject(n)
        for (const t of ticks) {
          // The needle legitimately crosses everything; it is drawn on top.
          if ([...p.needles.values()].includes(t)) continue
          expect(nb.intersectsBox(new Box3().setFromObject(t))).toBe(false)
        }
      }
    }
  })

  it('keeps the digital readout clear of the scale numerals', () => {
    // Inside the dial it sat across them -- the altimeter's "605" was drawn
    // over its own 8000 and 6000 marks. A three-quarter sweep covers the
    // bottom of the face, so there is no clear window down there.
    const p = createPanel(f6f, () => null)
    const dials = dialsOf(p)
    DIAL_GAUGES.forEach((g, i) => {
      const readout = p.readouts.get(g.id)!.mesh
      const rBox = new Box3().setFromObject(readout)
      for (const numeral of dials[i]!.children) {
        if (numeral === readout || !(numeral instanceof Mesh)) continue
        if (!(numeral.geometry instanceof PlaneGeometry)) continue
        const nBox = new Box3().setFromObject(numeral)
        expect(rBox.intersectsBox(nBox)).toBe(false)
      }
    })
  })

  it('hides the horizon bar behind the coaming rather than across the dials', () => {
    // I-7 gave the bar exact geometry, which keeps it travelling: from about
    // 8 degrees nose-up it reached the dial faces and by 17.5 it crossed the
    // centres of the two inner dials. It is now behind an opaque backing
    // plate, which is what a real coaming does, so no clamp is needed --
    // but only if the layering is right, which is what this checks.
    const p = createPanel(f6f, () => null)
    const backing = p.root.children.find(
      (c): c is Mesh => c instanceof Mesh && c.geometry instanceof PlaneGeometry,
    )
    expect(backing).toBeDefined()
    // Local +Z points at the pilot, so "behind" is a SMALLER z.
    expect(p.horizon.position.z).toBeLessThan(backing!.position.z)
    const dialFaceZ = 0
    expect(backing!.position.z).toBeLessThan(dialFaceZ)
    // And the plate must actually cover the dials it is shielding.
    const box = new Box3().setFromObject(p.root)
    const bb = new Box3().setFromObject(backing!)
    expect(bb.min.z).toBeLessThanOrEqual(box.min.z)
    expect(bb.max.z).toBeGreaterThanOrEqual(box.max.z)
  })

  it('lays the bar against the attitude it is given, not the one in the state', () => {
    // The camera and airframe are posed from the interpolated tick and the
    // gauges from the simulated one. The bar took the simulated attitude too,
    // so at 80 deg/s of roll it led the visible horizon by up to 1.33 degrees,
    // sawtoothing at tick rate against the one thing it must agree with.
    const p = createPanel(f6f, () => null)
    const level = attitude(0, 0)
    const rolled = attitude(0, 30)
    updatePanel(p, f6f, level, NEUTRAL_CONTROLS, () => null, rolled.attitude)
    expect(deg(p.horizon.rotation.z)).toBeCloseTo(30, 6)
    updatePanel(p, f6f, rolled, NEUTRAL_CONTROLS, () => null, level.attitude)
    expect(deg(p.horizon.rotation.z)).toBeCloseTo(0, 6)
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
        updatePanel(p, f6f, state, NEUTRAL_CONTROLS, () => null)
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
        updatePanel(p, f6f, state, NEUTRAL_CONTROLS)
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
    // worst (outermost) dial scores 0.79 -- the panel is 0.60 m ahead of and
    // 0.19 m below the eye and is not tilted back, so nothing here can reach
    // 1. (Both numbers were restated 2026-09-13 after the panel moved: the
    // comment still quoted 0.70 and 0.35 m, which the same commit that
    // changed them left behind.) The threshold separates that from the two
    // ways of getting the authoring frame wrong: with no turn about Y the
    // faces look out the right wing and score 0.00, and turned the wrong way
    // they face away and the pilot sees six backs.
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
    updatePanel(p, f6f, createState({ velocity: v3(0, 0, 0) }), NEUTRAL_CONTROLS)
    for (const n of p.needles.values()) expect(Number.isFinite(n.rotation.z)).toBe(true)
  })

  it('accepts an explicit control vector without throwing (2026-09-15)', () => {
    // main.ts now passes `current.controls` as the required fourth argument,
    // the same vector it already reads for the propeller spin, so the
    // throttle gauge (a column, not yet drawn) can eventually read it too.
    // This is a smoke test of that plumbing rather than a behavioural one:
    // no dial reads `controls` today, so there is nothing visible to assert
    // yet.
    const p = createPanel(f6f)
    expect(() => updatePanel(p, f6f, createState(), NEUTRAL_CONTROLS)).not.toThrow()
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

  it('prints the name and unit of every fitted dial', () => {
    // Dial-only: createPanel only builds a label plate for a rendered dial.
    // Throttle (a column) and heading (a tape, since 2026-09-15) are in
    // GAUGES but not yet drawn at all -- see the file-level comment on
    // DIAL_GAUGES.
    const { factory, drawn } = recordingText()
    createPanel(f6f, factory)
    for (const g of DIAL_GAUGES) expect(drawn).toContain(labelTextFor(g))
  })

  it('prints a number beside every major scale mark on a fitted dial', () => {
    const { factory, drawn } = recordingText()
    createPanel(f6f, factory)
    for (const g of DIAL_GAUGES) {
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
    const dials = dialsOf(p)
    expect(dials.length).toBe(DIAL_GAUGES.length)
    DIAL_GAUGES.forEach((g, i) => {
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

  it('turns the needle the way the gauge says, on every instrument', () => {
    // Mutation, 2026-09-13: `needle.rotation.z = -angle` changed to `= angle`
    // mirrored all six instruments about their own zero and the whole suite
    // stayed green, as did negating the pivot translation so each needle
    // pointed 180 degrees out. gauges.test.ts pins the NUMBER and the earlier
    // panel tests pin the TICK MESHES; the join between them -- the needle
    // actually rotating that way -- was untested.
    //
    // Read against the marks, not against the sign in panel.ts: for each
    // gauge the needle at its high sample must point at the same screen angle
    // as a tick mark placed at that same value.
    const p = createPanel(f6f, () => null)
    // Dial-only since 2026-09-15: only a dial gets a needle (createPanel
    // filters `GAUGES` to `kind === 'dial'`), and `angleForValue` is typed
    // to `DialSpec` accordingly.
    for (const g of GAUGES) {
      if (g.kind !== 'dial') continue
      updatePanel(p, f6f, GAUGE_SAMPLES[g.id].high, NEUTRAL_CONTROLS, () => null)
      const needle = p.needles.get(g.id) as Mesh
      const value = gaugeValue(g.id, f6f, GAUGE_SAMPLES[g.id].high, NEUTRAL_CONTROLS)
      // A tick at `value` sits at (sin a, cos a) from the dial centre; the
      // needle's own tip direction must agree.
      const a = angleForValue(g, value)
      const tip = new Vector3(0, 1, 0).applyEuler(needle.rotation)
      expect(tip.x).toBeCloseTo(Math.sin(a), 9)
      expect(tip.y).toBeCloseTo(Math.cos(a), 9)
      // And the mesh must extend from the pivot outward, not back through it.
      const centre = new Vector3()
      needle.geometry.computeBoundingBox()
      needle.geometry.boundingBox!.getCenter(centre)
      expect(centre.y).toBeGreaterThan(0)
    }
  })

  it('shows the current value as digits, and updates them as the aeroplane moves', () => {
    const { factory, drawn } = recordingText()
    const p = createPanel(f6f, factory)
    // Feet since 2026-09-15: 1234 m is 4048.6 ft and 2500 m is 8202.1 ft.
    // Deliberately NOT the metres the state holds -- a panel printing the
    // stored number under an "ft" label is the false claim this change exists
    // to remove.
    updatePanel(p, f6f, createState({ position: v3(0, 1234, 0) }), NEUTRAL_CONTROLS, factory)
    expect(p.readouts.get('altimeter')!.text).toBe('4049')
    expect(drawn).toContain('4049')
    updatePanel(p, f6f, createState({ position: v3(0, 2500, 0) }), NEUTRAL_CONTROLS, factory)
    expect(p.readouts.get('altimeter')!.text).toBe('8202')
  })

  it('re-rasterises only when the digits actually change', () => {
    // Six canvases redrawn every frame at 60 fps to show the same six strings
    // is pure waste, and the strings change a few times a second at most.
    const { factory, drawn } = recordingText()
    const p = createPanel(f6f, factory)
    const state = createState({ position: v3(0, 1234, 0) })
    updatePanel(p, f6f, state, NEUTRAL_CONTROLS, factory)
    const after = drawn.length
    updatePanel(p, f6f, state, NEUTRAL_CONTROLS, factory)
    updatePanel(p, f6f, state, NEUTRAL_CONTROLS, factory)
    expect(drawn.length).toBe(after)
  })

  it('has one readout per fitted gauge and none spare', () => {
    const p = createPanel(f6f, recordingText().factory)
    expect(p.readouts.size).toBe(DIAL_GAUGES.length)
    for (const g of DIAL_GAUGES) expect(p.readouts.has(g.id)).toBe(true)
  })

  it('builds without a canvas rather than throwing, which is how it is tested', () => {
    // The default factory is the real one. On nexus there is no `document`,
    // so it must return null and leave the geometry intact rather than throw.
    expect(typeof document).toBe('undefined')
    const p = createPanel(f6f)
    expect(p.needles.size).toBe(DIAL_GAUGES.length)
    expect(p.readouts.size).toBe(DIAL_GAUGES.length)
    expect(() => updatePanel(p, f6f, createState({ position: v3(0, 500, 0) }), NEUTRAL_CONTROLS)).not.toThrow()
  })
})

describe('the two-band dashboard (2026-09-15)', () => {
  it('runs the bezel past the bottom of the frame, so it is clipped not floating', () => {
    // The complaint this fixes: sky was visible below the panel on both sides,
    // so it read as a strip hanging in the view rather than a dashboard.
    const p = createPanel(f6f, () => null)
    const box = new Box3().setFromObject(p.backing)
    const lowestBelowEye = PANEL_BELOW_M - box.min.y
    expect(degreesBelowEye(lowestBelowEye)).toBeGreaterThan(CAMERA_VFOV_DEG / 2)
  })

  it('draws nothing in the reserved radar and armament slots', () => {
    // An unlit bezel that never fills reads as a broken instrument. The slots
    // exist in the arithmetic only, until Plan 6 has something to put in them.
    const p = createPanel(f6f, () => null)
    const named = p.root.children.map((c) => c.name)
    expect(named).not.toContain('radar')
    expect(named).not.toContain('armament')
  })

  it('keeps five dials, heading having left for the tape', () => {
    // Ruling R1: the ball is panel geometry, not a GAUGES row, so it is not a
    // dial and does not appear here. Five dials plus the ball fill the row.
    expect(dialsOf(createPanel(f6f, () => null))).toHaveLength(5)
  })
})

describe('the gunsight reticle (2026-09-15)', () => {
  /** Where a point on the panel lands on screen, in tangent units: (0, 0) is
   *  dead centre, and the quantity is projective so it ignores the lens. */
  const screenOf = (object: { matrixWorld: Parameters<Vector3['setFromMatrixPosition']>[0] },
                    state: AircraftState,
                    worldToCamera: Quaternion,
                    eye: Vector3) => {
    const p = new Vector3().setFromMatrixPosition(object.matrixWorld).sub(eye).applyQuaternion(worldToCamera)
    return { x: p.x / -p.z, y: p.y / -p.z }
  }

  it('sits on the boresight, at every attitude', () => {
    // A reflector sight is aimed where the guns point, so the reticle has to
    // land dead centre whatever the aeroplane is doing -- it is fixed to the
    // airframe, not to the world like the horizon bar two tests above.
    //
    // This is the assertion that a reticle parented correctly but positioned
    // on the PANEL FACE would fail: the panel sits PANEL_BELOW_M below the eye,
    // so a sight built at local y = 0 projects well below centre rather than
    // on it. Checked across attitudes so a pose bug cannot hide at level.
    const attitudes = [[0, 0], [12, 0], [-20, 0], [0, 45], [8, -30]] as const
    for (const [pitchDeg, bankDeg] of attitudes) {
      const panel = createPanel(f6f)
      const state = attitude(pitchDeg, bankDeg)
      const { worldToCamera, eye } = pose(panel, state)
      const at = screenOf(panel.reticle, state, worldToCamera, eye)

      expect(at.x, `pitch ${pitchDeg} bank ${bankDeg}: horizontal`).toBeCloseTo(0, 6)
      expect(at.y, `pitch ${pitchDeg} bank ${bankDeg}: vertical`).toBeCloseTo(0, 6)
    }
  })
})
