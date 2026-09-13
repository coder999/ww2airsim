import { Group, PerspectiveCamera, Scene } from 'three'
import { initRenderer, normalizeGpuError } from './renderer.js'
import { showFailure } from './failure.js'
import { createRafLoop, type RafLoop } from './rafLoop.js'
import { AIRCRAFT_CONTENT_URL } from './content.js'
import { createOverlay } from './overlay.js'
import {
  airframeVisibilityFor,
  initialFrameState,
  nextFrameState,
  toThreeOrientation,
  worldOffsetFor,
  type FrameState,
} from './frame.js'
import { createWater, recentreWater } from './scene/water.js'
import { createSky } from './scene/sky.js'
import { createLighting } from './scene/lighting.js'
import { createHellcat } from './scene/hellcat.js'
import { createMarkers } from './scene/markers.js'
import { createPanel, updatePanel } from './scene/panel.js'
import { parseAircraftSpec } from '../sim/content.js'
import { createState } from '../sim/flight/state.js'
import { step } from '../sim/flight/model.js'
import { stepChecked } from '../sim/invariants.js'
import { v3 } from '../sim/math/vec3.js'
import { qIdentity } from '../sim/math/quat.js'
import { NEUTRAL } from '../input/keyboard.js'
import { LOOK_CENTRE } from '../input/lookAround.js'
import type { AircraftSpec } from '../sim/flight/schema.js'
import type { Ww2Diagnostics } from './diagnostics.js'

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

/** Purely visual: gauges.ts explains why no tachometer is fitted -- there is
 *  no modeled engine RPM to drive it honestly. This spins the prop mesh at an
 *  arbitrary rate scaled by throttle (see hellcat.ts's comment on why `prop`
 *  is a separate mesh); it confirms throttle reaches the frame state, not
 *  that it reaches the simulation -- a bug that stopped `frame.controls` from
 *  reaching `advance` would leave the prop spinning at the correct rate with
 *  nothing driving the aeroplane (Task 13 review, measured 2026-09-13). It is
 *  not a claim about real RPM and never appears on the instrument panel. */
const PROP_MAX_RAD_PER_SEC = 40

/**
 * Fetches and validates the F6F content over `fetch`, the browser-side
 * equivalent of `tools/content/load.ts`'s Node-only reader (see that file's
 * doc comment, Finding I1): `src/sim/content.ts`'s `parseAircraftSpec` is
 * platform-free, so only the byte-reading half differs between the two.
 */
async function loadSpec(): Promise<AircraftSpec> {
  const res = await fetch(AIRCRAFT_CONTENT_URL)
  if (!res.ok) {
    throw new Error(`Failed to fetch aircraft content: ${res.status} ${res.statusText}`)
  }
  const json: unknown = await res.json()
  return parseAircraftSpec(json)
}

async function boot(): Promise<void> {
  const canvas = document.createElement('canvas')
  root.appendChild(canvas)

  const { renderer, adapterVerdict } = await initRenderer(canvas)

  // Declared here, before the hook below installs, initialised to `null` --
  // not assigned a real `FrameState` until after `loadSpec` resolves, well
  // down this function. See the hook's own comment for why that ordering
  // matters and is not just tidiness.
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
  // return below: `await loadSpec()` further down is a real network
  // round-trip, and the sweep spec's first call after `page.goto` invokes
  // `.tick()` unconditionally as soon as `__ww2` exists. Round 1's comment
  // here claimed the closures were merely "lazy" and safe because nothing
  // calls them before the `fail` return -- that reasoned about the wrong
  // path and was false the moment the spec's own `waitForFunction` runs
  // (Task 15 review, round 2). The guard is what makes both paths work from
  // one hook: `fail` reads only `.adapter`, which needs no guard; success
  // reads the others before the first frame exists and gets exactly
  // `initialFrameState`'s own defaults (0 / `'chase'` / `NEUTRAL` /
  // `LOOK_CENTRE`) -- a poll that keeps waiting, not a thrown
  // `ReferenceError` whose cause the test output would never show.
  if (import.meta.env.DEV) {
    ;(window as unknown as { __ww2: Ww2Diagnostics }).__ww2 = {
      adapter: adapterVerdict,
      validationErrors,
      tick: () => frame?.world.aircraft.tick ?? 0,
      cameraMode: () => frame?.cameraMode ?? 'chase',
      controls: () => frame?.controls ?? NEUTRAL,
      look: () => frame?.look ?? LOOK_CENTRE,
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

  renderer.onDeviceLost = (info) => {
    // Stop BEFORE showing the failure, and dispose after (whole-branch review,
    // I-3). Until this, `showFailure` detached the canvas and the frame chain
    // carried on regardless: rendering to a dead GPU, writing overlay text
    // into a detached element, and pushing fresh validation errors into
    // `validationErrors` behind the message the operator is meant to read.
    // `loop` is assigned before the first frame is ever scheduled, so it
    // exists by the time any real loss can reach this callback; the `?.`
    // covers a loss during setup, when there is no loop to stop yet.
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

  let spec: AircraftSpec
  try {
    spec = await loadSpec()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    showFailure(root, 'bad-content', message)
    return
  }

  const scene = new Scene()
  const water = createWater()
  scene.add(water)
  const sky = createSky()
  scene.add(sky)
  scene.add(createLighting())
  scene.add(createMarkers())
  const { root: hellcatRoot, prop } = createHellcat()
  scene.add(hellcatRoot)

  // The panel is 3D geometry, not a screen-space HUD, so it gets parallax and
  // occlusion during look-around for free (spec rationale, this task). It
  // lives in its own group rather than as a child of hellcatRoot because the
  // two are visibility-exclusive (see the cockpit.visible/hellcatRoot.visible
  // swap below), not because they move differently -- both are posed from the
  // same `frame.render` pose each frame.
  const panel = createPanel(spec)
  const cockpit = new Group()
  cockpit.add(panel.root)
  scene.add(cockpit)

  const camera = new PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 60_000)

  // Spawn over open water, comfortably above the clean, power-off stall
  // (content/aircraft/f6f-hellcat.json's reference.stallSpeedMps, 43.8 m/s)
  // so the first frame is already flying rather than falling: 120 m/s, 600 m
  // up, wings level.
  const initialAircraft = createState({
    position: v3(0, 600, 0),
    velocity: v3(120, 0, 0),
    attitude: qIdentity(),
  })

  frame = initialFrameState(spec, initialAircraft)

  const pressed = new Set<string>()
  window.addEventListener('keydown', (e) => {
    pressed.add(e.code)
  })
  window.addEventListener('keyup', (e) => {
    pressed.delete(e.code)
  })
  // A keyup that fires while the tab is unfocused is never delivered to this
  // page, so a key held at the moment focus is lost would otherwise stay
  // "down" forever -- the aeroplane keeps pitching after the window loses focus.
  window.addEventListener('blur', () => {
    pressed.clear()
  })

  // The choice is made here, at the edge, so sim/ carries no build flag:
  // stepChecked runs Plan 1's invariants every tick in development, turning
  // "the aeroplane teleported" into "a NaN entered at tick 4,102"; step is
  // the production path with no per-step assertion cost.
  const stepper = import.meta.env.DEV ? stepChecked : step

  const overlay = createOverlay(root)
  let last = performance.now()
  const frameFn = (now: number): void => {
    const frameMs = now - last
    last = now

    // `frame` is assigned a real `FrameState` just above, before this
    // function is ever scheduled, and reassigned at the end of every call to
    // it from here on -- always non-null whenever `frameFn` runs, which is
    // exactly why the single `!` lives here and nowhere else. Everything
    // below reads `current` (typed `FrameState`, non-null), not the nullable
    // `frame` -- one assertion at the top of the hot path rather than one at
    // every read.
    const current = nextFrameState(frame!, frameMs / 1000, pressed, stepper)
    frame = current

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

    // The airframe mesh's own geometry is built with +X as its nose
    // (hellcat.ts), matching sim convention exactly, so unlike the camera
    // above it needs no basis fix -- see frame.ts's `render` field doc. The
    // cockpit group (the panel) shares this exact pose: panel.ts authors the
    // panel in the same body frame, relative to the eye, so it needs no
    // separate transform here.
    hellcatRoot.position.set(current.render.position.x, current.render.position.y, current.render.position.z)
    hellcatRoot.quaternion.set(
      current.render.attitude.x,
      current.render.attitude.y,
      current.render.attitude.z,
      current.render.attitude.w,
    )
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
    updatePanel(panel, spec, current.world.aircraft)

    // The sky dome's colour only depends on view direction, but its geometry
    // is centred on its own origin; re-centring that origin under the eye's
    // horizontal position each frame (the whole scene, sky included, is
    // translated by -eye above) keeps the horizon centred under the camera
    // horizontally. It is deliberately NOT re-centred vertically (y stays 0),
    // so the horizon sits very slightly below eye level at any nonzero
    // altitude -- about 0.76 degrees at this spawn's 600 m against the dome's
    // 45,000 m radius (atan(600/45000)) -- rather than exactly at it. Fixing
    // the horizontal drift is what matters: left unfixed, it is unbounded
    // over a long flight and eventually carries the camera outside the dome;
    // the vertical offset is bounded by altitude and stays negligible.
    sky.position.set(current.eye.position.x, 0, current.eye.position.z)

    // The water gets the same treatment, and did not until the whole-branch
    // review (I-1): left at the world origin it slid out from under the
    // aeroplane, and at the spawn's 120 m/s its old half-extent was spent in
    // under three minutes. `recentreWater` also compensates the surface
    // detail's texture offset, without which re-centring would pin the
    // detail to the aeroplane and remove the parallax it exists to provide.
    recentreWater(water, current.eye.position.x, current.eye.position.z)

    prop.rotation.x += current.controls.throttle * PROP_MAX_RAD_PER_SEC * (frameMs / 1000)

    renderer.render(scene, camera)

    overlay.update({
      frameMs,
      fps: 1000 / Math.max(frameMs, 0.001),
      stepsRun: current.stepsRun,
      droppedSteps: current.droppedSteps,
      tick: current.world.aircraft.tick,
      adapter: adapterVerdict.summary,
    })
  }
  loop = createRafLoop(frameFn)
  loop.start()

  window.addEventListener('resize', () => {
    // A resize after a device loss would reconfigure a disposed swap chain.
    if (!loop?.running) return
    renderer.setSize(window.innerWidth, window.innerHeight)
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
  })
}

void boot().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e)
  showFailure(root, msg === 'no-webgpu' ? 'no-webgpu' : 'unknown', msg)
})
