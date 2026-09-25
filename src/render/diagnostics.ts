import type { AudioSnapshot } from '../audio/system.js'
import type { AdapterVerdict } from './adapterGuard.js'
import type { CameraMode } from './camera.js'
import type { Controls } from '../sim/flight/state.js'
import type { LookOffset } from '../input/lookAround.js'
import type { AssistSettings } from '../assists/index.js'
import type { Vec3 } from '../sim/math/vec3.js'
import type { Impact } from '../sim/loop.js'
import type { PaddlesCue } from '../sim/paddles.js'
import type { CombatDiagnostics } from './combatReadout.js'
import type { CloudLayer } from '../sim/scenario.js'
import type { ReprojectionResidual } from './scene/cloudPass.js'
import type { CloudTierName } from './scene/clouds.js'
import type { RadarContact, RadarRangeMi } from './radar.js'

/**
 * The shape `window.__ww2` has in a DEV build. `main.ts` writes it, and
 * `tests/e2e/adapter.spec.ts` (Tier 2) reads it -- both sides import this one
 * type rather than each declaring their own copy.
 *
 * Task 15 review, round 1: the two sides previously typed this independently
 * (`main.ts` cast through `unknown`, the spec file redeclared the same shape
 * by hand), so renaming or dropping a field typechecked clean on both sides
 * and only failed at runtime, on the one machine here that cannot run it.
 * Sharing this type turns that into a `tsc --noEmit` error instead.
 *
 * Not present at all outside a DEV build -- see the `import.meta.env.DEV`
 * guard at the call site in `main.ts` for why, and `.gitignore`/the
 * production bundle check in the Task 15 report for confirmation it does
 * not survive `npm run build`.
 */
export type Ww2Diagnostics = {
  readonly reversedDepthBuffer: boolean
  readonly adapter: AdapterVerdict
  readonly validationErrors: readonly string[]
  readonly tick: () => number
  readonly cameraMode: () => CameraMode
  /** Proves a KeyG press reached the player's AircraftState.gearFraction
   *  and therefore the rendered Airframe.setGear path. This mirrors the
   *  controls() diagnostic below: an advancing tick alone cannot prove the
   *  input or render-state wire was exercised. Added by the 2026-09-24
   *  F4F Wildcat default-aircraft plan. */
  readonly gearFraction: () => number
  /** Added in round 1 review: proves the control-deflection phase of the
   *  camera sweep actually reached `frame.controls`, which `tick` advancing
   *  alone cannot (the render loop ticks from `requestAnimationFrame`
   *  regardless of whether a single key was ever delivered). */
  readonly controls: () => Controls
  /** Added in round 1 review: `lookOffsetFromKeys` is a pure snapshot that
   *  snaps back to centre the instant a look key is released
   *  (src/input/lookAround.ts), so proving a look key took effect has to
   *  read this while the key is still held, not after. */
  readonly look: () => LookOffset
  /**
   * Which assists are on (Plan 3 Task 5). Read-only on purpose: Tier 2 flips
   * them the way a pilot does, by pressing the toggle keys in
   * `src/input/bindings.ts`, and reads this to confirm the press landed --
   * exactly the pattern the camera sweep already uses for `KeyC` and
   * `cameraMode()`. A setter here would be a second write path into
   * `FrameState`, bypassing `nextFrameState`, which is the one function that
   * owns how a frame becomes the next frame; the keyboard path is also the one
   * a real pilot uses, so testing it tests something that ships.
   */
  readonly assists: () => AssistSettings
  /**
   * Metres of ground under the airplane, or `null` if no terrain field has
   * reached `World.terrain` yet.
   *
   * Added in Task 10 for one reason: that task loads a heightfield the
   * physics can collide with, and whether it arrived is invisible. The
   * terrain on screen comes from the renderer's own textures, so a
   * `World.terrain` still `null` -- which is what shipped until 2026-09-14 --
   * renders identically and merely means nothing can be hit. Reading a
   * plausible height here (0 over open water, hundreds of metres over Leyte)
   * is the check that the wire exists; the alternative was flying into a
   * mountain and observing that nothing happens either way.
   */
  readonly groundHeightM: () => number | null
  /**
   * The airplane's simulated world position, metres (+x east, +y up,
   * +z south). Added in Task 11, and it does two jobs no other member here
   * can:
   *
   * - **Proves the spawn landed.** Tier 2's terrain tests start the airplane
   *   over Leyte with `?spawnX/Y/Z` (see `spawn.ts`). If that never took
   *   effect the airplane is over open water, every terrain test reports an
   *   empty `validationErrors` list, and it passes for the wrong reason.
   * - **Proves the airplane moved.** `tick()` advances whenever the fixed
   *   step runs, which it does whether or not the airplane is going
   *   anywhere; `groundHeightM()` is flat over a coastal plain. Neither can
   *   stand in for a position that changed.
   *
   * Deliberately the SIMULATED position (the player entity's `state`), not the
   * interpolated render pose: the render pose is the thing under test in a
   * different sense, and a test that read it could pass on a frame that
   * happened to interpolate while the simulation was stalled.
   */
  readonly aircraftPositionM: () => Vec3
  /**
   * The PLAYER aircraft's `impact` for the current frame, or `null` if the
   * flight has not ended yet. Added in Task 11 for the ground-contact plan's
   * Tier 2 coverage, which has to prove the whole production path --
   * `advance` classifying it, the frame holding the world on it (frame.ts's
   * `holding`) and `main.ts` noticing and raising the debrief -- rather than
   * construct an `Impact` and skip most of it.
   *
   * A single granular getter, deliberately NOT `frame: () => FrameState`:
   * every other member here reads one field (or a small derived one) off the
   * current frame, never the frame itself, and a `frame()` getter would
   * widen the whole Tier 2 surface to every field `FrameState` will ever
   * carry for the sake of this one (binding ruling, Task 11). If a later
   * task needs another field, it gets another getter here, the same way
   * `groundHeightM` and `aircraftPositionM` did.
   */
  readonly impact: () => Impact | null
  /**
   * Every ship in the world, by id, with its position on the sea surface and
   * its compass heading (Plan 12).
   *
   * Proving the wire, not the picture, exactly as `aircraftPositionM` does:
   * ships are the first entities that MOVE without the pilot touching
   * anything, and a `stepShip` that never ran, orders that never reached the
   * world, or a hull mesh posed from the wrong index all look identical from
   * a screenshot of an empty sea. A Tier 2 spec reads this twice and checks
   * the task force actually sailed, and that its heading is the bearing it is
   * sailing on.
   *
   * `y` is deliberately absent: it is `SEA_LEVEL_M` for every ship by
   * construction (`ShipState.position`), so reporting it would be reporting a
   * constant as if it were a measurement.
   *
   * `hp` and `sinkingFraction` were added in Plan 6b Task 8, off
   * `World.combat.ships[s.id]` rather than the kinematic entity above: proving
   * a ship's hull mesh actually sinks/lists (`ship.ts`'s `setDamage`) needs
   * the same live damage record `combatReadout.ts` reads for the player's own
   * airplane, and a Tier 2 spec otherwise has no way to tell "still healthy"
   * from "sunk and hidden" without reading pixels.
   */
  readonly ships: () => readonly {
    readonly id: string; readonly x: number; readonly z: number; readonly headingRad: number
    readonly hp: number; readonly sinkingFraction: number
  }[]
  /**
   * Every strike-target structure (airfield buildings, Plan 6b Task 8), by
   * id, with its current hp off `World.combat.structures[id]`. The render-side
   * twin of `ships` above, for the same reason: `airfield.ts`'s `sync`
   * has no other externally observable signal once a building's HP reaches
   * zero and its mesh swaps to rubble (or reverts to intact on Restart).
   */
  readonly structures: () => readonly { readonly id: string; readonly hp: number }[]
  /**
   * Every aircraft in the world, by id, with its simulated position and
   * compass heading.
   *
   * The N-entity view of `aircraftPositionM` above, which stays because it is
   * the PLAYER's and half the Tier 2 suite reads it by that name. What this
   * adds is the wingman: a second parked airplane that `settleOnTerrain` must
   * drop onto the real ground along with the player's, and which -- being
   * chocked and never touched by the pilot -- is also the one entity whose
   * position must not change at all during a flight.
   *
   * `headingRad` was added for Plan 7a: an AI pilot's assigned entity has no
   * other externally observable sign that `controlsForDesiredVelocity`
   * actually turned the airframe, as opposed to the entity simply drifting
   * in a straight line under its spawn velocity -- position alone cannot
   * tell those apart. Derived the same way `ships()`'s `headingRad` is a
   * direct read of `ShipState`, except `AircraftState` carries a full
   * attitude quaternion rather than a scalar, so this is the forward body
   * axis rotated into the world and turned back into the same compass
   * convention `scenario.ts` builds an airborne start's attitude from.
   */
  readonly aircraft: () => readonly {
    readonly id: string; readonly x: number; readonly y: number; readonly z: number; readonly headingRad: number
  }[]
  /**
   * Whether the wheels are currently carrying the airplane -- `supportedContact`
   * (`src/sim/ground.ts`) evaluated against the live frame.
   *
   * Added in Task 13 for the take-off spec, and it is the one member that can
   * tell "left the ground" from "was never on it". Height above the terrain
   * cannot: `position.y` is the body origin, which sits `gear.heightM` above
   * the wheels even while parked, so a spec comparing it to `groundHeightM()`
   * reads as airborne from the instant the page loads.
   *
   * It is also the only outside view of the gate chain Plan 11a got wrong four
   * separate times -- gear down, not arriving too fast, not descending above
   * the speed cap, and the surface being LAND. Those are unit-tested
   * individually; nothing proved the production frame satisfies them while
   * parked on the actual runway.
   *
   * `false` before any terrain field has arrived, which is honest rather than
   * convenient: with `World.terrain` still null there is no ground for the
   * wheels to be on, and a ground spawn is held at zero elapsed time anyway
   * (`FrameState.groundSpawn`). Callers should `waitForTerrain` first.
   *
   * A granular getter, not `frame: () => FrameState` -- the binding ruling on
   * `impact` above applies unchanged.
   */
  readonly supportedContact: () => boolean
  /**
   * Frame intervals in milliseconds since the last `resetFrameTimes()`, in
   * order, capped at `FRAME_TIME_CAPACITY` samples.
   *
   * This is the `now - last` that `main.ts`'s render loop already computes
   * and hands to the dev overlay -- the interval between successive
   * `requestAnimationFrame` callbacks, i.e. wall-clock frame time including
   * the simulation, the scene update, three's draw submission and the
   * present. It is NOT a GPU pass duration.
   *
   * On the reference platform it is pinned at a fixed 10.0 ms cadence and
   * CANNOT carry the frame budget -- see `gpuFrameTimesMs` below, which can.
   * What it is still good for is the complementary question: whether the
   * frame made its deadline at all. An interval that has doubled is a missed
   * frame deadline, which no GPU-side pass duration reports.
   *
   * Recording STOPS at capacity rather than dropping the oldest sample, so
   * "the first N frames after the reset" is exactly what a caller gets and
   * the window is not silently redefined by how long the caller waited.
   */
  readonly frameTimesMs: () => readonly number[]
  /**
   * GPU render-pass durations in milliseconds since the last
   * `resetFrameTimes()`, one sample per resolved frame, capped the same way.
   *
   * This is the frame-time number Task 11's budget is written against, and it
   * exists because `frameTimesMs` above CANNOT carry one on this platform:
   * `requestAnimationFrame` fires every 10.0 ms on the reference desktop
   * whatever Chromium is launched with -- proven 2026-09-14 against a blank
   * page with no WebGPU on it at all, which reported the same 10.0 ms as the
   * game, and against `--disable-gpu` and headless, which also did. It is a
   * browser-side cadence, NOT the display: that monitor runs at 120 Hz
   * (8.33 ms). Design spec section 10 carries the evidence and is the
   * committed home for it -- Task 11's own report lives under the gitignored
   * `.superpowers/` and is not in a fresh clone.
   *
   * Read from WebGPU timestamp queries, so it is the GPU's own clock and
   * knows nothing about the cadence above, vsync, the compositor or the
   * present. It EXCLUDES the simulation, the scene update and three's
   * submission work.
   *
   * **Since 2026-09-24 (photoreal render pass Task 2) each sample is the
   * frame's whole GPU cost: render pool + three's compute pool + native
   * ocean compute.** Before that it was the render pool alone and the ocean
   * FFT was only in `oceanComputeTimesMs`; the photoreal spec §2 budget is
   * "render-pool plus compute-pool", and Phase B adds compute dispatches a
   * render-only number would silently drop. The ocean term is each cascade's
   * most recently measured dispatch (its timer cannot time every one), and a
   * frame is not sampled until every cascade has one. The render pool covers
   * every pass of the RenderPipeline frame: a throwaway 400-read output node
   * raised 4K `low-land-600` p95 from 7.44 to 15.77 ms (Task 2 report).
   * `oceanComputeTimesMs` still reports the ocean alone, so a caller that
   * adds it to these samples counts it twice. Empty if
   * `gpuTimestampsSupported` is false.
   */
  readonly gpuFrameTimesMs: () => readonly number[]
  /** The render-pool part of each `gpuFrameTimesMs` sample alone -- what
   *  `gpuFrameTimesMs` meant before 2026-09-24 -- for the one caller whose
   *  assertion was derived against that meaning and adds
   *  `oceanComputeTimesMs` percentiles itself (ocean.spec.ts). Same window
   *  and capacity; may hold a few more samples (see `gpuFrameTimesMs`). */
  readonly gpuRenderTimesMs: () => readonly number[]
  /** Whether the adapter advertises `timestamp-query`, i.e. whether
   *  `gpuFrameTimesMs()` can ever be non-empty. Distinguishes "this GPU
   *  cannot be timed" from "nothing has been sampled yet", which an empty
   *  array alone cannot. */
  readonly gpuTimestampsSupported: boolean
  /** Discards everything `frameTimesMs()` and `gpuFrameTimesMs()` have
   *  collected and starts a fresh window. The only mutating member of this hook: it writes nothing the
   *  simulation or the renderer reads, unlike the `FrameState` setter
   *  `assists` above deliberately does not offer. */
  readonly oceanTier: () => string
  /**
   * Whether `main.ts`'s `adaptOceanQuality` probe has already resolved this
   * page load -- `true` either because it measured (a fresh profile, once
   * the ~180-frame warm-up window elapses) or because a persisted
   * render-quality choice pre-latched it at boot, per the "probe once ever"
   * rule (design spec §5 step 1). Added in Task 9 (reference-GPU acceptance)
   * because the DEV-override-wins and probe-suppression claims were
   * previously pinned only by a source-text regex on `main.ts` (Task 6
   * review, twice) -- never proven against a real running page. Reading it
   * immediately after `waitForTerrain` on a page load with a persisted
   * choice already in `localStorage` should read `true` well before the
   * ~3 s a fresh profile takes to flip it.
   */
  readonly qualityProbeChecked: () => boolean
  /** `landWeightFromTerrain` at world (x, z), read on the CPU from the SAME
   *  terrain texture the ocean mesh samples for its land weight. 1 over
   *  open water, 0 on land, `null` before the ocean exists. Added
   *  2026-09-18 after the waves vanished for a texture-size mismatch that no
   *  test could see (ocean/mesh.ts `depthNode`). */
  readonly oceanLandWeight: (x: number, z: number) => number | null
  /** The LSO cue for the player, or `null` when there is nothing to signal (Plan 8). */
  readonly paddles: () => PaddlesCue | null
  /** The deck under the player's wheels, or `null` (Plan 8). */
  readonly deck: () => { readonly shipId: string; readonly heightM: number; readonly velocity: Vec3 } | null
  /** The world wind, the velocity of the air; `null` is calm (Plan 8). */
  readonly wind: () => Vec3 | null
  /**
   * The `id` of the scenario `main.ts`'s `bundle` currently holds -- `null`
   * only in the sliver before the FIRST `loadScenario` call resolves (there
   * is no scenario yet to name). Added for the in-place scenario switch
   * (Plan 9 Task 7): unlike `groundHeightM()`, which answers a ONE-TIME,
   * wholly independent question ("has a terrain field arrived yet") that a
   * Tier 2 spec cannot use to detect a scenario switch completing after
   * boot -- terrain, once loaded, stays loaded across every later switch, so
   * a `waitForFunction` on it resolves on its very first poll for a switch
   * requested after that point, whether or not `loadScenario`'s own fetch
   * (and the `rebuildFrame` that follows it) has finished. This is the
   * signal that actually tracks the switch: read it AND wait for it to equal
   * the requested id before trusting `aircraft()`/`ships()` to reflect it.
   */
  readonly scenarioId: () => string | null
  /** Separate GPU compute-pass costs, one sample list per active cascade. */
  readonly oceanComputeTimesMs: () => readonly (readonly number[])[]
  readonly oceanDisplacementSample: (cascade: number) => Promise<{
    timeS: number; values: number[]; phaseSeed: number
    options: import('./ocean/compute.js').OceanComputeOptions
  } | null>
  /** What the audio system is doing, for Tier 2 (tests/e2e/audio.spec.ts).
   *  A granular snapshot, not the system itself -- the binding ruling on
   *  `impact` above applies unchanged. */
  readonly audio: () => AudioSnapshot
  /** The player's guns, every airplane's damage and the live projectile
   *  count (Plan 6), from `World.combat` -- `combatDiagnosticsFor` in
   *  combatReadout.ts. `null` before the first frame exists. */
  readonly combat: () => CombatDiagnostics | null
  /** The radar scope's live state (Plan 17): the currently selected range,
   *  the sweep's current angle, and every contact it is showing. `null`
   *  before the first frame exists, the same guard `impact`/`combat` use. */
  readonly radar: () => { readonly rangeMi: RadarRangeMi; readonly sweepRad: number; readonly contacts: readonly RadarContact[] } | null
  /** The cloud deck in force and its tier (Plan 16a); `off` under the DEV
   *  `?cloudTier=off`, `steps` the cumulus march count at that tier. */
  readonly clouds: () => {
    readonly layers: readonly CloudLayer[]; readonly tier: CloudTierName | 'off'; readonly steps: number
    /** Plan 16b: whether the shadow pass runs, its taps per layer, and the map's side. */
    readonly shadow: { readonly enabled: boolean; readonly taps: number; readonly mapSideM: number }
    /** Photoreal Task 4: frames the cloud pass resolved WITHOUT history since
     *  boot (first frame, resizes, every discontinuity reset); 0 with no pass. */
    readonly historyResets: number
  }
  /** Photoreal Task 6: explicit TRAA (and world-fixed motion) history resets
   *  since boot -- the same discontinuities the cloud history resets on. */
  readonly antiAliasing: () => { readonly historyResets: number }
  /** Plan 16b: the shadow map's transmittance at a sea-level world point, or
   *  null outside the map / with the pass off. A fixed point must read the
   *  same from any eye position: the map is world-anchored, not eye-anchored. */
  readonly cloudShadowAt: (x: number, z: number) => Promise<number | null>
  /** Photoreal Task 4 fix round 1: the cloud resolve's reprojection residual
   *  on the next rendered frame, for the correct mapping and two deliberately
   *  wrong ones (`ReprojectionResidual`, cloudPass.ts); null with no pass. */
  readonly cloudReprojectionResidual: () => Promise<ReprojectionResidual | null>
  /** Plan 17 DEV diagnostic: the radar scope's green-channel brightness at
   *  a given (bearingRad, rangeMi), read back the same way
   *  `cloudShadowAt` proves the cloud shadow map -- a direct pixel
   *  readback, not an inference from a screenshot. `null` outside the
   *  currently selected range. */
  readonly radarPixelAt: (bearingRad: number, rangeMi: number) => Promise<number | null>
  /** Plan 16c: the apparent solar hour in force this frame, the sun's
   *  elevation and azimuth (degrees, azimuth from north clockwise) and the
   *  unit direction toward it in the world frame (+z south). */
  readonly sun: () => { readonly timeOfDay: number; readonly elevationDeg: number; readonly azimuthDeg: number; readonly direction: { readonly x: number; readonly y: number; readonly z: number } }
  readonly resetFrameTimes: () => void
}

/**
 * How many samples `frameTimesMs` and `gpuFrameTimesMs` each hold after a
 * reset.
 *
 * 4,096 is ~41 s at the reference platform's 10.0 ms cadence, comfortably
 * more than the budget test's window, and bounds each array to 32 KB for a
 * session that never resets at all.
 */
export const FRAME_TIME_CAPACITY = 4096
