import { test, expect, type Page } from '@playwright/test'
import { percentile, waitForTerrain, type DiagWindow } from './harness.js'
import { VIEWS, withParams } from './views.js'

/**
 * The photoreal render pass budget (spec §2, Mark 2026-09-24): gpu p95 of
 * render + compute timestamps at 3840x2160 on the reference desktop, the
 * cloud tier forced so the one-time probe cannot change what is measured.
 * Replaces the 1440p 6.0 ms checks as the performance gate; those stay as
 * regression tripwires.
 *
 * Per tier since 2026-09-25 (Mark's decision, photoreal Task 11): `high`
 * targets 60 Hz, one 16.67 ms frame, and spends the difference on the
 * clouds; `medium` keeps one 120 Hz frame, 8.33 ms. The ocean stays at
 * `high` in both so the medium row measures the cloud tier alone (the
 * medium ocean has its own budget case, ocean.spec.ts).
 */
const BUDGET_4K_P95_MS = { high: 16.67, medium: 8.33 } as const
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

for (const tier of ['high', 'medium'] as const) {
  for (const view of VIEWS) {
    test(`4K budget (${tier}): ${view.name}`, async ({ page }) => {
      await page.setViewportSize({ width: 3840, height: 2160 })
      await page.goto(withParams(view.url, { cloudTier: tier, oceanTier: 'high' }))
      await waitForTerrain(page)
      await page.waitForTimeout(3000)
      const { p95, n } = await frameP95(page)
      console.log(`BUDGET4K ${tier} ${view.name} p95=${p95.toFixed(3)} n=${n}`)
      expect(n).toBeGreaterThan(30)
      expect(p95).toBeLessThanOrEqual(BUDGET_4K_P95_MS[tier])
    })
  }
}
