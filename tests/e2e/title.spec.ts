import { test, expect, type Page } from '@playwright/test'
import { type DiagWindow } from './harness.js'

/**
 * Tier 2, the title screen (2026-09-19). What only a browser can prove: the
 * overlay is up on load, the world is HELD under it, About opens and closes,
 * and New game releases the hold and leaves the audio context running.
 * Deliberately does NOT call `waitForTerrain`, which presses New game itself.
 */
test.setTimeout(120_000)

const tick = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.tick())

test('the title is up on load with both options, holds the world, and New game releases it', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto('/')
  const title = page.getByRole('dialog', { name: 'Title' })
  await expect(title).toBeVisible()
  await expect(title.getByRole('button', { name: 'New game' })).toBeVisible()
  await expect(title.getByRole('button', { name: 'About project' })).toBeVisible()
  // Terrain lands BEHIND the title; the world must not have moved.
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, { timeout: 30_000 })
  const held = await tick(page)
  await page.waitForTimeout(1000)
  expect(await tick(page), 'the world advanced under the title').toBe(held)
  await page.screenshot({ path: 'test-results/title-screen.png' })

  await title.getByRole('button', { name: 'About project' }).click()
  const about = page.getByRole('dialog', { name: 'About' })
  await expect(about).toBeVisible()
  await expect(about.getByRole('link', { name: 'https://github.com/coder999/ww2airsim' })).toBeVisible()
  await page.screenshot({ path: 'test-results/title-about.png' })
  await about.getByRole('button', { name: 'Close' }).click()
  await expect(about).toBeHidden()

  await title.getByRole('button', { name: 'New game' }).click()
  await expect(title).toBeHidden()
  await expect.poll(() => tick(page), { timeout: 10_000 }).toBeGreaterThan(held)
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.audio().state)).toBe('running')
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
})
