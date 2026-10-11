// tests/e2e/blenderDuplicatesCapture.spec.ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import type { HangarWindow } from '../../src/render/hangar/hooks.js'
import type { PartPose } from '../../src/render/hangar/models.js'
import type { CameraPreset } from '../../src/render/hangar/framing.js'

// A capture tool, not a test: a plain E2E run skips it (docs/testing.md, "Philosophy"). Each Blender duplicate
// (docs/blender-aircraft.md) beside the download it copies, in the Hangar: gear down from two views, then the new
// one's gear up. Fixed-gear aircraft repeat that pose deliberately so this stays one fleet-wide review matrix.
// That the gear, propeller and surfaces move is asserted by hangar.spec.ts; this is for Mark's eye.
test.skip(!process.env.E2E_CAPTURE, 'set E2E_CAPTURE=1 to run the duplicate capture')

const OUT = process.env.E2E_CAPTURE_DIR ?? 'test-results/blender-duplicates'
const PAIRS: readonly (readonly [string, string])[] = [
  ['a6m-zero', 'a6m2-zero-blender'],
  ['b-17-flying-fortress', 'b-17-flying-fortress-blender'],
  ['d3a-val', 'd3a-val-blender'],
  ['f4f-wildcat', 'f4f-wildcat-blender'],
  ['f4u-corsair', 'f4u-corsair-blender'],
  ['f6f-hellcat', 'f6f-hellcat-blender'],
  ['ki-43-oscar', 'ki-43-oscar-blender'],
]

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
  // Mark's canopy reviews need the glazing large enough to judge its side
  // silhouette. The normal whole-airframe side capture makes a 0.5 m-tall
  // windscreen only a few pixels high.
  await page.evaluate(() => (window as HangarWindow).__hangar!.select('f6f-hellcat-blender'))
  // The Hellcat's half-span is 6.55 m, so the side camera must remain beyond
  // the wingtip even though its target is the canopy.
  // The stage lifts the model by its 2.42 m gear height, putting the canopy
  // crown near y=3.9 in stage space.
  await page.evaluate(() => (window as HangarWindow).__hangar!.aim([-1.1, 3.7, 9], [-1.1, 3.7, 0]))
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => r())))))
  writeFileSync(`${OUT}/f6f-hellcat-blender-canopy-side.png`, await page.locator('#hangar-canvas').screenshot())
  await page.evaluate(() => (window as HangarWindow).__hangar!.aim([3.4, 3.7, 6.5], [-1.1, 3.7, 0]))
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => r())))))
  writeFileSync(`${OUT}/f6f-hellcat-blender-canopy-three-quarter.png`, await page.locator('#hangar-canvas').screenshot())
  expect(true).toBe(true)
})
