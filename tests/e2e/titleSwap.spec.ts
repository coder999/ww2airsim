import { test, expect } from '@playwright/test'
import { startGame, waitForTerrain, type DiagWindow } from './harness.js'

/**
 * Behind the title the boot default's airplane must not be drawn, its engine
 * must stay silent, and choosing a different airplane must swap in well under
 * a second: a visible swap or an idle Hellcat under the menu reads as clunky.
 */
test.setTimeout(120_000)

const SWAP_BUDGET_MS = 1000

test('title: no airplane drawn, no engine sound, and a chosen aircraft swaps in under a second', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/')
  const title = page.getByRole('dialog', { name: 'Title' })
  await expect(title).toBeVisible()
  await page.waitForFunction(() => (window as DiagWindow).__ww2 !== undefined)

  // A click is the gesture that unlocks audio; the menu must stay silent after it.
  await title.click({ position: { x: 5, y: 5 } })
  await page.waitForTimeout(1500)
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.playerAirframeVisible())).toBe(false)
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.audio().engineGain)).toBe(0)

  await startGame(page, { scenario: 'Free Flight', aircraft: 'Ki-84', loadout: 'Clean', dev: true })
  await page.waitForFunction(() => performance.getEntriesByName('sortie-swap').length > 0, undefined, { timeout: 30_000 })
  const swapMs = await page.evaluate(() => performance.getEntriesByName('sortie-swap')[0]!.duration)
  console.log(`sortie swap: ${swapMs.toFixed(0)} ms`)
  expect(swapMs).toBeLessThan(SWAP_BUDGET_MS)

  await waitForTerrain(page)
  await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.playerAirframeVisible())).toBe(true)
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.playerModel())).toContain('ki-84')
})
