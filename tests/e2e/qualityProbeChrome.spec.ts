import { test, expect } from '@playwright/test'
import { type DiagWindow } from './harness.js'

/**
 * A4, and incident 2026-09-20's item 4 (Mark's ruling, 2026-10-09): in Mark's
 * own browser -- installed Google Chrome, headed, vsync on, NONE of the
 * harness's flags -- on the reference GPU, the one-time preflight must retain
 * High scene quality and finish before mission selection. It may trade 100%
 * for 75% render scale if the real queue-completion target requires it.
 *
 * Unlike the former rAF probe, this check grades completion of submitted GPU
 * work, so headed-vs-headless scheduling cannot manufacture a fast verdict.
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

test("Mark's Chrome on the reference GPU: preflight retains High quality before mission selection", async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  const verdict = page.waitForEvent('console', { predicate: (m) => m.text().startsWith('graphics check:'), timeout: 120_000 })
  await page.goto('/')
  await page.waitForFunction(() => document.querySelector('[data-ww2-title]')?.getAttribute('data-ww2-ready') === 'true', undefined, { timeout: 90_000 })
  const adapter = await page.evaluate(() => JSON.stringify((window as DiagWindow).__ww2!.adapter))
  const line = (await verdict).text()
  const result = await page.evaluate(() => (window as DiagWindow).__ww2!.graphicsCheck().record)
  console.log(`${line} | adapter ${adapter} | result ${JSON.stringify(result)}`)
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.qualityProbeChecked())).toBe(true)
  expect(result, line).not.toBeNull()
  expect(result!.recommended.quality, line).toBe('high')
  expect([0.75, 1], line).toContain(result!.recommended.renderScale)
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.oceanTier())).toBe('high')
})
