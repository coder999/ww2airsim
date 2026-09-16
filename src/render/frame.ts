import { advance, createWorld, type Stepper, type World } from '../sim/loop.js'
import type { TerrainField } from '../sim/world/terrain.js'
import {
  assistFor,
  DEFAULT_ASSIST_SETTINGS,
  NOT_HOLDING,
  type AltitudeHoldMemory,
  type AssistSettings,
} from '../assists/index.js'
import { interpolateAircraft, type RenderState } from '../sim/interpolate.js'
import { controlsFromKeys, NEUTRAL, type PressedKeys } from '../input/keyboard.js'
import { lookOffsetFromKeys, LOOK_CENTRE, type LookOffset } from '../input/lookAround.js'
import { cameraTransformFor, type CameraMode, type EyeTransform } from './camera.js'
import { BINDINGS, type BindingName } from '../input/bindings.js'
import { type Vec3, v3, length } from '../sim/math/vec3.js'
import { type Quat, qFromAxisAngle, qMul, qNormalize } from '../sim/math/quat.js'
import type { AircraftState, Controls } from '../sim/flight/state.js'
import type { AircraftSpec } from '../sim/flight/schema.js'

export type FrameState = {
  /** Carries the altitude-hold memory in `assistMemory`, which is why this is
   *  `World<AltitudeHoldMemory>` and not a bare `World`. It used to be a
   *  separate field on this type; see `assistFor` in src/assists/index.ts for
   *  why one copy inside the world beats two that can disagree. */
  readonly world: World<AltitudeHoldMemory>
  /** This frame's commanded controls -- the identical object `world.controls`
   *  holds, kept here too because main.ts's prop spin and the Tier 2
   *  diagnostics hook read the frame, not the world inside it. */
  readonly controls: Controls
  readonly look: LookOffset
  readonly cameraMode: CameraMode
  readonly eye: EyeTransform
  /** The airplane's interpolated pose this frame -- the same quantity `eye`
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
  /**
   * How many simulated seconds one real second buys: 1, or `TRIPLE_TIME_SCALE`
   * while compression is on.
   *
   * A number rather than a `tripleTime` boolean because it is what the code
   * below actually multiplies by, and because the 1991 original's single
   * 3x setting is not obviously the last one anybody will want -- a second
   * rate is then a value, not a second flag with an ordering question.
   *
   * Compression is applied HERE, to the frame delta, rather than by shortening
   * the fixed step: `DT` is the flight model's integration step and every
   * graded test card, the golden trajectory and the soak are measured at it.
   * Feeding the accumulator three times the elapsed time makes it run three
   * ordinary steps instead of one, so a compressed flight is the same
   * trajectory played faster -- pinned by tripleTime.test.ts, which requires
   * the two to agree exactly rather than approximately.
   */
  readonly timeScale: number
  /** Whether the triple-time key was down last frame, for edge detection --
   *  the same reason `cyclePressed` exists. */
  readonly tripleTimePressed: boolean
  /**
   * Which assists are on. Here rather than in a module-level variable so the
   * whole frame remains one immutable value a test can construct, and so two
   * sessions (two tests, two airplanes later) cannot share one set of flags.
   * `DEFAULT_ASSIST_SETTINGS` (all three on) until a toggle key says otherwise
   * -- there is no options UI and no persistence, deliberately; see
   * `BINDINGS`' own comment on the toggle keys.
   */
  readonly assists: AssistSettings
  /**
   * Whether each assist's toggle key was down last frame, for edge detection --
   * the same reason `cyclePressed` exists, and one flag per assist because
   * three keys need three independent edges. Structurally identical to
   * `AssistSettings` and deliberately a separate type: these booleans mean "the
   * key was physically down", not "the assist is enabled", and conflating them
   * would let a wrong field assignment typecheck.
   */
  readonly assistTogglesDown: AssistTogglesDown
}

/** One "was this toggle key down last frame" flag per assist. See
 *  `FrameState.assistTogglesDown`. */
export type AssistTogglesDown = Readonly<Record<keyof AssistSettings, boolean>>

const MODES: readonly CameraMode[] = ['chase', 'cockpit']

/**
 * Simulated seconds per real second while triple time is on.
 *
 * Three because the 1991 game this one is answering to bound exactly that to
 * `T`, and because the reason it existed -- the Pacific is mostly empty and a
 * transit to the target is long -- is unchanged. Exported so the badge, the
 * tests and any later speed selector all read one number.
 */
export const TRIPLE_TIME_SCALE = 3

/** Which key toggles which assist. The keys themselves live in
 *  `src/input/bindings.ts` with every other key in the game; this is only the
 *  mapping from an assist flag to its binding name, so a rebind is still a
 *  one-line data change in that table. */
const ASSIST_TOGGLES = {
  stallLimiter: 'toggleStallLimiter',
  autoRudder: 'toggleAutoRudder',
  altitudeHold: 'toggleAltitudeHold',
} as const satisfies Record<keyof AssistSettings, BindingName>

const NO_TOGGLES_DOWN: AssistTogglesDown = {
  stallLimiter: false,
  autoRudder: false,
  altitudeHold: false,
}

export function initialFrameState(
  spec: AircraftSpec,
  aircraft: AircraftState,
  assists: AssistSettings = DEFAULT_ASSIST_SETTINGS,
  // `null` (no terrain) by default, exactly `World.terrain`'s own default via
  // `createWorld` -- see that field's comment. Threaded through here, rather
  // than left for a caller to `{ ...frame.world, terrain }` after the fact,
  // so a `FrameState` is buildable with terrain already in place the moment
  // a later task has a field to hand it (main.ts's `initialFrameState(spec,
  // initialAircraft)` call passes none, so this task changes no runtime
  // behaviour: `advance`'s impact check never runs while this stays `null`).
  terrain: TerrainField | null = null,
): FrameState {
  return {
    world: { ...createWorld(spec, aircraft, NEUTRAL, NOT_HOLDING), terrain },
    controls: NEUTRAL,
    look: LOOK_CENTRE,
    cameraMode: 'chase',
    eye: { position: aircraft.position, attitude: aircraft.attitude },
    render: { position: aircraft.position, attitude: aircraft.attitude },
    stepsRun: 0,
    droppedSteps: 0,
    cyclePressed: false,
    timeScale: 1,
    tripleTimePressed: false,
    assists,
    assistTogglesDown: NO_TOGGLES_DOWN,
  }
}

/**
 * The same `FrameState` with a different (or no) terrain field under it.
 *
 * Exists because the heightfield arrives over the network, seconds after the
 * first frame is drawn: `initialFrameState`'s `terrain` parameter covers the
 * case where a caller already holds the field, and this covers the case where
 * it turns up later. From then on `advance` copies `world.terrain` into the
 * next world untouched (loop.ts), so one call is enough -- there is no
 * per-frame re-injection to forget.
 *
 * Here rather than as a `{ ...frame.world, terrain }` spread at the call
 * site, for the reason Task 13's review gave when it moved the camera
 * arithmetic out of main.ts: a state transition nothing tests is how this
 * renderer got its last two silent bugs. Everything except `world.terrain` is
 * preserved, which is what the test asserts.
 */
export function withTerrain(frame: FrameState, terrain: TerrainField | null): FrameState {
  return { ...frame, world: { ...frame.world, terrain } }
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

  // Edge-triggered for the reason the camera cycle below is, and read before
  // anything uses the scale so that the frame the key is pressed on is already
  // compressed -- a scale that took effect one frame late would be a tick of
  // simulated time that belongs to neither setting.
  const tripleTimeDown = BINDINGS.toggleTripleTime.some((c) => pressed.has(c))
  const timeScale =
    tripleTimeDown && !prev.tripleTimePressed
      ? prev.timeScale === 1
        ? TRIPLE_TIME_SCALE
        : 1
      : prev.timeScale

  // The simulation's clock. `controlsFromKeys` ramps toward full deflection
  // over RAMP_SECONDS and belongs on this one: the stick is part of the flight
  // being fast-forwarded, so leaving it on real seconds would make the
  // airplane answer a third as willingly per metre flown, exactly when there
  // is most sky going past.
  const simElapsedSeconds = elapsedSeconds * timeScale
  const controls = controlsFromKeys(pressed, simElapsedSeconds, prev.controls)
  // `look` deliberately keeps the REAL delta. Look-around is the pilot turning
  // their head, not part of the flight; a view that panned three times as fast
  // in wall clock would be unusable precisely when it matters most.
  const look = lookOffsetFromKeys(pressed, elapsedSeconds, prev.look)

  // Edge-triggered: held for a second, a per-frame toggle would cycle 60 times.
  const cycleDown = BINDINGS.cycleCamera.some((c) => pressed.has(c))
  const cameraMode =
    cycleDown && !prev.cyclePressed
      ? MODES[(MODES.indexOf(prev.cameraMode) + 1) % MODES.length]!
      : prev.cameraMode

  // Each assist toggles on its own key's rising edge, for exactly the reason
  // the camera cycle above does: a key held for a second would otherwise flip
  // the flag sixty times and land wherever the frame count left it. Written out
  // per assist rather than looped so `assists` and `assistTogglesDown` are both
  // plain object literals the typechecker fully checks -- three lines of
  // repetition against a `Record` built by reduce, which would need a cast.
  const toggleDown = (assist: keyof AssistSettings): boolean =>
    BINDINGS[ASSIST_TOGGLES[assist]].some((c) => pressed.has(c))
  const flipped = (assist: keyof AssistSettings): boolean =>
    toggleDown(assist) && !prev.assistTogglesDown[assist]
      ? !prev.assists[assist]
      : prev.assists[assist]
  const assistTogglesDown: AssistTogglesDown = {
    stallLimiter: toggleDown('stallLimiter'),
    autoRudder: toggleDown('autoRudder'),
    altitudeHold: toggleDown('altitudeHold'),
  }
  const assists: AssistSettings = {
    stallLimiter: flipped('stallLimiter'),
    autoRudder: flipped('autoRudder'),
    altitudeHold: flipped('altitudeHold'),
  }

  // THE production assist path: without this argument the whole assists layer
  // is inert in the browser and every behavioural test still passes, because
  // those call `applyAssists` directly (found during Plan 3 execution, plan
  // defect, ruled into this task). `advance` calls this once per fixed step --
  // never once per frame -- and it owns the memory-then-stack ordering
  // `applyAssists` requires; see `assistFor`. The memory rides in and out
  // inside `World`, so there is nothing to read back here.
  const assist = assistFor(assists)

  // This frame's controls go into the world rather than alongside it (see
  // `World.controls`): `advance` takes one object, so the combat plan's N-entity AI
  // adds a field here instead of a parameter at every call site. A new object
  // each frame, never a write into `prev.world` -- `advance`'s purity test
  // deep-freezes the world it is handed.
  const advanced = advance({ ...prev.world, controls }, simElapsedSeconds, stepper, assist)
  const render = interpolateAircraft(
    advanced.world.previous,
    advanced.world.aircraft,
    advanced.alpha,
  )
  const before = advanced.world.previous.velocity
  const after = advanced.world.aircraft.velocity
  const a = advanced.alpha
  const speed = length(v3(before.x + (after.x - before.x) * a, before.y + (after.y - before.y) * a, before.z + (after.z - before.z) * a))
  const eye = cameraTransformFor(cameraMode, spec, render, look, speed)

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
    timeScale,
    tripleTimePressed: tripleTimeDown,
    assists,
    assistTogglesDown,
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
 * between the eye (0.9 m) and the panel (0.71 m as of 2026-09-13, src/render/scene/panel.ts)
 * and, being front-facing from above, would occlude roughly the lower half of the panel if
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
