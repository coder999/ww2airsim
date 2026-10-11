import { mkdirSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { snapshot, waitForTerrain, type DiagWindow } from './harness.js'
import { withParams } from './views.js'

// E3, bombers and gunners (docs/superpowers/plans/2026-10-10-e3-bombers-gunners.md): the Bomber Range loaded the
// way a player launches it, in God mode, for a human to look at. A capture tool, not a test: skipped unless
// E2E_CAPTURE=1 (docs/testing.md). Run on the reference GPU.
//
// The player starts 1,970 yd behind the formation at 120 m/s and closes at about 67 mph without touching the
// stick: the sloppy dead-astern approach the gunners punish. The assertions read the wire (`__ww2.combat()`).
test.skip(process.env.E2E_CAPTURE !== '1', 'capture tool: set E2E_CAPTURE=1')
const OUT = process.env.E2E_CAPTURE_DIR ?? 'test-results/bomber-range'
test.setTimeout(240_000)

const combat = (page: import('@playwright/test').Page) => page.evaluate(() => (window as DiagWindow).__ww2!.combat()!)

test('bomber-range: the formation flies together and its gunners shoot back', async ({ page }) => {
  mkdirSync(OUT, { recursive: true })
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)) })
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto(withParams('/', { scenario: 'bomber-range', launch: '1', aircraft: 'f6f-hellcat', god: '1', cloudTier: 'off' }))
  await waitForTerrain(page)
  await page.waitForTimeout(8000)
  await page.keyboard.press('Slash') // hide the controls panel
  await page.screenshot({ path: `${OUT}/formation-ahead.png` })
  let fired = 0, seenRounds = 0
  for (let k = 0; k < 40; k++) {
    await page.waitForTimeout(1500)
    const c = await combat(page)
    fired = Object.values(c.gunners.salvos).reduce((a, n) => a + n, 0)
    seenRounds = Math.max(seenRounds, c.gunners.rounds)
    if (c.gunners.rounds > 0 && k % 3 === 0) await page.screenshot({ path: `${OUT}/gunners-${k}.png` })
  }
  // Wingmen still in the air with their leader.
  const ai = await page.evaluate(() => (window as DiagWindow).__ww2!.aircraft())
  for (const id of ['superfort-1', 'betty-1', 'sally-1']) expect(ai.find((a) => a.id === id)?.mode, id).toBe('formation')
  expect(fired, 'gunner salvos').toBeGreaterThan(50)
  expect(seenRounds, 'gunner rounds in the air').toBeGreaterThan(0)
  test.info().annotations.push({ type: 'gunners', description: `salvos ${fired}, most rounds in the air ${seenRounds}` })
  expect((await snapshot(page)).errors).toEqual([])
  expect(errors).toEqual([])
})
