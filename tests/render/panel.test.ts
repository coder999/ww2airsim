import { describe, it, expect } from 'vitest'
import { Box3, BoxGeometry, BufferAttribute, Group, Mesh, PlaneGeometry, Quaternion, Vector3 } from 'three'
import {
  createPanel,
  updatePanel,
  resizePanel,
  PANEL_AHEAD_M,
  PANEL_MIN_ASPECT,
  PANEL_BELOW_M,
  TAPE_W,
  TAPE_CULL_MARGIN_M,
  type Panel,
} from '../../src/render/scene/panel.js'
import {
  degreesBelowEye,
  DIAL_RADIUS,
  PANEL_BANDS,
  PANEL_SLOTS,
} from '../../src/render/scene/panelLayout.js'
import {
  GAUGES,
  angleForValue,
  gaugeValue,
  labelTextFor,
  tickMarksFor,
  tapeOffsetFor,
  type DialSpec,
  type TapeSpec,
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

/**
 * The attitude ball's screen-projection helpers.
 *
 * Fix round 1 on Task 6 (2026-09-15) replaced the ball's rigid
 * rotate-then-translate transform with fresh geometry rebuilt every frame
 * (`attitudeBallGeometry` in panel.ts) after the transform-based version
 * turned out to draw 56 mm into the fuel dial's face at a 45-degree bank.
 * There is no `rotation.z`/`position.y` to read off `panel.attitude.ball` --
 * the horizon is now the shared chord between the sky and ground segments,
 * so these helpers read that chord's two endpoint vertices directly off the
 * sky mesh's own `BufferGeometry`, in WORLD space, rather than a transform.
 *
 * Task 7 (2026-09-15) retired the horizon bar and its own equivalent
 * helpers (`barScreenHeight`/`barScreenAngle`, which read `panel.horizon`'s
 * transform directly) once this ball's coverage below stood in for them --
 * with one deliberate exception: the bar's own `trueHorizonScreenHeight`
 * comparison (its "puts the horizon bar ON the true horizon" test) has NO
 * ball equivalent here, and did not get one. Measured directly (Task 7):
 * the bar was positioned by exact 3D geometry to coincide with the true
 * horizon's own screen height at any pitch, but the ball's pitch reading is
 * `attitudeBallGeometry`'s fixed `0.8 * DIAL_RADIUS` per 30 degrees, a
 * panel-instrument-scale deflection, not a literal projection -- the two
 * diverge sharply past small pitches (e.g. roughly 0.66 vs -0.36 in tangent
 * units at 20 degrees nose-up, bank 0) and a test asserting they match would
 * fail correctly-behaving code. `ballScreenHeight` is still used below, but
 * only to check the ball's height moves the expected DIRECTION with pitch
 * ("drops its horizon as the nose comes up"), not that it matches a world
 * quantity.
 */
/**
 * The chord's two endpoint vertices, in WORLD space.
 *
 * `attitudeBallGeometry`'s `segment()` builds the sky shape starting with
 * `moveTo` (the `skyFrom` end of the chord) and ending with a `lineTo` to
 * `skyTo` -- but `ShapeGeometry` reverses its input point order whenever the
 * given contour is not already clockwise (three.js's own front-face
 * convention), so index 0 is NOT reliably the `skyFrom` end; it can be
 * either, depending on the current roll and pitch. That reversal does not
 * affect a MIDPOINT (order-independent, used by `ballScreenHeight`), only a
 * DIRECTION (used by `ballScreenAngle`, which resolves it separately below).
 */
function ballChordEndpoints(panel: Panel): readonly [Vector3, Vector3] {
  const sky = panel.attitude.ball.children[0] as Mesh
  const position = sky.geometry.attributes.position as BufferAttribute
  const from = new Vector3().fromBufferAttribute(position, 0).applyMatrix4(sky.matrixWorld)
  const to = new Vector3()
    .fromBufferAttribute(position, position.count - 1)
    .applyMatrix4(sky.matrixWorld)
  return [from, to]
}

/**
 * The pitch deflection `attitudeBallGeometry` bakes into the chord, read
 * directly off the sky mesh's own (pre-`matrixWorld`) geometry rather than
 * the world-space chord above.
 *
 * At `rollRad = 0` (every caller below uses `attitude(pitchDeg, 0)`) both
 * chord endpoints share the same LOCAL y, equal to `attitudeBallGeometry`'s
 * own `d` (its `t`, unclamped): `-(pitchRad / (pi/6)) * DIAL_RADIUS * 0.8`.
 * Reading it locally, rather than through `ballScreenHeight`'s world/camera
 * projection, isolates the MAGNITUDE of the deflection from the panel's own
 * placement and the camera's -- exactly the quantity a halved, doubled or
 * saturating scale factor would change and the existing screen-space checks
 * (an ordering check and a slot-containment bound) do not pin.
 */
function ballLocalPitchOffset(panel: Panel): number {
  const sky = panel.attitude.ball.children[0] as Mesh
  const position = sky.geometry.attributes.position as BufferAttribute
  const from = new Vector3().fromBufferAttribute(position, 0)
  const to = new Vector3().fromBufferAttribute(position, position.count - 1)
  return (from.y + to.y) / 2
}

function ballScreenHeight(panel: Panel, state: AircraftState, worldToCamera: Quaternion): number {
  const eye = cameraTransformFor('cockpit', f6f, {
    position: state.position,
    attitude: state.attitude,
  })
  const [from, to] = ballChordEndpoints(panel)
  const centre = from
    .clone()
    .add(to)
    .multiplyScalar(0.5)
    .sub(new Vector3(eye.position.x, eye.position.y, eye.position.z))
    .applyQuaternion(worldToCamera)
  return centre.y / -centre.z
}

/**
 * The angle, on screen, of the attitude ball's horizon chord: 0 is level,
 * positive is right-end-up. Read off the built geometry, not off any
 * constant in panel.ts.
 *
 * Resolves the chord-endpoint-order ambiguity `ballChordEndpoints` documents
 * using a THIRD vertex -- an interior point of the sky arc, which sits
 * strictly between the two endpoints and so is unambiguously part of the
 * sky, not a candidate for either end.
 *
 * Geometrically: `attitudeBallGeometry` enumerates the sky shape's points
 * FROM `skyFrom` TO `skyTo` (increasing angle), and that walking direction
 * (`skyTo`'s point minus `skyFrom`'s point) is a NEGATIVE multiple of
 * `(cos(rollRad), sin(rollRad))` -- check it at `rollRad=0, d=0`: `(r,0) ->
 * (-r,0)`. The sky side, `dot(Q, up) > d` with `up = (-sin(rollRad),
 * cos(rollRad))`, is 90 degrees left of `(cos(rollRad), sin(rollRad))`
 * itself, which puts it on the RIGHT of the `skyFrom -> skyTo` walk, not
 * the left. The REVERSE direction -- `skyFrom`'s point minus `skyTo`'s
 * point, i.e. `p0 - pLast` when index 0 genuinely is the `skyFrom` end --
 * is the positive multiple, with sky on ITS left. That reverse direction is
 * the candidate this code tests: whichever of `p0 - pLast` or its negation
 * puts the interior sky vertex on its left is the correctly-oriented one --
 * entirely in the mesh's own LOCAL space, since a rotation (the only kind
 * of transform between here and world space) preserves left/right.
 */
function ballScreenAngle(panel: Panel, worldToCamera: Quaternion): number {
  const sky = panel.attitude.ball.children[0] as Mesh
  const position = sky.geometry.attributes.position as BufferAttribute
  const p0 = new Vector3().fromBufferAttribute(position, 0)
  const pLast = new Vector3().fromBufferAttribute(position, position.count - 1)
  const pInterior = new Vector3().fromBufferAttribute(position, Math.floor(position.count / 2))
  const mid = p0.clone().add(pLast).multiplyScalar(0.5)
  const candidate = p0.clone().sub(pLast)
  const toInterior = pInterior.clone().sub(mid)
  const cross = candidate.x * toInterior.y - candidate.y * toInterior.x
  const localDir = cross > 0 ? candidate : candidate.negate()
  const dir = localDir.transformDirection(sky.matrixWorld).applyQuaternion(worldToCamera)
  return Math.atan2(dir.y, dir.x)
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
    //
    // `p.tape.strip` is no longer excluded (review round 2, Ruling R8):
    // before culling, the rose's three uncropped copies genuinely painted
    // past the frame edge on every side (measured at deploy time: the strip
    // reached 71.67 degrees off boresight against a 40.89-degree frame
    // half-width at 3:2 -- a 30.78-degree overshoot per side, invisible to
    // both review rounds because this test excluded the strip wholesale
    // rather than measuring it). `updatePanel` now culls each mark to
    // `.visible = false` once it slides outside `TAPE_W`'s window
    // (`panel.ts`), so only marks that genuinely belong on screen are
    // included below -- the off-screen buffer copies (and the culled tail
    // of copy 0 itself) are excluded by their OWN `.visible` flag, not by a
    // wholesale identity check that could hide a real overshoot again.
    const p = createPanel(f6f, () => null)
    expect(p.backing.children).toHaveLength(0)
    updatePanel(p, f6f, createState(), NEUTRAL_CONTROLS, () => null)
    p.root.updateMatrixWorld(true)
    const box = new Box3()
    for (const child of p.root.children) {
      if (child === p.backing) continue
      if (child === p.tape.strip) {
        for (const mark of child.children) {
          if (!mark.visible) continue
          box.union(new Box3().setFromObject(mark))
        }
        continue
      }
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

  it('turns every instrument face back toward the eye, not out through the nose', () => {
    // Each face normal is read off the built
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
    // Smoke coverage for the required control vector; the throttle tests
    // below measure the column's response to that vector.
    const p = createPanel(f6f)
    expect(() => updatePanel(p, f6f, createState(), NEUTRAL_CONTROLS)).not.toThrow()
  })
})

describe('the attitude ball (2026-09-15)', () => {
  it('lays its horizon at the true horizon angle, both bank directions', () => {
    // The same failure mode the retired horizon bar's own angle test existed
    // for (Task 7, 2026-09-15, retired the bar and that test once this one
    // stood in for it): this compares the ball's projected screen angle
    // against the WORLD quantity `trueHorizonScreenAngle`, never against
    // `rollRad` itself -- a test that asserted `rotation.z === rollRad` would
    // pass just as confidently with the sign flipped, which is exactly how
    // the bar's own -30/+30 defect survived fifteen task reviews (panel.ts's
    // own comment on the attitude-ball roll sign has the full history).
    for (const bankDeg of [30, -30, 60, -60]) {
      const p = createPanel(f6f, () => null)
      const state = attitude(0, bankDeg)
      // updatePanel BEFORE pose(): `ballScreenAngle` reads the ball's
      // `matrixWorld`, which is only refreshed by `pose()`'s own
      // `cockpit.updateMatrixWorld(true)` call -- calling pose() first would
      // measure the ball's PRE-update (identity) transform instead.
      updatePanel(p, f6f, state, NEUTRAL_CONTROLS, () => null)
      const { worldToCamera } = pose(p, state)
      expect(ballScreenAngle(p, worldToCamera), `bank ${bankDeg}`)
        .toBeCloseTo(trueHorizonScreenAngle(worldToCamera), 1)
    }
  })

  it('drops its horizon as the nose comes up', () => {
    const p = createPanel(f6f, () => null)
    const heightAt = (pitchDeg: number): number => {
      const state = attitude(pitchDeg, 0)
      updatePanel(p, f6f, state, NEUTRAL_CONTROLS, () => null)
      const { worldToCamera } = pose(p, state)
      return ballScreenHeight(p, state, worldToCamera)
    }
    expect(heightAt(20)).toBeLessThan(heightAt(-20))
  })

  it('starts level, before any update has run', () => {
    // The retired horizon bar made the same claim about itself ("starts the
    // bar at eye level, before any update has run") -- `updatePanel`
    // overwrites this on the first frame, so it is easy to leave degenerate
    // and never notice, and it is still a claim: a panel that has been built
    // but not yet updated must not show a horizon at an arbitrary tilt.
    //
    // Unlike the bar, the ball is positioned at the dial ROW's own height,
    // not at eye level (it is a panel-mounted instrument, not a floating HUD
    // element) -- so the claim worth pinning here is LEVELNESS, not eye
    // height: `createPanel` builds the ball via `attitudeBallGeometry(0, 0)`,
    // whose chord endpoints sit at local y = 0 on both ends by construction.
    const p = createPanel(f6f, () => null)
    p.root.updateMatrixWorld(true)
    const [from, to] = ballChordEndpoints(p)
    expect(from.y).toBeCloseTo(to.y, 6)
  })

  it('lays its horizon against the attitude it is given, not the one in the state', () => {
    // The retired horizon bar's own parity test for this ("lays the bar
    // against the attitude it is given..."): the camera and airframe are
    // posed from the interpolated tick and the numeric gauges from the
    // simulated one. The bar took the simulated attitude too until
    // 2026-09-13, so at 80 deg/s of roll it led the visible horizon by up to
    // 1.33 degrees. `updatePanel`'s own comment on the ball explains it uses
    // `renderAttitude` for the same reason -- this is the check for that,
    // posing the CAMERA at the rolled attitude (what the pilot actually
    // sees) while `state` stays level, so a ball that read `state.attitude`
    // instead would show a level horizon against a rolled camera and fail.
    const p = createPanel(f6f, () => null)
    const level = attitude(0, 0)
    const rolled = attitude(0, 30)
    updatePanel(p, f6f, level, NEUTRAL_CONTROLS, () => null, rolled.attitude)
    const { worldToCamera } = pose(p, rolled)
    expect(deg(ballScreenAngle(p, worldToCamera)))
      .toBeCloseTo(deg(trueHorizonScreenAngle(worldToCamera)), 1)
  })

  it('holds level on a wings-level aeroplane, at any pitch and heading', () => {
    // The gap a pure-roll sweep leaves, found on the reference-class hardware
    // 2026-09-13 against the retired horizon bar: a cockpit screenshot showed
    // a dead-level true horizon, a level panel, and the bar tilted about 7
    // degrees. `banked()`/`attitude()`-style pure roll about the nose is the
    // one case under which the OLD, wrong roll formula happened to agree with
    // the true horizon too, which is why fifteen task reviews passed while
    // the instrument lied in ordinary (heading != 0) flight. Wings level at
    // any heading and pitch is the case that actually exercises
    // `attitudeAngles`' own heading-independence fix, so this is the ball's
    // own version of the bar's "holds the bar level on a wings-level
    // aeroplane" test.
    const p = createPanel(f6f)
    for (const headingDeg of [0, 30, 45, 90, 135, 180, -60]) {
      for (const pitchDeg of [0, 10, -15]) {
        const state = wingsLevel(headingDeg, pitchDeg)
        updatePanel(p, f6f, state, NEUTRAL_CONTROLS)
        const { worldToCamera } = pose(p, state)
        const ball = ballScreenAngle(p, worldToCamera)
        expect(deg(ball)).toBeCloseTo(deg(trueHorizonScreenAngle(worldToCamera)), 4)
        expect(deg(ball)).toBeCloseTo(0, 4)
      }
    }
  })

  it('scales its pitch deflection linearly below the clamp', () => {
    // Fix round 1 (2026-09-15): "puts the horizon bar ON the true horizon"
    // had no ball equivalent because the ball's pitch term isn't a literal
    // projection of the true horizon -- but that left the deflection's
    // MAGNITUDE pinned by nothing except an ordering check ("drops its
    // horizon as the nose comes up") and a containment bound, both of which
    // a halved, doubled, or saturating scale factor would still pass.
    //
    // What IS true of `attitudeBallGeometry`'s actual term,
    // `-(pitchRad / (pi/6)) * DIAL_RADIUS * 0.8`, is that it is LINEAR in
    // pitch below where the clamp engages (~37.5 degrees at zero bank, per
    // the per-slot containment suite's own pitch sweep comment) -- doubling
    // the pitch doubles the deflection, exactly, with no fitted constant
    // this test has to know.
    const p = createPanel(f6f, () => null)
    const offsetAt = (pitchDeg: number): number => {
      updatePanel(p, f6f, attitude(pitchDeg, 0), NEUTRAL_CONTROLS, () => null)
      return ballLocalPitchOffset(p)
    }
    expect(offsetAt(20)).toBeCloseTo(2 * offsetAt(10), 6)
  })

  it('deflects by exactly 0.8 of DIAL_RADIUS at 30 degrees nose-up', () => {
    // The linearity check above passes for ANY scale factor -- half, double,
    // or the real 0.8 -- since it only pins the SHAPE of the response, not
    // its size. This pins the size itself, at a pitch (30 degrees) still
    // safely below the ~37.5-degree clamp, so a halved or doubled
    // `attitudeBallGeometry` scale constant fails here even though it would
    // pass every other test in this file.
    const p = createPanel(f6f, () => null)
    updatePanel(p, f6f, attitude(30, 0), NEUTRAL_CONTROLS, () => null)
    // Negative: nose-up pitch deflects the chord toward -y in this local
    // frame, the same direction "drops its horizon as the nose comes up"
    // (above) checks the ordering of.
    expect(ballLocalPitchOffset(p)).toBeCloseTo(-0.8 * DIAL_RADIUS, 6)
  })
})

describe('per-slot containment (Task 6 fix round 1, 2026-09-15)', () => {
  // The whole-panel frustum test above ("fits inside the field of view...")
  // unions EVERY instrument into one combined envelope, dominated by the
  // throttle/armament edge blocks -- an instrument overflowing into its own
  // immediate NEIGHBOUR is completely invisible to it. That is exactly how
  // the attitude ball's first cut (an oversized disc moved by a rigid
  // `rotation.z`/`position.y` transform, per the original task-6 brief) drew
  // 56 mm into the fuel dial's own face at a 45-degree bank without failing
  // any existing test -- caught only by measuring it directly and reporting
  // the finding rather than either inventing a fix or excluding it from an
  // assertion.
  //
  // This checks each `PANEL_SLOTS` entry that has geometry against its OWN
  // declared budget, BOTH horizontally (`centreX +/- widthM/2` -- the
  // dimension the ball's actual defect was in) and vertically
  // (`PANEL_BANDS.lower`), for every lower-band instrument: the five dials, the
  // throttle column, and the attitude ball. `radar` and `armament` are
  // excluded -- reserved slots with nothing drawn into them yet
  // (`createPanel`'s own comment: "nothing is added to `root` for them").
  //
  // Fix round 1 (2026-09-15) shipped this with the dial check horizontal-only:
  // measuring vertical containment for the five dials found every one of
  // their readout+label pairs already ran past `PANEL_BANDS.lower`'s own
  // top/bottom, which traced to `LOWER_H` in panelLayout.ts understating what
  // a dial plus its readout and label actually occupy (a Task 2 bookkeeping
  // error, not anything this plan touched). Ruling R11 (fix round 2) called
  // that carve-out out directly: a horizontal-only assertion made to
  // accommodate a wrong constant is the same shape as the test exclusions
  // that hid two Criticals in the previous task -- fix the constant, not the
  // assertion. `LOWER_H` was widened (see its own doc comment in
  // panelLayout.ts for the exact derivation) and every dial now gets the
  // same full containment check as the ball and the column.

  const EPS = 1e-6

  /**
   * Builds a panel with the root's own eye-relative transform zeroed out, so
   * a `Box3` measured from it lands directly in the same LOCAL frame
   * `PANEL_SLOTS`/`PANEL_BANDS` are defined in: `centreX` is local x, and a
   * band's local y is `PANEL_BELOW_M - band` (panelLayout.ts's own doc
   * comment on `PANEL_BANDS`).
   */
  function localPanel(): Panel {
    const p = createPanel(f6f, () => null)
    p.root.position.set(0, 0, 0)
    p.root.rotation.set(0, 0, 0)
    return p
  }

  const yTop = PANEL_BELOW_M - PANEL_BANDS.lower.top
  const yBottom = PANEL_BELOW_M - PANEL_BANDS.lower.bottom

  function expectHorizontallyWithinSlot(slotId: string, box: Box3, label: string): void {
    const slot = PANEL_SLOTS.find((s) => s.id === slotId)!
    expect(box.min.x, `${label}: left edge inside ${slotId}'s slot width`)
      .toBeGreaterThanOrEqual(slot.centreX - slot.widthM / 2 - EPS)
    expect(box.max.x, `${label}: right edge inside ${slotId}'s slot width`)
      .toBeLessThanOrEqual(slot.centreX + slot.widthM / 2 + EPS)
  }

  function expectWithinLowerBand(box: Box3, label: string): void {
    expect(box.max.y, `${label}: top edge inside PANEL_BANDS.lower`)
      .toBeLessThanOrEqual(yTop + EPS)
    expect(box.min.y, `${label}: bottom edge inside PANEL_BANDS.lower`)
      .toBeGreaterThanOrEqual(yBottom - EPS)
  }

  it('keeps every dial inside its own slot, horizontally and vertically', () => {
    const p = localPanel()
    updatePanel(p, f6f, createState(), NEUTRAL_CONTROLS, () => null)
    p.root.updateMatrixWorld(true)
    for (const dial of dialsOf(p)) {
      const id = dial.name.slice('dial:'.length)
      const box = new Box3().setFromObject(dial)
      expectHorizontallyWithinSlot(id, box, id)
      expectWithinLowerBand(box, id)
    }
  })

  it('keeps the throttle column inside its own slot, horizontally and vertically, at every setting', () => {
    for (const throttle of [0, 0.5, 1]) {
      const p = localPanel()
      updatePanel(p, f6f, createState(), { ...NEUTRAL_CONTROLS, throttle }, () => null)
      p.root.updateMatrixWorld(true)
      const column = p.root.children.find((c) => c.name === 'column:throttle')!
      const box = new Box3().setFromObject(column)
      expectHorizontallyWithinSlot('throttle', box, `throttle=${throttle}`)
      expectWithinLowerBand(box, `throttle=${throttle}`)
    }
  })

  it('keeps the attitude ball inside its own slot, horizontally and vertically, at every attitude the model can reach', () => {
    // Pitch sweep includes +/-60 and +/-90 (review finding, fix round 3):
    // `attitudeBallGeometry`'s clamp on `d` only engages once
    // `|pitch| >= 37.5 deg` (at zero bank; farther out at a bank away from
    // zero, since `d` scales by `cos(rollRad)`), so a sweep that stopped at
    // +/-30 never exercised the saturated/degenerate-segment path at all.
    for (const bankDeg of [0, 45, -45, 90, -90]) {
      for (const pitchDeg of [0, 30, -30, 60, -60, 90, -90]) {
        const p = localPanel()
        updatePanel(p, f6f, attitude(pitchDeg, bankDeg), NEUTRAL_CONTROLS, () => null)
        p.root.updateMatrixWorld(true)
        const label = `pitch=${pitchDeg} bank=${bankDeg}`

        const box = new Box3()
        box.union(new Box3().setFromObject(p.attitude.ball))
        box.union(new Box3().setFromObject(p.attitude.ring))
        expectHorizontallyWithinSlot('attitude', box, label)
        expectWithinLowerBand(box, label)

        // The ring ALONE already saturates the slot's declared box exactly
        // (`DIAL_RADIUS * 1.09 * 2 === widthM`), so the union above cannot
        // see the ball's own disc grow past its face -- review finding, fix
        // round 3. Checked separately: the ball's own `Box3`, centred on
        // wherever `updatePanel` actually placed it (read off its own
        // `matrixWorld`, not assumed from `PANEL_SLOTS`), must stay within
        // `DIAL_RADIUS` on every side.
        const centre = new Vector3().setFromMatrixPosition(p.attitude.ball.matrixWorld)
        const ballBox = new Box3().setFromObject(p.attitude.ball)
        expect(ballBox.min.x, `${label}: ball left edge within DIAL_RADIUS`)
          .toBeGreaterThanOrEqual(centre.x - DIAL_RADIUS - EPS)
        expect(ballBox.max.x, `${label}: ball right edge within DIAL_RADIUS`)
          .toBeLessThanOrEqual(centre.x + DIAL_RADIUS + EPS)
        expect(ballBox.min.y, `${label}: ball bottom edge within DIAL_RADIUS`)
          .toBeGreaterThanOrEqual(centre.y - DIAL_RADIUS - EPS)
        expect(ballBox.max.y, `${label}: ball top edge within DIAL_RADIUS`)
          .toBeLessThanOrEqual(centre.y + DIAL_RADIUS + EPS)
      }
    }
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
    // Throttle and heading have their own column/tape markings.
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
  it('covers both viewport edges after resizing between supported aspect ratios', () => {
    const p = createPanel(f6f, () => null)
    p.root.position.set(0, 0, 0)
    p.root.rotation.set(0, 0, 0)
    for (const aspect of [1.5, 1.6, 16 / 9, 21 / 9, 1.5]) {
      resizePanel(p, aspect)
      p.root.updateMatrixWorld(true)
      const box = new Box3().setFromObject(p.backing)
      const halfWidth = (PANEL_AHEAD_M - box.min.z)
        * Math.tan(CAMERA_VFOV_DEG * Math.PI / 360) * aspect
      expect(box.min.x / halfWidth, `left edge at ${aspect}`).toBeLessThan(-1)
      expect(box.max.x / halfWidth, `right edge at ${aspect}`).toBeGreaterThan(1)
    }
  })

  it('runs the bezel past the bottom of the frame, so it is clipped not floating', () => {
    // The complaint this fixes: sky was visible below the panel on both sides,
    // so it read as a strip hanging in the view rather than a dashboard.
    const p = createPanel(f6f, () => null)
    const box = new Box3().setFromObject(p.backing)
    const lowestBelowEye = PANEL_BELOW_M - box.min.y
    expect(degreesBelowEye(lowestBelowEye)).toBeGreaterThan(CAMERA_VFOV_DEG / 2)

    // The coaming must actually cover the row it backs, not just clip past
    // the bottom of the frame -- a deleted horizon-bar test (Task 7,
    // 2026-09-15) checked this as a side effect of its own bar-specific
    // z-ordering assertion; restored here on its own terms, since the
    // property itself was never about the bar. This file's own WORLD Z axis
    // is the panel's horizontal spread (the panel root is turned -90 degrees
    // about Y, sending local x to world z), so comparing `backing`'s own box
    // against every other instrument's on that axis is "wide enough to back
    // the row it's behind". Hidden tape buffer copies are excluded; visible
    // marks are included, just as in the frustum guard.
    updatePanel(p, f6f, createState(), NEUTRAL_CONTROLS, () => null)
    p.root.updateMatrixWorld(true)
    const rowBox = new Box3()
    for (const child of p.root.children) {
      if (child === p.backing) continue
      if (child === p.tape.strip) {
        for (const mark of child.children) {
          if (mark.visible) rowBox.union(new Box3().setFromObject(mark))
        }
      } else rowBox.union(new Box3().setFromObject(child))
    }
    const backingBox = new Box3().setFromObject(p.backing)
    expect(backingBox.min.z).toBeLessThanOrEqual(rowBox.min.z)
    expect(backingBox.max.z).toBeGreaterThanOrEqual(rowBox.max.z)
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
    // airframe, not to the world like the attitude ball's own horizon chord.
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

describe('the throttle column (Task 4, 2026-09-15)', () => {
  it('fills the throttle column in proportion to the control vector', () => {
    const p = createPanel(f6f, () => null)
    const level = createState({ position: v3(0, 1000, 0), velocity: v3(120, 0, 0) })
    const heightAt = (throttle: number): number => {
      updatePanel(p, f6f, level, { pitch: 0, roll: 0, yaw: 0, throttle }, () => null)
      return new Box3().setFromObject(p.columns.get('throttle')!.fill).getSize(new Vector3()).y
    }
    const [shut, half, open] = [heightAt(0), heightAt(0.5), heightAt(1)]
    expect(shut).toBeLessThan(half)
    expect(half).toBeLessThan(open)
    // Linear: half throttle is half the travel, within a millimetre.
    expect(half).toBeCloseTo((shut + open) / 2, 3)
  })

  it('grows the throttle fill upward from its base, not from its centre', () => {
    // A plane scaled about its centre creeps downward as it grows, so the bar
    // would leave its own bezel at full throttle.
    const p = createPanel(f6f, () => null)
    const level = createState({ position: v3(0, 1000, 0), velocity: v3(120, 0, 0) })
    const baseOf = (t: number): number => {
      updatePanel(p, f6f, level, { pitch: 0, roll: 0, yaw: 0, throttle: t }, () => null)
      return new Box3().setFromObject(p.columns.get('throttle')!.fill).min.y
    }
    expect(baseOf(1)).toBeCloseTo(baseOf(0.1), 4)
  })
})

describe('the heading tape (Task 5, 2026-09-15)', () => {
  const headingGauge = () => GAUGES.find((g) => g.id === 'heading') as TapeSpec
  const stripWidth = () => TAPE_W * (360 / headingGauge().windowSpan)

  it('slides the strip left as the heading increases', () => {
    // `wingsLevel(headingDeg, pitchDeg)` already exists in this file.
    const p = createPanel(f6f, () => null)
    const at = (headingDeg: number): number => {
      updatePanel(p, f6f, wingsLevel(headingDeg, 0), NEUTRAL_CONTROLS, () => null)
      return p.tape.strip.position.x
    }
    expect(at(90)).toBeLessThan(at(0))
  })

  it('puts the mark for the CURRENT heading under the index, not its antipode (R9, round 3)', () => {
    // Round 2 flagged, unfixed: the brief's own build formula, `x =
    // (mark.fraction + copy) * stripW - stripW / 2`, centres the THREE-COPY
    // BLOCK on the origin (cosmetic), which the slide formula --
    // `strip.position.x = -tapeOffsetFor(...) * stripW`, which assumes
    // fraction f sits at `f * stripW` with no such term -- does not account
    // for. The two disagree by exactly `stripW / 2`, i.e. half a rose, i.e.
    // 180 degrees: at heading 0 the old code centred value 180 under the
    // index, not 0. The "slides the strip left..." test above cannot catch
    // this: a rose displaced by ANY constant still slides left as heading
    // increases.
    //
    // Recovers the value from the NEAREST-TO-INDEX mark's own stashed
    // `userData.value` rather than hardcoding an expected x position, so
    // this pins the actual built geometry, not a restated formula.
    //
    // Compares against `gaugeValue`'s own compass heading, NOT the
    // `headingDeg` argument passed to `wingsLevel` directly: that argument
    // is a yaw angle fed to `qFromAxisAngle`, and gauges.ts's heading
    // convention is the opposite sign (a positive yaw there is a LEFT turn,
    // decreasing compass heading) -- the same trap round 1's "slides by
    // exactly the fraction..." test hit and fixed the same way.
    const p = createPanel(f6f, () => null)
    const minorStep = headingGauge().minorStep
    for (const headingDeg of [0, 45, 90, 180, 270, 359]) {
      const state = wingsLevel(headingDeg, 0)
      updatePanel(p, f6f, state, NEUTRAL_CONTROLS, () => null)
      const compassHeading = gaugeValue('heading', f6f, state, NEUTRAL_CONTROLS)
      const stripX = p.tape.strip.position.x
      let nearestValue = NaN
      let nearestDist = Infinity
      for (const mark of p.tape.strip.children) {
        const dist = Math.abs(stripX + mark.position.x)
        if (dist < nearestDist) {
          nearestDist = dist
          nearestValue = mark.userData.value as number
        }
      }
      // Circular difference, so 359 vs 0 reads as 1 degree apart, not 359.
      const circularDiff = Math.abs((((nearestValue - compassHeading + 180) % 360) + 360) % 360 - 180)
      expect(circularDiff).toBeLessThanOrEqual(minorStep / 2 + 1e-6)
    }
  })

  it('slides by exactly the fraction tapeOffsetFor reports, scaled by the strip width', () => {
    // Ties the rendered geometry back to the pure helper `gauges.test.ts`
    // pins directly, so a placement bug in `panel.ts` (a sign flip, a wrong
    // scale) cannot hide behind a helper that is separately correct.
    //
    // Reads the actual COMPASS heading back out of `gaugeValue` rather than
    // assuming it equals `wingsLevel`'s own `headingDeg` argument: that
    // argument is a yaw angle fed into `qFromAxisAngle`, and gauges.ts's
    // heading convention is the opposite sign (a positive yaw there is a
    // LEFT turn, decreasing compass heading) -- exactly the trap
    // `gaugeValue`'s own "reports heading... and increases it turning right"
    // test exists to pin. Composing the two independently-correct pieces the
    // same way `updatePanel` does is the point of this test, not
    // re-deriving the sign convention here.
    const p = createPanel(f6f, () => null)
    const g = headingGauge()
    for (const headingDeg of [0, 45, 90, 200, 359]) {
      const state = wingsLevel(headingDeg, 0)
      updatePanel(p, f6f, state, NEUTRAL_CONTROLS, () => null)
      const compassHeading = gaugeValue('heading', f6f, state, NEUTRAL_CONTROLS)
      expect(p.tape.strip.position.x).toBeCloseTo(-tapeOffsetFor(g, compassHeading) * stripWidth(), 9)
    }
  })

  it('draws the rose three copies wide, so sliding always leaves a neighbour on both sides', () => {
    // THE subtlety this tape exists to get right: without a copy on each
    // side of the middle one, sliding across the seam (359 -> 001) would
    // either expose bare space at the edge of the visible window or -- if
    // the strip held only a single un-repeated copy -- have to leap the
    // entire width of the rose once per revolution. Proved by mutation: with
    // the copy loop narrowed to `[0]`, this test's min/max bounds collapse to
    // a single copy's own span and it fails (see the task report for the
    // recorded run).
    //
    // Expected bounds are derived from `tickMarksFor`'s own fractions and
    // the build formula `x = (fraction + copy) * stripWidth()` (no `-
    // stripWidth() / 2` term since review round 3's Ruling R9 -- that term
    // centred the three-copy block cosmetically but disagreed with the
    // slide formula by half a rose, a 180-degree placement bug). Review
    // round 1, Finding 1 also fixed `tickMarksFor` to drop the seam-doubling
    // mark at `fraction === 1` for a tape (the same dedup a circular dial
    // already gets), so the rendered range is asymmetric within each copy --
    // `fraction` 0 is kept (copy -1's copy of it is the leftmost mark) but
    // `fraction` 1 is gone (so copy +1's rightmost mark is its own last
    // MINOR step short of a full turn, not the seam duplicate).
    const p = createPanel(f6f, () => null)
    const fractions = tickMarksFor(headingGauge()).map((m) => m.fraction)
    const expectedMin = (Math.min(...fractions) - 1) * stripWidth()
    const expectedMax = (Math.max(...fractions) + 1) * stripWidth()
    const xs = p.tape.strip.children
      .filter((c): c is Mesh => c instanceof Mesh)
      .map((c) => c.position.x)
    expect(xs.length).toBeGreaterThan(0)
    expect(Math.min(...xs)).toBeCloseTo(expectedMin, 6)
    expect(Math.max(...xs)).toBeCloseTo(expectedMax, 6)
  })

  it('never lays two marks at the same seam position across copies', () => {
    // Review round 1, Finding 1 (Important): before the `tickMarksFor` fix,
    // copy 0's fraction-1 mark (value 360) and copy 1's fraction-0 mark
    // (value 0) landed at the EXACT same (x, y) -- a doubled tick and two
    // identical "000" numeral plates z-fighting at every seam.
    const p = createPanel(f6f, () => null)
    const positions = p.tape.strip.children.map(
      (c) => `${c.position.x.toFixed(6)},${c.position.y.toFixed(6)}`,
    )
    expect(new Set(positions).size).toBe(positions.length)
  })

  it('culls marks outside the visible window, so the rose does not paint past the panel (R8, round 2)', () => {
    // Critical, found at deploy time: nothing clips or masks the strip, so
    // all three copies -- ticks and numerals -- painted across the sky and
    // sea for the whole width of the view and past it (measured: the strip
    // reaches 71.67 degrees off boresight against a 40.89-degree frame
    // half-width at 3:2, a 30.78-degree overshoot per side). Ruling R8:
    // cull per frame, in `updatePanel`, rather than adding renderer-level
    // clipping -- the geometry keeps existing (so the three-copy wrap stays
    // seamless), only `.visible` toggles.
    const p = createPanel(f6f, () => null)
    for (const headingDeg of [0, 45, 180, 359]) {
      updatePanel(p, f6f, wingsLevel(headingDeg, 0), NEUTRAL_CONTROLS, () => null)
      for (const mark of p.tape.strip.children) {
        if (!mark.visible) continue
        const worldX = p.tape.strip.position.x + mark.position.x
        expect(Math.abs(worldX)).toBeLessThanOrEqual(TAPE_W / 2 + TAPE_CULL_MARGIN_M + 1e-9)
      }
      // Not vacuous: at least one mark must actually be visible, or the
      // culling could be hiding everything and passing by omission.
      expect(p.tape.strip.children.some((m) => m.visible)).toBe(true)
    }
  })

  it('keeps the fixed readout out of the sliding strip', () => {
    // If the readout were a child of `strip` it would slide out from under
    // the fixed index along with the rose -- it has to be parented to
    // something that does not move.
    const p = createPanel(f6f, () => null)
    expect(p.tape.readout.parent).not.toBe(p.tape.strip)
  })

  it('prints the zero-padded, wrapped heading digits on the fixed readout', () => {
    const drawn: string[] = []
    const factory: TextTextureFactory = (text: string): null => {
      drawn.push(text)
      return null
    }
    const p = createPanel(f6f, factory)
    // Due north (F3): the readout must show "000", zero-padded, not a bare
    // "0".
    updatePanel(p, f6f, wingsLevel(0, 0), NEUTRAL_CONTROLS, factory)
    expect(drawn).toContain('000')
    updatePanel(p, f6f, wingsLevel(90, 0), NEUTRAL_CONTROLS, factory)
    expect(drawn).toContain('090')
  })

  it('keeps the whole tape assembly inside the upper band, not spilling into the lower row', () => {
    // Controller context point 4: the tape is positioned from
    // `PANEL_BANDS.upper`, not a layout slot (there is none for `heading`,
    // deliberately -- context point 3 / F4). This checks the built geometry
    // against that band directly, so a wrong offset fails here rather than
    // only being visible in a screenshot.
    //
    // The strip's own left/right copies run far outside the frustum by
    // design (the three-copy test above), so only its own LOCAL y (shared by
    // every tick, uniform regardless of x) is meaningful here -- checked
    // together with the fixed readout, which does vary in y.
    const p = createPanel(f6f, () => null)
    const upperTopY = PANEL_BELOW_M - PANEL_BANDS.upper.top
    const upperBottomY = PANEL_BELOW_M - PANEL_BANDS.upper.bottom
    const stripTickYs = p.tape.strip.children
      .filter((c): c is Mesh => c instanceof Mesh)
      .map((c) => c.position.y + p.tape.strip.position.y)
    const readoutBox = new Box3().setFromObject(p.tape.readout)
    for (const y of stripTickYs) {
      expect(y).toBeLessThanOrEqual(upperTopY)
      expect(y).toBeGreaterThanOrEqual(upperBottomY)
    }
    expect(readoutBox.max.y).toBeLessThanOrEqual(upperTopY + 1e-6)
    expect(readoutBox.min.y).toBeGreaterThanOrEqual(upperBottomY - 1e-6)
  })
})
