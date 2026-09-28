import { test, expect, type Page } from '@playwright/test'
import { debriefDialog, diveToSea, spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'

/**
 * The orbit camera (spec docs/superpowers/specs/2026-09-27-orbit-camera-design.md)
 * driven by real pointer and wheel events, plus the plan's Review Focus 1-3.
 * The PNGs are for the executing agent to READ, not an appearance assertion.
 */
const TAC = { x: -29666, z: -47605 }
const orbit = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.orbit())

test.setTimeout(90_000)

test('drag, wheel, double-click and the C cycle drive the orbit', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(spawnUrl({ x: TAC.x, y: 1200, z: TAC.z - 8000 }))
  await waitForTerrain(page)
  await page.mouse.move(1280, 720)
  await page.mouse.down()
  await page.mouse.move(1480, 770, { steps: 10 })
  await page.mouse.up()
  await expect.poll(async () => (await orbit(page)).yawRad).toBeGreaterThan(0.5) // 200 px x 0.3 deg = 60 deg
  expect((await orbit(page)).pitchRad).toBeGreaterThan(0.1)
  await page.screenshot({ path: 'test-results/orbit/dragged.png' })

  await page.mouse.wheel(0, 300) // 3 notches out
  await expect.poll(async () => (await orbit(page)).zoom).toBeGreaterThan(1.3)
  await page.screenshot({ path: 'test-results/orbit/zoomed-out.png' })

  // Review Focus 3: Ctrl+wheel is the browser's zoom, not ours.
  const before = (await orbit(page)).zoom
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, 300)
  await page.keyboard.up('Control')
  await page.waitForTimeout(200)
  expect((await orbit(page)).zoom).toBeCloseTo(before, 9)

  await page.mouse.dblclick(1280, 720)
  await expect.poll(async () => (await orbit(page)).zoom).toBe(1)
  expect((await orbit(page)).yawRad).toBe(0)
  await page.screenshot({ path: 'test-results/orbit/default.png' })

  // Spec OC-4: C -> cockpit -> C lands on the default view.
  await page.mouse.move(1280, 720)
  await page.mouse.down()
  await page.mouse.move(1380, 720, { steps: 5 })
  await page.mouse.up()
  await expect.poll(async () => (await orbit(page)).yawRad).toBeGreaterThan(0.2)
  await page.keyboard.press('KeyC')
  await page.keyboard.press('KeyC')
  await expect.poll(async () => (await orbit(page)).yawRad).toBe(0)
})

test('a blur mid-drag ends the drag (Review Focus 2)', async ({ page }) => {
  await page.goto(spawnUrl({ x: TAC.x, y: 1200, z: TAC.z - 8000 }))
  await waitForTerrain(page)
  await page.mouse.move(640, 360)
  await page.mouse.down()
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await page.waitForTimeout(100)
  const held = await orbit(page)
  await page.mouse.move(900, 500, { steps: 5 })
  await page.waitForTimeout(200)
  expect(await orbit(page)).toEqual(held)
  await page.mouse.up()
})

test('a press on the debrief is not a drag (Review Focus 1)', async ({ page }) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto(spawnUrl({ x: TAC.x, y: 600, z: TAC.z - 8000 }))
  await waitForTerrain(page)
  await diveToSea(page) // returns once the crash debrief is visible
  const box = (await debriefDialog(page).boundingBox())!
  const before = await orbit(page)
  // Press inside the dialog, away from its buttons, and drag across the screen.
  // Both the dialog swallowing the press and plan ruling P-3's post-impact
  // gate make this pass; either alone is enough for what the pilot sees.
  await page.mouse.move(box.x + box.width / 2, box.y + 8)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 400, box.y + 200, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(200)
  expect(await orbit(page)).toEqual(before)
})
