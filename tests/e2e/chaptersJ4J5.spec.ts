import { expect, test, type Page } from '@playwright/test'
import { debriefDialog, waitForScenario, type DiagWindow } from './harness.js'
import { BINDINGS } from '../../src/input/bindings.js'

/**
 * F10D: the two night chapters, (the batch e2e), and the first browser test of the egress debrief.
 *
 * Launched with the DEV quick launch (`?scenario=<id>&launch`), not through Headquarters: a chapter row is offered only while it is the campaign's CURRENT chapter,
 * and J4 and J5 are reachable there only after J1 to J3 are banked (a fresh Japanese campaign offers J1; the dev campaign did not move it). The Headquarters route
 * and banking are covered by the nine-path matrix at the reducer level; this is the browser half of the egress and the drop key.
 *
 * J4 ends at a western egress gate, not on a landing (F10-0, Decision 9). The sim half is proven headless; this proves the browser half: crossing the gate
 * ends the sortie in the debrief the `egressModel` builds ("CLEARED THE AREA", no Continue). The flight is hands-off
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

test('J4: crossing the western gate ends the sortie in the egress debrief, with no Continue', async ({ page }) => {
  // The gate (content/scenarios/j4-destroyers-in-the-bay.json) is at (-85800, -12900); the Kate spawns east-bound at 120 m/s, 147 s of flight short of it.
  const x = -85800 - 120 * 147
  await page.goto(`/?scenario=j4-destroyers-in-the-bay&launch&spawnX=${x}&spawnY=3500&spawnZ=-12900`)
  await waitForScenario(page, 'j4-destroyers-in-the-bay')
  await skipOpening(page)
  await page.keyboard.press(BINDINGS.toggleTripleTime[0].replace(/^Key/, '').toLowerCase())
  const debrief = debriefDialog(page)
  await expect(debrief).toBeVisible({ timeout: 200_000 })
  await expect(debrief).toContainText('CLEARED THE AREA')
  await expect(debrief.getByRole('button', { name: /Continue/ })).toHaveCount(0)
  // It is the mission's verdict: the transport was kept and the gate crossed, but no torpedo ran, so no badge, and it says which objectives.
  await expect(debrief).toContainText(/Torpedo a destroyer under the flare/i)
})

test('J5: the cargo doors, then Y drops the stick into the world once, and a second press is refused', async ({ page }) => {
  // 3 km west of the strip's centre at 600 m, east-bound: the AI Ki-57s are not near yet (they spawn on the ridge), nothing hostile for 100 s.
  await page.goto('/?scenario=j5-night-drop-on-burauen&launch&spawnX=-43000&spawnY=600&spawnZ=-20000')
  await waitForScenario(page, 'j5-night-drop-on-burauen')
  await skipOpening(page)
  const rigs = () => page.evaluate(() => (window as DiagWindow).__ww2!.parachutists().entities)
  expect(await rigs()).toBe(0)
  // Doors shut: the key drops nothing (its on-screen message rides the autopilot badge, not asserted by text here).
  await page.keyboard.press(BINDINGS.dropCargo[0].replace(/^Key/, '').toLowerCase())
  expect(await rigs()).toBe(0)
  // O opens them (6 s of travel); Y then releases six rigs and two bundles at once.
  // The door lever is edge-read from the held keys each frame: a zero-length tap can fall between two frames (the gear and hook levers say the same), so hold it a moment.
  await page.keyboard.down(BINDINGS.toggleBayDoors[0])
  await page.waitForTimeout(250)
  await page.keyboard.up(BINDINGS.toggleBayDoors[0])
  await page.waitForTimeout(12_000) // 6 s of door travel, on a slow local GPU
  await page.keyboard.press(BINDINGS.dropCargo[0].replace(/^Key/, '').toLowerCase())
  await expect.poll(rigs, { timeout: 10_000 }).toBe(8)
  await page.keyboard.press(BINDINGS.dropCargo[0].replace(/^Key/, '').toLowerCase())
  await page.waitForTimeout(1000)
  expect(await rigs(), 'a second press adds nothing').toBe(8)
})
