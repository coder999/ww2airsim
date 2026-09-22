import {
  advance,
  createWorldOf,
  playerAircraft,
  withAircraftState,
  withControls,
  PLAYER_ID,
  type Stepper,
  type World,
} from '../sim/loop.js'
import type { TerrainField } from '../sim/world/terrain.js'
import { decksOf } from '../sim/world/deck.js'
import { groundUnder } from '../sim/world/ground.js'
import {
  assistFor,
  DEFAULT_ASSIST_SETTINGS,
  type AssistSettings,
} from '../assists/index.js'
import { interpolateAircraft, interpolateShip, type RenderState, type ShipPose } from '../sim/interpolate.js'
import { controlsFromKeys, NEUTRAL, type PressedKeys } from '../input/keyboard.js'
import { lookOffsetFromKeys, LOOK_CENTRE, type LookOffset } from '../input/lookAround.js'
import { cameraTransformFor, type CameraMode, type EyeTransform } from './camera.js'
import { BINDINGS, type BindingName } from '../input/bindings.js'
import { type Vec3, v3, length } from '../sim/math/vec3.js'
import { type Quat, qFromAxisAngle, qMul, qNormalize } from '../sim/math/quat.js'
import type { AircraftState, Controls } from '../sim/flight/state.js'
import type { AircraftSpec } from '../sim/flight/schema.js'
import { nextLandingTracking, NO_LANDING, type LandingTracking } from './landing.js'

export type FrameState = {
  /** `World<undefined>` since altitude hold was deleted on 2026-09-17: it was
   *  the only assist with memory, so `assistMemory` now carries nothing. The
   *  generic stays because `Assist<M>` is the extension point for a future
   *  stateful assist, not because anything uses it today. It used to be a
   *  separate field on this type; see `assistFor` in src/assists/index.ts for
   *  why one copy inside the world beats two that can disagree. */
  readonly world: World<undefined>
  /** This frame's commanded controls -- the identical object the player
   *  entity's `controls` holds, kept here too because main.ts's prop spin and
   *  the Tier 2 diagnostics hook read the frame, not the world inside it. */
  readonly controls: Controls
  readonly look: LookOffset
  readonly cameraMode: CameraMode
  readonly eye: EyeTransform
  /** The PLAYER's interpolated pose this frame -- `poses[playerIndex]`, the
   *  identical object, not a second computation of it (see `posesFor`). The
   *  same quantity `eye` is built from, exposed separately so the renderer
   *  can pose the airframe mesh. Sim convention throughout (body +X forward):
   *  unlike `toThreeOrientation` below, this needs no basis fix, because the
   *  airframe mesh's own geometry is built with +X as its nose
   *  (src/render/scene/hellcat.ts) -- a Three Object3D has no built-in
   *  "forward" the way a Three camera does, so setting its quaternion
   *  straight from sim convention orients it correctly. */
  readonly render: RenderState
  /** One interpolated pose per `world.aircraft`, same order -- Plan 12's
   *  generalization of `render` to every airplane, not just the player's.
   *  `render` stays a separate field (see its own comment) rather than
   *  becoming `poses[playerIndex]` at every call site, because the eye, the
   *  gauges, the cockpit group and the audio adapter all read it by that one
   *  name today. */
  readonly poses: readonly RenderState[]
  /** One interpolated pose per `world.ships`, same order. A ship has no
   *  attitude in this plan (`interpolateShip`'s own comment), so this is a
   *  position and a heading rather than a `RenderState`. */
  readonly shipPoses: readonly ShipPose[]
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
  /**
   * Whether the pilot currently has the gear commanded down: the PLAYER's
   * `parked` (Plan 12; `initialFrameStateFor` reads `playerAircraft(world).parked`).
   * Before Task 14 this was a hardcoded `false`, justified by the old spawn
   * being airborne (600 m up, 23 km from land); Task 14 moved that spawn onto
   * a runway at Tacloban, which is exactly the drift this comment used to
   * warn about -- a spawn that changed out from under a constant that did not
   * track it. Measured cost of getting this wrong (gear that should be down
   * but is commanded up): by t=30 s an ordinary flight had lost 7.3 m/s and
   * 8.3 m of altitude versus never commanding the gear, and the gap widens
   * forever, because the gear's 0.3 sq m drag area is 46% of the airframe's
   * own zero-lift drag area. Threaded into `Controls.gearDown` every frame --
   * see the comment on `controls` below for why that step is not optional.
   */
  readonly gearDown: boolean
  /** Whether the gear toggle key was down last frame, for edge detection --
   *  the same reason `cyclePressed` exists: a lever that stays where it is
   *  left, not a switch that flips 60 times while held for a second. */
  readonly gearPressed: boolean
  /** Where the flap lever is. Threaded into `Controls.flapDown` every frame,
   *  for the reason `gearDown`'s own comment gives: a control the simulation
   *  is not told about every step does not move. */
  readonly flapDown: boolean
  /** Whether the flap key was down last frame, for edge detection -- the same
   *  reason `gearPressed` exists. */
  readonly flapPressed: boolean
  /** The tailhook lever, edge-triggered exactly like the flap lever (Plan 8). */
  readonly hookDown: boolean
  readonly hookPressed: boolean
  /** Whether the throttle-cut key was down last frame, for edge detection:
   *  the chop fires once per press, and a held `M` must not keep re-zeroing
   *  a throttle the pilot is trying to open again. */
  readonly throttleCutPressed: boolean
  /** Whether the bomb-release key was down last frame, for edge detection --
   *  the same reason `throttleCutPressed` exists: `Controls.dropBomb` pulses
   *  true for one tick per press, and a held `V` must not keep releasing
   *  ordnance every frame (Plan 6b Task 4). */
  readonly dropBombPressed: boolean
  /** The rocket-fire key's twin of `dropBombPressed`. */
  readonly fireRocketsPressed: boolean
  /**
   * Whether the simulation is paused (Mark, 2026-09-17: "esc key pauses
   * game"). Applied the same way triple time is, to the frame delta: a paused
   * frame feeds `advance` zero elapsed seconds, so the accumulator does not
   * fill and resuming owes no burst of catch-up steps. The renderer keeps
   * drawing -- the world is held, not hidden -- and `look` still reads the
   * real delta, so the pilot can look around a frozen scene. The controls
   * ramp on the same zero delta and therefore hold too, which is what makes
   * this a pause rather than a stall: a key held through it does not wind
   * the stick up for the moment it lifts.
   *
   * Toggled on the `pause` key's edge, and settable directly (`withPaused`)
   * so a modal that wants the world held -- the landing debrief -- reuses
   * this one mechanism rather than growing a second freeze beside the
   * player's `impact` hold in `nextFrameState`.
   */
  readonly paused: boolean
  /** Whether the pause key was down last frame, for edge detection. */
  readonly pausePressed: boolean
  /** The landing in progress, if any -- see `LandingTracking`. Updated every
   *  frame from the world on either side of this frame's steps. */
  readonly landing: LandingTracking
  /**
   * Whether ANY aircraft in this world spawned parked, waiting for terrain
   * (Plan 12; `initialFrameStateFor` reads `world.aircraft.some((a) =>
   * a.parked)`, not just the player's). Set once, when the frame is built,
   * and carried unchanged by every `nextFrameState` call after that: it
   * describes how the world STARTED, not anything that changes mid-flight.
   *
   * The one thing it gates: `nextFrameState` feeds `advance` zero elapsed
   * time -- instead of the real frame delta -- on every frame this is `true`
   * and `world.terrain` is still `null`. Terrain arrives over the network,
   * seconds after the first frame (`main.ts`'s `loadTerrainProgressively`);
   * without this hold, a parked airplane free-falls from its spawn altitude
   * in that gap, is metres underground by the time terrain lands, and
   * `advance` records a crash before the pilot has touched a key. `false`
   * (a DEV `?spawnX/Y/Z` override -- `spawn.ts`'s `hasSpawnOverride`) never
   * holds: those spawns are already airborne, so there is no ground to wait
   * for and the pre-Task-14 behavior is exactly preserved.
   */
  readonly groundSpawn: boolean
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
} as const satisfies Record<keyof AssistSettings, BindingName>

const NO_TOGGLES_DOWN: AssistTogglesDown = {
  stallLimiter: false,
  autoRudder: false,
}

/**
 * One interpolated pose per aircraft and per ship (Plan 12), plus the
 * player's own pose picked out of `poses` BY IDENTITY -- `render` below is
 * never a second `interpolateAircraft` call on the player's states, so there
 * is exactly one computation of where the player is this frame, not two that
 * could disagree.
 */
function posesFor(
  world: World<undefined>,
  alpha: number,
): { poses: RenderState[]; shipPoses: ShipPose[]; render: RenderState } {
  const poses = world.aircraft.map((a) => interpolateAircraft(a.previous, a.state, alpha))
  const shipPoses = world.ships.map((s) => interpolateShip(s.previous, s.state, alpha))
  const playerIndex = world.aircraft.findIndex((a) => a.id === world.player)
  return { poses, shipPoses, render: poses[playerIndex]! }
}

/**
 * The general entry point (Plan 12): a `FrameState` for a `World` that may
 * carry any number of aircraft and ships. `groundSpawn` and `gearDown` are
 * derived from the world's own entities rather than taken as a second,
 * independently-set argument -- `groundSpawn`'s doc comment on `FrameState`
 * explains why a world with several parked aircraft has to hold for ALL of
 * them, and `gearDown`'s explains why the player's `parked` alone decides the
 * gear.
 */
export function initialFrameStateFor(
  world: World<undefined>,
  assists: AssistSettings = DEFAULT_ASSIST_SETTINGS,
): FrameState {
  const player = playerAircraft(world)
  const { poses, shipPoses, render } = posesFor(world, 0)
  return {
    world,
    controls: player.controls,
    look: LOOK_CENTRE,
    cameraMode: 'chase',
    eye: { position: render.position, attitude: render.attitude },
    render,
    poses,
    shipPoses,
    stepsRun: 0,
    droppedSteps: 0,
    cyclePressed: false,
    timeScale: 1,
    tripleTimePressed: false,
    assists,
    assistTogglesDown: NO_TOGGLES_DOWN,
    gearDown: player.parked,
    gearPressed: false,
    // Flaps UP on every spawn, parked included: unlike the gear, there is no
    // configuration in which an airplane is left with its flaps hanging out.
    flapDown: false,
    flapPressed: false,
    hookDown: false,
    hookPressed: false,
    throttleCutPressed: false,
    dropBombPressed: false,
    fireRocketsPressed: false,
    paused: false,
    pausePressed: false,
    landing: NO_LANDING,
    groundSpawn: world.aircraft.some((a) => a.parked),
  }
}

/**
 * The pre-Plan-12 entry point: builds the one-aircraft `World` every Tier 1
 * test before this task constructs by hand, then delegates to
 * `initialFrameStateFor`. Kept so a one-airplane test, and `main.ts` until
 * Task 7 wires it to the scenario, still build a frame in one call.
 */
export function initialFrameState(
  spec: AircraftSpec,
  aircraft: AircraftState,
  assists: AssistSettings = DEFAULT_ASSIST_SETTINGS,
  // `null` (no terrain) by default, exactly `World.terrain`'s own default --
  // see that field's comment. Threaded through here, rather than left for a
  // caller to patch the world with a terrain after the fact,
  // so a `FrameState` is buildable with terrain already in place the moment
  // a later task has a field to hand it (main.ts's `initialFrameState(spec,
  // initialAircraft)` call passes none, so this task changes no runtime
  // behaviour: `advance`'s impact check never runs while this stays `null`).
  terrain: TerrainField | null = null,
  // `false` matches every caller that predates Task 14 -- every Tier 1 test
  // and every DEV spawn override -- so this argument changes no existing
  // behavior by default. A ground spawn passes `true` here and nowhere
  // else: `gearDown` and `groundSpawn` both derive from this one aircraft's
  // `parked`, so the two cannot drift apart the way `gearDown`'s own doc
  // comment warns a hardcoded constant did.
  groundSpawn: boolean = false,
): FrameState {
  const world = createWorldOf<undefined>({
    aircraft: [
      {
        id: PLAYER_ID,
        spec,
        state: aircraft,
        previous: aircraft,
        controls: NEUTRAL,
        assistMemory: undefined,
        impact: null,
        parked: groundSpawn,
      },
    ],
    player: PLAYER_ID,
    terrain,
  })
  return initialFrameStateFor(world, assists)
}

/** After the landing debrief's Continue: forget the landing so the next
 *  flight from here can report its own, and release the pause the modal
 *  held. Restart does not need this -- `initialFrameState` starts clean. */
export function acknowledgeLanding(frame: FrameState): FrameState {
  return { ...frame, landing: NO_LANDING, paused: false }
}

/** The same `FrameState`, paused or not. For the landing debrief, which holds
 *  the world while it is up and releases it on Continue -- see `paused`. */
export function withPaused(frame: FrameState, paused: boolean): FrameState {
  return { ...frame, paused }
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
 * Snaps EVERY parked aircraft's altitude onto the REAL ground the instant
 * real terrain data exists (Plan 12; Task 14/15 settled only the player,
 * which left a second parked aircraft at its placeholder altitude --
 * `AircraftEntity.parked`'s doc comment named this function as the fix).
 * Replaces whatever placeholder Y `worldFromScenario` (`src/sim/scenario.ts`)
 * shipped a parked entity's `state` with -- see `PARKED_PLACEHOLDER_Y_M`'s
 * doc comment there for why it cannot be the truth at world-build time.
 *
 * Meant to be called exactly once, at the transition where `world.terrain`
 * goes from `null` to real (`main.ts`'s terrain-arrival callback): nothing has
 * advanced before then for a ground spawn (`FrameState.groundSpawn`'s hold in
 * `nextFrameState`), so every parked aircraft's `state`, its `previous`, and
 * (for the player alone) `eye` and `render` are all still literally the spawn
 * point -- correcting the state without the other three would show the
 * airplane at the wrong height for exactly one frame. Velocity is untouched;
 * only the vertical component of each position moves.
 *
 * Takes the terrain as a separate argument, rather than reading
 * `frame.world.terrain`, so a caller cannot pass a `frame` whose terrain is
 * still `null` and get a silently wrong `groundUnder(null, ...)` -- there is
 * no such overload, so that mistake is a type error, not a runtime one.
 *
 * Settles onto `ground.heightM + spec.gear.heightM`, not `ground.heightM`
 * itself (Task 15): `aircraft.position.y` is the body origin, which sits
 * `spec.gear.heightM` above the wheels' contact point, the same convention
 * `onGround`/`restOnSurface` (`src/sim/ground.ts`) now use. Settling onto
 * the bare `ground.heightM` here would put the body origin back at ground
 * level -- the exact bug Task 15 fixes -- for the one frame between this call
 * and the first `advance` after it, which is also the frame the player is
 * most likely to be looking at the runway.
 *
 * Reads `groundUnder` with `decksOf(world.ships)` rather than `heightAt`
 * alone (Plan 8): a deck wins where there is one, so a deck-parked airplane
 * settles onto steel, not onto the sea floor `heightAt` would have named for
 * the same `(x, z)`. `groundUnder` with a real field never returns `null`.
 */
export function settleOnTerrain(frame: FrameState, terrain: TerrainField): FrameState {
  let world = frame.world
  let playerDeltaY = 0
  const decks = decksOf(world.ships)
  for (const a of frame.world.aircraft) {
    if (!a.parked) continue
    const ground = groundUnder(terrain, decks, a.state.position.x, a.state.position.z)!
    const contactHeightM = ground.heightM + a.spec.gear.heightM
    if (a.id === world.player) playerDeltaY = contactHeightM - a.state.position.y
    const settled = { ...a.state, position: v3(a.state.position.x, contactHeightM, a.state.position.z) }
    world = withAircraftState(world, a.id, settled)
  }
  const { poses, shipPoses, render } = posesFor(world, 0)
  return {
    ...frame,
    world,
    poses,
    shipPoses,
    render,
    eye: { ...frame.eye, position: v3(frame.eye.position.x, frame.eye.position.y + playerDeltaY, frame.eye.position.z) },
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
  const player = playerAircraft(prev.world)
  const spec = player.spec

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

  // Pause, edge-triggered and read before the delta for the same reason
  // triple time is: the frame the key is pressed on is already held.
  const pauseDown = BINDINGS.pause.some((c) => pressed.has(c))
  const paused = pauseDown && !prev.pausePressed ? !prev.paused : prev.paused

  // The simulation's clock. `controlsFromKeys` ramps toward full deflection
  // over RAMP_SECONDS and belongs on this one: the stick is part of the flight
  // being fast-forwarded, so leaving it on real seconds would make the
  // airplane answer a third as willingly per metre flown, exactly when there
  // is most sky going past. Zero while paused -- see `FrameState.paused`.
  const simElapsedSeconds = paused ? 0 : elapsedSeconds * timeScale
  const ramped = controlsFromKeys(pressed, simElapsedSeconds, prev.controls)
  // The throttle cut: one press zeroes the lever, and because the next
  // frame's `prev.controls.throttle` is then 0, the ramp continues from
  // there. Edge-triggered so a held key cannot pin the throttle shut.
  const throttleCutDown = BINDINGS.throttleCut.some((c) => pressed.has(c))
  const controlsAxes =
    throttleCutDown && !prev.throttleCutPressed ? { ...ramped, throttle: 0 } : ramped

  // Edge-triggered exactly like the camera cycle and the assist toggles
  // above: the gear is a lever that stays where it is left, not a switch
  // that flips 60 times while `G` is held for a second.
  const gearKeyDown = BINDINGS.toggleGear.some((c) => pressed.has(c))
  const gearDown =
    gearKeyDown && !prev.gearPressed ? !prev.gearDown : prev.gearDown

  // The flap lever, edge-triggered identically.
  const flapKeyDown = BINDINGS.toggleFlaps.some((c) => pressed.has(c))
  const flapDown =
    flapKeyDown && !prev.flapPressed ? !prev.flapDown : prev.flapDown

  // The tailhook lever, edge-triggered identically (Plan 8).
  const hookKeyDown = BINDINGS.toggleHook.some((c) => pressed.has(c))
  const hookDown =
    hookKeyDown && !prev.hookPressed ? !prev.hookDown : prev.hookDown

  // Release controls (Plan 6b Task 4): a PULSE, not a lever like the gear/flap/
  // hook above -- `dropBomb`/`fireRockets` are true for exactly the tick after
  // the key-down edge, matching `throttleCut`'s one-shot shape rather than a
  // toggle's persisting state. What happens when these are true is Task 6's
  // job; this only wires the edge.
  const dropBombKeyDown = BINDINGS.dropBomb.some((c) => pressed.has(c))
  const dropBomb = dropBombKeyDown && !prev.dropBombPressed
  const fireRocketsKeyDown = BINDINGS.fireRockets.some((c) => pressed.has(c))
  const fireRockets = fireRocketsKeyDown && !prev.fireRocketsPressed

  // On/off from a keyboard: 1 while held, 0 the instant it is not.
  // `Controls.brake` is [0, 1] (a pedal's travel, not a switch), so a later
  // axis input -- a rudder pedal's toe-brake, say -- slots in with no type
  // change here.
  const brake = BINDINGS.brakes.some((c) => pressed.has(c)) ? 1 : 0

  // `gearDown` and `brake` go into the SAME `Controls` object that reaches
  // the player entity's `controls` below, for the reason the assist comment
  // on `assist` gives: the Plan 3 defect was a control that never reached
  // the simulation, inert in the browser while its own unit tests passed
  // because they called the module directly. `frame.test.ts` pins this by
  // reading `playerAircraft(f.world).controls.gearDown` back, not just
  // `f.gearDown`.
  const controls: Controls = {
    ...controlsAxes,
    gearDown,
    flapDown,
    hookDown,
    brake,
    fire: BINDINGS.fireGuns.some(c => pressed.has(c)),
    // Only present when `true`: `Controls.dropBomb`'s doc comment promises
    // `undefined` means no release, and an unconditional `false` here would
    // break that for every frame that is not the pulse itself.
    ...(dropBomb ? { dropBomb: true } : {}),
    ...(fireRockets ? { fireRockets: true } : {}),
  }
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
  }
  const assists: AssistSettings = {
    stallLimiter: flipped('stallLimiter'),
    autoRudder: flipped('autoRudder'),
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
  // `AircraftEntity.controls`): `advance` takes one object, so a Plan 7 AI
  // sets another entity's controls instead of growing a parameter at every
  // call site. `withControls` rebuilds the world around a new player entity,
  // never a write into `prev.world` -- `advance`'s purity test deep-freezes
  // the world it is handed.
  //
  // The world is HELD -- `advance` handed zero elapsed seconds -- while
  // either of two things is true, and pause is a third on the same mechanism
  // (`simElapsedSeconds` above). Feeding zero reuses `advance`'s own "no time
  // owed" path (loop.ts), which returns the same world object, rather than
  // teaching this function a second way to freeze the airplane: `stepsRun`
  // and `droppedSteps` both read 0, `accumulatorSeconds` does not move, and
  // `render`/`eye` below reinterpolate onto the same unchanged
  // `previous`/`state` pair, so the airplane visibly sits still rather than
  // snapping to a placeholder pose.
  //
  //  - A ground spawn, until its terrain exists (`groundSpawn`'s doc comment
  //    on `FrameState`). The moment `world.terrain` stops being `null`
  //    (`main.ts`'s `settleOnTerrain` call, the same frame it happens), this
  //    reads `false` on the very next call and the flight proceeds normally.
  //  - The PLAYER has hit something. `advance` itself stops nothing since
  //    Plan 12 (spec §4) -- one airplane crashing must not stop the carrier
  //    or an AI Zero -- so the end of the player's flight is this frame's
  //    decision, here, on the same mechanism as the other two.
  const holding = (prev.groundSpawn && prev.world.terrain === null) || player.impact !== null || prev.world.combat.aircraft[prev.world.player]!.damage.destroyedAt !== null
  const advanced = advance(
    withControls(prev.world, prev.world.player, controls),
    holding ? 0 : simElapsedSeconds,
    stepper,
    assist,
  )
  const advancedPlayer = playerAircraft(advanced.world)
  const { poses, shipPoses, render } = posesFor(advanced.world, advanced.alpha)
  const before = advancedPlayer.previous.velocity
  const after = advancedPlayer.state.velocity
  const a = advanced.alpha
  const speed = length(v3(before.x + (after.x - before.x) * a, before.y + (after.y - before.y) * a, before.z + (after.z - before.z) * a))
  const eye = cameraTransformFor(cameraMode, spec, render, look, speed)

  // Landing bookkeeping reads the airplane on both sides of this frame's
  // steps: `player.state` is the state before them, `advancedPlayer.state`
  // after. A frame that ran no steps (paused, holding) compares a
  // state with itself and changes nothing.
  const landing = nextLandingTracking(
    spec,
    prev.landing,
    player.state,
    advancedPlayer.state,
    advanced.world.terrain,
    advanced.world.airfields,
    decksOf(advanced.world.ships),
  )

  return {
    world: advanced.world,
    controls,
    look,
    cameraMode,
    eye,
    render,
    poses,
    shipPoses,
    stepsRun: advanced.stepsRun,
    droppedSteps: advanced.droppedSteps,
    cyclePressed: cycleDown,
    timeScale,
    tripleTimePressed: tripleTimeDown,
    assists,
    assistTogglesDown,
    gearDown,
    gearPressed: gearKeyDown,
    flapDown,
    flapPressed: flapKeyDown,
    hookDown,
    hookPressed: hookKeyDown,
    throttleCutPressed: throttleCutDown,
    dropBombPressed: dropBombKeyDown,
    fireRocketsPressed: fireRocketsKeyDown,
    paused,
    pausePressed: pauseDown,
    landing,
    groundSpawn: prev.groundSpawn,
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
