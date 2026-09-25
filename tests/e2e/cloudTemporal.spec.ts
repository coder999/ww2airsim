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

// Reprojection direction. Look left for 0.3 s and shoot mid-turn. READ: if
// cloud texture visibly smears AGAINST the turn, the x or y convention in
// `reprojectUvNode` is wrong (the render-target y-flip trap).
test('look left: clouds stay crisp mid-turn (reprojection direction)', async ({ page }) => {
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
