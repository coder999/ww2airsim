import { advance, createWorld, type Stepper, type World } from '../sim/loop.js'
import { interpolateAircraft, type RenderState } from '../sim/interpolate.js'
import { controlsFromKeys, NEUTRAL, type PressedKeys } from '../input/keyboard.js'
import { lookOffsetFromKeys, LOOK_CENTRE, type LookOffset } from '../input/lookAround.js'
import { cameraTransformFor, type CameraMode, type EyeTransform } from './camera.js'
import { BINDINGS } from '../input/bindings.js'
import { type Vec3, v3 } from '../sim/math/vec3.js'
import { type Quat, qFromAxisAngle, qMul, qNormalize } from '../sim/math/quat.js'
import type { AircraftState, Controls } from '../sim/flight/state.js'
import type { AircraftSpec } from '../sim/flight/schema.js'

export type FrameState = {
  readonly world: World
  readonly controls: Controls
  readonly look: LookOffset
  readonly cameraMode: CameraMode
  readonly eye: EyeTransform
  /** The aeroplane's interpolated pose this frame -- the same quantity `eye`
   *  is built from, exposed separately so the renderer can pose the airframe
   *  mesh. Sim convention throughout (body +X forward): unlike `toThreeOrientation`
   *  below, this needs no basis fix, because the airframe mesh's own geometry
   *  is built with +X as its nose (src/render/scene/hellcat.ts) -- a Three
   *  Object3D has no built-in "forward" the way a Three camera does, so
   *  setting its quaternion straight from sim convention orients it correctly. */
  readonly render: RenderState
  readonly stepsRun: number
  readonly droppedSteps: number
  /** Whether the camera-cycle key was down last frame, for edge detection. */
  readonly cyclePressed: boolean
}

const MODES: readonly CameraMode[] = ['chase', 'cockpit']

export function initialFrameState(spec: AircraftSpec, aircraft: AircraftState): FrameState {
  return {
    world: createWorld(spec, aircraft),
    controls: NEUTRAL,
    look: LOOK_CENTRE,
    cameraMode: 'chase',
    eye: { position: aircraft.position, attitude: aircraft.attitude },
    render: { position: aircraft.position, attitude: aircraft.attitude },
    stepsRun: 0,
    droppedSteps: 0,
    cyclePressed: false,
  }
}

/**
 * One frame's worth of state change, with no Three.js and no DOM.
 *
 * Everything here is bookkeeping that is easy to get subtly wrong and painful
 * to debug through a GPU: input routing, the camera-cycle edge, the accumulator
 * under a stalled frame. Keeping it pure is what makes those Tier 1 testable.
 */
export function nextFrameState(
  prev: FrameState,
  elapsedSeconds: number,
  pressed: PressedKeys,
  stepper?: Stepper,
): FrameState {
  const spec = prev.world.spec
  const controls = controlsFromKeys(pressed, elapsedSeconds, prev.controls)
  const look = lookOffsetFromKeys(pressed, elapsedSeconds, prev.look)

  // Edge-triggered: held for a second, a per-frame toggle would cycle 60 times.
  const cycleDown = BINDINGS.cycleCamera.some((c) => pressed.has(c))
  const cameraMode =
    cycleDown && !prev.cyclePressed
      ? MODES[(MODES.indexOf(prev.cameraMode) + 1) % MODES.length]!
      : prev.cameraMode

  const advanced = advance(prev.world, controls, elapsedSeconds, stepper)
  const render = interpolateAircraft(
    advanced.world.previous,
    advanced.world.aircraft,
    advanced.alpha,
  )
  const eye = cameraTransformFor(cameraMode, spec, render, look)

  return {
    world: advanced.world,
    controls,
    look,
    cameraMode,
    eye,
    render,
    stepsRun: advanced.stepsRun,
    droppedSteps: advanced.droppedSteps,
    cyclePressed: cycleDown,
  }
}

/**
 * Fixed rotation from Three's camera-local frame (forward -Z, up +Y, right
 * +X) to the sim's body frame (forward +X, up +Y, right +Z, per
 * src/sim/flight/state.ts). Both are right-handed and share the same up
 * axis; they disagree only about which axis is "forward", which a Three
 * camera bakes in as a hardcoded rendering convention (it always looks down
 * its own local -Z) in a way no other Three object does.
 *
 * Verified numerically 2026-09-13 with this project's own `qFromAxisAngle`/
 * `qRotate` (Task 13 review, round 1): a -90 degree rotation about +Y sends
 * Three-local (0,0,-1) to (1,0,0), leaves (0,1,0) fixed, and sends
 * Three-local (1,0,0) to (0,0,1) -- i.e. it is exactly the change of basis
 * needed, on all three axes, not just forward. The review confirmed `qRotate`
 * and `THREE.Quaternion` agree bit-for-bit on the same quaternion components,
 * so the bug this fixes was a missing basis rotation, not a maths
 * discrepancy.
 */
const THREE_CAMERA_BASIS_FIX: Quat = qFromAxisAngle(v3(0, 1, 0), -Math.PI / 2)

/**
 * Converts a sim attitude (body +X forward) into the quaternion a Three.js
 * camera must be set to so it looks the same world direction.
 *
 * Pure, and deliberately here rather than in main.ts: this is coordinate
 * arithmetic, testable without a GPU, and the bug it fixes (the camera
 * looking out the left wing) sat undetected in main.ts precisely because
 * main.ts has no tests. See tests/render/frame.test.ts's basis-conversion
 * case, which checks the resulting Three-camera forward against
 * `qRotate(attitude, (1,0,0))` directly.
 */
export function toThreeOrientation(attitude: Quat): Quat {
  return qNormalize(qMul(attitude, THREE_CAMERA_BASIS_FIX))
}

/**
 * The translation applied to every non-camera object each frame so the
 * camera can stay pinned at the world origin (master spec §4: camera-relative
 * rendering, needed before terrain exists because retrofitting it means
 * touching every position in the renderer).
 *
 * Deliberately the negative of the eye position -- the world moves, the
 * camera does not -- rather than the equivalent-looking alternative of
 * moving the camera to the eye's position and leaving the world alone. The
 * two produce an identical image with one aircraft over flat water, which is
 * exactly why this is pinned by a test rather than left as an implicit
 * property of how main.ts happens to call `.set()`: they diverge the moment
 * a second reference frame (terrain, a carrier deck) exists that must also
 * receive this translation and a moved camera would not carry along for
 * free.
 */
export function worldOffsetFor(eyePosition: Vec3): Vec3 {
  return v3(-eyePosition.x, -eyePosition.y, -eyePosition.z)
}

/**
 * Which of the cockpit group (the instrument panel) and the external
 * airframe mesh should be visible for a camera mode. Exactly one is ever
 * true, not just "the panel shown": the code-built Hellcat's fuselage box
 * spans y +/-0.75 m (src/render/scene/hellcat.ts), so its top face sits
 * between the eye (0.9 m) and the panel (0.55 m, src/render/scene/panel.ts)
 * and, being front-facing from above, would occlude the panel completely if
 * left visible in cockpit mode -- you would be looking at the inside of a
 * solid box.
 */
export function airframeVisibilityFor(mode: CameraMode): {
  readonly cockpitVisible: boolean
  readonly hellcatVisible: boolean
} {
  const cockpitVisible = mode === 'cockpit'
  return { cockpitVisible, hellcatVisible: !cockpitVisible }
}
