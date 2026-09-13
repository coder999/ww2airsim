import {
  BoxGeometry,
  CircleGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RingGeometry,
  type Object3D,
  type Texture,
} from 'three'
import {
  GAUGES,
  needleAngleFor,
  attitudeAngles,
  tickMarksFor,
  labelTextFor,
  readoutTextFor,
  type GaugeId,
} from '../gauges.js'
import { makeTextTexture, type TextTextureFactory } from './text.js'
import type { AircraftState } from '../../sim/flight/state.js'
import type { AircraftSpec } from '../../sim/flight/schema.js'

export type Panel = {
  readonly root: Object3D
  readonly needles: Map<GaugeId, Object3D>
  /** The digital readout plate inside each dial, and the string it currently
   *  shows -- kept so `updatePanel` can skip re-rasterising an unchanged one. */
  readonly readouts: Map<GaugeId, Readout>
  readonly horizon: Object3D
}

export type Readout = {
  readonly mesh: Mesh
  text: string
}

/**
 * Deliberately oversized and high-contrast rather than period-accurate.
 *
 * Authenticity of APPEARANCE is traded away on purpose: faithful 1944 markings
 * that cannot be read at a realistic eye point would be accurate and useless,
 * and this plan exists to let a human judge how the aeroplane flies. What is
 * NOT traded away is the data -- every needle here is backed by a quantity the
 * flight model produces, which is why there is no tachometer (see gauges.ts's
 * doc comment on GaugeId).
 */
const DIAL_RADIUS = 0.06
/**
 * Dial spacing. Narrowed from 0.20 on 2026-09-13: at 0.20 the panel spanned
 * +/-0.593 m at 0.6 m ahead, subtending 45.0 degrees off boresight, so the
 * outer two dials left the frustum below an aspect ratio of 1.73 -- including
 * on a 3:2 Surface, the only machine that has ever displayed this panel.
 * That is I-7's defect on the other axis, and the horizontal assertion that
 * looked like it covered it compared against the VERTICAL half-angle times a
 * bare 4, giving 2.3x slack, so it could not have caught either.
 */
const DIAL_GAP = 0.155
/**
 * Narrowest window the panel is designed to fit, width over height.
 *
 * 3:2 covers the Surface this has actually been flown on, and with it every
 * 16:10, 16:9 and ultrawide shape. A 4:3 or square window still clips the
 * outer dials; that is a stated limit rather than an accident, and
 * `panel.test.ts` pins the built geometry against this number.
 */
export const PANEL_MIN_ASPECT = 1.5
// Depth ordering within a dial. All small and all positive, so everything
// stays in front of the face without needing render-order fiddling.
const Z_MARKS = 0.0015
const Z_READOUT = 0.0025
const Z_NEEDLE = 0.005

/** Panel centre relative to the pilot's eye, body frame (+X forward, +Y up). */
const PANEL_AHEAD_M = 0.6
/**
 * How far below the eye the dial row is centred.
 *
 * Was 0.35 until 2026-09-13, which put the label edge 38.4 degrees below the
 * eye line against the 30-degree screen edge of `CAMERA_VFOV_DEG`. The lower
 * half of every dial, every label and every digital readout were outside the
 * frustum; only the top slivers of six discs were ever visible, which is why
 * flying it produced "would also label the instruments with text" about a
 * panel that had been labelled since the commit before.
 *
 * `panel.test.ts` now measures the built geometry against the camera's own
 * exported field of view, so a bigger dial or a narrower lens fails there
 * rather than in a screenshot. Design spec section 7 already settled the
 * principle: legibility beats period authenticity, and markings that cannot
 * be read at a realistic eye point are faithful and useless.
 */
const PANEL_BELOW_M = 0.19

/** Beyond this the horizon is well off screen and `tan` runs away. */
const MAX_HORIZON_PITCH = (75 * Math.PI) / 180
/**
 * The horizon bar's depth within the panel, and its distance from the eye.
 *
 * The panel root is turned -90 degrees about Y, which sends local +Z to body
 * -X: a bar nudged forward off the panel face in local +Z is 2 mm CLOSER to
 * the pilot, not further. Small, but the bar's placement divides by this
 * distance, and using 0.6 instead of 0.598 left a 0.33% error that the
 * screen-position test caught.
 */
const HORIZON_Z = -0.003
const HORIZON_DISTANCE_M = PANEL_AHEAD_M - HORIZON_Z
/** The coaming: an opaque plate the horizon bar passes behind. */
const BACKING_Z = -0.001
const BACKING_TOP = 0.108
const BACKING_BOTTOM = -0.115

/**
 * A flat plate carrying rasterised text.
 *
 * Text is a texture rather than geometry because three's `TextGeometry` needs
 * a font asset this project does not ship, and a stroke-font built out of
 * boxes would be a lot of code to render six words. The rasteriser is injected
 * (see `text.ts`) so the panel can still be BUILT on a machine with no canvas,
 * which is every machine this project is developed on -- the tests assert the
 * layout and the exact strings; only the pixels need a browser.
 */
function textPlate(
  text: string,
  widthM: number,
  heightM: number,
  makeText: TextTextureFactory,
): Mesh {
  const mesh = new Mesh(
    new PlaneGeometry(widthM, heightM),
    new MeshBasicMaterial({ map: makeText(text, widthM / heightM), transparent: true }),
  )
  return mesh
}

function setPlateText(mesh: Mesh, text: string, makeText: TextTextureFactory): void {
  const material = mesh.material as MeshBasicMaterial
  const previous: Texture | null = material.map
  const { width, height } = (mesh.geometry as PlaneGeometry).parameters
  material.map = makeText(text, width / height)
  material.needsUpdate = true
  // The old canvas texture is replaced every time the displayed value changes,
  // which for the altimeter is several times a second. Not disposing it leaks
  // one GPU texture per change for the life of the tab.
  previous?.dispose()
}

export function createPanel(spec: AircraftSpec, makeText: TextTextureFactory = makeTextTexture): Panel {
  const root = new Group()
  const needles = new Map<GaugeId, Object3D>()
  const readouts = new Map<GaugeId, Readout>()

  const faceMat = new MeshBasicMaterial({ color: 0x101418 })
  const needleMat = new MeshBasicMaterial({ color: 0xffd24a })
  const bezelMat = new MeshBasicMaterial({ color: 0x2b3238 })
  const markMajorMat = new MeshBasicMaterial({ color: 0xf2f6f8 })
  const markMinorMat = new MeshBasicMaterial({ color: 0x8fa0ab })

  GAUGES.forEach((g, i) => {
    const dial = new Group()
    const x = (i - (GAUGES.length - 1) / 2) * DIAL_GAP

    const face = new Mesh(new CircleGeometry(DIAL_RADIUS, 32), faceMat)
    dial.add(face)

    // A bezel, so a dial reads as an instrument rather than a hole.
    const bezel = new Mesh(new RingGeometry(DIAL_RADIUS, DIAL_RADIUS * 1.09, 32), bezelMat)
    bezel.position.z = Z_MARKS
    dial.add(bezel)

    // Scale marks. Without these the dial had no zero, which made
    // needleAngleFor's documented "clockwise from the dial's zero" a
    // reference to something that did not exist (whole-branch review, I-2).
    for (const mark of tickMarksFor(g)) {
      const len = DIAL_RADIUS * (mark.major ? 0.16 : 0.09)
      const tick = new Mesh(
        new BoxGeometry(mark.major ? 0.005 : 0.0025, len, 0.002),
        mark.major ? markMajorMat : markMinorMat,
      )
      // Marks sit just inside the rim, and the whole tick is rotated about
      // the dial centre by the SAME angle the needle uses for that value --
      // `tickMarksFor` and `needleAngleFor` both call `angleForValue`, so a
      // needle cannot point between its own marks.
      const r = DIAL_RADIUS - len / 2 - 0.004
      const a = mark.angleRad
      tick.position.set(r * Math.sin(a), r * Math.cos(a), Z_MARKS)
      tick.rotation.z = -a
      dial.add(tick)

      if (mark.major && mark.text) {
        const numeral = textPlate(mark.text, DIAL_RADIUS * 0.36, DIAL_RADIUS * 0.17, makeText)
        // Inside the ticks, not on them. At 0.6 the numeral's own half-width
        // reached the major tick at the scale ends -- "10000" sat across the
        // 9 o'clock mark on the altimeter, which the reference platform showed
        // plainly and no test measured (2026-09-13).
        //
        // The radius is squeezed between two constraints that were solved
        // together rather than by trial: the plate must clear the ticks
        // (nr + halfWidth <= tick inner edge) and adjacent plates must clear
        // each other (nr * angleStep >= plate width). The slip dial binds the
        // second one at 45 degrees between majors, and at the original plate
        // size the two constraints had no overlapping solution -- hence the
        // shorter major ticks and the narrower plate above.
        const nr = DIAL_RADIUS * 0.53
        numeral.position.set(nr * Math.sin(a), nr * Math.cos(a), Z_MARKS)
        dial.add(numeral)
      }
    }

    const needle = new Mesh(new BoxGeometry(0.006, DIAL_RADIUS * 1.1, 0.004), needleMat)
    // Offset so the mesh pivots about the dial centre rather than its own end.
    needle.geometry.translate(0, DIAL_RADIUS * 0.45, 0)
    needle.position.z = Z_NEEDLE
    dial.add(needle)
    needles.set(g.id, needle)

    // The name and unit, which GAUGES has carried since Task 10 with nothing
    // rendering them -- zero non-definition hits across src, tests and tools
    // before this (whole-branch review, I-2).
    const label = textPlate(labelTextFor(g), DIAL_GAP * 0.86, 0.024, makeText)
    label.position.set(0, -0.088, Z_MARKS)
    dial.add(label)

    // Digital readout, ABOVE the dial rather than inside it. Inside, it
    // collided with the scale numerals along the bottom of the face -- the
    // altimeter's "605" was drawn across its own 8000 and 6000 marks. A
    // three-quarter sweep covers the bottom of the dial, so there is no clear
    // window down there to put it in. Per design spec section 7's "digital
    // readouts alongside needles where that helps". It helps most for altitude and heading, where
    // reading a needle to better than a few hundred metres or a few degrees is
    // exactly what the oversized-dial trade gave up.
    const readoutMesh = textPlate('', DIAL_RADIUS * 1.15, 0.022, makeText)
    readoutMesh.position.set(0, 0.088, Z_READOUT)
    dial.add(readoutMesh)
    readouts.set(g.id, { mesh: readoutMesh, text: '' })

    dial.position.set(x, 0, 0)
    root.add(dial)
  })

  // The bar now sits BEHIND an opaque coaming rather than in front of the
  // dials. I-7 replaced its clamped offset with exact geometry, which is
  // right, but exact geometry means it keeps travelling: from 8 degrees
  // nose-up it reached the dial faces and by 17.5 it crossed the centres of
  // the two inner dials, drawn over their scale marks and under their
  // needles -- a layering nobody chose. Letting the panel occlude it is what
  // a real coaming does, and it needs no clamp to do it.
  const backing = new Mesh(
    new PlaneGeometry(
      // Exactly the dial row's own span, bezels included, so it cannot leave
      // a sliver of bar showing past the outermost dial.
      (DIAL_GAP * (GAUGES.length - 1) + DIAL_RADIUS * 2.18) * 1.01,
      BACKING_TOP - BACKING_BOTTOM,
    ),
    new MeshBasicMaterial({ color: 0x0b0e11 }),
  )
  backing.position.set(0, (BACKING_TOP + BACKING_BOTTOM) / 2, BACKING_Z)
  root.add(backing)

  const horizon = new Mesh(
    new BoxGeometry(DIAL_RADIUS * 1.6, 0.01, 0.004),
    new MeshBasicMaterial({ color: 0x6fd3ff }),
  )
  horizon.position.set(0, PANEL_BELOW_M, HORIZON_Z)
  root.add(horizon)

  // Positioned in the SAME body frame the cockpit group is posed in (sim
  // convention, +X forward, +Y up, +Z right -- see src/render/frame.ts's
  // `render` field doc: an Object3D, unlike a Three camera, has no hardcoded
  // "forward", so this needs no basis fix, only the eye-relative offset
  // below). Ahead of and below the EYE, not the airframe origin -- an
  // earlier draft used a fixed airframe-relative offset that put the panel
  // 0.65 m behind the F6F eye point, which a loose test tolerance missed.
  //
  // The dial faces are built in the CircleGeometry default plane, normal
  // +Z. The panel sits ahead of the eye in +X, so the pilot (at smaller X)
  // needs the faces turned to look back down -X: rotating -pi/2 about Y
  // sends +Z to -X -- verified numerically 2026-09-13 with three.js's own
  // Quaternion.applyQuaternion: (0,0,1) -> (-1,0,~0), (1,0,0) -> (~0,0,1).
  const [ex, ey, ez] = spec.view.eyePointM
  root.position.set(ex + PANEL_AHEAD_M, ey - PANEL_BELOW_M, ez)
  root.rotation.y = -Math.PI / 2
  return { root, needles, readouts, horizon }
}

export function updatePanel(
  panel: Panel,
  spec: AircraftSpec,
  state: AircraftState,
  makeText: TextTextureFactory = makeTextTexture,
  /**
   * The attitude to lay the horizon bar against, when it differs from the
   * simulated one.
   *
   * The camera and the airframe are posed from the INTERPOLATED tick, the
   * numeric gauges from the simulated one. Until 2026-09-13 the bar took the
   * simulated attitude too, so at 80 deg/s of roll it led the visible horizon
   * by up to a third of a tick -- 1.33 degrees of sawtooth against the one
   * thing it exists to agree with, worst on a display faster than the 60 Hz
   * sim. The numbers on the dials are unaffected: nothing on screen contradicts
   * them, so reading them a fraction of a tick early is invisible.
   */
  renderAttitude: AircraftState['attitude'] = state.attitude,
): void {
  for (const g of GAUGES) {
    const readout = panel.readouts.get(g.id)
    if (readout) {
      const text = readoutTextFor(g.id, spec, state)
      // Re-rasterise only on a real change. Measured over 600 ticks of the
      // real flight model: about 0.07 redraws per frame in gentle flight but
      // 1.44 per frame under active manoeuvring, driven mostly by the climb
      // gauge's single decimal place. So this saves roughly three quarters of
      // the work rather than almost all of it -- "a few times a second", which
      // this comment used to claim, was wrong by more than an order of
      // magnitude under exactly the conditions the panel is read in.
      if (text !== readout.text) {
        setPlateText(readout.mesh, text, makeText)
        readout.text = text
      }
    }
    const needle = panel.needles.get(g.id)
    if (!needle) continue
    const angle = needleAngleFor(g.id, spec, state)
    // Negative: needle angles are clockwise from the dial's zero (gauges.ts),
    // and a positive rotation about +Z in this frame is anticlockwise.
    needle.rotation.z = -angle
  }
  const { rollRad, pitchRad } = attitudeAngles({ ...state, attitude: renderAttitude })
  // A real artificial horizon stays level with the WORLD, so the bar must sit
  // at the angle the true horizon appears at in the pilot's view -- which is
  // NOT the same as "rotate the bar opposite the aircraft's roll number".
  //
  // This frame's +Z points back at the pilot (the panel root is turned -pi/2
  // about Y, sending local +Z to body -X), so a POSITIVE rotation.z is
  // anticlockwise on screen; and in a right bank the true horizon appears
  // rotated anticlockwise. Both signs therefore go the same way, and
  // `rotation.z = rollRad` is what makes the bar match the horizon rather
  // than mirror it.
  //
  // Measured 2026-09-13 with this project's own createPanel/updatePanel/
  // cameraTransformFor/toThreeOrientation, posed as main.ts poses them: at a
  // 30-degree right bank the bar now reads +30.00 degrees (+ = right end up)
  // against a true horizon of +30.00; the previous `-rollRad` read -30.00, a
  // 60-degree error that scaled with bank. tests/render/panel.test.ts pins
  // this against the camera-space projection of world-up, computed
  // independently of this line -- the old test asserted `-rollRad` and so
  // defended the bug through fifteen task reviews.
  panel.horizon.rotation.z = rollRad

  // Where the bar SITS, which nothing checked until 2026-09-13. C-1 and C-2
  // both corrected its angle; its height was a fixed panel offset plus
  // `pitchRad * 0.08`, an invented scale, so at zero pitch it hung 15.8
  // degrees below the eye line and read as a permanent nose-up error against
  // the visible horizon in level flight.
  //
  // It is now placed by geometry with no tuned constant at all. The bar's
  // datum, `PANEL_BELOW_M` in this frame, is exactly eye height. The true
  // horizon is depressed below the nose by the pitch angle, so at
  // `PANEL_AHEAD_M` ahead it lies `PANEL_AHEAD_M * tan(pitch)` lower -- and
  // that offset runs PERPENDICULAR TO THE BAR, along the projected world up,
  // not along the panel's own up, which is why it is rotated by roll too.
  // Offsetting along panel up instead would be right at zero bank and wrong
  // everywhere else, the same shape of error as C-2.
  //
  // Clamped only to keep `tan` finite near the vertical; at that pitch the
  // horizon is far off screen and its exact position stops mattering.
  const clampedPitch = Math.max(-MAX_HORIZON_PITCH, Math.min(MAX_HORIZON_PITCH, pitchRad))
  const drop = HORIZON_DISTANCE_M * Math.tan(clampedPitch)
  panel.horizon.position.set(
    drop * Math.sin(rollRad),
    PANEL_BELOW_M - drop * Math.cos(rollRad),
    HORIZON_Z,
  )
}
