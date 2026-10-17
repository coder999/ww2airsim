import { expect, test } from '@playwright/test'
import { startCampaignGame, waitForScenario, type DiagWindow } from './harness.js'

/**
 * F10B (2026-10-17): the two chapters of batch B reach a player through Headquarters. A fresh campaign has them locked, so the Dev unlock is used
 * (a Dev sortie records nothing); what is proved is the wiring: the chapter is a picker row in the campaign section, its scenario loads, the
 * first objective is the chapter's, A4 starts afloat and A5 airborne. State is read from `__ww2`, never from pixels.
 */
test.setTimeout(240_000)

test('A4 Dumbo in the Gulf: picker row, afloat Catalina at night, the takeoff objective on the HUD, no errors', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/')
  await startCampaignGame(page, { scenario: 'Dumbo in the Gulf', dev: true })
  await waitForScenario(page, 'a4-dumbo-in-the-gulf')
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, { timeout: 90_000 })
  await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.mission()?.objective ?? null), { timeout: 30_000 }).toMatch(/TAKE OFF FROM THE ANCHORAGE/)
  const afloat = await page.evaluate(() => (window as DiagWindow).__ww2!.aircraftPositionM())
  expect(afloat.y).toBeLessThan(6) // on the water, not in the air
  await page.screenshot({ path: 'test-results/f10b-a4.png' })
})

test('A5 Close the Ormoc Lifeline: picker row, airborne over the ridge with the Avengers, the escort station is the first objective', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/')
  await startCampaignGame(page, { scenario: 'Close the Ormoc Lifeline', dev: true })
  await waitForScenario(page, 'a5-close-the-ormoc-lifeline')
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, { timeout: 90_000 })
  await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.mission()?.objective ?? null), { timeout: 30_000 }).toMatch(/HOLD ESCORT STATION/)
  const p = await page.evaluate(() => (window as DiagWindow).__ww2!.aircraftPositionM())
  expect(p.y).toBeGreaterThan(1000)
  await page.screenshot({ path: 'test-results/f10b-a5.png' })
})
