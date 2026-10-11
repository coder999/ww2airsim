import { Group, PerspectiveCamera, Scene, Vector2, Vector3 } from 'three'
import { setEnsignTime } from './scene/ensign.js'
import { positionWorld } from 'three/tsl'
import { applyRenderScale, initRenderer, normalizeGpuError, renderScaleFromQuery } from './renderer.js'
import { showFailure, type FailureKind } from './failure.js'
import { buildScenarioEntities, loadRegisteredAirframe, type ScenarioEntities } from './scenarioEntities.js'
import { entityViews } from './mission/entityViews.js'
import { makeShipViewLoader } from './scene/shipModels.js'
import { probeShipSurface, smokeOriginWorld } from './scene/ship.js'
import { applyShipGunLaying } from './scene/shipGunLaying.js'
import { airframeUpdateFor, turretAimFor } from './airframeUpdate.js'
import { createRafLoop, type RafLoop } from './rafLoop.js'
import { CAMERA_VFOV_DEG, cameraTransformFor, lookFromQuery, type CameraMode, type EyeTransform } from './camera.js'
import { makeTextTexture } from './scene/text.js'
import { aircraftUrl, BEACHES_URL, finestFetchedLevelFor, SCENARIO_ID } from './content.js'
import { createBootQuality } from './bootQuality.js'
import { applyDifficulty } from '../sim/difficulty.js'
import type { QualityTierName } from './quality.js'
import { createOverlay } from './overlay.js'
import { createLegend } from './legend.js'
import { emptyStores, racksLabel } from '../sim/weapons/stores.js'
import { floodListRad } from '../sim/weapons/flooding.js'
import { createAudioSystem, type AudioSystemMemory } from '../audio/system.js'
import { createWebAudioBackend } from '../audio/webAudio.js'
import { audioInputsFrom, radioLanguageFor, spatialInputsFrom } from './audio.js'
import { createFlightData } from './flightData.js'
import { createTimeBadge } from './timeBadge.js'
import { createAutopilotBadge } from './autopilotBadge.js'
import { createPauseBadge } from './pauseBadge.js'
import { createPauseScreen, type PauseScreenHandle } from './pauseScreen.js'
import { createPaddlesBadge } from './paddlesBadge.js'
import { createMissionHud, missionDiagnostics } from './mission/hud.js'
import { landingDisposition } from './mission/landingFlow.js'
import { withMissionDebrief } from './mission/debriefMission.js'
import { COLLISION_ATTACKER_PREFIX, collisionShipName } from '../sim/shipCollision.js'
import { createDebrief, debriefModel, destructionModel, killsSince, landingModel, withNotRecorded, type DebriefModel } from './debrief.js'
import { CLOSED_NAVIGATION_MAP, closeNavigationMap, createMissionMap, openNavigationMap, selectNavigationDestination } from './missionMap.js'
import { createTitleScreen, DEFAULT_LOADOUT, isKnownScenarioId, SCENARIO_OPTIONS } from './titleScreen.js'
import { loadFlyableAircraft, loadOrdnanceNames } from './sortie/flyableIndex.js'
import { bootLoadout } from './sortieFlow.js'
import { createBootProgress } from './bootProgress.js'
import { track } from './analytics.js'
import { bankSortie, loadRoster, saveRoster, type LogOutcome, type SortieFacts } from './roster.js'
import { recordDevSortiesFromQuery, sortieIsDev } from './devRecord.js'
import { friendlyFireOf, friendlyFireRadio, withDischarge } from './discharge.js'
import { EMPTY_SEGMENT, landingKind, stepSegment, type FlightSegment } from './flightRecord.js'
import { zeroKillsByType, type TargetType } from '../sim/weapons/targetType.js'
import { CLOUD_TIERS, applyCloudTune, cloudDebugFromQuery, cloudTierFromQuery, createClouds, type CloudTierName } from './scene/clouds.js'
import { createCloudPass, type CloudPass } from './scene/cloudPass.js'
import { FX_CATALOG } from './fx/catalog.js'
import { NO_FX_MEMORY, nextFxEvents, type FxMemory } from './fx/events.js'
import { createFxPass, type FxPass } from './fx/fxPass.js'
import { fxQueryFrom } from './fx/query.js'
import { sheetLayout } from './fx/sheetManifest.js'
import { loadFxSheets, type FxSheetTextures } from './fx/sheets.js'
import { stressRounds, stressScene, type FxStressName, type FxStressScene } from './fx/stress.js'
import { createFxSystem, fxDtSeconds, type FxSystem } from './fx/system.js'
import { FX_TIERS } from './fx/tiers.js'
import { shouldResetHistory } from './scene/cloudHistory.js'
import { createCloudField } from './scene/cloudField.js'
import { MAP_SIDE_M, cloudShadowFromQuery, createCloudShadow } from './scene/cloudShadow.js'
import { loadSkyNoise } from './sky/load.js'
import { DEFAULT_TIME_OF_DAY, sunClock, sunDirectionWorld, sunPosition, timeOfDayFromQuery } from './sky/sun.js'
import { atmospherePalette, warmIrradianceTable } from './sky/palette.js'
import { atmosphereFromQuery, disposeAtmosphereLuts, getAtmosphereLuts, type AtmosphereLutName } from './sky/atmosphereLuts.js'
import type { CloudLayer } from '../sim/scenario.js'
import { createTracers } from './scene/tracers.js'
import { createAaTracers } from './scene/aaTracers.js'
import { createOrdnance } from './ordnance.js'
import { loadStoreVisuals } from './scene/storeModels.js'
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
  type FrameState, withPaused, withTerrain, acknowledgeLanding, surfaceHeightFor,
} from './frame.js'
import { createRecorder } from '../replay/recorder.js'
import { replayPosesAt, type ReplayPoses } from '../replay/view.js'
import {
  applyReplayCommand, manualReplayAvailable, manualWindow, autoWindow, startReplay as startPlayer, stepReplay,
  type ReplayCommand, type ReplayPlayer,
} from '../replay/player.js'
import {
  cycleCamera, effectiveCamera, initialCameraState, replayEye, selectCamera, stepCameraState, toggleLock, toggleSpin,
  type ReplayCameraId, type ReplayCameraState,
} from '../replay/cameras.js'
import { replayKeyAction } from '../replay/keys.js'
import { rebuildReplayFx, stepReplayFx } from '../replay/fxReplay.js'
import { stepFlow, type ReplayFlow, type ReplayFlowEffect, type ReplayFlowEvent } from '../replay/flow.js'
import { REPLAYING_CLASS, createReplayBar, replayBarModel } from './replayBar.js'
import { createOcean, landWeightAt, recentreOcean } from './ocean/mesh.js'
import { loadDepth, type DepthField } from './ocean/depth.js'
import { beaufortFromQuery, oceanTimeFromQuery, seaStateFor } from './ocean/weather.js'
import { createOceanCompute, type OceanCompute } from './ocean/compute.js'
import { OCEAN_TIERS, oceanTierFromQuery, tierForFrameIntervalsMs } from './ocean/tiers.js'
import { cascadeOptions } from './ocean/bands.js'
import { OCEAN_EXTENT_M } from './horizon.js'
import { createRunway } from './scene/runway.js'
import { createAirfield } from './scene/airfield.js'
import { createTowns, type Town } from './scene/towns.js'
import { createVillages, type Village } from './scene/villages.js'
import { createVegetation, coverLookup, type CoverLookup } from './scene/vegetation.js'
import { loadBeaches } from './scene/beaches.js'
import placesData from '../../content/scenery/places.json' with { type: 'json' }
import villagesData from '../../content/scenery/villages.json' with { type: 'json' }
import { createSky } from './scene/sky.js'
import { applySun, createLighting, cumulusCover } from './scene/lighting.js'
import { createTerrainMesh } from './terrain/mesh.js'
import { loadSurfaceTextures, terrainTexturesFromQuery, type SurfaceTextures } from './terrain/surfaceTextures.js'
import { applyTerrainLevel, loadTerrainProgressively, TERRAIN_HEADER } from './terrain/load.js'
import { createPanel, resizePanel, updatePanel } from './scene/panel.js'
import { createGunPipper, poseGunPipper } from './scene/gunPipper.js'
import { createSteeringArrow } from './scene/steeringArrow.js'
import { createImpactMarker, createImpactPredictor, impactLabel, impactMarkerShown } from './scene/impactMarker.js'
import { createImpactBadge } from './impactBadge.js'
import { createRadarScope } from './scene/radarScope.js'
import { loadScenarioBundle, loadScenarioFile } from './scenarioLoad.js'
import { worldFromScenario, type ScenarioBundle } from '../sim/scenario.js'
import type { GodMode } from '../sim/godMode.js'
import { AXIS_VARIANTS, scenarioFileFor } from '../sim/sortie.js'
import { DEV_STORES_SPEC_ID, needsDevStores, sortieBundle, startKindOf, validateSortie, type SortieChoice } from '../sim/sortie.js'
import { parseAircraftSpec } from '../sim/content.js'
import type { AircraftSpec } from '../sim/flight/schema.js'
import { rebuildStructures } from '../sim/weapons/structures.js'
import { airVelocity, step, DT } from '../sim/flight/model.js'
import { stepChecked } from '../sim/invariants.js'
import { heightAt, SEA_LEVEL_M, type TerrainField } from '../sim/world/terrain.js'
import { onGround, supportedContact } from '../sim/ground.js'
import { groundUnder } from '../sim/world/ground.js'
import { deckOf, decksOf } from '../sim/world/deck.js'
import { paddlesCue, type PaddlesCue } from '../sim/paddles.js'
import { playerAircraft, withAircraftState, type World } from '../sim/loop.js'
import { sideOf } from '../sim/sides.js'
import { NEUTRAL } from '../input/keyboard.js'
import { LOOK_CENTRE } from '../input/lookAround.js'
import { addMouse, NO_MOUSE, ORBIT_ZERO, wheelNotches, type MouseDelta } from '../input/orbit.js'
import { DEFAULT_ASSIST_SETTINGS } from '../assists/index.js'
import {
  hasSpawnOverride,
  initialAircraftState,
  pilotSkillFromQuery,
  scenarioIdFromQuery,
  quickLaunchFromQuery,
  spawnPositionFromQuery,
} from './spawn.js'
import { GREEN_SKILL, VETERAN_SKILL } from '../sim/ai/pilot.js'
import { length, v3, type Vec3 } from '../sim/math/vec3.js'
import { qFromAxisAngle, qRotate } from '../sim/math/quat.js'
import { FRAME_TIME_CAPACITY, type ImpactMarkerDiagnostics, type Ww2Diagnostics } from './diagnostics.js'
import { antiAliasingFromQuery, createFramePipeline, sharpenFromQuery } from './pipeline.js'
import { exposureFor, toneMapFromQuery } from './exposure.js'
import { coverFieldFor, loadCover } from './landcover/load.js'

// index.html always contains #app -- it is the mount point the script tag is
// loaded from, so this assertion is safe at the entry point.
const root = document.getElementById('app')!

/** What one frame draws: the live `FrameState`, or a recorded moment during
 *  an instant replay (plan Task 7). Only the fields the drawing reads. */
type RenderView = Pick<FrameState, 'world' | 'eye' | 'poses' | 'shipPoses' | 'render' | 'controls' | 'cameraMode' | 'paused' | 'timeScale'>

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

/** Ship models load through the shared cache; one that fails draws boxes AND lands in
 *  `validationErrors`, which E2E asserts empty (ship-models spec §3.4). */
const loadShips = makeShipViewLoader((message) => { validationErrors.push(message) })

/**
 * Frame intervals, milliseconds, since the last `window.__ww2.resetFrameTimes()`
 * -- the same `now - last` the dev overlay already shows, collected so E2E's
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
 * what `gpuFrameTimesMs` itself held until 2026-09-24. The sampling window's capacity counter:
 * a combined sample can be skipped (see the resolve below), this one cannot.
 */
const gpuRenderTimesMs: number[] = []

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
  /** A3: Form 2's takeoff hour for the sortie being launched; undefined flies the scenario's own. */
  let pickedTimeOfDay: number | undefined
  // Hoisted beside the hour it overrides: `onNewGame`'s same-scenario path reads it, and the title is clickable before boot reaches the sky.
  const forcedTimeOfDay = import.meta.env.DEV ? timeOfDayFromQuery(location.search) : undefined
  /** A2: applies a newly loaded scenario's weather (clouds, hour, sea state)
   *  to the live sky and ocean. Null until boot has built them; boot's own
   *  first `loadScenario` reads the bundle directly instead. */
  let applyScenarioWeather: ((weather: ScenarioBundle['scenario']['weather']) => void) | null = null
  let sunState = { timeOfDay: DEFAULT_TIME_OF_DAY, elevationDeg: 90, azimuthDeg: 180, direction: { x: 0, y: 1, z: 0 } }
  /** Photoreal Task 9 fix 2: the boot-time irradiance table build, ms (DEV readout). */
  let irradianceTableMs: number | null = null
  // Plan 17, read by the DEV hook's `radar()` below and by Task 3's render
  // code; assigned every frame in the render loop, the same hoist-and-
  // reassign shape `sunState` above uses so both the loop and this closure
  // see the latest value.
  let radarSweepRad = 0
  let radarContactList: readonly RadarContact[] = []
  // The sortie the forms (or the boot default) chose -- scenario, aircraft,
  // loadout, Dev -- is `chosen`, declared at the `?scenario=` resolution
  // below, the first point its scenario is known. `buildWorld` reads it on
  // every call (boot's own and Restart's), so a Restart keeps the same
  // loadout (Plan 6b spec §5) with no separate plumbing. Nothing reads it
  // earlier: the title that fires `onNewGame` is built after it.
  /**
   * The pilot roster and this life's scoring baseline (Plan 9 Task 6),
   * hoisted here rather than left at their Task 6 narrative position (by
   * `bankMissionResult`, further down) for the exact reason `frame` and `bundle`
   * are: the `onNewGame` closure just below reads and reassigns
   * all three on every New Game, and that closure is reachable the instant
   * the title paints -- long before `boot`'s own several `await`s (the
   * renderer, the initial scenario fetch, sky noise, the ocean cascades, the
   * depth field) finish running. A `let` declared at its OLD narrative
   * position, well after those awaits, sat in its temporal dead zone for
   * that whole stretch: any New Game click landing in it -- trivially
   * reachable by a scripted E2E test, and not implausible for a fast
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
  /** The flight since the last New game / Restart / bank (dossier spec
   *  §B.2); reset at exactly the places `scoredThroughKillsByType` is, so a
   *  land -> Continue -> crash logs two segments that do not overlap. */
  let segment: FlightSegment = EMPTY_SEGMENT
  let segmentTick = 0
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
  // Sortie forms (spec, Wiring): the aircraft the loaded bundle's player
  // flies, so `onNewGame` rebuilds the entities when only the aircraft
  // changed (Review Focus 5); and the Dev stores layout (SF-R2), fetched
  // once, the first time a Dev sortie hangs stores on a spec without any.
  let loadedAircraftSpec: string | null = null
  // True from the moment a New game click starts a scenario/aircraft reload
  // until the rebuilt frame replaces the old one. The player's airframe and
  // the engine audio belong to the OLD sortie until then, so both stay hidden.
  let swapPending = false
  let devStores: AircraftSpec['stores'] = undefined
  // Read once, right after the FIRST `loadScenario` call below, for `spec`:
  // every scenario flies the one shipped flight model, `f6f-hellcat` (design
  // doc §5, `content/scenarios/*.json` spec fields, unchanged by Task 6 --
  // only the RENDERED mesh is now the Wildcat, via `loadWildcat()`), so
  // nothing else ever needs a later scenario's world.
  let scenarioWorld: World<undefined> | null = null
  let spawnedAt: Vec3 | null = null
  // `airframes`/`shipHandles`/`player`, together --
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
   * `airframes`/`shipHandles`/`player`
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
  /** God mode for the flight about to start (Dev only): the racks as launched are captured here, since `advance` cannot recover them once a bomb has gone. */
  let godMode: GodMode | undefined
  const godFor = (world: World, wanted: boolean): GodMode | undefined =>
    wanted ? { stores: world.combat.aircraft[world.player]!.stores } : undefined
  const loadScenario = async (choice: SortieChoice): Promise<void> => {
    // The chosen aircraft replaces the scenario's player spec before the spec
    // fetch; the choice is validated against the rules (sortie spec: an
    // illegal non-Dev choice fails loudly, by name, through the caller's
    // showFailure); and a Dev loadout on a spec with no stations hangs the
    // Hellcat's layout (SF-R2, SF-R3).
    // Some missions have a second file for a Japanese pilot (`AXIS_VARIANTS`): which one loads depends on the side of the airplane chosen.
    let scenarioFile = choice.scenarioId
    if (AXIS_VARIANTS[scenarioFile] !== undefined) {
      const res = await fetch(aircraftUrl(choice.aircraftSpec))
      if (!res.ok) throw new Error(`Failed to fetch content ${aircraftUrl(choice.aircraftSpec)}: ${res.status} ${res.statusText}`)
      scenarioFile = scenarioFileFor(scenarioFile, parseAircraftSpec(await res.json()).side)
    }
    const nextBundle = await loadScenarioBundle(scenarioFile, fetch, choice.aircraftSpec)
    const spec = nextBundle.aircraftSpecs[choice.aircraftSpec]!
    const option = SCENARIO_OPTIONS.find((o) => o.value === choice.scenarioId)
    validateSortie({ devScenario: option?.dev === true, start: startKindOf(nextBundle.scenario), spec, loadout: choice.loadout, dev: choice.dev })
    if (needsDevStores(spec, choice.loadout) && devStores === undefined) {
      const res = await fetch(aircraftUrl(DEV_STORES_SPEC_ID))
      if (!res.ok) throw new Error(`Failed to fetch content ${aircraftUrl(DEV_STORES_SPEC_ID)}: ${res.status} ${res.statusText}`)
      devStores = parseAircraftSpec(await res.json()).stores
    }
    const nextScenarioWorld = worldFromScenario(sortieBundle(nextBundle, choice.loadout, devStores), null, choice.loadout)
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
    loadedAircraftSpec = choice.aircraftSpec
    scenarioEntities = await buildScenarioEntities(scene, nextScenarioWorld, scenarioEntities, loadRegisteredAirframe, loadShips)
    applyScenarioWeather?.(nextBundle.scenario.weather)
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
   * every ship's loop, which is a Deterministic assertion on every commit
   * (`tests/sim/scenario.test.ts`) and has no business throwing in a browser
   * -- least of all out of the Restart button.
   *
   * `chosen.loadout` (Plan 6b Task 9; sortie forms), not a parameter: reading it here rather
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
    const w = worldFromScenario(sortieBundle(bundle!, chosen.loadout, devStores), null, chosen.loadout)
    // God mode (Dev only): from the title screen's checkbox, or `?god=1` in a
    // DEV build for quick launches and tests. Captured per world, so a Restart
    // refills the racks it counts against.
    godMode = godFor(w, (chosen.dev && chosen.god === true) || (import.meta.env.DEV && new URLSearchParams(window.location.search).get('god') === '1'))
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
      structures: rebuildStructures(w.structures, w.airfields, terrain),
    }
    // M5: the Settings dialog's Difficulty, baked into the world this sortie starts from (so a pick takes
    // effect at the next launch or Restart; `sim/difficulty.ts` says why). Veteran returns it unchanged.
    const built = override
      ? withAircraftState(
          {
            ...withTerrainField,
            aircraft: withTerrainField.aircraft.map((a) => (a.id === w.player ? { ...a, parked: false } : a)),
          },
          w.player,
          initialAircraftState(spawnedAt!, false),
        )
      : withTerrainField
    return applyDifficulty(built, quality.difficulty())
  }

  // Plan 17 follow-up: which scenario this boot loads, resolved and
  // whitelisted before the title screen exists so the scenario picker can
  // preselect it. `?scenario=` now reaches production too -- the DEV-only
  // gate that used to sit here is gone, and `isKnownScenarioId` is what
  // makes that safe: any format-valid id that is not a `SCENARIO_OPTIONS`
  // row (Dev-only test beds included, sortie spec A2) fails here, before anything loads,
  // rather than reaching `loadScenarioBundle` and failing on a missing file.
  // This one synchronous check does not touch the "title screen before
  // anything slow" ordering below -- there is nothing to await here.
  let requestedScenarioId: string
  // The quick launch (sortie spec A6): skips the title and flies a Dev
  // sortie. Parsed here so a bad `aircraft`/`loadout` fails like a bad id.
  let quick: ReturnType<typeof quickLaunchFromQuery> = null
  try {
    requestedScenarioId = scenarioIdFromQuery(window.location.search, SCENARIO_ID)
    if (!isKnownScenarioId(requestedScenarioId)) {
      throw new Error(`scenario: ${JSON.stringify(requestedScenarioId)} is not a scenario this build ships`)
    }
    quick = quickLaunchFromQuery(window.location.search, loadFlyableAircraft().map((f) => f.spec.id))
  } catch (err) {
    showFailure(root, 'bad-content', err instanceof Error ? err.message : String(err))
    return
  }
  // The boot sortie: the scenario's own aircraft and today's default loadout,
  // so a boot world is what it was before the sortie forms. A racks-only
  // aircraft cannot legally carry Both, so `bootLoadout` falls back to the
  // briefing recommendation (then Clean) for that case. A quick launch
  // picks its own aircraft and loadout, the recommendation standing in for an
  // absent loadout, always with Dev available (A6).
  const bootOption = SCENARIO_OPTIONS.find((o) => o.value === requestedScenarioId)!
  const flyable = loadFlyableAircraft()
  const initialLoadout = bootLoadout({ options: SCENARIO_OPTIONS, flyable, dev: bootOption.dev }, requestedScenarioId, bootOption.aircraft)
  let chosen: SortieChoice = quick === null
    ? { scenarioId: requestedScenarioId, aircraftSpec: bootOption.aircraft, loadout: initialLoadout, dev: bootOption.dev }
    : { scenarioId: requestedScenarioId, aircraftSpec: quick.aircraft ?? bootOption.aircraft, loadout: quick.loadout ?? bootOption.recommendedLoadout ?? DEFAULT_LOADOUT, dev: true }
  // Sortie spec A5: whether the flight in progress NEEDED Dev, which is what
  // gates recording (not whether the box was checked). Set by `onNewGame`
  // from the loaded bundle; before that, `true` only for a quick launch (A6),
  // which flies with no pilot and records nothing.
  let devSortie = quick !== null
  // SF-R6: a DEV-build-only switch that records a Dev sortie anyway, read once.
  const recordDevSorties = import.meta.env.DEV ? recordDevSortiesFromQuery(window.location.search, true) : false
  const sortieNeededDev = (choice: SortieChoice): boolean =>
    sortieIsDev(SCENARIO_OPTIONS.find((o) => o.value === choice.scenarioId)!, bundle!.aircraftSpecs[choice.aircraftSpec]!, choice.loadout, false)

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
  // Spec §5 step 1: a saved choice means the probe (`adaptQuality`,
  // below) never runs at all -- the "probe once ever" rule -- so this starts
  // pre-latched in that path rather than the probe measuring and then
  // discarding its own result.
  //
  // Declared HERE, immediately beside `quality`, rather than down next to
  // the probe where it used to live (Task 9 review): the `__ww2`
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
  // `content.ts`'s `INTERIM_ASSET_QUALITY_TIER` -- see that constant, and
  // `BootQuality.assetQuality`.
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
  // The title's loading strip (loading spec §A.2): created before the title
  // so its first build shows the locked state, and advanced below at each
  // stage this function already passes through.
  const boot = createBootProgress()
  const title = createTitleScreen(root, requestedScenarioId, (choice, pilotId) => {
    chosen = choice
    pickedTimeOfDay = choice.timeOfDay
    track('sortie_launched', { mission: choice.scenarioId, aircraft: choice.aircraftSpec, loadout: choice.loadout })
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
    segment = EMPTY_SEGMENT
    // A click is the user gesture the autoplay policy wants; this is the
    // first-visit resume the audio handoff left open. Called unconditionally
    // and BEFORE either branch below, for the same reason the keydown
    // listener's own comment gives: the autoplay policy ties the gesture to
    // THIS task, not to a promise chain, so calling it after `loadScenario`
    // resolves (the different-scenario branch, just below) would spend the
    // gesture on a fetch instead of the click that produced it.
    void audio.resume()
    // `frame` may already exist by the time this fires, built with whatever
    // `chosen` (and, after a scenario switch, `bundle`) held at THAT
    // point -- rebuild it exactly like Restart does below, rather than only
    // unpausing, so a changed selection actually reaches the stores.
    // `buildWorld` is declared further down this function but, like `frame`
    // itself, is always initialised by the time a real click can reach this
    // closure -- the same forward-reference this file already relies on for
    // `spawnPosition` and `cascades`.
    const rebuildFrame = (): void => {
      if (frame) {
        const rebuilt = initialFrameStateFor(buildWorld(frame.world.terrain), frame.assists, frame.impactMarker)
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
    // Sortie forms: an aircraft change swaps the player's airframe mesh
    // (Review Focus 5), and a Dev loadout needing the borrowed stations
    // changes the bundle, so both reload exactly as a scenario change does.
    const reload = choice.scenarioId !== requestedScenarioId || choice.aircraftSpec !== loadedAircraftSpec
      || bundle === null || needsDevStores(bundle.aircraftSpecs[choice.aircraftSpec]!, choice.loadout)
    if (reload) {
      // Plan 9 Task 7: a different scenario can carry a different ENTITY
      // LIST (aircraft, ships), which used to mean a full page reload
      // (`window.location.href = ?scenario=<id>`) because `airframes`/
      // `shipHandles` were built once at boot. `loadScenario` now disposes
      // whatever is currently loaded and rebuilds them in place (design doc
      // §5) -- terrain is untouched, and the scenario's weather (clouds,
      // hour, sea state) is applied in place (A2, `applyScenarioWeather`).
      // `requestedScenarioId` is updated FIRST so a
      // second pick compares against the scenario now actually loaded, not
      // the one this boot started with, and so a return-to-title flight
      // followed by picking a THIRD scenario still detects a change.
      requestedScenarioId = choice.scenarioId
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
      swapPending = true
      performance.mark('sortie-swap-start')
      void loadScenario(choice).then(() => {
        devSortie = sortieNeededDev(choice)
        rebuildFrame()
        swapPending = false
        performance.measure('sortie-swap', 'sortie-swap-start')
      }).catch((err: unknown) => {
        loop?.stop()
        showFailure(root, 'bad-content', err instanceof Error ? err.message : String(err))
      })
      return
    }
    devSortie = sortieNeededDev(choice)
    // Same scenario, so no `applyScenarioWeather`: only the hour can have changed (A3).
    scenarioTimeOfDay = forcedTimeOfDay ?? pickedTimeOfDay ?? bundle?.scenario.weather.timeOfDay ?? DEFAULT_TIME_OF_DAY
    rebuildFrame()
  }, quality.settings, boot, { options: SCENARIO_OPTIONS, flyable, ordnanceNames: loadOrdnanceNames(), loadScenario: (id) => loadScenarioFile(id) }, recordDevSorties)
  // A quick launch (A6, SF-R9) builds the title and hides it at once rather
  // than skipping it: `title.up()` gates keys and pausing in several places,
  // and "Return to title" must work as after any flight. No pilot is chosen,
  // so `currentPilotId` stays null and nothing banks. Audio stays suspended
  // until the first click, since no New game click supplied the gesture.
  if (quick !== null) title.hide()

  const canvas = document.createElement('canvas')
  root.appendChild(canvas)

  // Orbit camera (spec 2026-09-27). Canvas-only, so a press on any HUD or
  // dialog element sitting over it is never a drag (plan Review Focus 1). No
  // pointer lock: Esc is the pause key (spec OC-5). Folded into one
  // `MouseDelta` per frame and handed to `nextFrameState` in the frame loop.
  let mouseDelta: MouseDelta = NO_MOUSE
  let dragPointer: number | null = null
  let lastPointer = { x: 0, y: 0 }
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    dragPointer = e.pointerId
    lastPointer = { x: e.clientX, y: e.clientY }
    canvas.setPointerCapture(e.pointerId)
  })
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== dragPointer) return
    mouseDelta = addMouse(mouseDelta, { ...NO_MOUSE, dxPx: e.clientX - lastPointer.x, dyPx: e.clientY - lastPointer.y })
    lastPointer = { x: e.clientX, y: e.clientY }
  })
  // All three, so a release outside the window cannot leave a drag stuck
  // (plan Review Focus 2); the window `blur` handler below also drops it.
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    canvas.addEventListener(type, (e) => { if (e.pointerId === dragPointer) dragPointer = null })
  }
  canvas.addEventListener('wheel', (e) => {
    if (e.ctrlKey) return // the browser's own zoom, and a trackpad pinch (plan Review Focus 3)
    e.preventDefault()
    mouseDelta = addMouse(mouseDelta, { ...NO_MOUSE, wheelNotches: wheelNotches(e.deltaY, e.deltaMode) })
  }, { passive: false })
  canvas.addEventListener('dblclick', () => { mouseDelta = { ...mouseDelta, reset: true } })

  // GPU timestamps are DEV-only (the budget tests and the diagnostics hook).
  // Production tracked them for the quality probe until A4, which measures
  // frame intervals instead (`adaptQuality`).
  boot.begin('renderer')
  const renderScaleOverride = import.meta.env.DEV ? renderScaleFromQuery(location.search) : null
  const { renderer, adapterVerdict } = await initRenderer(canvas, import.meta.env.DEV, renderScaleOverride ?? quality.renderScale())
  if (renderScaleOverride === null) quality.bindRenderScale((s) => { applyRenderScale(renderer, s) })
  boot.end('renderer')
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
  /** E1 DEV knobs: `?fx=`, `?fxSoft=`, `?fxCloudLimit=` (fx/query.ts). Up here,
   *  beside the other DEV tier overrides, because the sheet download below
   *  already reads it; a typo throws, as `?cloudTier=` does. */
  const fxQuery = import.meta.env.DEV ? fxQueryFrom(location.search) : { tier: undefined, soft: true, cloudLimit: true } as const
  /** An `OCEAN_TIERS` entry by name. Total: `QualityTierName` and the tiers'
   *  own names are the same three strings, so the fallback is unreachable --
   *  it exists because `find` cannot say so in the type system. */
  const oceanTierNamed = (name: QualityTierName) => OCEAN_TIERS.find((t) => t.name === name) ?? OCEAN_TIERS[0]
  // Spec §5 steps 1 and 2: a saved choice is what this page load builds at,
  // `defaultQualitySettings('high')` (i.e. `OCEAN_TIERS[0]`, unchanged from
  // before this plan) when nothing is saved -- and a DEV `?oceanTier=`
  // override still wins over both, which is what keeps an E2E measurement
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

  // E2E diagnostics hook (tests/e2e/adapter.spec.ts), guarded absent from
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
      seaState: () => beaufort,
      // Task 9 (reference-GPU acceptance): whether the quality probe
      // (`adaptQuality`, A4: in flight) has already resolved, or was pre-latched true by a
      // persisted choice at boot (`qualityChecked`, declared beside `quality`
      // above -- see that declaration for why it lives there now). Exists
      // because the DEV-override precedence and "an explicit pick suppresses
      // the next page load's probe" claims (spec §5 steps 1-2) were
      // previously pinned only by a source-text regex on
      // `bootQuality.test.ts`, never by a running check (Task 6 review).
      qualityProbeChecked: () => qualityChecked,
      oceanLandWeight: (x, z) => {
        if (!oceanDepth) return null
        return landWeightAt(terrain.levelTexture(terrain.wholeLevel), oceanDepth.header.halfExtentM, x, z)
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
      timeScale: () => frame?.timeScale ?? 1,
      gearFraction: () => (frame ? playerAircraft(frame.world).state.gearFraction : 0),
      controls: () => frame?.controls ?? NEUTRAL,
      look: () => frame?.look ?? LOOK_CENTRE,
      orbit: () => frame?.orbit ?? ORBIT_ZERO,
      // Same `??`-guard as the four above, for the same reason: the hook is
      // installed before `frame` exists. The fallback is the same value
      // `initialFrameStateFor` would have produced.
      assists: () => frame?.assists ?? DEFAULT_ASSIST_SETTINGS,
      impactMarker: () => impactDiagnostics,
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
      // spawn is content now (Plan 12). Every E2E caller reads this after
      // `waitForTerrain`, i.e. long after both.
      aircraftPositionM: () => (frame ? playerAircraft(frame.world).state.position : spawnPosition ?? v3(0, 0, 0)),
      // Instant replay: `replay` / `renderedPlayerPosition` are declared later
      // in boot(); these run only after boot, as `fx` reads `fxSystem`.
      replay: () => replay === null ? null : {
        tS: replay.player.tS, startS: replay.player.startS, endS: replay.player.endS, speed: replay.player.speed,
        playing: replay.player.playing, camera: replay.camera.selected, effective: effectiveCamera(replay.camera),
        targetId: replay.camera.targetId,
      },
      replayFxRebuildMs: () => lastFxRebuildMs,
      renderedPlayerPositionM: () => renderedPlayerPosition,
      playerAirframeVisible: () => scenarioEntities?.player.root.visible ?? false,
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
            listRad: damage === undefined ? 0 : floodListRad(damage, s.spec.hullHp),
            speedMps: s.state.speedMps,
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
            // Plan 7e (spec §4.4).
            side: sideOf(frame!.world, a),
            mode: a.pilot?.decision.mode ?? null,
            // Plan 7g: the recovery phase for an AI with a home, else null.
            recovery: a.pilot?.decision.recovery?.phase ?? null,
            // Plan 7h: the takeoff phase for an AI on its takeoff, else null.
            takeoff: a.pilot?.decision.takeoff?.phase ?? null,
            maneuver: a.pilot?.decision.named ?? null,
            targetId: a.pilot?.decision.targetId ?? null,
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
        return supportedContact(playerSpec, state, g.heightM, g.surface, g.velocity, g.landClass)
      },
      playerFlight: () => {
        if (!frame) return null
        const { spec, state } = playerAircraft(frame.world)
        return { spec, state }
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
      // Ship-models spec §9. `shipHandles` is built in `world.ships` order (buildScenarioEntities).
      shipModels: () => scenarioEntities?.shipHandles.map((h) => h.model) ?? [],
      shipDeckProbe: (shipId, points, space) => {
        const i = frame?.world.ships.findIndex((s) => s.id === shipId) ?? -1
        const view = i >= 0 ? scenarioEntities?.shipHandles[i] : undefined
        return view ? probeShipSurface(view, points, space) : points.map(() => null)
      },
      // The world wind, the velocity of the air; `null` is calm (Plan 8).
      wind: () => frame?.world.wind ?? null,
      // Read fresh every call, same reason `scenarioEntities` is read fresh
      // in the render loop: `loadScenario` reassigns `bundle` wholesale on
      // every call, including a Task 7 in-place switch -- see this member's
      // own doc comment in diagnostics.ts for why an E2E spec needs this
      // rather than `groundHeightM()` to detect a switch completing.
      scenarioId: () => bundle?.scenario.id ?? null,
      // The mesh actually DRAWN for the player, not the sim spec's view.model: read the GLB URL
      // stamped by modelCache when there is one, rather than trusting the wrapper root's label.
      // The hand-built Wildcat has no cache URL and names its own root instead.
      playerModel: () => {
        const root = scenarioEntities?.player.root
        if (root === undefined) return null
        const modelUrls: string[] = []
        root.traverse((o) => {
          if (typeof o.userData['modelUrl'] === 'string') modelUrls.push(o.userData['modelUrl'] as string)
        })
        const modelUrl = modelUrls[0]
        return (modelUrl?.match(/([^/]+)\.glb(?:[?#].*)?$/)?.[1] ?? root.name) || null
      },
      sceneAirframeModels: () => {
        const modelIds = new Set(loadFlyableAircraft().map((f) => f.spec.view.model))
        return scene.children.flatMap((root) => modelIds.has(root.name) ? [root.name] : [])
      },
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
      // O1: what the in-flight bomb/rocket pools are drawing this frame, for E2E
      // (tests/e2e/ordnance.spec.ts, Task 9).
      ordnanceView: () => ordnance.view(camera, window.innerHeight),
      // Plan 16a: which deck is up and at what tier; `off` under `?cloudTier=off`.
      clouds: () => ({
        layers: cloudLayers, tier: cloudTier, steps: cloudTier === 'off' ? 0 : CLOUD_TIERS[cloudTier].cumulusSteps,
        // Plan 16b: what the shadow pass is doing, for the E2E budget.
        shadow: { enabled: shadow.enabled, taps: shadow.taps, mapSideM: MAP_SIDE_M },
        // Photoreal Task 4: frames resolved without history (0 with no pass).
        historyResets: cloudPass?.historyResets() ?? 0,
        composited: cloudPass !== null && routedOutput === cloudPass.composite,
      }),
      // Visual realism §2.1: read through the same closure-after-boot shape as
      // `shadow` in `clouds` above; the specs call it after `waitForTerrain`.
      terrainSurface: () => ({ texturesLoaded: surfaceTextures !== null, detail: terrain.surfaceDetail }),
      // E1: the effects pool, for the E2E captures and budget.
      fx: () => ({
        tier: fxTier, capacity: fxSystem?.capacity() ?? 0, live: fxSystem?.live() ?? 0,
        drawn: fxPass?.count() ?? 0, sheetsFallback: fxSheets?.fallback ?? false, cpuMs: fxCpuMs,
      }),
      fxStress: (name) => startFxStress(name),
      // M2: `missionHud` is declared later in boot(); this runs only after boot, as `clouds` reads `cloudPass`.
      mission: () => missionDiagnostics(frame?.world.mission ?? null, missionHud, scenarioEntities),
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
    await loadScenario(chosen)
  } catch (err) {
    showFailure(root, 'bad-content', err instanceof Error ? err.message : String(err))
    return
  }

  // Sea state from the scenario's wind (Plan 8), with the DEV `?beaufort=`
  // override winning when present. Below the bundle on purpose: the wind is
  // scenario content. See `seaStateFor`'s doc for why a calm scenario keeps
  // the development sea rather than going flat.
  let beaufort = seaStateFor(
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
  boot.begin('sky')
  const skyNoiseLoading = loadSkyNoise()
  // Handled below by the `await`; this only stops a rejection during the
  // yield from being reported as unhandled before that `await` attaches.
  skyNoiseLoading.catch(() => undefined)
  // E1: the effects sheets download alongside (never rejects -- a failure is
  // a warning and the procedural fallback, fx/sheets.ts). `?fx=off` skips it.
  const fxSheetsLoading = fxQuery.tier === 'off' ? null : loadFxSheets(renderer)
  // Visual realism §2.1 (plan Ruling 4): the terrain textures load before the
  // terrain mesh is built, so the ring materials compile once with them. A
  // failure is a warning and the procedural surface -- never fatal.
  const forcedTerrainTextures = import.meta.env.DEV ? terrainTexturesFromQuery(location.search) : undefined
  const surfaceTexturesLoading: Promise<SurfaceTextures | null> = forcedTerrainTextures === 'off'
    ? Promise.resolve(null)
    : loadSurfaceTextures(renderer).catch((err: unknown) => { console.warn('terrain textures unavailable; drawing the procedural surface:', err); return null })
  const beachesDisabled = import.meta.env.DEV && new URLSearchParams(location.search).get('beaches') === 'off'
  const beachesLoading = beachesDisabled
    ? Promise.resolve(null)
    : loadBeaches(BEACHES_URL).catch((err: unknown) => {
        console.warn('curved beaches unavailable; drawing the terrain shoreline:', err)
        return null
      })
  // Photoreal Task 9 fix 2: build the sky-irradiance table (sky/palette.ts,
  // ~0.3 s of CPU) HERE, during the async load phase, rather than lazily on
  // the first `atmospherePalette` call -- which is inside the frame loop, so
  // the build would land as a stall on the first rendered frame. Yield to
  // the event loop first so the loading/title UI can paint, and overlap the
  // build with the sky-noise fetch already in flight.
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  irradianceTableMs = warmIrradianceTable()
  const skyNoise = await skyNoiseLoading
  boot.end('sky')
  const forcedCloudTier = import.meta.env.DEV ? cloudTierFromQuery(location.search) : undefined
  if (import.meta.env.DEV) applyCloudTune(location.search) // H0 lever pricing, before any tier is read
  cloudLayers = forcedCloudTier === 'off' ? [] : bundle!.scenario.weather.clouds ?? []
  // The saved clouds tier, not the ocean's (spec §4: Advanced lets the three
  // diverge). With nothing saved both read `high`, which is what this line
  // resolved to before this plan existed. `?cloudTier=` still wins.
  cloudTier = forcedCloudTier ?? quality.current().clouds
  sceneryTier = forcedSceneryTier ?? quality.current().scenery
  let fxTier: QualityTierName | 'off' = fxQuery.tier ?? quality.current().fx
  // Plan 16c: the scenario's hour, or the DEV override.
  scenarioTimeOfDay = forcedTimeOfDay ?? pickedTimeOfDay ?? bundle!.scenario.weather.timeOfDay ?? DEFAULT_TIME_OF_DAY
  sunState = { ...sunState, timeOfDay: scenarioTimeOfDay }
  boot.begin('surface')
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
  // `finestLevel` param, `loadTerrainProgressively`'s and
  // `applyTerrainLevel`'s `finestLevel` params further down; the ocean reads
  // `terrain.wholeLevel` instead) rather than resolved independently in each: until
  // 2026-09-25 (Task 2 review) `createTerrainMesh` called
  // `finestFetchedLevelFor('low')` itself, a second source of truth that
  // happened to agree with this one only because both were the same
  // hardcoded literal.
  const surfaceTextures = await surfaceTexturesLoading
  const terrain = createTerrainMesh(TERRAIN_HEADER, finestFetchedLevel, shadow, surfaceTextures)
  const beaches = await beachesLoading
  // Scenery `low` draws the procedural surface (plan Ruling 3). `?terrainTextures=on`
  // holds the textures on whatever the tier.
  terrain.setSurfaceDetail(forcedTerrainTextures === 'on' || sceneryTier !== 'low')
  // Plan 13b. The raster and the terrain levels race; whichever lands
  // second finds the other ready. A failed fetch leaves the procedural
  // paint (surface.ts's `ready` uniform) and the daa1b39 forest, logged,
  // not fatal: land cover is a picture, terrain is the ground.
  let cover: CoverLookup | null = null
  let coverData: Uint8Array | null = null
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
        // The physics reads the same raster (soft fields, woodland). Kept for
        // a terrain level that has not arrived yet; patched in now if one has.
        coverData = data
        if (frame?.world.terrain) {
          frame = withTerrain(frame, { ...frame.world.terrain, cover: coverFieldFor(frame.world.airfields, data) })
        }
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
  boot.end('surface')
  // Plan 16a. `?cloudTier=off` is the DEV control for measuring a scene
  // with and without the pass; the field itself was made above the terrain.
  const clouds = createClouds(cloudLayers, skyNoise, cloudField)
  if (cloudTier !== 'off') clouds.setTier(cloudTier)
  if (import.meta.env.DEV) clouds.setDebug(cloudDebugFromQuery(location.search))
  let water = createOcean(oceanDepth, beaufort, cascades, terrain.levelTexture(terrain.wholeLevel), shadow)
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
    requestedOceanTier = name
    await swapOcean(next, beaufort)
  }
  /** The one ocean rebuild: `next`'s cascades at force `force`. Shared by a
   *  tier change and a scenario's sea state (A2); the latest call wins. */
  const swapOcean = async (next: typeof oceanTier, force: number): Promise<void> => {
    const request = ++oceanTierRequest
    const pending = await Promise.allSettled(cascadeOptions(force,next.n,next.cascades).map(options=>createOceanCompute(renderer,options)))
    const ready = pending.flatMap(r=>r.status === 'fulfilled' ? [r.value] : [])
    if (request !== oceanTierRequest) { ready.forEach(c=>c.dispose()); return }
    requestedOceanTier = null
    if (ready.length !== next.cascades) { ready.forEach(c=>c.dispose()); return }
    const replacement = createOcean(oceanDepth!,force,ready,terrain.levelTexture(terrain.wholeLevel),shadow)
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
    if (forcedTerrainTextures === undefined) terrain.setSurfaceDetail(name !== 'low')
  }
  let cloudPass: CloudPass | null = null
  let fxSystem: FxSystem | null = null
  let fxPass: FxPass | null = null
  let fxSheets: FxSheetTextures | null = null
  let fxMemory: FxMemory = NO_FX_MEMORY
  let lastFxRebuildMs = 0
  let fxStress: { readonly scene: FxStressScene; readonly startedMs: number; rounds: number } | null = null
  let fxCpuMs = 0
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
  /** `?fx=` holds the tier, including `off` (no pass at all, Ruling R18). */
  const applyFxTier = (name: QualityTierName): void => {
    if (fxQuery.tier !== undefined || fxTier === name) return
    fxTier = name
    fxSystem?.setCapacity(FX_TIERS[name].capacity)
    fxPass?.setTier(FX_TIERS[name])
  }
  // `qualityChecked` itself is declared much earlier now (beside `quality`),
  // read here and mutated below -- see that declaration for why.
  // Everything a tier moves now exists. This also applies anything picked
  // during boot's own awaits, when the dialog was already clickable and there
  // was nothing yet to apply it to.
  quality.bind({ setOceanTier: (t) => { void applyOceanTier(t) }, setSceneryTier: applySceneryTier, setCloudTier: applyCloudTier, setFxTier: applyFxTier })
  // A4: the one-time quality probe, measured in flight (incident 2026-09-20:
  // it used to read GPU timestamps on the title screen, which a vsynced
  // browser inflates about 3x). It reads the frame rate the pilot gets, rAF
  // interval by rAF interval: a vsynced GPU that idles and clocks down still
  // makes every frame, and a browser whose GPU falls behind stops issuing
  // frames until it catches up. Headless Chromium does NOT throttle rAF that
  // way (measured on nexus 2026-10-09: 16.7 ms rAF at 26 ms of GPU work), so
  // under the E2E harness this probe always reads High; the reference check is
  // a real Chrome (the handoff). `tierForFrameIntervalsMs` has the rule. It
  // skips a warm-up (shader compiles, the first terrain tiles), then reads up
  // to PROBE_FRAMES intervals or 5 s of them: a slow machine must not fly
  // 20 s at a tier it cannot hold. A gap over 250 ms (a hidden tab, a
  // debugger) is not a frame and is dropped.
  const PROBE_WARMUP = { frames: 120, ms: 2000 }
  const PROBE_FRAMES = 240
  const PROBE_MS = 5000
  let warmupFrames = 0
  let warmupMs = 0
  let probeMs = 0
  const probeIntervalsMs: number[] = []
  // In DEV the probe shares its frames with the GPU timestamp sampling (budget
  // tests need those samples); production tracks no timestamps.
  const adaptQuality = (frameMs: number, inFlight: boolean): void => {
    if (qualityChecked || forcedOceanTier !== undefined || !inFlight || document.hidden) return
    if (warmupFrames < PROBE_WARMUP.frames && warmupMs < PROBE_WARMUP.ms) { warmupFrames += 1; warmupMs += frameMs; return }
    if (frameMs > 250) return
    probeIntervalsMs.push(frameMs)
    probeMs += frameMs
    if (probeIntervalsMs.length < PROBE_FRAMES && probeMs < PROBE_MS) return
    qualityChecked = true
    const { tier, medianMs } = tierForFrameIntervalsMs(probeIntervalsMs)
    // Spec §5 step 3: always recorded (the "Recommended" stamp, now persisted),
    // applied and saved only when the player has not picked a tier first.
    quality.applyProbeResult(tier.name)
    const fps = Math.round(1000 / medianMs)
    console.info(`quality: measured ${fps} fps in flight at ${oceanTier.name}; recommends ${tier.name}, in force ${quality.current().ocean}`)
    // J: what the probe measured against what is in force (a player's pick wins), for A4.
    track('quality_tier', { detected: tier.name, chosen: quality.current().ocean, fps })
  }
  const sky = createSky()
  scene.add(sky)
  // Plan 16b: the sun carries the cloud-shadow lookup into every lit
  // material. `positionWorld` is eye-relative here; the node adds the eye.
  const lights = createLighting(shadow.capable ? shadow.node(positionWorld, 'eyeRelative') : undefined)
  scene.add(lights)
  // The clouds are no longer in the scene: photoreal Task 3 moved the march
  // into a reduced-resolution pass composited after it (`cloudPass`, below
  // `framePipeline`).
  // `airframes`/`shipHandles`/`player` are already in `scenarioEntities` --
  // built by the first `loadScenario` call, above, from this same `scene`
  // and this same `scenarioWorld`'s entity lists (`buildScenarioEntities`,
  // `scenarioEntities.ts`, has the construction reasoning: world order, and
  // picking the player's `Airframe` out by id rather than assuming index 0).
  // The render loop, below, destructures `scenarioEntities` fresh every
  // frame -- Plan 9 Task 7 -- so a later `loadScenario` call is picked up
  // with no further plumbing here.
  const tracers = createTracers()
  scene.add(tracers.object)
  // M2: anti-aircraft tracers, a thicker mesh of their own.
  const aaTracers = createAaTracers()
  scene.add(aaTracers.object)
  // Ordnance in flight (Plan 6b Task 8, impacts migrated to E1's fx/): pools
  // sized independently of any scenario's entity list -- nothing here is
  // rebuilt on a scenario switch either.
  const ordnance = createOrdnance(scene)
  // O1: the in-flight pools draw the player's store models once they load; until then, and
  // if they fail, the primitive stand-ins, with the failure on __ww2.validationErrors.
  const bombStore = spec.stores?.racks[0]?.store
  const rocketStore = spec.stores?.rails[0]?.store
  if (bombStore !== undefined && rocketStore !== undefined) {
    loadStoreVisuals([bombStore, rocketStore], 0)
      .then((v) => { ordnance.setStoreModels(v.byStore.get(bombStore)!, v.byStore.get(rocketStore)!) })
      .catch((e: unknown) => { validationErrors.push(`store models: ${e instanceof Error ? e.message : String(e)}`) })
  }
  // D1: a torpedo rack's store draws the torpedo pool.
  if (bombStore !== undefined && spec.stores?.types[bombStore]?.kind === 'torpedo') {
    loadStoreVisuals([bombStore], 0)
      .then((v) => { ordnance.setTorpedoModel(v.byStore.get(bombStore)!) })
      .catch((e: unknown) => { validationErrors.push(`store models: ${e instanceof Error ? e.message : String(e)}`) })
  }

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
  const gunPipper = createGunPipper(spec) // chase-view aiming reference (scene/gunPipper.ts)
  if (gunPipper) scene.add(gunPipper.root)
  const steeringArrow = createSteeringArrow() // B1: in-scene arrow and destination marker (scene/steeringArrow.ts)
  scene.add(steeringArrow.root)
  const impactMarker = createImpactMarker() // B2: where a released store would land (scene/impactMarker.ts)
  scene.add(impactMarker.root)
  const impactPredictor = createImpactPredictor()
  let impactDiagnostics: ImpactMarkerDiagnostics = { on: false, shown: false, label: null, prediction: null, tick: 0, detonations: [] }

  // Leyte, drawn from `content/terrain/`. Added to `scene` rather than beside
  // it so it inherits the camera-relative translation applied below -- a
  // terrain mesh that missed it would jitter at 100 km exactly as master
  // spec §4 describes, and would be the only thing in the scene that did.
  scene.add(terrain.object)
  if (beaches) scene.add(beaches.object)
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
  // E1 (ordnance-and-effects design §3-4): one pool and one reduced-resolution
  // pass for every effect, composited BEFORE the clouds -- the cloud pass
  // takes this composite as its scene color, and stops its march at dense
  // effects (§4.2). `?fx=off` builds neither (Ruling R18). This `await` sits
  // before `frame`'s first assignment below, so resetFlightUi's "no await
  // between frame and here" argument still holds.
  if (fxTier !== 'off' && fxSheetsLoading !== null) {
    fxSheets = await fxSheetsLoading
    fxSystem = createFxSystem({ capacity: FX_TIERS[fxTier].capacity, seed: 1944, catalog: FX_CATALOG, layout: sheetLayout(fxSheets.manifest) })
    fxPass = createFxPass({
      camera, sceneColor: framePipeline.sceneColor, sceneDepth: framePipeline.sceneDepth, sheets: fxSheets,
      shadow: shadow.capable ? shadow : null, soft: fxQuery.soft, cloudLimit: fxQuery.cloudLimit, tier: FX_TIERS[fxTier],
    })
  }
  // Photoreal Task 3 (spec §4.1): the cloud march at reduced resolution,
  // composited over the scene pass. It renders from inside
  // `framePipeline.render()` (a node's `updateBefore`, after the scene pass)
  // and follows the drawing-buffer size by itself, so neither the frame loop
  // nor the resize handler calls it. `?cloudTier=off` and a clear-sky
  // scenario build no pass at all: the output stays `sceneColor`.
  // `applyCloudTier` (above) may run before this line -- `quality.bind`
  // applies a pending pick at once -- which is why the pass takes its scale
  // from `cloudTier` here rather than relying on that call.
  // A2: built for a clear sky too, since a scenario switch can bring a deck;
  // `routeOutput` composites it only while there is one, so a clear sky pays
  // no march per frame (the 2026-09-26 6.9 vs 2.0 ms finding, clouds.md #10).
  cloudPass = cloudTier === 'off' ? null : createCloudPass({
    clouds, camera, sceneColor: fxPass?.composite ?? framePipeline.sceneColor, sceneDepth: framePipeline.sceneDepth,
    fxLimit: fxPass?.cloudLimit ?? null,
  })
  if (cloudPass !== null && cloudTier !== 'off') {
    cloudPass.setResolutionScale(CLOUD_TIERS[cloudTier].resolutionScale)
    cloudPass.setUpdatePeriod(CLOUD_TIERS[cloudTier].updatePeriod)
  }
  // The pipeline starts on `sceneColor`; a rebuild only when the picture changes.
  let routedOutput = framePipeline.sceneColor
  const routeOutput = (): void => {
    const next = cloudPass !== null && clouds.enabled ? cloudPass.composite : fxPass?.composite ?? framePipeline.sceneColor
    if (next === routedOutput) return
    routedOutput = next
    framePipeline.setOutput(next)
  }
  routeOutput()
  applyScenarioWeather = (weather): void => {
    scenarioTimeOfDay = forcedTimeOfDay ?? pickedTimeOfDay ?? weather.timeOfDay ?? DEFAULT_TIME_OF_DAY
    if (forcedCloudTier !== 'off') {
      cloudLayers = weather.clouds ?? []
      cloudField.setLayers(cloudLayers)
      shadow.refresh()
      routeOutput()
      cloudPass?.resetHistory()
    }
    const force = seaStateFor(weather.windMps, import.meta.env.DEV ? beaufortFromQuery(window.location.search) : undefined)
    if (force !== beaufort) {
      beaufort = force
      void swapOcean(oceanTier, force)
    }
  }

  // Everything about the first frame -- the gear, the terrain hold, one pose
  // per entity -- is derived from the world's own entities by
  // `initialFrameStateFor` (frame.ts), which is why no boolean is passed here
  // any more.
  frame = initialFrameStateFor(buildWorld(null))
  // Repeatable scenery inspection with the existing DEV spawn overrides.
  // Hold position and look down; absent from production builds.
  const inspectScenery = import.meta.env.DEV && new URLSearchParams(location.search).get('sceneryView') === '1'
  const forcedLook = import.meta.env.DEV ? lookFromQuery(location.search) : undefined
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
  const impactBadge = createImpactBadge(root)
  const autopilotBadge = createAutopilotBadge(root)
  const pauseBadge = createPauseBadge(root)
  const paddlesBadge = createPaddlesBadge(root)
  const missionHud = createMissionHud(root)
  // Ships in production, in both camera modes (Plan 6): ammunition and
  // damage are things the pilot needs whichever way they are looking.
  const combatReadout = createCombatReadout(root)
  // Created after the navigation-chart callbacks below, because each modal
  // hands control back to the other. Hoisted here so the shared Restart path
  // and resetFlightUi can dismiss it without duplicating restart behavior.
  let pauseScreen: PauseScreenHandle | null = null
  // Restart rebuilds the frame from the scenario rather than tearing anything
  // down: `worldFromScenario` and `initialFrameStateFor` are both pure, so the
  // renderer, the terrain and the ocean cascades all survive untouched -- and
  // so does the wingman and the task force's position on its loop, which are
  // rebuilt at their scenario start along with the player.
  const restartMission = (): void => {
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
    const restarted = initialFrameStateFor(buildWorld(frame!.world.terrain), frame!.assists, frame!.impactMarker)
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
    segment = EMPTY_SEGMENT
  }
  const debrief = createDebrief(root, restartMission)
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
  /** The mission landing tick already handled (M2 R2); -1 before any. */
  let handledLandingTick = -1
  /** The tick of the impact the debrief is currently showing, so the modal is
   *  raised once rather than rebuilt sixty times a second. */
  let shownImpactTick: number | null = null
  /** The damage-destruction tick already shown, parallel to impact above. */
  let shownDestructionTick: number | null = null
  /** A crash/kill debrief already banked but not yet raised. `replayFlow`
   *  owns the hold and automatic replay that precede showing it. */
  let pendingDebrief: { readonly show: () => void } | null = null
  let replayFlow: ReplayFlow = { kind: 'live' }
  /** Instant replay (spec §3, R-1): the last 10 s of LIVE worlds, one per
   *  advanced frame. Pushed in the frame loop only while no replay is up, and
   *  cleared by `resetFlightUi`, so a replay can never show a previous flight. */
  const recorder = createRecorder()
  /**
   * The replay on screen, or null (spec §4-§6). While it is up the frame loop
   * draws a `view` built from the recording, the live frame is held paused
   * (R-9), the replay owns the keyboard, and a class on `root` hides the HUD
   * (R-5). `eye` / `pose` are what was drawn last, for a camera switch made
   * between frames (Manual starts at the previous camera's eye, spec §5);
   * `drawnCamera` is the effective camera last drawn, for the history cut.
   */
  type ReplaySession = {
    player: ReplayPlayer
    camera: ReplayCameraState
    readonly returnTo: 'live' | 'debrief'
    readonly liveWasPaused: boolean
    readonly liveFxMemory: FxMemory
    replayFxMemory: FxMemory
    readonly liveAudio: AudioSystemMemory
    readonly onDone: () => void
    eye: EyeTransform
    pose: ReplayPoses
    drawnCamera: ReplayCameraId
    jumpedThisFrame: boolean
  }
  let replay: ReplaySession | null = null
  /** Keys held while a replay is up: Manual's WASD / Q / E (R-10). Separate
   *  from the flight's `pressed`, and cleared on blur (Review Focus 2). */
  const replayHeld = new Set<string>()
  /** Forces one cloud/TRAA history reset: replay entry and exit, a jump, a camera switch (spec §7). */
  let replayHistoryCut = false
  /** DEV (`__ww2.renderedPlayerPositionM`): the player's airframe root as drawn this frame. */
  let renderedPlayerPosition: Vec3 | null = null
  /** Assembles this bank's dossier record (dossier spec §B.2) from the flight
   *  `segment` just flown plus whatever main.ts already tracks live -- the
   *  scenario, aircraft and loadout in play right now. */
  const sortieFacts = (outcome: LogOutcome, world: FrameState['world']): SortieFacts => ({
    at: new Date().toISOString(),
    scenarioId: requestedScenarioId,
    aircraft: playerAircraft(world).spec.name,
    loadout: chosen.loadout,
    outcome,
    segment,
  })
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
  /** How a debrief banks after friendly fire: a survivor is discharged, a
   *  death is only forfeit, and a clean sortie is neither. */
  const friendlyFireBank = (model: DebriefModel): 'discharged' | 'forfeit' | null =>
    model.discharge !== undefined ? 'discharged' : model.forfeit !== undefined ? 'forfeit' : null
  const bankMissionResult = (
    scoreTotal: number,
    outcome: 'landed' | 'ditched' | 'killed',
    killsSinceLastBank: Readonly<Record<TargetType, number>>,
    sortie: SortieFacts,
    friendlyFire: 'discharged' | 'forfeit' | null,
    badgeId: string | null,
  ): { readonly bankedTotal: number; readonly promotedTo: string | undefined } | null => {
    const discharged = friendlyFire === 'discharged'
    track('mission_outcome', { mission: requestedScenarioId, outcome, score: scoreTotal })
    if (currentPilotId === null) return null
    // A Dev sortie (sortie spec A5) banks nothing: `bankSortie` hands the same
    // roster back, so there is nothing to save and no figure to show.
    const devUnrecorded = devSortie && !recordDevSorties
    const before = roster.find((p) => p.id === currentPilotId) ?? null
    const next = bankSortie(roster, currentPilotId, { devSortie: devUnrecorded, scoreTotal, outcome, killsSinceLastBank, sortie, friendlyFire, badgeId })
    if (next === roster) return null
    roster = next
    saveRoster(roster)
    const after = roster.find((p) => p.id === currentPilotId) ?? null
    if (after === null) return null
    const promotedTo = !discharged && before !== null && before.rank.abbrev !== after.rank.abbrev ? after.rank.name : undefined
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
    onWatchReplay: (() => void) | undefined,
  ): void => {
    // `exactOptionalPropertyTypes`: spread `promotedTo` in only when it is
    // actually a string, rather than assigning it `undefined` -- the two are
    // different things under this tsconfig, and `DebriefModel.promotedTo` is
    // typed as absent-or-string, not string-or-undefined (matching
    // `continueLabel`'s existing convention on the same type).
    // The one merge point for all three sites, so the Dev stamp (sortie spec
    // A5) reaches every debrief without a fourth copy at each call.
    const shown = withNotRecorded(model, devSortie && !recordDevSorties)
    debrief.show(
      banked === null
        ? shown
        : { ...shown, bankedTotal: banked.bankedTotal, ...(banked.promotedTo !== undefined ? { promotedTo: banked.promotedTo } : {}) },
      onContinue,
      returnToTitle,
      onWatchReplay,
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
   * Declared here, after every variable it touches (`debrief`,
   * `shownImpactTick`, `shownDestructionTick`, `landingShown`,
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
    if (replay !== null) teardownReplay()
    dispatch({ kind: 'reset' })
    debrief.hide()
    pauseScreen?.hide()
    shownImpactTick = null
    shownDestructionTick = null
    pendingDebrief = null
    landingShown = false
    handledLandingTick = -1
    postImpactOceanSeconds = 0
    // Photoreal Task 4: a new life is a new view; the cloud history of the
    // old one must not be reprojected into it. The teleport test in the
    // frame loop would usually catch it too -- this does not depend on how
    // far the restart moved the eye.
    cloudPass?.resetHistory()
    framePipeline.resetHistory()
    // E1: a new life starts with no effects and no remembered edges
    // (Review Focus 3); events.ts's restart rule would also forget the
    // edges, but only the pool can drop what is already drawn.
    fxSystem?.clear()
    fxMemory = NO_FX_MEMORY
    fxStress = null
    missionHud.reset()
    // Instant replay spec §4: Restart, New game and a scenario switch start
    // a new recording, so Watch replay / K can never show the old flight.
    recorder.clear()
  }
  /** E1 DEV (`__ww2.fxStress`): clear the pool and inject a named scene
   *  relative to the eye (fx/stress.ts); returns the anchors in CSS pixels. */
  const startFxStress = (name: FxStressName): { anchors: { name: string; x: number; y: number }[] } => {
    const f = frame!
    const eye = f.eye.position
    const look = new Vector3()
    camera.getWorldDirection(look)
    const terrainField = f.world.terrain
    const groundAt = (x: number, z: number): number => terrainField === null ? SEA_LEVEL_M : Math.max(SEA_LEVEL_M, heightAt(terrainField, x, z))
    const scene = stressScene(name, eye, { x: look.x, y: look.y, z: look.z }, groundAt)
    fxSystem?.clear()
    for (const t of scene.triggers) fxSystem?.trigger(t.recipe, t.position, t.velocity)
    fxStress = name === 'none' ? null : { scene, startedMs: performance.now(), rounds: 0 }
    const size = renderer.getSize(new Vector2())
    return {
      anchors: scene.anchors.map((a) => {
        const p = new Vector3(a.position.x - eye.x, a.position.y - eye.y, a.position.z - eye.z).project(camera)
        return { name: a.name, x: ((p.x + 1) / 2) * size.x, y: ((1 - p.y) / 2) * size.y }
      }),
    }
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
  // And the gear and flap levers. Found 2026-09-17 by an E2E screenshot:
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
    if (closed.restorePaused) pauseScreen?.show()
  }
  const openNavigationChart = (): void => {
    const player = playerAircraft(frame!.world)
    // A gun kill has no Impact. Letting P open the chart during its three-
    // second replay hold pauses the flow countdown and can strand the player
    // behind the chart forever, before either replay or debrief appears.
    if (
      navigationMapState.open || player.impact !== null
      || frame!.world.combat.aircraft[player.id]!.damage.destroyedAt !== null || landingShown
    ) return
    pauseScreen?.hide()
    navigationMapState = openNavigationMap(navigationMapState, frame!.paused)
    frame = withPaused(frame!, true)
    clearMapInput()
    navigationMap.show(frame!.world, navigationMapState.selectedId)
  }
  pauseScreen = createPauseScreen(root, quality.settings, {
    onResume: () => {
      frame = withPaused(frame!, false)
      clearMapInput()
    },
    onRestart: restartMission,
    onViewMap: openNavigationChart,
  })
  /** An impact or shoot-down (its hold and debrief) or a landing debrief is
   *  up. One copy, read by the mouse gate and by K (a crash has its own
   *  automatic replay, spec §4). */
  const debriefOrHoldUp = (): boolean =>
    playerAircraft(frame!.world).impact !== null
    || frame!.world.combat.aircraft[frame!.world.player]!.damage.destroyedAt !== null
    || landingShown

  // Instant replay (spec §4-§6). The bar's buttons and the keys below drive
  // the same four session functions.
  const replayCommand = (c: ReplayCommand): void => {
    if (replay === null) return
    replay.player = applyReplayCommand(replay.player, c)
  }
  const replayCamera = (f: (s: ReplayCameraState, eye: EyeTransform, pose: ReplayPoses) => ReplayCameraState): void => {
    if (replay === null) return
    replay.camera = f(replay.camera, replay.eye, replay.pose)
  }
  const replayBar = createReplayBar(root, {
    onCommand: replayCommand,
    onSeek: (fraction) => {
      if (replay === null) return
      const p = replay.player
      replayCommand({ kind: 'seek', tS: p.startS + fraction * (p.endS - p.startS) })
    },
    onCamera: (id) => replayCamera((s, eye, pose) => selectCamera(s, id, eye, pose)),
    onSpin: () => replayCamera(toggleSpin),
    onLock: () => replayCamera(toggleLock),
  })
  /**
   * Opens a replay of the current recording. 'manual' (K while paused): the
   * whole recording, Orbit, holding on the last frame. 'auto' (Task 9's crash
   * replay and Watch replay): impact - 8 s to impact + 1.5 s on Auto, done at
   * the end. Effects and sound are cleared / held here until Task 8 drives
   * them from the recording (R-3, R-4).
   */
  const startReplaySession = (kind: 'manual' | 'auto', onDone: () => void): void => {
    const rec = recorder.snapshot()
    if (rec === null) { onDone(); return }
    const camera = initialCameraState(rec, surfaceHeightFor(rec.worlds.at(-1)!), kind === 'manual' ? 'orbit' : 'auto')
    const player = startPlayer(rec, kind === 'manual' ? manualWindow(rec) : autoWindow(rec), kind === 'manual' ? 'hold' : 'finish')
    const pose = replayPosesAt(rec, player.tS)
    replay = {
      player, camera, returnTo: kind === 'manual' ? 'live' : 'debrief',
      liveWasPaused: frame!.paused, liveFxMemory: fxMemory, replayFxMemory: NO_FX_MEMORY,
      liveAudio: audio.memory(), onDone,
      eye: replayEye(camera, pose, surfaceHeightFor(pose.world)), pose, drawnCamera: effectiveCamera(camera),
      jumpedThisFrame: true,
    }
    clearMapInput()
    replayHeld.clear()
    fxSystem?.clear()
    audio.hold(true)
    root.classList.add(REPLAYING_CLASS)
    replayBar.show(replayBarModel(player, camera))
    replayHistoryCut = true
  }
  /** Restores live presentation without completing the flow. Reset uses this
   *  path so tearing down a replay cannot show a stale crash debrief. */
  const teardownReplay = (): ReplaySession | null => {
    const session = replay
    if (session === null) return null
    fxSystem?.clear()
    fxMemory = session.liveFxMemory
    audio.restore(session.liveAudio)
    audio.hold(false)
    frame = withPaused(frame!, session.liveWasPaused)
    root.classList.remove(REPLAYING_CLASS)
    replayBar.hide()
    replayHistoryCut = true
    clearMapInput()
    replayHeld.clear()
    replay = null
    return session
  }
  /** Back to where the replay was opened from, exactly as it was (IR-3, R-3, R-4, R-9). */
  const endReplay = (): void => {
    const session = teardownReplay()
    session?.onDone()
  }
  const runFlowEffect = (effect: ReplayFlowEffect): void => {
    switch (effect) {
      case 'showDebrief': {
        const due = pendingDebrief
        pendingDebrief = null
        due?.show()
        return
      }
      case 'startAutoReplay':
        return startReplaySession('auto', () => dispatch({ kind: 'replayDone' }))
      case 'startManualReplay':
        return startReplaySession('manual', () => dispatch({ kind: 'replayDone' }))
    }
  }
  const dispatch = (event: ReplayFlowEvent): void => {
    const next = stepFlow(replayFlow, event)
    replayFlow = next.flow
    for (const effect of next.effects) runFlowEffect(effect)
  }
  const watchReplay = (): void => dispatch({ kind: 'watch' })
  /** Every keydown while a replay is up lands here and nowhere else (Review Focus 1). */
  const onReplayKey = (e: KeyboardEvent): void => {
    replayHeld.add(e.code)
    if (e.repeat) return
    const action = replayKeyAction(e.code, e.shiftKey)
    if (action === null) return
    switch (action.kind) {
      case 'command': return replayCommand(action.command)
      case 'camera': return replayCamera((s, eye, pose) => selectCamera(s, action.id, eye, pose))
      case 'cycleCamera': return replayCamera(cycleCamera)
      case 'spin': return replayCamera(toggleSpin)
      case 'lock': return replayCamera(toggleLock)
      case 'exit': return replayCommand({ kind: 'skip' })
    }
  }

  window.addEventListener('keydown', (e) => {
    // Nothing reaches the game while the title is up; the title owns Enter.
    if (title.up()) return
    // A replay owns the keyboard: nothing below -- no flight latch, no page
    // toggle (L, R, Q, P, Tab, I, /, T) -- sees a key while one is up.
    if (replay !== null) { e.preventDefault(); onReplayKey(e); return }
    // Preserve the two existing paused-flight shortcuts before the pause
    // sheet's general keyboard gate. Both replace the sheet with their own
    // full-screen surface and return to it when appropriate.
    if (
      BINDINGS.replay.includes(e.code as never) && !e.repeat && frame!.paused && !navigationMapState.open
      && !debriefOrHoldUp() && manualReplayAvailable(recorder.snapshot())
    ) {
      e.preventDefault()
      pauseScreen?.hide()
      dispatch({ kind: 'manual' })
      return
    }
    if (BINDINGS.toggleMissionMap.includes(e.code as never) && !e.repeat) {
      e.preventDefault()
      if (navigationMapState.open) closeNavigationChart()
      else openNavigationChart()
      return
    }
    // The pause sheet owns every key while it is up. Native Tab/Enter still
    // reach its buttons because this branch does not prevent them; Esc is the
    // one direct flight action, resuming immediately rather than waiting for
    // another frame to toggle the state behind the modal. A nested Settings
    // dialog captures Esc first and closes back to this sheet.
    if (pauseScreen?.isOpen() === true) {
      if (BINDINGS.pause.includes(e.code as never) && !e.repeat) {
        e.preventDefault()
        pauseScreen.hide()
        frame = withPaused(frame!, false)
        clearMapInput()
      }
      return
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
    replayHeld.delete(e.code)
  })
  // A keyup that fires while the tab is unfocused is never delivered to this
  // page, so a key held at the moment focus is lost would otherwise stay
  // "down" forever -- the airplane keeps pitching after the window loses focus.
  window.addEventListener('blur', () => {
    pressed.clear()
    // Review Focus 2: a held W must not keep flying the Manual camera.
    replayHeld.clear()
    dragPointer = null
    mouseDelta = NO_MOUSE
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
    // A replay holds the live world the same way (R-9): no key and no mouse
    // reaches the flight while one is up; the replay reads its own.
    const chartOpen = navigationMapState.open || title.up() || replay !== null
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
    // Orbit plan ruling P-3: the mouse is gated as the radar-range key is --
    // the title/chart (`chartOpen`), an impact or shoot-down (its hold and
    // debrief), a landing debrief. Cleared every frame, blocked or not, so a
    // drag made under a dialog is never applied later.
    const mouseBlocked = chartOpen || debriefOrHoldUp() || pauseScreen?.isOpen() === true
    const frameMouse = mouseBlocked ? NO_MOUSE : mouseDelta
    // The replay cameras read the same drag and wheel (spec §5), captured
    // before the clear below.
    const replayMouse = mouseDelta
    mouseDelta = NO_MOUSE
    let current = nextFrameState(inputFrame, frameMs / 1000, frameKeys, stepper, quality.arcadeDamage(), frameMouse, godMode)
    if (inspectScenery) current = { ...current, eye: cameraTransformFor('chase', spec, current.render,
      { yawRad: 0, pitchRad: -Math.PI / 5 }) }
    if (forcedLook !== undefined && current.look.yawRad === 0 && current.look.pitchRad === 0) {
      current = { ...current, eye: cameraTransformFor(current.cameraMode, spec, current.render, forcedLook) }
    }
    if (title.up()) current = withPaused(current, true)
    if (replay !== null) current = withPaused(current, true)
    if (navigationMapState.open) {
      current = withPaused(current, true)
      navigationMap.show(current.world, navigationMapState.selectedId)
    }
    // Only the manual Esc edge raises the pause sheet. Other held states
    // (title, navigation chart, replay, landing/debrief) keep their own UI.
    if (pendingPause && current.paused) pauseScreen?.show()
    else if (!current.paused) pauseScreen?.hide()
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
    {
      // Guarded on the world clock actually having moved: `advance` (Task 7
      // review round 1) feeds a held world zero elapsed seconds whenever it
      // is paused, frozen after an impact/destruction (debrief up), or the
      // title/chart is over it -- `world.tick` does not change in any of
      // those cases (confirmed by reading src/sim/loop.ts's `advance`: it
      // returns the SAME world, tick included, when `elapsed === 0`, and
      // src/render/frame.ts's `nextFrameState` zeroes `simElapsedSeconds`
      // for exactly paused/holding frames). Stepping unconditionally would
      // fold that frozen aircraft's altitude/speed into `segment`'s maxima
      // every one of those frames -- e.g. a shot-down-at-5000m pilot who
      // returns to the title and picks a new scenario would otherwise carry
      // the old dive's peak speed into the NEXT sortie's log line, because
      // `stepSegment` updates the maxima unconditionally regardless of
      // `ticksAdvanced` (only `flightSeconds` is tick-gated).
      //
      // `segmentTick` itself is still updated every frame, guard or not, so
      // it tracks `current.world.tick` through the whole held stretch and
      // the guard is false throughout -- not just on the first held frame.
      // It is deliberately NOT reset at any of the five `segment =
      // EMPTY_SEGMENT` sites above: a reset world's `tick` restarts at 0,
      // so if `segmentTick` were also reset to 0 right there, the OLD
      // (still-loading, still-frozen) world's nonzero `tick` would satisfy
      // `tick > segmentTick` on the very next frame and step the fresh
      // `EMPTY_SEGMENT` against the stale frame one more time before the
      // new world ever swaps in. Leaving `segmentTick` alone keeps the
      // guard false until the swap actually happens (the new world's `tick`
      // starts at/near 0, at or below the stale `segmentTick`), at the cost
      // of one skipped sample on the swap frame itself -- the same frame
      // `ticksAdvanced`'s negative-delta clamp (Task 5) already discarded.
      if (current.world.tick > segmentTick) {
        const { spec: pSpec, state: pState } = playerAircraft(current.world)
        // The same ground the diagnostics hook's `groundHeightM` reads: terrain
        // OR a carrier deck, so a trap's deck roll-out is not "airborne".
        const ground = groundUnder(current.world.terrain, decksOf(current.world.ships), pState.position.x, pState.position.z)?.heightM ?? 0
        segment = stepSegment(segment, {
          ticksAdvanced: current.world.tick - segmentTick,
          altitudeM: pState.position.y,
          speedMps: length(airVelocity(pState, current.world.wind)),
          airborne: !onGround(pSpec, pState, ground),
        })
      }
      segmentTick = current.world.tick
    }
    // Instant replay: record LIVE worlds only; a held frame (paused, impact
    // hold) hands back the same tick, which the recorder ignores itself.
    if (replay === null) recorder.push(current.world)
    // What this frame DRAWS: the live frame, or while a replay is up the
    // recorded moment at the player's `tS` through the replay camera. Every
    // mesh, the panel, effects, sky and the render read `view`; the HUD, the
    // debrief banking and `segment` stay on the live `current`.
    let view: RenderView = current
    if (replay !== null) {
      const session = replay
      // `jumped` marks the frame after a seek / step / restart, and
      // `stepReplay` clears it, so it is read BEFORE the step.
      const jumped = session.player.jumped
      session.player = stepReplay(session.player, frameMs)
      session.jumpedThisFrame = jumped
      // Safe mid-frame: `view` stays `current` for the rest of this one.
      if (session.player.done) endReplay()
      else {
        const pose = replayPosesAt(session.player.recording, session.player.tS)
        const floor = surfaceHeightFor(pose.world)
        // The CURRENT eye of the camera state at this moment (T4's contract
        // for `stepCameraState`), so a drag handover starts exactly there.
        session.camera = stepCameraState(session.camera, { mouse: replayMouse, held: replayHeld, realDtS: frameMs / 1000 },
          replayEye(session.camera, pose, floor), pose)
        const eye = replayEye(session.camera, pose, floor)
        const drawn = effectiveCamera(session.camera)
        view = {
          world: pose.world, eye, poses: pose.poses, shipPoses: pose.shipPoses, render: pose.render,
          controls: playerAircraft(pose.world).controls,
          cameraMode: drawn === 'cockpit' ? 'cockpit' : 'chase',
          paused: !session.player.playing, timeScale: session.player.speed,
        }
        if (jumped || drawn !== session.drawnCamera) replayHistoryCut = true
        session.eye = eye
        session.pose = pose
        session.drawnCamera = drawn
        replayBar.show(replayBarModel(session.player, session.camera))
      }
    }
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
    // M2 R1: world-ordered, including spawned held entities (entityViews.ts).
    const { airframes, shipHandles, player: playerAirframe } = entityViews(scenarioEntities!, view.world)
    // `player` is the LIVE airplane (the debrief banking and the post-impact
    // ocean clock read it); `viewPlayer` is the one drawn, live or recorded.
    const player = playerAircraft(current.world)
    const viewPlayer = playerAircraft(view.world)
    legend.setRacks(racksLabel(player.spec))
    renderedPlayerPosition = view.poses[view.world.aircraft.findIndex((a) => a.id === view.world.player)]!.position

    // Camera-relative: the world moves, the camera stays at the origin. float32
    // loses precision at 100 km, which shows as geometry jitter -- master spec §4
    // requires this from the first commit because retrofitting it means touching
    // every position in the renderer. `worldOffsetFor` and `toThreeOrientation`
    // are the pure arithmetic (frame.ts); this is only the `.set()` calls that
    // apply it -- Task 13 review, round 1: both bugs it fixed were coordinate
    // arithmetic sitting in this file with no tests, which is why that
    // arithmetic now lives in frame.ts instead.
    const worldOffset = worldOffsetFor(view.eye.position)
    scene.position.set(worldOffset.x, worldOffset.y, worldOffset.z)
    beaches?.update(view.eye.position.x, view.eye.position.z)
    camera.position.set(0, 0, 0)
    const cameraOrientation = toThreeOrientation(view.eye.attitude)
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
    //
    // Drawn at the sim pose: the sim carries the ground attitude, tail down on
    // its wheels included, since T1 (2026-09-28).
    view.poses.forEach((pose, i) => {
      const a = airframes[i]!.root
      a.position.set(pose.position.x, pose.position.y, pose.position.z)
      a.quaternion.set(pose.attitude.x, pose.attitude.y, pose.attitude.z, pose.attitude.w)
    })
    // The hulls. A ship has no attitude in this plan (`interpolateShip`), only
    // a heading, and `createShipMesh` puts its bow along local +x -- so the
    // yaw is the same `pi/2 - headingRad` about +y that `parkedAttitude` gives
    // a parked airplane, from the same compass convention.
    setEnsignTime(performance.now() / 1000)
    view.shipPoses.forEach((pose, i) => {
      const m = shipHandles[i]!.root
      m.position.set(pose.position.x, pose.position.y, pose.position.z)
      const q = qFromAxisAngle(v3(0, 1, 0), Math.PI / 2 - pose.headingRad)
      m.quaternion.set(q.x, q.y, q.z, q.w)
    })

    // The cockpit group (the panel) shares the PLAYER's exact pose: panel.ts
    // authors the panel in the same body frame, relative to the eye, so it
    // needs no separate transform here.
    cockpit.position.set(view.render.position.x, view.render.position.y, view.render.position.z)
    cockpit.quaternion.set(view.render.attitude.x, view.render.attitude.y, view.render.attitude.z, view.render.attitude.w)

    // Cockpit mode must hide the external airframe (frame.ts's
    // `airframeVisibilityFor` doc comment has the occlusion measurement).
    // Cockpit interior geometry is a later plan's; until then the panel
    // floats in front of an invisible airframe, which is exactly the view a
    // pilot has.
    const visibility = airframeVisibilityFor(view.cameraMode)
    cockpit.visible = visibility.cockpitVisible
    // Behind the title, and while a New game reload is in flight, the airplane
    // drawn is the boot default, not the one being chosen: draw nothing.
    const sortieIdle = title.up() || swapPending
    const airframeShown = visibility.hellcatVisible && !sortieIdle
    playerAirframe.root.visible = airframeShown
    if (gunPipper) poseGunPipper(gunPipper, playerAirframe.root, airframeShown)
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
    radarSweepRad = radarSweepAngle(view.world.tick * DT + view.world.accumulatorSeconds)
    radarContactList = radarContacts(viewPlayer, view.world.aircraft, selectedRadarRangeMi, view.world.combat.aircraft)
    updatePanel(panel, spec, viewPlayer.state, view.controls, makeTextTexture, view.render.attitude, view.world.wind)
    audio.setView(view.cameraMode === 'cockpit' ? 'cockpit' : 'chase')
    audio.setCameraZoom(view.cameraMode === 'cockpit' ? 1 : current.orbit.zoom)
    if (replay === null) {
      // Silent behind the title and during the reload: the world is the boot
      // default's, paused, and its idle engine would play under the menu.
      if (sortieIdle) audio.hold(true)
      else {
        // Released every flying frame: `hold` is a latch, and nothing else on
        // this path clears it, so without this the flight after the title was
        // silent -- engine at gain 0, every cue skipped (2026-09-29, found by
        // gunnery.spec's cue count; b8f9c25 added the hold).
        audio.hold(false)
        audio.update(audioInputsFrom(current))
        audio.updateSpatial(spatialInputsFrom(current, view.eye))
      }
    } else {
      if (replay.jumpedThisFrame) {
        audio.prime(audioInputsFrom(view))
        audio.primeSpatial(spatialInputsFrom(view, view.eye))
      }
      if (replay.player.playing) {
        audio.hold(false)
        audio.update(audioInputsFrom(view), replay.player.speed)
        audio.updateSpatial(spatialInputsFrom(view, view.eye), replay.player.speed)
      } else audio.hold(true)
    }
    flightData.update(current.cameraMode, spec, player.state, current.controls, current.world.wind)
    timeBadge.setScale(current.timeScale)
    autopilotBadge.setStatus(current.autopilot, current.bayDoorsNoticeS, current.torpedoNoticeS)
    pauseBadge.setPaused(current.paused)
    const paddles = paddlesFor(current)
    paddlesBadge.setCue(paddles)
    // T3-R1: freezes the radio countdown under pause and while any debrief is
    // up -- the same impact/destroyedAt/landingShown signals `openNavigationChart`
    // (above) already reads to recognise a debrief is showing.
    const debriefUp = player.impact !== null || current.world.combat.aircraft[current.world.player]!.damage.destroyedAt !== null || landingShown
    const steering = missionHud.update(current.world, navigationMapState.selectedId, frameMs, current.paused || debriefUp, friendlyFireRadio(current.world))
    // I2: the radio voices what the HUD line shows and what the LSO calls. Live, unpaused flight
    // only, so a replay, the title or a debrief never speaks.
    if (replay === null && !sortieIdle && !current.paused && !debriefUp) {
      audio.updateRadio({ message: missionHud.text().radio, paddles, language: radioLanguageFor(current) })
    }
    const steered = steeringArrow.update(steering?.target ?? null, playerAirframe.root, camera, worldOffset, replay === null && !sortieIdle && !debriefUp)
    missionHud.placeSteering(steered.anchor, steered.mode)
    // B2: the impact marker. Off, the predictor is never called; on, it is memoized per sim tick.
    {
      const live = replay === null && !sortieIdle && !debriefUp
      const me = playerAircraft(current.world)
      const on = current.impactMarker && live
      const prediction = impactPredictor(
        on, me.spec, me.state, current.world.combat.aircraft[me.id]?.stores ?? emptyStores,
        current.world.terrain, current.world.wind, decksOf(current.world.ships),
      )
      const shown = impactMarker.update(
        prediction?.point ?? null, prediction?.armed ?? true, camera, worldOffset, impactMarkerShown(current.impactMarker, live, prediction),
      )
      const label = impactLabel(on, prediction, me.state.position)
      impactBadge.set(label)
      const ring = current.world.combat.impacts
      const detonations: Vec3[] = []
      if (on) for (let i = ring.length - 1; i >= 0 && detonations.length < 8; i--) {
        const hit = ring[i]!
        if ((hit.cause === 'bomb' || hit.cause === 'rocket') && hit.outcome === 'detonated') detonations.push(hit.point)
      }
      impactDiagnostics = { on, shown, label, prediction, tick: current.world.tick, detonations }
    }
    // Plan 6: the readout and tracers are stateless views of World.combat;
    // every effect is E1's (fx/, below).
    combatReadout.setRecord(current.world.combat.aircraft[current.world.player], racksLabel(player.spec))
    tracers.update(view.world.combat.projectiles)
    aaTracers.update(view.world.combat.projectiles, player.state.position)
    // Plan 6b Task 8: stores on the airframe, ordnance in flight, ship
    // sinking/burning and structure collapse -- all stateless views of
    // `World.combat`.
    view.world.aircraft.forEach((a, i) => {
      const stores = view.world.combat.aircraft[a.id]?.stores
      if (stores !== undefined) airframes[i]!.setStores(stores.bombs, stores.rockets)
    })
    // One `update` per aircraft per frame (A6M Zero spec §7.3): gear, flaps,
    // propeller, and from Z3 the level of detail. Gear and flap travel are
    // multi-second, so a per-tick read off `World.aircraft[i].state` causes
    // no visible jitter -- same reasoning as the `setStores` loop above.
    // `airframeUpdateFor` owns the rules: the player's airframe reads the raw
    // frame controls, every other its own pilot's, and a wreck's prop stops.
    view.world.aircraft.forEach((a, i) => {
      const playerControls = a.id === view.world.player ? view.controls : null
      const damage = view.world.combat.aircraft[a.id]?.damage ?? null
      airframes[i]!.update({ ...airframeUpdateFor(a, playerControls, view.poses[i]!.position, view.eye.position, frameMs / 1000, damage, view.world.tick, a.id), aim: turretAimFor(view.world, view.poses, i) })
      // An airframe that exploded in the air is gone once its wreck reaches the surface: the crash
      // effect covers the spot (damage stages, 2026-10-09). The player's own is the debrief's.
      if (a.id !== view.world.player) airframes[i]!.root.visible = !(damage?.destroyedAt != null && a.impact !== null)
    })
    ordnance.update(view.world.combat.projectiles)
    view.world.ships.forEach((s, i) => {
      const damage = view.world.combat.ships[s.id]
      if (damage !== undefined) shipHandles[i]!.setDamage(damage.fire, damage.sinkingFraction, floodListRad(damage, s.spec.hullHp))
      applyShipGunLaying(s.id, shipHandles[i]!.mounts, view.world.combat.aa.laying)
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
    for (const h of airfieldHandles) h.sync(view.world.combat.structures)
    // E1: every effect reads World.combat through one pure edge detector
    // (fx/events.ts), one seeded pool (fx/system.ts) and one pass (fx/fxPass.ts).
    if (fxSystem !== null && fxPass !== null) {
      const started = performance.now()
      const shipSmokeOrigins = new Map(view.world.ships.map((s, i) => [s.id, smokeOriginWorld(shipHandles[i]!, worldOffset)] as const))
      const structureAnchors = new Map(airfieldHandles.flatMap((h) => [...h.smokeAnchors]))
      const anchors = { shipSmokeOrigins, structureAnchors }
      if (replay === null) {
        const events = nextFxEvents(fxMemory, {
          tick: view.world.tick, combat: view.world.combat, aircraft: view.world.aircraft, poses: view.poses,
          shipSmokeOrigins, structureAnchors,
        })
        fxMemory = events.memory
        for (const t of events.triggers) fxSystem.trigger(t.recipe, t.position, t.velocity)
        if (fxStress !== null) {
          const due = Math.floor(((now - fxStress.startedMs) / 1000) * fxStress.scene.roundsHz)
          for (; fxStress.rounds < due; fxStress.rounds++) for (const t of stressRounds(fxStress.scene.center, fxStress.rounds)) fxSystem.trigger(t.recipe, t.position, t.velocity)
        }
        fxSystem.setSustained(fxStress === null ? events.sustained : [...events.sustained, ...fxStress.scene.sustained])
        fxSystem.step(fxDtSeconds(frameMs / 1000, view.paused, view.timeScale))
      } else if (replay.jumpedThisFrame) {
        const rebuildStarted = performance.now()
        replay.replayFxMemory = rebuildReplayFx(
          fxSystem, replay.player.recording, replay.player.tS, anchors,
        )
        lastFxRebuildMs = performance.now() - rebuildStarted
      } else if (replay.player.playing) {
        replay.replayFxMemory = stepReplayFx(
          fxSystem, replay.replayFxMemory, replay.pose,
          (frameMs / 1000) * replay.player.speed, anchors,
        )
      }
      fxPass.setWorldOffset(worldOffset)
      fxPass.setCount(fxSystem.writeInstances(view.eye.position, fxPass.instances))
      fxCpuMs = performance.now() - started
    }

    // Raised once per contact -- `shownImpactTick` is the guard, since the
    // player's `impact` stays non-null every frame after the airplane stops,
    // and this runs sixty times a second.
    const hit = player.impact
    if (hit !== null && shownImpactTick !== hit.tick) {
      shownImpactTick = hit.tick
      const killsSinceLastBank = killsSince(current.world.combat.aircraft[current.world.player]!.killsByType, scoredThroughKillsByType)
      const { model, badgeId } = withMissionDebrief(withDischarge(debriefModel(hit, player.state, killsSinceLastBank), current.world), current.world)
      scoredThroughKillsByType = current.world.combat.aircraft[current.world.player]!.killsByType
      const banked = bankMissionResult(
        model.score.total,
        hit.kind === 'ditched' ? 'ditched' : 'killed',
        killsSinceLastBank,
        sortieFacts(hit.kind === 'ditched' ? 'ditched' : 'killed', current.world),
        friendlyFireBank(model),
        badgeId,
      )
      segment = EMPTY_SEGMENT
      pendingDebrief = { show: () => showDebrief(model, banked, undefined, watchReplay) }
      dispatch({ kind: 'crashBanked' })
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
      const { model, badgeId } = withMissionDebrief(withDischarge(destructionModel(player.state, playerDamage.attacker, killsSinceLastBank, playerDamage.attacker !== null && !playerDamage.attacker.startsWith(COLLISION_ATTACKER_PREFIX) && !current.world.aircraft.some((x) => x.id === playerDamage.attacker), collisionShipName(current.world, playerDamage.attacker)), current.world), current.world)
      scoredThroughKillsByType = current.world.combat.aircraft[current.world.player]!.killsByType
      const banked = bankMissionResult(model.score.total, 'killed', killsSinceLastBank, sortieFacts('killed', current.world), friendlyFireBank(model), badgeId)
      segment = EMPTY_SEGMENT
      pendingDebrief = { show: () => showDebrief(model, banked, undefined, watchReplay) }
      dispatch({ kind: 'crashBanked' })
    }
    dispatch({
      kind: 'frame', frameMs, paused: current.paused,
      recordingAvailable: recorder.snapshot() !== null,
    })
    // A landing, raised once and holding the world under the dialog through
    // the pause rather than through a second freeze (frame.ts's `paused`).
    // Continue releases both; Restart goes through the handler above.
    if (current.landing.report !== null && !landingShown) {
      const landing = landingDisposition(current.world.mission, handledLandingTick, friendlyFireOf(current.world) !== null)
      handledLandingTick = landing.tick
      if (landing.kind === 'intermediate') {
        // Spec §2.4: the engine logged "<label> n of count" for the radio line;
        // the flight goes on, unpaused and unbanked (M2 R3).
        frame = acknowledgeLanding(current)
      } else {
        landingShown = true
        frame = withPaused(current, true)
        const killsSinceLastBank = killsSince(current.world.combat.aircraft[current.world.player]!.killsByType, scoredThroughKillsByType)
        const { model, badgeId } = withMissionDebrief(
          withDischarge(landingModel(
            current.landing.report,
            killsSinceLastBank,
            Object.fromEntries(current.world.ships.map((s) => [s.id, s.spec.name])),
          ), current.world),
          current.world,
        )
        scoredThroughKillsByType = current.world.combat.aircraft[current.world.player]!.killsByType
        const banked = bankMissionResult(
          model.score.total,
          'landed',
          killsSinceLastBank,
          sortieFacts(landingKind(current.landing.report), current.world),
          friendlyFireBank(model),
          badgeId,
        )
        segment = EMPTY_SEGMENT
        showDebrief(model, banked, () => {
          frame = acknowledgeLanding(frame!)
          landingShown = false
          debrief.hide()
          dispatch({ kind: 'debriefClosed' })
        }, watchReplay)
        dispatch({ kind: 'landingDebrief' })
      }
    }

    // The sky dome's colour only depends on view direction, but its geometry
    // is centred on its own origin; re-centring that origin under the eye's
    // horizontal position each frame (the whole scene, sky included, is
    // translated by -eye above) keeps the horizon centred under the camera
    // horizontally. It is deliberately NOT re-centred vertically (y stays 0),
    // so the horizon sits very slightly below eye level at any nonzero
    // altitude -- e.g. about 0.76 degrees at an E2E spawn 600 m up against
    // the dome's 45,000 m radius (atan(600/45000); negligible at the parked
    // default's few metres) -- rather than exactly at it. Fixing the
    // horizontal drift is what matters: left unfixed, it is unbounded over a
    // long flight and eventually carries the camera outside the dome; the
    // vertical offset is bounded by altitude and stays negligible.
    sky.position.set(view.eye.position.x, 0, view.eye.position.z)

    // The water gets the same treatment, and did not until the whole-branch
    // review (I-1): left at the world origin it slid out from under the
    // airplane, and at the spawn's 120 m/s its old half-extent was spent in
    // under three minutes. Its depth lookup stays anchored in world space.
    // The wave fade is a screen-space criterion, so it needs the real viewport
    // and field of view rather than the nominal ones the uniform defaults to.
    recentreOcean(
      water,
      view.eye.position.x,
      view.eye.position.z,
      view.eye.position.y,
      ((camera.fov * Math.PI) / 180) / Math.max(window.innerHeight, 1),
    )

    // Reselects the patches to draw for this frame's eye position. Inside the
    // camera-relative block above only in the sense that it takes the same
    // WORLD position the offset was built from -- the mesh's own vertex node
    // works in world metres and lets `scene.position` do the shift, exactly
    // as the water and markers do.
    terrain.update(view.eye.position.x, view.eye.position.z)
    vegetation?.update(view.eye.position.x, view.eye.position.z)

    // `oceanTime` (DEV-only, from `?oceanTime=`) is a fixed override for
    // reproducing one ocean state on demand and stays exactly as fixed as it
    // is today; the accumulator below is added only to the sim-time
    // derivation it replaces, not to the override itself.
    if (player.impact !== null) postImpactOceanSeconds += frameMs / 1000
    // One clock for the sea and the sky (Plan 16a): the clouds drift on the
    // same simulated seconds the ocean's waves evolve on.
    // R-2: in a replay the sky clock is the replay's own `tS` (sim seconds),
    // so clouds and ocean match the recorded moment.
    const skyTimeS = oceanTime ?? (replay !== null ? replay.player.tS : current.world.tick * DT + current.world.accumulatorSeconds + postImpactOceanSeconds)
    // Plan 16c: the sun creeps with the sim clock, and the light follows its
    // elevation and the eye's altitude -- photoreal Task 9, from the
    // atmosphere model (sky/palette.ts; its sky irradiance comes from a
    // table built once at boot and interpolated here).
    const hour = sunClock(scenarioTimeOfDay, skyTimeS)
    const { elevationDeg, azimuthDeg } = sunPosition(TERRAIN_HEADER.centreLatDeg, hour)
    const direction = sunDirectionWorld(elevationDeg, azimuthDeg)
    applySun(lights, atmospherePalette(view.eye.position.y, elevationDeg), direction, elevationDeg,
      cloudTier === 'off' ? 0 : cumulusCover(cloudLayers))
    // Phase A: a fixed exposure per sun elevation (exposure.ts), so dusk
    // reads dim but not black. One uniform write; no pipeline rebuild.
    framePipeline.setExposure(exposureFor(elevationDeg))
    sunState = { timeOfDay: hour, elevationDeg, azimuthDeg, direction: { x: direction.x, y: direction.y, z: direction.z } }
    clouds.update(view.eye.position, skyTimeS, view.world.wind)
    for (const cascade of cascades) {
      cascade.dispatch(skyTimeS)
    }
    // While GPU samples are being collected, a frame is NOT rendered until the
    // previous frame's timestamp resolve has landed. The paragraph after the
    // next explains why the guard alone stopped being enough on 2026-09-17.
    const inFlight = !title.up() && !swapPending && !navigationMapState.open && replay === null
    const sampling = renderer.hasFeature('timestamp-query') && gpuRenderTimesMs.length < FRAME_TIME_CAPACITY
    if (!(sampling && gpuResolvePending)) {
      // Plan 16b: the shadow map first, inside the same frame and the same
      // timestamp pool ('render'), so the budget below includes it.
      // Photoreal Task 8: the per-frame sky-view and aerial-perspective LUTs
      // at this frame's eye altitude (the world's y is true metres) and sun,
      // in the same timestamp pool as the passes below.
      if (!atmosphereOff) atmosphere.update(renderer, view.eye.position.y, direction, camera)
      if (shadow.enabled) {
        shadow.update(view.eye.position)
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
        const eye = view.eye.position
        const cut = (cloudHistoryEye !== null && shouldResetHistory({
          eye, prevEye: cloudHistoryEye, frameSeconds: (now - cloudHistoryAtMs) / 1000, timeScale: view.timeScale,
        }))
          || (cloudHistoryPaused && !view.paused)
          // A chase <-> cockpit cut is a new view, whatever the speed test
          // makes of a 10 m eye jump at this frame rate.
          || (cloudHistoryCameraMode !== null && view.cameraMode !== cloudHistoryCameraMode)
          // Instant replay (spec §7): entry, exit, a jump or a camera switch.
          || replayHistoryCut
        replayHistoryCut = false
        if (cut) {
          cloudPass?.resetHistory()
          framePipeline.resetHistory()
        }
        cloudPass?.setEye(eye)
        framePipeline.setEye(eye)
        cloudHistoryEye = eye
        cloudHistoryAtMs = now
        cloudHistoryPaused = view.paused
        cloudHistoryCameraMode = view.cameraMode
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
    // can. Serializing costs nothing measurable when
    // resolves keep up (pre-scenery main: 599 samples of 601 frames, and
    // 1.84 ms either way) and halves the frame rate only while the GPU is
    // heavy AND samples are still wanted: the first FRAME_TIME_CAPACITY
    // frames after boot or a `resetFrameTimes()`, i.e. an E2E budget window.
    // DEV only since A4 (2026-10-09): production no longer tracks timestamps.
    adaptQuality(frameMs, inFlight)
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
      position: playerAircraft(current.world).state.position,
    })
    // The first frame built every material; the title can unlock.
    if (!boot.ready) {
      boot.end('shaders')
      track('boot_ready', { ms: Math.round(performance.now()) })
    }
  }
  // One paint BEFORE the first frame, which is the shader build (spec §A.1):
  // rAF alone runs before that frame's paint, so without the setTimeout hop
  // "Compiling shaders..." would not be on screen while the build blocks.
  boot.begin('shaders')
  await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))
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
    const next = applyTerrainLevel(terrain, before, level, data, finestFetchedLevel, coverData === null ? null : coverFieldFor(before.world.airfields, coverData))
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
      // L3 Phase 2: invented nipa-hut villages, DEV-only behind `?villages=on`
      // until Mark approves them (docs/superpowers/plans/2026-10-09-l3-land-quality.md).
      const villages = import.meta.env.DEV && new URLSearchParams(location.search).get('villages') === 'on'
        ? createVillages(arrived, villagesData as readonly Village[], next.world.airfields)
        : null
      if (villages) scene.add(villages.object)
      vegetation = createVegetation(arrived, next.world.airfields, [...towns.hutFootprints, ...(villages?.footprints ?? [])])
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
