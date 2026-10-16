import { expect, test } from '@playwright/test'
import { debriefDialog, diveToSea, startCampaignGame, waitForScenario } from './harness.js'

test.setTimeout(240_000)

/**
 * The pilot dossier after a banked sortie (plan F5B; replaces the old "landed sortie appears in the dossier"). A
 * scored Convoy Strike ends in a death, which banks into the campaign: the lost pilot's closed dossier then shows the
 * sortie in its mission log, the closure line, and the rank device; Escape and Close both dismiss it.
 */
test('a banked sortie appears in the lost pilot\'s dossier; Headquarters does not re-lock', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto('/')
  await startCampaignGame(page, { scenario: 'Convoy Strike' })
  await waitForScenario(page, 'convoy-strike')
  await diveToSea(page)
  await expect(debriefDialog(page)).toContainText('KILLED')
  await debriefDialog(page).getByRole('button', { name: 'Return to Headquarters' }).click()

  const hq = page.getByRole('dialog', { name: 'Headquarters' })
  // Headquarters is unlocked at once, no loading strip.
  await expect(hq.getByRole('button', { name: 'Settings' })).toBeEnabled({ timeout: 1_000 })
  await expect(page.locator('[data-ww2-boot]')).toBeHidden()

  await hq.getByRole('button', { name: /Pilot archive/ }).click()
  await hq.getByRole('button', { name: /^Dossier:/ }).first().click()
  const dossier = page.getByRole('dialog', { name: /^Dossier:/ })
  await expect(dossier).toBeVisible()
  await expect(dossier.getByRole('img', { name: /Ensign insignia/ })).toBeVisible()
  await expect(dossier).toContainText('K.I.A. on Convoy Strike')
  const firstLog = dossier.locator('table').last().locator('tbody tr').first()
  await expect(firstLog).toContainText('Convoy Strike')
  await expect(firstLog).toContainText('Killed')
  await page.keyboard.press('Escape')
  await expect(dossier).toBeHidden()

  // Close (not just Escape) dismisses it too.
  await hq.getByRole('button', { name: /^Dossier:/ }).first().click()
  await expect(dossier).toBeVisible()
  await dossier.getByRole('button', { name: 'Close' }).click()
  await expect(dossier).toBeHidden()
})
