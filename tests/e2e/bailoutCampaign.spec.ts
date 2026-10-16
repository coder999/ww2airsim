import { expect, test, type Page } from '@playwright/test'
import { debriefDialog, spawnUrl, startCampaignGame, waitForScenario, type DiagWindow } from './harness.js'

/**
 * A scored sortie that ends in a bailout (plan F7A Task 4): it banks exactly once through the campaign session, is
 * never a mission success, and its pilot is kept (rescued) or archived as a POW and replaced (captured). State is
 * read from `__ww2.campaign()` and `__ww2.bailout()`, never from pixels.
 */
test.setTimeout(300_000)

const campaign = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2?.campaign() ?? null)
const bailout = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2?.bailout() ?? null)

test('a scored sortie that bails out banks once, with no success, and the pilot is rescued or replaced', async ({ page }) => {
  // The Dev spawn query puts the player 600 ft up over open water, so the descent is a minute of triple time, not nine.
  await page.goto(spawnUrl({ x: 0, y: 180, z: 0 }))
  await startCampaignGame(page, { scenario: 'Convoy Strike' })
  await waitForScenario(page, 'convoy-strike')
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.tick() ?? 0) > 60, undefined, { timeout: 60_000 })
  const before = await campaign(page)
  expect(before?.pending).not.toBeNull()
  const pilot = before!.pending!.pilotId

  await page.keyboard.press('KeyJ')
  await expect.poll(() => bailout(page), { timeout: 10_000 }).toMatchObject({ modelVisible: true })
  await page.keyboard.press('KeyT')
  const debrief = debriefDialog(page)
  await debrief.waitFor({ timeout: 120_000 })
  const jump = await bailout(page)
  expect(jump?.outcome === 'rescued' || jump?.outcome === 'captured' || jump?.outcome === 'killed').toBe(true)

  await expect(debrief).toContainText('Campaign Ledger')
  await expect(debrief.getByRole('button', { name: 'Continue' })).toHaveCount(0)
  const after = await campaign(page)
  expect(after?.pending).toBeNull()
  expect(after?.human.banked).toBe(1)
  expect(after?.live).toHaveLength(5)
  if (jump!.outcome === 'rescued') {
    expect(after?.live.map((p) => p.id)).toContain(pilot)
    expect(after?.archived).toBe(0)
  } else {
    expect(after?.live.map((p) => p.id)).not.toContain(pilot)
    expect(after?.archived).toBe(1)
  }
  // no chapter progress and no badge from any bailout
  await debrief.getByRole('button', { name: 'Return to Headquarters' }).click()
  expect(await campaign(page)).toMatchObject({ pending: null })
})
