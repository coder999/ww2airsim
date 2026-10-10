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
  // 2,300 ft, five miles west of the destroyer, heading east (the DEV spawn always heads east at 120 m/s): the
  // airplane reaches the anchorage about when the first raids do, and the camera follows it.
  await page.goto(withParams(spawnUrl({ x: SHIP.x - 8000, y: 700, z: SHIP.z + 700 }), {
    scenario: 'attack-range', launch: '1', aircraft: 'f6f-hellcat', loadout: 'clean', god: '1', cloudTier: 'off', oceanTier: 'high',
  }))
  await waitForTerrain(page)
  await page.keyboard.press('Slash') // the controls panel is open at launch: close it for the pictures
  await page.mouse.move(960, 540)
  await page.mouse.down() // held for the whole run: the chase camera looks where the mouse is dragged (0.3 deg a pixel)
  const hp0 = (await page.evaluate(() => (window as DiagWindow).__ww2!.ships().find((s) => s.id === 'dd-1')!.hp))
  let minValM = Infinity, minKateM = Infinity, hp = hp0, shots = 0
  const byEvent: Record<string, number> = {}
  const near = (a: { x: number; z: number }) => Math.hypot(a.x - SHIP.x, a.z - SHIP.z)
  for (let i = 0; i < 400 && i < 300; i++) {
    await page.waitForTimeout(500)
    const st = await page.evaluate(() => {
      const w = (window as DiagWindow).__ww2!
      return { air: w.aircraft(), hp: w.ships().find((s) => s.id === 'dd-1')!.hp }
    })
    hp = st.hp
    let event = ''
    let focus: { x: number; y: number; z: number } | null = null
    const me = st.air.find((a) => a.id === 'f6f-1')!
    const closeToMe = st.air.some((a) => a.id !== 'f6f-1' && Math.hypot(a.x - me.x, a.y - me.y, a.z - me.z) < 2000)
    for (const a of st.air) {
      if (a.id.startsWith('val-') && near(a) < 1500) { minValM = Math.min(minValM, a.y); if (a.y < 1800 && a.y > 300) { event = 'dive'; focus = a } }
      if (a.id.startsWith('kate-') && near(a) < 2200) { minKateM = Math.min(minKateM, a.y); if (a.y < 150) { event = event || 'run'; focus ??= a } }
    }
    // A picture when something is happening, at most a dozen, and a steady one now and then.
    if (focus !== null) {
      // Turn the camera onto the raider (the airplane flies east, compass heading 90; mouse right looks right).
      const f = focus as { x: number; y: number; z: number }
      const bearing = (Math.atan2(f.x - me.x, -(f.z - me.z)) * 180) / Math.PI
      const yaw = ((bearing - (me.headingRad * 180) / Math.PI + 540) % 360) - 180
      const pitch = (Math.atan2(f.y - me.y, Math.hypot(f.x - me.x, f.z - me.z)) * 180) / Math.PI
      await page.mouse.move(960 + yaw / 0.3, 540 - pitch / 0.3, { steps: 4 })
      await page.waitForTimeout(150)
    }
    if ((event !== '' && closeToMe && (byEvent[event] ?? 0) < 6) || i % 60 === 0) {
      byEvent[event] = (byEvent[event] ?? 0) + 1
      await page.screenshot({ path: `${OUT}/attack-${String(shots).padStart(2, '0')}-${event || 'view'}-t${i / 2}s.png` })
      shots++
    }
    if (hp < hp0 && minValM < 1800 && minKateM < 150 && (byEvent['dive'] ?? 0) >= 6 && (byEvent['run'] ?? 0) >= 6) break
  }
  await page.mouse.up()
  test.info().annotations.push({ type: 'attack', description: `hp ${hp0} -> ${hp}; lowest Val ${minValM.toFixed(0)} m, lowest Kate ${minKateM.toFixed(0)} m` })
  expect(minValM, 'a Val dived on the destroyer').toBeLessThan(1800)
  expect(minKateM, 'a Kate ran in low').toBeLessThan(150)
  expect(hp, 'the destroyer lost hull points').toBeLessThan(hp0)
  expect((await snapshot(page)).errors).toEqual([])
  expect(errors).toEqual([])
})
