// tests/e2e/torpedoCapture.spec.ts
import { mkdirSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import { spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'
import { SCENARIO_PARAM } from '../../src/render/spawn.js'
import type { HangarWindow } from '../../src/render/hangar/hooks.js'
import type { PartPose } from '../../src/render/hangar/models.js'
import type { CameraPreset } from '../../src/render/hangar/framing.js'

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

// D3's flown checks (Track D step 3): an Avenger puts one Mk 13 into a convoy-strike ship from close in, then circles
// near it while the flood runs, logging hull points, list and speed every 5 s and capturing the ship as it lists. The
// maru (240 hp) survives one Mk 13 and its flood with 22 hp, listing; the Kagero escort (180 hp) floods and sinks. That
// the numbers are right is asserted in Node (tests/sim/weapons/flooding.test.ts); this is for Mark's eye.
const ship = (page: Page, id: string) => page.evaluate((i) => (window as DiagWindow).__ww2!.ships().find((s) => s.id === i)!, id)

async function flood(page: Page, target: string, tag: string): Promise<void> {
  mkdirSync(OUT, { recursive: true })
  await page.setViewportSize({ width: 1280, height: 800 })
  // Spawn west of the target at its position now, flying east at 60 m (197 ft), and drop 700 m short: the Mk 13
  // falls about 330 m forward, so it enters the water about 370 m out, past its 180 m arming run.
  await page.goto(`${spawnUrl({ x: 0, y: 60, z: 0 })}&${SCENARIO_PARAM}=convoy-strike&launch&aircraft=tbm-3-avenger&loadout=bombs`)
  await waitForTerrain(page)
  const s0 = await ship(page, target)
  // The ship steams north at 4.1 m/s: lead it by the 32 s from spawn to hit (7 s of flight, 3 s falling, 22 s running).
  await page.goto(`${spawnUrl({ x: s0.x - 1500, y: 60, z: s0.z - 4.1 * 32 })}&${SCENARIO_PARAM}=convoy-strike&launch&aircraft=tbm-3-avenger&loadout=bombs`)
  await waitForTerrain(page)
  await tap(page, 'Slash')
  await tap(page, 'KeyO')
  const hp0 = (await ship(page, target)).hp
  await expect.poll(async () => {
    const f = await flight(page)
    return f.doors === 1 && f.x >= (await ship(page, target)).x - 700
  }, { timeout: 60_000, intervals: [50] }).toBe(true)
  await tap(page, 'KeyV')
  console.log(`${tag}: released at ${JSON.stringify(await flight(page))}, ${target} at ${JSON.stringify(await ship(page, target))}`)
  // Climb away a little, then hold a gentle left turn so the ship stays near while it floods.
  await page.keyboard.down('ArrowDown')
  await page.waitForTimeout(900)
  await page.keyboard.up('ArrowDown')
  await expect.poll(async () => (await ship(page, target)).hp, { timeout: 60_000, intervals: [100] }).toBeLessThan(hp0)
  const t0 = Date.now()
  console.log(`${tag}: hit, ${hp0} -> ${(await ship(page, target)).hp} hp`)
  await page.keyboard.down('ArrowLeft')
  await page.waitForTimeout(500)
  await page.keyboard.up('ArrowLeft')
  for (let i = 1; i <= 14; i++) {
    await page.keyboard.down('ArrowDown')
    await page.waitForTimeout(2500)
    await page.keyboard.up('ArrowDown')
    await page.waitForTimeout(2500)
    const s = await ship(page, target)
    const f = await flight(page)
    const d = Math.hypot(s.x - f.x, s.z - f.z)
    console.log(`${tag}: +${((Date.now() - t0) / 1000).toFixed(0)} s  hp ${s.hp.toFixed(1)}  list ${(s.listRad * 180 / Math.PI).toFixed(1)} deg  speed ${(s.speedMps * 1.94384).toFixed(1)} kn  sinking ${s.sinkingFraction.toFixed(2)}  range ${d.toFixed(0)} m  alt ${f.y.toFixed(0)} m`)
    // Look toward the ship: the look keys snap back on release, so hold one through the shot.
    const bearing = Math.atan2(s.x - f.x, -(s.z - f.z))
    const heading = Math.atan2(f.vx, -f.vz)
    const rel = Math.atan2(Math.sin(bearing - heading), Math.cos(bearing - heading))
    const key = Math.abs(rel) > 2.4 ? 'Numpad0' : rel < -0.5 ? 'Numpad4' : rel > 0.5 ? 'Numpad6' : null
    if (key !== null) await page.keyboard.down(key)
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${OUT}/${tag}-flood-${String(i).padStart(2, '0')}.jpg`, type: 'jpeg', quality: 85 })
    if (key !== null) await page.keyboard.up(key)
  }
  // A close pass for the list: a crude bank-to-turn steer at the ship, low, then shots ahead inside 2,000 ft.
  const pose = () => page.evaluate(() => {
    const f = (window as DiagWindow).__ww2!.playerFlight()!.state
    const q = f.attitude
    // Body up (0,1,0) rotated by q, then its sideways lean: the autopilot's own bank measure.
    const ux = 2 * (q.x * q.y - q.w * q.z), uy = 1 - 2 * (q.x * q.x + q.z * q.z), uz = 2 * (q.y * q.z + q.w * q.x)
    const fx = 1 - 2 * (q.y * q.y + q.z * q.z), fz = 2 * (q.x * q.z - q.w * q.y)
    const rightX = -fz, rightZ = fx
    return { x: f.position.x, y: f.position.y, z: f.position.z, vy: f.velocity.y, bank: Math.atan2(ux * rightX + uz * rightZ, uy), vx: f.velocity.x, vz: f.velocity.z }
  })
  const nudge = async (key: string): Promise<void> => { await page.keyboard.down(key); await page.waitForTimeout(70); await page.keyboard.up(key) }
  let shot = 0
  for (let i = 0; i < 600 && shot < 3; i++) {
    const f = await pose()
    const sh = await ship(page, target)
    const rel = Math.atan2(Math.sin(Math.atan2(sh.x - f.x, -(sh.z - f.z)) - Math.atan2(f.vx, -f.vz)), Math.cos(Math.atan2(sh.x - f.x, -(sh.z - f.z)) - Math.atan2(f.vx, -f.vz)))
    const want = Math.max(-0.9, Math.min(0.9, rel * 1.5))
    if (f.bank < want - 0.1) await nudge('ArrowRight')
    else if (f.bank > want + 0.1) await nudge('ArrowLeft')
    if (f.y < 120 || f.vy < -4) await nudge('ArrowDown')
    else if (f.y > 260 && f.vy > -2) await nudge('ArrowUp')
    const d = Math.hypot(sh.x - f.x, sh.z - f.z)
    if (Math.abs(rel) < 0.3 && d < 600 && d > 150) {
      shot++
      await page.screenshot({ path: `${OUT}/${tag}-close-${shot}.jpg`, type: 'jpeg', quality: 90 })
      console.log(`${tag}: close shot ${shot} at ${d.toFixed(0)} m, list ${(sh.listRad * 180 / Math.PI).toFixed(1)} deg, sinking ${sh.sinkingFraction.toFixed(2)}`)
      await page.waitForTimeout(400)
    }
  }
}

test('D3: one Mk 13 floods the maru, which lists and slows but stays afloat', async ({ page }) => {
  test.setTimeout(300_000)
  await flood(page, 'maru-1', 'maru')
})

test('D3: one Mk 13 floods the Kagero escort, which lists and sinks', async ({ page }) => {
  test.setTimeout(300_000)
  await flood(page, 'escort-1', 'kagero')
})

// The two airframes in the Hangar, on its own camera presets: three-quarter views, the Avenger's doors open on its
// Mk 13 and the Kate's torpedo under its belly (from the side, gear up, as check 7b looks), and each one's guns swung.
const HANGAR: readonly (readonly [string, readonly (readonly [string, CameraPreset, PartPose])[]])[] = [
  ['tbm-3-avenger', [['three-quarter', 'three-quarter', {}], ['bay-open', 'side', { bayDoorFraction: 1, gearFraction: 0 }], ['turrets', 'three-quarter', { turretBearingDeg: 120, turretElevationDeg: 25 }]]],
  ['b5n2-kate', [['three-quarter', 'three-quarter', {}], ['torpedo', 'side', { gearFraction: 0 }], ['rear-gun', 'three-quarter', { turretBearingDeg: 20, turretElevationDeg: 20 }]]],
]

test('D1 Hangar captures: the Avenger and the Kate', async ({ page }) => {
  test.setTimeout(180_000)
  mkdirSync(OUT, { recursive: true })
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto('/hangar.html?bench')
  await page.waitForFunction(() => (window as HangarWindow).__hangar !== undefined, undefined, { timeout: 30_000 })
  await page.evaluate(() => (window as HangarWindow).__hangar!.ready)
  await page.evaluate(() => (window as HangarWindow).__hangar!.freeze())
  const settle = () => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => r())))))
  for (const [id, views] of HANGAR) {
    await page.evaluate((i) => (window as HangarWindow).__hangar!.select(i), id)
    for (const [view, preset, pose] of views) {
      await page.evaluate((p) => (window as HangarWindow).__hangar!.pose({ bayDoorFraction: 0, gearFraction: 1, turretBearingDeg: 0, turretElevationDeg: 0, bombs: true, ...p }), pose)
      // Turrets slew at a cosmetic rate: let them get there.
      await page.evaluate(() => (window as HangarWindow).__hangar!.tick(4))
      await page.evaluate((c) => (window as HangarWindow).__hangar!.camera(c), preset)
      await settle()
      await page.locator('#hangar-canvas').screenshot({ path: `${OUT}/${id}-hangar-${view}.png` })
    }
  }
})
