import { Group, PerspectiveCamera, Scene } from 'three'
import { positionWorld } from 'three/tsl'
import { initRenderer, normalizeGpuError } from './renderer.js'
import { showFailure, type FailureKind } from './failure.js'
import { buildScenarioEntities, type ScenarioEntities } from './scenarioEntities.js'
import { createRafLoop, type RafLoop } from './rafLoop.js'
import { CAMERA_VFOV_DEG, cameraTransformFor, type CameraMode } from './camera.js'
import { makeTextTexture } from './scene/text.js'
import { finestFetchedLevelFor, SCENARIO_ID } from './content.js'
import { createBootQuality } from './bootQuality.js'
import type { QualityTierName } from './quality.js'
import { createOverlay } from './overlay.js'
import { createLegend } from './legend.js'
import { createAudioSystem } from '../audio/system.js'
import { createWebAudioBackend } from '../audio/webAudio.js'
import { audioInputsFrom } from './audio.js'
import { createFlightData } from './flightData.js'
import { createTimeBadge } from './timeBadge.js'
import { createPauseBadge } from './pauseBadge.js'
import { createPaddlesBadge } from './paddlesBadge.js'
import { createDebrief, debriefModel, destructionModel, killsSince, landingModel, type DebriefModel } from './debrief.js'
import { CLOSED_NAVIGATION_MAP, closeNavigationMap, createMissionMap, openNavigationMap, selectNavigationDestination } from './missionMap.js'
import { createImpactEffect } from './scene/impactEffect.js'
import { createTitleScreen, DEFAULT_LOADOUT, isKnownScenarioId } from './titleScreen.js'
import { applyMissionResultToRoster, loadRoster, saveRoster } from './roster.js'
import { zeroKillsByType, type TargetType } from '../sim/weapons/targetType.js'
import { CLOUD_TIERS, cloudDebugFromQuery, cloudTierFromQuery, createClouds, type CloudTierName } from './scene/clouds.js'
import { createCloudPass, type CloudPass } from './scene/cloudPass.js'
import { shouldResetHistory } from './scene/cloudHistory.js'
import { createCloudField } from './scene/cloudField.js'
import { MAP_SIDE_M, cloudShadowFromQuery, createCloudShadow } from './scene/cloudShadow.js'
import { loadSkyNoise } from './sky/load.js'
import { DEFAULT_TIME_OF_DAY, sunClock, sunDirectionWorld, sunPosition, timeOfDayFromQuery } from './sky/sun.js'
import { atmospherePalette, warmIrradianceTable } from './sky/palette.js'
import { atmosphereFromQuery, disposeAtmosphereLuts, getAtmosphereLuts, type AtmosphereLutName } from './sky/atmosphereLuts.js'
import type { CloudLayer } from '../sim/scenario.js'
import { createTracers } from './scene/tracers.js'
import { createHitFlashes, NO_FLASH_MEMORY, nextHitFlashes, type FlashMemory } from './scene/hitFlash.js'
import { createOrdnance, nextOrdnanceImpacts, NO_ORDNANCE_MEMORY, type OrdnanceMemory } from './ordnance.js'
import { combatDiagnosticsFor, createCombatReadout } from './combatReadout.js'
import { radarContacts, radarSweepAngle, cycleRadarRange, RADAR_RANGES_MI, type RadarContact, type RadarRangeMi } from './radar.js'
import { BINDINGS } from '../input/bindings.js'
import {
  airframeVisibilityFor,
  initialFrameStateFor,
  nextFrameState,
  settleOnTerrain,
  toThreeOrientation,
  worldOffsetFor,
  type FrameState, withPaused, acknowledgeLanding,
} from './frame.js'
import { createOcean, landWeightAt, recentreOcean } from './ocean/mesh.js'
import { loadDepth, type DepthField } from './ocean/depth.js'
import { beaufortFromQuery, oceanTimeFromQuery, seaStateFor } from './ocean/weather.js'
import { createOceanCompute, type OceanCompute } from './ocean/compute.js'
import { OCEAN_TIERS, oceanTierFromQuery, tierForFrameTimeMs } from './ocean/tiers.js'
import { cascadeOptions } from './ocean/bands.js'
import { OCEAN_EXTENT_M } from './horizon.js'
import { createRunway } from './scene/runway.js'
import { createAirfield } from './scene/airfield.js'
import { createTowns, type Town } from './scene/towns.js'
import { createVegetation, coverLookup, type CoverLookup } from './scene/vegetation.js'
import placesData from '../../content/scenery/places.json' with { type: 'json' }
import { createSky } from './scene/sky.js'
import { applySun, createLighting } from './scene/lighting.js'
import { createTerrainMesh } from './terrain/mesh.js'
import { applyTerrainLevel, loadTerrainProgressively, TERRAIN_HEADER } from './terrain/load.js'
import { createPanel, resizePanel, updatePanel } from './scene/panel.js'
import { createRadarScope } from './scene/radarScope.js'
import { loadScenarioBundle } from './scenarioLoad.js'
import { worldFromScenario, type ScenarioBundle } from '../sim/scenario.js'
import { buildStructures } from '../sim/weapons/structures.js'
import type { Loadout } from '../sim/weapons/stores.js'
import { step, DT } from '../sim/flight/model.js'
import { stepChecked } from '../sim/invariants.js'
import type { TerrainField } from '../sim/world/terrain.js'
import { supportedContact } from '../sim/ground.js'
import { groundUnder } from '../sim/world/ground.js'
import { deckOf, decksOf } from '../sim/world/deck.js'
import { paddlesCue, type PaddlesCue } from '../sim/paddles.js'
import { playerAircraft, withAircraftState, type World } from '../sim/loop.js'
import { NEUTRAL } from '../input/keyboard.js'
import { LOOK_CENTRE } from '../input/lookAround.js'
import { DEFAULT_ASSIST_SETTINGS } from '../assists/index.js'
import {
  hasSpawnOverride,
  initialAircraftState,
  pilotSkillFromQuery,
  scenarioIdFromQuery,
  spawnPositionFromQuery,
} from './spawn.js'
import { GREEN_SKILL, VETERAN_SKILL } from '../sim/ai/pilot.js'
import { v3, type Vec3 } from '../sim/math/vec3.js'
import { qFromAxisAngle, qRotate } from '../sim/math/quat.js'
import { FRAME_TIME_CAPACITY, type Ww2Diagnostics } from './diagnostics.js'
import { antiAliasingFromQuery, createFramePipeline, sharpenFromQuery } from './pipeline.js'
import { exposureFor, toneMapFromQuery } from './exposure.js'
import { loadCover } from './landcover/load.js'

// index.html always contains #app -- it is the mount point the script tag is
// loaded from, so this assertion is safe at the entry point.
const root = document.getElementById('app')!

// Accumulated by the `renderer.onError` handler wired below. Exposed (DEV
// builds only) on `window.__ww2.validationErrors` near the top of `boot`,
// below -- the harness in tests/e2e/adapter.spec.ts reads this exact array,
// not a copy.
//
// Residual gap, named rather than fixed (Task 15 review, round 1):
// `initRenderer` (renderer.ts) calls `renderer.init()` internally, which is
// where WebGPUBackend wires `device.onuncapturederror` -- but `renderer.onError`
// below is not assigned until after `initRenderer` already returned. A
// validation error raised inside that window reaches three's default
// `onError` (a console.error) instead of this array. Wrapping the first
// frame in `pushErrorScope('validation')`, as this task's brief first
// suggested, would not close this either -- the scope would need pushing
// inside `initRenderer`, before `renderer.init()`'s own device setup, not
// around the first application frame. That window holds only device and
// canvas configuration, no draw calls, so it is narrow and not worth chasing
// here -- but it is real, so it is named rather than left for someone else
// to rediscover.
const validationErrors: string[] = []

/**
 * Frame intervals, milliseconds, since the last `window.__ww2.resetFrameTimes()`
 * -- the same `now - last` the dev overlay already shows, collected so Tier 2's
 * frame-budget test can take a percentile over a fixed window instead of
 * reading one number off a screenshot. Stops at `FRAME_TIME_CAPACITY` rather
 * than dropping the oldest sample; `diagnostics.ts` says why.
 *
 * Module scope, beside `validationErrors` and for the same reason: the
 * diagnostics hook is installed near the top of `boot` and the producer is
 * `frameFn`, far below it.
 */
const frameTimesMs: number[] = []

/**
 * GPU frame durations, milliseconds, since the last
 * `window.__ww2.resetFrameTimes()` -- one sample per resolved frame, from the
 * WebGPU timestamp queries `initRenderer`'s `trackTimestamp` turns on in DEV.
 *
 * Separate from `frameTimesMs` above because they measure different things
 * and only one of them is measurable on this platform: the frame INTERVAL is
 * pinned at a fixed 10.0 ms cadence no matter what Chromium is launched with
 * (measured 2026-09-14, playwright.config.ts's CHROMIUM_ARGS comment), so it
 * can say "we made the deadline" and nothing more. That cadence is NOT the
 * display -- the monitor runs at 120 Hz, and the same 10.0 ms appears with
 * the GPU disabled and headless, so it is Chromium's own; design spec
 * section 10.2 has the evidence. This one is the GPU's own clock and does
 * not know any of that exists: render pool + compute pool + native ocean
 * compute per frame since 2026-09-24 (diagnostics.ts has the detail).
 */
const gpuFrameTimesMs: number[] = []

/**
 * The render-pool part of each `gpuFrameTimesMs` sample on its own, which is
 * what `gpuFrameTimesMs` itself held until 2026-09-24. Kept because the
 * one-time ocean probe (`adaptOceanQuality`) was derived against it and adds
 * the ocean's compute percentiles itself; handing it the combined samples
 * would count compute twice. Also the sampling window's capacity counter:
 * a combined sample can be skipped (see the resolve below), this one cannot.
 */
const gpuRenderTimesMs: number[] = []

/** Purely visual: gauges.ts explains why no tachometer is fitted -- there is
 *  no modeled engine RPM to drive it honestly. This spins the prop mesh at an
 *  arbitrary rate scaled by throttle (see hellcat.ts's comment on why `prop`
 *  is a separate mesh); it confirms throttle reaches the frame state, not
 *  that it reaches the simulation -- a bug that stopped `frame.controls` from
 *  reaching `advance` would leave the prop spinning at the correct rate with
 *  nothing driving the airplane (Task 13 review, measured 2026-09-13). It is
 *  not a claim about real RPM and never appears on the instrument panel. */
const PROP_MAX_RAD_PER_SEC = 40

async function boot(): Promise<void> {
  /**
   * Where the player's airplane starts, once the scenario has been read --
   * `null` until then, which is a real stretch of wall-clock time because the
   * bundle is five fetches (`loadScenarioBundle`, below). `let` and nullable
   * rather than a `const` declared here, because the DEV diagnostics hook is
   * installed further down but BEFORE the bundle resolves and closes over
   * this binding: a `const` declared after it would be read from its temporal
   * dead zone, which optional chaining does not guard -- the exact fault the
   * `vegetation` declaration a few dozen lines down carries a comment about,
   * found live in the deployed bundle on 2026-09-18.
   */
  let spawnPosition: Vec3 | null = null
  // Plan 16a, read by the DEV hook's `clouds()` below, which is installed
  // before the scenario resolves -- the same early-binding rule as
  // `spawnPosition`. Assigned where the clouds are created.
  let cloudLayers: readonly CloudLayer[] = []
  let cloudTier: CloudTierName | 'off' = 'high'
  /**
   * The scenery tier in force, which `vegetation` is the only consumer of --
   * and `vegetation` does not exist until terrain level `finestFetchedLevel`
   * arrives, long after a Settings pick or the GPU probe can first move this.
   * Held here so the value survives that gap: `createVegetation`'s own
   * `setTier` call below reads THIS, rather than `oceanTier.name`, which is
   * what makes Advanced's three rows genuinely independent (spec §4) instead
   * of scenery silently tracking the ocean.
   */
  let sceneryTier: QualityTierName = 'high'
  // Plan 16c, read by the DEV hook's `sun()` below; assigned at boot and
  // every frame. Apparent solar time.
  let scenarioTimeOfDay = DEFAULT_TIME_OF_DAY
  let sunState = { timeOfDay: DEFAULT_TIME_OF_DAY, elevationDeg: 90, azimuthDeg: 180, direction: { x: 0, y: 1, z: 0 } }
  /** Photoreal Task 9 fix 2: the boot-time irradiance table build, ms (DEV readout). */
  let irradianceTableMs: number | null = null
  // Plan 17, read by the DEV hook's `radar()` below and by Task 3's render
  // code; assigned every frame in the render loop, the same hoist-and-
  // reassign shape `sunState` above uses so both the loop and this closure
  // see the latest value.
  let radarSweepRad = 0
  let radarContactList: readonly RadarContact[] = []
  // Plan 6b Task 9: the picker's choice, read by `buildWorld` (below) on
  // every call -- boot's own included, not only Restart's -- so it doubles
  // as "remembered across a Restart" (spec §5: "Restart rebuilds stores from
  // the same loadout") with no separate plumbing. Starts at the picker's own
  // default so a click landing before `frame` exists (the several awaits
  // between here and its first assignment give the browser plenty of chance
  // to paint and take one) needs nothing further: that first `buildWorld`
  // call below just reads whatever this already holds.
  let chosenLoadout: Loadout = DEFAULT_LOADOUT
  /**
   * The pilot roster and this life's scoring baseline (Plan 9 Task 6),
   * hoisted here rather than left at their Task 6 narrative position (by
   * `bankMissionResult`, further down) for the exact reason `chosenLoadout`
   * just above is: the `onNewGame` closure just below reads and reassigns
   * all three on every New Game, and that closure is reachable the instant
   * the title paints -- long before `boot`'s own several `await`s (the
   * renderer, the initial scenario fetch, sky noise, the ocean cascades, the
   * depth field) finish running. A `let` declared at its OLD narrative
   * position, well after those awaits, sat in its temporal dead zone for
   * that whole stretch: any New Game click landing in it -- trivially
   * reachable by a scripted Tier 2 test, and not implausible for a fast
   * player -- threw `ReferenceError: Cannot access 'roster' before
   * initialization` out of `onNewGame`'s very first statement, silently
   * aborting the ENTIRE New Game action (a scenario switch included) with
   * nothing to show for it but an uncaught exception in the click handler.
   * Found 2026-09-24 via `scenarioPicker.spec.ts`'s "return to title" test on
   * the reference GPU: the switch looked like it silently no-op'd, and every
   * individual piece of `loadScenario`/`rebuildFrame`/`buildWorld` read
   * correct in isolation, because the actual fault was never reached --
   * `onNewGame` crashed before any of that code ran at all.
   * `currentPilotId` is `null` until `onNewGame` fires (no roster flow
   * reachable yet, or a dev-URL bypass), which is exactly
   * `bankMissionResult`'s own no-op guard below.
   */
  let roster = loadRoster()
  let currentPilotId: string | null = null
  /**
   * The player's `killsByType` as of the last bank -- a landing/ditching/
   * death that already scored them. Reset to zero on every New Game and every
   * Restart (both start a new life for scoring purposes); NOT reset by
   * Continue, so a landing followed by more flying and a second landing
   * banks only the kills since the first, via `killsSince` (debrief.ts),
   * rather than re-banking the whole flight's cumulative total. Hoisted
   * alongside `roster`/`currentPilotId` above, for the same reason.
   */
  let scoredThroughKillsByType = zeroKillsByType()
  // `Scene()`'s constructor has no side effects of its own (confirmed when
  // this was first moved, pre-Task-7-round-2, a little later than here), so
  // hoisting it further, alongside `loadScenario` below which needs it to
  // exist, changes nothing observable.
  const scene = new Scene()
  // Plan 9 Task 7 round 2: hoisted together with `loadScenario` just below,
  // for the same TDZ reason as `roster` above and `frame`/`audio`/
  // `buildWorld` further down -- `loadScenario`'s only unguarded call site
  // is `onNewGame`'s different-scenario branch (`void
  // loadScenario(scenarioId, loadout).then(rebuildFrame).catch(...)`, no
  // `if (frame)` or equivalent around the call itself, unlike `buildWorld`),
  // and `loadScenario` WRITES to all four of these, which needs them out of
  // their own temporal dead zone too -- assigning to a `let` still in TDZ
  // throws exactly the same as reading one. Confirmed live 2026-09-24: a
  // scripted fast click choosing a different scenario threw `ReferenceError:
  // Cannot access 'loadScenario' before initialization` consistently,
  // landing in the same narrow window (between the title painting and
  // `initRenderer`'s `await` resolving) that exposed `frame`/`audio`.
  let bundle: ScenarioBundle | null = null
  // Read once, right after the FIRST `loadScenario` call below, for `spec`:
  // every scenario flies the one shipped flight model, `f6f-hellcat` (design
  // doc §5, `content/scenarios/*.json` spec fields, unchanged by Task 6 --
  // only the RENDERED mesh is now the Wildcat, via `loadWildcat()`), so
  // nothing else ever needs a later scenario's world.
  let scenarioWorld: World<undefined> | null = null
  let spawnedAt: Vec3 | null = null
  // `airframes`/`shipHandles`/`smokes`/`player`, together --
  // `buildScenarioEntities`'s own doc comment (`scenarioEntities.ts`) has the
  // construction and disposal reasoning.
  let scenarioEntities: ScenarioEntities | null = null
  // DEV `?spawnX/Y/Z` moves the PLAYER into the air instead of wherever the
  // scenario parks it (spawn.ts) -- a pure function of the URL, so unlike
  // `spawnedAt` (which needs each scenario's own parked position) it is the
  // same on every `loadScenario` call and is computed once, here.
  const override = import.meta.env.DEV && hasSpawnOverride(window.location.search)
  // DEV `?pilotSkill=green|veteran` (spawn.ts) forces every AI pilot's skill
  // in whatever scenario loads, overriding whatever `pursuit-range.json` (or
  // any future scenario) pins in content -- same "computed once, applies to
  // every `loadScenario` call" reasoning as `override` above, since it too
  // is a pure function of the URL rather than of the scenario just fetched.
  const forcedPilotSkill = import.meta.env.DEV ? pilotSkillFromQuery(window.location.search) : undefined
  /**
   * Fetches one scenario's content bundle and rebuilds everything sized to
   * its entity lists: `scenarioWorld` (read once, below, for the player's
   * aircraft spec), the spawn point, and `scenarioEntities` --
   * `airframes`/`shipHandles`/`smokes`/`player`
   * (`buildScenarioEntities`, `scenarioEntities.ts`). Terrain, ocean and sky
   * are NOT rebuilt here (design doc §5: every scenario sits in the same
   * Leyte Gulf tangent plane, so none of that is scenario content), and
   * neither is the panel -- it is per-PLAYER, not per-entity-count, and
   * every scenario flies the one shipped airframe, so it is left exactly as
   * a loadout change already leaves it (the title's `onNewGame`, below).
   *
   * Any of the five files a bundle fetches failing to load or failing
   * validation is the same fault and the same screen a missing
   * `f6f-hellcat.json` was before Plan 12 -- content the build was supposed
   * to ship. The message names the file. `id` is assumed already resolved
   * and whitelisted (`requestedScenarioId`/`isKnownScenarioId`, above and in
   * `titleScreen.ts`); this function does not re-check it.
   *
   * The FIRST call (boot's own, a little further down) is a pure relocation
   * of what boot() always did at this point. A REPEAT call -- the title's
   * `onNewGame`, when the picked scenario differs from what is loaded --
   * additionally disposes every mesh the previous call built, via
   * `buildScenarioEntities`'s own `previous` parameter; `scenarioEntities`
   * starts `null` so that disposal is skipped, not a no-op loop, the first
   * time.
   *
   * Being hoisted and callable this early does NOT mean it is called with
   * anything sensible this early -- a click landing before boot's own
   * initial call, further down, has just as much claim to run first. Both
   * calls are independent and internally consistent (each captures its own
   * `nextBundle`/`nextScenarioWorld` before writing the shared `let`s), so
   * the result is a last-write-wins race over WHICH scenario ends up
   * loaded, not a crash -- a real but far smaller problem than the
   * `ReferenceError` this hoist replaces, and not one this round's evidence
   * showed a practical way to trigger (every reference-GPU run has boot's
   * own call resolve first).
   */
  const loadScenario = async (id: string, loadout: Loadout): Promise<void> => {
    const nextBundle = await loadScenarioBundle(id)
    const nextScenarioWorld = worldFromScenario(nextBundle, null, loadout)
    // The scenario says where the player is parked; the DEV override above
    // moves it into the air instead. The airplane is then not `parked`, so
    // it gets the airborne posture `initialAircraftState` has always given
    // an override -- but the frame's own `groundSpawn` stays true, because
    // the CHOCKED WINGMAN is still parked and still needs the terrain hold,
    // which is what keeps it from being stepped off its placeholder altitude
    // while the override flies. `settleOnTerrain` then settles the wingman
    // alone, since it only touches entities with `parked` set.
    const parkedAt = playerAircraft(nextScenarioWorld).state.position
    const nextSpawnedAt = override ? spawnPositionFromQuery(window.location.search, parkedAt) : parkedAt

    bundle = nextBundle
    scenarioWorld = nextScenarioWorld
    spawnedAt = nextSpawnedAt
    // The nullable binding the diagnostics hook above closes over, now that
    // there is an answer to put in it.
    spawnPosition = nextSpawnedAt
    scenarioEntities = await buildScenarioEntities(scene, nextScenarioWorld, scenarioEntities)
  }
  /**
   * The live flight, `null` until boot's own first `initialFrameStateFor`
   * call (well below) produces one. Hoisted here for the same reason
   * `roster` above is: `onNewGame`'s closure (just below) reads and
   * reassigns it, and is reachable the instant the title paints, before
   * `frame` used to be declared. Already nullable and guarded with `if
   * (frame)` everywhere it is touched in this closure, so the hoist alone is
   * a complete fix -- unlike `bundle` (see `buildWorld`'s comment below),
   * `frame` needs nothing from an intervening `await` to be SAFELY `null`.
   */
  let frame: FrameState | null = null
  /**
   * The render loop, `null` until boot starts it (well below, `loop =
   * createRafLoop(frameFn)`). Hoisted for the same reason as `frame` above:
   * `onNewGame`'s different-scenario branch's `.catch` handler reads it
   * (`loop?.stop()`) if `loadScenario` rejects -- a real, if rarer, path
   * than the happy one (a genuine content-load failure, not just a fast
   * click), and one this round found by tracing every identifier
   * `onNewGame` touches rather than by reproducing it live. `deviceLost`
   * and wiring `renderer.onDeviceLost` stay at their original position
   * (search `let deviceLost`) -- both need `renderer`, which cannot itself
   * be hoisted before `initRenderer`'s `await` produces it, so only this
   * bare, already-`?.`-guarded declaration moved.
   */
  let loop: RafLoop | null = null
  /**
   * Hoisted for the same reason as `frame` just above: `onNewGame` calls
   * `audio.resume()` unconditionally, first thing, and `createAudioSystem`/
   * `createWebAudioBackend` construct the browser's Web Audio context (see
   * `webAudio.ts`, the one file allowed to name that API directly) with no
   * dependency on anything computed between here and where this used to be
   * declared (right before `audio.load()` kicks off the clip fetches, which
   * stays there -- see that comment below for why only the fetch, not the
   * construction, needs to stay put).
   */
  const audio = createAudioSystem(createWebAudioBackend())
  /**
   * The world a flight starts from: the scenario's, with this page load's
   * terrain and the DEV spawn override applied. Called once at boot with no
   * terrain, and again by Restart with whatever level has loaded by then --
   * which is why it rebuilds from `bundle` rather than closing over one
   * world, exactly as the old restart path rebuilt from `initialFrameState`.
   * Reads `bundle`/`spawnedAt` fresh (Plan 9 Task 7): both are reassigned by
   * `loadScenario`, so a Restart or a same-scenario loadout change after a
   * scenario switch rebuilds from whichever scenario is CURRENTLY loaded,
   * not whichever one this closure first closed over.
   *
   * `worldFromScenario` is handed `null` and the field injected afterwards,
   * deliberately: with a real field it re-runs `assertLoopOverWater` over
   * every ship's loop, which is a Tier 1 assertion on every commit
   * (`tests/sim/scenario.test.ts`) and has no business throwing in a browser
   * -- least of all out of the Restart button.
   *
   * `chosenLoadout` (Plan 6b Task 9), not a parameter: reading it here rather
   * than closing over one value at Restart-handler creation time is what
   * makes the same call site serve boot, a title-screen loadout change and
   * every future Restart -- whichever loadout was last chosen, not
   * necessarily the one in effect when this arrow function was defined.
   *
   * Hoisted here, alongside `frame`/`audio`, for the identical TDZ reason --
   * `rebuildFrame`, inside `onNewGame` below, calls this. UNLIKE `frame`/
   * `audio`, this function's body dereferences `bundle!`/`spawnedAt!` with
   * non-null assertions that are only true once boot's own initial
   * `loadScenario` call (well below, a real network fetch) has resolved --
   * moving `buildWorld`'s OWN declaration earlier does not make that any
   * more true. What actually protects this: every call site --
   * `rebuildFrame` here, and `rebuildFrame` again inside the different-
   * scenario branch's `.then()` -- is reached only through `if (frame)`,
   * and `frame`'s own first real assignment (below, `frame =
   * initialFrameStateFor(buildWorld(null))`) cannot execute before `bundle`
   * is already populated, because that line is textually and causally after
   * the initial `loadScenario` call. So `frame` staying `null` (its hoisted
   * default) until boot legitimately sets it is what keeps `buildWorld` from
   * ever running against a still-`null` `bundle` -- this hoist removes the
   * ReferenceError `buildWorld` itself could otherwise throw merely by being
   * REFERENCED (not called) before its old declaration point, but does not
   * change, and does not need to change, the separate invariant that
   * actually keeps it from being CALLED too early.
   */
  const buildWorld = (terrain: TerrainField | null): World<undefined> => {
    const w = worldFromScenario(bundle!, null, chosenLoadout)
    // `forcedPilotSkill` replaces whatever skill the scenario's own content
    // pinned (e.g. pursuit-range.json's `veteran`) on every entity that has
    // a pilot at all; entities with no `pilot` (the player, any unpiloted
    // aircraft) are untouched. `undefined` (production, or DEV with no
    // `?pilotSkill=`) leaves `w.aircraft` byte-for-byte, same as `override`
    // leaving `withTerrainField` untouched below.
    const skilledAircraft = forcedPilotSkill
      ? w.aircraft.map((a) =>
          a.pilot ? { ...a, pilot: { ...a.pilot, skill: forcedPilotSkill === 'veteran' ? VETERAN_SKILL : GREEN_SKILL } } : a,
        )
      : w.aircraft
    const withTerrainField = {
      ...w,
      aircraft: skilledAircraft,
      terrain,
      structures: buildStructures(w.airfields, terrain),
    }
    return override
      ? withAircraftState(
          {
            ...withTerrainField,
            aircraft: withTerrainField.aircraft.map((a) => (a.id === w.player ? { ...a, parked: false } : a)),
          },
          w.player,
          initialAircraftState(spawnedAt!, false),
        )
      : withTerrainField
  }

  // Plan 17 follow-up: which scenario this boot loads, resolved and
  // whitelisted before the title screen exists so the scenario picker can
  // preselect it. `?scenario=` now reaches production too -- the DEV-only
  // gate that used to sit here is gone, and `isKnownScenarioId` is what
  // makes that safe: any format-valid id that is not one of
  // `SCENARIO_OPTIONS`'s five fails here, before anything else loads,
  // rather than reaching `loadScenarioBundle` and failing on a missing file.
  // This one synchronous check does not touch the "title screen before
  // anything slow" ordering below -- there is nothing to await here.
  let requestedScenarioId: string
  try {
    requestedScenarioId = scenarioIdFromQuery(window.location.search, SCENARIO_ID)
    if (!isKnownScenarioId(requestedScenarioId)) {
      throw new Error(`scenario: ${JSON.stringify(requestedScenarioId)} is not a scenario this build ships`)
    }
  } catch (err) {
    showFailure(root, 'bad-content', err instanceof Error ? err.message : String(err))
    return
  }

  /**
   * The Settings dialog's model and the boot sequence's side of it
   * (`bootQuality.ts`, Task 6; design spec
   * `docs/superpowers/specs/2026-09-24-render-quality-selector-design.md` §5).
   *
   * Built HERE, above `createTitleScreen`, and handed to it as its fourth
   * parameter -- that argument is the whole feature. Without it `titleScreen`
   * builds its own default model, every pick still saves to localStorage, the
   * checkmarks still move, and nothing in the game ever changes tier: a
   * silent failure with a completely correct-looking UI. It is also read
   * before the first tier-dependent object is built (the ocean cascades, the
   * clouds, the terrain's level floor) and bound to the live setters further
   * down, once those objects exist.
   */
  const quality = createBootQuality()
  // Spec §5 step 1: a saved choice means the probe (`adaptOceanQuality`,
  // below) never runs at all -- the "probe once ever" rule -- so this starts
  // pre-latched in that path rather than the probe measuring and then
  // discarding its own result.
  //
  // Declared HERE, immediately beside `quality`, rather than down next to
  // `adaptOceanQuality` where it used to live (Task 9 review): the `__ww2`
  // DEV hook exposes this variable (`qualityProbeChecked`, below), and that
  // hook is built well before this point in `boot()` used to be reached --
  // exactly the "read a `let` before its own declaration has run" bug class
  // that already crashed `onNewGame` for real during Plan 9 (see this repo's
  // `tests/e2e/harness.ts`, `waitForScenario`'s doc comment). Hoisting the
  // declaration removes the hazard structurally instead of relying on every
  // future reader re-deriving that no caller happens to invoke the hook that
  // early.
  let qualityChecked = quality.probeSuppressed
  // Captured once per page load, before any object depends on it: the terrain
  // pyramid's floor cannot change mid-flight, which is what the dialog's
  // `ASSET_QUALITY_EFFECT_NOTE` tells the player. Nothing persisted means
  // `content.ts`'s `INTERIM_ASSET_QUALITY_TIER` (L1), not the spec's eventual
  // `'medium'` (L0) -- see that constant, and `BootQuality.assetQuality`.
  const finestFetchedLevel = finestFetchedLevelFor(quality.assetQuality)

  // The title screen (2026-09-19), created before anything that can take
  // real time: the adapter, the ocean cascades and the terrain all load
  // behind it. A boot failure empties #app (failure.ts), which takes the
  // overlay with it.
  //
  // CORRECTION 2026-09-24: this comment used to claim `frame`/`audio`/
  // `buildWorld` were declared below and safe to read here because a click
  // "cannot happen before the page has painted." That reasoning was false --
  // painted and clickable is exactly what the title is the instant
  // `createTitleScreen` returns, several real `await`s before this file used
  // to declare any of those three, and `roster`/`currentPilotId`/
  // `scoredThroughKillsByType` had the identical bug (see their own comment
  // above) confirmed live via a `ReferenceError` a fast click actually threw
  // on the reference GPU. All six are hoisted above this call now, for
  // exactly that reason -- see their own comments for what each one needed.
  const title = createTitleScreen(root, requestedScenarioId, (loadout, scenarioId, pilotId) => {
    chosenLoadout = loadout
    // Reload fresh rather than trust whatever boot-time (or previous-flight)
    // `roster` this closure already held: `titleScreen.ts`'s own `start()`
    // already called `startSortie` and `saveRoster` for exactly this pilot
    // before invoking this callback (Plan 9 Task 5) -- re-reading here is
    // what picks that write up. This is a NEW life for scoring purposes, so
    // the baseline resets to zero same as Restart does below; see this
    // plan's own "Ruling" section for why calling `startSortie` again here
    // would double-count it (never do that in this callback).
    roster = loadRoster()
    currentPilotId = pilotId
    scoredThroughKillsByType = zeroKillsByType()
    // A click is the user gesture the autoplay policy wants; this is the
    // first-visit resume the audio handoff left open. Called unconditionally
    // and BEFORE either branch below, for the same reason the keydown
    // listener's own comment gives: the autoplay policy ties the gesture to
    // THIS task, not to a promise chain, so calling it after `loadScenario`
    // resolves (the different-scenario branch, just below) would spend the
    // gesture on a fetch instead of the click that produced it.
    void audio.resume()
    // `frame` may already exist by the time this fires, built with whatever
    // `chosenLoadout` (and, after a scenario switch, `bundle`) held at THAT
    // point -- rebuild it exactly like Restart does below, rather than only
    // unpausing, so a changed selection actually reaches the stores.
    // `buildWorld` is declared further down this function but, like `frame`
    // itself, is always initialised by the time a real click can reach this
    // closure -- the same forward-reference this file already relies on for
    // `spawnPosition` and `cascades`.
    const rebuildFrame = (): void => {
      if (frame) {
        const rebuilt = initialFrameStateFor(buildWorld(frame.world.terrain), frame.assists)
        frame = rebuilt.groundSpawn && rebuilt.world.terrain !== null
          ? settleOnTerrain(rebuilt, rebuilt.world.terrain)
          : rebuilt
        frame = withPaused(frame, false)
        // Whole-branch review C-1: `resetFlightUi` (declared below, alongside
        // the state it clears -- see its own doc comment) is a forward
        // reference exactly like `buildWorld` above, and is safe for the
        // identical reason: nothing between `frame`'s own first assignment
        // and `resetFlightUi`'s declaration ever awaits, so by the time any
        // click can actually reach this closure both are long since
        // initialized. Without this call, a "Return to title" -> New game
        // left `landingShown` (and the impact/destruction tick guards)
        // latched from the PREVIOUS flight's debrief, so the next landing's
        // own `!landingShown` gate silently never fired again -- no debrief,
        // no bank, for the rest of the page's life. Runs on both branches
        // through `onNewGame`: called directly here for a same-scenario
        // rebuild, and via `.then(rebuildFrame)` for a scenario switch.
        resetFlightUi()
      }
    }
    if (scenarioId !== requestedScenarioId) {
      // Plan 9 Task 7: a different scenario can carry a different ENTITY
      // LIST (aircraft, ships), which used to mean a full page reload
      // (`window.location.href = ?scenario=<id>`) because `airframes`/
      // `shipHandles` were built once at boot. `loadScenario` now disposes
      // whatever is currently loaded and rebuilds them in place (design doc
      // §5) -- terrain, ocean and sky are untouched, since none of that is
      // scenario content. `requestedScenarioId` is updated FIRST so a
      // second pick compares against the scenario now actually loaded, not
      // the one this boot started with, and so a return-to-title flight
      // followed by picking a THIRD scenario still detects a change.
      requestedScenarioId = scenarioId
      // Held paused across the fetch (a return-to-title flight leaves `frame`
      // very much alive, just as `title.up()` already stops feeding it keys):
      // without this, the OLD scenario's world keeps stepping -- unpaused,
      // since the title just hid itself -- for however long `loadScenario`'s
      // network round trip takes, before `rebuildFrame` below replaces it.
      if (frame) frame = withPaused(frame, true)
      // Same failure route as the initial load (`loadScenario`'s own try/catch,
      // above) and the same shape `loadTerrainProgressively`'s `.catch` below
      // already uses: a mid-game fetch failure is the same "content the build
      // was supposed to ship" fault, just discovered later than boot.
      void loadScenario(scenarioId, loadout).then(rebuildFrame).catch((err: unknown) => {
        loop?.stop()
        showFailure(root, 'bad-content', err instanceof Error ? err.message : String(err))
      })
      return
    }
    rebuildFrame()
  }, quality.settings)

  const canvas = document.createElement('canvas')
  root.appendChild(canvas)

  // Timestamp queries also support one automatic ocean quality decision.
  // The external diagnostics hook remains development-only.
  const { renderer, adapterVerdict } = await initRenderer(canvas, true)
  // Plan 16b: gates the sun's custom shadow node (AnalyticLightNode.setupShadow,
  // three r186); with a custom node three renders no shadow map.
  renderer.shadowMap.enabled = true

  // Declared here, before the hook below installs, initialised to `null` --
  // not assigned a real `FrameState` until after `loadScenarioBundle` resolves,
  // well down this function. See the hook's own comment for why that ordering
  // matters and is not just tidiness.
  let cascades: OceanCompute[] = []
  // `let` for the same temporal-dead-zone reason as `spawnPosition` above: the
  // diagnostics hook's `oceanLandWeight` closes over it before `loadDepth` resolves.
  let oceanDepth: DepthField | null = null
  const forcedOceanTier = import.meta.env.DEV ? oceanTierFromQuery(location.search) : undefined
  /**
   * Scenery has no query parameter of its own and has ALWAYS ridden the
   * ocean's: before this plan, `vegetation.setTier(oceanTier.name)` was the
   * only call site, so `?oceanTier=low` meant "and no trees at all"
   * (`SCENERY_TIERS.low.treeFadeEndM` is 0). Every GPU frame-time number this
   * project has ever recorded was measured through that URL, and Task 6's
   * first round quietly broke it: scenery read a saved/default tier no query
   * parameter could reach, so `?oceanTier=low` in a fresh browser context
   * rendered trees to the horizon. Trees silently appearing or vanishing
   * because of tier logic has cost this project real debugging time once
   * already (2026-09-20), so the DEV override keeps meaning exactly what it
   * has always meant -- and holds scenery against a saved setting and the
   * probe, the same way it holds the ocean and the clouds.
   *
   * A separate `?sceneryTier=` was the alternative and was not taken: it
   * would change what `?oceanTier=low` renders, which is the one thing this
   * must not do.
   */
  const forcedSceneryTier = forcedOceanTier?.name
  /** An `OCEAN_TIERS` entry by name. Total: `QualityTierName` and the tiers'
   *  own names are the same three strings, so the fallback is unreachable --
   *  it exists because `find` cannot say so in the type system. */
  const oceanTierNamed = (name: QualityTierName) => OCEAN_TIERS.find((t) => t.name === name) ?? OCEAN_TIERS[0]
  // Spec §5 steps 1 and 2: a saved choice is what this page load builds at,
  // `defaultQualitySettings('high')` (i.e. `OCEAN_TIERS[0]`, unchanged from
  // before this plan) when nothing is saved -- and a DEV `?oceanTier=`
  // override still wins over both, which is what keeps a Tier 2 measurement
  // run reading its own query parameter rather than whatever localStorage on
  // that machine happens to hold.
  let oceanTier = forcedOceanTier ?? oceanTierNamed(quality.current().ocean)

  // Declared here rather than beside `frameFn` further down, for the same
  // temporal-dead-zone reason as `spawnPosition` and `cascades` above: the
  // diagnostics hook's `paddles` getter, installed a few lines below, closes
  // over this `const` before `paddlesFor` -- not just `frame` -- would
  // otherwise be defined, and a hoisted `const` read from its temporal dead
  // zone is exactly the fault this file was shipped with once already
  // (`vegetation`'s comment, 2026-09-18). It needs nothing this early: only
  // the imports `playerAircraft`, `deckOf` and `paddlesCue`, plus whatever
  // `FrameState` it is handed later.
  /** The LSO's cue for the player this frame, from the first carrier with paddles parameters. */
  const paddlesFor = (f: FrameState): PaddlesCue | null => {
    const player = playerAircraft(f.world)
    for (const ship of f.world.ships) {
      if (ship.spec.paddles === undefined) continue
      const deck = deckOf(ship)
      if (deck === null) continue
      return paddlesCue(player.spec, player.state, f.controls, deck, ship.spec.paddles, f.world.wind)
    }
    return null
  }

  // Tier 2 diagnostics hook (tests/e2e/adapter.spec.ts), guarded absent from
  // a production build: `import.meta.env.DEV` is replaced with the literal
  // `false` by Vite at build time, and esbuild's dead-code elimination drops
  // an `if (false)` block, the same pattern already used for `stepper`
  // further down.
  //
  // Installed here, immediately after `adapterVerdict` exists and BEFORE the
  // `severity === 'fail'` early return just below -- not at the bottom of
  // `boot`, where round 0 left it. That placement meant the one case this
  // harness exists to catch -- a software rasterizer -- hid `__ww2` entirely:
  // the adapter spec's `waitForFunction` would time out at 30s with
  // `verdict.summary` never printed, on exactly the run where reading it
  // matters most (Task 15 review, round 1).
  //
  // `tick`, `cameraMode`, `controls` and `look` all read `frame` through a
  // `??`-guard rather than closing over it directly, because installing the
  // hook this early means `frame` is genuinely `null` for a real stretch of
  // wall-clock time on the SUCCESS path too, not just before the `fail`
  // return below: `await loadScenarioBundle()` further down is five real
  // network round-trips, and the sweep spec's first call after `page.goto`
  // invokes `.tick()` unconditionally as soon as `__ww2` exists. Round 1's
  // comment
  // here claimed the closures were merely "lazy" and safe because nothing
  // calls them before the `fail` return -- that reasoned about the wrong
  // path and was false the moment the spec's own `waitForFunction` runs
  // (Task 15 review, round 2). The guard is what makes both paths work from
  // one hook: `fail` reads only `.adapter`, which needs no guard; success
  // reads the others before the first frame exists and gets exactly
  // `initialFrameStateFor`'s own defaults (0 / `'chase'` / `NEUTRAL` /
  // `LOOK_CENTRE`) -- a poll that keeps waiting, not a thrown
  // `ReferenceError` whose cause the test output would never show.
  // Ships in production, like the legend and unlike `overlay`: sound is part
  // of the game, not developer telemetry. The context starts suspended; the
  // first keypress resumes it (see the keydown listener). `audio` itself is
  // constructed earlier (hoisted, alongside `frame`/`buildWorld` -- see that
  // comment above), but kicking off the clip loads is left here, where it
  // always ran: unlike the construction, this does not need to be safe for
  // `onNewGame` to touch before it runs, so there is no reason to move it.
  // Deliberately not awaited, exactly like `loadTerrainProgressively` below.
  // A sound that will not load must never reach `showFailure`: a flight sim
  // with no sound is playable, and `system.ts` already degrades each clip to
  // silence on its own (design §10.2).
  void audio.load().catch((error: unknown) => {
    if (import.meta.env.DEV) console.warn('audio failed to load', error)
  })

  if (import.meta.env.DEV) {
    ;(window as unknown as { __ww2: Ww2Diagnostics }).__ww2 = {
      adapter: adapterVerdict,
      oceanTier: () => oceanTier.name,
      // Task 9 (reference-GPU acceptance): whether `adaptOceanQuality`'s
      // ~180-frame probe has already resolved, or was pre-latched true by a
      // persisted choice at boot (`qualityChecked`, declared beside `quality`
      // above -- see that declaration for why it lives there now). Exists
      // because the DEV-override precedence and "an explicit pick suppresses
      // the next page load's probe" claims (spec §5 steps 1-2) were
      // previously pinned only by a source-text regex on
      // `bootQuality.test.ts`, never by a running check (Task 6 review).
      qualityProbeChecked: () => qualityChecked,
      oceanLandWeight: (x, z) => {
        if (!oceanDepth) return null
        return landWeightAt(terrain.levelTexture(finestFetchedLevel), oceanDepth.header.halfExtentM, x, z)
      },
      oceanComputeTimesMs: () => cascades.map(c => c.computeTimesMs()),
      oceanDisplacementSample: async (index) => {
        const cascade = cascades[index]
        if (!cascade || cascade.timeS === undefined) return null
        const sample = await cascade.readDisplacement()
        return {...sample, values:Array.from(sample.values), options:cascade.options, phaseSeed:cascade.phaseSeed}
      },
      reversedDepthBuffer: renderer.reversedDepthBuffer,
      validationErrors,
      tick: () => frame?.world.tick ?? 0,
      cameraMode: () => frame?.cameraMode ?? 'chase',
      gearFraction: () => (frame ? playerAircraft(frame.world).state.gearFraction : 0),
      controls: () => frame?.controls ?? NEUTRAL,
      look: () => frame?.look ?? LOOK_CENTRE,
      // Same `??`-guard as the four above, for the same reason: the hook is
      // installed before `frame` exists. The fallback is the same value
      // `initialFrameStateFor` would have produced.
      assists: () => frame?.assists ?? DEFAULT_ASSIST_SETTINGS,
      // Added in Task 10, and the only way to confirm that task's last wire
      // from outside: the heightfield the physics can hit arrives over the
      // network and changes nothing on screen -- the terrain is drawn from
      // the mesh's own textures either way, so a `World.terrain` left null
      // looks identical and merely means the airplane flies through the
      // mountains it can see. `null` here means no field has arrived (or
      // none was wired); a number is the ground under the airplane right
      // now, which should read 0 over open water and hundreds of metres over
      // Leyte.
      groundHeightM: () => {
        if (!frame) return null
        const { position } = playerAircraft(frame.world).state
        const g = groundUnder(frame.world.terrain, decksOf(frame.world.ships), position.x, position.z)
        return g?.heightM ?? null
      },
      // Same `??`-guard as the rest: before the scenario resolves there is no
      // frame, and the spawn is where the airplane WILL be, so that is the
      // honest answer for the gap. The world origin is the answer for the
      // narrower gap before the scenario itself has landed, because until
      // then nothing in the process knows where the airplane starts -- the
      // spawn is content now (Plan 12). Every Tier 2 caller reads this after
      // `waitForTerrain`, i.e. long after both.
      aircraftPositionM: () => (frame ? playerAircraft(frame.world).state.position : spawnPosition ?? v3(0, 0, 0)),
      // Plan 12: every entity, not just the player's airplane. See the two
      // members' doc comments in diagnostics.ts for what each one proves.
      ships: () =>
        (frame?.world.ships ?? []).map((s) => {
          const damage = frame?.world.combat.ships[s.id]
          return {
            id: s.id,
            x: s.state.position.x,
            z: s.state.position.z,
            headingRad: s.state.headingRad,
            hp: damage?.hp ?? s.spec.hullHp,
            sinkingFraction: damage?.sinkingFraction ?? 0,
          }
        }),
      // Plan 6b Task 8: the render-side twin of `ships` above, for the same
      // reason -- `airfield.ts`'s `sync` has no externally observable signal
      // besides this once a building collapses (or reverts on Restart).
      structures: () =>
        (frame?.world.combat.structures ? Object.entries(frame.world.combat.structures) : []).map(([id, d]) => ({ id, hp: d.hp })),
      aircraft: () =>
        (frame?.world.aircraft ?? []).map((a) => {
          // Inverse of scenario.ts's airborne-start construction: attitude =
          // qFromAxisAngle(up, pi/2 - headingRad) applied to +x forward.
          const forward = qRotate(a.state.attitude, v3(1, 0, 0))
          return {
            id: a.id,
            x: a.state.position.x,
            y: a.state.position.y,
            z: a.state.position.z,
            headingRad: Math.atan2(forward.x, -forward.z),
          }
        }),
      // Same `??`-guard as the rest: before the first frame exists there is
      // no impact to report, which is also the honest answer once a restart
      // has cleared one.
      impact: () => (frame ? playerAircraft(frame.world).impact : null),
      // Task 13: the take-off spec's only way to tell "left the ground" from
      // "was never on it". Recomputed from the live frame rather than stored,
      // because `supportedContact` is a pure predicate and `World` does not
      // carry its result -- see the comment on this member in diagnostics.ts.
      supportedContact: () => {
        if (!frame) return false
        const { spec: playerSpec, state } = playerAircraft(frame.world)
        const g = groundUnder(frame.world.terrain, decksOf(frame.world.ships), state.position.x, state.position.z)
        if (g === null) return false
        return supportedContact(playerSpec, state, g.heightM, g.surface, g.velocity)
      },
      // The LSO cue for the player, or `null` when there is nothing to signal (Plan 8).
      paddles: () => (frame ? paddlesFor(frame) : null),
      // The deck under the player's wheels, or `null` (Plan 8).
      deck: () => {
        if (!frame) return null
        const p = playerAircraft(frame.world).state
        const g = groundUnder(frame.world.terrain, decksOf(frame.world.ships), p.position.x, p.position.z)
        return g?.deck ? { shipId: g.deck.shipId, heightM: g.heightM, velocity: g.velocity } : null
      },
      // The world wind, the velocity of the air; `null` is calm (Plan 8).
      wind: () => frame?.world.wind ?? null,
      // Read fresh every call, same reason `scenarioEntities` is read fresh
      // in the render loop: `loadScenario` reassigns `bundle` wholesale on
      // every call, including a Task 7 in-place switch -- see this member's
      // own doc comment in diagnostics.ts for why a Tier 2 spec needs this
      // rather than `groundHeightM()` to detect a switch completing.
      scenarioId: () => bundle?.scenario.id ?? null,
      frameTimesMs: () => frameTimesMs.slice(),
      gpuFrameTimesMs: () => gpuFrameTimesMs.slice(),
      gpuRenderTimesMs: () => gpuRenderTimesMs.slice(),
      // `hasFeature`, not a stored flag: three decides at device creation
      // whether to honour `trackTimestamp` by testing exactly this feature
      // (WebGPUBackend.js:298, three@0.186.0), so asking the renderer the
      // same question cannot drift from what it actually did.
      gpuTimestampsSupported: renderer.hasFeature('timestamp-query'),
      audio: () => audio.snapshot(),
      // Plan 6: the guns, the damage and the rounds in flight, read off the
      // current frame's `World.combat` by the same adapter the readout's
      // tests cover. `null` before the first frame, like `impact`.
      combat: () => (frame ? combatDiagnosticsFor(frame) : null),
      // Plan 16a: which deck is up and at what tier; `off` under `?cloudTier=off`.
      clouds: () => ({
        layers: cloudLayers, tier: cloudTier, steps: cloudTier === 'off' ? 0 : CLOUD_TIERS[cloudTier].cumulusSteps,
        // Plan 16b: what the shadow pass is doing, for the Tier 2 budget.
        shadow: { enabled: shadow.enabled, taps: shadow.taps, mapSideM: MAP_SIDE_M },
        // Photoreal Task 4: frames resolved without history (0 with no pass).
        historyResets: cloudPass?.historyResets() ?? 0,
      }),
      // Photoreal Task 6: explicit TRAA/motion history resets since boot.
      antiAliasing: () => ({ historyResets: framePipeline.historyResets() }),
      // Plan 16b: the shadow map read back at a world point, for the
      // world-stability check a screenshot cannot make.
      cloudShadowAt: (x: number, z: number) => shadow.readAt(renderer, x, z),
      // Photoreal Task 8: the GPU transmittance LUT at (hM, mu), for the
      // CPU/GPU agreement check (tests/e2e/atmosphere.spec.ts).
      irradianceTableBuildMs: () => irradianceTableMs,
      atmosphereTransmittance: (hM: number, mu: number) => getAtmosphereLuts().readTransmittance(renderer, hM, mu),
      atmosphereLutTexel: (lut: AtmosphereLutName, px: number, py: number) => getAtmosphereLuts().readTexel(renderer, lut, px, py),
      // Photoreal Task 4 fix round 1: the reprojection-direction check.
      cloudReprojectionResidual: () => cloudPass?.measureReprojectionResidual() ?? Promise.resolve(null),
      // Plan 17: the radar scope read back at a (bearing, range), for the
      // world-stability check a screenshot cannot make -- mirrors `cloudShadowAt`.
      radarPixelAt: (bearingRad: number, rangeMi: number) => radarScope.readAt(renderer, bearingRad, rangeMi),
      // Plan 16c: the hour in force and where the sun is, for the specs.
      sun: () => sunState,
      // Plan 17: the radar scope's live state, same `frame`-guard as `combat`
      // above -- the hook is installed before the first frame exists.
      radar: () => (frame ? { rangeMi: selectedRadarRangeMi, sweepRad: radarSweepRad, contacts: radarContactList } : null),
      resetFrameTimes: () => {
        cascades.forEach(c => c.resetTimings())
        frameTimesMs.length = 0
        gpuFrameTimesMs.length = 0
        gpuRenderTimesMs.length = 0
      },
    }
  }

  if (adapterVerdict.severity === 'fail') {
    showFailure(root, 'software-adapter', adapterVerdict.summary)
    return
  }

  // Windows TDR resets the GPU driver after a hang -- a later plan's ocean
  // compute pass is exactly what trips it. three's WebGPUBackend already
  // filters out an ordinary dispose (reason === 'destroyed') before calling
  // onDeviceLost (verified 2026-09-13 in the installed three@0.186.0 source,
  // node_modules/three/src/renderers/webgpu/WebGPUBackend.js), so every
  // invocation reaching this callback is a real loss worth surfacing, not a
  // teardown.
  // `loop` itself is now hoisted further up, alongside `frame`/`audio` (Plan 9
  // Task 7 round 2) -- `onNewGame`'s different-scenario branch reads it,
  // unguarded, inside `loadScenario(...).then(rebuildFrame).catch((err) => {
  // loop?.stop(); ... })`, so it needed the same treatment those did.
  // `deviceLost` and `onDeviceLost`'s wiring stay here: both need `renderer`,
  // which cannot itself be hoisted (it IS `initRenderer`'s awaited result),
  // so there is nothing to gain by moving them and a real risk of tangling
  // the ordering `onDeviceLost`'s own comment below already documents
  // (Task 15's TDZ lesson, a narrower, already-solved instance of the same
  // class of bug this round fixed more of).
  // Set by `onDeviceLost` so `boot` cannot go on to start a loop onto a device
  // that is already gone. `stopped`-for-good inside `createRafLoop` does not
  // help here: during setup the loop that gets stopped and the loop that gets
  // started are different objects, and there is a real `await loadSpec()`
  // between the callback being wired and the loop being created. Found by
  // review 2026-09-13, correcting a comment that claimed this window was
  // already covered.
  let deviceLost = false

  renderer.onDeviceLost = (info) => {
    // Stop BEFORE showing the failure, and dispose after (whole-branch review,
    // I-3). Until this, `showFailure` detached the canvas and the frame chain
    // carried on regardless: rendering to a dead GPU, writing overlay text
    // into a detached element, and pushing fresh validation errors into
    // `validationErrors` behind the message the operator is meant to read.
    // `loop` is assigned before the first frame is ever scheduled, so it
    // exists by the time any real loss can reach this callback; the `?.`
    // covers a loss during setup, when there is no loop to stop yet.
    deviceLost = true
    loop?.stop()
    showFailure(root, 'device-lost', info.message)
    disposeAtmosphereLuts()
    // three's WebGPUBackend filters `reason === 'destroyed'` before calling
    // onDeviceLost (see the comment above), so the destroy this triggers
    // cannot re-enter here.
    renderer.dispose()
  }

  // See normalizeGpuError's doc comment: the installed three@0.186.0 runtime
  // calls this with an object despite @types/three declaring a string
  // parameter. Accepting the union here is what makes this assignment
  // typecheck against the (wrong) declared signature without a cast.
  renderer.onError = (info: string | { message?: string }) => {
    validationErrors.push(normalizeGpuError(info))
  }

  try {
    await loadScenario(requestedScenarioId, chosenLoadout)
  } catch (err) {
    showFailure(root, 'bad-content', err instanceof Error ? err.message : String(err))
    return
  }

  // Sea state from the scenario's wind (Plan 8), with the DEV `?beaufort=`
  // override winning when present. Below the bundle on purpose: the wind is
  // scenario content. See `seaStateFor`'s doc for why a calm scenario keeps
  // the development sea rather than going flat.
  const beaufort = seaStateFor(
    bundle!.scenario.weather.windMps,
    import.meta.env.DEV ? beaufortFromQuery(window.location.search) : undefined,
  )

  // The player's own airplane, for the panel, the gauges and the flight-data
  // overlay. One aircraft spec is all any of those take; the wingman's is the
  // same record anyway (both are `f6f-hellcat` -- the flight-model spec,
  // unchanged by Task 6; the rendered mesh for both is the Wildcat). Read
  // once, from the FIRST scenario's world -- see `scenarioWorld`'s own
  // comment above for why a later `loadScenario` call never needs to touch
  // this.
  const spec = playerAircraft(scenarioWorld!).spec

  // Plan 16b: the shadow map's lookup node is baked into the terrain's and
  // the ocean's materials, so the cloud field and the map exist before them.
  // The noise is fetched here rather than beside the bathymetry (16a) for
  // that reason; a clear-sky scenario still loads it (16a's reason stands).
  const skyNoiseLoading = loadSkyNoise()
  // Handled below by the `await`; this only stops a rejection during the
  // yield from being reported as unhandled before that `await` attaches.
  skyNoiseLoading.catch(() => undefined)
  // Photoreal Task 9 fix 2: build the sky-irradiance table (sky/palette.ts,
  // ~0.3 s of CPU) HERE, during the async load phase, rather than lazily on
  // the first `atmospherePalette` call -- which is inside the frame loop, so
  // the build would land as a stall on the first rendered frame. Yield to
  // the event loop first so the loading/title UI can paint, and overlap the
  // build with the sky-noise fetch already in flight.
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  irradianceTableMs = warmIrradianceTable()
  const skyNoise = await skyNoiseLoading
  const forcedCloudTier = import.meta.env.DEV ? cloudTierFromQuery(location.search) : undefined
  cloudLayers = forcedCloudTier === 'off' ? [] : bundle!.scenario.weather.clouds ?? []
  // The saved clouds tier, not the ocean's (spec §4: Advanced lets the three
  // diverge). With nothing saved both read `high`, which is what this line
  // resolved to before this plan existed. `?cloudTier=` still wins.
  cloudTier = forcedCloudTier ?? quality.current().clouds
  sceneryTier = forcedSceneryTier ?? quality.current().scenery
  // Plan 16c: the scenario's hour, or the DEV override.
  const forcedTimeOfDay = import.meta.env.DEV ? timeOfDayFromQuery(location.search) : undefined
  scenarioTimeOfDay = forcedTimeOfDay ?? bundle!.scenario.weather.timeOfDay ?? DEFAULT_TIME_OF_DAY
  sunState = { ...sunState, timeOfDay: scenarioTimeOfDay }
  const cloudField = createCloudField(cloudLayers, skyNoise)
  const shadowMode = import.meta.env.DEV ? cloudShadowFromQuery(location.search) : undefined
  const shadow = createCloudShadow(cloudField, shadowMode)
  // Photoreal Task 8 (spec §4.3): the atmosphere LUTs, one module-level
  // instance (atmosphereLuts.ts); the static two render on the first update.
  // DEV `?atmosphere=off` skips the per-frame update, for cost attribution.
  const atmosphere = getAtmosphereLuts()
  const atmosphereOff = import.meta.env.DEV && atmosphereFromQuery(location.search) === 'off'
  if (cloudTier !== 'off') shadow.setTier(cloudTier)
  // `finestFetchedLevel` is computed ONCE, at the top of `boot()` from the
  // persisted Asset Quality tier -- the only call site in `src/` -- and
  // threaded into every place that needs it (`createTerrainMesh`'s
  // `finestLevel` param, `terrain.levelTexture()` below,
  // `loadTerrainProgressively`'s and `applyTerrainLevel`'s `finestLevel`
  // params further down) rather than resolved independently in each: until
  // 2026-09-25 (Task 2 review) `createTerrainMesh` called
  // `finestFetchedLevelFor('low')` itself, a second source of truth that
  // happened to agree with this one only because both were the same
  // hardcoded literal.
  const terrain = createTerrainMesh(TERRAIN_HEADER, finestFetchedLevel, shadow)
  // Plan 13b. The raster and the terrain levels race; whichever lands
  // second finds the other ready. A failed fetch leaves the procedural
  // paint (surface.ts's `ready` uniform) and the daa1b39 forest, logged,
  // not fatal: land cover is a picture, terrain is the ground.
  let cover: CoverLookup | null = null
  // Declared here, not beside `scene.add(terrain.object)` below where it
  // used to live: `loadCover()` can resolve before the `await`s between here
  // and there finish (createOceanCompute/loadDepth), and the closure below
  // closes over this binding by reference. With the declaration after the
  // closure, a fast resolve read `vegetation` from its temporal dead zone --
  // optional chaining does NOT guard a TDZ read, so `vegetation?.setCover`
  // threw `ReferenceError`, and the `catch` below mislabelled that
  // programming fault as "land cover unavailable" (whole-branch review,
  // 2026-09-18 -- confirmed present in the deployed bundle). `let` still,
  // not `const`: `vegetation` is created later, once terrain level 4 lands.
  let vegetation: ReturnType<typeof createVegetation> | null = null
  // One `AirfieldHandle` per airfield (Plan 6b Task 8), populated the same
  // frame `vegetation` above is: both need the real terrain heightfield,
  // which arrives asynchronously (`loadTerrainProgressively` below).
  let airfieldHandles: readonly ReturnType<typeof createAirfield>[] = []
  void loadCover().then(
    data => {
      // Anything thrown here is a bug in this block, not a bad or missing
      // raster -- `loadCover()` already succeeded. Reported and rethrown
      // rather than falling into the rejection branch below, so this class
      // of fault can never again hide behind "land cover unavailable".
      try {
        terrain.setCover(data)
        cover = coverLookup(data)
        vegetation?.setCover(cover)
      } catch (err) {
        console.error('land cover setup failed after a successful fetch (a bug, not a data problem):', err)
        throw err
      }
    },
    (err: unknown) => {
      console.warn('land cover unavailable, painting procedurally:', err)
    },
  )
  const oceanTime = import.meta.env.DEV ? oceanTimeFromQuery(location.search) : undefined
  cascades = await Promise.all(cascadeOptions(beaufort, oceanTier.n, oceanTier.cascades).map(options => createOceanCompute(renderer, options)))
  oceanDepth = await loadDepth()
  // Plan 16a. `?cloudTier=off` is the DEV control for measuring a scene
  // with and without the pass; the field itself was made above the terrain.
  const clouds = createClouds(cloudLayers, skyNoise, cloudField)
  if (cloudTier !== 'off') clouds.setTier(cloudTier)
  if (import.meta.env.DEV) clouds.setDebug(cloudDebugFromQuery(location.search))
  let water = createOcean(oceanDepth, beaufort, cascades, terrain.levelTexture(finestFetchedLevel), shadow)
  scene.add(water)
  /**
   * Swap the ocean onto `name`'s cascades, live. Extracted from the probe
   * (where this whole body used to live inline) because the Settings dialog
   * now reaches the same swap: a Simple-row or Advanced Ocean click is the
   * identical operation the probe performs, and two copies of a rebuild that
   * disposes GPU resources is exactly the divergence this file has been bitten
   * by before.
   *
   * A DEV `?oceanTier=` override holds the tier against BOTH callers (spec §5
   * step 2). That guard matters more now than it did: without it, `bind`
   * below applies the saved settings the moment the ocean exists, so a
   * measurement run on a machine with `low` in localStorage would silently
   * measure `low` while its URL said `high`.
   */
  // Settings can issue several picks while a cascade rebuild is still in
  // flight. Track the latest request so an older, slower rebuild cannot win
  // after the player has already selected something else. Re-selecting the
  // currently active tier also cancels an in-flight change back away from it.
  let oceanTierRequest = 0
  let requestedOceanTier: QualityTierName | null = null
  const applyOceanTier = async (name: QualityTierName): Promise<void> => {
    if (forcedOceanTier !== undefined) return
    const next = oceanTierNamed(name)
    if (requestedOceanTier === name) return
    if (next === oceanTier) {
      if (requestedOceanTier !== null) {
        oceanTierRequest += 1
        requestedOceanTier = null
      }
      return
    }
    const request = ++oceanTierRequest
    requestedOceanTier = name
    const pending = await Promise.allSettled(cascadeOptions(beaufort,next.n,next.cascades).map(options=>createOceanCompute(renderer,options)))
    const ready = pending.flatMap(r=>r.status === 'fulfilled' ? [r.value] : [])
    if (request !== oceanTierRequest) { ready.forEach(c=>c.dispose()); return }
    requestedOceanTier = null
    if (ready.length !== next.cascades) { ready.forEach(c=>c.dispose()); return }
    const replacement = createOcean(oceanDepth!,beaufort,ready,terrain.levelTexture(finestFetchedLevel),shadow)
    scene.remove(water)
    water.userData.disposeOcean()
    cascades.forEach(c=>c.dispose())
    cascades = ready
    water = replacement
    scene.add(water)
    oceanTier = next
  }
  /** `vegetation` is null until terrain arrives, which is why the tier is
   *  also recorded: `createVegetation`'s own `setTier` call reads it.
   *  `?oceanTier=` holds this one -- see `forcedSceneryTier` for why scenery
   *  answers to the ocean's override rather than to one of its own. */
  const applySceneryTier = (name: QualityTierName): void => {
    if (forcedSceneryTier !== undefined) return
    sceneryTier = name
    vegetation?.setTier(name)
  }
  let cloudPass: CloudPass | null = null
  /** `?cloudTier=` holds this one, including `off` -- which is a scene with no
   *  cloud pass at all, not a tier, and must not be pulled back on by a saved
   *  setting or by the probe. */
  const applyCloudTier = (name: QualityTierName): void => {
    if (forcedCloudTier !== undefined || cloudTier === name) return
    cloudTier = name
    clouds.setTier(name)
    cloudPass?.setResolutionScale(CLOUD_TIERS[name].resolutionScale)
    cloudPass?.setUpdatePeriod(CLOUD_TIERS[name].updatePeriod)
    shadow.setTier(name)
  }
  // `qualityChecked` itself is declared much earlier now (beside `quality`),
  // read here and mutated below -- see that declaration for why.
  // Everything a tier moves now exists. This also applies anything picked
  // during boot's own awaits, when the dialog was already clickable and there
  // was nothing yet to apply it to.
  quality.bind({ setOceanTier: (t) => { void applyOceanTier(t) }, setSceneryTier: applySceneryTier, setCloudTier: applyCloudTier })
  const adaptOceanQuality = async (): Promise<void> => {
    // One downgrade after warm-up. Never oscillate tiers or repeatedly compile
    // pipelines during flight; a DEV override holds the tier for comparison.
    const p95 = (values: readonly number[]) => [...values].sort((a,b)=>a-b)[Math.floor(values.length * .95)] ?? 0
    const timed = renderer.hasFeature('timestamp-query')
    if (qualityChecked || forcedOceanTier || (timed ? gpuRenderTimesMs.length < 180 : frameTimesMs.length < 180)) return
    qualityChecked = true
    const cost = timed ? p95(gpuRenderTimesMs.slice(60)) + cascades.reduce((sum,c)=>sum+p95(c.computeTimesMs().slice(60)),0)
      : p95(frameTimesMs.slice(60))
    // Without GPU timestamps, frame intervals include refresh cadence. Keep
    // high at 60 fps, medium below 30 fps, low otherwise.
    const next = timed ? tierForFrameTimeMs(cost) : cost <= 18 ? OCEAN_TIERS[0] : cost <= 34 ? OCEAN_TIERS[1] : OCEAN_TIERS[2]
    // Spec §5 step 3, all of it -- including the case this function used to
    // return early on (`next === oceanTier`): the measurement is still what
    // the dialog stamps "Recommended", and still worth saving, since what
    // makes the probe run once per BROWSER rather than once per page load is
    // the save, not the swap. `applyProbeResult` discards its own result if
    // the player picked a tier first; it never overwrites a deliberate choice.
    quality.applyProbeResult(next.name)
  }
  const sky = createSky()
  scene.add(sky)
  // Plan 16b: the sun carries the cloud-shadow lookup into every lit
  // material. `positionWorld` is eye-relative here; the node adds the eye.
  const lights = createLighting(shadow.enabled ? shadow.node(positionWorld, 'eyeRelative') : undefined)
  scene.add(lights)
  // The clouds are no longer in the scene: photoreal Task 3 moved the march
  // into a reduced-resolution pass composited after it (`cloudPass`, below
  // `framePipeline`).
  // `airframes`/`shipHandles`/`smokes`/`player` are already in
  // `scenarioEntities` -- built by the first `loadScenario` call, above,
  // from this same `scene` and this same `scenarioWorld`'s entity lists
  // (`buildScenarioEntities`, `scenarioEntities.ts`, has the construction
  // reasoning: world order, the smoke-per-airframe child, and picking the
  // player's `Airframe` out by id rather than assuming index 0). The render
  // loop, below, destructures `scenarioEntities` fresh every frame -- Plan 9
  // Task 7 -- so a later `loadScenario` call is picked up with no further
  // plumbing here.
  const tracers = createTracers()
  scene.add(tracers.object)
  const hitFlashes = createHitFlashes()
  scene.add(hitFlashes.object)
  // Ordnance in flight and its impacts (Plan 6b Task 8): `createOrdnance`
  // adds its own pools to `scene` itself, unlike the pools above, which hand
  // their `object` back for the caller to add. Like `tracers`/`hitFlashes`,
  // sized independently of any scenario's entity list -- nothing here is
  // rebuilt on a scenario switch either.
  const ordnance = createOrdnance(scene)
  let ordnanceMemory: OrdnanceMemory = NO_ORDNANCE_MEMORY
  let flashMemory: FlashMemory = NO_FLASH_MEMORY

  // The panel is 3D geometry, not a screen-space HUD, so it gets parallax and
  // occlusion during look-around for free (spec rationale, this task). It
  // lives in its own group rather than as a child of the player's airframe
  // root because the two are visibility-exclusive (see the
  // cockpit.visible/playerAirframe.root.visible swap below), not because
  // they move differently -- both are posed from the
  // same `frame.render` pose each frame.
  const panel = createPanel(spec)
  resizePanel(panel, window.innerWidth / window.innerHeight)
  const radarScope = createRadarScope()
  radarScope.attachTo(panel.radar.face)
  const cockpit = new Group()
  cockpit.add(panel.root)
  scene.add(cockpit)

  // Leyte, drawn from `content/terrain/`. Added to `scene` rather than beside
  // it so it inherits the camera-relative translation applied below -- a
  // terrain mesh that missed it would jitter at 100 km exactly as master
  // spec §4 describes, and would be the only thing in the scene that did.
  scene.add(terrain.object)
  // `vegetation` itself is declared above, beside `cover`, not here -- see
  // that comment for why.

  const camera = new PerspectiveCamera(
    CAMERA_VFOV_DEG,
    window.innerWidth / window.innerHeight,
    0.1,
    // The ocean reaches 400 km. Ten percent slack also encloses its 12.6 km
    // curvature sink and the service-ceiling camera height. Terrain still
    // fades at its own draw distance; the far plane no longer clips the sea.
    OCEAN_EXTENT_M * 1.1,
  )
  // Photoreal render pass (spec §4.1): the picture now renders through a
  // RenderPipeline whose scene pass later phases insert nodes after. Built
  // once here; its target follows the drawing-buffer size on its own
  // (pipeline.ts), so the resize handler below needs no call. No dispose on
  // the device-loss path: `renderer.dispose()` there already releases every
  // GPU resource the pass and its output quad hold.
  const framePipeline = createFramePipeline(renderer, scene, camera)
  // Phase A (spec §4.2): AgX in production; DEV `?toneMap=agx|aces|none`
  // swaps the curve for comparison screenshots (and throws on a typo).
  const forcedToneMap = import.meta.env.DEV ? toneMapFromQuery(location.search) : undefined
  if (forcedToneMap !== undefined) framePipeline.setToneMap(forcedToneMap)
  // Task 6: TRAA in production; DEV `?aa=traa|smaa` for comparison captures.
  const forcedAntiAliasing = import.meta.env.DEV ? antiAliasingFromQuery(location.search) : undefined
  if (forcedAntiAliasing !== undefined) framePipeline.setAntiAliasing(forcedAntiAliasing)
  // Task 6 fix round 1: DEV `?sharpen=0..1` overrides the post-AA RCAS amount.
  const forcedSharpen = import.meta.env.DEV ? sharpenFromQuery(location.search) : undefined
  if (forcedSharpen !== undefined) framePipeline.setSharpen(forcedSharpen)
  // Photoreal Task 3 (spec §4.1): the cloud march at reduced resolution,
  // composited over the scene pass. It renders from inside
  // `framePipeline.render()` (a node's `updateBefore`, after the scene pass)
  // and follows the drawing-buffer size by itself, so neither the frame loop
  // nor the resize handler calls it. `?cloudTier=off` and a clear-sky
  // scenario build no pass at all: the output stays `sceneColor`.
  // `applyCloudTier` (above) may run before this line -- `quality.bind`
  // applies a pending pick at once -- which is why the pass takes its scale
  // from `cloudTier` here rather than relying on that call.
  cloudPass = cloudTier === 'off' || !clouds.enabled ? null : createCloudPass({
    clouds, camera, sceneColor: framePipeline.sceneColor, sceneDepth: framePipeline.sceneDepth,
  })
  if (cloudPass !== null && cloudTier !== 'off') {
    cloudPass.setResolutionScale(CLOUD_TIERS[cloudTier].resolutionScale)
    cloudPass.setUpdatePeriod(CLOUD_TIERS[cloudTier].updatePeriod)
    framePipeline.setOutput(cloudPass.composite)
  }

  // Everything about the first frame -- the gear, the terrain hold, one pose
  // per entity -- is derived from the world's own entities by
  // `initialFrameStateFor` (frame.ts), which is why no boolean is passed here
  // any more.
  frame = initialFrameStateFor(buildWorld(null))
  // Repeatable scenery inspection with the existing DEV spawn overrides.
  // Hold position and look down; absent from production builds.
  const inspectScenery = import.meta.env.DEV && new URLSearchParams(location.search).get('sceneryView') === '1'
  if (inspectScenery) frame = withPaused(frame, true)

  // Ships in production, unlike `overlay` below: it is the pilot's only view
  // of the key map. Mark asked for a throttle-down key on 2026-09-15 that had
  // been bound since Plan 1 and written down nowhere.
  const legend = createLegend(root)
  let muted = false
  const flightData = createFlightData(root)
  // Ships in production for the same reason the legend does: compression is
  // nearly invisible in a cruise, and a pilot who forgets it is on arrives
  // somewhere unintended.
  const timeBadge = createTimeBadge(root)
  const pauseBadge = createPauseBadge(root)
  const paddlesBadge = createPaddlesBadge(root)
  // Ships in production, in both camera modes (Plan 6): ammunition and
  // damage are things the pilot needs whichever way they are looking.
  const combatReadout = createCombatReadout(root)
  // Restart rebuilds the frame from the scenario rather than tearing anything
  // down: `worldFromScenario` and `initialFrameStateFor` are both pure, so the
  // renderer, the terrain and the ocean cascades all survive untouched -- and
  // so does the wingman and the task force's position on its loop, which are
  // rebuilt at their scenario start along with the player.
  const debrief = createDebrief(root, () => {
    // `frame!.world.terrain` rather than a stored field: the heightfield
    // arrives over the network seconds after the first frame and is upgraded
    // again as finer levels load (`applyTerrainLevel`, further down this
    // file), so the CURRENT world holds the only up-to-date copy. Reading it
    // back means a restart keeps whatever level has loaded so far instead of
    // dropping back to none.
    // `frame!.assists` is threaded through so Restart keeps whatever the
    // pilot actually chose (stall limiter, auto-rudder) rather than silently
    // reverting to `initialFrameStateFor`'s `DEFAULT_ASSIST_SETTINGS`
    // (whole-branch review I-2). `cameraMode` and `timeScale` are NOT
    // threaded through -- unlike terrain and assists, resetting those is
    // deliberate: a fresh airplane returns the pilot to chase view at real
    // time rather than wherever a wrecked one left the camera and clock.
    // A restarted ground spawn is settled onto its terrain immediately
    // (rather than re-entering the hold above) exactly when `buildWorld` was
    // handed one -- restart never needs to wait a second time for a
    // heightfield that is already cached in `frame!`.
    const restarted = initialFrameStateFor(buildWorld(frame!.world.terrain), frame!.assists)
    frame =
      restarted.groundSpawn && restarted.world.terrain !== null
        ? settleOnTerrain(restarted, restarted.world.terrain)
        : restarted
    // The pooled flashes, like the impact effect: a fireball from the old
    // flight must not sit under the new airplane. The flash MEMORY needs
    // no reset -- the tick going backwards is its restart signal, as it is
    // the audio reducer's -- and the tracers redraw from the new world's
    // (empty) projectile list on the next frame.
    resetFlightUi()
    // A Restart is a new life for scoring purposes exactly like a New game
    // is (this plan's own "Ruling"), even though it keeps the same pilot and
    // does not call `startSortie` again -- Restart is a redo of the SAME
    // sortie already counted, not a new one.
    scoredThroughKillsByType = zeroKillsByType()
  })
  /** Passed to every `debrief.show(...)` call below as the "Return to title"
   *  handler (design §1) -- constant across all three outcomes, unlike
   *  `onContinue` which only the landing model supplies, so it is threaded
   *  through `show()`'s own per-call signature the same way rather than
   *  hardcoded once into `createDebrief`. */
  const returnToTitle = (): void => {
    debrief.hide()
    // Plan 9 Task 7 bugfix: `requestedScenarioId` is this file's own live
    // tracking of which scenario is ACTUALLY loaded right now -- updated by
    // the title's own `onNewGame` the instant a switch is requested, not
    // just once at boot -- so a return-to-title after an in-session switch
    // preselects what is really loaded, not whatever this boot started with.
    title.show(requestedScenarioId)
  }
  /** Whether the landing debrief is up for the landing `frame.landing.report`
   *  holds -- raised once, like `shownImpactTick`, and cleared by Continue or
   *  Restart. */
  let landingShown = false
  const impactEffect = createImpactEffect()
  scene.add(impactEffect.object)
  /** The tick of the impact the debrief is currently showing, so the modal is
   *  raised once rather than rebuilt sixty times a second. */
  let shownImpactTick: number | null = null
  /** The damage-destruction tick already shown, parallel to impact above. */
  let shownDestructionTick: number | null = null
  /**
   * Applies one mission's score to whichever pilot is flying and persists the
   * roster immediately, so both this debrief's own figures and the title
   * screen's next `show()` (which re-reads `loadRoster()`) agree with no
   * extra plumbing. A no-op before `onNewGame` has ever fired.
   *
   * Whole-branch review I-2/I-3: `killsSinceLastBank` is threaded through to
   * `applyMissionResultToRoster` so the pilot's career `killsByType`
   * actually accumulates (I-2 -- before this it was written nowhere).
   * Returns the pilot's post-bank cumulative score and, if this mission
   * crossed a rank threshold, the new rank's name -- design §1's other two
   * promised debrief figures (I-3), read off the roster entry BEFORE and
   * AFTER banking so a promotion is reported only when the rank actually
   * changed, not merely recomputed to the same value. `null` on the same
   * no-op guard as before (`currentPilotId === null`) and if the pilot
   * somehow is not found (unreachable in practice: `currentPilotId` only
   * ever comes from a pilot actually in `roster`).
   */
  const bankMissionResult = (
    scoreTotal: number,
    outcome: 'landed' | 'ditched' | 'killed',
    killsSinceLastBank: Readonly<Record<TargetType, number>>,
  ): { readonly bankedTotal: number; readonly promotedTo: string | undefined } | null => {
    if (currentPilotId === null) return null
    const before = roster.find((p) => p.id === currentPilotId) ?? null
    roster = applyMissionResultToRoster(roster, currentPilotId, scoreTotal, outcome, killsSinceLastBank)
    saveRoster(roster)
    const after = roster.find((p) => p.id === currentPilotId) ?? null
    if (after === null) return null
    const promotedTo = before !== null && before.rank.abbrev !== after.rank.abbrev ? after.rank.name : undefined
    return { bankedTotal: after.cumulativeScore, promotedTo }
  }
  /**
   * The one place all three debrief call sites below merge `bankMissionResult`'s
   * return into the model actually shown (whole-branch review I-3) -- kept in
   * one function rather than repeated three times so the merge shape cannot
   * drift between the impact/destruction/landing sites. `banked === null`
   * (no pilot flying -- a dev-URL bypass, or the roster flow never reached)
   * shows the model exactly as built, with neither figure.
   */
  const showDebrief = (
    model: DebriefModel,
    banked: { readonly bankedTotal: number; readonly promotedTo: string | undefined } | null,
    onContinue: (() => void) | undefined,
  ): void => {
    // `exactOptionalPropertyTypes`: spread `promotedTo` in only when it is
    // actually a string, rather than assigning it `undefined` -- the two are
    // different things under this tsconfig, and `DebriefModel.promotedTo` is
    // typed as absent-or-string, not string-or-undefined (matching
    // `continueLabel`'s existing convention on the same type).
    debrief.show(
      banked === null
        ? model
        : { ...model, bankedTotal: banked.bankedTotal, ...(banked.promotedTo !== undefined ? { promotedTo: banked.promotedTo } : {}) },
      onContinue,
      returnToTitle,
    )
  }
  /**
   * Real elapsed seconds since the flight froze, 0 while still flying.
   *
   * Whole-branch review I-1: `world.tick` and `world.accumulatorSeconds` both
   * freeze the instant the PLAYER has an impact, so the ocean dispatch below
   * -- which derives its time argument from exactly those two frozen
   * quantities -- would otherwise go glass-still forever after a successful
   * ditching, the feature's showpiece. What freezes them is the frame, not
   * `advance`: `nextFrameState` hands `advance` zero elapsed seconds while
   * `playerAircraft(world).impact` is set (frame.ts's `holding`), and
   * `advance` itself stops nothing since Plan 12. This grows by real
   * `frameMs` over the same condition and is added on top of the existing
   * (unchanged) sim-time expression, so a live flight's ocean timing stays
   * bit-identical to before this fix and only a held one keeps moving.
   */
  let postImpactOceanSeconds = 0
  /**
   * Whole-branch review C-1: the flight/debrief UI state that must be
   * cleared before ANY new life begins -- a Restart (above, `createDebrief`'s
   * own `onRestart`) and an `onNewGame` rebuild (`rebuildFrame`, inside the
   * title's callback well above) both start a fresh sortie, and neither may
   * leave a PREVIOUS flight's debrief/effects/landing state behind. Before
   * this fix only Restart cleared these; `rebuildFrame` rebuilt `frame`
   * alone, so a landing -> "Return to title" -> New game -> land again
   * sequence left `landingShown` (and the impact/destruction tick guards)
   * latched `true`/stale from the first flight, and the second landing's own
   * `if (... && !landingShown)` gate (below) silently never fired again -- no
   * debrief, no bank, for the rest of the page's life. The same stale
   * `landingShown` also silently killed `openNavigationChart` and the
   * radar-range-cycling keydown handler for that session, both gated on it
   * elsewhere in this file.
   *
   * Declared here, after every variable it touches (`debrief`, `impactEffect`,
   * `hitFlashes`, `shownImpactTick`, `shownDestructionTick`, `landingShown`,
   * `postImpactOceanSeconds`) rather than hoisted to the top of `boot` with
   * `frame`/`buildWorld`/`roster` -- unlike those, nothing here needs the
   * TDZ-safety hoist: there is no `await` anywhere between `frame`'s own
   * first assignment, above, and this declaration (confirmed by reading the
   * whole stretch), so this entire span runs as one synchronous block and no
   * click can land in the middle of it. `rebuildFrame`'s own call to this
   * function, textually earlier in the file, is a forward reference that
   * resolves the same way `buildWorld`'s already does: it is never invoked
   * before boot() has run this line, because it only runs from a user click,
   * and boot() has no `await` left between here and starting the render loop
   * that could let one in early.
   *
   * Does NOT reset `scoredThroughKillsByType` -- both call sites already
   * reset that themselves (the title's `onNewGame` callback, before either
   * of its branches; the Restart handler, at its own end) for reasons
   * specific to each path, so folding a third copy in here would be
   * redundant rather than protective.
   */
  const resetFlightUi = (): void => {
    debrief.hide()
    impactEffect.hide()
    hitFlashes.hide()
    shownImpactTick = null
    shownDestructionTick = null
    landingShown = false
    postImpactOceanSeconds = 0
    // Photoreal Task 4: a new life is a new view; the cloud history of the
    // old one must not be reprojected into it. The teleport test in the
    // frame loop would usually catch it too -- this does not depend on how
    // far the restart moved the eye.
    cloudPass?.resetHistory()
    framePipeline.resetHistory()
  }
  let legendOpen = true
  // Plan 17. Instrument setting, not simulation state -- same tier as
  // `legendOpen`/`muted`, not `FrameState`: neither affects the replay or
  // golden-trajectory contract. Defaults to the widest ring on load, like
  // every other panel state (no persistence, design doc §5).
  let selectedRadarRangeMi: RadarRangeMi = RADAR_RANGES_MI[0]

  const pressed = new Set<string>()
  // Preserve a camera tap even if keydown and keyup both fall between frames.
  let pendingCameraCycle = false
  // The same latch for triple time, which is edge-triggered inside
  // `nextFrameState` in exactly the way the camera cycle is and so loses a
  // quick tap in exactly the same way. That defect was found on the camera key
  // and fixed there alone (2026-09-15 cockpit feedback); this is the other half
  // of it.
  let pendingTripleTime = false
  // And for the pause and the throttle cut, both edge-triggered inside
  // `nextFrameState` the same way.
  let pendingPause = false
  let pendingThrottleCut = false
  // And the release controls (Plan 6b Task 4), latched the same way for the
  // same reason: `dropBomb`/`fireRockets` pulse edge-triggered inside
  // `nextFrameState`, just like the throttle cut.
  let pendingDropBomb = false
  let pendingFireRockets = false
  // And the gear and flap levers. Found 2026-09-17 by a Tier 2 screenshot:
  // Playwright's `keyboard.press('KeyF')` is down-and-up within one frame,
  // and the flap light never lit because `nextFrameState` never saw the key
  // in the held set. A human tap is several frames, so nobody had noticed --
  // but at a display running past 100 Hz a quick tap gets short too.
  let pendingGear = false
  let pendingFlaps = false
  // And the hook lever (Plan 8), latched the same way for the same reason.
  let pendingHook = false
  let navigationMapState = CLOSED_NAVIGATION_MAP
  const NO_KEYS: ReadonlySet<string> = new Set()
  const clearMapInput = (): void => {
    pressed.clear()
    pendingCameraCycle = false
    pendingTripleTime = false
    pendingPause = false
    pendingThrottleCut = false
    pendingGear = false
    pendingFlaps = false
    pendingHook = false
    pendingDropBomb = false
    pendingFireRockets = false
  }
  const navigationMap = createMissionMap(root, {
    onClose: () => closeNavigationChart(),
    onSelect: (id) => {
      navigationMapState = selectNavigationDestination(navigationMapState, id)
    },
  })
  const closeNavigationChart = (): void => {
    if (!navigationMapState.open) return
    const closed = closeNavigationMap(navigationMapState)
    navigationMapState = closed.state
    frame = withPaused(frame!, closed.restorePaused)
    clearMapInput()
    navigationMap.hide()
  }
  const openNavigationChart = (): void => {
    if (navigationMapState.open || playerAircraft(frame!.world).impact !== null || landingShown) return
    navigationMapState = openNavigationMap(navigationMapState, frame!.paused)
    frame = withPaused(frame!, true)
    clearMapInput()
    navigationMap.show(frame!.world, navigationMapState.selectedId)
  }

  window.addEventListener('keydown', (e) => {
    // Nothing reaches the game while the title is up; the title owns Enter.
    if (title.up()) return
    if (BINDINGS.toggleMissionMap.includes(e.code as never) && !e.repeat) {
      e.preventDefault()
      if (navigationMapState.open) closeNavigationChart()
      else openNavigationChart()
    }
    if (BINDINGS.cycleCamera.includes(e.code as never) && !e.repeat) pendingCameraCycle = true
    if (BINDINGS.toggleTripleTime.includes(e.code as never) && !e.repeat) pendingTripleTime = true
    if (BINDINGS.pause.includes(e.code as never) && !e.repeat) {
      e.preventDefault()
      pendingPause = true
    }
    if (BINDINGS.throttleCut.includes(e.code as never) && !e.repeat) pendingThrottleCut = true
    if (BINDINGS.dropBomb.includes(e.code as never) && !e.repeat) pendingDropBomb = true
    if (BINDINGS.fireRockets.includes(e.code as never) && !e.repeat) pendingFireRockets = true
    // Space scrolls the page and activates a focused button; neither is
    // what a pilot holding the trigger means (Plan 6). Not latched like the
    // toggles above: firing is a HOLD, read from `pressed` every frame.
    if (BINDINGS.fireGuns.includes(e.code as never)) e.preventDefault()
    if (BINDINGS.toggleGear.includes(e.code as never) && !e.repeat) pendingGear = true
    if (BINDINGS.toggleFlaps.includes(e.code as never) && !e.repeat) pendingFlaps = true
    if (BINDINGS.toggleHook.includes(e.code as never) && !e.repeat) pendingHook = true
    if (BINDINGS.toggleFlightData.includes(e.code as never) && !e.repeat) {
      e.preventDefault()
      flightData.toggle()
    }
    // Toggled here rather than through `nextFrameState`: the legend is a piece
    // of page furniture, and FrameState is the deterministic simulation state
    // that the golden trajectory and the soak both replay. `e.repeat` is what
    // keeps a held key from flipping it at the keyboard's repeat rate.
    if (BINDINGS.toggleLegend.includes(e.code as never) && !e.repeat) {
      e.preventDefault()
      legendOpen = !legendOpen
      legend.setOpen(legendOpen)
    }
    // Plan 15. Page furniture, toggled here for the same reason the legend is:
    // FrameState is the deterministic simulation state the golden trajectory
    // and the soak replay, and a mute belongs in neither.
    if (BINDINGS.toggleMute.includes(e.code as never) && !e.repeat) {
      e.preventDefault()
      muted = !muted
      audio.setMuted(muted)
      legend.setMuted(muted)
    }
    // Plan 17. Page furniture, toggled here for the same reason the legend
    // and mute are: FrameState is the deterministic simulation state the
    // golden trajectory and the soak replay, and a display range belongs in
    // neither.
    //
    // Guarded on the debrief being up (whole-branch review, I-2): the debrief
    // modal (impact or landing) has native <button>s -- Restart, Continue --
    // with no other keyboard binding, so Tab was their only keyboard route
    // until this plan's unconditional preventDefault() silently broke it.
    // Same condition `openNavigationChart` above already uses to recognise a
    // debrief is showing, minus its own `navigationMapState.open` clause
    // (irrelevant here). Skipping BOTH the range cycling and the
    // preventDefault when a debrief is up lets Tab fall through to the
    // browser's native focus behaviour, which is what reaches those buttons.
    if (
      BINDINGS.toggleRadarRange.includes(e.code as never) &&
      !e.repeat &&
      !(playerAircraft(frame!.world).impact !== null || landingShown)
    ) {
      e.preventDefault()
      selectedRadarRangeMi = cycleRadarRange(selectedRadarRangeMi)
    }
    // Unconditional, and synchronous inside the listener: the autoplay policy
    // ties the gesture to the TASK, not to the promise chain, so awaiting
    // anything before this point would spend the gesture.
    void audio.resume()
    pressed.add(e.code)
  })
  window.addEventListener('keyup', (e) => {
    pressed.delete(e.code)
  })
  // A keyup that fires while the tab is unfocused is never delivered to this
  // page, so a key held at the moment focus is lost would otherwise stay
  // "down" forever -- the airplane keeps pitching after the window loses focus.
  window.addEventListener('blur', () => {
    pressed.clear()
    pendingCameraCycle = false
    // Omitted before Plan 8: this handler never cleared triple time's latch,
    // unlike every other edge-triggered toggle here and in `clearMapInput`.
    pendingTripleTime = false
    pendingPause = false
    pendingThrottleCut = false
    pendingGear = false
    pendingFlaps = false
    pendingHook = false
    pendingDropBomb = false
    pendingFireRockets = false
  })

  // The choice is made here, at the edge, so sim/ carries no build flag:
  // stepChecked runs Plan 1's invariants every tick in development, turning
  // "the airplane teleported" into "a NaN entered at tick 4,102"; step is
  // the production path with no per-step assertion cost.
  const stepper = import.meta.env.DEV ? stepChecked : step

  // DEV only, matching `__ww2` and `stepChecked` a few lines above. It was
  // unconditional until 2026-09-13, and its "dropped N <-- replay invalid"
  // string was confirmed present in the production bundle while `__ww2` was
  // correctly absent -- so a release rendered developer telemetry over the
  // game. Cross-task drift between Task 11 and Task 15's own convention.
  const overlay = import.meta.env.DEV ? createOverlay(root) : null
  let last = performance.now()
  // Photoreal Task 4: the eye, time and pause state of the last rendered
  // frame, for the cloud and (Task 6) TRAA history resets (render branch
  // below). Named for the cloud pass, which had them first.
  let cloudHistoryEye: Vec3 | null = null
  let cloudHistoryAtMs = 0
  let cloudHistoryPaused = false
  let cloudHistoryCameraMode: CameraMode | null = null
  // Whether a timestamp resolve is outstanding; see the call site below.
  let gpuResolvePending = false
  const frameFn = (now: number): void => {
    const frameMs = now - last
    last = now

    // Collected for `window.__ww2.frameTimesMs()`; see that member's comment
    // in diagnostics.ts for what this quantity is and is not. Recorded at the
    // TOP of the frame, so a sample is the interval that ENDED here rather
    // than one that includes part of this frame's own work twice.
    if (frameTimesMs.length < FRAME_TIME_CAPACITY) frameTimesMs.push(frameMs)

    // `frame` is assigned a real `FrameState` just above, before this
    // function is ever scheduled, and reassigned at the end of every call to
    // it from here on -- always non-null whenever `frameFn` runs, which is
    // exactly why the single `!` lives here and nowhere else. Everything
    // below reads `current` (typed `FrameState`, non-null), not the nullable
    // `frame` -- one assertion at the top of the hot path rather than one at
    // every read.
    // A latched tap is injected as a held key for one frame, with that key's
    // "was down last frame" flag cleared so the edge actually fires.
    // While the navigation chart is open no key reaches the frame at all:
    // the hold zeroes the sim clock so axes cannot ramp, but the edge-triggered
    // toggles (gear, flaps, throttle cut, camera, pause) fire on a keypress
    // regardless of the clock, and a G pressed while reading the chart must
    // not drop the gear (Plan 14 Task 4). `clearMapInput` drains the latches
    // and `pressed` at both transitions; this keeps the frames in between
    // deaf too.
    // The open chart and the title screen hold the world the same way: no
    // keys reach the frame and the frame is paused (the chart's comment
    // above). The title's release path is its New game handler in `boot`.
    const chartOpen = navigationMapState.open || title.up()
    const latched: string[] = []
    if (!chartOpen) {
      if (pendingCameraCycle) latched.push(BINDINGS.cycleCamera[0])
      if (pendingTripleTime) latched.push(BINDINGS.toggleTripleTime[0])
      if (pendingPause) latched.push(BINDINGS.pause[0])
      if (pendingThrottleCut) latched.push(BINDINGS.throttleCut[0])
      if (pendingGear) latched.push(BINDINGS.toggleGear[0])
      if (pendingFlaps) latched.push(BINDINGS.toggleFlaps[0])
      if (pendingHook) latched.push(BINDINGS.toggleHook[0])
      if (pendingDropBomb) latched.push(BINDINGS.dropBomb[0])
      if (pendingFireRockets) latched.push(BINDINGS.fireRockets[0])
    }
    const frameKeys = chartOpen ? NO_KEYS : latched.length > 0 ? new Set([...pressed, ...latched]) : pressed
    const inputFrame =
      latched.length === 0
        ? frame!
        : {
            ...frame!,
            cyclePressed: pendingCameraCycle ? false : frame!.cyclePressed,
            tripleTimePressed: pendingTripleTime ? false : frame!.tripleTimePressed,
            pausePressed: pendingPause ? false : frame!.pausePressed,
            throttleCutPressed: pendingThrottleCut ? false : frame!.throttleCutPressed,
            gearPressed: pendingGear ? false : frame!.gearPressed,
            flapPressed: pendingFlaps ? false : frame!.flapPressed,
            hookPressed: pendingHook ? false : frame!.hookPressed,
            dropBombPressed: pendingDropBomb ? false : frame!.dropBombPressed,
            fireRocketsPressed: pendingFireRockets ? false : frame!.fireRocketsPressed,
          }
    // The Damage Model setting, read fresh every frame rather than captured:
    // the dialog is reachable from the title screen between sorties, and
    // `arcadeDamage()` is a plain boolean read off the model (no localStorage
    // round trip per frame). It reaches `stepCombat` through `advance`.
    let current = nextFrameState(inputFrame, frameMs / 1000, frameKeys, stepper, quality.arcadeDamage())
    if (inspectScenery) current = { ...current, eye: cameraTransformFor('chase', spec, current.render,
      { yawRad: 0, pitchRad: -Math.PI / 5 }) }
    if (title.up()) current = withPaused(current, true)
    if (navigationMapState.open) {
      current = withPaused(current, true)
      navigationMap.show(current.world, navigationMapState.selectedId)
    }
    pendingCameraCycle = false
    pendingTripleTime = false
    pendingPause = false
    pendingThrottleCut = false
    pendingGear = false
    pendingFlaps = false
    pendingHook = false
    pendingDropBomb = false
    pendingFireRockets = false
    frame = current
    // Plan 9 Task 7: read fresh every frame, since `loadScenario` can
    // reassign `scenarioEntities` wholesale between one frame and the next
    // (a scenario switch) -- the same reason `sunState`/`radarSweepRad` are
    // reassigned rather than mutated in place. Non-null: `scenarioEntities`
    // is set by the first `loadScenario` call, awaited well above, before
    // this loop is ever started (`loop.start()`, below).
    // Aliased on destructure: `player` below is the render loop's existing
    // name for the sim-side `playerAircraft(current.world)` entity (a few
    // lines down) -- naming this field the same thing as ScenarioEntities'
    // own `player: Airframe` would be a duplicate `const player` in one
    // scope, not a shadow (both are declared in this same function body).
    const { airframes, shipHandles, smokes, player: playerAirframe } = scenarioEntities!
    const player = playerAircraft(current.world)

    // Camera-relative: the world moves, the camera stays at the origin. float32
    // loses precision at 100 km, which shows as geometry jitter -- master spec §4
    // requires this from the first commit because retrofitting it means touching
    // every position in the renderer. `worldOffsetFor` and `toThreeOrientation`
    // are the pure arithmetic (frame.ts); this is only the `.set()` calls that
    // apply it -- Task 13 review, round 1: both bugs it fixed were coordinate
    // arithmetic sitting in this file with no tests, which is why that
    // arithmetic now lives in frame.ts instead.
    const worldOffset = worldOffsetFor(current.eye.position)
    scene.position.set(worldOffset.x, worldOffset.y, worldOffset.z)
    camera.position.set(0, 0, 0)
    const cameraOrientation = toThreeOrientation(current.eye.attitude)
    camera.quaternion.set(
      cameraOrientation.x,
      cameraOrientation.y,
      cameraOrientation.z,
      cameraOrientation.w,
    )

    // Every airframe, in world order, from `frame.poses` (Plan 12). The
    // airframe mesh's own geometry is built with +X as its nose (hellcat.ts),
    // matching sim convention exactly, so unlike the camera above it needs no
    // basis fix -- see frame.ts's `render` field doc.
    //
    // The player's is `poses[playerIndex]`, which is the SAME object as
    // `current.render` by construction (`posesFor`, frame.ts) -- so this loop
    // poses `playerAirframe.root` too, and it did so twice until the duplicate
    // `playerAirframe.root.position.set(current.render...)` lines were deleted here.
    current.poses.forEach((pose, i) => {
      const a = airframes[i]!.root
      a.position.set(pose.position.x, pose.position.y, pose.position.z)
      a.quaternion.set(pose.attitude.x, pose.attitude.y, pose.attitude.z, pose.attitude.w)
    })
    // The hulls. A ship has no attitude in this plan (`interpolateShip`), only
    // a heading, and `createShipMesh` puts its bow along local +x -- so the
    // yaw is the same `pi/2 - headingRad` about +y that `parkedAttitude` gives
    // a parked airplane, from the same compass convention.
    current.shipPoses.forEach((pose, i) => {
      const m = shipHandles[i]!.root
      m.position.set(pose.position.x, pose.position.y, pose.position.z)
      const q = qFromAxisAngle(v3(0, 1, 0), Math.PI / 2 - pose.headingRad)
      m.quaternion.set(q.x, q.y, q.z, q.w)
    })

    // The cockpit group (the panel) shares the PLAYER's exact pose: panel.ts
    // authors the panel in the same body frame, relative to the eye, so it
    // needs no separate transform here.
    cockpit.position.copy(playerAirframe.root.position)
    cockpit.quaternion.copy(playerAirframe.root.quaternion)

    // Cockpit mode must hide the external airframe (frame.ts's
    // `airframeVisibilityFor` doc comment has the occlusion measurement).
    // Cockpit interior geometry is a later plan's; until then the panel
    // floats in front of an invisible airframe, which is exactly the view a
    // pilot has.
    const visibility = airframeVisibilityFor(current.cameraMode)
    cockpit.visible = visibility.cockpitVisible
    playerAirframe.root.visible = visibility.hellcatVisible
    // Numeric gauges from the simulated tick; the attitude ball from the
    // INTERPOLATED attitude, because it is the one instrument compared
    // against something visible in the same frame. `current.controls` is
    // also the pilot's raw input, not part of `AircraftState` (state.ts:8),
    // which is why the throttle gauge needs it passed separately -- the same
    // vector the propeller spin below already reads.
    // `current.world.wind` reaches the AIRSPEED dial and the SPD field: both
    // read the air over the wings, not the ground track (Plan 8 review).
    // Plan 17. Frozen on pause by construction: `current.world.tick * DT +
    // current.world.accumulatorSeconds` is the same clock `skyTimeS` below
    // already uses for exactly this reason -- ticks do not advance while
    // paused. Contacts come from the same `current.world.aircraft` list
    // `aircraft()` diagnostics already reads.
    radarSweepRad = radarSweepAngle(current.world.tick * DT + current.world.accumulatorSeconds)
    radarContactList = radarContacts(player, current.world.aircraft, selectedRadarRangeMi)
    updatePanel(panel, spec, player.state, current.controls, makeTextTexture, current.render.attitude, current.world.wind)
    audio.update(audioInputsFrom(current))
    flightData.update(current.cameraMode, spec, player.state, current.controls, current.world.wind)
    timeBadge.setScale(current.timeScale)
    pauseBadge.setPaused(current.paused)
    paddlesBadge.setCue(paddlesFor(current))
    // Plan 6: every combat visual reads `World.combat` on THIS frame. The
    // readout and tracers are stateless views of it; the flashes are an
    // edge detector with its own memory (hitFlash.ts) because a hit's
    // record persists on the entity every frame afterward.
    combatReadout.setRecord(current.world.combat.aircraft[current.world.player])
    tracers.update(current.world.combat.projectiles)
    const flashes = nextHitFlashes(flashMemory, current.world.combat, current.world.aircraft, current.world.tick)
    flashMemory = flashes.memory
    for (const event of flashes.events) hitFlashes.fire(event)
    current.world.aircraft.forEach((a, i) => {
      const damage = current.world.combat.aircraft[a.id]!.damage
      smokes[i]!.set(damage.engine, damage.destroyedAt !== null)
    })
    // Plan 6b Task 8: stores on the airframe, ordnance in flight, ship
    // sinking/burning and structure collapse -- all stateless views of
    // `World.combat` except the impact pool, which (like the flashes above)
    // is an edge detector: a projectile leaving `combat.projectiles` is the
    // only signal a bomb or rocket detonated (`nextOrdnanceImpacts`'s own
    // doc comment).
    current.world.aircraft.forEach((a, i) => {
      const stores = current.world.combat.aircraft[a.id]?.stores
      if (stores !== undefined) airframes[i]!.setStores(stores.bombs, stores.rockets)
    })
    // Gear travel is multi-second (unlike position/attitude above), so a
    // non-interpolated per-tick read off `World.aircraft[i].state` causes no
    // visible jitter -- same reasoning as the `setStores` loop just above,
    // read off the same per-tick `World`, not the interpolated render pose.
    current.world.aircraft.forEach((a, i) => {
      airframes[i]!.setGear(a.state.gearFraction)
    })
    ordnance.update(current.world.combat.projectiles, current.eye.position)
    ordnance.updateEffects(frameMs / 1000)
    const ordnanceImpacts = nextOrdnanceImpacts(ordnanceMemory, current.world.combat.projectiles, current.world.tick)
    ordnanceMemory = ordnanceImpacts.memory
    for (const event of ordnanceImpacts.events) ordnance.spawnImpact(event.kind, event.position)
    current.world.ships.forEach((s, i) => {
      const damage = current.world.combat.ships[s.id]
      if (damage !== undefined) shipHandles[i]!.setDamage(damage.fire, damage.sinkingFraction)
    })
    // Structures: like the sinking/burning ships above, `sync` is handed the
    // CURRENT `World.combat.structures` map unconditionally every frame
    // (airfield.ts's own doc comment on `AirfieldHandle.sync`) rather than
    // edge-detected on destruction only -- a prior version called
    // `setDestroyed` just for currently-destroyed ids, which had no path
    // back to intact and left a Restart's fresh, healthy structures stuck
    // showing collapsed rubble. Every airfield handle sees the whole map
    // rather than tracking which airfield owns which structure; a handle
    // ignores ids it does not own.
    for (const h of airfieldHandles) h.sync(current.world.combat.structures)
    for (const h of airfieldHandles) h.update(frameMs / 1000)

    // Raised once per contact -- `shownImpactTick` is the guard, since the
    // player's `impact` stays non-null every frame after the airplane stops,
    // and this runs sixty times a second.
    const hit = player.impact
    if (hit !== null && shownImpactTick !== hit.tick) {
      shownImpactTick = hit.tick
      // Raw world metres, NOT `+ worldOffset`: `impactEffect.object` is a
      // child of `scene`, and `scene.position` is set to `worldOffset` every
      // frame just above, which already applies the camera-relative shift
      // once for every child -- the airframe, the sky and the terrain mesh
      // all set their positions the same way. Adding `worldOffset` here too
      // would apply it twice. The position is deliberately set once, at fire
      // time, and never refreshed: the effect is anchored at a fixed world
      // point, and `scene.position` moving each frame is what keeps it there
      // as the camera flies away.
      impactEffect.object.position.set(hit.position.x, hit.position.y, hit.position.z)
      impactEffect.fire(hit.surface)
      const killsSinceLastBank = killsSince(current.world.combat.aircraft[current.world.player]!.killsByType, scoredThroughKillsByType)
      const model = debriefModel(hit, player.state, killsSinceLastBank)
      scoredThroughKillsByType = current.world.combat.aircraft[current.world.player]!.killsByType
      const banked = bankMissionResult(model.score.total, hit.kind === 'ditched' ? 'ditched' : 'killed', killsSinceLastBank)
      showDebrief(model, banked, undefined)
    }
    // Gunfire and structural overload can destroy the player before contact.
    // `nextFrameState` already freezes that world; raise the same Restart path
    // as an impact instead of leaving the pilot held at HP 0 with no way out.
    const playerDamage = current.world.combat.aircraft[current.world.player]!.damage
    if (
      hit === null &&
      playerDamage.destroyedAt !== null &&
      shownDestructionTick !== playerDamage.destroyedAt
    ) {
      shownDestructionTick = playerDamage.destroyedAt
      const killsSinceLastBank = killsSince(current.world.combat.aircraft[current.world.player]!.killsByType, scoredThroughKillsByType)
      const model = destructionModel(player.state, playerDamage.attacker, killsSinceLastBank)
      scoredThroughKillsByType = current.world.combat.aircraft[current.world.player]!.killsByType
      const banked = bankMissionResult(model.score.total, 'killed', killsSinceLastBank)
      showDebrief(model, banked, undefined)
    }
    // A landing, raised once and holding the world under the dialog through
    // the pause rather than through a second freeze (frame.ts's `paused`).
    // Continue releases both; Restart goes through the handler above.
    if (current.landing.report !== null && !landingShown) {
      landingShown = true
      frame = withPaused(current, true)
      const killsSinceLastBank = killsSince(current.world.combat.aircraft[current.world.player]!.killsByType, scoredThroughKillsByType)
      const model = landingModel(
        current.landing.report,
        killsSinceLastBank,
        Object.fromEntries(current.world.ships.map((s) => [s.id, s.spec.name])),
      )
      scoredThroughKillsByType = current.world.combat.aircraft[current.world.player]!.killsByType
      const banked = bankMissionResult(model.score.total, 'landed', killsSinceLastBank)
      showDebrief(model, banked, () => {
        frame = acknowledgeLanding(frame!)
        landingShown = false
        debrief.hide()
      })
    }
    impactEffect.object.quaternion.copy(camera.quaternion)
    impactEffect.update(frameMs / 1000)
    hitFlashes.update(frameMs / 1000, camera.quaternion)

    // The sky dome's colour only depends on view direction, but its geometry
    // is centred on its own origin; re-centring that origin under the eye's
    // horizontal position each frame (the whole scene, sky included, is
    // translated by -eye above) keeps the horizon centred under the camera
    // horizontally. It is deliberately NOT re-centred vertically (y stays 0),
    // so the horizon sits very slightly below eye level at any nonzero
    // altitude -- e.g. about 0.76 degrees at a Tier 2 spawn 600 m up against
    // the dome's 45,000 m radius (atan(600/45000); negligible at the parked
    // default's few metres) -- rather than exactly at it. Fixing the
    // horizontal drift is what matters: left unfixed, it is unbounded over a
    // long flight and eventually carries the camera outside the dome; the
    // vertical offset is bounded by altitude and stays negligible.
    sky.position.set(current.eye.position.x, 0, current.eye.position.z)

    // The water gets the same treatment, and did not until the whole-branch
    // review (I-1): left at the world origin it slid out from under the
    // airplane, and at the spawn's 120 m/s its old half-extent was spent in
    // under three minutes. Its depth lookup stays anchored in world space.
    // The wave fade is a screen-space criterion, so it needs the real viewport
    // and field of view rather than the nominal ones the uniform defaults to.
    recentreOcean(
      water,
      current.eye.position.x,
      current.eye.position.z,
      current.eye.position.y,
      ((camera.fov * Math.PI) / 180) / Math.max(window.innerHeight, 1),
    )

    // Reselects the patches to draw for this frame's eye position. Inside the
    // camera-relative block above only in the sense that it takes the same
    // WORLD position the offset was built from -- the mesh's own vertex node
    // works in world metres and lets `scene.position` do the shift, exactly
    // as the water and markers do.
    terrain.update(current.eye.position.x, current.eye.position.z)
    vegetation?.update(current.eye.position.x, current.eye.position.z)

    // Gated on the flight still being live (whole-branch review I-1): once
    // the player's `impact` is set, `controlsFromKeys` keeps latching throttle
    // and `nextFrameState` keeps producing controls from it every frame (it
    // holds the world at zero elapsed time rather than stepping it -- see
    // `holding` in frame.ts), so an ungated spin would leave the propeller
    // turning at full speed on a wreck sitting in its own fireball. The
    // propeller belongs to the wrecked airplane; unlike the ocean below, it
    // should stop.
    if (player.impact === null) {
      playerAirframe.spinProp(current.controls.throttle * PROP_MAX_RAD_PER_SEC * (frameMs / 1000))
    }

    // `oceanTime` (DEV-only, from `?oceanTime=`) is a fixed override for
    // reproducing one ocean state on demand and stays exactly as fixed as it
    // is today; the accumulator below is added only to the sim-time
    // derivation it replaces, not to the override itself.
    if (player.impact !== null) postImpactOceanSeconds += frameMs / 1000
    // One clock for the sea and the sky (Plan 16a): the clouds drift on the
    // same simulated seconds the ocean's waves evolve on.
    const skyTimeS = oceanTime ?? current.world.tick * DT + current.world.accumulatorSeconds + postImpactOceanSeconds
    // Plan 16c: the sun creeps with the sim clock, and the light follows its
    // elevation and the eye's altitude -- photoreal Task 9, from the
    // atmosphere model (sky/palette.ts; its sky irradiance comes from a
    // table built once at boot and interpolated here).
    const hour = sunClock(scenarioTimeOfDay, skyTimeS)
    const { elevationDeg, azimuthDeg } = sunPosition(TERRAIN_HEADER.centreLatDeg, hour)
    const direction = sunDirectionWorld(elevationDeg, azimuthDeg)
    applySun(lights, atmospherePalette(current.eye.position.y, elevationDeg), direction, elevationDeg)
    // Phase A: a fixed exposure per sun elevation (exposure.ts), so dusk
    // reads dim but not black. One uniform write; no pipeline rebuild.
    framePipeline.setExposure(exposureFor(elevationDeg))
    sunState = { timeOfDay: hour, elevationDeg, azimuthDeg, direction: { x: direction.x, y: direction.y, z: direction.z } }
    clouds.update(current.eye.position, skyTimeS, current.world.wind)
    for (const cascade of cascades) {
      cascade.dispatch(skyTimeS)
    }
    // While GPU samples are being collected, a frame is NOT rendered until the
    // previous frame's timestamp resolve has landed. The paragraph after the
    // next explains why the guard alone stopped being enough on 2026-09-17.
    const sampling = renderer.hasFeature('timestamp-query') && gpuRenderTimesMs.length < FRAME_TIME_CAPACITY
    if (!(sampling && gpuResolvePending)) {
      // Plan 16b: the shadow map first, inside the same frame and the same
      // timestamp pool ('render'), so the budget below includes it.
      // Photoreal Task 8: the per-frame sky-view and aerial-perspective LUTs
      // at this frame's eye altitude (the world's y is true metres) and sun,
      // in the same timestamp pool as the passes below.
      if (!atmosphereOff) atmosphere.update(renderer, current.eye.position.y, direction, camera)
      if (shadow.enabled) {
        shadow.update(current.eye.position)
        renderer.setRenderTarget(shadow.target)
        renderer.render(shadow.scene, shadow.camera)
        renderer.setRenderTarget(null)
      }
      // Plan 17: the radar scope's own offscreen pass, the same shape the
      // cloud shadow map already uses, and for the same reason -- inside
      // the same frame and timestamp pool as the shadow pass above, so the
      // render-time budget includes it.
      radarScope.update(radarSweepRad, selectedRadarRangeMi, radarContactList)
      renderer.setRenderTarget(radarScope.target)
      renderer.render(radarScope.scene, radarScope.camera)
      renderer.setRenderTarget(null)
      // Photoreal Task 4: the temporal state (cloud history; since Task 6
      // TRAA too), fed only on frames that actually render (a frame skipped
      // above leaves the history where it was, so the next test measures
      // from the last RENDERED frame). Reset on a teleport or a stall
      // (`shouldResetHistory`), on unpause and on a camera-mode cut;
      // restart and scenario switch reset through `resetFlightUi`.
      // Photoreal Task 6: TRAA's history (and the world-fixed motion
      // vectors) reset on exactly the same discontinuities, with or without
      // a cloud pass -- a teleport smears the old view through TRAA as
      // surely as through the clouds.
      {
        const eye = current.eye.position
        const cut = (cloudHistoryEye !== null && shouldResetHistory({
          eye, prevEye: cloudHistoryEye, frameSeconds: (now - cloudHistoryAtMs) / 1000, timeScale: current.timeScale,
        }))
          || (cloudHistoryPaused && !current.paused)
          // A chase <-> cockpit cut is a new view, whatever the speed test
          // makes of a 10 m eye jump at this frame rate.
          || (cloudHistoryCameraMode !== null && current.cameraMode !== cloudHistoryCameraMode)
        if (cut) {
          cloudPass?.resetHistory()
          framePipeline.resetHistory()
        }
        cloudPass?.setEye(eye)
        framePipeline.setEye(eye)
        cloudHistoryEye = eye
        cloudHistoryAtMs = now
        cloudHistoryPaused = current.paused
        cloudHistoryCameraMode = current.cameraMode
      }
      framePipeline.render()
    }

    // One GPU timestamp sample per resolve; quality selection also uses it. Guarded on a pending
    // resolve rather than fired every frame because `resolveQueriesAsync`
    // hands back the SAME promise while one is outstanding
    // (WebGPUTimestampQueryPool, three@0.186.0), so an unguarded call would
    // record one frame's duration several times and bias the percentile
    // toward whatever frame happened to be slow enough to still be resolving.
    // The resolve itself is a separate command buffer submitted after the
    // pass, so it cannot inflate the duration it is reading -- it makes the
    // frame slightly heavier without making the measurement wrong.
    //
    // The guard's own bias, stated because it is the obvious objection and it
    // is not free (review fix round 1, m7): skipping frames while a resolve is
    // outstanding preferentially skips frames during which the GPU was busy,
    // which is exactly when a resolve takes longer -- so in principle this can
    // under-sample the slow tail it is meant to measure. Measured 2026-09-14
    // it did not, because it almost never skipped: three 5-second windows at
    // 100 m / 3,000 m / 8,000 m recorded 516 / 515 / 514 GPU samples against
    // 517 / 515 / 514 frames, i.e. within one sample of 1:1.
    //
    // **2026-09-17: that ratio dropped to 0.65 and the samples became
    // garbage, which is why frames are now serialized on the resolve while
    // sampling.** Plan 13's first pass made the frame heavy enough that a
    // resolve outlives the frame. three's pool then hands the NEXT frame the
    // same query slots (it resets `currentQueryIndex` when the resolve is
    // snapshotted, not when it completes), so the resolve reads a begin
    // stamp from one frame and an end stamp from another: a run over Leyte
    // read a strict alternation of 6.0 and 1.6 ms while the same scene,
    // rendered only after each resolve completed, read a flat 6.03 -- and a
    // sample covering TWO pending frames read 2.0, which no sum of frames
    // can. The one-time ocean tier choice below reads these percentiles, so
    // it was choosing on noise too. Serializing costs nothing measurable when
    // resolves keep up (pre-scenery main: 599 samples of 601 frames, and
    // 1.84 ms either way) and halves the frame rate only while the GPU is
    // heavy AND samples are still wanted: the first FRAME_TIME_CAPACITY
    // frames after boot or a `resetFrameTimes()`, i.e. the tier choice and
    // a Tier 2 budget window. Production never tracks timestamps
    // (renderer.ts), so it never serializes.
    void adaptOceanQuality()
    if (sampling && !gpuResolvePending) {
      gpuResolvePending = true
      // The sample is the frame's whole GPU cost, render AND compute
      // (photoreal spec §2; 2026-09-24): the render pool (shadow, radar, the
      // scene pass and the pipeline's output quad -- all `renderer.render`
      // calls, proven by the Task 2 expensive-node experiment), three's own
      // compute pool (empty today, `undefined` until something calls
      // `renderer.compute`; Phase B adds dispatches there), and the native
      // ocean FFT, which runs on the raw device outside both pools and times
      // itself (ocean/timing.ts). The ocean term is each cascade's most
      // recently measured dispatch -- its timer skips dispatches while its
      // own readback is pending, so there is no exact per-frame pairing; the
      // dispatch is the same work every frame, so the latest is that frame's.
      void Promise.all([renderer.resolveTimestampsAsync('render'), renderer.resolveTimestampsAsync('compute')])
        .then(([ms, computeMs]: [number | undefined, number | undefined]) => {
          // `undefined` when tracking is off (three warns once and returns
          // nothing); 0 when the pool had nothing pending. Neither is a frame.
          if (typeof ms !== 'number' || ms <= 0) return
          gpuRenderTimesMs.push(ms)
          const ocean = cascades.map(c => c.latestComputeMs())
          // Until every cascade has one measurement (boot, a tier swap) the
          // frame's cost is unknown; skipping it beats under-reporting it.
          if (ocean.some(t => t === undefined)) return
          gpuFrameTimesMs.push(ms + (computeMs ?? 0) + ocean.reduce<number>((sum, t) => sum + (t ?? 0), 0))
        })
        .finally(() => {
          gpuResolvePending = false
        })
    }

    overlay?.update({
      frameMs,
      fps: 1000 / Math.max(frameMs, 0.001),
      stepsRun: current.stepsRun,
      droppedSteps: current.droppedSteps,
      tick: current.world.tick,
      adapter: adapterVerdict.summary,
    })
  }
  // If the device went away while `boot` was still setting up, the failure
  // screen is already showing; starting a loop now would render onto a
  // disposed device behind it.
  if (deviceLost) return
  loop = createRafLoop(frameFn)
  loop.start()

  // Deliberately NOT awaited: the pyramid is 702 KB over FIVE requests --
  // L8 down to L4, the only levels any ring can sample (`coarsestFetchedLevel`
  // in lod.ts; it said "nine" until 2026-09-14, left over from before review
  // round 1 stopped fetching L9-L12 that nothing could draw). An AIRBORNE
  // spawn is flyable before any of it lands (the mesh draws nothing until a
  // level arrives -- mesh.ts); a GROUND spawn is held at zero elapsed time
  // until this loop hands the physics its field (`FrameState.groundSpawn`'s
  // hold, frame.ts) -- either way the scene keeps rendering while this runs.
  // Each level lands in its own texture, coarsest first.
  //
  // One consequence worth knowing when watching it load: the rings are drawn
  // from the level they match, and the near rings all read L4, which is 526
  // of those 702 KB and lands LAST. So the far field appears first and the
  // ground under the airplane fills in at the end -- the opposite order to
  // what "coarse first" suggests, and correct: there is no coarser level a
  // near ring could legitimately draw that its neighbours would agree with.
  //
  // A level that will not load routes to the same screen as unloadable
  // aircraft content, because it is the same fault: content the build was
  // supposed to ship. Carrying on would leave a sea with no islands in it,
  // which looks exactly like the game working.
  //
  // The body is `applyTerrainLevel`, in load.ts, and it is there rather than
  // written out here because nothing headless can reach a callback inside
  // `boot()`: the physics half of it was once missing outright and the whole
  // suite stayed green (that comment is on the function). `frame` is non-null
  // here -- it is assigned well above and the loop is already running, the
  // same guarantee `frameFn`'s single `!` rests on.
  //
  // `settleOnTerrain` (frame.ts) runs exactly once, on the transition where
  // `applyTerrainLevel` first gives a parked world a real physics field
  // (`finestFetchedLevel` above -- L2 from `eef5b4d` on 2026-09-18 until Task
  // 2 (2026-09-24) made it tier-dependent, L4 before that -- the only level
  // `physicsFieldFor` ever returns non-null for) -- correcting
  // `PARKED_PLACEHOLDER_Y_M` (`src/sim/scenario.ts`, where a parked entity's
  // altitude comes from) to the real ground height under EVERY parked
  // airplane, the wingman included. Without this the hold above buys
  // nothing: the flight would resume from underground or a tolerance-width
  // above it the instant terrain arrived, exactly the race Task 14 exists to
  // close.
  void loadTerrainProgressively((level, data) => {
    const before = frame!
    const next = applyTerrainLevel(terrain, before, level, data, finestFetchedLevel)
    // The field, on the one transition where it first exists, or `null` on
    // every other callback. Written this way rather than as a boolean so the
    // narrowing survives both uses below -- and so the runway and
    // `settleOnTerrain` cannot end up keyed off two separately-written
    // conditions that could drift apart.
    const arrived = before.world.terrain === null ? next.world.terrain : null
    // Task 11: the strip is draped over the real heightfield, so it cannot be
    // built until there is one. `physicsFieldFor` returns non-null for
    // `finestFetchedLevel` alone, so this runs exactly once per page load --
    // and unconditionally, not only for a ground spawn: an airfield is a
    // place in the world, and a DEV `?spawnX/Y/Z` flight should be able to
    // see it too.
    if (arrived !== null) {
      // One strip and one set of airfield scenery per airfield the world
      // carries (Plan 12), not one hardcoded Tacloban.
      const airfields = next.world.airfields.map((a) => ({ runway: createRunway(arrived, a), airfield: createAirfield(arrived, a) }))
      scene.add(...airfields.flatMap((f) => [f.runway, f.airfield.object]))
      airfieldHandles = airfields.map((f) => f.airfield)
      // Towns and villages (Plan 13d Task 3), built before `vegetation` so its
      // `hutFootprints` can be handed straight in: a hut is never inside an
      // airfield's own clearing (excluded during placement, `townHutFootprints`),
      // so nothing else keeps trees off it the way `inAirfieldClearing` already
      // keeps them off `AIRFIELD_HUTS`.
      const towns = createTowns(arrived, placesData as { towns: readonly Town[] }, next.world.airfields)
      scene.add(towns.object)
      vegetation = createVegetation(arrived, next.world.airfields, towns.hutFootprints)
      // Anchor at the real eye position BEFORE `setTier`/`setCover`, each of
      // which forces its own full recompose at `lastX/lastZ`: left at their
      // (0, 0) default -- open sea, never where the airplane actually is --
      // both recomposes would be thrown away the instant the next frame's
      // `vegetation.update(current.eye...)` below finds a different cell and
      // recomposes a third time. One wasted recompose is cheap; this was two
      // (whole-branch review, 2026-09-18).
      vegetation.update(next.eye.position.x, next.eye.position.z)
      // The tier may already have been chosen by the time terrain arrives --
      // by the probe, or by a Settings pick made while the terrain loaded.
      // `sceneryTier` is where `applySceneryTier` parks it for exactly this
      // moment, since `vegetation` does not exist to receive it any earlier.
      vegetation.setTier(sceneryTier)
      if (cover !== null) vegetation.setCover(cover)
      scene.add(vegetation.object)
    }
    frame = next.groundSpawn && arrived !== null ? settleOnTerrain(next, arrived) : next
  }, finestFetchedLevel).catch((err: unknown) => {
    loop?.stop()
    showFailure(root, 'bad-content', err instanceof Error ? err.message : String(err))
  })

  window.addEventListener('resize', () => {
    // A resize after a device loss would reconfigure a disposed swap chain.
    if (!loop?.running) return
    renderer.setSize(window.innerWidth, window.innerHeight)
    camera.aspect = window.innerWidth / window.innerHeight
    resizePanel(panel, camera.aspect)
    camera.updateProjectionMatrix()
  })
}

void boot().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e)
  // Both boot-time throws carry their kind as the message, so route each to
  // its own screen rather than collapsing them (review 2026-09-13).
  const kind: FailureKind =
    msg === 'no-webgpu' ? 'no-webgpu' : msg === 'no-adapter' ? 'no-adapter' : 'unknown'
  showFailure(root, kind, msg)
})
