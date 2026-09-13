import { PerspectiveCamera, Scene } from 'three'
import { initRenderer, normalizeGpuError } from './renderer.js'
import { showFailure } from './failure.js'
import { createOverlay } from './overlay.js'
import { initialFrameState, nextFrameState } from './frame.js'
import { createWater } from './scene/water.js'
import { createSky } from './scene/sky.js'
import { createLighting } from './scene/lighting.js'
import { createHellcat } from './scene/hellcat.js'
import { createMarkers } from './scene/markers.js'
import { parseAircraftSpec } from '../sim/content.js'
import { createState } from '../sim/flight/state.js'
import { step } from '../sim/flight/model.js'
import { stepChecked } from '../sim/invariants.js'
import { v3 } from '../sim/math/vec3.js'
import { qIdentity } from '../sim/math/quat.js'
import type { AircraftSpec } from '../sim/flight/schema.js'

// index.html always contains #app -- it is the mount point the script tag is
// loaded from, so this assertion is safe at the entry point.
const root = document.getElementById('app')!

// Accumulated by the uncapturederror handler set on `renderer.onError` below.
// Module-scoped and left un-exposed here on purpose: Task 15 hooks a
// `window.__ww2` accumulator array so its camera-sweep check can assert this
// stays empty; that exposure is Task 15's job, not this task's.
const validationErrors: string[] = []

/** Purely visual: gauges.ts explains why no tachometer is fitted -- there is
 *  no modeled engine RPM to drive it honestly. This spins the prop mesh at an
 *  arbitrary rate scaled by throttle so a held throttle key visibly does
 *  something, which is a free confirmation that input is reaching the
 *  simulation (see hellcat.ts's comment on why `prop` is a separate mesh).
 *  It is not a claim about real RPM and never appears on the instrument panel. */
const PROP_MAX_RAD_PER_SEC = 40

/**
 * Fetches and validates the F6F content over `fetch`, the browser-side
 * equivalent of `tools/content/load.ts`'s Node-only reader (see that file's
 * doc comment, Finding I1): `src/sim/content.ts`'s `parseAircraftSpec` is
 * platform-free, so only the byte-reading half differs between the two.
 */
async function loadSpec(): Promise<AircraftSpec> {
  const res = await fetch('/content/aircraft/f6f-hellcat.json')
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
  renderer.onDeviceLost = (info) => {
    showFailure(root, 'device-lost', info.message)
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
  scene.add(createWater())
  const sky = createSky()
  scene.add(sky)
  scene.add(createLighting())
  scene.add(createMarkers())
  const { root: hellcatRoot, prop } = createHellcat()
  scene.add(hellcatRoot)

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

  let frame = initialFrameState(spec, initialAircraft)

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

    frame = nextFrameState(frame, frameMs / 1000, pressed, stepper)

    // Camera-relative: the world moves, the camera stays at the origin. float32
    // loses precision at 100 km, which shows as geometry jitter -- master spec §4
    // requires this from the first commit because retrofitting it means touching
    // every position in the renderer.
    scene.position.set(-frame.eye.position.x, -frame.eye.position.y, -frame.eye.position.z)
    camera.position.set(0, 0, 0)
    camera.quaternion.set(
      frame.eye.attitude.x,
      frame.eye.attitude.y,
      frame.eye.attitude.z,
      frame.eye.attitude.w,
    )

    // The sky dome's colour only depends on view direction, but its geometry
    // is centred on its own origin; re-centring that origin under the eye's
    // horizontal position each frame (the whole scene, sky included, is
    // translated by -eye above) keeps the horizon at eye level instead of
    // sliding as the aeroplane moves.
    sky.position.set(frame.eye.position.x, 0, frame.eye.position.z)

    prop.rotation.x += frame.controls.throttle * PROP_MAX_RAD_PER_SEC * (frameMs / 1000)

    renderer.render(scene, camera)

    overlay.update({
      frameMs,
      fps: 1000 / Math.max(frameMs, 0.001),
      stepsRun: frame.stepsRun,
      droppedSteps: frame.droppedSteps,
      tick: frame.world.aircraft.tick,
      adapter: adapterVerdict.summary,
    })
    requestAnimationFrame(frameFn)
  }
  requestAnimationFrame(frameFn)

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight)
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
  })
}

void boot().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e)
  showFailure(root, msg === 'no-webgpu' ? 'no-webgpu' : 'unknown', msg)
})
