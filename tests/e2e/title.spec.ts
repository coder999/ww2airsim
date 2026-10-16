import { test, expect, type Page } from '@playwright/test'
import { startGame, toConditions, wholeLabel, type DiagWindow } from './harness.js'

/**
 * E2E, the front door (2026-09-19; reworked for plan F5B, 2026-10-15). What only a browser can prove: Headquarters is
 * up on load, the world is HELD under it, Administration (About, Settings) is reachable from it, and a sortie's
 * launch memos release the hold only at Launch and leave the audio context running.
 */
test.setTimeout(120_000)

const tick = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.tick())

test('Headquarters is up on load, holds the world, and exposes project links', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto('/')
  const title = page.getByRole('dialog', { name: 'Title' })
  const hq = page.getByRole('dialog', { name: 'Headquarters' })
  await page.waitForFunction(() => document.querySelector('[data-ww2-title]')?.getAttribute('data-ww2-ready') === 'true', undefined, { timeout: 60_000 })
  await expect(hq).toBeVisible()
  await expect(hq.getByText('Personnel Files')).toBeVisible()
  await expect(hq.getByRole('button', { name: 'About project' })).toBeVisible()
  // Terrain lands BEHIND the front door; the world must not have moved.
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, { timeout: 30_000 })
  const held = await tick(page)
  await page.waitForTimeout(1000)
  expect(await tick(page), 'the world advanced under Headquarters').toBe(held)
  await page.screenshot({ path: 'test-results/front-door.png' })

  await hq.getByRole('button', { name: 'About project' }).click()
  const about = page.getByRole('dialog', { name: 'About' })
  await expect(about).toBeVisible()
  await expect(about.getByRole('link', { name: 'Source repository' })).toHaveAttribute('href', 'https://github.com/coder999/ww2airsim')
  await expect(about.getByRole('link', { name: 'marktuttle.dev' })).toHaveAttribute('href', 'https://marktuttle.dev')
  await expect(about).toContainText('Copyright (C) 2026 Mark Tuttle')
  await page.screenshot({ path: 'test-results/front-door-about.png' })
  await about.getByRole('button', { name: 'Close' }).click()
  await expect(about).toBeHidden()
  await hq.getByRole('button', { name: 'Settings' }).click()
  await expect(hq.getByRole('dialog', { name: 'Settings' })).toBeVisible()
  await page.keyboard.press('Escape')

  await startGame(page)
  await expect(title).toBeHidden()
  await expect.poll(() => tick(page), { timeout: 10_000 }).toBeGreaterThan(held)
  await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.audio().state), { timeout: 15_000 }).toBe('running')
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
})

test('the launch memos: Back keeps every pick, Enter walks them and launches, the world stays held until Launch', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto('/')
  const held = await (async () => { await page.waitForFunction(() => document.querySelector('[data-ww2-title]')?.getAttribute('data-ww2-ready') === 'true', undefined, { timeout: 60_000 }); return tick(page) })()
  const title = await toConditions(page, { scenario: 'Basic Flying' })
  const next = title.getByRole('button', { name: 'Next' }).locator('visible=true')
  const back = title.getByRole('button', { name: 'Back' }).locator('visible=true')
  const radio = (group: string, name: string) => title.getByRole('radiogroup', { name: group }).getByRole('radio', { name: wholeLabel(name) })

  await expect(title.getByText('Step 3 of 5')).toBeVisible()
  await expect(title.getByRole('radiogroup', { name: 'Takeoff time' })).toBeVisible()
  await expect(title.getByRole('radiogroup', { name: 'Cloudiness' })).toBeVisible()
  // The weather reads Clear (Mark, 2026-10-15), not Sunny.
  await expect(radio('Cloudiness', 'Clear')).toBeVisible()
  await next.click()
  await expect(title.getByText('Step 4 of 5')).toBeVisible()
  await expect(radio('Aircraft', 'Grumman F6F Hellcat')).toBeChecked()
  await next.click()
  await expect(title.getByText('Step 5 of 5')).toBeVisible()
  await expect(radio('Loadout', 'Bombs')).toBeChecked()
  await page.waitForTimeout(500)
  expect(await tick(page), 'walking the memos must not release the world').toBe(held)

  // About/Settings stay reachable from the launch memos (the title's Administration memo).
  await expect(title.getByRole('button', { name: 'About project' })).toBeVisible()
  await expect(title.getByRole('button', { name: 'Settings' })).toBeVisible()

  // Back lands on the memo before with its pick intact.
  await back.click()
  await expect(title.getByText('Step 4 of 5')).toBeVisible()
  await radio('Aircraft', 'Grumman F4F Wildcat').click()
  await back.click()
  await expect(title.getByText('Step 3 of 5')).toBeVisible()

  // Enter advances the memos and launches from the last; the picks survived Back.
  await page.keyboard.press('Enter')
  await expect(title.getByText('Step 4 of 5')).toBeVisible()
  await expect(radio('Aircraft', 'Grumman F4F Wildcat')).toBeChecked()
  await page.keyboard.press('Enter')
  await expect(title.getByText('Step 5 of 5')).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(title).toBeHidden()
  await expect.poll(() => tick(page), { timeout: 10_000 }).toBeGreaterThan(held)
})
