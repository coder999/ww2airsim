import { test, expect, type Page } from '@playwright/test'
import { startGame, wholeLabel, type DiagWindow } from './harness.js'

/**
 * E2E, the title screen (2026-09-19). What only a browser can prove: the
 * overlay is up on load, the world is HELD under it, About opens and closes,
 * and the six-form sortie flow releases the hold only at Launch and
 * leave the audio context running.
 * Deliberately does NOT call `waitForTerrain`, which presses New game itself.
 */
test.setTimeout(120_000)

const tick = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.tick())

test('the title is up on load, holds the world, and exposes project links', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto('/')
  const title = page.getByRole('dialog', { name: 'Title' })
  await expect(title).toBeVisible()
  await page.waitForFunction(() => document.querySelector('[data-ww2-title]')?.getAttribute('data-ww2-ready') === 'true', undefined, { timeout: 60_000 })
  await expect(title.getByRole('button', { name: 'New game' })).toHaveCount(0)
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
  await expect(about.getByRole('link', { name: 'Source repository' })).toHaveAttribute('href', 'https://github.com/coder999/ww2airsim')
  await expect(about.getByRole('link', { name: 'marktuttle.dev' })).toHaveAttribute('href', 'https://marktuttle.dev')
  await expect(about).toContainText('Copyright (C) 2026 Mark Tuttle')
  await page.screenshot({ path: 'test-results/title-about.png' })
  await about.getByRole('button', { name: 'Close' }).click()
  await expect(about).toBeHidden()

  await startGame(page)
  await expect(title).toBeHidden()
  await expect.poll(() => tick(page), { timeout: 10_000 }).toBeGreaterThan(held)
  await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.audio().state), { timeout: 15_000 }).toBe('running')
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
})

test('six sequential forms: qualifications lead, Back keeps every pick, Enter walks them and launches', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto('/')
  const title = page.getByRole('dialog', { name: 'Title' })
  await expect(title).toBeVisible()
  await page.waitForFunction(() => document.querySelector('[data-ww2-title]')?.getAttribute('data-ww2-ready') === 'true', undefined, { timeout: 60_000 })
  const next = title.getByRole('button', { name: 'Next' }).locator('visible=true')
  const back = title.getByRole('button', { name: 'Back' }).locator('visible=true')
  const launch = title.getByRole('button', { name: 'Launch' })
  const radio = (group: string, name: string) => title.getByRole('radiogroup', { name: group }).getByRole('radio', { name: wholeLabel(name) })

  // Form 1: no ambiguous disabled footer action. Each pilot gets its own
  // New game action only after the pilot exists.
  await expect(title.getByText('Form 1 of 6')).toBeVisible()
  await expect(title.getByRole('button', { name: 'New game' })).toHaveCount(0)
  await expect(launch).toBeHidden()
  await expect(title.getByRole('radiogroup', { name: 'Scenario' })).toBeHidden()
  await expect(title.getByRole('checkbox', { name: 'Dev — unlocks everything' })).not.toBeChecked()

  await title.getByRole('button', { name: 'New pilot' }).click()
  await title.getByPlaceholder('Pilot name').fill('Form Flow Pilot')
  await title.getByRole('button', { name: 'Add' }).click()
  const newGame = title.getByRole('button', { name: 'New game: Form Flow Pilot' })
  await expect(newGame).toBeEnabled()
  await page.screenshot({ path: 'test-results/title-form1.png' })

  // New pilots are led to Missions and the three qualification missions.
  await newGame.click()
  await expect(title.getByText('Form 2 of 6')).toBeVisible()
  await expect(radio('Flight type', 'Missions')).toBeChecked()
  await expect(title).toContainText('Basic Flying, Torpedo Qualification and Carrier Qualification')
  await expect(newGame).toBeHidden()
  const held = await tick(page)
  await next.click()
  await expect(title.getByText('Form 3 of 6')).toBeVisible()
  await expect(radio('Scenario', 'Basic Flying')).toBeChecked()
  const briefing = title.getByRole('region', { name: 'Briefing' })
  await expect(briefing.getByRole('link')).toBeVisible()
  await expect(briefing).not.toContainText('https://')
  // Sortie navigation is physically above the scenario list.
  const nextBox = await next.boundingBox()
  const lastScenarioBox = await radio('Scenario', 'Surigao Strait').boundingBox()
  expect(nextBox!.y).toBeLessThan(lastScenarioBox!.y)
  await next.click()
  await expect(title.getByText('Form 4 of 6')).toBeVisible()
  await expect(title.getByRole('radiogroup', { name: 'Takeoff time' })).toBeVisible()
  await expect(title.getByRole('radiogroup', { name: 'Cloudiness' })).toBeVisible()
  await next.click()
  await expect(title.getByText('Form 5 of 6')).toBeVisible()
  await expect(radio('Aircraft', 'Grumman F6F Hellcat')).toBeChecked()
  await next.click()
  await expect(title.getByText('Form 6 of 6')).toBeVisible()
  await expect(radio('Loadout', 'Bombs')).toBeChecked()
  await page.waitForTimeout(500)
  expect(await tick(page), 'walking the forms must not release the world').toBe(held)

  // About/Settings stay reachable from the later forms.
  await expect(title.getByRole('button', { name: 'About project' })).toBeVisible()
  await expect(title.getByRole('button', { name: 'Settings' })).toBeVisible()

  // Back from each form lands on the one before with its pick intact.
  await back.click()
  await expect(title.getByText('Form 5 of 6')).toBeVisible()
  await radio('Aircraft', 'Grumman F4F Wildcat').click()
  await back.click()
  await expect(title.getByText('Form 4 of 6')).toBeVisible()
  await back.click()
  await expect(title.getByText('Form 3 of 6')).toBeVisible()
  await expect(radio('Scenario', 'Basic Flying')).toBeChecked()
  await back.click()
  await expect(title.getByText('Form 2 of 6')).toBeVisible()
  await expect(radio('Flight type', 'Missions')).toBeChecked()
  await back.click()
  await expect(title.getByText('Form 1 of 6')).toBeVisible()
  // Scoped to the roster row's own button[aria-pressed] marker: a bare
  // getByRole('button', { name: /Form Flow Pilot/ }) also matches that
  // row's "Dossier: Form Flow Pilot" button and is a strict-mode violation
  // (regression from the Dossier button, Tasks 2-8).
  await expect(
    title.locator('button[aria-pressed]').filter({ hasText: 'Form Flow Pilot' }),
  ).toHaveAttribute('aria-pressed', 'true')

  // Enter advances Forms 1-5 and launches from 6; the picks survived Back.
  await page.keyboard.press('Enter')
  await expect(title.getByText('Form 2 of 6')).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(title.getByText('Form 3 of 6')).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(title.getByText('Form 4 of 6')).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(title.getByText('Form 5 of 6')).toBeVisible()
  await expect(radio('Aircraft', 'Grumman F4F Wildcat')).toBeChecked()
  await page.keyboard.press('Enter')
  await expect(title.getByText('Form 6 of 6')).toBeVisible()
  await expect(radio('Loadout', 'Bombs')).toBeChecked()
  await page.keyboard.press('Enter')
  await expect(title).toBeHidden()
  await expect.poll(() => tick(page), { timeout: 10_000 }).toBeGreaterThan(held)
})
