// tests/e2e/f4rGroundCaptures.spec.ts
import { mkdirSync } from 'node:fs'
import { test } from '@playwright/test'
import type { HangarWindow } from '../../src/render/hangar/hooks.js'

/**
 * Capture tool, not a test (docs/testing.md): the f4r-ground review frames of the reworked CCKW, D7 and
 * Type 95 Kurogane at low, eye-level and overhead angles in the Hangar. The D7 also appears with its blade
 * raised and tilted. Skipped unless E2E_CAPTURE=1; writes to E2E_CAPTURE_DIR (default test-results/f4r-ground).
 */
test.skip(process.env['E2E_CAPTURE'] !== '1', 'capture tool: set E2E_CAPTURE=1')

type V3 = readonly [number, number, number]
type View = readonly [string, V3, V3]
type Hangar = NonNullable<HangarWindow['__hangar']>
/** Stage meters, +x forward, y up, z starboard. */
const SHOTS: readonly (readonly [string, readonly View[], (h: Hangar) => void])[] = [
  ['gmc-cckw-353', [
    ['low', [8.6, 0.55, -6.2], [0, 1.1, 0]], ['eye', [0.4, 1.7, -11.5], [0, 1.2, 0]],
    ['overhead', [0.3, 13, -3.2], [0, 0, 0]], ['rear', [-8.6, 1.0, 6.4], [0, 1.2, 0]],
  ], (h) => h.pose({ steer: -0.5 })],
  ['caterpillar-d7-3t', [
    ['low', [5.8, 0.45, -4.4], [0, 0.7, 0]], ['eye', [0.3, 1.7, -8.2], [0, 0.9, 0]],
    ['overhead', [0.3, 9, -2.2], [0, 0, 0]], ['rear', [-5.8, 1.1, 4.6], [0, 0.8, 0]],
    ['blade-raised', [4.0, 0.9, -5.4], [1.0, 0.7, 0]],
  ], () => {}],
  ['type95-kurogane', [
    ['low', [4.9, 0.4, -3.6], [0, 0.7, 0]], ['eye', [0.3, 1.7, -6.8], [0, 0.8, 0]],
    ['overhead', [0.3, 8, -2.0], [0, 0, 0]], ['rear', [-4.9, 1.0, 3.8], [0, 0.8, 0]],
  ], (h) => h.pose({ steer: -0.6 })],
]

test('f4r-ground captures: CCKW, D7 and Type 95 Kurogane', async ({ page }) => {
  test.setTimeout(300_000)
  const out = process.env['E2E_CAPTURE_DIR'] ?? 'test-results/f4r-ground'
  mkdirSync(out, { recursive: true })
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/hangar.html?bench')
  await page.waitForFunction(() => (window as HangarWindow).__hangar !== undefined, undefined, { timeout: 30_000 })
  await page.evaluate(() => (window as HangarWindow).__hangar!.ready)
  await page.evaluate(() => (window as HangarWindow).__hangar!.freeze())
  const settle = () => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => r())))))
  for (const [id, views, pose] of SHOTS) {
    await page.evaluate((i) => (window as HangarWindow).__hangar!.select(i), id)
    await page.evaluate(`(${pose.toString()})(window.__hangar)`)
    for (const [view, eye, target] of views) {
      if (view === 'blade-raised') await page.evaluate(() => (window as HangarWindow).__hangar!.pose({ turretBearingDeg: 10, turretElevationDeg: 24 }))
      await page.evaluate(([e, t]) => (window as HangarWindow).__hangar!.aim(e, t), [eye, target] as const)
      await settle()
      await page.locator('#hangar-canvas').screenshot({ path: `${out}/${id}-${view}.png` })
    }
  }
})
