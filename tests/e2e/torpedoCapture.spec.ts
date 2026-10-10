// tests/e2e/torpedoCapture.spec.ts
import { mkdirSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import { spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'
import { SCENARIO_PARAM } from '../../src/render/spawn.js'

// A capture tool, not a test: a plain E2E run skips it (docs/testing.md, "Philosophy"). D1's viewing
// checkpoint, a flown torpedo attack on the convoy's lead maru: the release, the fall, the run and the hit.
// That a drop runs, breaks up or hits is asserted in Node (tests/sim/weapons/torpedo.test.ts); this is for
// Mark's eye, and it reads the state back so a capture of nothing fails loudly.
test.skip(!process.env.E2E_CAPTURE, 'set E2E_CAPTURE=1 to run the torpedo capture')

const OUT = process.env.CAPTURE_DIR ?? 'test-results/torpedo'
// convoy-strike's maru-1 starts at its first waypoint and steams north (3.9 m/s of its 4.1) through the attack;
// a quick-launch spawn flies east at 120 m/s, so it meets the maru broadside. Each spawn leads the maru north by
// its own attack's length, about 26 s for the Avenger and 35 s for the Kate (measured 2026-10-09).
const SHIP = { x: -84000, z: 22000 }

const tap = async (page: Page, key: string): Promise<void> => { await page.keyboard.down(key); await page.waitForTimeout(120); await page.keyboard.up(key) }
const flight = (page: Page) => page.evaluate(() => {
  const f = (window as DiagWindow).__ww2!.playerFlight()!
  return { x: f.state.position.x, y: f.state.position.y, z: f.state.position.z, vx: f.state.velocity.x, vz: f.state.velocity.z, speed: Math.hypot(f.state.velocity.x, f.state.velocity.y, f.state.velocity.z), doors: f.state.bayDoorFraction }
})
const maru = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.ships().find((s) => s.id === 'maru-1')!)

async function attack(page: Page, id: string, start: { x: number; y: number; z: number }, ready: (f: Awaited<ReturnType<typeof flight>>) => boolean, prep: () => Promise<void>): Promise<void> {
  mkdirSync(OUT, { recursive: true })
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto(`${spawnUrl(start)}&${SCENARIO_PARAM}=convoy-strike&launch&aircraft=${id}&loadout=bombs`)
  await waitForTerrain(page)
  await tap(page, 'KeyI')
  await tap(page, 'Slash')
  const m0 = await maru(page)
  const hp0 = m0.hp
  console.log(`${id}: maru-1 at ${m0.x.toFixed(0)}, ${m0.z.toFixed(0)}; airplane at ${JSON.stringify(await flight(page))}`)
  await prep()
  let last = 0
  await expect.poll(async () => {
    const f = await flight(page)
    if (Date.now() - last > 2000) { last = Date.now(); console.log(`${id}: approaching ${JSON.stringify(f)}`) }
    return ready(f)
  }, { timeout: 60_000, intervals: [50] }).toBe(true)
  await tap(page, 'KeyV')
  console.log(`${id}: released at ${JSON.stringify(await flight(page))}, maru-1 at ${JSON.stringify(await maru(page))}`)
  await page.screenshot({ path: `${OUT}/${id}-1-release.jpg`, type: 'jpeg', quality: 85 })
  // Power back on and a gentle pull, so a gliding Kate climbs away instead of meeting the sea.
  await page.keyboard.down('Equal')
  await page.keyboard.down('ArrowDown')
  await page.waitForTimeout(1200)
  await page.keyboard.up('ArrowDown')
  await page.keyboard.up('Equal')
  await page.screenshot({ path: `${OUT}/${id}-2-falling.jpg`, type: 'jpeg', quality: 85 })
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(1000)
    console.log(`${id}: +${i + 2.2}s torpedoes drawn ${(await page.evaluate(() => (window as DiagWindow).__ww2!.ordnanceView())).torpedoes}`)
  }
  await page.keyboard.down('Numpad0')
  await page.waitForTimeout(3500)
  await page.screenshot({ path: `${OUT}/${id}-3-running.jpg`, type: 'jpeg', quality: 85 })
  await expect.poll(async () => (await maru(page)).hp, { timeout: 90_000, intervals: [100] }).toBeLessThan(hp0)
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/${id}-4-hit.jpg`, type: 'jpeg', quality: 85 })
  await page.keyboard.up('Numpad0')
  console.log(`${id}: maru-1 ${hp0} -> ${(await maru(page)).hp} hp`)
}

test('an Avenger drops its Mk 13 through the bay doors and hits the maru (D1 checkpoint)', async ({ page }) => {
  test.setTimeout(240_000)
  // Doors first (4 s), then the drop 700 m short: the Mk 13 arms after 180 m of water.
  await attack(page, 'tbm-3-avenger', { x: SHIP.x - 1300, y: 60, z: SHIP.z - 100 }, (f) => f.doors === 1 && f.x >= SHIP.x - 700, () => tap(page, 'KeyO'))
})

test('a Kate slows under its torpedo limit and drops its Type 91 into the maru (D1 checkpoint)', async ({ page }) => {
  test.setTimeout(240_000)
  // The Type 91 breaks up above 178 knots: cut the throttle and glide until slow enough and below 330 ft,
  // then drop 750 m short (it arms after 200 m of water).
  await attack(page, 'b5n2-kate', { x: SHIP.x - 1900, y: 110, z: SHIP.z - 200 }, (f) => f.speed < 88 && f.y < 100 && f.x >= SHIP.x - 750, () => tap(page, 'KeyM'))
})
