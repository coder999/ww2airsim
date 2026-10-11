import { test, expect } from '@playwright/test'
import { percentile, spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'
import { withParams } from './views.js'

// M4: GPU frame time beside the Gunnery Duel's Fletcher while she fires (muzzle flashes and smoke, splashes and
// bursts), against the same scene with every main battery holding fire (DEV `?mainBatteries=off`; the guns still
// lay). A measurement tool, not a test: skipped unless E2E_CAPTURE=1. Run it on the reference GPU under
// `hwlock ryzen-budget` (docs/testing.md) with no `remote-run` job going, MB_VARIANT=live|off interleaved, three each.
test.skip(process.env.E2E_CAPTURE !== '1', 'capture tool: set E2E_CAPTURE=1')
const VARIANT = process.env.MB_VARIANT ?? 'live'
const FT = 0.3048

test.setTimeout(120_000)
test(`gunnery-duel abeam the Fletcher ${VARIANT} #${process.env.MB_REP ?? '0'}`, async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  // 300 ft, 2,000 ft to port of the Fletcher's track and a mile astern, heading east at 120 m/s, looking to starboard.
  await page.goto(withParams(spawnUrl({ x: -27600, y: 300 * FT, z: -38600 }), {
    scenario: 'gunnery-duel', launch: '1', aircraft: 'f6f-hellcat', loadout: 'clean', god: '1', cloudTier: 'off', oceanTier: 'high',
    look: '-60,-6', mainBatteries: VARIANT === 'off' ? 'off' : 'scenario',
  }))
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.tick() ?? 0) > 0, undefined, { timeout: 60_000 })
  await page.keyboard.press('Escape') // hold the sim while the terrain arrives, so every run samples the same stretch
  await waitForTerrain(page)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(9000)
  await page.evaluate(() => { (window as DiagWindow).__ww2!.resetFrameTimes() })
  await page.waitForTimeout(8000)
  const r = await page.evaluate(() => ({
    gpu: (window as DiagWindow).__ww2!.gpuFrameTimesMs(),
    errors: (window as DiagWindow).__ww2!.validationErrors,
    mb: (window as DiagWindow).__ww2!.combat()!.mainBattery,
  }))
  expect(r.gpu.length, 'no GPU timestamp samples').toBeGreaterThan(120)
  console.log(`MBTIME ${VARIANT} #${process.env.MB_REP ?? '0'} gpu p50 ${percentile(r.gpu, 0.5).toFixed(3)} p95 ${percentile(r.gpu, 0.95).toFixed(3)} ms over ${r.gpu.length}, salvos in ring ${r.mb.salvosRecent.length}, bursts ${r.mb.burstsRecent}`)
  expect(r.errors).toEqual([])
  if (VARIANT === 'off') expect(r.mb.on).toBe(false)
  else expect(r.mb.salvosRecent.length).toBeGreaterThan(0)
})
