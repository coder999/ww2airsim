import { test, expect, type Page } from '@playwright/test'
import { debriefDialog, percentile, waitForTerrain, type DiagWindow } from './harness.js'
import { SCENARIO_PARAM, SPAWN_PARAMS } from '../../src/render/spawn.js'
import { loadAircraftSpec } from '../../tools/content/load.js'

/**
 * Tier 2, Plan 6c structural overload. This drives the shipped keyboard,
 * fixed-step flight model, damage reducer, readout and restart path together on
 * the reference GPU. Pure load arithmetic is covered in Tier 1.
 */
const [xName, yName, zName] = SPAWN_PARAMS
const RANGE = `/?${SCENARIO_PARAM}=gunnery-range&${xName}=0&${yName}=5000&${zName}=0`
const limits = loadAircraftSpec('f6f-hellcat').limits

test.setTimeout(180_000)

const combat = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.combat()!)

test('a production dive and pull-out damage the airframe, pause holds it, and restart clears it', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(RANGE)
  await waitForTerrain(page)
  // Ramp the shipped throttle lever to full, then release the key; the lever
  // holds its value. A closed-throttle dive reaches a low drag-limited speed
  // and is not an overspeed acceptance case.
  await page.keyboard.down('Equal')
  await page.waitForTimeout(3_500)
  await page.keyboard.up('Equal')
  await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())

  const initial = await combat(page)
  expect(initial.player.structure).toBe(1)
  expect(initial.player.stress).toMatchObject({ overG: false, overspeed: false })

  // ArrowUp commands nose-down. Pulse it into a dive rather than holding it:
  // the control commands pitch rate, so a long hold would loop continuously.
  await page.keyboard.down('ArrowUp')
  await page.waitForTimeout(1_500)
  await page.keyboard.up('ArrowUp')
  await expect.poll(() => combat(page).then((c) => c.player.stress.overspeed), { timeout: 30_000 }).toBe(true)
  await expect.poll(() => combat(page).then((c) => c.player.structure), { timeout: 10_000 }).toBeLessThan(1)

  const afterDive = await combat(page)
  expect(afterDive.player.stress.peakAirspeedMps).toBeGreaterThan(limits.diveSpeedMps)
  await expect(page.getByLabel('Combat', { exact: true })).toContainText('OVERSPEED')
  await page.screenshot({ path: 'test-results/structural-overload-dive.png' })

  // ArrowDown commands nose-up. At dive speed, the production pull-out should
  // cross the single structural G limit and make the second warning observable.
  await page.keyboard.down('ArrowDown')
  await expect.poll(() => combat(page).then((c) => c.player.stress.overG), { timeout: 15_000 }).toBe(true)
  await expect(page.getByLabel('Combat', { exact: true })).toContainText('OVER-G')
  await page.keyboard.up('ArrowDown')

  await page.keyboard.press('Escape')
  // Read only after the key event has reached the frame. A few fixed ticks can
  // legitimately run between a pre-key read and pause becoming active.
  await page.waitForTimeout(200)
  const paused = await page.evaluate(() => {
    const d = (window as DiagWindow).__ww2!
    return { tick: d.tick(), structure: d.combat()!.player.structure }
  })
  await page.waitForTimeout(1_000)
  const held = await page.evaluate(() => {
    const d = (window as DiagWindow).__ww2!
    return { tick: d.tick(), structure: d.combat()!.player.structure }
  })
  expect(held).toEqual(paused)
  await page.keyboard.press('Escape')

  const live = await page.evaluate(() => {
    const d = (window as DiagWindow).__ww2!
    return { gpu: d.gpuFrameTimesMs(), errors: d.validationErrors, combat: d.combat()! }
  })
  expect(live.errors, `WebGPU validation errors:\n${JSON.stringify(live.errors, null, 2)}`).toEqual([])
  expect(live.gpu.length).toBeGreaterThan(120)
  const p95 = percentile(live.gpu, 0.95)
  console.log(`structural overload: ${JSON.stringify(live.combat.player.stress)}, HP ${live.combat.player.structure.toFixed(4)}, gpu p95 ${p95.toFixed(3)} ms over ${live.gpu.length} samples`)
  expect(p95).toBeLessThan(6.0)

  // Sustain a production pull-out until structural damage reaches zero. This
  // specifically exercises the damage-destruction debrief path (not an impact)
  // before its Restart button rebuilds the world.
  await page.keyboard.down('ArrowDown')
  await debriefDialog(page).waitFor({ timeout: 45_000 })
  await page.keyboard.up('ArrowDown')
  await debriefDialog(page).getByRole('button', { name: 'Restart' }).click()
  await expect.poll(() => combat(page).then((c) => c.player.structure), { timeout: 10_000 }).toBe(1)
  const restarted = await combat(page)
  expect(restarted.player.stress).toMatchObject({
    overG: false,
    overspeed: false,
    peakLoadFactorG: 1,
  })
  // The first post-Restart tick has already replaced the current 1 g seed with
  // its measured value; the peaks are the reset contract.
  expect(restarted.player.stress.peakAirspeedMps).toBeLessThanOrEqual(121)
  expect(restarted.player.stress.airspeedMps).toBeLessThanOrEqual(restarted.player.stress.peakAirspeedMps)
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
})
