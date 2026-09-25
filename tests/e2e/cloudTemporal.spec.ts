import { test, expect, type Page } from '@playwright/test'
import { debriefDialog, spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'
import { VIEWS } from './views.js'
import { loadAirfield } from '../../tools/content/load.js'

/**
 * Tier 2, the cloud pass's temporal accumulation (photoreal Task 4,
 * 2026-09-24; spec §4.1 and the plan's review focus 1-2). The screenshots are
 * READ by the executor -- ghost trails and a reversed reprojection are
 * judged by eye -- and the reset counter makes the discontinuity handling a
 * mechanical check as well.
 */
test.setTimeout(120_000)

/** A TSL graph that fails to build renders black with no validation error
 *  (clouds.spec.ts has the story), so every case fails on a console error. */
const consoleErrors: string[] = []
test.beforeEach(({ page }) => {
  consoleErrors.length = 0
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 400)) })
  page.on('pageerror', (e) => consoleErrors.push(e.message))
})
test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
  expect(consoleErrors, `console errors:\n${consoleErrors.join('\n')}`).toEqual([])
})

const view = (name: string): string => VIEWS.find((v) => v.name === name)!.url + '&cloudTier=high&oceanTier=high'
const resets = (page: Page): Promise<number> => page.evaluate(() => (window as DiagWindow).__ww2!.clouds().historyResets)
const frames = (page: Page, n: number): Promise<void> => page.evaluate((count) => new Promise<void>((resolve) => {
  const tick = (left: number): void => { if (left === 0) resolve(); else requestAnimationFrame(() => tick(left - 1)) }
  tick(count)
}), n)

// Full right aileron through the deck. READ: no cloud texture smeared behind
// edges, no doubled edges, at 0 / 0.5 / 1.0 s. The counter proves the roll
// never tripped a reset: every frame here was accumulated, so a clean picture
// is the history's doing, not a fallback to the raw march.
for (const name of ['in-deck-1900', 'under-deck-1200']) {
  test(`roll: full aileron at ${name}, no ghost trails`, async ({ page }) => {
    await page.setViewportSize({ width: 2560, height: 1440 })
    await page.goto(view(name))
    await waitForTerrain(page)
    await page.waitForTimeout(2000)
    const before = await resets(page)
    await page.keyboard.down('KeyD')
    await page.screenshot({ path: `test-results/cloudTemporal/roll-${name}-0.0.png` })
    await page.waitForTimeout(500)
    await page.screenshot({ path: `test-results/cloudTemporal/roll-${name}-0.5.png` })
    await page.waitForTimeout(500)
    await page.screenshot({ path: `test-results/cloudTemporal/roll-${name}-1.0.png` })
    await page.waitForTimeout(200)
    await page.keyboard.up('KeyD')
    expect(await resets(page) - before, 'a roll at flight speed must not reset the cloud history').toBe(0)
  })
}

// A fresh page at a different view, three frames in. READ: no ghost of the
// under-deck view in the above-deck one.
test('teleport: a new view three frames in carries no ghost of the old one', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(view('under-deck-1200'))
  await waitForTerrain(page)
  await page.waitForTimeout(3000)
  await page.goto(view('above-deck-3200'))
  await waitForTerrain(page)
  await frames(page, 3)
  await page.screenshot({ path: 'test-results/cloudTemporal/teleport-3frames.png' })
})

// The in-page discontinuity (review focus 1): crash, Restart, three frames.
// The same page and the same cloud pass, so history from the wreck's view
// WOULD be reprojected into the new one unless it is reset. READ: no ghost of
// the crash view; the counter proves the reset happened.
test('restart: history resets across a crash and Restart in the same page', async ({ page }) => {
  const tacloban = loadAirfield('tacloban').runway.center
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(spawnUrl({ x: tacloban.x, y: 120, z: tacloban.z - 8000 }) + '&cloudTier=high&oceanTier=high')
  await waitForTerrain(page)
  await page.keyboard.down('ArrowUp')
  await debriefDialog(page).waitFor({ timeout: 20_000 })
  await page.keyboard.up('ArrowUp')
  await page.waitForTimeout(1000)
  const before = await resets(page)
  await page.getByRole('button', { name: 'Restart' }).click()
  await expect(debriefDialog(page)).toBeHidden()
  await frames(page, 3)
  await page.screenshot({ path: 'test-results/cloudTemporal/restart-3frames.png' })
  expect(await resets(page) - before, 'Restart must reset the cloud history').toBeGreaterThanOrEqual(1)
})

// Look left and back. Numpad4 is a SNAP, not a pan (lookAround.ts), so there
// is no mid-turn frame and this case cannot show reprojection direction --
// the residual case below does that. This one checks that a look-around
// neither resets history nor errors. READ: both frames clean.
test('look left: a look-around snap keeps history and stays clean', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(view('under-deck-1200'))
  await waitForTerrain(page)
  await page.waitForTimeout(2000)
  const before = await resets(page)
  await page.keyboard.down('Numpad4')
  await page.waitForTimeout(150)
  await page.screenshot({ path: 'test-results/cloudTemporal/look-left-mid.png' })
  await page.waitForTimeout(150)
  await page.keyboard.up('Numpad4')
  await page.screenshot({ path: 'test-results/cloudTemporal/look-left-end.png' })
  expect(await resets(page) - before, 'a look-around must not reset the cloud history').toBe(0)
})

// Reprojection direction, mechanically (Task 4 fix round 1). During a held
// pull-up the camera pitches continuously, so last frame's clouds sit at a
// different screen position. `cloudReprojectionResidual` measures, in one
// pass over one frame, how far last frame's march at the reprojected position
// is from this frame's march -- for the resolve's own mapping and for the
// motion-reversed and v-mirrored ones. The correct mapping must be the
// closest. A sign or y-flip error in `reprojectUvNode` fails this.
test('reprojection direction: the resolve mapping beats reversed and mirrored ones during a pull-up', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(view('under-deck-1200'))
  await waitForTerrain(page)
  await page.waitForTimeout(2000)
  const still = await page.evaluate(() => (window as DiagWindow).__ww2!.cloudReprojectionResidual())
  console.log('RESIDUAL still', JSON.stringify(still))
  await page.keyboard.down('ArrowDown')
  await page.waitForTimeout(400)
  const samples = []
  for (let i = 0; i < 5; i++) {
    const r = await page.evaluate(() => (window as DiagWindow).__ww2!.cloudReprojectionResidual())
    expect(r).not.toBeNull()
    if (!r!.reset) samples.push(r!)
    await page.waitForTimeout(50)
  }
  await page.keyboard.up('ArrowDown')
  console.log('RESIDUAL pull', JSON.stringify(samples))
  expect(samples.length).toBeGreaterThanOrEqual(3)
  for (const r of samples) {
    // Measured 2026-09-25 on the reference GPU: correct 0.017-0.026,
    // reversed 0.113-0.139 (5-8x), mirrored 1.30-1.83. Half the reversed
    // residual leaves a wide margin while still demanding a real gap.
    expect(r.correct, JSON.stringify(r)).toBeLessThan(r.reversed * 0.5)
    expect(r.correct, JSON.stringify(r)).toBeLessThan(r.mirrored)
  }
})

// A chase <-> cockpit cut resets history deterministically (Task 4 fix round
// 1), not through the speed test.
test('camera cut: cycling chase to cockpit resets the cloud history', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(view('under-deck-1200'))
  await waitForTerrain(page)
  await page.waitForTimeout(1500)
  const before = await resets(page)
  const mode = await page.evaluate(() => (window as DiagWindow).__ww2!.cameraMode())
  await page.keyboard.press('KeyC')
  await page.waitForFunction((m) => (window as DiagWindow).__ww2!.cameraMode() !== m, mode)
  await frames(page, 3)
  expect(await resets(page) - before, 'a camera cut must reset the cloud history').toBeGreaterThanOrEqual(1)
})
