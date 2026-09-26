import { test } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { waitForTerrain } from './harness.js'

/** Loading spec §A.3: the density-as-function change must not change the
 *  picture. Captures a paused under-deck frame after the temporal resolve
 *  has converged; `CLOUD_PIXELS_OUT` names the output PNG, and the test
 *  is skipped without it. */
test('capture a converged, paused cloud frame', async ({ page }) => {
  // A capture tool, not an assertion: a plain Tier 2 run skips it rather
  // than spend a boot on it and drop an untracked PNG into the cwd.
  test.skip(!process.env.CLOUD_PIXELS_OUT, 'set CLOUD_PIXELS_OUT to capture a frame')
  // The "before" capture runs on the shader this spec guards against: its
  // first frame blocked the main thread for ~39 s (2026-09-26, after the
  // cloud rewrite), past waitForTerrain's 30 s. Wait out the boot first.
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/?cloudTier=high')
  await page.waitForSelector('[data-ww2-title][data-ww2-ready="true"]', { timeout: 120_000 })
  await waitForTerrain(page)
  await page.keyboard.press('Escape') // BINDINGS.pause (src/input/bindings.ts)
  await page.waitForTimeout(3_000)  // > 64 frames at 60 Hz: TRAA and the 1-in-16 cloud update converge
  writeFileSync(process.env.CLOUD_PIXELS_OUT!, await page.screenshot())
})
