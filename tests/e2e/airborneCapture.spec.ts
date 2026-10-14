// tests/e2e/airborneCapture.spec.ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import type { HangarWindow } from '../../src/render/hangar/hooks.js'
import type { CameraPreset } from '../../src/render/hangar/framing.js'

// A capture tool, not a test: the F4R airborne rework (2026-10-14) -- parachute canopies and the
// Ki-57-II windscreen -- in the Hangar, for Mark's eye. Run through
// `E2E_CAPTURE_DIR=<dir> npm run capture:e2e -- airborneCapture.spec.ts`.
test.skip(!process.env.E2E_CAPTURE, 'set E2E_CAPTURE=1 to run the airborne capture')

const OUT = process.env.E2E_CAPTURE_DIR ?? 'test-results/airborne'
const IDS = ['parachuting-person-rig', 'paratrooper-supply-bundle', 'm24-aircraft-parachute-flare', 'ki-57-ii-topsy'] as const
const PRESETS: readonly CameraPreset[] = ['three-quarter', 'side', 'front']

const frames = (page: import('@playwright/test').Page) =>
  page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => r())))))

test('airborne assets in the Hangar', async ({ page }) => {
  mkdirSync(OUT, { recursive: true })
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/hangar.html?bench&dev=1')
  await page.waitForFunction(() => (window as HangarWindow).__hangar !== undefined, undefined, { timeout: 30_000 })
  await page.evaluate(() => (window as HangarWindow).__hangar!.ready)
  await page.evaluate(() => (window as HangarWindow).__hangar!.freeze())
  for (const id of IDS) {
    await page.evaluate((i) => (window as HangarWindow).__hangar!.select(i), id)
    for (const preset of PRESETS) {
      await page.evaluate((c) => (window as HangarWindow).__hangar!.camera(c), preset)
      await frames(page)
      writeFileSync(`${OUT}/${id}-${preset}.png`, await page.locator('#hangar-canvas').screenshot())
    }
  }
  // Windscreen close-ups; the stage lifts the Ki-57 by its 2.3 m gear height.
  await page.evaluate(() => (window as HangarWindow).__hangar!.select('ki-57-ii-topsy'))
  for (const [name, eye] of [['q', [9, 5.0, 7]], ['side', [3.9, 3.6, 9]], ['front', [11, 3.8, 1.5]]] as const) {
    await page.evaluate((e) => (window as HangarWindow).__hangar!.aim(e as [number, number, number], [3.9, 3.2, 0]), eye)
    await frames(page)
    writeFileSync(`${OUT}/ki-57-ii-topsy-windscreen-${name}.png`, await page.locator('#hangar-canvas').screenshot())
  }
  expect(true).toBe(true)
})
