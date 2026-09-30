import { test, expect, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { debriefDialog, spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'
import { VIEWS, withParams } from './views.js'
import { count, decode, rowStep, warm, white, type Rgba } from './fxPixels.js'
import type { FxStressName } from '../../src/render/fx/stress.js'

/** Effects engine, reference GPU (ordnance-and-effects design §7, Tier 2).
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
  const { before, after, a } = await inject(page, withParams('/', { look: '-90,-3' }), 'bomb-water', 1500, 'bomb-water', 'center')
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
  const soft = await fresh(withParams('/', { look: '-90,-3' }), 'smoke-base-soft')
  const hard = await fresh(withParams('/', { look: '-90,-3', fxSoft: 'off' }), 'smoke-base-hard')
  console.log(`FX soft edge: row step p90 soft ${soft.toFixed(1)}, hard ${hard.toFixed(1)} (8-bit luma)`)
  expect(soft).toBeLessThan(0.6 * hard)
})

test('cloud ordering: a fireball in front of a cloud keeps its pixels (spec §4.2, §7)', async ({ page }) => {
  const warmAt = async (url: string, label: string): Promise<number> => {
    const { after, a } = await inject(page, url, 'cloud-fireball', 400, label, 'fireball')
    return count(after, a.x, a.y, 160, warm)
  }
  const photo = withParams('/', { look: '33,39' })
  const limited = await warmAt(photo, 'cloud-fireball')
  const unlimited = await warmAt(withParams(photo, { fxCloudLimit: 'off' }), 'cloud-fireball-nolimit')
  const clear = await warmAt(withParams(photo, { cloudTier: 'off' }), 'cloud-fireball-clearsky')
  console.log(`FX cloud ordering warm px: limited ${limited}, no limit ${unlimited}, clear sky ${clear}`)
  // 0.4, not E1's 0.5: the baked fireball measured 0.44 and 0.43 of clear sky on 2026-09-28 (plan E2
  // Task 10, Mark's ruling). The control below still proves the limit is what keeps the fireball.
  expect(limited).toBeGreaterThanOrEqual(0.4 * clear)
  expect(unlimited).toBeLessThan(0.5 * limited) // the control: without the limit the cloud eats the fireball
})

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

test('a crash into the sea fires crash.water, and Restart clears every effect (Rulings R5, Review Focus 3)', async ({ page }) => {
  await page.goto(spawnUrl({ x: 0, y: 120, z: 0 }))
  await waitForTerrain(page)
  await page.keyboard.down('ArrowUp')
  // The debrief follows the crash replay, so the splash has ended by the time it shows: catch it live.
  await expect.poll(async () => (await fx(page)).live, { timeout: 20_000 }).toBeGreaterThan(10)
  await shot(page, 'crash-water')
  await debriefDialog(page).waitFor({ timeout: 20_000 })
  await page.keyboard.up('ArrowUp')
  await page.getByRole('button', { name: 'Restart' }).click()
  await expect(debriefDialog(page)).toBeHidden()
  await expect.poll(async () => (await fx(page)).live, { timeout: 2000 }).toBe(0)
})
