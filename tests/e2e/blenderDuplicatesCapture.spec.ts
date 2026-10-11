// tests/e2e/blenderDuplicatesCapture.spec.ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import type { HangarWindow } from '../../src/render/hangar/hooks.js'
import type { PartPose } from '../../src/render/hangar/models.js'
import type { CameraPreset } from '../../src/render/hangar/framing.js'

// A capture tool, not a test: a plain E2E run skips it (docs/testing.md, "Philosophy"). Each Blender duplicate
// (docs/blender-aircraft.md) beside the download it copies, in the Hangar: gear down from two views, then the new
// one's gear up. That the gear, propeller and surfaces move is asserted by hangar.spec.ts; this is for Mark's eye.
test.skip(!process.env.E2E_CAPTURE, 'set E2E_CAPTURE=1 to run the duplicate capture')

const OUT = process.env.E2E_CAPTURE_DIR ?? 'test-results/blender-duplicates'
const PAIRS: readonly (readonly [string, string])[] = [['f6f-hellcat', 'f6f-hellcat-blender'], ['f4u-corsair', 'f4u-corsair-blender'], ['f4f-wildcat', 'f4f-wildcat-blender']]

async function snap(page: Page, id: string, preset: CameraPreset, pose: PartPose, name: string): Promise<void> {
  await page.evaluate((i) => (window as HangarWindow).__hangar!.select(i), id)
  await page.evaluate((c) => (window as HangarWindow).__hangar!.camera(c), preset)
  await page.evaluate((q) => (window as HangarWindow).__hangar!.pose(q), pose)
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => r())))))
  writeFileSync(`${OUT}/${name}.png`, await page.locator('#hangar-canvas').screenshot())
}

test('the Blender duplicates beside their downloads', async ({ page }) => {
  mkdirSync(OUT, { recursive: true })
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/hangar.html?bench')
  await page.waitForFunction(() => (window as HangarWindow).__hangar !== undefined, undefined, { timeout: 30_000 })
  await page.evaluate(() => (window as HangarWindow).__hangar!.ready)
  await page.evaluate(() => (window as HangarWindow).__hangar!.freeze())
  for (const [old, next] of PAIRS) {
    for (const [id, tag] of [[old, 'download'], [next, 'blender']] as const) {
      await snap(page, id, 'three-quarter', { gearFraction: 1 }, `${old}-${tag}-three-quarter`)
      await snap(page, id, 'side', { gearFraction: 1 }, `${old}-${tag}-side`)
    }
    await snap(page, next, 'front', { gearFraction: 1 }, `${old}-blender-front-gear-down`)
    await snap(page, next, 'front', { gearFraction: 0 }, `${old}-blender-front-gear-up`)
    await snap(page, next, 'three-quarter', { gearFraction: 0 }, `${old}-blender-three-quarter-gear-up`)
  }
  expect(true).toBe(true)
})
