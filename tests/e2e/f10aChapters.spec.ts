import { expect, test, type Page } from '@playwright/test'
import { startCampaignGame, waitForScenario, type DiagWindow } from './harness.js'
import { windowsForChapter } from '../../src/campaign/worldStates.js'

/**
 * F10A (2026-10-17): chapters A1, A2 and A3 through the running game. A1 goes from Headquarters (the campaign path: the picker row, the
 * pending sortie, the opening on its own scenario, Esc, then a live flight on the chapter's own mission). A2 and A3 use the DEV entry the
 * F9 specs use, with the windows the campaign would draw (`siteState`), because their rows are locked behind A1 and A2 on a new campaign.
 * Correctness only: the headless suites own the objectives, outcomes and recovery (tests/sim/mission/missions/a[123]-*.test.ts).
 */
test.setTimeout(240_000)

const scene = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2?.scene() ?? null)
const objective = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2?.mission()?.objective ?? null)
const siteState = (chapter: 'A2' | 'A3'): string => Object.entries(windowsForChapter(chapter)).filter(([site]) => ['tacloban', 'dulag'].includes(site)).map(([s, w]) => `${s}:${w}`).join(',')

async function openingThenLive(page: Page, id: string, ticks: number): Promise<void> {
  await page.waitForFunction(() => (window as DiagWindow).__ww2?.scene() != null, undefined, { timeout: 90_000 })
  expect((await scene(page))?.id).toBe(id)
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => (window as DiagWindow).__ww2?.scene() == null, undefined, { timeout: 10_000 })
  const atHandoff = await page.evaluate(() => (window as DiagWindow).__ww2?.tick() ?? 0)
  expect(atHandoff).toBeGreaterThanOrEqual(ticks) // the whole pre-roll is behind us
  await page.waitForFunction((t) => ((window as DiagWindow).__ww2?.tick() ?? 0) > t + 30, atHandoff, { timeout: 30_000 })
}

test('A1 from Headquarters: the chapter row, the pending sortie, its opening on its own scenario, then the mission', async ({ page }) => {
  await page.goto('/')
  await startCampaignGame(page, { scenario: 'A1 · Over the Beaches' })
  await waitForScenario(page, 'a1-over-the-beaches')
  const c = await page.evaluate(() => (window as DiagWindow).__ww2?.campaign() ?? null)
  expect(c?.pending).toMatchObject({ missionId: 'a1-over-the-beaches', chapterId: 'A1', aircraft: 'f6f-hellcat' })
  await openingThenLive(page, 'a1-opening', 18 * 60)
  await expect.poll(() => objective(page)).toMatch(/launch/i) // the first objective on the HUD: the chapter's own mission, not a stand-in
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
})

test('A2 plays its opening on the Samar scenario and goes live (the windows A2 is played in)', async ({ page }) => {
  await page.goto(`/?scenario=a2-taffy-3&launch&scene=a2-opening&siteState=${siteState('A2')}`)
  await openingThenLive(page, 'a2-opening', 15 * 60)
  await expect.poll(() => objective(page)).toMatch(/join the attack/i)
})

test('A3 loads in the world A2 leaves, plays its opening and goes live; the column is on the road', async ({ page }) => {
  await page.goto(`/?scenario=a3-the-long-column&launch&scene=a3-opening&siteState=${siteState('A3')}`)
  await openingThenLive(page, 'a3-opening', 12 * 60)
  await expect.poll(() => objective(page)).toMatch(/find the column/i)
})
