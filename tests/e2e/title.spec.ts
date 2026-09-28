import { test, expect, type Page } from '@playwright/test'
import { startGame, wholeLabel, type DiagWindow } from './harness.js'

/**
 * Tier 2, the title screen (2026-09-19). What only a browser can prove: the
 * overlay is up on load, the world is HELD under it, About opens and closes,
 * and New game, Next, Next, Launch (four sequential memo forms) release the hold and
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

test('four sequential forms: each opens on its default, Back keeps every pick, Enter walks them and launches', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto('/')
  const title = page.getByRole('dialog', { name: 'Title' })
  await expect(title).toBeVisible()
  const newGame = title.getByRole('button', { name: 'New game' })
  const next = title.getByRole('button', { name: 'Next' }).locator('visible=true')
  const back = title.getByRole('button', { name: 'Back' }).locator('visible=true')
  const launch = title.getByRole('button', { name: 'Launch' })
  const radio = (group: string, name: string) => title.getByRole('radiogroup', { name: group }).getByRole('radio', { name: wholeLabel(name) })

  // Form 1 of 4: New game is disabled until a pilot is picked; no later form is on screen.
  await expect(title.getByText('Form 1 of 4')).toBeVisible()
  await expect(newGame).toBeDisabled()
  await expect(launch).toBeHidden()
  await expect(title.getByRole('radiogroup', { name: 'Scenario' })).toBeHidden()
  await expect(title.getByRole('checkbox', { name: 'Dev — unlocks everything' })).not.toBeChecked()

  await title.getByRole('button', { name: 'New pilot' }).click()
  await title.getByPlaceholder('Pilot name').fill('Form Flow Pilot')
  await title.getByRole('button', { name: 'Add' }).click()
  await expect(newGame).toBeEnabled()
  await page.screenshot({ path: 'test-results/title-form1.png' })

  // Forms 2-4, each on its default, the world held throughout.
  await newGame.click()
  await expect(title.getByText('Form 2 of 4')).toBeVisible()
  await expect(radio('Scenario', 'Free Flight')).toBeChecked()
  await expect(newGame).toBeHidden()
  const held = await tick(page)
  await next.click()
  await expect(title.getByText('Form 3 of 4')).toBeVisible()
  await expect(radio('Aircraft', 'Grumman F6F Hellcat')).toBeChecked()
  await next.click()
  await expect(title.getByText('Form 4 of 4')).toBeVisible()
  await expect(radio('Loadout', 'Both')).toBeChecked()
  await page.waitForTimeout(500)
  expect(await tick(page), 'walking the forms must not release the world').toBe(held)

  // About/Settings stay reachable from the later forms.
  await expect(title.getByRole('button', { name: 'About project' })).toBeVisible()
  await expect(title.getByRole('button', { name: 'Settings' })).toBeVisible()

  // Back from each form lands on the one before with its pick intact.
  await radio('Loadout', 'Rockets').click()
  await back.click()
  await expect(title.getByText('Form 3 of 4')).toBeVisible()
  await radio('Aircraft', 'Grumman F4F Wildcat').click()
  await back.click()
  await expect(title.getByText('Form 2 of 4')).toBeVisible()
  await expect(radio('Scenario', 'Free Flight')).toBeChecked()
  await back.click()
  await expect(title.getByText('Form 1 of 4')).toBeVisible()
  // Scoped to the roster row's own button[aria-pressed] marker: a bare
  // getByRole('button', { name: /Form Flow Pilot/ }) also matches that
  // row's "Dossier: Form Flow Pilot" button and is a strict-mode violation
  // (regression from the Dossier button, Tasks 2-8).
  await expect(
    title.locator('button[aria-pressed]').filter({ hasText: 'Form Flow Pilot' }),
  ).toHaveAttribute('aria-pressed', 'true')

  // Enter advances Forms 1-3 and launches from 4; the picks made above survived Back.
  await page.keyboard.press('Enter')
  await expect(title.getByText('Form 2 of 4')).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(title.getByText('Form 3 of 4')).toBeVisible()
  await expect(radio('Aircraft', 'Grumman F4F Wildcat')).toBeChecked()
  await page.keyboard.press('Enter')
  await expect(title.getByText('Form 4 of 4')).toBeVisible()
  await expect(radio('Loadout', 'Rockets')).toBeChecked()
  await page.keyboard.press('Enter')
  await expect(title).toBeHidden()
  await expect.poll(() => tick(page), { timeout: 10_000 }).toBeGreaterThan(held)
})
