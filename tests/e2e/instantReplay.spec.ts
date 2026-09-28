import { test, expect, type Page } from '@playwright/test'
import { spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'

/**
 * Instant replay (spec docs/superpowers/specs/2026-09-27-instant-replay-design.md)
 * on the real app. Task 7 adds the manual replay; Task 10 adds the rest. The
 * PNGs are for the executing agent to READ, not an appearance assertion.
 */
const TAC = { x: -29666, z: -47605 }
const replayState = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.replay())
const tick = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.tick())
const drawnToLiveM = (page: Page) => page.evaluate(() => {
  const w = (window as DiagWindow).__ww2!
  const drawn = w.renderedPlayerPositionM()
  const live = w.aircraftPositionM()
  return drawn === null ? 0 : Math.hypot(drawn.x - live.x, drawn.y - live.y, drawn.z - live.z)
})

test.setTimeout(90_000)

test('K while paused replays the past, and Esc returns to the same paused tick', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(spawnUrl({ x: TAC.x, y: 1200, z: TAC.z - 8000 }))
  await waitForTerrain(page)
  await page.waitForTimeout(6000)
  await page.keyboard.press('Escape')
  // The pause is latched and lands on the next frame: wait for the tick to hold.
  let before = await tick(page)
  await expect.poll(async () => {
    const now = await tick(page)
    const held = now === before
    before = now
    return held
  }, { intervals: [250] }).toBe(true)
  expect(await replayState(page)).toBeNull()

  await page.keyboard.press('KeyK')
  await expect.poll(() => replayState(page)).not.toBeNull()
  const r = (await replayState(page))!
  expect(r.camera).toBe('orbit')
  expect(r.endS - r.startS).toBeGreaterThanOrEqual(3)
  await expect(page.locator('[data-replay-label]')).toHaveText('REPLAY')
  await expect(page.locator('[data-replay-label]')).toBeVisible()
  // Drawing the past: at ~120 m/s, the start of a >= 3 s recording is far behind.
  await expect.poll(() => drawnToLiveM(page)).toBeGreaterThan(100)
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'test-results/instant-replay/manual-orbit.png' })
  // The flight HUD is hidden (R-5); the pause badge would otherwise show.
  await expect(page.getByText(/PAUSED/)).toBeHidden()
  expect(await tick(page)).toBe(before)

  await page.keyboard.press('Escape')
  await expect.poll(() => replayState(page)).toBeNull()
  await expect(page.locator('[data-replay-label]')).toBeHidden()
  await page.waitForTimeout(300)
  expect(await tick(page)).toBe(before)
  // Still paused (IR-3): the badge is back, and the drawn airplane is the live one again.
  await expect(page.getByText(/PAUSED/)).toBeVisible()
  // Within a tick's travel: the drawn pose is interpolated, the live one is the tick's state.
  await expect.poll(() => drawnToLiveM(page)).toBeLessThan(5)
  await page.screenshot({ path: 'test-results/instant-replay/manual-exited.png' })
})
