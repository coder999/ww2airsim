// tests/e2e/f4rMaritimeCapture.spec.ts
import { mkdirSync } from 'node:fs'
import { test } from '@playwright/test'
import type { HangarWindow } from '../../src/render/hangar/hooks.js'

/**
 * Capture tool, not a test (docs/testing.md): the F4R maritime rework. The four rebuilt models (LCVP,
 * 63-foot rescue boat, Type A-3 raft, Suluan lighthouse) from a low, an eye-level and an overhead view,
 * plus the LCVP's ramp lowered and the rescue boat's rudders over. Skipped unless E2E_CAPTURE=1; writes
 * to E2E_CAPTURE_DIR (default test-results/f4r-maritime).
 */
test.skip(process.env['E2E_CAPTURE'] !== '1', 'capture tool: set E2E_CAPTURE=1')

type V = readonly [string, readonly [number, number, number], readonly [number, number, number]]
/** Stage meters, +x forward, y up, z starboard. */
const SHOTS: readonly (readonly [string, readonly V[], object])[] = [
  ['lcvp', [['low', [9.5, 0.6, 7.5], [0, 1.0, 0]], ['eye', [-11, 3.2, 9], [0, 1.0, 0]], ['over', [-1.5, 15, 5], [0, 0.4, 0]]], {}],
  ['lcvp', [['ramp-down', [9.5, 2.2, 7.0], [1.5, 0.8, 0]]], { turretElevationDeg: -90 }],
  ['usaaf-63ft-rescue-boat', [['low', [17, 0.8, 14], [0, 1.6, 0]], ['eye', [-20, 5.5, 14], [0, 1.8, 0]], ['over', [-2, 26, 9], [0, 1.0, 0]]], {}],
  ['usaaf-63ft-rescue-boat', [['stern-rudders', [-17, 2.2, 6.5], [-8, 0.6, 0]]], { steer: 1, speedMph: 8 }],
  ['type-a3-life-raft-survivors', [['low', [3.2, 0.5, 2.6], [0, 0.4, 0]], ['eye', [-3.2, 1.9, 2.8], [0, 0.4, 0]], ['over', [-0.6, 4.6, 1.8], [0, 0.2, 0]]], {}],
  ['suluan-damaged-lighthouse', [['low', [17, 0.8, 15], [0, 6.2, 0]], ['eye', [-17, 7, 21], [0, 6.0, 0]], ['over', [-4, 34, 9], [0, 5.0, 0]]], {}],
]

test('F4R maritime captures: low, eye-level and overhead', async ({ page }) => {
  test.setTimeout(300_000)
  const out = process.env['E2E_CAPTURE_DIR'] ?? 'test-results/f4r-maritime'
  mkdirSync(out, { recursive: true })
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto('/hangar.html?bench')
  await page.waitForFunction(() => (window as HangarWindow).__hangar !== undefined, undefined, { timeout: 30_000 })
  await page.evaluate(() => (window as HangarWindow).__hangar!.ready)
  await page.evaluate(() => (window as HangarWindow).__hangar!.freeze())
  const settle = () => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => r())))))
  for (const [id, views, pose] of SHOTS) {
    await page.evaluate((i) => (window as HangarWindow).__hangar!.select(i), id)
    await page.evaluate((p) => (window as HangarWindow).__hangar!.pose(p), pose)
    for (const [view, eye, target] of views) {
      await page.evaluate(([e, t]) => (window as HangarWindow).__hangar!.aim(e, t), [eye, target] as const)
      await settle()
      await page.locator('#hangar-canvas').screenshot({ path: `${out}/${id}-${view}.png` })
    }
  }
})
