// tests/e2e/hangar.spec.ts
import { test, expect, type Page } from '@playwright/test'
import type { HangarWindow } from '../../src/render/hangar/hooks.js'
import type { PartPose } from '../../src/render/hangar/models.js'
import type { CameraPreset } from '../../src/render/hangar/framing.js'

/**
 * Tier 2, the Hangar (spec §10): every model "renders, articulates and is
 * lit sanely", by pixel masks against an empty frame with the camera frozen.
 * Only the canvas is captured (`#hangar-canvas`); the panel sits beside it,
 * not over it. Run on the ww2airsim-3 slot (Hangar spec §13). Nothing here is
 * a timing budget.
 */

type Frame = Buffer

async function openHangar(page: Page): Promise<void> {
  await page.goto('/hangar.html?bench')
  await page.waitForFunction(() => (window as HangarWindow).__hangar !== undefined, undefined, { timeout: 30_000 })
  await page.evaluate(() => (window as HangarWindow).__hangar!.ready)
  await page.evaluate(() => (window as HangarWindow).__hangar!.freeze())
}

type Current = { readonly id: string; readonly kind: string; readonly parts: readonly { readonly id: string; readonly modeled: boolean }[] }
const entries = (page: Page) => page.evaluate(() => (window as HangarWindow).__hangar!.entries())
const select = (page: Page, id: string) => page.evaluate((i) => (window as HangarWindow).__hangar!.select(i), id)
const current = (page: Page) => page.evaluate(() => (window as HangarWindow).__hangar!.current()) as Promise<Current>
const pose = (page: Page, p: PartPose) => page.evaluate((q) => (window as HangarWindow).__hangar!.pose(q), p)
const visible = (page: Page, v: boolean) => page.evaluate((x) => (window as HangarWindow).__hangar!.setModelVisible(x), v)
const hasPart = (c: Current, id: string) => c.parts.some((p) => p.id === id && p.modeled)

/** Three animation frames, so a pose or camera change has reached the canvas. */
const settle = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => r())))))

async function shot(page: Page): Promise<Frame> {
  await settle(page)
  return page.locator('#hangar-canvas').screenshot()
}

async function view(page: Page, id: string, preset: CameraPreset, p: PartPose = {}): Promise<{ empty: Frame; model: Frame }> {
  await select(page, id)
  await page.evaluate((c) => (window as HangarWindow).__hangar!.camera(c), preset)
  await pose(page, p)
  await visible(page, false)
  const empty = await shot(page)
  await visible(page, true)
  return { empty, model: await shot(page) }
}

/**
 * Masks of `frames` against `empty` (a pixel is in a mask when its summed
 * RGB difference exceeds 24), decoded in the browser to avoid a PNG
 * dependency (cloudShadow.spec.ts pattern). Returns each mask's area and the
 * mean linear luminance inside it, the frame's pixel count, and the number of
 * pixels in exactly one of the first two masks.
 */
async function masks(page: Page, empty: Frame, frames: Frame[]): Promise<{ areas: number[]; luminance: number[]; total: number; xor01: number }> {
  return page.evaluate(async ({ empty64, frames64 }) => {
    const decode = async (b64: string): Promise<Uint8ClampedArray> => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob())
      const c = document.createElement('canvas')
      c.width = bitmap.width
      c.height = bitmap.height
      const ctx = c.getContext('2d')!
      ctx.drawImage(bitmap, 0, 0)
      bitmap.close()
      return ctx.getImageData(0, 0, c.width, c.height).data
    }
    const lin = (v: number): number => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
    const e = await decode(empty64)
    const total = e.length / 4
    const sets: Uint8Array[] = []
    const areas: number[] = [], luminance: number[] = []
    for (const f64 of frames64) {
      const f = await decode(f64)
      const m = new Uint8Array(total)
      let area = 0, lum = 0
      for (let p = 0; p < total; p++) {
        const d = Math.abs(f[p * 4]! - e[p * 4]!) + Math.abs(f[p * 4 + 1]! - e[p * 4 + 1]!) + Math.abs(f[p * 4 + 2]! - e[p * 4 + 2]!)
        if (d > 24) {
          m[p] = 1
          area++
          lum += 0.2126 * lin(f[p * 4]!) + 0.7152 * lin(f[p * 4 + 1]!) + 0.0722 * lin(f[p * 4 + 2]!)
        }
      }
      sets.push(m)
      areas.push(area)
      luminance.push(area ? lum / area : 0)
    }
    let xor01 = 0
    if (sets.length >= 2) for (let p = 0; p < total; p++) if (sets[0]![p] !== sets[1]![p]) xor01++
    return { areas, luminance, total, xor01 }
  }, { empty64: empty.toString('base64'), frames64: frames.map((f) => f.toString('base64')) })
}

test.describe('the Hangar', () => {
  test.beforeEach(async ({ page }) => { await openHangar(page) })

  test('1. every in-service entry renders: its mask covers 2% to 80% of the frame, with no validation errors', async ({ page }) => {
    const ids = await entries(page)
    expect(ids.length).toBeGreaterThan(0)
    for (const id of ids) {
      const v = await view(page, id, 'three-quarter')
      const m = await masks(page, v.empty, [v.model])
      const share = m.areas[0]! / m.total
      expect(share, `${id} mask share`).toBeGreaterThan(0.02)
      expect(share, `${id} mask share`).toBeLessThan(0.8)
    }
    expect(await page.evaluate(() => (window as HangarWindow).__hangar!.validationErrors)).toEqual([])
  })

  test('2. every modeled landing gear visibly moves between down and up (front view)', async ({ page }) => {
    for (const id of await entries(page)) {
      await select(page, id)
      if (!hasPart(await current(page), 'gear')) continue
      const down = await view(page, id, 'front', { gearFraction: 1 })
      await pose(page, { gearFraction: 0 })
      const up = await shot(page)
      const m = await masks(page, down.empty, [down.model, up])
      expect(m.xor01 / m.areas[0]!, `${id} gear-down vs gear-up`).toBeGreaterThanOrEqual(0.01)
    }
  })

  test('3. every modeled propeller turns: two frames 1/60 s apart at full throttle differ', async ({ page }) => {
    for (const id of await entries(page)) {
      await select(page, id)
      if (!hasPart(await current(page), 'prop')) continue
      const a = await view(page, id, 'front', { throttle: 1 })
      await page.evaluate(() => (window as HangarWindow).__hangar!.tick(1 / 60))
      const b = await shot(page)
      const m = await masks(page, a.empty, [a.model, b])
      expect(m.xor01, `${id} prop frames`).toBeGreaterThan(0)
      // The control (Review Focus 4): at zero throttle the same tick must change
      // nothing, or the frame is not frozen and the check above proves nothing.
      const z = await view(page, id, 'front', { throttle: 0 })
      await page.evaluate(() => (window as HangarWindow).__hangar!.tick(1 / 60))
      const z2 = await shot(page)
      const mz = await masks(page, z.empty, [z.model, z2])
      expect(mz.xor01, `${id} zero-throttle control`).toBe(0)
    }
  })

  test("5. every aircraft is lit sanely: in-mask luminance within 0.5x to 1.5x of the Wildcat's", async ({ page }) => {
    const ref = await view(page, 'f4f-wildcat', 'three-quarter')
    const refLum = (await masks(page, ref.empty, [ref.model])).luminance[0]!
    for (const id of await entries(page)) {
      await select(page, id)
      if ((await current(page)).kind !== 'aircraft') continue
      const v = await view(page, id, 'three-quarter')
      const lum = (await masks(page, v.empty, [v.model])).luminance[0]!
      expect(lum / refLum, `${id} luminance ratio`).toBeGreaterThanOrEqual(0.5)
      expect(lum / refLum, `${id} luminance ratio`).toBeLessThanOrEqual(1.5)
    }
  })
})

test('the canvas and the panel fit the window: nothing renders off-screen', async ({ page }) => {
  await openHangar(page)
  const r = await page.evaluate(() => {
    const box = (s: string) => document.querySelector(s)!.getBoundingClientRect()
    const c = box('#hangar-canvas'), p = box('.hangar-panel'), sh = box('.hangar-panel .sheet')
    return { canvasRight: c.right, canvasBottom: c.bottom, panelBottom: p.bottom, sheetBottom: sh.bottom, w: innerWidth, h: innerHeight }
  })
  expect(r.canvasRight, 'canvas right edge').toBeLessThanOrEqual(r.w)
  expect(r.canvasBottom, 'canvas bottom edge').toBeLessThanOrEqual(r.h)
  expect(r.panelBottom, 'panel bottom edge').toBeLessThanOrEqual(r.h)
  expect(r.sheetBottom, 'sheet bottom edge (the list scrolls inside it)').toBeLessThanOrEqual(r.h)
})

test("the title's Library button opens the hangar", async ({ page }) => {
  await page.goto('/')
  const title = page.getByRole('dialog', { name: 'Title' })
  await expect(title).toBeVisible()
  await title.getByRole('button', { name: 'Library' }).click()
  await page.waitForURL(/hangar\.html$/)
  await page.waitForFunction(() => (window as HangarWindow).__hangar !== undefined, undefined, { timeout: 30_000 })
})
