import { mkdirSync } from 'node:fs'
import { test, type Page } from '@playwright/test'
import { spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'
import { withParams } from './views.js'
import { frameStats } from './nightStats.js'

// F6A night renderer (docs/night.md): captures of the night look at fixed sun
// elevations, for a person to read, with the frame statistics night.spec.ts
// asserts on printed beside them. A capture tool: skipped unless E2E_CAPTURE=1
// (docs/testing.md). The nexus 680M is fine for look only.
test.skip(process.env.E2E_CAPTURE !== '1', 'capture tool: set E2E_CAPTURE=1')
const OUT = process.env.E2E_CAPTURE_DIR ?? 'test-results/night'
const EXTRA = process.env.NIGHT_QUERY ?? ''
test.setTimeout(240_000)
const TAC = { x: -29666, z: -47605 }
/** Hours on day 294 at Leyte: sun about -6, -9 and -46 deg (sun.ts; the spec asserts the elevations). */
export const HOURS = [{ name: 'sun-6', hour: 18.33 }, { name: 'sun-9', hour: 18.5 }, { name: 'sun-46', hour: 21 }] as const

export async function heldView(page: Page, url: string): Promise<void> {
  await page.goto(url)
  await waitForTerrain(page)
  await page.waitForTimeout(2500)
}

for (const h of HOURS) {
  test(`capture ${h.name}`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true })
    await page.setViewportSize({ width: 1920, height: 1080 })
    const extra = Object.fromEntries(new URLSearchParams(EXTRA))
    await heldView(page, withParams(spawnUrl({ x: TAC.x, y: 600, z: TAC.z - 6000 }), { timeOfDay: String(h.hour), cloudTier: 'off', ...extra }))
    const png = await page.screenshot({ path: `${OUT}/${h.name}.png` })
    const s = await page.evaluate(() => (window as DiagWindow).__ww2!.sun())
    console.log(h.name, `elev ${s.elevationDeg.toFixed(1)}`, JSON.stringify(await frameStats(page, png)))
  })
}

// The fixed moon (az 250, el 40) for a plane heading 090: 160 deg to the right of the nose = look yaw +200 (left positive).
for (const phase of ['0.7', '0.5', '0.25']) {
  test(`capture moon phase ${phase}`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true })
    await page.setViewportSize({ width: 1920, height: 1080 })
    await heldView(page, withParams(spawnUrl({ x: TAC.x, y: 600, z: TAC.z - 6000 }), { timeOfDay: '21', cloudTier: 'off', look: '200,40', night: `phase:${phase}` }))
    await page.screenshot({ path: `${OUT}/moon-${phase}.png`, clip: { x: 760, y: 340, width: 400, height: 400 } })
    await page.screenshot({ path: `${OUT}/moon-${phase}-wide.png` })
  })
}

const RANGE = { scenario: 'night-range', launch: '1', aircraft: 'f6f-hellcat', loadout: 'clean', cloudTier: 'off' }
/** The night test bed (content/scenarios/night-range.json): every light kind, from the cockpit and from the air. */
const RANGE_VIEWS: readonly { name: string; at?: { x: number; y: number; z: number }; extra?: Record<string, string> }[] = [
  { name: 'range-cockpit' },
  { name: 'range-flare', extra: { look: '-68,30' } },
  { name: 'range-beam', extra: { look: '149,28' } },
  { name: 'range-nav-avenger', extra: { look: '0,8' } },
  { name: 'range-air-hellcat', at: { x: TAC.x + 200, y: 430, z: TAC.z + 350 }, extra: { look: '-10,-3' } },
  { name: 'range-harbor', extra: { look: '-135,1' } },
  { name: 'range-air-south', at: { x: TAC.x - 400, y: 200, z: TAC.z + 2000 }, extra: { look: '90,-5' } },
  { name: 'range-air-over', at: { x: TAC.x - 1200, y: 300, z: TAC.z + 700 }, extra: { look: '0,-4' } },
]
for (const v of RANGE_VIEWS) {
  test(`capture ${v.name}`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true })
    await page.setViewportSize({ width: 1920, height: 1080 })
    const base = v.at === undefined ? '/' : spawnUrl(v.at)
    await heldView(page, withParams(base, { ...RANGE, ...(v.extra ?? {}), ...Object.fromEntries(new URLSearchParams(EXTRA)) }))
    await page.waitForTimeout(3000)
    const png = await page.screenshot({ path: `${OUT}/${v.name}.png` })
    console.log(v.name, JSON.stringify(await frameStats(page, png)))
  })
}

// Mark's report 2026-10-14: the view from the runway centre with the bare spawn query. Lists every light's pixel and distance.
test('capture spawn-runway (lights dump)', async ({ page }) => {
  mkdirSync(OUT, { recursive: true })
  await page.setViewportSize({ width: 1920, height: 1080 })
  await heldView(page, withParams(spawnUrl({ x: TAC.x, y: 4, z: TAC.z }), { ...RANGE, ...Object.fromEntries(new URLSearchParams(EXTRA)) }))
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/spawn-runway.png` })
  const lights = await page.evaluate(() => (window as DiagWindow).__ww2!.lights())
  const near = lights.filter((l) => l.screen !== null && l.lit).sort((a, b) => a.distanceM - b.distanceM).slice(0, 12)
  console.log('LIGHTS', JSON.stringify(near.map((l) => ({ id: l.id, d: Math.round(l.distanceM), x: Math.round(l.screen!.x), y: Math.round(l.screen!.y) }))))
})

/** The panel at night against the same view by day (cockpit dimming, Mark 2026-10-14). Hellcat parked on the runway. */
for (const [name, hour] of [['cockpit-day', '12'], ['cockpit-night', '21']] as const) {
  test(`capture ${name}`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true })
    await page.setViewportSize({ width: 1920, height: 1080 })
    await heldView(page, withParams('/', { ...RANGE, timeOfDay: hour, ...Object.fromEntries(new URLSearchParams(EXTRA)) }))
    for (let i = 0; i < 4 && (await page.evaluate(() => (window as DiagWindow).__ww2!.cameraMode())) !== 'cockpit'; i++) await page.keyboard.press('KeyC')
    await page.waitForTimeout(1200)
    const png = await page.screenshot({ path: `${OUT}/${name}.png` })
    console.log(name, JSON.stringify(await frameStats(page, png, { x: 560, y: 760, w: 800, h: 300 })))
  })
}

/** The three cockpit light steps (J), same view. */
for (const steps of [0, 1, 2]) {
  test(`capture cockpit-step-${steps}`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true })
    await page.setViewportSize({ width: 1920, height: 1080 })
    await heldView(page, withParams('/', { ...RANGE, timeOfDay: '21', ...Object.fromEntries(new URLSearchParams(EXTRA)) }))
    for (let i = 0; i < 4 && (await page.evaluate(() => (window as DiagWindow).__ww2!.cameraMode())) !== 'cockpit'; i++) await page.keyboard.press('KeyC')
    for (let i = 0; i < steps; i++) await page.keyboard.press('KeyJ')
    await page.waitForTimeout(1000)
    await page.screenshot({ path: `${OUT}/cockpit-step-${steps}.png` })
  })
}
