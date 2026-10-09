// tests/e2e/vehicleCaptures.spec.ts
import { mkdirSync } from 'node:fs'
import { test } from '@playwright/test'
import type { HangarWindow } from '../../src/render/hangar/hooks.js'

/**
 * Capture tool, not a test (docs/testing.md): the V1 handoff's frames. The two torpedoes and the
 * Type 98 bomb, the Type 98 on the Zero's racks, the Chi-Ha mid-traverse with its tracks run on
 * between two frames, and the jeep steered left and right. Skipped unless E2E_CAPTURE=1; writes to
 * E2E_CAPTURE_DIR (default test-results/vehicle-captures).
 */
test.skip(process.env['E2E_CAPTURE'] !== '1', 'capture tool: set E2E_CAPTURE=1')

type View = readonly [string, readonly [number, number, number], readonly [number, number, number]]
/** Stage meters, +x forward, y up, z starboard. */
const SHOTS: readonly (readonly [string, readonly View[], (h: NonNullable<HangarWindow['__hangar']>) => void])[] = [
  ['mk13', [['side', [-0.1, 1.2, 8.5], [-0.1, 0.5, 0]], ['tail', [-3.2, 1.0, 1.5], [-1.9, 0.5, 0]]], () => {}],
  ['type91', [['side', [-0.2, 1.3, 10.5], [-0.2, 0.5, 0]], ['tail', [-4.1, 1.0, 1.4], [-2.6, 0.5, 0]]], () => {}],
  ['type98-no25', [['side', [0.8, 1.0, 2.8], [-0.2, 0.4, 0]]], () => {}],
  ['a6m-zero', [['racks', [2.5, -0.4, 6.5], [-0.4, 0.9, 1.5]]], () => {}],
  ['type97-chi-ha', [['traverse', [5.5, 3.2, 5.5], [0, 1.1, 0]], ['tracks', [0.5, 0.8, 5.0], [0, 0.5, 0]]],
    (h) => h.pose({ turretBearingDeg: 50, turretElevationDeg: 12, speedMph: 6 })],
  ['willys-mb-jeep', [['left', [3.6, 2.0, -3.6], [0, 0.7, 0]], ['right', [3.6, 2.0, 3.6], [0, 0.7, 0]], ['driver', [1.6, 1.7, -1.9], [-0.2, 1.0, -0.3]]],
    (h) => h.pose({ steer: -1 })],
]

test('V1 captures: ordnance, the Zero\'s Type 98s, the Chi-Ha and the jeep', async ({ page }) => {
  test.setTimeout(300_000)
  const out = process.env['E2E_CAPTURE_DIR'] ?? 'test-results/vehicle-captures'
  mkdirSync(out, { recursive: true })
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto('/hangar.html?bench')
  await page.waitForFunction(() => (window as HangarWindow).__hangar !== undefined, undefined, { timeout: 30_000 })
  await page.evaluate(() => (window as HangarWindow).__hangar!.ready)
  await page.evaluate(() => (window as HangarWindow).__hangar!.freeze())
  const settle = () => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => r())))))
  for (const [id, views, pose] of SHOTS) {
    await page.evaluate((i) => (window as HangarWindow).__hangar!.select(i), id)
    await page.evaluate(`(${pose.toString()})(window.__hangar)`)
    for (const [view, eye, target] of views) {
      if (id === 'willys-mb-jeep') await page.evaluate((s) => (window as HangarWindow).__hangar!.pose({ steer: s }), view === 'right' ? 1 : -0.6)
      await page.evaluate(([e, t]) => (window as HangarWindow).__hangar!.aim(e, t), [eye, target] as const)
      await settle()
      await page.locator('#hangar-canvas').screenshot({ path: `${out}/${id}-${view}.png` })
      if (id === 'type97-chi-ha' && view === 'tracks') {
        // A second frame half a second on at the held speed: the tread and the wheels have moved.
        await page.evaluate(() => (window as HangarWindow).__hangar!.tick(0.5))
        await settle()
        await page.locator('#hangar-canvas').screenshot({ path: `${out}/${id}-${view}-later.png` })
      }
    }
  }
})
