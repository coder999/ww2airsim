import { mkdirSync } from 'node:fs'
import { test } from '@playwright/test'
import { debriefDialog, spawnUrl, waitForTerrain } from './harness.js'

test.skip(process.env.E2E_CAPTURE !== '1', 'capture tool: set E2E_CAPTURE=1')
test.setTimeout(240_000)

const OUT = process.env.E2E_CAPTURE_DIR ?? 'test-results/paradrop'
const TACLOBAN = { x: -29666, z: -47605 }
const CARRIER = { x: -9084, z: -28558 }

/** F7B evidence: J5's worst case (18 men + 6 bundles) under canopy, and a pilot rescued from the water. DEV-only `?paradrop`. */
test('collects the pooled canopies and the water-rescue pickup', async ({ page }) => {
  mkdirSync(OUT, { recursive: true })
  await page.setViewportSize({ width: 1920, height: 1080 })

  await page.goto(`${spawnUrl({ x: TACLOBAN.x - 3_000, y: 300, z: TACLOBAN.z })}&scenario=free-flight&launch=1&paradrop=18,6`)
  await waitForTerrain(page)
  await page.waitForTimeout(5_000) // the drop is at 2 s; by now every canopy is open
  await page.keyboard.down('Numpad0') // look back: the stick trails the aircraft, behind the chase camera
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/01-stick-18-men-6-bundles.png` })
  await page.waitForTimeout(6_000)
  await page.screenshot({ path: `${OUT}/02-stick-descending.png` })
  await page.keyboard.up('Numpad0')

  await page.goto(`${spawnUrl({ x: CARRIER.x + 2_000, y: 200, z: CARRIER.z })}&scenario=deck-quals&launch=1`)
  await waitForTerrain(page)
  await page.keyboard.press('KeyJ')
  await debriefDialog(page).waitFor({ timeout: 60_000 })
  // The launch comes in on a wall clock behind the debrief; hide the dialog so the shots show the water.
  await debriefDialog(page).evaluate((el) => { (el.parentElement ?? el).style.visibility = 'hidden' })
  // The pickup runs on a wall clock (about 19 s in, 8 s alongside, 20 s out) and a screenshot takes a while, so
  // shoot on a fixed cadence and name each frame by elapsed seconds; the handoff picks the telling ones.
  const started = Date.now()
  for (let i = 0; i < 16; i++) {
    const seconds = Math.round((Date.now() - started) / 1000)
    await page.screenshot({ path: `${OUT}/rescue-${String(seconds).padStart(2, '0')}s.png` })
    await page.waitForTimeout(2_000)
  }
})
