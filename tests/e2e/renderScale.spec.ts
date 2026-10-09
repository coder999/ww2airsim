import { test, expect } from '@playwright/test'
import { waitForTerrain } from './harness.js'

/** H0 (Mark 2026-10-08): `?renderScale=` draws the scene at a fraction of the
 *  window size, so 4K and 1440p can be compared live on one monitor. The
 *  parse and clamp are Tier 1 (tests/render/renderer.test.ts). */
test.use({ viewport: { width: 2560, height: 1440 } })

test('renderScale=0.5 halves the canvas backing store', async ({ page }) => {
  await page.goto('/?renderScale=0.5')
  await waitForTerrain(page)
  const size = await page.evaluate(() => {
    // The scene canvas is the largest one (the HUD may draw small ones).
    const c = [...document.querySelectorAll('canvas')].sort((a, b) => b.width - a.width)[0]!
    return { w: c.width, h: c.height, dpr: Math.min(window.devicePixelRatio, 2) }
  })
  expect(size.w).toBe(Math.round(2560 * size.dpr * 0.5))
  expect(size.h).toBe(Math.round(1440 * size.dpr * 0.5))
})
