import { mkdirSync, writeFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { percentile, spawnUrl, type DiagWindow } from './harness.js'
import { withParams } from './views.js'

// A controlled cost experiment, not a visual/correctness acceptance test.
// The normal budget-mode config requires the exclusive Ryzen budget lock.
test.skip(process.env.E2E_CAPTURE !== '1', 'measurement tool: set E2E_CAPTURE=1')
test.setTimeout(300000)
const OUT = process.env.E2E_CAPTURE_DIR ?? 'test-results/terrain-cost'
const VIEWS = [
  { name: 'low-1000ft', x: -36629, z: -47829, y: 304.8 },
  { name: 'ridge-6000ft', x: -63000, z: -32000, y: 1828.8 },
  { name: 'high-13000ft', x: -38129, z: -47829, y: 3962.4 },
] as const

for (const view of VIEWS) {
  test(`terrain GPU budget cost: ${view.name}`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true })
    await page.setViewportSize({ width: 2560, height: 1440 })
    const records: object[] = []
    // Reverse the shader order in the middle view, then repeat each state
    // with both trees-on-first and trees-off-first to expose timing drift.
    const modes = view.name === 'ridge-6000ft' ? ['on', 'off'] : ['off', 'on']
    for (const lighting of modes) {
      await page.goto(withParams(spawnUrl(view), { launch: '1', sceneryView: '1', timeOfDay: '12',
        cloudTier: 'off', oceanTier: 'high', terrainTextures: 'on', renderScale: '1', terrainLighting: lighting }))
      await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null)
      await page.waitForFunction(() => (window as DiagWindow).__ww2!.vegetation() !== null)
      if (lighting !== 'off') await page.waitForFunction(() => (window as DiagWindow).__ww2!.terrainLighting().ready)
      await page.waitForTimeout(4000)
      for (let repeat = 0; repeat < 3; repeat++) for (const trees of repeat % 2 ? [false, true] : [true, false]) {
        await page.evaluate(visible => (window as DiagWindow).__ww2!.setTreesVisible(visible), trees)
        await page.waitForTimeout(700)
        await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())
        await page.waitForTimeout(3000)
        const state = await page.evaluate(() => ({
          gpu: (window as DiagWindow).__ww2!.gpuFrameTimesMs(),
          vegetation: (window as DiagWindow).__ww2!.vegetation(),
          surface: (window as DiagWindow).__ww2!.terrainSurface(),
        }))
        expect(state.gpu.length).toBeGreaterThan(100)
        expect(state.vegetation?.visible).toBe(trees)
        const row = { view: view.name, lighting, trees, repeat, n: state.gpu.length,
          p50: percentile(state.gpu, 0.5), p95: percentile(state.gpu, 0.95),
          vegetation: state.vegetation, surface: state.surface }
        records.push(row)
        console.log(`TERRAIN_COST ${JSON.stringify(row)}`)
        if (lighting === 'off' && repeat === 0) await page.screenshot({ path: `${OUT}/${view.name}-trees-${trees ? 'on' : 'off'}.jpg`, type: 'jpeg', quality: 92 })
      }
    }
    writeFileSync(`${OUT}/${view.name}.json`, JSON.stringify(records, null, 2) + '\n')
  })
}
