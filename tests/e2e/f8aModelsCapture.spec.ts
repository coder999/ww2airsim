// tests/e2e/f8aModelsCapture.spec.ts
import { mkdirSync } from 'node:fs'
import { test } from '@playwright/test'
import type { HangarWindow } from '../../src/render/hangar/hooks.js'

/**
 * Capture tool, not a test (docs/testing.md): the four F8A Task 0 models (Quonset hut, pontoon pier
 * segment, Jinamoc seaplane ramp, Ormoc customs building) from a low, an eye-level and an overhead
 * view. Skipped unless E2E_CAPTURE=1; writes to E2E_CAPTURE_DIR (default test-results/f8a-models).
 */
test.skip(process.env['E2E_CAPTURE'] !== '1', 'capture tool: set E2E_CAPTURE=1')

type V = readonly [string, readonly [number, number, number], readonly [number, number, number]]
/** Stage meters, +x forward, y up, z toward the viewer. */
const SHOTS: readonly (readonly [string, readonly V[]])[] = [
  ['quonset-hut-20x48', [['low', [9, 1.0, 14], [0, 1.8, 0]], ['eye', [-10, 3.5, -13], [0, 1.8, 0]], ['over', [4, 20, 9], [0, 1.0, 0]]]],
  ['pontoon-pier-segment', [['low', [-6, 2.2, 25], [-3, 0.8, 0]], ['eye', [-13, 3.2, 8], [0, 0.8, 0]], ['over', [3, 20, 8], [0, 0.5, 0]]]],
  ['jinamoc-seaplane-ramp', [['low', [58, 2.0, 24], [8, 2.2, 0]], ['eye', [-52, 11, 28], [0, 2.5, 0]], ['over', [10, 85, 30], [0, 2.0, 0]]]],
  ['ormoc-customs-building', [['low', [17, 1.2, 24], [0, 3.5, 1]], ['eye', [-20, 8, -22], [0, 3.5, 1]], ['over', [9, 38, 22], [0, 2.0, 1]]]],
]

test('F8A model captures: low, eye-level and overhead', async ({ page }) => {
  test.setTimeout(300_000)
  const out = process.env['E2E_CAPTURE_DIR'] ?? 'test-results/f8a-models'
  mkdirSync(out, { recursive: true })
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto('/hangar.html?bench')
  await page.waitForFunction(() => (window as HangarWindow).__hangar !== undefined, undefined, { timeout: 30_000 })
  await page.evaluate(() => (window as HangarWindow).__hangar!.ready)
  await page.evaluate(() => (window as HangarWindow).__hangar!.freeze())
  const settle = () => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => r())))))
  for (const [id, views] of SHOTS) {
    await page.evaluate((i) => (window as HangarWindow).__hangar!.select(i), id)
    for (const [view, eye, target] of views) {
      await page.evaluate(([e, t]) => (window as HangarWindow).__hangar!.aim(e, t), [eye, target] as const)
      await settle()
      await page.locator('#hangar-canvas').screenshot({ path: `${out}/${id}-${view}.png` })
    }
  }
})
