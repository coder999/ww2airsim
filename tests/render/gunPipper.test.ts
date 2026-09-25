import { describe, expect, it } from 'vitest'
import { Group, Quaternion, Vector3 } from 'three'
import { createGunPipper, poseGunPipper } from '../../src/render/scene/gunPipper.js'
import { createPanel } from '../../src/render/scene/panel.js'
import { cameraTransformFor } from '../../src/render/camera.js'
import { toThreeOrientation } from '../../src/render/frame.js'
import { createState, type AircraftState } from '../../src/sim/flight/state.js'
import { add, normalize, sub, v3, type Vec3 } from '../../src/sim/math/vec3.js'
import { qFromAxisAngle, qMul, qRotate } from '../../src/sim/math/quat.js'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { levelStateAt, meanProductionImpact, SPEED_MPS, START } from './productionImpact.js'

/**
 * The chase view's aiming reference (2026-09-25). The chase camera -- the
 * default view -- drew nothing to aim with: at 120 m/s its screen center is
 * about 6 m above the flight line, so the rounds pass 1.4 degrees below it
 * at 300 m and 3.9 degrees below at 100 m (the shootdown spike). The pipper
 * is drawn at the point the rounds pass at convergence range, so whatever the
 * chase camera does, the pipper's projection IS where the guns are pointed.
 */

const f6f = loadAircraftSpec('f6f-hellcat')
const deg = (rad: number): number => rad * 180 / Math.PI

/** Pose the pipper exactly as main.ts does: from the player airframe root,
 *  which carries the raw sim attitude (main.ts's pose loop). */
function posed(state: AircraftState, visible = true) {
  const pipper = createGunPipper(f6f)!
  const airframe = new Group()
  airframe.position.set(state.position.x, state.position.y, state.position.z)
  airframe.quaternion.set(state.attitude.x, state.attitude.y, state.attitude.z, state.attitude.w)
  poseGunPipper(pipper, airframe, visible)
  pipper.root.updateMatrixWorld(true)
  const at = new Vector3().setFromMatrixPosition(pipper.marker.matrixWorld)
  return { pipper, world: v3(at.x, at.y, at.z) }
}

/** A world point's position on the chase camera's screen, in tangent units
 *  (x right, y up), from the production chase transform. */
function chaseScreen(state: AircraftState, point: Vec3): { x: number; y: number } {
  const eye = cameraTransformFor('chase', f6f, { position: state.position, attitude: state.attitude }, undefined, SPEED_MPS)
  const q = toThreeOrientation(eye.attitude)
  const p = new Vector3(point.x - eye.position.x, point.y - eye.position.y, point.z - eye.position.z)
    .applyQuaternion(new Quaternion(q.x, q.y, q.z, q.w).invert())
  return { x: p.x / -p.z, y: p.y / -p.z }
}

describe('the chase-view gun pipper', () => {
  it('projects onto the chase screen where production rounds pass at convergence, within 0.02 degrees', () => {
    const state = levelStateAt(START)
    const range = f6f.combat!.convergenceM
    const { mean, rounds } = meanProductionImpact(f6f, range)
    expect(rounds).toBeGreaterThan(60)
    const impactWorld = add(state.position, qRotate(state.attitude, mean))
    const drawn = chaseScreen(state, posed(state).world)
    const actual = chaseScreen(state, impactWorld)
    expect(deg(Math.abs(Math.atan(drawn.x) - Math.atan(actual.x)))).toBeLessThan(0.02)
    expect(deg(Math.abs(Math.atan(drawn.y) - Math.atan(actual.y)))).toBeLessThan(0.02)
    // And it is BELOW the chase screen's center -- the point of having one:
    // aiming the screen center misses by more than a degree.
    expect(deg(Math.atan(actual.y))).toBeLessThan(-1)
  })

  it('agrees with the cockpit reticle by construction: it sits on the reticle line', () => {
    for (const attitude of [qFromAxisAngle(v3(0, 1, 0), 0), qMul(qFromAxisAngle(v3(0, 0, 1), 0.3), qFromAxisAngle(v3(1, 0, 0), 1.1))]) {
      const state = createState({ position: START, velocity: qRotate(attitude, v3(SPEED_MPS, 0, 0)), attitude })
      const panel = createPanel(f6f, () => null)
      const cockpit = new Group()
      cockpit.add(panel.root)
      cockpit.position.set(state.position.x, state.position.y, state.position.z)
      cockpit.quaternion.set(attitude.x, attitude.y, attitude.z, attitude.w)
      cockpit.updateMatrixWorld(true)
      const eye = cameraTransformFor('cockpit', f6f, { position: state.position, attitude }).position
      const r = new Vector3().setFromMatrixPosition(panel.reticle.matrixWorld)
      const reticleDir = normalize(sub(v3(r.x, r.y, r.z), eye))
      const pipperDir = normalize(sub(posed(state).world, eye))
      const angle = Math.acos(Math.min(1, reticleDir.x * pipperDir.x + reticleDir.y * pipperDir.y + reticleDir.z * pipperDir.z))
      expect(deg(angle)).toBeLessThan(1e-4)
    }
  })

  it('shows only when the airframe does (the chase view), and reads small', () => {
    const state = levelStateAt(START)
    expect(posed(state, true).pipper.root.visible).toBe(true)
    expect(posed(state, false).pipper.root.visible).toBe(false)
    // About a degree across from the chase eye: big enough to find, small
    // enough not to hide a 0.3-degree target.
    const { pipper, world } = posed(state)
    const eye = cameraTransformFor('chase', f6f, { position: state.position, attitude: state.attitude }, undefined, SPEED_MPS).position
    const distance = Math.hypot(world.x - eye.x, world.y - eye.y, world.z - eye.z)
    const spanDeg = deg(2 * Math.atan(pipper.outerRadiusM / distance))
    expect(spanDeg).toBeGreaterThan(0.6)
    expect(spanDeg).toBeLessThan(1.5)
  })

  it('an airplane with no guns gets no pipper', () => {
    expect(createGunPipper({ ...f6f, combat: undefined })).toBeNull()
  })
})
