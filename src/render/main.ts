import { Group, PerspectiveCamera, Scene } from 'three'
import { initRenderer, normalizeGpuError } from './renderer.js'
import { showFailure, type FailureKind } from './failure.js'
import { createRafLoop, type RafLoop } from './rafLoop.js'
import { CAMERA_VFOV_DEG, cameraTransformFor } from './camera.js'
import { makeTextTexture } from './scene/text.js'
import { FINEST_FETCHED_LEVEL, SCENARIO_ID } from './content.js'
import { createOverlay } from './overlay.js'
import { createLegend } from './legend.js'
import { createAudioSystem } from '../audio/system.js'
import { createWebAudioBackend } from '../audio/webAudio.js'
import { audioInputsFrom } from './audio.js'
import { createFlightData } from './flightData.js'
import { createTimeBadge } from './timeBadge.js'
import { createPauseBadge } from './pauseBadge.js'
import { createDebrief, debriefModel, landingModel } from './debrief.js'
import { CLOSED_NAVIGATION_MAP, closeNavigationMap, createMissionMap, openNavigationMap, selectNavigationDestination } from './missionMap.js'
import { createImpactEffect } from './scene/impactEffect.js'
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
import { DEFAULT_BEAUFORT, beaufortFromQuery, oceanTimeFromQuery } from './ocean/weather.js'
import { createOceanCompute, type OceanCompute } from './ocean/compute.js'
import { OCEAN_TIERS, oceanTierFromQuery, tierForFrameTimeMs } from './ocean/tiers.js'
import { cascadeOptions } from './ocean/bands.js'
import { OCEAN_EXTENT_M } from './horizon.js'
import { createRunway } from './scene/runway.js'
import { createAirfield } from './scene/airfield.js'
import { createVegetation, coverLookup, type CoverLookup } from './scene/vegetation.js'
import { createSky } from './scene/sky.js'
import { createLighting } from './scene/lighting.js'
import { createHellcat } from './scene/hellcat.js'
import { createShipMesh } from './scene/ship.js'
import { createTerrainMesh } from './terrain/mesh.js'
import { applyTerrainLevel, loadTerrainProgressively, TERRAIN_HEADER } from './terrain/load.js'
import { createPanel, resizePanel, updatePanel } from './scene/panel.js'
import { loadScenarioBundle } from './scenarioLoad.js'
import { worldFromScenario, type ScenarioBundle } from '../sim/scenario.js'
import { step, DT } from '../sim/flight/model.js'
import { stepChecked } from '../sim/invariants.js'
import { heightAt, type TerrainField } from '../sim/world/terrain.js'
import { supportedContact } from '../sim/ground.js'
import { playerAircraft, withAircraftState, type World } from '../sim/loop.js'
import { NEUTRAL } from '../input/keyboard.js'
import { LOOK_CENTRE } from '../input/lookAround.js'
import { DEFAULT_ASSIST_SETTINGS } from '../assists/index.js'
import {
  hasSpawnOverride,
  initialAircraftState,
  spawnPositionFromQuery,
} from './spawn.js'
import { v3, type Vec3 } from '../sim/math/vec3.js'
import { qFromAxisAngle } from '../sim/math/quat.js'
import { FRAME_TIME_CAPACITY, type Ww2Diagnostics } from './diagnostics.js'
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
 * GPU render-pass durations, milliseconds, since the last
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
 * section 10.2 has the evidence. This one is the GPU's own clock around the
 * render pass and does not know any of that exists.
 */
const gpuFrameTimesMs: number[] = []

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

  const beaufort = import.meta.env.DEV ? beaufortFromQuery(window.location.search) : DEFAULT_BEAUFORT

  const canvas = document.createElement('canvas')
  root.appendChild(canvas)

  // Timestamp queries also support one automatic ocean quality decision.
  // The external diagnostics hook remains development-only.
  const { renderer, adapterVerdict } = await initRenderer(canvas, true)

  // Declared here, before the hook below installs, initialised to `null` --
  // not assigned a real `FrameState` until after `loadScenarioBundle` resolves,
  // well down this function. See the hook's own comment for why that ordering
  // matters and is not just tidiness.
  let cascades: OceanCompute[] = []
  // `let` for the same temporal-dead-zone reason as `spawnPosition` above: the
  // diagnostics hook's `oceanLandWeight` closes over it before `loadDepth` resolves.
  let oceanDepth: DepthField | null = null
  const forcedOceanTier = import.meta.env.DEV ? oceanTierFromQuery(location.search) : undefined
  let oceanTier = forcedOceanTier ?? OCEAN_TIERS[0]
  let frame: FrameState | null = null

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
  // first keypress resumes it (see the keydown listener).
  const audio = createAudioSystem(createWebAudioBackend())
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
      oceanLandWeight: (x, z) => {
        if (!oceanDepth) return null
        return landWeightAt(terrain.levelTexture(FINEST_FETCHED_LEVEL), oceanDepth.header.halfExtentM, x, z)
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
        if (!frame?.world.terrain) return null
        const { position } = playerAircraft(frame.world).state
        return heightAt(frame.world.terrain, position.x, position.z)
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
        (frame?.world.ships ?? []).map((s) => ({
          id: s.id,
          x: s.state.position.x,
          z: s.state.position.z,
          headingRad: s.state.headingRad,
        })),
      aircraft: () =>
        (frame?.world.aircraft ?? []).map((a) => ({
          id: a.id,
          x: a.state.position.x,
          y: a.state.position.y,
          z: a.state.position.z,
        })),
      // Same `??`-guard as the rest: before the first frame exists there is
      // no impact to report, which is also the honest answer once a restart
      // has cleared one.
      impact: () => (frame ? playerAircraft(frame.world).impact : null),
      // Task 13: the take-off spec's only way to tell "left the ground" from
      // "was never on it". Recomputed from the live frame rather than stored,
      // because `supportedContact` is a pure predicate and `World` does not
      // carry its result -- see the comment on this member in diagnostics.ts.
      supportedContact: () => {
        if (!frame?.world.terrain) return false
        const { spec: playerSpec, state } = playerAircraft(frame.world)
        return supportedContact(
          playerSpec,
          state,
          heightAt(frame.world.terrain, state.position.x, state.position.z),
        )
      },
      frameTimesMs: () => frameTimesMs.slice(),
      gpuFrameTimesMs: () => gpuFrameTimesMs.slice(),
      // `hasFeature`, not a stored flag: three decides at device creation
      // whether to honour `trackTimestamp` by testing exactly this feature
      // (WebGPUBackend.js:298, three@0.186.0), so asking the renderer the
      // same question cannot drift from what it actually did.
      gpuTimestampsSupported: renderer.hasFeature('timestamp-query'),
      audio: () => audio.snapshot(),
      resetFrameTimes: () => {
        cascades.forEach(c => c.resetTimings())
        frameTimesMs.length = 0
        gpuFrameTimesMs.length = 0
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
  // Declared here so `onDeviceLost`, wired immediately below, closes over a
  // binding that already exists -- Task 15's TDZ lesson.
  let loop: RafLoop | null = null
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

  // The whole world, as content: the scenario, both airfield records, both
  // ship classes and the one aircraft spec (`src/render/scenarioLoad.ts`).
  // Any of the five failing to load or failing validation is the same fault
  // and the same screen a missing `f6f-hellcat.json` was before Plan 12 --
  // content the build was supposed to ship. The message names the file.
  let bundle: ScenarioBundle
  try {
    bundle = await loadScenarioBundle(SCENARIO_ID)
  } catch (err) {
    showFailure(root, 'bad-content', err instanceof Error ? err.message : String(err))
    return
  }

  // The scenario says where the player is parked; a DEV `?spawnX/Y/Z` moves
  // it into the air instead (spawn.ts). The airplane is then not `parked`, so
  // it gets the airborne posture `initialAircraftState` has always given an
  // override -- but the frame's own `groundSpawn` stays true, because the
  // CHOCKED WINGMAN is still parked and still needs the terrain hold, which
  // is what keeps it from being stepped off its placeholder altitude while
  // the override flies. `settleOnTerrain` then settles the wingman alone,
  // since it only touches entities with `parked` set.
  //
  // Read here rather than at the very top of `boot` as it was before Plan 12:
  // the fallback is the scenario's parked position now, so a malformed
  // `?spawnY=` cannot be rejected until the scenario has been read. It is
  // still rejected before any terrain is fetched, and still reaches the
  // failure screen (the throw leaves `boot` and `boot().catch` routes it).
  const scenarioWorld = worldFromScenario(bundle, null)
  const parkedAt = playerAircraft(scenarioWorld).state.position
  const override = import.meta.env.DEV && hasSpawnOverride(window.location.search)
  const spawnedAt = override ? spawnPositionFromQuery(window.location.search, parkedAt) : parkedAt
  // The nullable binding the diagnostics hook above closes over, now that
  // there is an answer to put in it.
  spawnPosition = spawnedAt

  /**
   * The world a flight starts from: the scenario's, with this page load's
   * terrain and the DEV spawn override applied. Called once at boot with no
   * terrain, and again by Restart with whatever level has loaded by then --
   * which is why it rebuilds from `bundle` rather than closing over one
   * world, exactly as the old restart path rebuilt from `initialFrameState`.
   *
   * `worldFromScenario` is handed `null` and the field injected afterwards,
   * deliberately: with a real field it re-runs `assertLoopOverWater` over
   * every ship's loop, which is a Tier 1 assertion on every commit
   * (`tests/sim/scenario.test.ts`) and has no business throwing in a browser
   * -- least of all out of the Restart button.
   */
  const buildWorld = (terrain: TerrainField | null): World<undefined> => {
    const w = worldFromScenario(bundle, null)
    const withTerrainField = { ...w, terrain }
    return override
      ? withAircraftState(
          {
            ...withTerrainField,
            aircraft: withTerrainField.aircraft.map((a) => (a.id === w.player ? { ...a, parked: false } : a)),
          },
          w.player,
          initialAircraftState(spawnedAt, false),
        )
      : withTerrainField
  }

  // The player's own airplane, for the panel, the gauges and the flight-data
  // overlay. One aircraft spec is all any of those take; the wingman's is the
  // same record anyway (both are `f6f-hellcat`).
  const spec = playerAircraft(scenarioWorld).spec

  const scene = new Scene()
  const terrain = createTerrainMesh(TERRAIN_HEADER)
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
  let water = createOcean(oceanDepth, beaufort, cascades, terrain.levelTexture(FINEST_FETCHED_LEVEL))
  scene.add(water)
  let qualityChecked = false
  const adaptOceanQuality = async (): Promise<void> => {
    // One downgrade after warm-up. Never oscillate tiers or repeatedly compile
    // pipelines during flight; a DEV override holds the tier for comparison.
    const p95 = (values: readonly number[]) => [...values].sort((a,b)=>a-b)[Math.floor(values.length * .95)] ?? 0
    const timed = renderer.hasFeature('timestamp-query')
    if (qualityChecked || forcedOceanTier || (timed ? gpuFrameTimesMs.length < 180 : frameTimesMs.length < 180)) return
    qualityChecked = true
    const cost = timed ? p95(gpuFrameTimesMs.slice(60)) + cascades.reduce((sum,c)=>sum+p95(c.computeTimesMs().slice(60)),0)
      : p95(frameTimesMs.slice(60))
    // Without GPU timestamps, frame intervals include refresh cadence. Keep
    // high at 60 fps, medium below 30 fps, low otherwise.
    const next = timed ? tierForFrameTimeMs(cost) : cost <= 18 ? OCEAN_TIERS[0] : cost <= 34 ? OCEAN_TIERS[1] : OCEAN_TIERS[2]
    if (next === oceanTier) return
    const pending = await Promise.allSettled(cascadeOptions(beaufort,next.n,next.cascades).map(options=>createOceanCompute(renderer,options)))
    const ready = pending.flatMap(r=>r.status === 'fulfilled' ? [r.value] : [])
    if (ready.length !== next.cascades) { ready.forEach(c=>c.dispose()); return }
    const replacement = createOcean(oceanDepth!,beaufort,ready,terrain.levelTexture(FINEST_FETCHED_LEVEL))
    scene.remove(water)
    water.userData.disposeOcean()
    cascades.forEach(c=>c.dispose())
    cascades = ready
    water = replacement
    scene.add(water)
    oceanTier = next
    vegetation?.setTier(next.name)
  }
  const sky = createSky()
  scene.add(sky)
  scene.add(createLighting())
  // One airframe per aircraft entity, in world order, so `frame.poses[i]`
  // poses `airframes[i]` with no lookup (Plan 12). The PLAYER's is picked out
  // by id, not by assuming index 0: `world.player` names an id, and the
  // scenario is free to list the wingman first.
  //
  // Read off `scenarioWorld` rather than off a frame, because the meshes are
  // built before the first `FrameState` exists. That is safe for exactly one
  // reason: every world `buildWorld` returns is built from the same `bundle`,
  // so it lists the same entities under the same ids in the same order --
  // including the one Restart builds. Nothing here is rebuilt on a restart,
  // and nothing needs to be.
  const airframes = scenarioWorld.aircraft.map(() => createHellcat())
  for (const a of airframes) scene.add(a.root)
  const playerIndex = scenarioWorld.aircraft.findIndex((a) => a.id === scenarioWorld.player)
  const hellcatRoot = airframes[playerIndex]!.root
  // The propeller the throttle spins is the player's alone -- the wingman is
  // chocked with its engine off, and a parked airplane with a turning
  // propeller is a worse lie than a still one.
  const prop = airframes[playerIndex]!.prop
  // Hulls, in world order for the same reason. Raw world metres like
  // everything else under `scene`, which already carries the camera-relative
  // offset once for every child.
  const shipMeshes = scenarioWorld.ships.map((ship) => createShipMesh(ship.spec))
  for (const m of shipMeshes) scene.add(m)

  // The panel is 3D geometry, not a screen-space HUD, so it gets parallax and
  // occlusion during look-around for free (spec rationale, this task). It
  // lives in its own group rather than as a child of hellcatRoot because the
  // two are visibility-exclusive (see the cockpit.visible/hellcatRoot.visible
  // swap below), not because they move differently -- both are posed from the
  // same `frame.render` pose each frame.
  const panel = createPanel(spec)
  resizePanel(panel, window.innerWidth / window.innerHeight)
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
    debrief.hide()
    impactEffect.hide()
    shownImpactTick = null
    landingShown = false
    postImpactOceanSeconds = 0
  })
  /** Whether the landing debrief is up for the landing `frame.landing.report`
   *  holds -- raised once, like `shownImpactTick`, and cleared by Continue or
   *  Restart. */
  let landingShown = false
  const impactEffect = createImpactEffect()
  scene.add(impactEffect.object)
  /** The tick of the impact the debrief is currently showing, so the modal is
   *  raised once rather than rebuilt sixty times a second. */
  let shownImpactTick: number | null = null
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
  let legendOpen = true

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
  // And the gear and flap levers. Found 2026-09-17 by a Tier 2 screenshot:
  // Playwright's `keyboard.press('KeyF')` is down-and-up within one frame,
  // and the flap light never lit because `nextFrameState` never saw the key
  // in the held set. A human tap is several frames, so nobody had noticed --
  // but at a display running past 100 Hz a quick tap gets short too.
  let pendingGear = false
  let pendingFlaps = false
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
    if (BINDINGS.toggleGear.includes(e.code as never) && !e.repeat) pendingGear = true
    if (BINDINGS.toggleFlaps.includes(e.code as never) && !e.repeat) pendingFlaps = true
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
    pendingPause = false
    pendingThrottleCut = false
    pendingGear = false
    pendingFlaps = false
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
    const chartOpen = navigationMapState.open
    const latched: string[] = []
    if (!chartOpen) {
      if (pendingCameraCycle) latched.push(BINDINGS.cycleCamera[0])
      if (pendingTripleTime) latched.push(BINDINGS.toggleTripleTime[0])
      if (pendingPause) latched.push(BINDINGS.pause[0])
      if (pendingThrottleCut) latched.push(BINDINGS.throttleCut[0])
      if (pendingGear) latched.push(BINDINGS.toggleGear[0])
      if (pendingFlaps) latched.push(BINDINGS.toggleFlaps[0])
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
          }
    let current = nextFrameState(inputFrame, frameMs / 1000, frameKeys, stepper)
    if (inspectScenery) current = { ...current, eye: cameraTransformFor('chase', spec, current.render,
      { yawRad: 0, pitchRad: -Math.PI / 5 }) }
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
    frame = current
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
    // poses `hellcatRoot` too, and it did so twice until the duplicate
    // `hellcatRoot.position.set(current.render...)` lines were deleted here.
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
      const m = shipMeshes[i]!
      m.position.set(pose.position.x, pose.position.y, pose.position.z)
      const q = qFromAxisAngle(v3(0, 1, 0), Math.PI / 2 - pose.headingRad)
      m.quaternion.set(q.x, q.y, q.z, q.w)
    })

    // The cockpit group (the panel) shares the PLAYER's exact pose: panel.ts
    // authors the panel in the same body frame, relative to the eye, so it
    // needs no separate transform here.
    cockpit.position.copy(hellcatRoot.position)
    cockpit.quaternion.copy(hellcatRoot.quaternion)

    // Cockpit mode must hide the external airframe (frame.ts's
    // `airframeVisibilityFor` doc comment has the occlusion measurement).
    // Cockpit interior geometry is a later plan's; until then the panel
    // floats in front of an invisible airframe, which is exactly the view a
    // pilot has.
    const visibility = airframeVisibilityFor(current.cameraMode)
    cockpit.visible = visibility.cockpitVisible
    hellcatRoot.visible = visibility.hellcatVisible
    // Numeric gauges from the simulated tick; the attitude ball from the
    // INTERPOLATED attitude, because it is the one instrument compared
    // against something visible in the same frame. `current.controls` is
    // also the pilot's raw input, not part of `AircraftState` (state.ts:8),
    // which is why the throttle gauge needs it passed separately -- the same
    // vector the propeller spin below already reads.
    updatePanel(panel, spec, player.state, current.controls, makeTextTexture, current.render.attitude)
    audio.update(audioInputsFrom(current))
    flightData.update(current.cameraMode, spec, player.state, current.controls)
    timeBadge.setScale(current.timeScale)
    pauseBadge.setPaused(current.paused)

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
      debrief.show(debriefModel(hit, player.state))
    }
    // A landing, raised once and holding the world under the dialog through
    // the pause rather than through a second freeze (frame.ts's `paused`).
    // Continue releases both; Restart goes through the handler above.
    if (current.landing.report !== null && !landingShown) {
      landingShown = true
      frame = withPaused(current, true)
      debrief.show(landingModel(current.landing.report), () => {
        frame = acknowledgeLanding(frame!)
        landingShown = false
        debrief.hide()
      })
    }
    impactEffect.object.quaternion.copy(camera.quaternion)
    impactEffect.update(frameMs / 1000)

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
      prop.rotation.x += current.controls.throttle * PROP_MAX_RAD_PER_SEC * (frameMs / 1000)
    }

    // `oceanTime` (DEV-only, from `?oceanTime=`) is a fixed override for
    // reproducing one ocean state on demand and stays exactly as fixed as it
    // is today; the accumulator below is added only to the sim-time
    // derivation it replaces, not to the override itself.
    if (player.impact !== null) postImpactOceanSeconds += frameMs / 1000
    for (const cascade of cascades) {
      cascade.dispatch(
        oceanTime ??
          current.world.tick * DT +
            current.world.accumulatorSeconds +
            postImpactOceanSeconds,
      )
    }
    // While GPU samples are being collected, a frame is NOT rendered until the
    // previous frame's timestamp resolve has landed. The paragraph after the
    // next explains why the guard alone stopped being enough on 2026-09-17.
    const sampling = renderer.hasFeature('timestamp-query') && gpuFrameTimesMs.length < FRAME_TIME_CAPACITY
    if (!(sampling && gpuResolvePending)) renderer.render(scene, camera)

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
      void renderer
        .resolveTimestampsAsync('render')
        .then((ms: number | undefined) => {
          // `undefined` when tracking is off (three warns once and returns
          // nothing); 0 when the pool had nothing pending. Neither is a frame.
          if (typeof ms === 'number' && ms > 0) gpuFrameTimesMs.push(ms)
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
  // (`FINEST_FETCHED_LEVEL`, L2 since `eef5b4d` on 2026-09-18 and L4 before
  // it -- the only level `physicsFieldFor` ever returns non-null for) --
  // correcting `PARKED_PLACEHOLDER_Y_M` (`src/sim/scenario.ts`, where a
  // parked entity's altitude comes from) to the real ground height under
  // EVERY parked airplane, the wingman included. Without this the hold above
  // buys nothing: the flight would resume from underground or a
  // tolerance-width above it the instant terrain arrived, exactly the race
  // Task 14 exists to close.
  void loadTerrainProgressively((level, data) => {
    const before = frame!
    const next = applyTerrainLevel(terrain, before, level, data)
    // The field, on the one transition where it first exists, or `null` on
    // every other callback. Written this way rather than as a boolean so the
    // narrowing survives both uses below -- and so the runway and
    // `settleOnTerrain` cannot end up keyed off two separately-written
    // conditions that could drift apart.
    const arrived = before.world.terrain === null ? next.world.terrain : null
    // Task 11: the strip is draped over the real heightfield, so it cannot be
    // built until there is one. `physicsFieldFor` returns non-null for
    // `FINEST_FETCHED_LEVEL` alone, so this runs exactly once per page load --
    // and unconditionally, not only for a ground spawn: an airfield is a
    // place in the world, and a DEV `?spawnX/Y/Z` flight should be able to
    // see it too.
    if (arrived !== null) {
      // One strip and one set of airfield scenery per airfield the world
      // carries (Plan 12), not one hardcoded Tacloban.
      scene.add(...next.world.airfields.flatMap((a) => [createRunway(arrived, a), createAirfield(arrived, a)]))
      vegetation = createVegetation(arrived, next.world.airfields)
      // Anchor at the real eye position BEFORE `setTier`/`setCover`, each of
      // which forces its own full recompose at `lastX/lastZ`: left at their
      // (0, 0) default -- open sea, never where the airplane actually is --
      // both recomposes would be thrown away the instant the next frame's
      // `vegetation.update(current.eye...)` below finds a different cell and
      // recomposes a third time. One wasted recompose is cheap; this was two
      // (whole-branch review, 2026-09-18).
      vegetation.update(next.eye.position.x, next.eye.position.z)
      // The tier may already have been chosen by the time terrain arrives.
      vegetation.setTier(oceanTier.name)
      if (cover !== null) vegetation.setCover(cover)
      scene.add(vegetation.object)
    }
    frame = next.groundSpawn && arrived !== null ? settleOnTerrain(next, arrived) : next
  }).catch((err: unknown) => {
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
