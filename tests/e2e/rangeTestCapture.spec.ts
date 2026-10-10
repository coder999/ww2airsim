import { mkdirSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { spawnUrl, snapshot, waitForTerrain, type DiagWindow } from './harness.js'
import { withParams } from './views.js'

// Range Test and God mode (docs/superpowers/plans/2026-10-10-god-mode-range-test.md):
// both missions loaded the way a player launches them, then captures for a
// human. A capture tool, not a test: skipped unless E2E_CAPTURE=1
// (docs/testing.md). Run on the reference GPU.
test.skip(process.env.E2E_CAPTURE !== '1', 'capture tool: set E2E_CAPTURE=1')
const OUT = process.env.E2E_CAPTURE_DIR ?? 'test-results/range-test'
const BASE = { x: -29666, z: -47605 } // Tacloban runway centre
test.setTimeout(240_000)

const PILOTS = [
  { name: 'allied-f6f', aircraft: 'f6f-hellcat', ducks: 7, ships: 7 },
  { name: 'japanese-a6m', aircraft: 'a6m2-zero', ducks: 7, ships: 6 },
] as const

const launch = (aircraft: string, extra: Record<string, string>, at: { x: number; y: number; z: number }): string =>
  withParams(spawnUrl(at), { scenario: 'range-test', launch: '1', aircraft, loadout: 'both', cloudTier: 'off', oceanTier: 'high', ...extra })

for (const p of PILOTS) {
  test(`${p.name}: the right enemies spawn, overhead and offshore`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true })
    const errors: string[] = []
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)) })
    await page.setViewportSize({ width: 1920, height: 1080 })
    for (const [name, at] of [
      ['overview', { x: BASE.x - 600, y: 450, z: BASE.z + 300 }],
      ['high', { x: BASE.x - 3500, y: 1800, z: BASE.z + 1500 }],
    ] as const) {
      await page.goto(launch(p.aircraft, { god: '1' }, at))
      await waitForTerrain(page)
      await page.waitForTimeout(5000)
      await page.keyboard.press('Slash')
      await page.waitForTimeout(600)
      await page.screenshot({ path: `${OUT}/${p.name}-${name}.png` })
    }
    expect((await snapshot(page)).errors).toEqual([])
    expect(errors).toEqual([])

    // The wire, not the picture: who is in the world, on which side, doing what.
    const world = await page.evaluate(() => {
      const d = (window as DiagWindow).__ww2!
      return { aircraft: d.aircraft(), ships: d.ships() }
    })
    const mySide = p.name.startsWith('allied') ? 'allied' : 'axis'
    const ducks = world.aircraft.filter((a) => a.id.startsWith('duck-'))
    expect(ducks, 'every enemy airplane is there').toHaveLength(p.ducks)
    for (const d of ducks) {
      expect(d.side, d.id).not.toBe(mySide)
      expect(d.mode, d.id).toBe('loiter')
      expect(d.targetId, d.id).toBeNull()
      const range = Math.hypot(d.x - BASE.x, d.z - BASE.z)
      expect(range, `${d.id} circles Tacloban`).toBeGreaterThan(1500)
      expect(range, `${d.id} circles Tacloban`).toBeLessThan(3600)
      expect(d.y, `${d.id} stays up`).toBeGreaterThan(400)
    }
    expect(world.ships, 'every enemy ship and the cargo ship').toHaveLength(p.ships)
    expect(world.ships.map((sh) => sh.id)).toContain('ship-type-b-maru')
    for (const sh of world.ships) expect(Math.hypot(sh.x - BASE.x, sh.z - BASE.z), sh.id).toBeLessThan(3000)
  })

  test(`${p.name}: a sitting duck close up`, async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    // The first duck starts on the ring due east of the field and circles counter-clockwise; fly in from the west of it.
    await page.goto(launch(p.aircraft, { god: '1' }, { x: BASE.x + 1700, y: 640, z: BASE.z + 150 }))
    await waitForTerrain(page)
    await page.waitForTimeout(3500)
    await page.keyboard.press('Slash')
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${OUT}/${p.name}-duck.png` })
  })
}

test('god mode: held nose-down into the ground the airplane bounces and keeps flying', async ({ page }) => {
  mkdirSync(OUT, { recursive: true })
  await page.setViewportSize({ width: 1920, height: 1080 })
  // Over the sea east of Tacloban, 90 m up, in a dive: without god mode this ends the flight.
  await page.goto(launch('f6f-hellcat', { god: '1' }, { x: BASE.x + 3500, y: 90, z: BASE.z }))
  await waitForTerrain(page)
  await page.waitForTimeout(2500)
  await page.keyboard.down('s') // pitch down
  const heights: number[] = []
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(250)
    heights.push((await snapshot(page)).position.y)
    if (i === 12) await page.screenshot({ path: `${OUT}/god-bounce-mid.png` })
  }
  await page.keyboard.up('s')
  await page.screenshot({ path: `${OUT}/god-bounce-end.png` })
  const hit = await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)
  expect(hit).toEqual([])
  // Still flying after ten seconds of holding the nose down: never below the sea, never ended.
  expect(Math.min(...heights)).toBeGreaterThan(-5)
  const stopped = await page.evaluate(() => (window as DiagWindow).__ww2!.aircraftPositionM().y)
  expect(stopped).toBeGreaterThan(0)
})
