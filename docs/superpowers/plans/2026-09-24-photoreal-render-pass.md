# Photoreal Render Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the world read as photographic — HDR + tonemapping, a physically based atmosphere, properly shaped and lit clouds, a sky-reflecting sea — while meeting a 4K/120 Hz GPU budget on the reference desktop.

**Architecture:** First restructure the frame into a three `RenderPipeline` and move the cloud raymarch into its own reduced-resolution, temporally accumulated pass (the clouds are 75–85% of today's 4K frame because they march every full-resolution pixel). That frees the budget the later phases spend: HDR/AgX/bloom/TRAA, Hillaire-2020 atmosphere LUTs replacing the palette and linear fog, Schneider/Hillaire cloud shape and lighting, and atmosphere-lit surfaces.

**Tech Stack:** TypeScript, three r186 WebGPU + TSL (`three/webgpu`, `three/tsl`, `three/addons/tsl/display/*`), vitest (Tier 1), Playwright against the Windows reference desktop (Tier 2).

**Spec:** `docs/superpowers/specs/2026-09-24-photoreal-render-pass-design.md` — read it in full before any task. It carries the measurements this plan argues from.

## Global Constraints

- Work on `main` in place. Another session may be committing in the same checkout: **stage only files your task changed (never `git add -A` / `git add .`), and re-run `git status` + `git diff HEAD --stat` immediately before every commit.** Never touch `README.md`, `GAMEPLAY.md` or the master spec except in Task 14.
- `src/sim/` is not touched at all.
- Budget: **gpu p95 ≤ 8.33 ms at 3840×2160**, `high` tier forced, in all eight views of `tests/e2e/views.ts`. "gpu" = render-pool + compute-pool timestamps.
- Phase gate (C0 = Tasks 1–4, A = 5–6, B = 7–9, C1 = 10–11, D = 12–13): `npm run verify` rc=0 (capture `rc=$?` directly, never through a pipe) + `budget4k.spec.ts` green + the eight 1440p screenshots captured and **read**, with a one-line verdict per view in the ledger.
- On a phase that cannot pass after a genuine debugging effort: revert that phase's commits (`git revert`, not reset — other sessions share `main`), record why in the ledger, continue with the next phase that does not depend on it. A failed C0 stops the run. If TRAA fails, Phase A ships with SMAA.
- Never cut visible quality to get under the budget. Never loosen an existing Tier 2 assertion to make it pass: re-measure and re-baseline with a dated comment naming this plan.
- Readback assertions of world facts (`cloudShadowAt` world anchoring, `oceanLandWeight`) must not change.
- `?cloudTier=`, `?oceanTier=`, `?cloudShadow=`, `?cloudDebug=`, `?timeOfDay=` keep their meanings. The Settings dialog UI is not changed.
- US spelling in new identifiers and prose. Escape `|` as `\|` in markdown table cells.
- Tier 2 command (from the repo root; the tunnel `ss -ltn | grep 39001` must be listening, else `ssh -N -L 39001:127.0.0.1:3000 ryzen &`):
  `PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim.windomlane.org npx playwright test <spec>`
  Check the dev server first: `curl -sS -o /dev/null -w '%{http_code}\n' https://ww2airsim.windomlane.org/` → `200`.
- Playwright wipes `test-results/` on every run. Copy screenshots out to the ledger dir `.superpowers/sdd/2026-09-24-photoreal-render-pass/shots/<phase>/` immediately after each capture run.
- A TSL graph that fails to build logs `THREE.TSL:` to the console and renders black with no validation error. Every new Tier 2 case fails on any console error (pattern in `tests/e2e/clouds.spec.ts`).
- Known TSL traps (from `docs/handoff/2026-09-19-plan16a-clouds.md`): a `Fn` must return ONE node; nested `Loop`s all default their counter to `i` — pass `name:`; `uniformArray.element(i)` re-emits per use — capture with `.toVar()`; `color()` needs a `vec3` cast to `mul` a vec3; a render target written from `uv()` reads back flipped in y (write `1 - uv.y`, see `cloudShadow.ts`).
- Ledger: `.superpowers/sdd/2026-09-24-photoreal-render-pass/progress.md` (gitignored). Every ruling made on Mark's behalf goes there as `RULING n: <decision> — why — cost to reverse`.

## Review Focus

1. **Teleports and discontinuities** (respawn, scenario switch, `?spawn` reload, restart after a crash, unpause after a long pause): the cloud history and TRAA history must reset, not smear yesterday's sky across the new view for a second. Pinned in Task 4 (`cloudHistory.ts` `shouldResetHistory` test + Tier 2 restart case).
2. **Fast roll through the deck** at 200 m/s with full aileron: no ghost trails behind cloud edges. Pinned in Task 4's rolling-flight capture.
3. **Window resize / devicePixelRatio change**: every new render target (scene pass, cloud pass, history, LUTs) follows the canvas size; no stretched or stale-size frame. Pinned in Task 3 (Tier 2 resize case).
4. **Sun below the horizon** (`timeOfDay=18.5`, the dusk floor): atmosphere, exposure and cloud lighting must produce a dim, finite picture — no NaN (black), no white blowout. Pinned in Task 7 (CPU model at −6°) and Task 9 (Tier 2 dusk screenshot with a mean-luminance range).
5. **Near silhouettes against cloud** (own airframe in chase view, the carrier island in deck-quals, cockpit frame at the 0.1 m near plane inside cloud): sharp edges, no low-resolution halo, cockpit whiteout still correct. Pinned in Task 3's composite case and in-deck cockpit screenshot.

---

## Phase C0 — clouds at reduced resolution (same look, a fraction of the cost)

### Task 1: The eight views, the 4K budget spec, the screenshot capture

**Files:**
- Create: `tests/e2e/views.ts`
- Create: `tests/e2e/budget4k.spec.ts`
- Create: `tests/e2e/capture.spec.ts`
- Create (ledger, gitignored): `.superpowers/sdd/2026-09-24-photoreal-render-pass/progress.md`

**Interfaces:**
- Produces: `VIEWS: readonly View[]`, `type View = { name: string; url: string }`, `withParams(url: string, params: Record<string,string>): string` from `tests/e2e/views.ts`. `budget4k.spec.ts` exports nothing. `capture.spec.ts` writes `test-results/capture/<name>.png` and honors env `CAPTURE_PARAMS` (a query string appended to every view, e.g. `toneMap=none`).

- [ ] **Step 1: Write `tests/e2e/views.ts`**

```ts
import { spawnUrl } from './harness.js'

/** The eight fixed views of the photoreal render pass (spec §3.2). Every
 *  phase is judged against the same pictures and the same budget views. */
export type View = { readonly name: string; readonly url: string }
const TAC = { x: -29666, z: -47605 }
export const VIEWS: readonly View[] = [
  { name: 'runway', url: '/' },
  { name: 'low-land-600', url: spawnUrl({ x: TAC.x + 3000, y: 600, z: TAC.z + 6000 }) },
  { name: 'under-deck-1200', url: spawnUrl({ x: TAC.x, y: 1200, z: TAC.z - 8000 }) },
  { name: 'in-deck-1900', url: spawnUrl({ x: TAC.x, y: 1900, z: TAC.z - 8000 }) },
  { name: 'above-deck-3200', url: spawnUrl({ x: TAC.x, y: 3200, z: TAC.z - 8000 }) },
  { name: 'high-6000', url: spawnUrl({ x: TAC.x + 10000, y: 6000, z: TAC.z + 20000 }) },
  { name: 'deckquals', url: '/?scenario=deck-quals' },
  { name: 'sunset', url: withParams(spawnUrl({ x: TAC.x, y: 1000, z: TAC.z - 8000 }), { timeOfDay: '17.3' }) },
]

/** Appends query parameters to a view URL that may or may not have a query. */
export function withParams(url: string, params: Record<string, string>): string {
  const q = new URLSearchParams(params).toString()
  if (q === '') return url
  return url + (url.includes('?') ? '&' : '?') + q
}
```

- [ ] **Step 2: Write `tests/e2e/budget4k.spec.ts`**

```ts
import { test, expect, type Page } from '@playwright/test'
import { percentile, waitForTerrain, type DiagWindow } from './harness.js'
import { VIEWS, withParams } from './views.js'

/**
 * The photoreal render pass budget (spec §2, Mark 2026-09-24): gpu p95 of
 * render + compute timestamps <= one 120 Hz frame at 3840x2160 on the
 * reference desktop, `high` tier forced so the one-time probe cannot change
 * what is measured. Replaces the 1440p 6.0 ms checks as the performance
 * gate; those stay as regression tripwires.
 */
const BUDGET_4K_P95_MS = 8.33
test.setTimeout(120_000)
const consoleErrors: string[] = []
test.beforeEach(({ page }) => {
  consoleErrors.length = 0
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 400)) })
  page.on('pageerror', (e) => consoleErrors.push(e.message))
})
test.afterEach(() => { expect(consoleErrors, consoleErrors.join('\n')).toEqual([]) })

async function frameP95(page: Page): Promise<{ p95: number; n: number }> {
  await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())
  await page.waitForTimeout(6000)
  const g = await page.evaluate(() => (window as DiagWindow).__ww2!.gpuFrameTimesMs())
  return { p95: percentile(g, 0.95), n: g.length }
}

for (const view of VIEWS) {
  test(`4K budget: ${view.name}`, async ({ page }) => {
    await page.setViewportSize({ width: 3840, height: 2160 })
    await page.goto(withParams(view.url, { cloudTier: 'high', oceanTier: 'high' }))
    await waitForTerrain(page)
    await page.waitForTimeout(3000)
    const { p95, n } = await frameP95(page)
    console.log(`BUDGET4K ${view.name} p95=${p95.toFixed(3)} n=${n}`)
    expect(n).toBeGreaterThan(30)
    expect(p95).toBeLessThanOrEqual(BUDGET_4K_P95_MS)
  })
}
```

Note: `gpuFrameTimesMs()` must already include compute; Task 2 Step 5 verifies and, if needed, fixes that. Until then this spec measures what today's hook reports.

- [ ] **Step 3: Write `tests/e2e/capture.spec.ts`**

```ts
import { test, expect } from '@playwright/test'
import { waitForTerrain, type DiagWindow } from './harness.js'
import { VIEWS, withParams } from './views.js'

/** Screenshot capture of the eight views at 1440p, for the executing agent to
 *  READ (spec §3.1). Not an assertion of appearance: the picture is judged by
 *  whoever reads it. `CAPTURE_PARAMS` (a query string) is appended to every
 *  view so one run can capture e.g. `toneMap=none` for comparison. */
const extra = Object.fromEntries(new URLSearchParams(process.env.CAPTURE_PARAMS ?? ''))
test.setTimeout(90_000)
for (const view of VIEWS) {
  test(`capture: ${view.name}`, async ({ page }) => {
    const errors: string[] = []
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 400)) })
    await page.setViewportSize({ width: 2560, height: 1440 })
    await page.goto(withParams(view.url, { cloudTier: 'high', oceanTier: 'high', ...extra }))
    await waitForTerrain(page)
    await page.waitForTimeout(3000)
    await page.screenshot({ path: `test-results/capture/${view.name}.png` })
    expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
    expect(errors).toEqual([])
  })
}
```

- [ ] **Step 4: Typecheck and lint**

Run: `npm run verify; echo rc=$?`
Expected: `rc=0`.

- [ ] **Step 5: Capture the baseline and the baseline budget**

Run the capture spec, then copy: `mkdir -p .superpowers/sdd/2026-09-24-photoreal-render-pass/shots/baseline && cp test-results/capture/*.png .superpowers/sdd/2026-09-24-photoreal-render-pass/shots/baseline/`.
Run the budget spec. Expected: it FAILS on most views (spec §1 measured 5.7–13.1 ms at 4K). Record every `BUDGET4K` line in the ledger under "Baseline". Read all eight screenshots; one-line description each in the ledger. This failing budget is expected until Task 4 and is the point of Phase C0.

Also capture a no-clouds baseline for Task 2's equivalence check: `CAPTURE_PARAMS=cloudTier=off` capture spec run, copied to `shots/baseline-nocloud/`.

- [ ] **Step 6: Commit**

```bash
git status && git diff HEAD --stat
git add tests/e2e/views.ts tests/e2e/budget4k.spec.ts tests/e2e/capture.spec.ts
git commit -m "Photoreal Task 1: eight fixed views, 4K budget spec, screenshot capture"
```

### Task 2: The frame becomes a `RenderPipeline` with a scene pass (no visible change)

**Files:**
- Create: `src/render/pipeline.ts`
- Modify: `src/render/main.ts` (the `renderer.render(scene, camera)` call in the frame loop, ~line 1966; construction near where `scene`/`camera` exist; resize handler)
- Test: `tests/render/pipeline.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type FramePipeline = {
    readonly scenePass: PassNode           // from three/tsl `pass(scene, camera)`
    readonly sceneColor: Node<'vec4'>      // scenePass.getTextureNode('output')
    readonly sceneDepth: Node<'float'>     // scenePass.getTextureNode('depth')
    setOutput(node: Node<'vec4'>): void    // replaces pipeline.outputNode, sets needsUpdate
    render(): void                         // pipeline.render()
    dispose(): void
  }
  export function createFramePipeline(renderer: WebGPURenderer, scene: Scene, camera: Camera): FramePipeline
  ```
  Later tasks insert nodes between `sceneColor` and the output via `setOutput`.

- [ ] **Step 1: Failing Tier 1 test** (`tests/render/pipeline.test.ts`) — the headless-checkable parts only: that `createFramePipeline` exists, calls `pass(scene, camera)` with the given objects and routes its output node by default. Construct with a stub renderer object `{}` cast, since `RenderPipeline`'s constructor only stores the renderer:

```ts
import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Scene } from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import { createFramePipeline } from '../../src/render/pipeline.js'

describe('createFramePipeline', () => {
  it('passes the scene through unchanged by default', () => {
    const p = createFramePipeline({} as WebGPURenderer, new Scene(), new PerspectiveCamera())
    expect(p.scenePass.scene).toBeInstanceOf(Scene)
    expect(p.sceneColor).toBeDefined()
    expect(p.sceneDepth).toBeDefined()
  })
})
```

Run: `npx vitest run tests/render/pipeline.test.ts` → FAIL (module missing).

- [ ] **Step 2: Implement `src/render/pipeline.ts`**

```ts
import type { Camera, Scene } from 'three'
import { RenderPipeline, type Node, type PassNode, type WebGPURenderer } from 'three/webgpu'
import { pass } from 'three/tsl'

/**
 * The frame as a render pipeline (photoreal render pass, spec §4.1). The
 * scene renders into `scenePass`'s own target (color + depth); later phases
 * put the cloud pass, tonemapping, bloom and anti-aliasing between that
 * target and the canvas via `setOutput`. The shadow-map and radar passes stay
 * separate `renderer.render` calls BEFORE `render()` -- they are inputs, not
 * part of the picture.
 */
export type FramePipeline = {
  readonly scenePass: PassNode
  readonly sceneColor: Node<'vec4'>
  readonly sceneDepth: Node<'float'>
  setOutput(node: Node<'vec4'>): void
  render(): void
  dispose(): void
}

export function createFramePipeline(renderer: WebGPURenderer, scene: Scene, camera: Camera): FramePipeline {
  const scenePass = pass(scene, camera) as unknown as PassNode
  const sceneColor = scenePass.getTextureNode('output') as unknown as Node<'vec4'>
  const sceneDepth = scenePass.getTextureNode('depth') as unknown as Node<'float'>
  const pipeline = new RenderPipeline(renderer, sceneColor)
  return {
    scenePass, sceneColor, sceneDepth,
    setOutput(node) { pipeline.outputNode = node; pipeline.needsUpdate = true },
    render() { pipeline.render() },
    dispose() { pipeline.dispose(); scenePass.dispose() },
  }
}
```

(If `@types/three` 0.186 types differ, cast at the boundary with a comment citing the runtime file, as `renderer.ts` does for `onError`.)

- [ ] **Step 3: Run the test** → PASS.

- [ ] **Step 4: Wire into `main.ts`.** Create the pipeline once after `scene` and `camera` exist and before the frame loop: `const framePipeline = createFramePipeline(renderer, scene, camera)`. In the loop, replace `renderer.render(scene, camera)` (the last call inside the `if (!(sampling && gpuResolvePending))` block) with `framePipeline.render()`. Leave the shadow and radar `renderer.render` calls exactly where they are. Dispose it wherever the renderer/scene are torn down, if such a path exists.

- [ ] **Step 5: Prove the GPU timer still covers the whole frame.** Read how `gpuFrameTimesMs` is filled in `main.ts` (search `resolveTimestampsAsync`). three's pipeline renders its scene pass and output quad through `renderer.render` internally, so both land in the `'render'` pool; confirm by experiment, not assumption:
  1. Temporarily set the output to a deliberately expensive node: `framePipeline.setOutput(Fn(() => { const a = vec4(0).toVar(); Loop(400, () => { a.addAssign(sceneColor.mul(0.0025)) }); return a })())` — ~400 extra texture reads per pixel.
  2. Run `budget4k.spec.ts` for `low-land-600` only (`-g low-land-600`). p95 must rise by several ms relative to the unmodified run. Record both numbers.
  3. Also confirm compute is counted: find whether the ocean cascade dispatch time (`cascade.computeTimesMs()`) is inside `gpuFrameTimesMs`. If it is NOT, change `__ww2.gpuFrameTimesMs` so each sample is render + that frame's compute total (the probe in `adaptOceanQuality` already adds the two — reuse its shape), and note it in the diagnostics doc comment with today's date. The spec requires the budget to count compute (Phase B adds compute dispatches).
  4. Remove the experiment. Ledger entry with the numbers.

- [ ] **Step 6: Equivalence.** Capture the eight views with `CAPTURE_PARAMS=cloudTier=off` after this task and compare each with Task 1's `shots/baseline-nocloud/` using:

```python
# tools-free check, run with python3; PIL is available on nexus
from PIL import Image, ImageChops, ImageStat
import sys
a, b = Image.open(sys.argv[1]).convert('L'), Image.open(sys.argv[2]).convert('L')
print(ImageStat.Stat(ImageChops.difference(a, b)).mean[0])
```

The mean absolute difference must be < 1 grey level per view, excluding the top-left DEV fps readout (crop `(0,0,400,100)` to black in both first). If it is not, find why (MSAA samples on the pass target are the first suspect: `scenePass.renderTarget.samples` follows `renderer.samples`; color space is the second: `RenderPipeline.outputColorTransform` must stay `true`).

- [ ] **Step 7: Verify and commit**

Run: `npm run verify; echo rc=$?` → `rc=0`. Run `tests/e2e/clouds.spec.ts`, `tests/e2e/cloudShadow.spec.ts`, `tests/e2e/terrain.spec.ts` on Tier 2 → pass (they must: nothing visible changed).

```bash
git status && git diff HEAD --stat
git add src/render/pipeline.ts src/render/main.ts tests/render/pipeline.test.ts src/render/diagnostics.ts
git commit -m "Photoreal Task 2: frame renders through a RenderPipeline scene pass"
```

### Task 3: The cloud march becomes a reduced-resolution full-screen pass

**Files:**
- Create: `src/render/scene/cloudPass.ts`
- Modify: `src/render/scene/clouds.ts` (march body moves into a reusable `Fn`; the dome mesh goes away)
- Modify: `src/render/main.ts` (stop `scene.add(clouds.object)`; composite via `framePipeline.setOutput`)
- Test: `tests/render/cloudPass.test.ts`, extend `tests/render/clouds.test.ts`
- Tier 2: extend `tests/e2e/clouds.spec.ts` with a resize case and a near-silhouette case

**Interfaces:**
- Consumes: `FramePipeline` (Task 2): `sceneColor`, `sceneDepth`, `setOutput`.
- Produces (in `clouds.ts`):
  ```ts
  export const CLOUD_TIERS = {
    high:   { cumulusSteps: 48, lightSteps: 2, cirrusSteps: 8, resolutionScale: 0.5 },
    medium: { cumulusSteps: 32, lightSteps: 1, cirrusSteps: 6, resolutionScale: 0.5 },
    low:    { cumulusSteps: 20, lightSteps: 1, cirrusSteps: 4, resolutionScale: 0.25 },
  } as const
  /** The march for one view ray: rgb premultiplied by alpha, alpha, and the
   *  transmittance-weighted mean hit distance in metres (FOG_DISTANCE_M when empty). */
  marchNode(dir: Node<'vec3'>, sceneT: Node<'float'>, dither: Node<'float'>): { color: Node<'vec4'>, depthM: Node<'float'> }
  ```
  (The pair is returned as ONE `vec4` + a separate `Fn` output is not possible — see the TSL trap. Implement as a `Fn` returning a `vec4(rgbPremultiplied... )` and a second output through an MRT, or pack: output `vec4(rgb, alpha)` to target 0 and `depthM` to a second R16F/R32F target via `mrt`. Choose MRT; see Step 3.)
- Produces (in `cloudPass.ts`):
  ```ts
  export type CloudPass = {
    /** Full-resolution composite of clouds over `sceneColor`. */
    readonly composite: Node<'vec4'>
    setResolutionScale(scale: number): void
    setSize(width: number, height: number): void   // canvas drawing-buffer size
    render(renderer: WebGPURenderer): void          // called before framePipeline.render()
    dispose(): void
  }
  export function createCloudPass(opts: {
    clouds: CloudsHandle, camera: PerspectiveCamera,
    sceneColor: Node<'vec4'>, sceneDepth: Node<'float'>,
  }): CloudPass
  ```

- [ ] **Step 1: Failing Tier 1 tests.** In `tests/render/clouds.test.ts` add: `CLOUD_TIERS` has exactly `high/medium/low`, every tier has `resolutionScale` in `(0, 1]`, and the step counts equal the pre-16d baseline `48/32/20`, `2/1/1`, `8/6/4`. In `tests/render/cloudPass.test.ts`: a pure helper `cloudTargetSize(width, height, scale)` returns `{ width: max(1, ceil(width*scale)), height: max(1, ceil(height*scale)) }` — test `(2560,1440,0.5) → (1280,720)`, `(3840,2160,0.25) → (960,540)`, `(1,1,0.25) → (1,1)`, `(1001,3,0.5) → (501,2)`. Run → FAIL.

- [ ] **Step 2: Refactor `clouds.ts`.** Move the body of the existing `march` `Fn` into an exported builder that takes `dir`, `sceneT` and `dither` as nodes instead of computing them from `positionWorld`/`viewportLinearDepth`/`screenCoordinate`, and returns `vec4(scattered, alpha)` (premultiplied: `scattered` already is — note that today's code divides by alpha only for the dome's straight-alpha blend; the pass keeps it premultiplied) plus the weighted hit distance. Weighted hit distance: accumulate `tSum += t * w`, `wSum += w` where `w = transmittance * (1 - stepT)`, output `wSum > 0 ? tSum / wSum : FOG_DISTANCE_M`. Keep every existing comment that explains a trap. The debug modes keep working: they now paint through the pass. Remove the dome `Mesh`; `CloudsHandle.object` is removed, and every reader of it is updated (grep `clouds.object`).

- [ ] **Step 3: Implement `cloudPass.ts`.**
  - A `RenderTarget` at `cloudTargetSize(drawingBufferW, drawingBufferH, scale)` with `HalfFloatType`, `count: 2` (MRT: color vec4, depth float), `LinearFilter` on color, `NearestFilter` on depth.
  - A `QuadMesh` whose material's fragment computes, per low-res pixel: the view direction from the pixel's NDC via `camera.projectionMatrixInverse` and `camera.matrixWorld` rotation (the scene is camera-relative: the camera sits at the origin, so the world direction is the rotated view-space direction); `sceneT` from the **minimum** of the 2×2 (scale 0.5) or 4×4 (scale 0.25) full-resolution depth texels covered by this pixel, converted to a ray length exactly as `clouds.ts` does today (`viewZ / cosView`, capped at `FOG_DISTANCE_M`); the dither (interleaved gradient noise on the low-res pixel coordinate); then the march builder.
  - `render(renderer)`: `renderer.setRenderTarget(target); quad.render(renderer); renderer.setRenderTarget(null)`. This runs in the frame loop right before `framePipeline.render()`, inside the same timestamp-sampled block.
  - Scene depth: the march must read the depth of THIS frame's scene. Because the scene pass renders inside `framePipeline.render()`, restructure so the scene pass is rendered first: call `framePipeline.scenePass.updateBefore(frame)`-style APIs only if public; otherwise make the cloud pass a node in the pipeline graph — **preferred**: implement the cloud march as a `TempNode` subclass (pattern: three's `examples/jsm/tsl/display/GTAONode.js`, which renders its own half-resolution target in `updateBefore()` from the pass's depth texture). Its `updateBefore()` renders the low-res quad; its `setup()` returns the composite. Then ordering is automatic and `render()` above is unnecessary — drop it from the interface if you take this route, and record the choice as a ruling.
  - Composite (full resolution, in the pipeline graph): sample the low-res cloud color with a **depth-aware upsample**: take the 4 nearest low-res texels; weight each by bilinear weight × `1 / (ε + |sceneDepthFull − cloudDepthLow_min_i|)` where `cloudDepthLow_min_i` is the min-depth the low-res pixel used; output `sceneColor.rgb * (1 − cloud.a) + cloud.rgb`. Where a full-res pixel's scene depth is closer than every low-res texel's min-depth by more than 10% (a thin foreground object the low-res march saw past), fall back to the nearest texel whose min-depth matches. Record the exact rule in a doc comment.
  - Resize: `setSize` reallocates the target; main.ts's existing resize handler calls it with `renderer.getDrawingBufferSize`.
- [ ] **Step 4: Tier 1 passes** → `npx vitest run tests/render/cloudPass.test.ts tests/render/clouds.test.ts` PASS.

- [ ] **Step 5: Wire into `main.ts`.** Remove `scene.add(clouds.object)`. Build the cloud pass after `framePipeline`; `framePipeline.setOutput(cloudPass.composite)`. `applyCloudTier` also calls `cloudPass.setResolutionScale(CLOUD_TIERS[name].resolutionScale)`. `?cloudTier=off` → no cloud pass at all (output stays `sceneColor`), exactly as `off` means today.

- [ ] **Step 6: Tier 2 cases** (add to `tests/e2e/clouds.spec.ts`):
  - *resize*: at `in-deck-1900`, 1440p, screenshot; `page.setViewportSize({ width: 1280, height: 720 })`, wait 1 s, screenshot; back to 2560×1440, wait 1 s, screenshot. Assert no console errors; READ all three (no stretched/stale frame).
  - *near silhouette*: `under-deck-1200` in chase view (default) — screenshot and READ: the airframe edges against cloud must be as sharp as against clear sky; then `KeyC` (cockpit) at `in-deck-1900` — screenshot: whiteout outside, panel visible (the existing "inside the deck in cockpit view" case already does this; keep it green).
  Run the full `clouds.spec.ts` and `cloudShadow.spec.ts` → green. Existing screenshot-derived numbers (horizon-strip residual < 3 grey levels) must still hold; if the residual moved, the upsample is wrong — fix, do not re-baseline.

- [ ] **Step 7: Verify, capture, commit.** `npm run verify; echo rc=$?` → 0. Capture the eight views into `shots/c0-task3/`, READ, compare with `baseline/` (they should look the same, clouds slightly softer at most). Run `budget4k.spec.ts`, record numbers (expected: a large drop, ~4× on cloud cost).

```bash
git status && git diff HEAD --stat
git add src/render/scene/cloudPass.ts src/render/scene/clouds.ts src/render/main.ts tests/render/cloudPass.test.ts tests/render/clouds.test.ts tests/e2e/clouds.spec.ts
git commit -m "Photoreal Task 3: cloud march as a reduced-resolution pass with a depth-aware composite"
```

### Task 4: Temporal accumulation for the cloud pass (Phase C0 gate)

**Files:**
- Create: `src/render/scene/cloudHistory.ts` (pure math + TSL reprojection)
- Modify: `src/render/scene/cloudPass.ts`, `src/render/main.ts` (feed previous-frame state; reset on discontinuities)
- Test: `tests/render/cloudHistory.test.ts`
- Tier 2: `tests/e2e/cloudTemporal.spec.ts` (new)

**Interfaces:**
- Produces:
  ```ts
  /** A world point at `depthM` along the current pixel's ray, reprojected into
   *  the previous frame's UV. Camera-relative: the previous frame's camera sat
   *  at `prevEye`, the current one at `eye`. Returns null when behind the
   *  previous camera. Pure JS mirror of the TSL used in the shader, for tests. */
  export function reprojectUv(args: {
    dirWorld: Vec3; depthM: number; eye: Vec3; prevEye: Vec3;
    prevViewProjection: readonly number[] /* column-major 4x4, rotation-only view */
  }): { u: number; v: number } | null
  /** History is discarded when the eye jumped further than a flight could move
   *  in one frame (teleport/respawn/scenario switch) or after a long stall. */
  export function shouldResetHistory(args: { eye: Vec3; prevEye: Vec3; frameSeconds: number }): boolean
  export const HISTORY_BLEND = 0.9
  export const MAX_EYE_SPEED_MPS = 400 // > the F6F's dive limit; anything faster is a teleport
  ```
  `cloudPass` gains `resetHistory(): void` and an internal frame index used to vary the jitter.

- [ ] **Step 1: Failing tests** (`tests/render/cloudHistory.test.ts`):

```ts
import { describe, expect, it } from 'vitest'
import { Matrix4, PerspectiveCamera } from 'three'
import { reprojectUv, shouldResetHistory } from '../../src/render/scene/cloudHistory.js'

function viewProj(yawRad: number): number[] {
  const cam = new PerspectiveCamera(60, 16 / 9, 0.1, 100_000)
  cam.position.set(0, 0, 0); cam.rotation.set(0, yawRad, 0); cam.updateMatrixWorld()
  return new Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).toArray()
}

describe('reprojectUv', () => {
  it('a point dead ahead with a still camera lands at the screen center', () => {
    const uv = reprojectUv({ dirWorld: { x: 0, y: 0, z: -1 }, depthM: 5000, eye: { x: 0, y: 1500, z: 0 }, prevEye: { x: 0, y: 1500, z: 0 }, prevViewProjection: viewProj(0) })!
    expect(uv.u).toBeCloseTo(0.5, 6); expect(uv.v).toBeCloseTo(0.5, 6)
  })
  it('eye translation shifts a near cloud more than a far one (parallax)', () => {
    const base = { dirWorld: { x: 0, y: 0, z: -1 }, eye: { x: 0, y: 1500, z: 0 }, prevEye: { x: -50, y: 1500, z: 0 }, prevViewProjection: viewProj(0) }
    const near = reprojectUv({ ...base, depthM: 500 })!, far = reprojectUv({ ...base, depthM: 50_000 })!
    expect(Math.abs(near.u - 0.5)).toBeGreaterThan(Math.abs(far.u - 0.5) * 10)
  })
  it('a point behind the previous camera is rejected', () => {
    expect(reprojectUv({ dirWorld: { x: 0, y: 0, z: 1 }, depthM: 1000, eye: { x: 0, y: 0, z: 0 }, prevEye: { x: 0, y: 0, z: 0 }, prevViewProjection: viewProj(0) })).toBeNull()
  })
})
describe('shouldResetHistory', () => {
  it('keeps history at flight speeds', () => {
    expect(shouldResetHistory({ eye: { x: 3, y: 0, z: 0 }, prevEye: { x: 0, y: 0, z: 0 }, frameSeconds: 1 / 60 })).toBe(false)
  })
  it('resets on a teleport', () => {
    expect(shouldResetHistory({ eye: { x: 5000, y: 0, z: 0 }, prevEye: { x: 0, y: 0, z: 0 }, frameSeconds: 1 / 60 })).toBe(true)
  })
  it('resets after a long stall (pause, tab switch)', () => {
    expect(shouldResetHistory({ eye: { x: 0, y: 0, z: 0 }, prevEye: { x: 0, y: 0, z: 0 }, frameSeconds: 0.5 })).toBe(true)
  })
})
```

Run → FAIL.

- [ ] **Step 2: Implement `cloudHistory.ts`** — the JS functions:

```ts
import type { Vec3 } from '../../sim/math/vec3.js'
export const HISTORY_BLEND = 0.9
export const MAX_EYE_SPEED_MPS = 400
const MAX_FRAME_SECONDS = 0.25

export function shouldResetHistory({ eye, prevEye, frameSeconds }: { eye: Vec3; prevEye: Vec3; frameSeconds: number }): boolean {
  if (frameSeconds > MAX_FRAME_SECONDS) return true
  const d = Math.hypot(eye.x - prevEye.x, eye.y - prevEye.y, eye.z - prevEye.z)
  return d > MAX_EYE_SPEED_MPS * Math.max(frameSeconds, 1 / 240)
}

export function reprojectUv({ dirWorld, depthM, eye, prevEye, prevViewProjection: m }: {
  dirWorld: Vec3; depthM: number; eye: Vec3; prevEye: Vec3; prevViewProjection: readonly number[]
}): { u: number; v: number } | null {
  // The world point, expressed relative to the PREVIOUS eye (camera-relative rendering).
  const x = eye.x - prevEye.x + dirWorld.x * depthM
  const y = eye.y - prevEye.y + dirWorld.y * depthM
  const z = eye.z - prevEye.z + dirWorld.z * depthM
  const cx = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!
  const cy = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!
  const cw = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!
  if (cw <= 1e-6) return null
  return { u: cx / cw * 0.5 + 0.5, v: 0.5 - cy / cw * 0.5 }
}
```

Then the TSL mirror in the same file: `reprojectUvNode(dirWorld, depthM, eyeDelta /* eye - prevEye uniform */, prevViewProjection /* uniform mat4 */)` implementing the identical arithmetic (v flipped the same way; note the render-target y flip trap — verify with the Tier 2 case in Step 5 rather than by reasoning).

- [ ] **Step 3: Tests pass** → `npx vitest run tests/render/cloudHistory.test.ts` PASS.

- [ ] **Step 4: Temporal accumulation in `cloudPass.ts`.**
  - Two history targets (ping-pong) at the low resolution, same format as the current target.
  - Jitter: the dither becomes `fract(ign(pixel) + frameIndex * 0.618034)` (golden-ratio sequence); `frameIndex` a uniform incremented per rendered frame.
  - Resolve (a second low-res quad pass, or inside the TempNode's `updateBefore`): for each low-res pixel, `current` from this frame's march; `prevUv = reprojectUvNode(dir, currentDepthM, eye − prevEye, prevViewProjection)`; if `prevUv` is outside `[0,1]²` or history is reset → output `current`; else `history = sample(prevHistory, prevUv)` clamped per channel to the min/max of `current`'s 3×3 neighborhood (read the 8 neighbors of the current low-res target), output `mix(current, historyClamped, HISTORY_BLEND)`. Depth channel: output the current depth (not blended).
  - The composite (Task 3) reads the resolved target instead of the raw march target.
  - `prevViewProjection` = `camera.projectionMatrix × camera.matrixWorldInverse` of the previous frame (rotation-only view, because the camera is at the origin every frame); `prevEye` = previous frame's `current.eye.position`. Update both at the END of the frame.
  - `main.ts`: call `cloudPass.resetHistory()` when `shouldResetHistory(...)` is true, and on every path that rebuilds the frame (`rebuildFrame`, restart, scenario switch — grep for where `frame` is reassigned) and on unpause.
- [ ] **Step 5: Tier 2 `tests/e2e/cloudTemporal.spec.ts`:**
  - *roll*: spawn `in-deck-1900`, `waitForTerrain`, hold `KeyD` (roll right) for 1.2 s, screenshots at 0, 0.5, 1.0 s; also the same with the view at `under-deck-1200`. READ: no trails of cloud texture smeared behind edges, no doubled edges. Save to the ledger shots dir.
  - *teleport*: load `under-deck-1200`, wait 3 s, `page.goto` `above-deck-3200` in the same page, screenshot after exactly 3 frames (`await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))))`). READ: no ghost of the previous view.
  - *reprojection direction*: at `under-deck-1200`, press `Numpad4` (look left) for 0.3 s and screenshot mid-turn; if clouds visibly smear AGAINST the turn, the y/x flip in `reprojectUvNode` is wrong — fix it.
- [ ] **Step 6: Phase C0 gate.** `npm run verify; echo rc=$?` → 0. `budget4k.spec.ts` → all 8 pass (expected `in-deck-1900` from 13.07 to ≤ 8.33). If a view still fails, the ruling allowed here is `resolutionScale` for `high` from 0.5 to 0.35 (still ≥ ~12% of pixels, visually checked); nothing else. Capture eight views into `shots/c0/`, READ, compare with `baseline/`, verdicts in ledger. Full existing Tier 2 suite: `npx playwright test` — every spec that passed at the baseline must still pass (record any pre-existing failures at baseline in Task 1's ledger entry so they are not blamed on this phase).

```bash
git status && git diff HEAD --stat
git add src/render/scene/cloudHistory.ts src/render/scene/cloudPass.ts src/render/main.ts tests/render/cloudHistory.test.ts tests/e2e/cloudTemporal.spec.ts
git commit -m "Photoreal Task 4: temporal accumulation for the cloud pass; Phase C0 gate"
```

Ledger: "PHASE C0 COMPLETE" with the budget table before/after.

---

## Phase A — HDR, tonemapping, anti-aliasing

### Task 5: HDR output, AgX, exposure, bloom

**Files:**
- Create: `src/render/exposure.ts`
- Modify: `src/render/pipeline.ts` (tonemapped output chain), `src/render/main.ts` (exposure per frame, `?toneMap=`), `src/render/scene/lighting.ts` (intensity rebalance only if Step 6 needs it)
- Test: `tests/render/exposure.test.ts`
- Re-baseline as needed: `tests/e2e/cloudShadow.spec.ts`, `tests/e2e/clouds.spec.ts`, `tests/e2e/sun.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export const TONE_MAP_PARAM = 'toneMap'
  export type ToneMapName = 'agx' | 'aces' | 'none'
  export function toneMapFromQuery(search: string): ToneMapName | undefined   // throws on unknown, like cloudTierFromQuery
  /** Exposure multiplier for a sun elevation in degrees: monotonic
   *  non-increasing in elevation, 1 at >= 30 deg, capped at MAX_EXPOSURE at dusk. */
  export function exposureFor(elevationDeg: number): number
  export const MAX_EXPOSURE = 4
  ```
  `FramePipeline` gains `setExposure(value: number): void` and `setToneMap(name: ToneMapName): void`.

- [ ] **Step 1: Failing tests** (`tests/render/exposure.test.ts`): `exposureFor(90) === 1`, `exposureFor(30) === 1`; strictly greater at 10 than at 30, at 0 than at 10, at −6 than at 0; never exceeds `MAX_EXPOSURE` (test −90); finite for all integers −90..90. `toneMapFromQuery('?toneMap=agx') === 'agx'`, `('') === undefined`, `('?toneMap=bogus')` throws. Run → FAIL.

- [ ] **Step 2: Implement `exposure.ts`** — piecewise-linear in log2 space over the same elevation keys `palette.ts` uses (30, 10, 0, −6) with EV offsets 0, +0.4, +1.0, +2.0 (tuned by eye in Step 6; the test pins the shape, not the numbers):

```ts
const KEYS: readonly [number, number][] = [[30, 0], [10, 0.4], [0, 1.0], [-6, 2.0]]
export const MAX_EXPOSURE = 4
export function exposureFor(elevationDeg: number): number {
  if (elevationDeg >= KEYS[0]![0]) return 1
  const last = KEYS[KEYS.length - 1]!
  if (elevationDeg <= last[0]) return Math.min(2 ** last[1], MAX_EXPOSURE)
  for (let i = 0; i < KEYS.length - 1; i++) {
    const [ea, va] = KEYS[i]!, [eb, vb] = KEYS[i + 1]!
    if (elevationDeg <= ea && elevationDeg > eb) return Math.min(2 ** (va + (vb - va) * (ea - elevationDeg) / (ea - eb)), MAX_EXPOSURE)
  }
  return 1
}
```

Plus `toneMapFromQuery` in the `cloudTierFromQuery` shape.

- [ ] **Step 3: Tests pass.**

- [ ] **Step 4: Tonemapping in the pipeline.** Set `renderer.toneMapping = AgXToneMapping` (or `ACESFilmicToneMapping` / `NoToneMapping` per `?toneMap=`, DEV only; production always AgX) and drive `renderer.toneMappingExposure` from `exposureFor(elevationDeg)` each frame in `main.ts` next to `applySun`. `RenderPipeline.outputColorTransform = true` applies tonemapping + sRGB once at the output; confirm the scene pass does NOT also tonemap (PassNode renders with the renderer's tonemapping disabled for its target in r186 — verify by reading `PassNode.updateBefore`; if it does tonemap, set the pass target's tonemapping off and record where). The scene pass target is `HalfFloatType` already (PassNode default).

- [ ] **Step 5: Bloom.** `import { bloom } from 'three/addons/tsl/display/BloomNode.js'`. In the pipeline chain after the cloud composite: `const b = bloom(composite, 0.15, 0.4, 1.2)` (strength, radius, threshold in linear HDR — threshold above diffuse white); output `composite.add(b)`. Tune strength ∈ [0.05, 0.3] by eye; the sun disc and the sea glint should bloom, lit clouds only faintly.

- [ ] **Step 6: Rebalance and look.** Capture the eight views with default (AgX) and with `CAPTURE_PARAMS=toneMap=none`. Compute the mean luminance of the `runway` view in both (PIL `ImageStat` on the `L` image, DEV readout cropped): AgX must be within ±15% of `toneMap=none` (spec §4.2). If not, scale `DirectionalLight`/`HemisphereLight` intensities in `palette.ts`'s keys by one common factor (never per-view hacks) and recapture. READ all eight: highlights no longer clip to flat white in the clouds; the sunset keeps its warmth. Ledger verdicts.

- [ ] **Step 7: Re-baseline pixel assertions.** Run `cloudShadow.spec.ts`, `clouds.spec.ts`, `sun.spec.ts`, `ocean.spec.ts`, `deckQuals.spec.ts`, `terrain.spec.ts`. For each failing assertion that measures a pixel VALUE (mean grey, residual, colour): re-measure what it measures under AgX, confirm the relationship it guards still holds (e.g. shadowed deck still darker than unshadowed by a similar ratio), update the constant with a comment `// Re-baselined 2026-09-25, photoreal render pass Task 5 (AgX tonemapping): was X, measured Y because ...`. World-fact readbacks must not change.

- [ ] **Step 8: Verify and commit.** `npm run verify; echo rc=$?` → 0; `budget4k.spec.ts` green.

```bash
git status && git diff HEAD --stat
git add src/render/exposure.ts src/render/pipeline.ts src/render/main.ts tests/render/exposure.test.ts <each re-baselined spec> <palette.ts if rebalanced>
git commit -m "Photoreal Task 5: HDR output with AgX tonemapping, elevation exposure, bloom"
```

### Task 6: TRAA replaces MSAA (Phase A gate)

**Files:**
- Modify: `src/render/renderer.ts` (`antialias: false`), `src/render/pipeline.ts` (velocity MRT, `traa`), `src/render/main.ts` (reset TRAA history where Task 4 resets cloud history)
- Tier 2: extend `tests/e2e/cloudTemporal.spec.ts` with an AA roll case

**Interfaces:**
- `FramePipeline` gains `setAntiAliasing(mode: 'traa' | 'smaa'): void` and `resetHistory(): void`.

- [ ] **Step 1:** In `pipeline.ts`: `scenePass.setMRT(mrt({ output, velocity }))`; `const sceneVelocity = scenePass.getTextureNode('velocity')`; `const aa = traa(chainOutput, sceneDepth, sceneVelocity, camera)` from `three/addons/tsl/display/TRAANode.js` where `chainOutput` is the cloud composite (before bloom, so bloom sees the resolved image); final output `aa + bloom(aa)`. `renderer.ts`: `antialias: false` with a comment citing TRAANode's "MSAA must be disabled" and this plan. Update `tests/render/renderer.test.ts` if it pins `antialias`.
- [ ] **Step 2: Velocity correctness.** Capture the roll case (Task 4 Step 5 *roll* + a new one at `runway` rolling on the ground is impossible — use `low-land-600` holding `KeyA` for 1 s) and READ specifically: terrain, sea, trees, ships and the airframe. Custom `positionNode` meshes (terrain CDLOD in `terrain/mesh.ts`, the ocean in `ocean/mesh.ts`) may write wrong velocity because `VelocityNode` uses the object's matrices and `positionLocal`; symptoms are smearing or shimmering on terrain/sea during a roll. If present, set `material.mrtNode = mrt({ velocity: <correct velocity node> })` on that material (compute current and previous clip positions from the displaced position; previous = same world point with last frame's camera-relative offset and view-projection), or `velocity: vec2(0)`-style zero velocity plus accepting history rejection on those surfaces. Record the approach as a ruling.
- [ ] **Step 3: Fallback rule.** If after Step 2 any view still ghosts, switch `setAntiAliasing('smaa')` (`smaa` from `three/addons/tsl/display/SMAANode.js`) as the default, keep TRAA reachable via DEV `?aa=traa`, and record RULING with the screenshots that forced it.
- [ ] **Step 4: History reset.** Wherever Task 4 calls `cloudPass.resetHistory()`, also call `framePipeline.resetHistory()` (TRAA: dispose-and-recreate its history, or the node's own reset if public in r186 — read TRAANode.js).
- [ ] **Step 5: Phase A gate.** `npm run verify; echo rc=$?` → 0. `budget4k.spec.ts` green (MSAA off should give some time back; record). Capture eight into `shots/a/`, READ vs `shots/c0/`: edges anti-aliased (runway edge, wing edges, hangar roofs), no shimmering. Existing Tier 2 suite green (re-baselines from Task 5 only).

```bash
git status && git diff HEAD --stat
git add src/render/renderer.ts src/render/pipeline.ts src/render/main.ts tests/e2e/cloudTemporal.spec.ts tests/render/renderer.test.ts <materials touched in Step 2>
git commit -m "Photoreal Task 6: TRAA replaces MSAA; Phase A gate"
```

---

## Phase B — physically based atmosphere

### Task 7: Atmosphere constants and the CPU model

**Files:**
- Create: `src/render/sky/atmosphere.ts`
- Test: `tests/render/atmosphere.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const ATMOSPHERE = {
    bottomRadiusM: 6_360_000, topRadiusM: 6_460_000,
    rayleighScattering: [5.802e-6, 13.558e-6, 33.1e-6], rayleighScaleHeightM: 8000,
    mieScattering: 3.996e-6, mieAbsorption: 4.40e-6, mieScaleHeightM: 1200, mieG: 0.8,
    ozoneAbsorption: [0.650e-6, 1.881e-6, 0.085e-6], ozoneCenterM: 25_000, ozoneHalfWidthM: 15_000,
    groundAlbedo: 0.3,
  } as const
  export type Rgb = readonly [number, number, number]
  /** Extinction per metre at altitude h (m above bottomRadius). */
  export function extinctionAt(hM: number): Rgb
  /** Transmittance from altitude hM toward the top of the atmosphere along a ray
   *  with cosine `mu` to the local zenith. 0 if the ray hits the ground. */
  export function transmittanceToTop(hM: number, mu: number, samples?: number): Rgb
  /** Sun illuminance colour reaching altitude hM at sun elevation (deg), relative
   *  to top-of-atmosphere = [1,1,1]. */
  export function sunColorAt(hM: number, elevationDeg: number): Rgb
  /** Sky irradiance on an up-facing and a down-facing surface at altitude hM,
   *  single-scattering + an isotropic multiple-scattering term, in the same
   *  relative units (sun at TOA = 1). */
  export function skyIrradiance(hM: number, elevationDeg: number): { up: Rgb; down: Rgb }
  ```

- [ ] **Step 1: Failing tests** (`tests/render/atmosphere.test.ts`):
  - `extinctionAt(0)` ≈ Rayleigh + Mie(scat+abs) + ozone(0) — e.g. red channel `5.802e-6 + 8.396e-6 + ozone(0)`, `toBeCloseTo` at 1e-8. Ozone tent is 0 at ground (|0 − 25 km| > 15 km).
  - `transmittanceToTop(0, 1)` (zenith, sea level): red ≈ 0.90–0.93, green ≈ 0.83–0.87, blue ≈ 0.68–0.74 — the published sea-level zenith values for these coefficients (Bruneton/Hillaire reference: blue ≈ 0.71). Loose ranges on purpose; they catch unit errors (km vs m) by orders of magnitude.
  - Monotonic: transmittance decreases as `mu` goes 1 → 0.05; `transmittanceToTop(0, -0.1)` is `[0,0,0]` (hits ground).
  - `sunColorAt(0, 90)` has red > green > blue; `sunColorAt(0, 2)` has red/blue ratio > 3 (sunset reddening); `sunColorAt(0, -6)` all components finite and ≤ `sunColorAt(0, 2)`.
  - `skyIrradiance(0, 45).up` blue > red (blue sky); `.down` < `.up` componentwise; finite at −6°.
  Run → FAIL.
- [ ] **Step 2: Implement.** Ray-sphere intersection with the top radius; numeric integration of `extinctionAt` along the ray with `samples` (default 64) midpoint steps; `sunColorAt(h, e) = transmittanceToTop(h, sin(e))` with a smooth horizon fade (below −0.5° × the sun's angular radius, use the grazing value times `smoothstep(-6, 0, e)` so dusk stays finite and dim rather than a hard cut). `skyIrradiance`: integrate single scattering over a fixed 8×4 hemisphere of directions (Rayleigh phase + Cornette-Shanks Mie phase with `mieG`) with 16 view samples × transmittance to sun; multiple scattering as Hillaire's isotropic `Ψms` approximation evaluated once at the query altitude; `down` = ground albedo × (sun + up) × cosθ-weighted, per Hillaire §4. Keep everything in plain arrays; this module is imported by Node tests and must not import `three/tsl`.
- [ ] **Step 3: Tests pass.** `npx vitest run tests/render/atmosphere.test.ts` → PASS.
- [ ] **Step 4: Commit.**

```bash
git status && git diff HEAD --stat
git add src/render/sky/atmosphere.ts tests/render/atmosphere.test.ts
git commit -m "Photoreal Task 7: atmosphere constants and CPU transmittance/irradiance model"
```

### Task 8: Atmosphere LUTs on the GPU and the agreement check

**Files:**
- Create: `src/render/sky/atmosphereLuts.ts`
- Modify: `src/render/main.ts` (create, render per frame before the pipeline), `src/render/diagnostics.ts` (`__ww2.atmosphereTransmittance(hM, mu)` readback)
- Tier 2: `tests/e2e/atmosphere.spec.ts`

**Interfaces:**
- Consumes: `ATMOSPHERE` (Task 7).
- Produces:
  ```ts
  export type AtmosphereLuts = {
    readonly transmittance: Texture      // 256x64, rgba16f
    readonly multiScattering: Texture    // 32x32
    readonly skyView: Texture            // 192x108, per frame
    readonly aerialPerspective: Texture  // 32 slices of 32x32 in a 1024x32 atlas, per frame
    /** Sky radiance for a world direction (sampling skyView). */
    skyRadianceNode(dirWorld: Node<'vec3'>): Node<'vec3'>
    /** Aerial perspective at a camera-relative distance along a direction:
     *  rgb = in-scattered light, a = transmittance (mean over rgb). */
    aerialPerspectiveNode(dirWorld: Node<'vec3'>, distanceM: Node<'float'>): Node<'vec4'>
    /** Transmittance from the eye toward the sun, as a node. */
    sunTransmittanceNode(): Node<'vec3'>
    update(renderer: WebGPURenderer, eyeAltitudeM: number, sunDirection: Vec3, camera: Camera): void
    readTransmittance(renderer: WebGPURenderer, hM: number, mu: number): Promise<Rgb>
    dispose(): void
  }
  export function createAtmosphereLuts(): AtmosphereLuts
  export const AP_MAX_DISTANCE_M = 100_000 // == FOG_DISTANCE_M; pinned by test
  ```

- [ ] **Step 1: Tier 1 pin** in `tests/render/horizon.test.ts` (or `clouds.test.ts` where the existing fog-distance pin lives): `AP_MAX_DISTANCE_M === FOG_DISTANCE_M`. Run → FAIL (module missing).
- [ ] **Step 2: Implement the four LUT passes** as `QuadMesh` passes into `RenderTarget`s (`HalfFloatType`, `LinearFilter`, clamp), the `cloudShadow.ts` shape — including its y-flip rule: write with `1 - uv.y` and read back to prove orientation. Parameterizations exactly Hillaire 2020 §4–5:
  - Transmittance (256×64): `(mu, r)` via the Bruneton `x_mu`/`x_r` mapping; 40 integration steps; rendered once at creation.
  - Multi-scattering (32×32): 64 directions × 20 steps; rendered once after transmittance.
  - Sky-view (192×108): non-linear latitude mapping concentrated at the horizon; 30 steps; per frame, at the eye altitude (`eye.y`, true metres since the scene's y is altitude) and sun direction.
  - Aerial perspective atlas (32×32×32 slices, depth slice `k` covers `(k+1)/32 × AP_MAX_DISTANCE_M` with a squared distribution so near slices are thinner); per frame, in the camera's frustum directions (use the camera's inverse projection and world rotation, camera-relative).
  - `aerialPerspectiveNode` samples two adjacent slices and lerps; beyond `AP_MAX_DISTANCE_M` returns the last slice.
  - Constants come from `ATMOSPHERE` as uniforms/literals — the ONE source; no numbers duplicated in shader code.
- [ ] **Step 3: Readback hook.** `readTransmittance` renders nothing new: it reads the transmittance target texel at the `(mu, r)` mapping via `renderer.readRenderTargetPixelsAsync` (4-texel-wide region — narrower fails alignment, see `cloudShadow.ts`). Expose as `__ww2.atmosphereTransmittance(hM, mu)` in DEV.
- [ ] **Step 4: Tier 2 agreement** (`tests/e2e/atmosphere.spec.ts`): at `runway`, for `mu ∈ {1, 0.2, 0.02}` at `hM = 0` and `mu = 0.5` at `hM = 3000`, the GPU readback matches `transmittanceToTop` (import from `src/render/sky/atmosphere.ts` in the spec) within 2% per channel. A mismatch is a bug in one of the two, found and fixed, never a widened tolerance.
- [ ] **Step 5: Wire `update`** into the frame loop right after `applySun`, inside the timestamp-sampled block before `framePipeline.render()`. Budget spec → green (LUT cost is small: record it by toggling a DEV `?atmosphere=off` that skips `update`, if needed for attribution).
- [ ] **Step 6: Verify and commit.** `npm run verify; echo rc=$?` → 0.

```bash
git status && git diff HEAD --stat
git add src/render/sky/atmosphereLuts.ts src/render/main.ts src/render/diagnostics.ts tests/e2e/atmosphere.spec.ts tests/render/horizon.test.ts
git commit -m "Photoreal Task 8: Hillaire atmosphere LUTs on the GPU, CPU/GPU agreement readback"
```

### Task 9: The world is lit and fogged by the atmosphere (Phase B gate)

**Files:**
- Modify: `src/render/scene/sky.ts` (dome samples sky-view + sun disc), `src/render/scene/lighting.ts` (`applySun` values from the atmosphere model), `src/render/sky/palette.ts` (retired to what `applySun`'s callers still need, or deleted with its test), `src/render/horizon.ts` (`fogWeightNode` retired in favour of AP), `src/render/terrain/mesh.ts`, `src/render/ocean/mesh.ts`, `src/render/scene/clouds.ts` (AP instead of fog; ambient from irradiance), `src/render/main.ts`
- Test: update `tests/render/palette.test.ts`, `tests/render/scene.test.ts`, `tests/render/horizon.test.ts` as needed
- Tier 2: `tests/e2e/sun.spec.ts` re-baselined; dusk case added

**Interfaces:**
- Consumes: `AtmosphereLuts` (Task 8), `sunColorAt`, `skyIrradiance` (Task 7).
- `applySun(lights, palette, direction, elevationDeg)` keeps its signature; `palette` is now built by a new `atmospherePalette(eyeAltitudeM, elevationDeg): SkyPalette` in `palette.ts` from `sunColorAt`/`skyIrradiance`, so every `SkyPalette` reader keeps working. `SkyPalette.zenith`/`.horizon` stay as fields (some shaders still read them as a fallback colour) but are derived from the model, not hand keys.

- [ ] **Step 1: Tests first.** In `tests/render/palette.test.ts`: `atmospherePalette(0, 60).sunColor` equals `sunColorAt(0, 60)` scaled by the sun intensity constant; `atmospherePalette(0, -6)` is finite and dimmer than at 0°; the horizon colour at 5° is warmer (red/blue higher) than at 60°. Old hand-key tests that pinned the "HIGH key IS the old constants" behaviour are deleted with a note in the commit message (the spec retires those keys). Run → FAIL.
- [ ] **Step 2: `atmospherePalette`** implemented; `main.ts` calls `applySun(lights, atmospherePalette(eye.y, elevationDeg), direction, elevationDeg)`. Sun intensity scale: choose one constant so the noon runway view's mean luminance stays within ±15% of Phase A's (same check as Task 5 Step 6).
- [ ] **Step 3: Sky dome.** `sky.ts` colour below the equator stays `SEA_COLOUR` (the `domeColourFor` contract and its test are unchanged). Above: `luts.skyRadianceNode(dir)` + sun disc: `smoothstep` over the sun's angular radius (0.2665° half-angle), limb darkening `1 − 0.6·(1 − sqrt(1 − r²))`, times `luts.sunTransmittanceNode()`, with the disc's radiance chosen so it blooms (Task 5).
- [ ] **Step 4: Aerial perspective replaces `fogWeightNode`** in terrain, ocean and clouds: `shaded = lit * ap.a + ap.rgb` where `ap = luts.aerialPerspectiveNode(dir, distanceM)`. The far-plane invariant (terrain at `FOG_DISTANCE_M` indistinguishable from the sky behind it) must still hold: verify by screenshot at `high-6000` looking at the terrain edge; if a visible edge appears, blend the last 10% of distance toward `skyRadianceNode(dir)` and document why. Clouds apply AP at their representative depth (Task 3's `depthM`). `fogWeightNode` and its test are removed if unused (grep).
- [ ] **Step 5: Ambient.** Terrain: replace `vec3(AMBIENT).mul(ambientScaleNode)` with the up-irradiance uniform (set in `applySun` from the palette) mixed with down-irradiance by `normal.y`. Clouds: `ambientTop` = up irradiance, `ambientBottom` = down irradiance (the C1 task refines this). Ocean: subsurface lit by up irradiance. Lit `MeshStandardMaterial`s get it through the `HemisphereLight` colours (`fillSky` = up, `fillGround` = down).
- [ ] **Step 6: Tier 2.** `sun.spec.ts` re-baselined per Global Constraints. Add a dusk case: spawn `under-deck-1200` with `timeOfDay=18.5`: no console errors, mean luminance of the frame (crop the DEV readout) between 2 and 60 grey levels (dim, not black, not blown); screenshot READ. `atmosphere.spec.ts` still green.
- [ ] **Step 7: Phase B gate.** `npm run verify; echo rc=$?` → 0; `budget4k.spec.ts` green; capture eight into `shots/b/`, READ vs `shots/a/`: sky deepens toward zenith, distant hills turn blue-grey with distance rather than to flat haze, sunset is orange near the sun and blue away from it. Full Tier 2 suite green (with dated re-baselines only).

```bash
git status && git diff HEAD --stat
git add <every file this task touched, listed explicitly>
git commit -m "Photoreal Task 9: sky, sun, ambient and aerial perspective from the atmosphere; Phase B gate"
```

---

## Phase C1 — cloud appearance

### Task 10: Coverage field (from 16d) and cloud shape

**Files:**
- Cherry-pick from branch `worktree-cumulus-cloud-fidelity-plan`: `6259d2f`, `5a8dbad`, `7b7cabf` (coverage noise generation, spelling fix, wiring). Consider `b55c9e2` (detail retile 400→150 m) per Step 4.
- Modify: `src/render/scene/cloudField.ts` (Schneider erosion, height profile)
- Test: `tests/render/cloudField.test.ts`, `tests/tools/skyNoise.test.ts` (from the cherry-picks)

**Interfaces:**
- `CloudField.density(p, base, thickness, coverage, kind)` signature unchanged. `CloudField.coverage: DataTexture` added by the cherry-pick. New pure helper exported for tests: `remap(v, lo0, hi0, lo1, hi1): number` (JS) plus its node twin `remapNode`.

- [ ] **Step 1: Cherry-pick.** `git cherry-pick -x 6259d2f 5a8dbad 7b7cabf`. Conflicts are likely in `cloudField.ts`, `clouds.ts` (Task 3 moved the march) and `src/render/sky/load.ts`; resolve by keeping this plan's structure and applying 16d's coverage sampling inside `density()` exactly as `7b7cabf` wrote it (it samples at the warped XZ — keep that; its comment explains why). Run `npm run verify; echo rc=$?` → 0 before continuing. If `content/sky/coverage.bin.gz` is produced by `npm run sky:build`, confirm the committed file matches a rebuild (the cherry-pick's own test does this).
- [ ] **Step 2: Failing test** for `remap`: `remap(0.5, 0, 1, 0, 10) === 5`; `remap(0.2, 0.2, 1, 0, 1) === 0`; `remap(1, 0.2, 1, 0, 1) === 1`; divides safely when `hi0 === lo0` (returns `lo1`). Run → FAIL.
- [ ] **Step 3: Shape.** Implement `remap`/`remapNode`. In the cumulus branch of `density()`:
  - Height profile: `gradient = smoothstep(0, 0.07, h) * smoothstep(1, 0.6, h)` × a rounding term `(1 − h)^0.5` applied to coverage so tops narrow (flat base, rounded top).
  - Base shape: `base = remap(shapeValue * gradient, 1 − effCoverage, 1, 0, 1)` (Schneider: coverage as the low edge of the remap, then multiply by coverage).
  - Erosion: `detailMod = mix(detail, 1 − detail, saturate(h * 5))` (wispy at the base, billowy above); `d = saturate(remap(base, detailMod * 0.35, 1, 0, 1))`. The previous ad-hoc `erode` expression is removed.
  - Keep the cirrus branch byte-for-byte (spec: cirrus untouched).
- [ ] **Step 4: Look.** Capture `under-deck-1200`, `above-deck-3200`, `low-land-600`. READ: crisp, billowed silhouettes rather than blurred cotton; clear gaps; no regular rows. Try `b55c9e2`'s 150 m detail tile vs 400 m by capturing both; keep whichever reads less noisy at 1 km — record the ruling with the two filenames.
- [ ] **Step 5: Verify and commit.** `npm run verify; echo rc=$?` → 0; `budget4k.spec.ts` green; `cloudShadow.spec.ts` world-anchoring still green (the shadow reads the same `density()`).

```bash
git status && git diff HEAD --stat
git add src/render/scene/cloudField.ts tests/render/cloudField.test.ts
git commit -m "Photoreal Task 10: Schneider remap erosion and cumulus height profile"
```

### Task 11: Cloud lighting (Phase C1 gate)

**Files:**
- Create: `src/render/scene/cloudLighting.ts` (phase functions + multi-scatter as pure JS + TSL twins)
- Modify: `src/render/scene/clouds.ts` (march lighting), `CLOUD_TIERS`
- Test: `tests/render/cloudLighting.test.ts`
- Tier 2: `tests/e2e/clouds.spec.ts` gains the sun-behind-cloud view

**Interfaces:**
- Produces:
  ```ts
  export function henyeyGreenstein(cosTheta: number, g: number): number   // normalized over the sphere
  export function dualLobePhase(cosTheta: number): number                 // mix(HG(0.8), HG(-0.3), 0.5)
  export const MS_OCTAVES = 3, MS_A = 0.5, MS_B = 0.5, MS_C = 0.5
  /** Sum over octaves n of b^n * phase(cosTheta * c^n... ) * exp(-a^n * sigma * shadowDepth) */
  export function multiScatter(cosTheta: number, shadowOpticalDepth: number): number
  export function beerPowder(opticalDepth: number): number                // exp(-d) * (1 - exp(-2d)) * 2
  ```
  plus node twins `dualLobePhaseNode`, `multiScatterNode`, `beerPowderNode` with identical arithmetic.

- [ ] **Step 1: Failing tests:** HG integrates to 1 over the sphere (numeric 2000-sample integration within 1%) for g ∈ {−0.3, 0, 0.8}; `dualLobePhase(1) > dualLobePhase(0) > 0` and `dualLobePhase(-1) > dualLobePhase(0)` (back lobe); `multiScatter(c, 0) > multiScatter(c, 10) > 0`; `multiScatter` at depth 10 is larger than the single-octave term alone (the point of the octaves); `beerPowder(0) === 0`, maximum near d≈0.35, → 0 as d → ∞. Run → FAIL.
- [ ] **Step 2: Implement** `cloudLighting.ts` (JS + TSL twins, same arithmetic line for line).
- [ ] **Step 3: Tests pass.**
- [ ] **Step 4: March lighting in `clouds.ts`** (cumulus; cirrus keeps its constant 0.85 light but gets the phase function):
  - Light march: `lightSteps` samples at distances `ds_l * (1, 2, 4, 8, …)` capped at the layer thickness, plus one long sample at 3× thickness (cone sample), accumulating optical depth `τ_l`.
  - Radiance per step: `sunColor * multiScatterNode(cosθ, τ_l)` (the octaves include the phase) `* beerPowderNode` blended 50% (keep the existing `mix(1, powder, 0.5)` shape) + ambient `mix(irradianceDown, irradianceUp, h)` (Task 9 uniforms).
  - Remove `LIGHT_EXTINCTION_SCALE` (the octaves replace it); remove the `* 1.2` fudge; any remaining scale is one documented constant.
  - `cosθ = dot(viewDir, sunDir)`.
- [ ] **Step 5: Step counts.** Raise `high` to `cumulusSteps: 96, lightSteps: 6`, `medium` `64/4`, `low` `32/2` (cirrus unchanged). Run `budget4k.spec.ts`. Spec §4.4 floors `high.cumulusSteps` at 96. If `high` fails any view: first lower `high.lightSteps` to no lower than 4; then lower `high.resolutionScale` in 0.05 steps to no lower than 0.35 (a C0 lever, allowed by ruling; check the rolling capture still has no ghosting). If it still fails, that is a Phase C1 gate failure — handle per Global Constraints. Record every measurement.
- [ ] **Step 6: Acceptance views** (add to `clouds.spec.ts`):
  - *sun behind cloud*: spawn at `(TAC.x, 1200, TAC.z - 8000)` with `timeOfDay=16.8` (sun ~15° up, west), turn to face the sun: hold `Numpad4`/`Numpad6` look or yaw until the sun azimuth is centered — compute the needed look from `__ww2.sun()` azimuth and the spawn heading; screenshot. READ: bright rims (silver lining) on clouds near the sun.
  - `under-deck-1200`: READ: bases visibly darker than tops. Measure with PIL: mean luminance of a cloud-base region lower than a sunlit-top region in `above-deck-3200`; record the numbers.
- [ ] **Step 7: Phase C1 gate.** `npm run verify; echo rc=$?` → 0; budget green; capture eight into `shots/c1/`, READ vs `shots/b/`. Full Tier 2 suite green.

```bash
git status && git diff HEAD --stat
git add src/render/scene/cloudLighting.ts src/render/scene/clouds.ts tests/render/cloudLighting.test.ts tests/render/clouds.test.ts tests/e2e/clouds.spec.ts
git commit -m "Photoreal Task 11: dual-lobe phase, multiple-scattering octaves, sky ambient for clouds; Phase C1 gate"
```

---

## Phase D — surfaces

### Task 12: The sea reflects the sky; lit objects under the new exposure

**Files:**
- Modify: `src/render/ocean/mesh.ts` (reflection), `src/render/scene/ship.ts` / `src/render/scene/airfield.ts` / `src/render/scene/buildings.ts` only if Step 3 finds a material defect
- Tier 2: `tests/e2e/ocean.spec.ts`, `tests/e2e/deckQuals.spec.ts` (re-baselines + a deck luminance check)

- [ ] **Step 1: Reflection.** In the ocean colour: `reflected = luts.skyRadianceNode(reflect(-view, normal))` (clamp the reflected direction's y to ≥ 0.01 so a grazing reflection never samples below the horizon); `unshadowed = mix(subsurface * irradianceUp-lit, reflected, fresnel) + glint(sunColor from the atmosphere)`; foam lit by up irradiance. Keep `OCEAN_SHADOW_FLOOR` logic. Keep the `cascades.length === 0` path.
- [ ] **Step 2: Look.** Capture `low-land-600`, `deckquals`, `sunset`. READ: the sea's far field takes the sky's colour at grazing angles; near field keeps the water's hue; sunset water is warm toward the sun.
- [ ] **Step 3: Deck.** In `deckquals`, measure mean luminance of a deck region (a fixed rectangle in the lower middle of the 1440p frame, clear of the airframe — pick it from the capture and record the coordinates) and of the runway surface in `runway`. The deck must fall within [0.5×, 1.5×] of the runway's. If it is darker, find why (candidates in order: the ship material's colour, missing `receiveShadow`/shadow node darkening, metalness > 0 on a plain deck with nothing to reflect — a metal material under a hemisphere light with no environment map renders near black). Fix the cause, record it; do not simply brighten the albedo unless the albedo is the cause.
- [ ] **Step 4: Verify and commit.** `npm run verify; echo rc=$?` → 0; budget green; ocean + deck-quals specs green (dated re-baselines only).

```bash
git status && git diff HEAD --stat
git add src/render/ocean/mesh.ts <ship/airfield/buildings files if touched> tests/e2e/ocean.spec.ts tests/e2e/deckQuals.spec.ts
git commit -m "Photoreal Task 12: sea reflects the atmosphere's sky; lit objects correct under the new exposure"
```

### Task 13: Terrain detail normal (Phase D gate)

**Files:**
- Modify: `src/render/terrain/mesh.ts`, `src/render/terrain/surface.ts` (export the noise used for the detail normal)
- Test: `tests/render/terrainSurface.test.ts` or the existing surface test for the pure fade helper

**Interfaces:**
- Produces: `detailNormalFade(distanceM: number): number` — 1 at ≤ 500 m, 0 at ≥ 2000 m, smoothstep between (JS + node twin).

- [ ] **Step 1: Failing test** for `detailNormalFade` (0 m → 1, 500 → 1, 2000 → 0, 5000 → 0, monotonic). Run → FAIL.
- [ ] **Step 2: Implement.** Perturb the terrain shading normal with the gradient of the existing value noise at two scales (~8 m and ~40 m wavelength), computed by finite differences of the noise function (3 extra taps per scale), amplitude small (tilt ≤ ~12°), multiplied by `detailNormalFade(distanceM)`. Lambert and the up/down irradiance mix use the perturbed normal. Anisotropic filtering stays 1 (see `surface.ts:69` guard test).
- [ ] **Step 3: Look.** Capture `runway` and `low-land-600`. READ: near ground shows lighting relief (not flat blur), no visible tiling, no shimmer in the TRAA roll capture from Task 6.
- [ ] **Step 4: Phase D gate.** `npm run verify; echo rc=$?` → 0; budget green; capture eight into `shots/d/`, READ vs `shots/c1/` and vs `baseline/`. Full Tier 2 suite green.

```bash
git status && git diff HEAD --stat
git add src/render/terrain/mesh.ts src/render/terrain/surface.ts <its test>
git commit -m "Photoreal Task 13: terrain detail normal; Phase D gate"
```

---

## Closing

### Task 14: Tripwires, probe check, handoff, push

**Files:**
- Modify: `tests/e2e/terrain.spec.ts`, `tests/e2e/entities.spec.ts`, `tests/e2e/strike.spec.ts` (`GPU_BUDGET_P95_MS`)
- Modify: `docs/superpowers/specs/2026-09-24-cumulus-cloud-fidelity-design.md`, `docs/superpowers/plans/2026-09-24-cumulus-cloud-fidelity.md` (one "superseded" line each)
- Create: `docs/handoff/2026-09-25-photoreal-render-pass.md`, `docs/handoff/img/2026-09-25-photoreal/*.jpg`
- Modify: `docs/superpowers/specs/2026-09-12-ww2airsim-design.md` §15 (one row), `README.md` (one paragraph) — re-diff both against `HEAD` first; another session had uncommitted edits in both on 2026-09-24. If they still have uncommitted edits by someone else, do NOT commit those hunks: stage only your own lines with `git add -p` and record it in the ledger.

- [ ] **Step 1: Tripwires.** Run each of the three specs' budget tests at 1440p, three times; take the median p95; set `GPU_BUDGET_P95_MS` in each to `ceil(1.2 × median × 10) / 10` with a comment: `// Re-derived 2026-09-25 (photoreal render pass): 1.2x the measured 1440p p95 of X ms, the original derivation. The performance gate is budget4k.spec.ts.` If any is now LOWER than 6.0 keep the lower value (a tighter tripwire is the point).
- [ ] **Step 2: Mark's browser.** Launch HIS Chrome via the run-server (`x-playwright-launch-options` `{ "channel": "chrome", "headless": false, "args": [] }` — no harness flags, vsync on) with a fresh context, load `/`, start a game, wait 10 s, read `__ww2.oceanTier()` and the settings' recommended tier. Record it. If the one-time probe now recommends `low` for this build (it picks from a vsync'd cost; see `docs/incidents/2026-09-20-low-tier-hides-trees.md`), RULING: do not change probe thresholds in this plan; report it prominently in the handoff as the first thing Mark should know, with the numbers.
- [ ] **Step 3: Whole-branch review** is performed by the controller per subagent-driven-development before this task's commit; apply its fixes as their own commits.
- [ ] **Step 4: Images.** For each of the eight views, `baseline/` and `d/` (final) downscaled to 1280 px wide JPEG quality 82 (`PIL`), named `<view>-before.jpg` / `<view>-after.jpg` into `docs/handoff/img/2026-09-25-photoreal/` (~16 files, keep total < 5 MB — check with `du -sh`).
- [ ] **Step 5: Handoff doc** `docs/handoff/2026-09-25-photoreal-render-pass.md`: what shipped per phase (commit ranges); the 4K budget table baseline vs final for all eight views; 1440p tripwires; before/after image pairs (relative links); **"Rulings made for you"** — every ledger RULING, each with its cost to reverse; any phase reverted and why; Mark's-Chrome probe result; open items (textures per the visual-realism spec; night lighting; anything left). Date and verify every cross-boundary claim.
- [ ] **Step 6: §15, README, supersede notes.** §15: one row for this plan, status Complete (or Partial with the reverted phases named). README: one paragraph pointing at §15 and the handoff, not restating them. 16d spec and plan: first line `**Superseded 2026-09-24 by docs/superpowers/specs/2026-09-24-photoreal-render-pass-design.md.**`.
- [ ] **Step 7: Final verify.** `npm run verify; echo rc=$?` → 0. `budget4k.spec.ts` green. Full Tier 2 suite: record pass/fail counts; any failure is either fixed or named in the handoff with evidence it predates this plan.
- [ ] **Step 8: Commit, email, push.**

```bash
git status && git diff HEAD --stat
git add tests/e2e/terrain.spec.ts tests/e2e/entities.spec.ts tests/e2e/strike.spec.ts docs/handoff/2026-09-25-photoreal-render-pass.md docs/handoff/img/2026-09-25-photoreal docs/superpowers/specs/2026-09-24-cumulus-cloud-fidelity-design.md docs/superpowers/plans/2026-09-24-cumulus-cloud-fidelity.md docs/superpowers/plans/2026-09-24-photoreal-render-pass.md
git add -p README.md docs/superpowers/specs/2026-09-12-ww2airsim-design.md   # own hunks only
git commit -m "Photoreal Task 14: re-derived tripwires, handoff, roadmap row"
python3 tools/mail-doc.py docs/handoff/2026-09-25-photoreal-render-pass.md "ww2airsim overnight: photoreal render pass — results and rulings"; echo rc=$?
git push -u origin main
```

Push only `main`; never deploy (Mark's decision 2026-09-24). If the push is rejected because `origin/main` moved, `git pull --rebase origin main`, re-run `npm run verify`, then push; retry network failures 4× with 2/4/8/16 s backoff.
