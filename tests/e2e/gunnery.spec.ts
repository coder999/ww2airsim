import { test, expect, type Page } from '@playwright/test'
import { debriefDialog, percentile, waitForTerrain, type DiagWindow, TRIPWIRE_1440P_P95_MS } from './harness.js'
import { SCENARIO_PARAM, SPAWN_PARAMS } from '../../src/render/spawn.js'
import { AUDIO_ASSETS } from '../../src/audio/assets.js'
import { flyPass } from './pilot.js'
import { groundTruthTerrain, rangePass } from '../pilot/rangePass.js'

/**
 * Tier 2, the playable gunnery slice (Plan 6). Same platform and caveats as
 * `adapter.spec.ts`: the reference GPU on the Windows desktop, never hosted
 * CI. Run it with the README's Tier 2 command.
 *
 * What only this tier can prove is the wiring of the whole slice in the
 * shipped app: Space reaching `Controls.fire` through the real keydown
 * listener and `nextFrameState`, the fixed step consuming ammunition, rounds
 * from a strafing pass reaching a parked target's hit zones over real terrain, the
 * tracer mesh and the readout drawing from the same record, and the gun
 * clip actually being cued. Every piece is unit-tested; the Plan 3 defect
 * class -- a feature inert in the browser with its tests green -- is
 * invisible below this tier.
 */
const RANGE = `/?${SCENARIO_PARAM}=gunnery-range`

test.setTimeout(180_000)

const combat = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.combat()!)
const cuesFired = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.audio().cuesFired)

/** The range's own start (a run-in since 2026-09-29) with every clip decoded. */
async function onTheRange(page: Page, query = ''): Promise<void> {
  await page.goto(`${RANGE}${query}`)
  await waitForTerrain(page)
  await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.audio().loaded.length), { timeout: 30_000 }).toBe(AUDIO_ASSETS.length)
}

/** High over open water (the restart test's spawn, higher): the guns with no aim to get right. */
const [xName, yName, zName] = SPAWN_PARAMS
const HIGH = `&${xName}=0&${yName}=1500&${zName}=0`

/**
 * Since T1 (2026-09-28) a parked Hellcat sits 9.45 degrees nose-up and its
 * guns fire about 50 m over a target 300 m away, so the range became a
 * strafing run-in that lands straight ahead (plan
 * 2026-09-29-gunnery-range-strafing-pass), flown here by the shared test
 * pilot (`tests/pilot/`, `./pilot.ts`).
 */
const terrain = groundTruthTerrain()
const PASS = rangePass('gunnery-range', 'target-1', terrain)

test('gunnery range: the strafing pass takes target-1 down, the guns are heard, the readout agrees, and the airplane lands', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await onTheRange(page)
  const before = await combat(page)
  expect(before.player).toMatchObject({ shots: 0, hits: 0, kills: 0, ammo: 2400, structure: 1, destroyed: false, firing: false })
  expect(before.aircraft.map((a) => a.id)).toEqual(['f6f-1', 'target-1', 'target-2'])
  const heardBefore = await cuesFired(page)
  await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())

  const flown = await flyPass(page, PASS)
  expect(flown.end, 'the pass did not end at rest on the runway').toBe('stopped')

  const after = await combat(page)
  console.log(`gunnery pass: ${JSON.stringify(after.player)} targets ${JSON.stringify(after.aircraft.slice(1))}`)
  expect(after.player.shots, 'the pass never fired').toBeGreaterThan(0)
  expect(after.player.ammo).toBe(2400 - after.player.shots)
  expect(after.poolSaturated).toBe(0)
  expect(after.player.hits, 'no round reached target-1').toBeGreaterThan(0)
  expect(after.aircraft.find((a) => a.id === 'target-1')!.destroyed, 'target-1 survived the pass').toBe(true)
  expect(after.player.kills).toBe(1)
  expect(await cuesFired(page)).toBeGreaterThan(heardBefore)
  expect(after.projectiles).toBe(0)
  expect(after.tracers).toBe(0)
  await expect(page.getByLabel('Combat', { exact: true })).toContainText(`AMMO ${after.player.ammo}`)
  await expect(page.getByLabel('Combat', { exact: true })).toContainText(`HITS ${after.player.hits}`)

  const gpu = await page.evaluate(() => (window as DiagWindow).__ww2!.gpuFrameTimesMs())
  if (gpu.length > 120) console.log(`gunnery pass gpu p95 ${percentile(gpu, 0.95).toFixed(3)} ms over ${gpu.length} samples`)
  const errors = await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)
  expect(errors, `WebGPU validation errors:\n${JSON.stringify(errors, null, 2)}`).toEqual([])
  await page.screenshot({ path: 'test-results/gunnery-after.png' })
})

test('Space fires six guns in both camera modes, tracers fly, release stops them, and paused fires nothing', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await onTheRange(page, HIGH)
  const heardBefore = await cuesFired(page)
  await page.keyboard.down('Space')
  // The trigger, as the SIMULATION received it -- not just the key event.
  await expect.poll(() => combat(page).then((c) => c.player.firing), { timeout: 5_000 }).toBe(true)
  await expect.poll(() => combat(page).then((c) => c.tracers), { timeout: 5_000 }).toBeGreaterThan(0)
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'test-results/gunnery-firing-chase.png' })
  // Both camera modes, while still firing: the readout and the tracers must
  // survive the airframe being hidden.
  await page.keyboard.press('KeyC')
  await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.cameraMode())).toBe('cockpit')
  await expect.poll(() => combat(page).then((c) => c.tracers), { timeout: 5_000 }).toBeGreaterThan(0)
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'test-results/gunnery-firing-cockpit.png' })
  await page.keyboard.press('KeyC')
  await page.waitForTimeout(1200)
  await page.keyboard.up('Space')

  const held = await combat(page)
  expect(held.player.shots, 'six guns at 800 rpm over ~3 s').toBeGreaterThan(100)
  expect(held.player.ammo).toBe(2400 - held.player.shots)
  expect(held.poolSaturated).toBe(0)
  expect(await cuesFired(page)).toBeGreaterThan(heardBefore)

  // Released: the count stops where it is and every round expires.
  await expect.poll(() => combat(page).then((c) => c.player.firing)).toBe(false)
  const released = await combat(page)
  await page.waitForTimeout(3_500)
  const later = await combat(page)
  expect(later.player.shots).toBe(released.player.shots)
  expect(later.projectiles).toBe(0)
  expect(later.tracers).toBe(0)
  await expect(page.getByLabel('Combat', { exact: true })).toContainText(`AMMO ${later.player.ammo}`)

  // Paused, a held trigger emits nothing and cues nothing.
  const heardBeforePause = await cuesFired(page)
  await page.keyboard.press('Escape')
  await page.keyboard.down('Space')
  await page.waitForTimeout(1_000)
  await page.keyboard.up('Space')
  expect((await combat(page)).player.shots).toBe(later.player.shots)
  expect(await cuesFired(page)).toBe(heardBeforePause)
  await page.keyboard.press('Escape')
  const errors = await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)
  expect(errors, `WebGPU validation errors:\n${JSON.stringify(errors, null, 2)}`).toEqual([])
})

test('firing at 1440p stays inside the GPU frame budget', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await onTheRange(page, HIGH)
  await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())
  await page.keyboard.down('Space')
  await page.waitForTimeout(4_000)
  await page.keyboard.up('Space')
  const after = await page.evaluate(() => {
    const d = (window as DiagWindow).__ww2!
    return { gpu: d.gpuFrameTimesMs(), shots: d.combat()!.player.shots, errors: d.validationErrors }
  })
  expect(after.shots).toBeGreaterThan(100)
  expect(after.errors).toEqual([])
  expect(after.gpu.length).toBeGreaterThan(120)
  const p95 = percentile(after.gpu, 0.95)
  console.log(`gunnery gpu p95 ${p95.toFixed(3)} ms over ${after.gpu.length} samples, ${after.shots} rounds fired`)
  expect(p95).toBeLessThan(TRIPWIRE_1440P_P95_MS)
})

test('a restart rebuilds the guns: full load, empty sky, no replayed gunfire', async ({ page }) => {
  // Airborne over open water with the range's world, so the flight can be
  // ended the way audio.spec.ts ends one -- nose down into the sea -- and the
  // debrief's Restart button reached. Restart is only offered from a debrief.
  await page.goto(`${RANGE}&${xName}=0&${yName}=120&${zName}=0`)
  await waitForTerrain(page)
  await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.audio().loaded.length), { timeout: 30_000 }).toBe(AUDIO_ASSETS.length)
  await page.keyboard.down('Space')
  await expect.poll(() => combat(page).then((c) => c.player.shots), { timeout: 5_000 }).toBeGreaterThan(0)
  await page.waitForTimeout(500)
  await page.keyboard.up('Space')
  const fired = await combat(page)
  expect(fired.player.ammo).toBeLessThan(2400)

  await page.keyboard.down('ArrowUp')
  await debriefDialog(page).waitFor({ timeout: 20_000 })
  await page.keyboard.up('ArrowUp')
  await debriefDialog(page).getByRole('button', { name: 'Restart' }).click()
  await expect.poll(() => combat(page).then((c) => c.player.shots), { timeout: 10_000 }).toBe(0)
  const heard = await cuesFired(page)
  await page.waitForTimeout(3_000)
  const restarted = await combat(page)
  expect(restarted.player).toMatchObject({ shots: 0, hits: 0, kills: 0, ammo: 2400, structure: 1, destroyed: false, firing: false })
  expect(restarted.projectiles).toBe(0)
  expect(restarted.aircraft.every((a) => a.structure === 1 && !a.destroyed)).toBe(true)
  expect(await cuesFired(page), 'the old flight\'s gunfire replayed after a restart').toBe(heard)
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
})
