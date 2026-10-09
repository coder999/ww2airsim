// tests/e2e/shipCaptures.spec.ts
import { mkdirSync, readdirSync } from 'node:fs'
import { test } from '@playwright/test'
import type { HangarWindow } from '../../src/render/hangar/hooks.js'
import type { CameraPreset } from '../../src/render/hangar/framing.js'

/**
 * Capture tool, not a test (docs/testing.md): every ship in the Hangar, still and with every
 * gun mount trained 60 deg and its guns raised to 60% of their top elevation (mid-sweep), for a
 * handoff (Track M, M1; elevation M1b). Skipped unless E2E_CAPTURE=1; writes
 * to E2E_CAPTURE_DIR (default test-results/ship-captures).
 */
test.skip(process.env['E2E_CAPTURE'] !== '1', 'capture tool: set E2E_CAPTURE=1')

test('ship captures: three-quarter and side, at rest and mid-sweep', async ({ page }) => {
  test.setTimeout(300_000)
  const out = process.env['E2E_CAPTURE_DIR'] ?? 'test-results/ship-captures'
  mkdirSync(out, { recursive: true })
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto('/hangar.html?bench')
  await page.waitForFunction(() => (window as HangarWindow).__hangar !== undefined, undefined, { timeout: 30_000 })
  await page.evaluate(() => (window as HangarWindow).__hangar!.ready)
  await page.evaluate(() => (window as HangarWindow).__hangar!.freeze())
  const settle = () => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => r())))))
  for (const id of readdirSync('content/ships').filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort()) {
    await page.evaluate((i) => (window as HangarWindow).__hangar!.select(i), id)
    for (const preset of ['three-quarter', 'side'] as CameraPreset[]) {
      await page.evaluate((c) => (window as HangarWindow).__hangar!.camera(c), preset)
      for (const [label, rad, frac] of [['rest', 0, 0], ['swept', Math.PI / 3, 0.6]] as const) {
        await page.evaluate(([r, f]) => { const h = (window as HangarWindow).__hangar!; h.trainMounts(r); h.elevateMounts(f) }, [rad, frac] as const)
        await settle()
        await page.locator('#hangar-canvas').screenshot({ path: `${out}/${id}-${preset}-${label}.png` })
      }
    }
    await page.evaluate(() => { const h = (window as HangarWindow).__hangar!; h.trainMounts(0); h.elevateMounts(0) })
  }
})

/** M1c: fixed views at one distance for every ship, so a Blender ship sits beside a download at the
 *  same range (stage meters: +x bow, y up, z starboard, origin midships on the waterline). ~1,500 ft is
 *  455 m; the groove is a short final from astern and to port, for a carrier's deck. */
const VIEWS: readonly (readonly [string, readonly [number, number, number], readonly [number, number, number]])[] = [
  ['close', [35, 28, 55], [0, 12, 0]],
  ['side-close', [0, 9, 75], [0, 9, 0]],
  ['deck', [62, 24, 16], [0, 10, 0]],
  ['1500ft', [280, 290, 210], [0, 5, 0]],
  ['groove', [-450, 30, -25], [0, 12, 0]],
]

test('ship views: close, deck and ~1,500 ft at fixed ranges (M1c)', async ({ page }) => {
  test.setTimeout(300_000)
  const out = process.env['E2E_CAPTURE_DIR'] ?? 'test-results/ship-captures'
  mkdirSync(out, { recursive: true })
  const only = (process.env['E2E_SHIPS'] ?? '').split(',').filter(Boolean)
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto('/hangar.html?bench')
  await page.waitForFunction(() => (window as HangarWindow).__hangar !== undefined, undefined, { timeout: 30_000 })
  await page.evaluate(() => (window as HangarWindow).__hangar!.ready)
  await page.evaluate(() => (window as HangarWindow).__hangar!.freeze())
  const settle = () => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => r())))))
  const ids = readdirSync('content/ships').filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort()
  for (const id of ids.filter((i) => only.length === 0 || only.includes(i))) {
    await page.evaluate((i) => (window as HangarWindow).__hangar!.select(i), id)
    for (const [view, eye, target] of VIEWS) {
      if (view === 'groove' && !id.endsWith('-cve') && !id.endsWith('-cv')) continue
      await page.evaluate(([e, t]) => (window as HangarWindow).__hangar!.aim(e, t), [eye, target] as const)
      await settle()
      await page.locator('#hangar-canvas').screenshot({ path: `${out}/${id}-${view}.png` })
    }
  }
})
