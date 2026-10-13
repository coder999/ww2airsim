import { expect, test, type Page } from '@playwright/test'
import { percentile, waitForScenario, waitForTerrain, type DiagWindow } from './harness.js'
import { withParams } from './views.js'

const WAKE_DELTA_P95_MS = 0.5
test.setTimeout(240_000)

type Run = { readonly wake: 'off' | 'on'; readonly p95: number; readonly n: number; readonly vertices: number }

async function measure(page: Page, wakeMode: Run['wake']): Promise<Run> {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(withParams('/', { scenario: 'deck-quals', launch: '', fx: 'high', wake: wakeMode, cloudTier: 'high', oceanTier: 'high' }))
  await waitForScenario(page, 'deck-quals')
  await waitForTerrain(page)
  // The carrier starts underway. Give its persistent trail time to develop
  // before sampling; the off arm proves the DEV control suppresses it.
  await page.waitForTimeout(5000)
  const wake = await page.evaluate(() => (window as DiagWindow).__ww2!.waterWake())
  await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())
  await page.waitForTimeout(5000)
  const gpu = await page.evaluate(() => (window as DiagWindow).__ww2!.gpuFrameTimesMs())
  const run = { wake: wakeMode, p95: percentile(gpu, 0.95), n: gpu.length, vertices: wake.crestVertices + wake.churnVertices }
  console.log(`WAKEBUDGET wake=${wakeMode} p95=${run.p95.toFixed(3)} n=${run.n} tracks=${wake.tracks} samples=${wake.samples} anchorDistance=${wake.maxAnchorDistanceM.toFixed(3)} crest=${wake.crestVertices} churn=${wake.churnVertices}`)
  return run
}

test('shared ship wake stays inside its 1440p GPU budget', async ({ page }) => {
  const runs: Run[] = []
  for (const wake of ['off', 'on', 'off', 'on'] as const) runs.push(await measure(page, wake))
  const mean = (wake: Run['wake']): number => {
    const arm = runs.filter((run) => run.wake === wake)
    return arm.reduce((sum, run) => sum + run.p95, 0) / arm.length
  }
  const off = mean('off'), on = mean('on'), delta = on - off
  const detail = `shared wake p95 ${on.toFixed(3)} ms vs off ${off.toFixed(3)} ms, delta ${delta.toFixed(3)} ms`
  console.log(`WAKEBUDGET ${detail}`)
  test.info().annotations.push({ type: 'budget', description: detail })
  for (const run of runs) expect(run.n, 'too few GPU samples for a percentile').toBeGreaterThan(100)
  for (const run of runs.filter((candidate) => candidate.wake === 'off')) expect(run.vertices).toBe(0)
  for (const run of runs.filter((candidate) => candidate.wake === 'on')) expect(run.vertices, 'the carrier did not build a wake').toBeGreaterThan(0)
  expect(delta, detail).toBeLessThanOrEqual(WAKE_DELTA_P95_MS)
})
