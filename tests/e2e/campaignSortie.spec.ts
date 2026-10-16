import { expect, test, type Page } from '@playwright/test'
import { debriefDialog, diveToSea, startCampaignGame, startGame, waitForScenario, type DiagWindow } from './harness.js'
import { flyPass } from './pilot.js'
import { groundTruthTerrain, rangePass } from '../pilot/rangePass.js'

/**
 * The sortie lifecycle (plan F5B Task 10): a scored sortie banks exactly once with no Continue or Restart, a death
 * archives the pilot and the replacement flies on, Abandon forfeits the whole sortie and returns to Headquarters, and
 * an unscored sortie banks nothing. State is read from `__ww2.campaign()`, never from pixels.
 */
test.setTimeout(300_000)

const campaign = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2?.campaign() ?? null)
const hqOf = (page: Page) => page.getByRole('dialog', { name: 'Headquarters' })

test('a scored sortie that ends in a death banks once: archive, replacement, no Continue, no Restart, back to Headquarters', async ({ page }) => {
  await page.goto('/')
  await startCampaignGame(page, { scenario: 'Convoy Strike' })
  await waitForScenario(page, 'convoy-strike')
  const before = await campaign(page)
  expect(before?.pending).not.toBeNull()
  const pilot = before!.pending!.pilotId

  await diveToSea(page)
  const debrief = debriefDialog(page)
  await expect(debrief).toContainText('Campaign Ledger')
  // The header names what was flown, and for a banked sortie who flew it (Mark, 2026-10-15)
  await expect(debrief.locator('[data-ww2-debrief-heading]')).toContainText(/^Convoy Strike — .+, .+/)
  await expect(debrief.getByRole('button', { name: 'Continue' })).toHaveCount(0)
  await expect(debrief.getByRole('button', { name: 'Restart' })).toHaveCount(0)
  const after = await campaign(page)
  expect(after?.pending).toBeNull()
  expect(after?.human.banked).toBe(1)
  expect(after?.archived).toBe(1)
  expect(after?.live).toHaveLength(5)
  expect(after?.live.map((p) => p.id)).not.toContain(pilot)

  await debrief.getByRole('button', { name: 'Return to Headquarters' }).click()
  const hq = hqOf(page)
  await expect(hq.getByText('Air Group Headquarters')).toBeVisible()
  await expect(hq.getByText('1 lost')).toBeVisible()
  // the same sortie cannot be banked again: nothing is pending, and the numbers do not move
  expect(await campaign(page)).toEqual(after)
})

test('Abandon from the pause screen forfeits the whole sortie: no points, the pilot lives, the denominator counts it', async ({ page }) => {
  await page.goto('/')
  await startCampaignGame(page, { scenario: 'Convoy Strike' })
  await waitForScenario(page, 'convoy-strike')
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.tick() ?? 0) > 30, undefined, { timeout: 60_000 })
  const before = await campaign(page)
  expect(before?.human.sorties).toBe(1)

  await page.keyboard.press('Escape')
  const pause = page.getByRole('dialog', { name: /Mission Paused|Pause/ }).or(page.locator('body'))
  await expect(page.getByRole('button', { name: 'Restart Mission' })).toHaveCount(0) // not offered in a scored sortie
  await page.getByRole('button', { name: 'Abandon Sortie' }).click()
  await expect(page.getByText('Abandon This Sortie?')).toBeVisible()
  await page.getByRole('button', { name: 'Abandon Sortie' }).last().click()
  void pause

  const hq = hqOf(page)
  await expect(hq.getByText('Air Group Headquarters')).toBeVisible()
  const after = await campaign(page)
  expect(after?.pending).toBeNull()
  expect(after?.human).toMatchObject({ points: 0, sorties: 1, banked: 1, abandoned: 1 })
  expect(after?.live.map((p) => p.id)).toEqual(before?.live.map((p) => p.id))
  expect(after?.live.every((p) => p.points === 0)).toBe(true)
})

test('an unscored sortie (Gunnery Range) lands with Continue still offered, returns to Headquarters, and banks nothing', async ({ page }) => {
  await page.goto('/')
  await startGame(page, { scenario: 'Gunnery Range' })
  await waitForScenario(page, 'gunnery-range')
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, { timeout: 30_000 })
  const before = await campaign(page)
  expect(before?.pending).toBeNull()
  expect((await flyPass(page, rangePass('gunnery-range', 'target-1', groundTruthTerrain()))).end).toBe('stopped')
  const debrief = debriefDialog(page)
  await expect(debrief).toContainText('LANDED')
  await expect(debrief.locator('[data-ww2-debrief-heading]')).toHaveText('Gunnery Range')
  await expect(debrief.getByRole('button', { name: 'Continue' })).toBeVisible()
  await expect(debrief.getByText('Campaign Ledger')).toHaveCount(0)
  await debrief.getByRole('button', { name: 'Return to Headquarters' }).click()
  await expect(hqOf(page).getByText('Air Group Headquarters')).toBeVisible()
  expect(await campaign(page)).toEqual(before)
})
