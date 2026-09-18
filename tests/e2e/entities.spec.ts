import { test, expect } from '@playwright/test'
import { flySweep, percentile, spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'
import { loadScenarioBundle } from '../../tools/content/load.js'

/** Over San Pedro Bay, 2 km up, looking at the task force's first waypoint. */
const bundle = loadScenarioBundle('free-flight')
const cv = bundle.scenario.ships[0]!
const [wpX, wpZ] = cv.waypoints[0]!

test.setTimeout(150_000)

test('the task force sails: every ship moves by speed * elapsed, with zero WebGPU validation errors', async ({ page }) => {
  await page.goto(spawnUrl({ x: wpX - 3000, y: 2000, z: wpZ }))
  await waitForTerrain(page)
  const read = () => page.evaluate(() => {
    const d = (window as DiagWindow).__ww2!
    return { ships: d.ships(), tick: d.tick(), errors: d.validationErrors }
  })
  const a = await read()
  expect(a.ships.map((ship) => ship.id)).toEqual(['cv-1', 'dd-1', 'dd-2'])
  await page.waitForTimeout(5000)
  const b = await read()
  const elapsedS = (b.tick - a.tick) / 60
  expect(elapsedS).toBeGreaterThan(3)
  for (const ship of bundle.scenario.ships) {
    const before = a.ships.find((item) => item.id === ship.id)!
    const after = b.ships.find((item) => item.id === ship.id)!
    const moved = Math.hypot(after.x - before.x, after.z - before.z)
    // A turn makes the chord slightly shorter than the arc, never longer.
    expect(moved, `${ship.id} moved ${moved} m in ${elapsedS} s`).toBeLessThanOrEqual(ship.speedMps * elapsedS + 1)
    expect(moved).toBeGreaterThan(ship.speedMps * elapsedS * 0.9)
  }
  await flySweep(page)
  const c = await read()
  expect(c.errors, `WebGPU validation errors:\n${JSON.stringify(c.errors, null, 2)}`).toEqual([])
  await page.screenshot({ path: 'test-results/entities-task-force.png' })
})

test('two Hellcats exist and the parked one is on the apron', async ({ page }) => {
  await page.goto('/')
  await waitForTerrain(page)
  const aircraft = await page.evaluate(() => (window as DiagWindow).__ww2!.aircraft())
  expect(aircraft.map((item) => item.id)).toEqual(['f6f-1', 'f6f-2'])
  const tacloban = bundle.airfields.tacloban!.runway.center
  const wingman = aircraft[1]!
  expect(Math.hypot(wingman.x - tacloban.x, wingman.z - tacloban.z)).toBeLessThan(300)
})

test.describe('frame-time budget with entities', () => {
  test.use({ viewport: { width: 2560, height: 1440 } })
  const GPU_BUDGET_P95_MS = 6.0

  test('the GPU frame at 1440p over the task force stays inside its budget', async ({ page }) => {
    await page.goto(spawnUrl({ x: wpX - 1500, y: 800, z: wpZ }))
    await waitForTerrain(page)
    await page.waitForTimeout(1500)
    await page.evaluate(() => { (window as DiagWindow).__ww2!.resetFrameTimes() })
    await page.waitForTimeout(5000)
    const times = await page.evaluate(() => ({
      gpu: (window as DiagWindow).__ww2!.gpuFrameTimesMs(),
      supported: (window as DiagWindow).__ww2!.gpuTimestampsSupported,
    }))
    expect(times.supported).toBe(true)
    expect(times.gpu.length).toBeGreaterThan(100)
    const p50 = percentile(times.gpu, 0.5)
    const p95 = percentile(times.gpu, 0.95)
    console.log(`entities gpu p50 ${p50.toFixed(3)} ms p95 ${p95.toFixed(3)} ms`)
    expect(p95).toBeLessThan(GPU_BUDGET_P95_MS)
  })
})
