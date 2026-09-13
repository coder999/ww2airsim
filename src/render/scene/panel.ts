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
const DIAL_RADIUS = 0.085
const DIAL_GAP = 0.2
// Depth ordering within a dial. All small and all positive, so everything
// stays in front of the face without needing render-order fiddling.
const Z_MARKS = 0.0015
const Z_READOUT = 0.0025
const Z_NEEDLE = 0.005
/** Panel centre relative to the pilot's eye, body frame (+X forward, +Y up). */
const PANEL_AHEAD_M = 0.6
const PANEL_BELOW_M = 0.35

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
  mesh.userData.text = text
  return mesh
}

function setPlateText(mesh: Mesh, text: string, makeText: TextTextureFactory): void {
  const material = mesh.material as MeshBasicMaterial
  const previous: Texture | null = material.map
  const { width, height } = (mesh.geometry as PlaneGeometry).parameters
  material.map = makeText(text, width / height)
  material.needsUpdate = true
  mesh.userData.text = text
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
      const len = DIAL_RADIUS * (mark.major ? 0.2 : 0.11)
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
        const numeral = textPlate(mark.text, DIAL_RADIUS * 0.5, DIAL_RADIUS * 0.22, makeText)
        const nr = DIAL_RADIUS - len - 0.018
        numeral.position.set(nr * Math.sin(a), nr * Math.cos(a), Z_MARKS)
        dial.add(numeral)
      }
    }

    const needle = new Mesh(new BoxGeometry(0.008, DIAL_RADIUS * 1.5, 0.004), needleMat)
    // Offset so the mesh pivots about the dial centre rather than its own end.
    needle.geometry.translate(0, DIAL_RADIUS * 0.55, 0)
    needle.position.z = Z_NEEDLE
    dial.add(needle)
    needles.set(g.id, needle)

    // The name and unit, which GAUGES has carried since Task 10 with nothing
    // rendering them -- zero non-definition hits across src, tests and tools
    // before this (whole-branch review, I-2).
    const label = textPlate(labelTextFor(g), DIAL_GAP * 0.86, 0.028, makeText)
    label.position.set(0, -DIAL_RADIUS - 0.026, Z_MARKS)
    dial.add(label)

    // Digital readout, per design spec section 7's "digital readouts alongside
    // needles where that helps". It helps most for altitude and heading, where
    // reading a needle to better than a few hundred metres or a few degrees is
    // exactly what the oversized-dial trade gave up.
    const readoutMesh = textPlate('', DIAL_RADIUS * 1.15, 0.032, makeText)
    readoutMesh.position.set(0, -DIAL_RADIUS * 0.46, Z_READOUT)
    dial.add(readoutMesh)
    readouts.set(g.id, { mesh: readoutMesh, text: '' })

    dial.position.set(x, 0, 0)
    root.add(dial)
  })

  const horizon = new Mesh(
    new BoxGeometry(DIAL_RADIUS * 1.6, 0.01, 0.004),
    new MeshBasicMaterial({ color: 0x6fd3ff }),
  )
  horizon.position.set(0, DIAL_GAP * 0.9, 0.002)
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
): void {
  for (const g of GAUGES) {
    const readout = panel.readouts.get(g.id)
    if (readout) {
      const text = readoutTextFor(g.id, spec, state)
      // Re-rasterise only on a real change. The altimeter's displayed metres
      // change a few times a second; redrawing six canvases every frame at
      // 60 fps to show the same six strings would be pure waste.
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
  const { rollRad, pitchRad } = attitudeAngles(state)
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
  panel.horizon.position.y = DIAL_GAP * 0.9 + Math.max(-0.05, Math.min(0.05, pitchRad * 0.08))
}
