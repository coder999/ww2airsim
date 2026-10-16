import { expect, test, type Page } from '@playwright/test'
import { startCampaignGame, startGame, waitForScenario, type DiagWindow } from './harness.js'

/**
 * F6B: the rank gate through the REAL headquarters (Mark 2026-10-15). A new campaign's pilots are all entry rank, so a
 * scored Convoy Strike has no bombsight (`U` does nothing); the Basic Flying tutorial (a Training Ground row) keeps it,
 * and Dev (the checkbox in the same screens) keeps it on the scored mission too. The Lieutenant Commander side of the
 * gate is asserted over the real picker rows in tests/render/hq/sights.test.ts. State is read from `__ww2`, never pixels.
 */
test.setTimeout(240_000)
const marker = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.impactMarker())
async function pressU(page: Page): Promise<void> {
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.tick() ?? 0) > 60, undefined, { timeout: 90_000 })
  await page.keyboard.press('KeyU')
  await page.waitForTimeout(800)
}

test('a rookie on a scored mission has no impact marker: U does nothing', async ({ page }) => {
  await page.goto('/')
  await startCampaignGame(page, { scenario: 'Convoy Strike' })
  await waitForScenario(page, 'convoy-strike')
  await pressU(page)
  expect((await marker(page)).on).toBe(false)
})

test('the Basic Flying tutorial (Training Ground) still teaches U: the same rookie gets the marker', async ({ page }) => {
  await page.goto('/')
  await startGame(page, { scenario: 'Basic Flying', loadout: 'Bombs' })
  await waitForScenario(page, 'tutorial')
  await pressU(page)
  expect((await marker(page)).on).toBe(true)
})

test('Dev inside the same screens opens the sight on the scored mission too', async ({ page }) => {
  await page.goto('/')
  await startCampaignGame(page, { scenario: 'Convoy Strike', dev: true })
  await waitForScenario(page, 'convoy-strike')
  await pressU(page)
  expect((await marker(page)).on).toBe(true)
})
