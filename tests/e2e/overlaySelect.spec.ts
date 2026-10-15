import { test, expect } from '@playwright/test'
import { spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'

/**
 * The dev overlay (top-left: frame rate, position, the respawn query) is selectable and copyable text
 * (Mark 2026-10-14), without taking the game's input: a selection freezes the text so it is not
 * rewritten out from under the drag, ctrl+C with a selection is not a game key, and flight keys and
 * the canvas still work while the overlay is visible.
 */
test.setTimeout(120_000)
const TAC = { x: -29666, z: -47605 }

test('the dev overlay text can be selected and stays selected, and flight input still works', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto(spawnUrl({ x: TAC.x, y: 600, z: TAC.z - 6000 }))
  await waitForTerrain(page)
  const overlay = page.locator('pre').first()
  await expect(overlay).toContainText('fps')
  const style = await overlay.evaluate((el) => { const c = getComputedStyle(el); return { select: c.userSelect, events: c.pointerEvents } })
  expect(style.select).toBe('text')
  expect(style.events).toBe('auto')
  await overlay.click({ clickCount: 3 })
  const picked = await page.evaluate(() => window.getSelection()!.toString())
  expect(picked.length, 'a triple click selects a line of the overlay').toBeGreaterThan(5)
  const before = await overlay.textContent()
  await page.waitForTimeout(800)
  expect(await overlay.textContent(), 'the text is frozen while selected').toBe(before)
  expect(await page.evaluate(() => window.getSelection()!.toString())).toBe(picked)
  // Copy is not a game key: a ctrl+C with a selection is left alone (not cancelled, so the browser copies).
  const prevented = await page.evaluate(() => {
    const ev = new KeyboardEvent('keydown', { code: 'KeyC', key: 'c', ctrlKey: true, bubbles: true, cancelable: true })
    window.dispatchEvent(ev)
    return ev.defaultPrevented
  })
  expect(prevented).toBe(false)
  // Flight keys still reach the game while the overlay is up and holds a selection.
  const throttle = () => page.evaluate(() => (window as DiagWindow).__ww2!.controls().throttle)
  const t0 = await throttle()
  await page.keyboard.down('Equal')
  await page.waitForTimeout(600)
  await page.keyboard.up('Equal')
  expect(await throttle(), 'the throttle key moved the throttle').toBeGreaterThan(t0)
  // Clearing the selection lets the overlay update again.
  await page.evaluate(() => window.getSelection()!.removeAllRanges())
  await page.waitForTimeout(500)
  expect(await overlay.textContent()).not.toBe(before)
})
