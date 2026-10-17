import { expect, test, type Page } from '@playwright/test'
import { debriefDialog, startCampaignGame, waitForScenario, type DiagWindow } from './harness.js'
import { BINDINGS } from '../../src/input/bindings.js'

/**
 * F10D: the two night chapters, through Headquarters (the one e2e per batch), and the first browser test of the egress debrief.
 *
 * J4 ends at a western egress gate, not on a landing (F10-0, Decision 9). The sim half is proven headless; this proves the browser half: crossing the gate
 * ends the sortie in the debrief the `egressModel` builds ("CLEARED THE AREA", no Continue), banked through the campaign. The flight is hands-off
 * (the DEV spawn puts the airplane high and 17.6 km short of the gate at the speed that reaches it as the gate opens at 147 s; triple time makes that 49 s).
 * J5 proves the drop key: doors, `Y`, the stick in the world, the refusal on a second press.
 * Correctness only; the numbers are not a budget.
 */
test.setTimeout(300_000)

const scene = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2?.scene() ?? null)

/** Past the opening scene, if one plays, to the live flight. */
async function skipOpening(page: Page): Promise<void> {
  await page.waitForTimeout(1500)
  if ((await scene(page)) !== null) {
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => (window as DiagWindow).__ww2?.scene() == null, undefined, { timeout: 15_000 })
  }
}

test('J4: crossing the western gate ends the sortie in the egress debrief, with no Continue, banked once', async ({ page }) => {
  // The gate (content/scenarios/j4-destroyers-in-the-bay.json) is at (-85800, -12900); the Kate spawns east-bound at 120 m/s, 147 s of flight short of it.
  const x = -85800 - 120 * 147
  await page.goto(`/?spawnX=${x}&spawnY=3500&spawnZ=-12900`)
  await startCampaignGame(page, { scenario: 'Destroyers in the Bay', faction: 'ja', dev: true })
  await waitForScenario(page, 'j4-destroyers-in-the-bay')
  await skipOpening(page)
  const pending = await page.evaluate(() => (window as DiagWindow).__ww2?.campaign()?.pending ?? null)
  expect(pending, 'a scored chapter sortie is pending').toMatchObject({ missionId: 'j4-destroyers-in-the-bay' })
  await page.keyboard.press(BINDINGS.toggleTripleTime[0].replace(/^Key/, '').toLowerCase())
  const debrief = debriefDialog(page)
  await expect(debrief).toBeVisible({ timeout: 200_000 })
  await expect(debrief).toContainText('CLEARED THE AREA')
  await expect(debrief.getByRole('button', { name: /Continue/ })).toHaveCount(0)
  await expect(debrief.getByRole('button', { name: 'Restart' })).toHaveCount(0)
  // It is the mission's verdict: the transport was kept and the gate crossed, but no torpedo ran, so no badge, and it says which objectives.
  await expect(debrief).toContainText(/Torpedo a destroyer under the flare/i)
  const after = await page.evaluate(() => (window as DiagWindow).__ww2?.campaign() ?? null)
  expect(after?.pending, 'banked: nothing is pending').toBeNull()
  expect(after?.human.banked).toBe(1)
  await debrief.getByRole('button', { name: 'Return to Headquarters' }).click()
  await expect(page.getByRole('dialog', { name: 'Headquarters' }).getByText('Air Group Headquarters')).toBeVisible()
})

test('J5: the cargo doors, then Y drops the stick into the world once, and a second press is refused', async ({ page }) => {
  // 3 km west of the strip's centre at 600 m, east-bound: the AI Ki-57s are not near yet (they spawn on the ridge), nothing hostile for 100 s.
  await page.goto('/?spawnX=-43000&spawnY=600&spawnZ=-20000')
  await startCampaignGame(page, { scenario: 'Night Drop on Burauen', faction: 'ja', dev: true })
  await waitForScenario(page, 'j5-night-drop-on-burauen')
  await skipOpening(page)
  const rigs = () => page.evaluate(() => (window as DiagWindow).__ww2!.parachutists().entities)
  expect(await rigs()).toBe(0)
  // Doors shut: the key says so and drops nothing.
  await page.keyboard.press(BINDINGS.dropCargo[0].replace(/^Key/, '').toLowerCase())
  await expect(page.getByText('OPEN THE CARGO DOORS FIRST (O)')).toBeVisible()
  expect(await rigs()).toBe(0)
  // O opens them (6 s of travel); Y then releases six rigs and two bundles at once.
  await page.keyboard.press(BINDINGS.toggleBayDoors[0].replace(/^Key/, '').toLowerCase())
  await page.waitForTimeout(8000)
  await page.keyboard.press(BINDINGS.dropCargo[0].replace(/^Key/, '').toLowerCase())
  await expect(page.getByText('CARGO AWAY')).toBeVisible()
  expect(await rigs()).toBe(8)
  await page.keyboard.press(BINDINGS.dropCargo[0].replace(/^Key/, '').toLowerCase())
  await expect(page.getByText('CARGO ALREADY AWAY')).toBeVisible()
  expect(await rigs()).toBe(8)
})
