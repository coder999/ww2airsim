import { expect, test, type Page } from '@playwright/test'
import { debriefDialog, spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'

const TACLOBAN = { x: -29666, z: -47605 }
const DULAG = { x: -31629, z: -16479 }

const bailoutUrl = (at: { readonly x: number; readonly y: number; readonly z: number }): string =>
  `${spawnUrl(at)}&scenario=free-flight&launch=1&cloudTier=off&oceanTier=low`

const bailout = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.bailout())

async function completeBailout(page: Page, at: { readonly x: number; readonly y: number; readonly z: number }): Promise<string> {
  await page.goto(bailoutUrl(at))
  await waitForTerrain(page)
  const aircraftBefore = await page.evaluate(() => (window as DiagWindow).__ww2!.aircraftPositionM())

  await page.keyboard.press('KeyJ')
  await expect.poll(() => bailout(page), { timeout: 10_000 }).toMatchObject({ phase: 'canopy', modelVisible: true })
  const pilot = await bailout(page)
  const aircraftAfter = await page.evaluate(() => (window as DiagWindow).__ww2!.aircraftPositionM())
  expect(pilot).not.toBeNull()
  expect(Math.hypot(aircraftAfter.x - aircraftBefore.x, aircraftAfter.z - aircraftBefore.z)).toBeGreaterThan(20)
  expect(Math.hypot(aircraftAfter.x - pilot!.position.x, aircraftAfter.z - pilot!.position.z)).toBeGreaterThan(5)

  await page.keyboard.press('KeyT')
  await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.timeScale())).toBe(3)
  await debriefDialog(page).waitFor({ timeout: 30_000 })
  return debriefDialog(page).innerText()
}

test('bailing out over friendly Tacloban separates the pilot and resolves rescue', async ({ page }) => {
  const text = await completeBailout(page, { x: TACLOBAN.x - 3_000, y: 180, z: TACLOBAN.z })
  expect(text).toContain('RESCUED')
  expect(await bailout(page)).toMatchObject({ phase: 'down', outcome: 'rescued', surface: 'land' })
})

test('bailing out over enemy Dulag resolves capture', async ({ page }) => {
  const text = await completeBailout(page, { ...DULAG, y: 180 })
  expect(text).toContain('CAPTURED')
  expect(await bailout(page)).toMatchObject({ phase: 'down', outcome: 'captured', surface: 'land' })
})
