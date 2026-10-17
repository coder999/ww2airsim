import { expect, test, type Page } from '@playwright/test'
import { startCampaignGame, waitForScenario, type DiagWindow } from './harness.js'

/**
 * F10C (2026-10-17): the Japanese chapters J1, J2 and J3 reach the player. J1 goes all the way through Headquarters, the first chapter to do
 * so (the F9 gap in docs/testing.md "Known gaps": the launch-through-Headquarters opening trigger had only ever run on demo scenes): a new
 * Japanese campaign, J1 picked from the campaign section, launched, its opening playing on its own scenario, Esc skipping to the handoff, and
 * the flight live with the sortie pending. J2 and J3 are not open on a new campaign (the chapters unlock in order), so they load through the
 * DEV quick launch with their own opening scene. Correctness only (state read from `__ww2`, never pixels); no budget, no screenshots.
 * Not covered here, on purpose: the egress debrief (needs a flown J2 strike), and any mission outcome (headless: tests/sim/mission/missions).
 */
test.setTimeout(240_000)

const scene = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2?.scene() ?? null)
const tick = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2?.tick() ?? 0)
const campaign = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2?.campaign() ?? null)

async function skipOpening(page: Page, id: string): Promise<void> {
  await page.waitForFunction(() => (window as DiagWindow).__ww2?.scene() != null, undefined, { timeout: 90_000 })
  const playing = await scene(page)
  expect(playing?.id).toBe(id)
  expect(playing!.ticksLeft).toBeGreaterThan(0)
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => (window as DiagWindow).__ww2?.scene() == null, undefined, { timeout: 15_000 })
  const atHandoff = await tick(page)
  expect(atHandoff).toBeGreaterThan(0)
  await page.waitForFunction((t) => ((window as DiagWindow).__ww2?.tick() ?? 0) > t + 30, atHandoff, { timeout: 30_000 })
}

test('J1 Defend the Fields: a new Japanese campaign launches it from Headquarters, its opening plays on its own scenario, and the flight goes live', async ({ page }) => {
  await page.goto('/')
  await startCampaignGame(page, { scenario: 'J1 · Defend the Fields', faction: 'ja' })
  await waitForScenario(page, 'j1-defend-the-fields')
  const c = await campaign(page)
  expect(c?.faction).toBe('ja')
  expect(c?.pending).toMatchObject({ missionId: 'j1-defend-the-fields', aircraft: 'a6m2-zero' })
  await skipOpening(page, 'j1-opening')
  // marked seen on the skip, so a retry of the chapter does not replay it
  expect((await campaign(page))?.scenesSeen).toContain('j1-opening')
  expect((await campaign(page))?.pending).toMatchObject({ missionId: 'j1-defend-the-fields' })
})

for (const [chapter, scenario] of [['j2', 'j2-break-the-landing'], ['j3', 'j3-road-to-burauen']] as const) {
  test(`${chapter.toUpperCase()}: the scenario loads and its opening plays on it, then the flight goes live`, async ({ page }) => {
    await page.goto(`/?scenario=${scenario}&launch&scene=${chapter}-opening`)
    await waitForScenario(page, scenario)
    await skipOpening(page, `${chapter}-opening`)
    expect(await page.evaluate(() => (window as DiagWindow).__ww2?.validationErrors ?? ['no diagnostics'])).toEqual([])
  })
}
