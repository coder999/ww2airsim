import { advance, createWorld, type Stepper, type World } from '../sim/loop.js'
import { interpolateAircraft } from '../sim/interpolate.js'
import { controlsFromKeys, NEUTRAL, type PressedKeys } from '../input/keyboard.js'
import { lookOffsetFromKeys, LOOK_CENTRE, type LookOffset } from '../input/lookAround.js'
import { cameraTransformFor, type CameraMode, type EyeTransform } from './camera.js'
import { BINDINGS } from '../input/bindings.js'
import type { AircraftState, Controls } from '../sim/flight/state.js'
import type { AircraftSpec } from '../sim/flight/schema.js'

export type FrameState = {
  readonly world: World
  readonly controls: Controls
  readonly look: LookOffset
  readonly cameraMode: CameraMode
  readonly eye: EyeTransform
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
    stepsRun: advanced.stepsRun,
    droppedSteps: advanced.droppedSteps,
    cyclePressed: cycleDown,
  }
}
