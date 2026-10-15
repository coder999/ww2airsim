import { expect, test, type Page } from '@playwright/test'
import { spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'
import { withParams } from './views.js'

/**
 * F6B (docs/night.md, "Sights"): the bombsight and torpedosight wiring, read from `__ww2.impactMarker()` (never from
 * pictures). A quick launch is a Dev sortie, so the gate is open by itself (`?sights=` forces it either way); the policy
 * by rank and by picker row is asserted in tests/sim/sortieSights.test.ts.
 */
test.setTimeout(180_000)
const BASE = { x: -29666, z: -47605 } // Tacloban runway centre; the sea east of it
const url = (aircraft: string, loadout: string, y: number, extra: Record<string, string> = {}): string =>
  withParams(spawnUrl({ x: BASE.x + 4000, y, z: BASE.z }), { scenario: 'range-test', launch: '1', aircraft, loadout, cloudTier: 'off', ...extra })

async function open(page: Page, u: string): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto(u)
  await waitForTerrain(page)
  await page.waitForTimeout(1500)
}
const marker = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.impactMarker())

test('Dev: U turns the bombsight on and shows where a bomb lands', async ({ page }) => {
  await open(page, url('f6f-hellcat', 'bombs', 350))
  await page.keyboard.press('KeyU')
  await page.waitForFunction(() => (window as DiagWindow).__ww2!.impactMarker().prediction !== null, undefined, { timeout: 10_000 })
  const m = await marker(page)
  expect(m.on).toBe(true)
  expect(m.label).toMatch(/^BOMBSIGHT \d+\.\d MI/)
  expect(m.torpedo).toBeNull()
})

test('gate closed (?sights=off): U never turns the sight on, and the bombs still release', async ({ page }) => {
  await open(page, url('f6f-hellcat', 'bombs', 350, { sights: 'off' }))
  await page.keyboard.press('KeyU')
  await page.waitForTimeout(800)
  expect((await marker(page)).on).toBe(false)
  const before = await page.evaluate(() => (window as DiagWindow).__ww2!.combat()!.player.stores.bombs)
  await page.keyboard.press('KeyV')
  await page.waitForFunction((n) => (window as DiagWindow).__ww2!.combat()!.player.stores.bombs < n, before, { timeout: 10_000 })
})

test('torpedosight: valid inside the envelope (green, DROP OK), invalid too high (NO DROP: TOO HIGH, with the limit)', async ({ page }) => {
  await open(page, url('tbm-3-avenger', 'bombs', 120))
  await page.keyboard.press('KeyU')
  await page.waitForFunction(() => (window as DiagWindow).__ww2!.impactMarker().torpedo !== null, undefined, { timeout: 10_000 })
  // The Avenger's torpedo rides in the bay: doors shut is a NO DROP reason (as the sim refuses the release), so open them (O).
  expect((await marker(page)).torpedo!.reasons).toContain('doors-shut')
  await page.keyboard.press('KeyO')
  await page.waitForFunction(() => (window as DiagWindow).__ww2!.impactMarker().torpedo?.valid === true, undefined, { timeout: 15_000 })
  const ok = await marker(page)
  expect(ok.torpedo!.valid, JSON.stringify(ok.torpedo!.reasons)).toBe(true)
  expect(ok.label).toMatch(/^TORPEDOSIGHT DROP OK · ENTRY \d+\.\d MI$/)
  expect(ok.shown).toBe(true)
  await open(page, url('tbm-3-avenger', 'bombs', 1200))
  await page.keyboard.press('KeyU')
  await page.keyboard.press('KeyO')
  await page.waitForFunction(() => { const t = (window as DiagWindow).__ww2!.impactMarker().torpedo; return t !== null && !t.reasons.includes('doors-shut') }, undefined, { timeout: 15_000 })
  const bad = await marker(page)
  expect(bad.torpedo!.valid).toBe(false)
  expect(bad.torpedo!.reasons).toContain('too-high')
  expect(bad.label).toContain('NO DROP: TOO HIGH')
  expect(bad.label).toMatch(/\(MAX 2395\)/)
})
