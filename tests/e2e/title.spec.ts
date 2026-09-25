import { test, expect, type Page } from '@playwright/test'
import { startGame, type DiagWindow } from './harness.js'

/**
 * Tier 2, the title screen (2026-09-19). What only a browser can prove: the
 * overlay is up on load, the world is HELD under it, About opens and closes,
 * and New game then Launch (two sequential memo forms) release the hold and
 * leave the audio context running.
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

  await startGame(page)
  await expect(title).toBeHidden()
  await expect.poll(() => tick(page), { timeout: 10_000 }).toBeGreaterThan(held)
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.audio().state)).toBe('running')
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
})

test('two sequential forms: New game opens Sortie Orders, Back keeps the pilot, Launch starts the flight', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto('/')
  const title = page.getByRole('dialog', { name: 'Title' })
  await expect(title).toBeVisible()
  const newGame = title.getByRole('button', { name: 'New game' })
  const launch = title.getByRole('button', { name: 'Launch' })

  // Form 1 of 2: New game is disabled until a pilot is picked; Form 2 is not on screen yet.
  await expect(title.getByText('Form 1 of 2')).toBeVisible()
  await expect(newGame).toBeDisabled()
  await expect(launch).toBeHidden()
  await expect(title.getByRole('radiogroup', { name: 'Scenario' })).toBeHidden()

  await title.getByRole('button', { name: 'New pilot' }).click()
  await title.getByPlaceholder('Pilot name').fill('Form Flow Pilot')
  await title.getByRole('button', { name: 'Add' }).click()
  await expect(newGame).toBeEnabled()
  await page.screenshot({ path: 'test-results/title-form1.png' })

  // Form 2 of 2: mission and armament, the defaults preselected, and the world still held.
  await newGame.click()
  await expect(title.getByText('Form 2 of 2')).toBeVisible()
  await expect(title.getByRole('radiogroup', { name: 'Scenario' }).getByRole('radio', { name: 'Free Flight' })).toBeChecked()
  await expect(title.getByRole('radiogroup', { name: 'Loadout' }).getByRole('radio', { name: 'Both' })).toBeChecked()
  await expect(newGame).toBeHidden()
  const held = await tick(page)
  await page.waitForTimeout(500)
  expect(await tick(page), 'advancing to Form 2 must not release the world').toBe(held)
  await page.screenshot({ path: 'test-results/title-form2.png' })

  // About/Settings stay reachable from Form 2.
  await expect(title.getByRole('button', { name: 'About project' })).toBeVisible()
  await expect(title.getByRole('button', { name: 'Settings' })).toBeVisible()

  // Back: Form 1 again, the pilot still selected.
  await title.getByRole('button', { name: 'Back' }).click()
  await expect(title.getByText('Form 1 of 2')).toBeVisible()
  await expect(title.getByRole('button', { name: /Form Flow Pilot/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(newGame).toBeEnabled()

  await newGame.click()
  await launch.click()
  await expect(title).toBeHidden()
  await expect.poll(() => tick(page), { timeout: 10_000 }).toBeGreaterThan(held)
})
