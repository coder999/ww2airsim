import { mkdirSync } from 'node:fs'
import { test, type Page } from '@playwright/test'
import { spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'
import { withParams } from './views.js'

// F6B checkpoint 2 captures: the bombsight and the torpedosight at night over the night bay (five ships, harbor lights,
// a flare), with the sight's verdict printed beside each frame. A capture tool: skipped unless E2E_CAPTURE=1.
test.skip(process.env.E2E_CAPTURE !== '1', 'capture tool: set E2E_CAPTURE=1')
const OUT = process.env.E2E_CAPTURE_DIR ?? 'test-results/night-sights'
test.setTimeout(240_000)
const BAY = { x: -27466, z: -50805 }
const url = (aircraft: string, loadout: string, y: number, extra: Record<string, string> = {}): string =>
  withParams(spawnUrl({ x: BAY.x, y, z: BAY.z }), { scenario: 'night-bay', launch: '1', aircraft, loadout, cloudTier: 'off', ...extra })

async function go(page: Page, u: string): Promise<void> {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto(u)
  await waitForTerrain(page)
  await page.waitForTimeout(2000)
}
async function shot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(800)
  const m = await page.evaluate(() => (window as DiagWindow).__ww2!.impactMarker())
  console.log(name, JSON.stringify({ shown: m.shown, label: m.label, valid: m.torpedo?.valid ?? null, reasons: m.torpedo?.reasons ?? null }))
  await page.screenshot({ path: `${OUT}/${name}.png` })
}

test('bombsight at night', async ({ page }) => {
  mkdirSync(OUT, { recursive: true })
  await go(page, url('f6f-hellcat', 'bombs', 600))
  await page.keyboard.press('KeyU')
  await page.keyboard.down('KeyW'); await page.waitForTimeout(600); await page.keyboard.up('KeyW') // nose down so the ring is in front
  await shot(page, 'bombsight-night')
})
test('torpedosight at night: valid, then too high, then gate closed', async ({ page }) => {
  mkdirSync(OUT, { recursive: true })
  await go(page, url('tbm-3-avenger', 'bombs', 120))
  await page.keyboard.press('KeyO'); await page.keyboard.press('KeyU')
  await page.waitForFunction(() => (window as DiagWindow).__ww2!.impactMarker().torpedo?.valid === true, undefined, { timeout: 20_000 })
  await shot(page, 'torpedosight-valid')
  await go(page, url('tbm-3-avenger', 'bombs', 1200, { look: '0,-28' }))
  await page.keyboard.press('KeyO'); await page.keyboard.press('KeyU')
  await page.waitForFunction(() => { const t = (window as DiagWindow).__ww2!.impactMarker().torpedo; return t !== null && !t.reasons.includes('doors-shut') }, undefined, { timeout: 20_000 })
  await shot(page, 'torpedosight-too-high')
  await go(page, url('tbm-3-avenger', 'bombs', 120, { sights: 'off' }))
  await page.keyboard.press('KeyU')
  await shot(page, 'sights-gate-closed')
})
