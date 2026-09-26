// tests/e2e/ships.spec.ts
import { test, expect } from '@playwright/test'
import { percentile, spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'
import { SCENARIO_PARAM } from '../../src/render/spawn.js'
import { loadScenarioBundle } from '../../tools/content/load.js'
import type { HangarWindow } from '../../src/render/hangar/hooks.js'

/**
 * Tier 2, ship models (ship-models spec §9). Same platform and caveats as
 * adapter.spec.ts: the Windows reference desktop, never hosted CI. The agent
 * reads the broadside PNGs itself; Mark is not in this loop.
 */
test.setTimeout(180_000)

const MODELS: Record<string, readonly (string | null)[]> = {
  'free-flight': ['essex-cv', 'fletcher-dd', 'fletcher-dd'],
  'deck-quals': ['essex-cv', 'fletcher-dd', 'fletcher-dd'],
  'strike-range': ['type-b-maru'],
}

for (const [scenario, models] of Object.entries(MODELS)) {
  test(`${scenario}: every ship draws its model, with no validation errors`, async ({ page }) => {
    await page.goto(`/?${SCENARIO_PARAM}=${scenario}`)
    await waitForTerrain(page)
    const r = await page.evaluate(() => {
      const d = (window as DiagWindow).__ww2!
      return { models: d.shipModels(), errors: d.validationErrors }
    })
    expect(r.models).toEqual(models)
    expect(r.errors, `validation errors:\n${JSON.stringify(r.errors, null, 2)}`).toEqual([])
  })
}

test.describe('broadsides and budgets at 1440p', () => {
  test.use({ viewport: { width: 2560, height: 1440 } })

  test('each ship model from the side, in the Hangar (the agent reads the PNGs)', async ({ page }) => {
    await page.goto('/hangar.html')
    await page.waitForFunction(() => (window as HangarWindow).__hangar !== undefined, undefined, { timeout: 30_000 })
    await page.evaluate(() => (window as HangarWindow).__hangar!.ready)
    await page.evaluate(() => (window as HangarWindow).__hangar!.freeze())
    for (const id of ['essex-cv', 'fletcher-dd', 'type-b-maru']) {
      await page.evaluate((i) => (window as HangarWindow).__hangar!.select(i), id)
      await page.evaluate(() => (window as HangarWindow).__hangar!.camera('side'))
      await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => r())))))
      await page.locator('#hangar-canvas').screenshot({ path: `test-results/ships-${id}-side.png` })
    }
    expect(await page.evaluate(() => (window as HangarWindow).__hangar!.validationErrors)).toEqual([])
  })

  // A 1440p tripwire at the superseded 120 Hz frame, as cloudShadow.spec.ts's
  // deck run; budget4k.spec.ts is the gate. deck-quals measured 7.99 ms here
  // on the first run (2026-09-26) while 4K deckquals passed at 7.79 / 8.33
  // Medium, 7.90 before S1: the clouds' cost, not the ship models'.
  const GPU_BUDGET_P95_MS = 8.33
  const maru = loadScenarioBundle('strike-range').scenario.ships[0]!
  const [mx, mz] = maru.waypoints[0]!
  const views: Record<string, string> = {
    // Parked on the carrier's deck, looking up it.
    'deck-quals': `/?${SCENARIO_PARAM}=deck-quals`,
    // 1.5 km short of the freighter's first waypoint, 800 m up, as entities.spec.ts does for the task force.
    'strike-range': `${spawnUrl({ x: mx - 1500, y: 800, z: mz })}&${SCENARIO_PARAM}=strike-range`,
  }
  for (const [scenario, url] of Object.entries(views)) {
    test(`${scenario}: gpu p95 under ${GPU_BUDGET_P95_MS} ms with the ship models`, async ({ page }) => {
      await page.goto(url)
      await waitForTerrain(page)
      await page.waitForTimeout(1500)
      await page.evaluate(() => { (window as DiagWindow).__ww2!.resetFrameTimes() })
      await page.waitForTimeout(5000)
      const gpu = await page.evaluate(() => (window as DiagWindow).__ww2!.gpuFrameTimesMs())
      expect(gpu.length).toBeGreaterThan(100)
      const p95 = percentile(gpu, 0.95)
      console.log(`${scenario} ship models gpu p95 ${p95.toFixed(3)} ms over ${gpu.length} samples`)
      await page.screenshot({ path: `test-results/ships-${scenario}.png` })
      expect(p95).toBeLessThan(GPU_BUDGET_P95_MS)
    })
  }
})
