import { test, expect } from '@playwright/test'
import { flySweep, waitForTerrain, type DiagWindow } from './harness.js'

/**
 * Tier 2. Requires a real GPU, so it runs on the Windows reference platform
 * against a dev server on nexus -- never in hosted CI, which has no GPU.
 *
 * These two checks are here because they need a GPU and need NO human
 * judgement. Screenshot goldens are deliberately excluded: at a stage where the
 * picture changes every commit they generate constant diffs that mean nothing,
 * and they are the expensive half to maintain.
 *
 * The sweep below flies the DEFAULT spawn -- parked on the runway at Tacloban
 * since Task 14 (`content/bases/tacloban.json`'s `runway.center`), the world
 * the airplane actually starts in. `terrain.spec.ts` flies the same sweep over
 * Leyte at three altitudes, explicitly overridden away from that default; the
 * two are not redundant, because a parked start and airborne flight exercise
 * different halves of the renderer and this one is also the only Tier 2 test
 * that covers the app with no query string at all -- which is exactly why it
 * has to wait for terrain below: a ground spawn holds the simulation still
 * until its heightfield arrives (frame.ts's `groundSpawn` field), so `tick()`
 * does not move before then.
 */
test('the adapter is the reference GPU, not a software rasterizer', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => (window as DiagWindow).__ww2?.adapter !== undefined)
  const verdict = await page.evaluate(() => (window as DiagWindow).__ww2!.adapter)
  // Fatal here, unlike in the app, where an unrecognised GPU only warns: this
  // is where a silent fallback would corrupt every frame-time number.
  // Deliberately `.toBe('ok')`, not `!== 'fail'` or any looser form: a `warn`
  // verdict (a bare "WARP" or Mesa's "lavapipe" string that judgeAdapter does
  // not yet recognise as software, Task 7's recorded gap) must still fail
  // this check, or that gap stops being caught by anything.
  expect(verdict.severity, verdict.summary).toBe('ok')
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.reversedDepthBuffer)).toBe(true)
})

test('a camera sweep produces zero WebGPU validation errors', async ({ page }) => {
  await page.goto('/')
  // The default spawn is parked at Tacloban and holds at tick 0 until terrain
  // arrives (frame.ts's `groundSpawn` field) -- waiting on `tick() > 5` alone
  // would otherwise poll for up to this test's whole timeout before the first
  // heightfield level lands.
  await waitForTerrain(page)
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.tick() ?? 0) > 5)

  // The sweep, and every "did that key actually do anything" assertion in it,
  // moved to `flySweep` in harness.ts when Task 11 needed the identical sweep
  // over terrain at three altitudes. Read that function for what it presses
  // and why each phase proves itself before the error list below is trusted.
  await flySweep(page)

  const errors = await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)
  expect(errors, `WebGPU validation errors:
${JSON.stringify(errors, null, 2)}`).toEqual([])
})

// Asset Quality Medium and above load terrain L0, an 8193x8193 texture, one
// texel past WebGPU's default limit. Every other Tier 2 test boots at the
// default Low tier, which is how a black sky and black ground on every GPU
// went unseen until Mark hit it on 2026-09-25 (renderer.ts's
// `requiredDeviceLimits`).
test('Asset Quality Medium boots with zero WebGPU validation errors', async ({ page }) => {
  test.setTimeout(240_000)
  await page.addInitScript(() => window.localStorage.setItem('ww2airsim.assetQuality.v1', 'medium'))
  await page.goto('/')
  // L0 is a 134 MB fetch; through the Tier 2 tunnel it outlasts
  // waitForTerrain's 30 s, which is sized for the default Low tier.
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, {
    timeout: 150_000,
  })
  await waitForTerrain(page)
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'test-results/adapter/asset-medium.png' })
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
})
