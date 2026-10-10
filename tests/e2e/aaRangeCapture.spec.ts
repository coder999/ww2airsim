import { mkdirSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { spawnUrl, snapshot, waitForTerrain, type DiagWindow } from './harness.js'
import { withParams } from './views.js'

// M2, AA fire (docs/superpowers/plans/2026-10-10-m2-aa-fire.md): the `aa-range` Dev scenario and the Range Test
// with every warship shooting, loaded the way a player launches them, then captures for a human. A capture
// tool, not a test: skipped unless E2E_CAPTURE=1 (docs/testing.md). Run on the reference GPU.
//
// All of it in God mode (`god=1`, a DEV build): the guns fire at the player, who cannot be hurt, so a capture
// is not cut short. The assertions read the wire (`__ww2.combat().aa`), not the picture.
test.skip(process.env.E2E_CAPTURE !== '1', 'capture tool: set E2E_CAPTURE=1')
const OUT = process.env.E2E_CAPTURE_DIR ?? 'test-results/aa-range'
test.setTimeout(240_000)

/** The anchored destroyer in `aa-range` and Tacloban's battery (content/scenarios/aa-range.json). */
const SHIP = { x: -27916, z: -48605 }
const BASE = { x: -29666, z: -47605 }

/** `at` null starts where the scenario puts the player; otherwise the DEV spawn override (always heading east at 120 m/s). */
const launch = (scenario: string, at: { x: number; y: number; z: number } | null, extra: Record<string, string> = {}): string =>
  withParams(at === null ? '/' : spawnUrl(at), { scenario, launch: '1', aircraft: 'f6f-hellcat', loadout: 'both', god: '1', cloudTier: 'off', oceanTier: 'high', ...extra })

const aa = (page: import('@playwright/test').Page) => page.evaluate(() => (window as DiagWindow).__ww2!.combat()!.aa)

for (const [name, at, waitMs] of [
  // Low: 300 ft, a mile west of the destroyer, heading east at it. Tracers and the destroyer's puffs, close.
  ['low-1mi', { x: SHIP.x - 1700, y: 100, z: SHIP.z }, 6000],
  // Alongside the hull, 300 ft, a few hundred yards: the light guns at their closest.
  ['low-close', { x: SHIP.x - 700, y: 100, z: SHIP.z + 250 }, 4000],
  // High: the scenario's own start, 2,000 ft and two miles east of the destroyer heading west: only the flak reaches.
  ['high-2mi', null, 14_000],
] as const) {
  test(`aa-range ${name}: the destroyer shoots and it can be seen`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true })
    const errors: string[] = []
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)) })
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.goto(launch('aa-range', at))
    await waitForTerrain(page)
    await page.waitForTimeout(waitMs)
    await page.keyboard.press('Slash')
    await page.waitForTimeout(400)
    const state = await aa(page)
    // The guns have been firing at this airplane; God mode kept it flying.
    expect(state.rounds + state.pendingBursts + state.burstsRecent + state.firing, 'the AA is firing').toBeGreaterThan(0)
    if (name !== 'high-2mi') expect(state.burstsRecent + state.rounds, 'tracers or flak in the air').toBeGreaterThan(0)
    await page.screenshot({ path: `${OUT}/aa-${name}.png` })
    expect((await snapshot(page)).errors).toEqual([])
    expect(errors).toEqual([])
  })
}

test('aa-range: the battery at Tacloban shoots too', async ({ page }) => {
  mkdirSync(OUT, { recursive: true })
  await page.setViewportSize({ width: 1920, height: 1080 })
  // 300 ft over the sea a mile west of the field, heading at it.
  await page.goto(launch('aa-range', { x: BASE.x - 1700, y: 100, z: BASE.z + 30 }, {}))
  await waitForTerrain(page)
  await page.waitForTimeout(5000)
  await page.keyboard.press('Slash')
  await page.waitForTimeout(400)
  const state = await aa(page)
  expect(state.rounds + state.pendingBursts + state.burstsRecent + state.firing).toBeGreaterThan(0)
  await page.screenshot({ path: `${OUT}/aa-battery.png` })
})

test('range-test: every armed warship shoots the player over the anchorage', async ({ page }) => {
  mkdirSync(OUT, { recursive: true })
  await page.setViewportSize({ width: 1920, height: 1080 })
  // Over the middle of the anchored fleet, 300 ft up.
  await page.goto(launch('range-test', { x: BASE.x + 1800, y: 100, z: BASE.z - 600 }))
  await waitForTerrain(page)
  await page.waitForTimeout(6000)
  await page.keyboard.press('Slash')
  await page.waitForTimeout(400)
  const state = await aa(page)
  expect(state.rounds, 'tracers fly').toBeGreaterThan(20)
  await page.screenshot({ path: `${OUT}/range-test-fleet.png` })
})

test('aa-range: a hit and the damage stages, on the airplane that is hit (no God mode)', async ({ page }) => {
  mkdirSync(OUT, { recursive: true })
  await page.setViewportSize({ width: 1920, height: 1080 })
  // A straight 300 ft pass over the destroyer, up to three tries (a pass is hit about three times in four, and usually survives).
  let best = 1
  for (let attempt = 0; attempt < 3 && best > 0.9; attempt++) {
    await page.goto(launch('aa-range', { x: SHIP.x - 1700, y: 100, z: SHIP.z }, { god: '0' }))
    await waitForTerrain(page)
    for (let i = 0; i < 70; i++) {
      await page.waitForTimeout(250)
      const c = await page.evaluate(() => (window as DiagWindow).__ww2!.combat()!)
      if (c.player.structure < best) best = c.player.structure
      if (c.player.structure < 0.9) {
        await page.keyboard.press('Slash')
        await page.screenshot({ path: `${OUT}/aa-hit.png` })
        await page.waitForTimeout(4000)
        await page.screenshot({ path: `${OUT}/aa-after.png` })
        break
      }
      if (c.player.destroyed) break
    }
  }
  test.info().annotations.push({ type: 'structure', description: `lowest structure ${best.toFixed(2)}` })
  expect(best, 'the destroyer hurt the airplane on a pass').toBeLessThan(0.95)
})
