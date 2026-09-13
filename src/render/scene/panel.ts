import { BoxGeometry, CircleGeometry, Group, Mesh, MeshBasicMaterial, type Object3D } from 'three'
import { GAUGES, needleAngleFor, attitudeAngles, type GaugeId } from '../gauges.js'
import type { AircraftState } from '../../sim/flight/state.js'
import type { AircraftSpec } from '../../sim/flight/schema.js'

export type Panel = {
  readonly root: Object3D
  readonly needles: Map<GaugeId, Object3D>
  readonly horizon: Object3D
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
/** Panel centre relative to the pilot's eye, body frame (+X forward, +Y up). */
const PANEL_AHEAD_M = 0.6
const PANEL_BELOW_M = 0.35

export function createPanel(spec: AircraftSpec): Panel {
  const root = new Group()
  const needles = new Map<GaugeId, Object3D>()

  const faceMat = new MeshBasicMaterial({ color: 0x101418 })
  const needleMat = new MeshBasicMaterial({ color: 0xffd24a })

  GAUGES.forEach((g, i) => {
    const dial = new Group()
    const x = (i - (GAUGES.length - 1) / 2) * DIAL_GAP

    const face = new Mesh(new CircleGeometry(DIAL_RADIUS, 32), faceMat)
    dial.add(face)

    const needle = new Mesh(new BoxGeometry(0.008, DIAL_RADIUS * 1.5, 0.004), needleMat)
    // Offset so the mesh pivots about the dial centre rather than its own end.
    needle.geometry.translate(0, DIAL_RADIUS * 0.55, 0)
    dial.add(needle)
    needles.set(g.id, needle)

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
  return { root, needles, horizon }
}

export function updatePanel(panel: Panel, spec: AircraftSpec, state: AircraftState): void {
  for (const g of GAUGES) {
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
