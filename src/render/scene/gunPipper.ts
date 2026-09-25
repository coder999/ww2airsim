import { DoubleSide, Group, Mesh, MeshBasicMaterial, RingGeometry, type Object3D } from 'three'
import type { AircraftSpec } from '../../sim/flight/schema.js'
import { gunHarmonization } from '../../sim/weapons/harmonization.js'

/**
 * The chase view's gun pipper (2026-09-25): a small ring at the point the
 * rounds pass at convergence range, so the default camera has an aiming
 * reference. Before it, the chase view drew nothing: its screen center sits
 * about 6 m above the flight line at 120 m/s, and the rounds passed 1.4
 * degrees below center at 300 m (the shootdown spike).
 *
 * Geometry, not a screen overlay: the marker sits at `gunHarmonization`'s
 * `impactBody`, in the airframe's own body frame, so its projection through
 * WHATEVER the chase camera does (lag, pitch follow, discarded roll) is
 * where the guns point. It is the same point the cockpit reticle marks
 * (panel.ts draws its reticle from the same function), so the two views agree
 * by construction; `tests/render/gunPipper.test.ts` pins both claims against
 * production rounds.
 *
 * Drawn over everything (no depth test): a pipper hidden behind the target it
 * is on, or by a cloud, is no pipper.
 */
export type GunPipper = {
  /** Posed like the airframe root each frame (`poseGunPipper`). */
  readonly root: Group
  /** The ring, at the impact point in the body frame. */
  readonly marker: Object3D
  readonly outerRadiusM: number
}

/** The ring's outer angular diameter as seen from the airframe at
 *  convergence range; from the chase eye, a few tens of meters farther back,
 *  it reads a little smaller. */
const PIPPER_DEG = 1.0
const RING_INNER_FRACTION = 0.72

export function createGunPipper(spec: AircraftSpec): GunPipper | null {
  if (spec.combat === undefined) return null
  const h = gunHarmonization(spec.combat, spec.view.eyePointM)
  const outerRadiusM = h.rangeM * Math.tan((PIPPER_DEG * Math.PI) / 360)
  const material = new MeshBasicMaterial({
    color: 0xffdf7a, side: DoubleSide, depthTest: false, depthWrite: false, transparent: true, opacity: 0.9, fog: false,
  })
  const marker = new Mesh(new RingGeometry(outerRadiusM * RING_INNER_FRACTION, outerRadiusM, 32), material)
  marker.name = 'gunPipper'
  marker.position.set(h.impactBody.x, h.impactBody.y, h.impactBody.z)
  // RingGeometry lies in local XY facing +z; turn it to face back along body
  // -x, toward the airframe and the chase camera behind it.
  marker.rotation.y = -Math.PI / 2
  marker.renderOrder = 10
  const root = new Group()
  root.name = 'gunPipper:root'
  root.add(marker)
  return { root, marker, outerRadiusM }
}

/** Copy the player airframe's pose, and show the pipper only when the
 *  airframe itself is shown (the chase view; the cockpit has its reticle). */
export function poseGunPipper(pipper: GunPipper, airframeRoot: Object3D, visible: boolean): void {
  pipper.root.position.copy(airframeRoot.position)
  pipper.root.quaternion.copy(airframeRoot.quaternion)
  pipper.root.visible = visible
}
