// tests/e2e/surfacesCapture.spec.ts
import { mkdirSync } from 'node:fs'
import { test } from '@playwright/test'
import type { HangarWindow } from '../../src/render/hangar/hooks.js'
import type { PartPose } from '../../src/render/hangar/models.js'
import type { CameraPreset } from '../../src/render/hangar/framing.js'
import { AIRFRAME_RIGS } from '../../src/render/scene/airframeRigs.js'

// A capture tool, not a test: a plain E2E run skips it (docs/testing.md, "Philosophy"). The C1 viewing
// checkpoint: every airframe with control surfaces, on the bench, in four poses. That they move is
// asserted by aircraftRigs.test.ts and hangar.spec.ts check 13; this is for Mark's eye.
test.skip(!process.env.E2E_CAPTURE, 'set E2E_CAPTURE=1 to run the control-surface capture')

const OUT = process.env.CAPTURE_DIR ?? 'test-results/surfaces'
// Each pose from where its surfaces show best: ailerons from ahead, flaps hanging below from the side.
const POSES: readonly [string, CameraPreset, PartPose][] = [
  ['rest', 'three-quarter', { roll: 0, pitch: 0, yaw: 0, flapFraction: 0 }],
  ['roll-right', 'front', { roll: 1, pitch: 0, yaw: 0, flapFraction: 0 }],
  ['pitch-up-yaw-right', 'three-quarter', { roll: 0, pitch: 1, yaw: 1, flapFraction: 0 }],
  ['flaps-down', 'side', { roll: 0, pitch: 0, yaw: 0, flapFraction: 1 }],
]

test('control surfaces on the bench (C1 checkpoint)', async ({ page }) => {
  test.setTimeout(300_000)
  mkdirSync(OUT, { recursive: true })
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto('/hangar.html?bench')
  await page.waitForFunction(() => (window as HangarWindow).__hangar !== undefined, undefined, { timeout: 30_000 })
  await page.evaluate(() => (window as HangarWindow).__hangar!.ready)
  await page.evaluate(() => (window as HangarWindow).__hangar!.freeze())
  // The F4F is drawn by wildcat.ts, not a rig, and has surfaces since C1 batch 2. CAPTURE_IDS narrows the list.
  const all = [...Object.entries(AIRFRAME_RIGS).filter(([, r]) => (r.surfaces ?? []).length > 0).map(([id]) => id), 'f4f-wildcat']
  const ids = process.env.CAPTURE_IDS ? all.filter((id) => process.env.CAPTURE_IDS!.split(',').includes(id)) : all
  for (const id of ids) {
    await page.evaluate((i) => (window as HangarWindow).__hangar!.select(i), id)
    // The details panel takes a column; collapsed, the model gets the width (2026-10-08 layout).
    const collapse = page.getByRole('button', { name: 'Collapse details' })
    if (await collapse.isVisible()) await collapse.click()
    for (const [name, preset, p] of POSES) {
      await page.evaluate((c) => (window as HangarWindow).__hangar!.camera(c), preset)
      await page.evaluate((q) => (window as HangarWindow).__hangar!.pose(q), p)
      await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))))
      await page.locator('#hangar-canvas').screenshot({ path: `${OUT}/${id}-${name}.jpg`, type: 'jpeg', quality: 80 })
    }
  }
})
