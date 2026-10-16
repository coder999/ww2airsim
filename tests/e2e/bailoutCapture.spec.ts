import { mkdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { debriefDialog, spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'

test.skip(process.env.E2E_CAPTURE !== '1', 'capture tool: set E2E_CAPTURE=1')
test.setTimeout(240_000)

const OUT = process.env.E2E_CAPTURE_DIR ?? 'test-results/bailout'
const TACLOBAN = { x: -29666, z: -47605 }
const DULAG = { x: -31629, z: -16479 }
const url = (at: { readonly x: number; readonly y: number; readonly z: number }): string =>
  `${spawnUrl(at)}&scenario=free-flight&launch=1&cloudTier=high&oceanTier=high`

test('collects final bailout, rescue, and capture evidence', async ({ page }) => {
  mkdirSync(OUT, { recursive: true })
  await page.setViewportSize({ width: 1920, height: 1080 })

  await page.goto(url({ x: TACLOBAN.x - 3_000, y: 240, z: TACLOBAN.z }))
  await waitForTerrain(page)
  await page.keyboard.press('KeyJ')
  await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.bailout()), { timeout: 10_000 })
    .toMatchObject({ phase: 'canopy', modelVisible: true })
  await page.screenshot({ path: `${OUT}/01-canopy-over-tacloban.png` })
  await page.waitForTimeout(1_500) // the sway: a second frame of the same descent
  await page.screenshot({ path: `${OUT}/01b-canopy-sway.png` })
  await page.keyboard.press('KeyT')
  await debriefDialog(page).waitFor({ timeout: 60_000 })
  await expect(debriefDialog(page)).toContainText('RESCUED')
  await page.screenshot({ path: `${OUT}/02-rescued-debrief.png` })

  await page.goto(url({ ...DULAG, y: 180 }))
  await waitForTerrain(page)
  await page.keyboard.press('KeyJ')
  await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.bailout()), { timeout: 10_000 })
    .toMatchObject({ phase: 'canopy', modelVisible: true })
  await page.keyboard.press('KeyT')
  await debriefDialog(page).waitFor({ timeout: 60_000 })
  await expect(debriefDialog(page)).toContainText('CAPTURED')
  await page.screenshot({ path: `${OUT}/03-captured-debrief.png` })

  await page.goto(url({ x: 0, y: 180, z: 0 }))
  await waitForTerrain(page)
  await page.keyboard.press('KeyJ')
  await page.keyboard.press('KeyT')
  await debriefDialog(page).waitFor({ timeout: 60_000 })
  await expect(debriefDialog(page)).toContainText('WATER')
  await expect(debriefDialog(page)).toContainText('CAPTURED')
  await page.screenshot({ path: `${OUT}/04-water-no-rescue-debrief.png` })

  await page.goto(url({ x: 0, y: 60, z: 0 }))
  await waitForTerrain(page)
  await page.keyboard.press('KeyJ')
  await debriefDialog(page).waitFor({ timeout: 60_000 })
  await expect(debriefDialog(page)).toContainText('KILLED')
  await page.screenshot({ path: `${OUT}/05-low-altitude-failure.png` })

  await page.goto(url({ x: 0, y: 9, z: 0 }))
  await waitForTerrain(page)
  await page.waitForTimeout(1_500) // let the first frames present: the refusal shot was once a bare sky-blue field
  await page.keyboard.press('KeyJ')
  await expect(page.getByText(/TOO LOW TO BAIL OUT/)).toBeVisible({ timeout: 5_000 })
  await page.screenshot({ path: `${OUT}/06-too-low-refused.png` })
})
