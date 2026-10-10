import { mkdirSync, writeFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { waitForTerrain, type DiagWindow } from './harness.js'

// B3, the g-limited pursuit autopilot (docs/superpowers/plans/2026-10-10-b3-pursuit-g-limit.md): the
// Damage Range flown the way the damage stages round 2 handoff flew it, Shift held and Space tapped for
// 0.25 s once a second, read through `__ww2.combat()`. The limit itself is proven headless
// (tests/sim/ai/autoPursuit.test.ts, tests/render/autopilotFrame.test.ts); this shows the browser game
// still lines up and lands hits with it, and that the player's peak load stays inside the F6F's 7.5 g.
// A capture tool, not a test: skipped unless E2E_CAPTURE=1 (docs/testing.md).
test.skip(process.env.E2E_CAPTURE !== '1', 'capture tool: set E2E_CAPTURE=1')
const OUT = process.env.E2E_CAPTURE_DIR ?? 'test-results/pursuit-autopilot'
test.setTimeout(240_000)

test('Damage Range on Shift: taps land, the airframe stays inside its limit', async ({ page }) => {
  mkdirSync(OUT, { recursive: true })
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)) })
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/?scenario=damage-range&launch=1&cloudTier=off')
  await waitForTerrain(page)
  await page.waitForTimeout(2000)
  const combat = () => page.evaluate(() => (window as DiagWindow).__ww2!.combat()!)

  await page.keyboard.down('ShiftLeft')
  await page.waitForTimeout(300)
  await expect(page.getByText('AUTOPILOT · PURSUIT')).toBeVisible()
  const taps: number[] = []
  for (let i = 0; i < 20; i++) {
    const before = (await combat()).player.hits
    await page.keyboard.down('Space')
    await page.waitForTimeout(250)
    await page.keyboard.up('Space')
    await page.waitForTimeout(750)
    taps.push((await combat()).player.hits - before)
    if (i === 1 || i === 5) await page.screenshot({ path: `${OUT}/tap-${i + 1}.png` })
  }
  await page.keyboard.up('ShiftLeft')
  const end = await combat()
  const report = {
    taps,
    burning: end.aircraft.filter((a) => a.burning || a.destroyed).map((a) => a.id),
    peakLoadFactorG: end.player.stress.peakLoadFactorG,
    structure: end.player.structure,
  }
  writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
  expect(taps.reduce((a, b) => a + b, 0), 'Shift lines the guns up').toBeGreaterThan(0)
  expect(report.peakLoadFactorG).toBeLessThanOrEqual(7.5)
  expect(report.structure).toBe(1)
  expect(errors).toEqual([])
})
