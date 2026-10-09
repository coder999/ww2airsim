import { test, expect } from '@playwright/test'
import { startGame, type DiagWindow } from './harness.js'

/**
 * A4, and incident 2026-09-20's item 4 (Mark's ruling, 2026-10-09): in Mark's
 * own browser -- installed Google Chrome, headed, vsync on, NONE of the
 * harness's flags -- on the reference GPU, the one-time quality probe must
 * recommend High. On 2026-09-20 the old title-screen probe read 11.4 ms at
 * p95 in exactly this browser and picked Low, removing every tree; the
 * harness's vsync-off Chromium read 4.1 ms, so no other spec could see it.
 *
 * It also checks the one thing nexus could not: a headed Chrome holds rAF
 * back when the GPU falls behind, which the probe's frame-rate verdict rests
 * on (headless Chromium does not; `main.ts`'s probe comment).
 *
 * Correctness, not budget: it asserts the verdict, never a frame time.
 * Needs a desktop session's Playwright server (the console or RDP route,
 * docs/testing.md); session 0 is headless and has no vsync to test.
 */
const REMOTE = process.env.PW_REMOTE
test.skip(REMOTE === undefined || process.env.PW_SESSION0 !== undefined, 'needs a headed desktop Chrome on the reference GPU (PW_REMOTE, console or RDP route)')
test.use({
  connectOptions: REMOTE === undefined ? undefined : {
    wsEndpoint: REMOTE,
    headers: { 'x-playwright-launch-options': JSON.stringify({ channel: 'chrome', headless: false, args: [] }) },
  },
})
test.setTimeout(180_000)

test("Mark's Chrome on the reference GPU: the quality probe recommends High a few seconds into the first sortie", async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  const verdict = page.waitForEvent('console', { predicate: (m) => m.text().startsWith('quality: measured'), timeout: 120_000 })
  await page.goto('/')
  await page.waitForFunction(() => document.querySelector('[data-ww2-title]')?.getAttribute('data-ww2-ready') === 'true', undefined, { timeout: 90_000 })
  // A fresh context: nothing saved, so the probe runs (spec §5 step 1).
  expect(await page.evaluate(() => window.localStorage.getItem('ww2airsim.quality.v1'))).toBeNull()
  const adapter = await page.evaluate(() => JSON.stringify((window as DiagWindow).__ww2!.adapter))
  await startGame(page)
  const line = (await verdict).text()
  await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())
  await page.waitForTimeout(4_000)
  const after = await page.evaluate(() => {
    const w = (window as DiagWindow).__ww2!
    const med = (a: readonly number[]) => [...a].sort((x, y) => x - y)[a.length >> 1] ?? NaN
    return { gpuP50: med(w.gpuFrameTimesMs()), rafP50: med(w.frameTimesMs()), css: `${innerWidth}x${innerHeight}`, dpr: devicePixelRatio }
  })
  console.log(`${line} | adapter ${adapter} | after: gpu p50 ${after.gpuP50.toFixed(2)} ms, rAF p50 ${after.rafP50.toFixed(2)} ms, ${after.css} @ ${after.dpr}x`)
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.qualityProbeChecked())).toBe(true)
  expect(await page.evaluate(() => window.localStorage.getItem('ww2airsim.qualityRecommended.v1')), line).toBe('high')
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.oceanTier())).toBe('high')
})
