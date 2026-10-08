import { test, expect, type Page } from '@playwright/test'
import { percentile, recordFrameTime, waitForTerrain, type DiagWindow } from './harness.js'
import { VIEWS, withParams } from './views.js'

/**
 * The performance gate (H0, Mark 2026-10-08,
 * docs/superpowers/plans/2026-10-08-h0-render-budget.md): gpu p95 of render +
 * compute timestamps at 2560x1440 on the reference desktop, `high` cloud tier
 * forced so the one-time probe cannot change what is measured, at most one
 * 120 Hz frame in every view, in-cloud included. At 1440p a 60 Hz limit was
 * already green by ~8 ms, so it was not a bar.
 *
 * Medium at 1440p, and both tiers at 4K, are recorded (`frame-time`
 * annotations and the BUDGET log lines), never asserted. The 4K per-tier
 * limits and the in-cloud carve-out they replace are in git history.
 */
const GATE_1440P_HIGH_P95_MS = 8.33
const SIZES = {
  '1440p': { width: 2560, height: 1440 },
  '4K': { width: 3840, height: 2160 },
} as const
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

for (const size of ['1440p', '4K'] as const) {
  for (const tier of ['high', 'medium'] as const) {
    const gated = size === '1440p' && tier === 'high'
    for (const view of VIEWS) {
      test(`${size} budget (${tier}${gated ? '' : ', recorded'}): ${view.name}`, async ({ page }) => {
        await page.setViewportSize(SIZES[size])
        await page.goto(withParams(view.url, { cloudTier: tier, oceanTier: 'high' }))
        await waitForTerrain(page)
        await page.waitForTimeout(3000)
        const { p95, n } = await frameP95(page)
        console.log(`BUDGET ${size} ${tier} ${view.name} p95=${p95.toFixed(3)} n=${n}`)
        expect(n).toBeGreaterThan(30)
        recordFrameTime(p95, `at ${size} ${tier}`)
        if (gated) expect(p95).toBeLessThanOrEqual(GATE_1440P_HIGH_P95_MS)
      })
    }
  }
}
