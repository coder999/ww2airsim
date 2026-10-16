import { mkdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { debriefDialog, hopClear, landAndStop, quickLaunch, startCampaignGame, stopAtThreshold, waitForScenario, waitForTerrain, type DiagWindow } from './harness.js'

/**
 * F5C final-product checkpoint (2026-10-16): the stop card, the three repositionings (runway, moving carrier deck, water)
 * and the debrief with legs. Pixels are review evidence, not a correctness oracle; `legSortie.spec.ts` is the
 * correctness twin. Run: `npm run capture:e2e -- legCapture.spec.ts`; `E2E_CAPTURE_DIR` selects the output.
 */
test.skip(process.env.E2E_CAPTURE !== '1', 'capture tool: set E2E_CAPTURE=1')
test.setTimeout(420_000)

const OUT = process.env.E2E_CAPTURE_DIR ?? 'test-results/f5c-legs'
const hqOf = (page: import('@playwright/test').Page) => page.getByRole('dialog', { name: 'Headquarters' })

test('the stop card, the runway repositioning and the debrief with two legs', async ({ page }) => {
  mkdirSync(OUT, { recursive: true })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/')
  await startCampaignGame(page, { scenario: 'Airfield Strike' })
  await waitForScenario(page, 'airfield-strike')
  await waitForTerrain(page)
  await stopAtThreshold(page)
  await hopClear(page)
  await landAndStop(page, 'debrief')
  const card = debriefDialog(page)
  await expect(card).toContainText('Stopped at Tacloban')
  await page.screenshot({ path: `${OUT}/01-stop-card-leg-1.png` })

  // Continue with a clean loadout; capture the aircraft the instant it is back on the threshold, facing down the strip.
  await card.getByRole('radiogroup', { name: 'Loadout for the next leg' }).getByRole('radio', { name: 'Clean' }).click()
  await page.screenshot({ path: `${OUT}/02-stop-card-clean-selected.png` })
  await card.getByRole('button', { name: 'Continue Sortie' }).click()
  await expect(card).toBeHidden()
  await page.waitForFunction(() => (window as DiagWindow).__ww2!.combat()!.player.stores.bombs === 0, undefined, { timeout: 10_000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/03-runway-repositioned.png` })

  await hopClear(page)
  await landAndStop(page, 'debrief')
  await expect(card).toContainText('This landing (number 2)')
  await page.screenshot({ path: `${OUT}/04-stop-card-leg-2.png` })
  await card.getByRole('button', { name: 'End Sortie' }).click()
  const hq = hqOf(page)
  await expect(hq.getByText('Air Group Headquarters')).toBeVisible()
  // The Commander's dossier: one log entry, both landings inside it.
  await hq.getByRole('button', { name: /Commander|Dossier/ }).first().click().catch(() => undefined)
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/05-headquarters-after-end-sortie.png` })
  expect(errors).toEqual([])
})

test('the moving carrier deck and the water', async ({ page }) => {
  mkdirSync(OUT, { recursive: true })
  await page.setViewportSize({ width: 1920, height: 1080 })

  await page.goto('/')
  await quickLaunch(page, { scenario: 'deck-quals-mission', aircraft: 'f6f-hellcat', loadout: 'both' })
  await waitForTerrain(page)
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/06-carrier-before-stop.png` })
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.groundStop('clean'))).toBe(true)
  await page.waitForFunction(() => (window as DiagWindow).__ww2!.combat()!.player.stores.bombs === 0, undefined, { timeout: 10_000 })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/07-carrier-launch-spot.png` })
  const a = await page.evaluate(() => (window as DiagWindow).__ww2!.aircraftPositionM())
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${OUT}/08-carrier-three-seconds-later.png` })
  const b = await page.evaluate(() => (window as DiagWindow).__ww2!.aircraftPositionM())
  // The deck is moving and the aircraft is moving with it.
  expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeGreaterThan(10)

  await page.goto('/')
  await quickLaunch(page, { scenario: 'water-quals', aircraft: 'pby-5a-catalina', loadout: 'clean' })
  await waitForTerrain(page)
  await page.waitForTimeout(800)
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.groundStop('clean'))).toBe(true)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/09-water-into-the-wind.png` })
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
})
