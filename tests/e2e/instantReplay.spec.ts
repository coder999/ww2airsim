import { test, expect, type Page } from '@playwright/test'
import { debriefDialog, diveToSea, quickLaunch, spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'

/**
 * Instant replay (spec docs/superpowers/specs/2026-09-27-instant-replay-design.md)
 * on the real app. The PNGs are for the executing agent to READ, not an
 * appearance assertion.
 */
const TAC = { x: -29666, z: -47605 }
const replayState = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.replay())
const tick = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.tick())
const mean = (xs: readonly number[]): number => xs.reduce((sum, x) => sum + x, 0) / xs.length
const drawnToLiveM = (page: Page) => page.evaluate(() => {
  const w = (window as DiagWindow).__ww2!
  const drawn = w.renderedPlayerPositionM()
  const live = w.aircraftPositionM()
  return drawn === null ? 0 : Math.hypot(drawn.x - live.x, drawn.y - live.y, drawn.z - live.z)
})

test.setTimeout(180_000)

test('crash auto-replays once, skip is immediate, and Watch replay returns to debrief', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto(spawnUrl({ x: TAC.x, y: 600, z: TAC.z - 8000 }))
  await waitForTerrain(page)

  const firstDive = diveToSea(page, 90_000)
  await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.impact()), { timeout: 60_000 }).not.toBeNull()
  const impactTick = await tick(page)
  await expect.poll(() => replayState(page), { timeout: 6000 }).not.toBeNull()
  await page.waitForTimeout(500)
  expect(await tick(page)).toBe(impactTick)
  await firstDive

  const debrief = debriefDialog(page)
  await expect(debrief).toBeVisible()
  await expect(debrief.getByText(/^Banked total:/)).toHaveCount(1)
  expect(await replayState(page)).toBeNull()

  await debrief.getByRole('button', { name: 'Restart' }).click()
  await expect(debrief).toBeHidden()
  await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.impact())).toBeNull()

  const secondDive = diveToSea(page, 90_000)
  await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.impact()), { timeout: 60_000 }).not.toBeNull()
  await expect.poll(() => replayState(page), { timeout: 6000 }).not.toBeNull()
  const skippedAt = Date.now()
  await page.keyboard.press('Escape')
  await expect(debrief).toBeVisible({ timeout: 1000 })
  expect(Date.now() - skippedAt).toBeLessThan(1000)
  await secondDive

  const bankedBeforeWatch = await debrief.getByText(/^Banked total:/).textContent()
  await debrief.getByRole('button', { name: 'Watch replay' }).click()
  await expect.poll(() => replayState(page)).not.toBeNull()
  await expect(debrief).toBeHidden()
  await page.keyboard.press('Escape')
  await expect.poll(() => replayState(page)).toBeNull()
  await expect(debrief).toBeVisible()
  await expect(debrief.getByText(/^Banked total:/)).toHaveText(bankedBeforeWatch ?? '')
  await expect(debrief.getByText(/^Banked total:/)).toHaveCount(1)
})

test('manual replay controls, cameras and effects stay isolated from the held flight', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await quickLaunch(page, { scenario: 'pursuit-range' })
  await waitForTerrain(page)
  await page.waitForTimeout(10_000)

  const liveState = await page.evaluate(() => {
    const d = (window as DiagWindow).__ww2!
    d.resetFrameTimes()
    return { assists: d.assists(), muted: d.audio().muted, timeScale: d.timeScale() }
  })
  await page.waitForTimeout(3000)
  const liveFrames = await page.evaluate(() => (window as DiagWindow).__ww2!.frameTimesMs())
  expect(liveFrames.length).toBeGreaterThan(30)
  const liveMeanMs = mean(liveFrames)

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
  const started = (await replayState(page))!
  expect(started.camera).toBe('orbit')
  expect(started.targetId).toBe('pursuer-1')
  expect(started.endS - started.startS).toBeGreaterThanOrEqual(9)
  await expect(page.locator('[data-replay-label]')).toHaveText('REPLAY')
  await expect(page.locator('[data-replay-label]')).toBeVisible()
  await expect.poll(() => drawnToLiveM(page)).toBeGreaterThan(100)
  await expect(page.getByText(/PAUSED/)).toBeHidden()
  expect(await tick(page)).toBe(before)

  // A like-for-like three-second wall-clock sample while the replay plays.
  await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())
  await page.waitForTimeout(3000)
  const replayFrames = await page.evaluate(() => (window as DiagWindow).__ww2!.frameTimesMs())
  expect(replayFrames.length).toBeGreaterThan(30)
  const replayMeanMs = mean(replayFrames)
  expect(replayMeanMs).toBeLessThanOrEqual(liveMeanMs * 1.25)
  console.log(`instant replay frame means: live=${liveMeanMs.toFixed(3)} ms replay=${replayMeanMs.toFixed(3)} ms`)

  await page.keyboard.press('Space')
  await expect.poll(async () => (await replayState(page))?.playing).toBe(false)
  const timeline = page.locator('[data-replay-timeline]')
  const initialTrackBox = (await timeline.boundingBox())!
  await timeline.click({ position: { x: initialTrackBox.width * 0.5, y: initialTrackBox.height / 2 } })
  const middle = (await replayState(page))!
  await page.keyboard.press('ArrowRight')
  const afterRight = (await replayState(page))!
  expect(afterRight.tS).toBeCloseTo(middle.tS + 1, 5)
  await page.keyboard.press('ArrowLeft')
  const afterLeft = (await replayState(page))!
  expect(afterLeft.tS).toBeCloseTo(afterRight.tS - 1, 5)

  for (const [key, speed] of [['Digit2', 1], ['Digit3', 3], ['Digit1', 0.5]] as const) {
    await page.keyboard.press(key)
    await expect.poll(async () => (await replayState(page))?.speed).toBe(speed)
  }

  // The fixed capture instant is one second before the event: that is where
  // Flyby's path-side camera was intentionally planted. Capturing it at the
  // middle of a ten-second window makes the airplane a speck four seconds
  // away and says nothing useful about its framing.
  await timeline.click({ position: { x: initialTrackBox.width * 0.9, y: initialTrackBox.height / 2 } })
  const cameras = [
    ['Digit4', 'auto'],
    ['Digit5', 'orbit'],
    ['Digit6', 'flyby'],
    ['Digit7', 'target'],
    ['Digit8', 'cockpit'],
  ] as const
  for (const [key, camera] of cameras) {
    await page.keyboard.press(key)
    await expect.poll(async () => (await replayState(page))?.camera).toBe(camera)
    await page.waitForTimeout(250)
    await page.screenshot({ path: `test-results/replay/${camera}.png` })
  }
  // Manual inherits the eye it is entered from. Enter it from Orbit for a
  // useful free-camera establishing shot; entering straight from Cockpit is
  // correctly seamless but leaves the free eye inside the airframe.
  await page.keyboard.press('Digit5')
  await expect.poll(async () => (await replayState(page))?.camera).toBe('orbit')
  await page.waitForTimeout(250)
  await page.keyboard.press('Digit9')
  await expect.poll(async () => (await replayState(page))?.camera).toBe('manual')
  await page.waitForTimeout(250)
  await page.screenshot({ path: 'test-results/replay/manual.png' })

  // Seek to the event at the window end. The following render frame rebuilds
  // deterministic replay effects from the nearest checkpoint.
  const trackBox = (await timeline.boundingBox())!
  await timeline.click({ position: { x: trackBox.width - 1, y: trackBox.height / 2 } })
  await page.waitForTimeout(250)
  const rebuildMs = await page.evaluate(() => (window as DiagWindow).__ww2!.replayFxRebuildMs())
  expect(rebuildMs).toBeGreaterThanOrEqual(0)
  expect(rebuildMs).toBeLessThan(50)
  console.log(`instant replay effect rebuild at window end: ${rebuildMs.toFixed(3)} ms`)

  // Every tempting live-flight key is owned by replay while the replay is up.
  for (const key of ['KeyL', 'KeyR', 'KeyQ', 'KeyP', 'Tab', 'KeyI', 'Slash', 'KeyT']) {
    await page.keyboard.press(key)
  }
  await expect(page.getByRole('dialog', { name: 'Navigation chart' })).toBeHidden()

  await page.keyboard.press('Escape')
  await expect.poll(() => replayState(page)).toBeNull()
  await expect(page.locator('[data-replay-label]')).toBeHidden()
  await page.waitForTimeout(300)
  expect(await tick(page)).toBe(before)
  await expect(page.getByText(/PAUSED/)).toBeVisible()
  await expect.poll(() => drawnToLiveM(page)).toBeLessThan(5)

  const restored = await page.evaluate(() => {
    const d = (window as DiagWindow).__ww2!
    return { assists: d.assists(), muted: d.audio().muted, timeScale: d.timeScale() }
  })
  expect(restored).toEqual(liveState)
  await expect(page.getByRole('dialog', { name: 'Navigation chart' })).toBeHidden()
})
