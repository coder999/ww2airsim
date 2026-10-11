import { mkdirSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import { spawnUrl, snapshot, waitForTerrain, type DiagWindow } from './harness.js'
import { withParams } from './views.js'

// M4, main batteries (docs/superpowers/plans/2026-10-10-m4-main-batteries.md): the `gunnery-duel` Dev
// scenario loaded the way a player launches it, captured for Mark's final-product checkpoint: the
// Fletcher's broadside at the muzzle flash and a few seconds later in its smoke, and the Kagero under fire
// a minute in. A capture tool, not a correctness test (the muzzle placement is
// tests/render/fxEvents.test.ts and ship.test.ts): skipped unless E2E_CAPTURE=1. The assertions read the
// wire (`__ww2.combat().mainBattery`), never the picture.
test.skip(process.env.E2E_CAPTURE !== '1', 'capture tool: set E2E_CAPTURE=1')
const OUT = process.env.E2E_CAPTURE_DIR ?? 'test-results/main-battery'
test.setTimeout(240_000)

const launch = (at: { x: number; y: number; z: number } | null, extra: Record<string, string> = {}): string =>
  withParams(at === null ? '/' : spawnUrl(at), { scenario: 'gunnery-duel', launch: '1', aircraft: 'f6f-hellcat', loadout: 'clean', god: '1', cloudTier: 'off', oceanTier: 'high', ...extra })
const mb = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.combat()!.mainBattery)
const fletcher = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.ships().find((s) => s.id === 'dd-allied')!)
const me = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.aircraftPositionM())
/** Pause (the sim and its effects freeze), and take the picture with every page overlay hidden (the pause card,
 *  the HUD and the controls panel), so only the rendered scene shows; then put the overlays back. */
const frozenShot = async (page: Page, path: string): Promise<void> => {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await page.evaluate(() => {
    for (const el of document.body.querySelectorAll<HTMLElement>('*')) {
      if (!(el instanceof HTMLCanvasElement) && el.querySelector('canvas') === null) { el.dataset['m4Vis'] = el.style.visibility; el.style.visibility = 'hidden' }
    }
  })
  await page.waitForTimeout(150)
  await page.screenshot({ path })
  await page.evaluate(() => {
    for (const el of document.body.querySelectorAll<HTMLElement>('[data-m4-vis]')) { el.style.visibility = el.dataset['m4Vis'] ?? ''; delete el.dataset['m4Vis'] }
  })
  await page.keyboard.press('Escape')
}

test('gunnery-duel: the Fletcher fires a broadside, flash then smoke', async ({ page }) => {
  mkdirSync(OUT, { recursive: true })
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)) })
  await page.setViewportSize({ width: 1920, height: 1080 })
  // The DEV spawn flies east at 120 m/s; the Fletcher steams east at 15 knots from (-26000, -38000). Start 1.4 km
  // behind her and 250 m to port (north) at 200 ft, looking to starboard and a little down: abeam about 12 s in.
  await page.goto(launch({ x: -27400, y: 60, z: -38250 }, { look: '-62,-6' }))
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.tick() ?? 0) > 0, undefined, { timeout: 60_000 })
  await page.keyboard.press('Escape') // hold the sim while the terrain arrives
  await waitForTerrain(page)
  await page.keyboard.press('Escape')
  let seen = Math.max(0, ...(await mb(page)).salvosRecent.map((s) => s.tick))
  let shot = false
  for (let i = 0; i < 300 && !shot; i++) {
    await page.waitForTimeout(50)
    const [state, ship, pos] = [await mb(page), await fletcher(page), await me(page)]
    const fresh = state.salvosRecent.filter((s) => s.tick > seen && s.ship === 'dd-allied')
    seen = Math.max(seen, ...state.salvosRecent.map((s) => s.tick))
    if (fresh.length === 0 || Math.abs(pos.x - ship.x) > 250) continue
    // Freeze on the salvo, then let it run on into the smoke.
    await frozenShot(page, `${OUT}/broadside-flash.png`)
    await page.waitForTimeout(2500)
    await frozenShot(page, `${OUT}/broadside-smoke.png`)
    test.info().annotations.push({ type: 'salvo', description: `${fresh.map((s) => s.mount).join(', ')} at tick ${fresh[0]!.tick}` })
    shot = true
  }
  expect(shot, 'a Fletcher salvo while the camera was abeam').toBe(true)
  expect((await mb(page)).on).toBe(true)
  expect((await snapshot(page)).errors).toEqual([])
  expect(errors).toEqual([])
})

test('gunnery-duel: between the lines a minute in, looking at the Kagero under fire', async ({ page }) => {
  mkdirSync(OUT, { recursive: true })
  await page.setViewportSize({ width: 1920, height: 1080 })
  // Heading east at 1,000 ft: a minute in the airplane is half a mile south of the Kagero's track and just astern of her
  // (north is -z: she steams west at z -46000, the Fletcher east at -38000), looking ahead and left at her.
  await page.goto(launch({ x: -23800, y: 300, z: -45200 }, { look: '62,-8' }))
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.tick() ?? 0) > 0, undefined, { timeout: 60_000 })
  await page.keyboard.press('Escape') // hold the sim while the terrain arrives, so the minute is sim time
  await waitForTerrain(page)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(60_000)
  const state = await mb(page)
  expect(state.salvosRecent.length + state.burstsRecent, 'the guns are firing').toBeGreaterThan(0)
  await frozenShot(page, `${OUT}/range-overview.png`)
  test.info().annotations.push({ type: 'hulls', description: state.ships.map((s) => `${s.id} ${s.hp.toFixed(0)} [${s.mountsOut.join(' ')}]`).join('; ') })
})
