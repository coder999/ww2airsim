import { expect, test } from '@playwright/test'
import { debriefDialog, hopAndLand, waitForScenario, type DiagWindow } from './harness.js'

test.setTimeout(240_000)

/** Dossier spec §B.5 plus review focus 1 and 5, on Gunnery Range: the
 *  player parks on the strip, so hopAndLand is a real physics landing with
 *  no approach to hand-fly (meta-game.spec.ts's doc comment). */
test('a landed sortie appears in the dossier; the title does not re-lock', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto('/')
  const title = page.getByRole('dialog', { name: 'Title' })
  await page.waitForSelector('[data-ww2-title][data-ww2-ready="true"]', { timeout: 60_000 })
  await title.getByRole('button', { name: 'New pilot' }).click()
  await title.getByPlaceholder('Pilot name').fill('<b>Ace</b>')
  await title.getByRole('button', { name: 'Add' }).click()
  // Review focus 5: markup in a name shows literally.
  await expect(title.locator('button[aria-pressed="true"]')).toHaveText('<b>Ace</b>')
  await title.getByRole('button', { name: 'New game' }).click()
  await title.getByRole('radiogroup', { name: 'Scenario' }).getByRole('radio', { name: 'Gunnery Range' }).check()
  await title.getByRole('button', { name: 'Launch' }).click()
  await expect(title).toBeHidden()
  await waitForScenario(page, 'gunnery-range')
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, { timeout: 30_000 })
  await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.supportedContact()), { timeout: 20_000 }).toBe(true)

  await hopAndLand(page)
  await expect(debriefDialog(page)).toContainText('LANDED')
  await debriefDialog(page).getByRole('button', { name: 'Return to title' }).click()

  // Review focus 1: the rebuilt title is unlocked at once, no strip.
  await expect(title.getByRole('button', { name: 'Settings' })).toBeEnabled({ timeout: 1_000 })
  await expect(page.locator('[data-ww2-boot]')).toBeHidden()

  await title.getByRole('button', { name: 'Dossier: <b>Ace</b>' }).click()
  const dossier = page.getByRole('dialog', { name: 'Dossier: <b>Ace</b>' })
  await expect(dossier).toBeVisible()
  const firstLog = dossier.locator('table').last().locator('tbody tr').first()
  await expect(firstLog).toContainText('Gunnery Range')
  await expect(firstLog).toContainText('Field landing')
  // The hop is short but real: a landing counted and a non-zero peak.
  const serviceRecord = dossier.locator('table').first()
  await expect(serviceRecord).toContainText('0 trap · 1 field · 0 ditched')
  await expect(serviceRecord).not.toContainText('Highest altitude0 ft')
  await page.keyboard.press('Escape')
  await expect(dossier).toBeHidden()
  await expect(title.getByRole('button', { name: 'Dossier: <b>Ace</b>' })).toBeFocused()
})
