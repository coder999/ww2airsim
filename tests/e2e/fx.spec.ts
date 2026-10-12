import { test, expect, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { debriefDialog, spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'
import { VIEWS, withParams } from './views.js'
import { count, decode, rowStep, warm, white, type Rgba } from './fxPixels.js'
import type { FxStressName } from '../../src/render/fx/stress.js'
import { toLocal } from '../../src/sim/world/projection.js'

/** Effects engine, reference GPU (ordnance-and-effects design §7, E2E).
 *  Captures go to FX_SHOTS_DIR (Task 13 commits them with the handoff). */
const SHOTS = process.env.FX_SHOTS_DIR ?? 'test-results/fx-shots'
test.setTimeout(180_000)
const consoleErrors: string[] = []
test.beforeEach(async ({ page }) => {
  consoleErrors.length = 0
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 400)) })
  page.on('pageerror', (e) => consoleErrors.push(e.message))
  await page.setViewportSize({ width: 2560, height: 1440 })
})
test.afterEach(() => { expect(consoleErrors, consoleErrors.join('\n')).toEqual([]) })

const fx = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.fx())
const stress = (page: Page, name: FxStressName) => page.evaluate((n) => (window as DiagWindow).__ww2!.fxStress(n), name)
const validation = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)
const viewUrl = (name: string): string => VIEWS.find((v) => v.name === name)!.url
async function shot(page: Page, name: string): Promise<Rgba> {
  const png = await page.screenshot()
  mkdirSync(SHOTS, { recursive: true })
  writeFileSync(join(SHOTS, `${name}.png`), png)
  return decode(png)
}
/** Load, settle, shoot, inject `name`, wait, shoot. The anchor is `anchor`'s screen point. */
async function inject(page: Page, url: string, name: FxStressName, waitMs: number, label: string, anchor: string) {
  await page.goto(url)
  await waitForTerrain(page)
  await page.waitForTimeout(3000)
  const before = await shot(page, `${label}-before`)
  const { anchors } = await stress(page, name)
  const a = anchors.find((x) => x.name === anchor)!
  await page.waitForTimeout(waitMs)
  const after = await shot(page, label)
  return { before, after, a }
}

test('boots with the real sheets at the high tier and no validation errors', async ({ page }) => {
  await page.goto('/')
  await waitForTerrain(page)
  expect(await fx(page)).toMatchObject({ tier: 'high', capacity: 4096, sheetsFallback: false })
  expect(await validation(page)).toEqual([])
})

test('a bomb on land draws fire at its point (spec §7)', async ({ page }) => {
  const { before, after, a } = await inject(page, '/', 'bomb-land', 600, 'bomb-land', 'center')
  const was = count(before, a.x, a.y, 250, warm), now = count(after, a.x, a.y, 250, warm)
  console.log(`FX bomb-land warm px: before ${was}, after ${now}, live ${(await fx(page)).live}`)
  expect(now - was).toBeGreaterThan(500)
})

test('a bomb on water raises a white column at its point (spec §7)', async ({ page }) => {
  // Looking west and slightly down puts both the sea and the whole tall column
  // in the metric's window; the default runway view hides it below the frame.
  // Clouds used to contribute 7-20k white pixels to this local splash
  // window. Isolate the effect whose wiring this test owns.
  const { before, after, a } = await inject(page, withParams('/', { look: '-90,-3', cloudTier: 'off' }), 'bomb-water', 1500, 'bomb-water', 'center')
  const was = count(before, a.x, a.y - 60, 100, white), now = count(after, a.x, a.y - 60, 100, white)
  console.log(`FX bomb-water white px: before ${was}, after ${now}`)
  expect(now - was).toBeGreaterThan(2500)
})

test('an air kill draws a fireball in the air (spec §7)', async ({ page }) => {
  const { before, after, a } = await inject(page, viewUrl('low-land-600'), 'air-kill', 500, 'air-kill', 'kill')
  const was = count(before, a.x, a.y, 200, warm), now = count(after, a.x, a.y, 200, warm)
  console.log(`FX air-kill warm px: before ${was}, after ${now}`)
  expect(now - was).toBeGreaterThan(300)
})

test('soft edge: no single-row luminance step where smoke meets the ground (spec §7)', async ({ browser }) => {
  const measure = async (p: Page, url: string, label: string): Promise<number> => {
    const { after, a } = await inject(p, url, 'smoke-base', 2000, label, 'base')
    return rowStep(after, Math.round(a.x - 40), Math.round(a.x + 40), Math.round(a.y - 60), Math.round(a.y + 20))
  }
  // Static TSL graph variants must not overlap in one browser: a second live
  // page can reuse the first page's WebGPU pipeline. Measure sequentially.
  const fresh = async (url: string, label: string): Promise<number> => {
    const context = await browser.newContext({ baseURL: test.info().project.use.baseURL as string, viewport: { width: 2560, height: 1440 } })
    const p = await context.newPage()
    p.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 400)) })
    p.on('pageerror', (e) => consoleErrors.push(e.message))
    const result = await measure(p, url, label)
    await context.close()
    return result
  }
  // The two pages must differ only in the soft-depth switch; a different
  // temporal cloud field otherwise dominates the row-step relationship.
  const soft = await fresh(withParams('/', { look: '-90,-3', cloudTier: 'off' }), 'smoke-base-soft')
  const hard = await fresh(withParams('/', { look: '-90,-3', cloudTier: 'off', fxSoft: 'off' }), 'smoke-base-hard')
  console.log(`FX soft edge: row step p90 soft ${soft.toFixed(1)}, hard ${hard.toFixed(1)} (8-bit luma)`)
  expect(soft).toBeLessThan(0.6 * hard)
})

for (const renderer of ['takram-tsl', 'takram'] as const) {
  test(`cloud ordering (${renderer}): a fireball in front of a cloud keeps its pixels (spec §4.2, §7)`, async ({ page }) => {
    const warmAt = async (url: string, label: string): Promise<number> => {
      const { after, a } = await inject(page, url, 'cloud-fireball', 400, label, 'fireball')
      return count(after, a.x, a.y, 160, warm)
    }
    const photo = withParams('/', { look: '33,39', cloudRenderer: renderer })
    const limited = await warmAt(photo, `cloud-fireball-${renderer}`)
    const unlimited = await warmAt(withParams(photo, { fxCloudLimit: 'off' }), `cloud-fireball-${renderer}-nolimit`)
    const clear = await warmAt(withParams(photo, { cloudTier: 'off' }), `cloud-fireball-${renderer}-clearsky`)
    console.log(`FX cloud ordering ${renderer} warm px: limited ${limited}, no limit ${unlimited}, clear sky ${clear}`)
    // Re-baselined on the RX 6700 XT for the repaired Takram paths on
    // 2026-10-12: TSL retained 0.356-0.412 of clear sky and native retained
    // 0.431. Keep explicit non-vacuity floors as well as the on/off control.
    expect(clear).toBeGreaterThan(200)
    expect(limited).toBeGreaterThan(100)
    expect(limited).toBeGreaterThanOrEqual(0.3 * clear)
    expect(unlimited).toBeLessThan(0.5 * limited) // the control: without the limit the cloud eats the fireball
  })
}

test('the sheets failing to load still boots, and effects fall back to blobs (Review Focus 2)', async ({ page }) => {
  await page.route('**/content/fx/**', (r) => r.abort())
  const { before, after, a } = await inject(page, '/', 'bomb-land', 600, 'fallback-bomb-land', 'center')
  expect((await fx(page)).sheetsFallback).toBe(true)
  expect(count(after, a.x, a.y, 250, warm) - count(before, a.x, a.y, 250, warm)).toBeGreaterThan(200)
  expect(await validation(page)).toEqual([])
  // Chromium reports each deliberately aborted sheet as a resource error.
  // Ignore exactly that browser-owned line in this test, not app/page errors.
  const expected = consoleErrors.filter((m) => m === 'Failed to load resource: net::ERR_FAILED')
  expect(expected.length).toBeGreaterThan(0)
  consoleErrors.splice(0, consoleErrors.length,
    ...consoleErrors.filter((m) => m !== 'Failed to load resource: net::ERR_FAILED'))
})

test('a fatal land contact breaks up while its fuselage bounces, tumbles and slides on render time', async ({ page }) => {
  const inland = toLocal(11.244, 125.0035)
  // A broad inland run east across central Leyte, clear of the shoreline throughout the dive.
  await page.goto(spawnUrl({ x: inland.x - 1000, y: 250, z: inland.z }))
  await waitForTerrain(page)
  await page.keyboard.down('ArrowUp')
  await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.impact()), { timeout: 20_000 })
    .toMatchObject({ surface: 'land', kind: 'destroyed' })
  await page.keyboard.up('ArrowUp')
  await expect.poll(async () => (await fx(page)).live).toBeGreaterThan(10)
  await expect.poll(() => page.evaluate(() => {
    const d = (window as DiagWindow).__ww2!
    const impact = d.impact()
    const drawn = d.renderedPlayerPositionM()
    return impact === null || drawn === null ? 0 : Math.hypot(drawn.x - impact.position.x, drawn.z - impact.position.z)
  }), { timeout: 3000 }).toBeGreaterThan(5)
  // Unit coverage measures tumble, rebound and the small longitudinal crush for both airframe paths.
  // This headed frame is retained for human inspection of the production choreography.
  await shot(page, 'crash-land-breakup')
})

test('a fatal sea crash raises the large crash.water splash, submerges the airframe, and Restart clears both (Rulings R5, Review Focus 3)', async ({ page }) => {
  await page.goto(spawnUrl({ x: 0, y: 120, z: 0 }))
  await waitForTerrain(page)
  await page.keyboard.down('ArrowUp')
  // The debrief follows the crash replay, so the splash has ended by the time it shows: catch it live.
  await expect.poll(async () => (await fx(page)).live, { timeout: 20_000 }).toBeGreaterThan(10)
  await expect.poll(() => page.evaluate(() => {
    const d = (window as DiagWindow).__ww2!
    const impact = d.impact()
    const drawn = d.renderedPlayerPositionM()
    return impact?.kind === 'destroyed' && impact.surface === 'water' && drawn !== null
      ? impact.groundHeightM - drawn.y
      : 0
  }), { timeout: 3000 }).toBeGreaterThan(8)
  await shot(page, 'crash-water')
  await debriefDialog(page).waitFor({ timeout: 20_000 })
  await page.keyboard.up('ArrowUp')
  await page.getByRole('button', { name: 'Restart' }).click()
  await expect(debriefDialog(page)).toBeHidden()
  await expect.poll(async () => (await fx(page)).live, { timeout: 2000 }).toBe(0)
  await expect.poll(() => page.evaluate(() => {
    const d = (window as DiagWindow).__ww2!
    const drawn = d.renderedPlayerPositionM()
    const live = d.aircraftPositionM()
    return drawn === null ? Infinity : Math.abs(drawn.y - live.y)
  })).toBeLessThan(0.1)
})
