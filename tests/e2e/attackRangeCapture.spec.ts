import { mkdirSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { spawnUrl, snapshot, waitForTerrain, type DiagWindow } from './harness.js'
import { withParams } from './views.js'

// E2, attack AI (docs/superpowers/plans/2026-10-10-e2-attack-ai.md): the `attack-range` Dev scenario, loaded the
// way a player launches it, with raiders dive-bombing and torpedoing the anchored destroyer, then captures for a
// human. A capture tool, not a test: skipped unless E2E_CAPTURE=1 (docs/testing.md). Run on the reference GPU.
//
// God mode (`god=1`, a DEV build): the raiders and the destroyer's guns can shoot at the player, who cannot be hurt.
// The assertions read the wire (`__ww2.aircraft()` and `__ww2.ships()`), not the picture: a Val really dived on the
// ship, a Kate really ran in low, and the destroyer really lost hull points.
test.skip(process.env.E2E_CAPTURE !== '1', 'capture tool: set E2E_CAPTURE=1')
const OUT = process.env.E2E_CAPTURE_DIR ?? 'test-results/attack-range'
test.setTimeout(300_000)

const SHIP = { x: -27916, z: -48605 }

test('attack-range: a dive-bombing run and a torpedo run land on the destroyer, and can be seen', async ({ page }) => {
  mkdirSync(OUT, { recursive: true })
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)) })
  await page.setViewportSize({ width: 1920, height: 1080 })
  // 3,000 ft, a mile and a half west of the destroyer and north of its approach lanes, heading east (the DEV spawn
  // always heads east at 120 m/s): the Vals roll in over it and the Kates run in beneath.
  await page.goto(withParams(spawnUrl({ x: SHIP.x - 2600, y: 900, z: SHIP.z - 1800 }), {
    scenario: 'attack-range', launch: '1', aircraft: 'f6f-hellcat', loadout: 'clean', god: '1', cloudTier: 'off', oceanTier: 'high',
  }))
  await waitForTerrain(page)
  const hp0 = (await page.evaluate(() => (window as DiagWindow).__ww2!.ships().find((s) => s.id === 'dd-1')!.hp))
  let minValM = Infinity, minKateM = Infinity, hp = hp0, shots = 0
  const near = (a: { x: number; z: number }) => Math.hypot(a.x - SHIP.x, a.z - SHIP.z)
  for (let i = 0; i < 400 && (i < 240 || shots < 4); i++) {
    await page.waitForTimeout(500)
    const st = await page.evaluate(() => {
      const w = (window as DiagWindow).__ww2!
      return { air: w.aircraft(), hp: w.ships().find((s) => s.id === 'dd-1')!.hp }
    })
    hp = st.hp
    let event = ''
    for (const a of st.air) {
      if (a.id.startsWith('val-') && near(a) < 1500) { minValM = Math.min(minValM, a.y); if (a.y < 1800 && a.y > 300) event = 'dive' }
      if (a.id.startsWith('kate-') && near(a) < 2200) { minKateM = Math.min(minKateM, a.y); if (a.y < 150) event = event || 'run' }
    }
    // A picture when something is happening, at most a dozen, and a steady one now and then.
    if ((event !== '' && shots < 12 && i % 2 === 0) || i % 40 === 0) {
      await page.screenshot({ path: `${OUT}/attack-${String(shots).padStart(2, '0')}-${event || 'view'}-t${i / 2}s.png` })
      shots++
    }
    if (hp < hp0 && minValM < 1800 && minKateM < 150 && shots >= 4) break
  }
  test.info().annotations.push({ type: 'attack', description: `hp ${hp0} -> ${hp}; lowest Val ${minValM.toFixed(0)} m, lowest Kate ${minKateM.toFixed(0)} m` })
  expect(minValM, 'a Val dived on the destroyer').toBeLessThan(1800)
  expect(minKateM, 'a Kate ran in low').toBeLessThan(150)
  expect(hp, 'the destroyer lost hull points').toBeLessThan(hp0)
  expect((await snapshot(page)).errors).toEqual([])
  expect(errors).toEqual([])
})
