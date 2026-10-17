import { mkdirSync, writeFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { percentile, spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'
import { withParams } from './views.js'

/**
 * Forest-canopy plan, Task 1 (2026-10-16): which forest layer carries the cost.
 * A measurement tool, not a test: run it with
 * `npm run capture:e2e -- forestAttribution.spec.ts` under `hwlock ryzen-budget`.
 *
 * Every arm is a fresh page load (a dev server that has been through HMR reads
 * slow, so start a FRESH vite per set). Arms are INTERLEAVED round by round, so
 * a slow stretch of the machine lands on every arm alike. Compare medians.
 *   FOREST_ROUNDS   loads per arm per view (default 6)
 *   FOREST_VIEWS    comma list of view names (default all)
 *   FOREST_ARMS     comma list of arm names (default all)
 *   E2E_CAPTURE_DIR output directory
 */
test.skip(process.env.E2E_CAPTURE !== '1', 'measurement tool: set E2E_CAPTURE=1')
test.setTimeout(3_600_000)
const OUT = process.env.E2E_CAPTURE_DIR ?? 'test-results/forest-attribution'
const ROUNDS = Number(process.env.FOREST_ROUNDS ?? 6)
const TAC = { x: -29666, z: -47605 }
const FROZEN = { sceneryView: '1', launch: '1', look: '0,-10' }
const ALL_VIEWS: readonly { name: string; url: string }[] = [
  { name: 'runway', url: '/' },
  { name: 'low-land-600', url: withParams(spawnUrl({ x: TAC.x + 3000, y: 600, z: TAC.z + 6000 }), FROZEN) },
  { name: 'ridge-6000ft', url: withParams(spawnUrl({ x: -63000, y: 1828.8, z: -32000 }), FROZEN) },
  { name: 'high-6000', url: withParams(spawnUrl({ x: TAC.x + 10000, y: 6000, z: TAC.z + 20000 }), FROZEN) },
  { name: 'photo', url: withParams('/', { look: '55,30' }) },
]
/** Cumulative layers, each one query. `trees=off` still lets terrain shading through, so
 *  `canopy-only` minus `base` is the ground blend alone. */
const ALL_ARMS: readonly { name: string; params: Record<string, string> }[] = [
  { name: 'base', params: { trees: 'off', forestDistance: 'off', distantTrees: 'off' } },
  { name: 'near-whole', params: { forestDistance: 'off', distantTrees: 'off', treeFade: 'whole' } },
  { name: 'near-soft', params: { forestDistance: 'off', distantTrees: 'off', treeFade: 'soft' } },
  { name: 'plus-crowns', params: { forestDistance: 'off', distantTrees: 'on', treeFade: 'soft' } },
  { name: 'full', params: { forestDistance: 'long', distantTrees: 'on', treeFade: 'soft' } },
  { name: 'relief', params: { forestDistance: 'long', distantTrees: 'on', treeFade: 'soft', forestCanopy: 'relief' } },
  { name: 'canopy-only', params: { trees: 'off', forestDistance: 'long', distantTrees: 'on', treeFade: 'soft' } },
]
const want = (env: string | undefined) => (env ? new Set(env.split(',')) : null)
const viewSet = want(process.env.FOREST_VIEWS), armSet = want(process.env.FOREST_ARMS)
const VIEWS = ALL_VIEWS.filter(v => !viewSet || viewSet.has(v.name))
const ARMS = ALL_ARMS.filter(a => !armSet || armSet.has(a.name))

for (const view of VIEWS) {
  test(`forest attribution: ${view.name}`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true })
    await page.setViewportSize({ width: 2560, height: 1440 })
    const records: object[] = []
    for (let round = 0; round < ROUNDS; round++) {
      // Rotate the arm order each round so no arm is always first after a navigation.
      const order = ARMS.map((_, i) => ARMS[(i + round) % ARMS.length]!)
      for (const arm of order) {
        await page.goto(withParams(view.url, { cloudTier: 'high', oceanTier: 'high', ...arm.params }))
        // A frozen view (sceneryView) never ticks, so the title-ready check in waitForTerrain would time out.
        if (view.url.includes('sceneryView')) await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, { timeout: 60000 })
        else await waitForTerrain(page)
        await page.waitForFunction(() => (window as DiagWindow).__ww2!.vegetation() !== null)
        if (arm.params.trees !== 'off' && arm.params.distantTrees !== 'off') {
          await expect.poll(() => page.evaluate(() => { const v = (window as DiagWindow).__ww2!.vegetation(); return !!v && v.distant.pending === 0 && v.coarse.pending === 0 }), { timeout: 60000 }).toBe(true)
        }
        if (arm.params.forestDistance === 'long') await page.waitForFunction(() => (window as DiagWindow).__ww2!.canopy().ready, undefined, { timeout: 60000 })
        if (arm.params.forestCanopy === 'relief') await page.waitForFunction(() => (window as DiagWindow).__ww2!.forestCanopy().reliefReady, undefined, { timeout: 60000 })
        await page.waitForTimeout(4000)
        // A paused scene sometimes reports very few frames in a window (3-40 Hz, 2026-10-16); measure again, up to
        // 3 windows, and keep the one with the most samples. Rows under 60 samples are flagged `short`, not dropped.
        let s: { gpu: number[]; cpu: { workMs: number; drawCalls: number; triangles: number }[]; vegetation: ReturnType<NonNullable<DiagWindow['__ww2']>['vegetation']> } | null = null
        for (let attempt = 0; attempt < 3 && (s === null || s.gpu.length < 60); attempt++) {
          await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())
          await page.waitForTimeout(5000)
          const t = await page.evaluate(() => ({
            gpu: [...(window as DiagWindow).__ww2!.gpuFrameTimesMs()],
            cpu: (window as DiagWindow).__ww2!.cpuFrameSamples().filter(c => c.rendered),
            vegetation: (window as DiagWindow).__ww2!.vegetation(),
          }))
          if (s === null || t.gpu.length > s.gpu.length) s = t
        }
        if (s === null) throw new Error('no samples')
        const row = { view: view.name, arm: arm.name, round, n: s.gpu.length, short: s.gpu.length < 60,
          gpuP50: percentile(s.gpu, 0.5), gpuP95: percentile(s.gpu, 0.95), gpuP99: percentile(s.gpu, 0.99),
          over833: s.gpu.filter(g => g > 8.33).length / s.gpu.length,
          cpuWorkP50: percentile(s.cpu.map(c => c.workMs), 0.5), cpuWorkP95: percentile(s.cpu.map(c => c.workMs), 0.95),
          drawCalls: percentile(s.cpu.map(c => c.drawCalls), 0.5), triangles: percentile(s.cpu.map(c => c.triangles), 0.5),
          near: s.vegetation?.drawnInstances, distant: s.vegetation?.distant.drawnInstances, coarse: s.vegetation?.coarse.drawnInstances,
          maxUpdateMs: { distant: s.vegetation?.distant.maxUpdateMs, coarse: s.vegetation?.coarse.maxUpdateMs } }
        records.push(row)
        console.log(`FOREST_ATTR ${JSON.stringify(row)}`)
        writeFileSync(`${OUT}/${view.name}.json`, JSON.stringify(records, null, 2) + '\n')
      }
    }
  })
}

/**
 * Within one page load, alternate the whole forest visible/hidden (`setTreesVisible`) in the `full` arm. A slow-mode load
 * (p50 doubling, seen 2026-10-16) that follows the toggle is the forest's cost; one that does not is machine state.
 * FOREST_TOGGLE=1 to run; FOREST_ROUNDS loads per view.
 */
for (const view of VIEWS) {
  test(`forest toggle within a load: ${view.name}`, async ({ page }) => {
    test.skip(process.env.FOREST_TOGGLE !== '1', 'set FOREST_TOGGLE=1')
    mkdirSync(OUT, { recursive: true })
    await page.setViewportSize({ width: 2560, height: 1440 })
    const records: object[] = []
    for (let round = 0; round < ROUNDS; round++) {
      await page.goto(withParams(view.url, { cloudTier: 'high', oceanTier: 'high', forestDistance: 'long', distantTrees: 'on', treeFade: 'soft' }))
      if (view.url.includes('sceneryView')) await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, { timeout: 60000 })
      else await waitForTerrain(page)
      await expect.poll(() => page.evaluate(() => { const v = (window as DiagWindow).__ww2!.vegetation(); return !!v && v.distant.pending === 0 && v.coarse.pending === 0 }), { timeout: 60000 }).toBe(true)
      await page.waitForFunction(() => (window as DiagWindow).__ww2!.canopy().ready, undefined, { timeout: 60000 })
      await page.waitForTimeout(4000)
      const series: { visible: boolean; p50: number; p95: number; n: number }[] = []
      for (const visible of [true, false, true, false, true, false]) {
        await page.evaluate(v => (window as DiagWindow).__ww2!.setTreesVisible(v), visible)
        await page.waitForTimeout(700)
        await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())
        await page.waitForTimeout(3000)
        const g = await page.evaluate(() => [...(window as DiagWindow).__ww2!.gpuFrameTimesMs()])
        series.push({ visible, p50: percentile(g, 0.5), p95: percentile(g, 0.95), n: g.length })
      }
      records.push({ view: view.name, round, series })
      console.log(`FOREST_TOGGLE ${JSON.stringify({ view: view.name, round, series: series.map(x => `${x.visible ? 'on' : 'off'} ${x.p50.toFixed(1)}/${x.p95.toFixed(1)}`) })}`)
      writeFileSync(`${OUT}/toggle-${view.name}.json`, JSON.stringify(records, null, 2) + '\n')
    }
  })
}
