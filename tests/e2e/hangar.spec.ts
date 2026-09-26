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
const setDebug = (page: Page, which: 'wireframe' | 'gizmos' | 'turntable', on: boolean) => page.evaluate(([w, o]) => (window as HangarWindow).__hangar!.setDebug(w, o), [which, on] as const)

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

  test('6. every modeled stores part shows: stores on and off differ (front view)', async ({ page }) => {
    for (const id of await entries(page)) {
      await select(page, id)
      if (!hasPart(await current(page), 'stores')) continue
      const { empty, model: on } = await view(page, id, 'front', { bombs: true, rockets: true })
      await pose(page, { bombs: false, rockets: false })
      const off = await shot(page)
      const m = await masks(page, empty, [on, off])
      console.log(`stores ${id}: xor ${m.xor01} of ${m.areas[0]} (${((100 * m.xor01) / m.areas[0]!).toFixed(2)}%)`)
      expect(m.xor01 / m.areas[0]!, id).toBeGreaterThanOrEqual(0.005)
    }
  })

  test("7. Cycle (the real button) takes the gear up over the spec's travel, ending where the slider's up end does", async ({ page }) => {
    for (const id of await entries(page)) {
      await select(page, id)
      if (!hasPart(await current(page), 'gear')) continue
      const { empty, model: down } = await view(page, id, 'front', { gearFraction: 1 })
      await pose(page, { gearFraction: 0 })
      const up = await shot(page)
      await pose(page, { gearFraction: 1 })
      await page.getByRole('button', { name: 'Cycle landing gear' }).click()
      // 10 s at 60 Hz covers every shipped spec's gear.travelSeconds (7 s).
      await page.evaluate(() => { for (let i = 0; i < 600; i++) (window as HangarWindow).__hangar!.tick(1 / 60) })
      expect(await page.evaluate(() => (window as HangarWindow).__hangar!.bench()), id).toMatchObject({ gearFraction: 0, cycling: null })
      const cycled = await shot(page)
      const vsUp = await masks(page, empty, [cycled, up])
      const vsDown = await masks(page, empty, [cycled, down])
      console.log(`cycle ${id}: vs up ${vsUp.xor01}/${vsUp.areas[1]}, vs down ${vsDown.xor01}/${vsDown.areas[1]}`)
      expect(vsUp.xor01 / vsUp.areas[1]!, `${id} vs up`).toBeLessThanOrEqual(0.002)
      expect(vsDown.xor01 / vsDown.areas[1]!, `${id} vs down`).toBeGreaterThanOrEqual(0.01)
    }
  })

  test('8. wireframe changes every model, and switching models keeps the setting', async ({ page }) => {
    const ids = await entries(page)
    for (const id of ids) {
      const { empty, model: solid } = await view(page, id, 'three-quarter')
      await setDebug(page, 'wireframe', true)
      const wire = await shot(page)
      await setDebug(page, 'wireframe', false)
      const m = await masks(page, empty, [solid, wire])
      console.log(`wireframe ${id}: ${((100 * m.xor01) / m.areas[0]!).toFixed(2)}%`)
      expect(m.xor01 / m.areas[0]!, id).toBeGreaterThanOrEqual(0.05)
    }
    // Clones share materials: off must really be off after a round trip.
    const { empty, model: first } = await view(page, ids[0]!, 'three-quarter')
    await setDebug(page, 'wireframe', true)
    await select(page, ids[1]!)
    await setDebug(page, 'wireframe', false)
    const { model: again } = await view(page, ids[0]!, 'three-quarter')
    const m = await masks(page, empty, [first, again])
    expect(m.xor01 / m.areas[0]!).toBeLessThanOrEqual(0.002)
    expect(await page.evaluate(() => (window as HangarWindow).__hangar!.validationErrors)).toEqual([])
  })

  test("9. the Wildcat's pivot gizmos are its two wheel legs and its propeller, and they draw", async ({ page }) => {
    const { empty, model: plain } = await view(page, 'f4f-wildcat', 'three-quarter')
    await setDebug(page, 'gizmos', true)
    expect((await page.evaluate(() => (window as HangarWindow).__hangar!.gizmoNodes())).sort()).toEqual(['GRP_Rueda_Der', 'GRP_Rueda_Izq', 'Helice'])
    const withGizmos = await shot(page)
    const m = await masks(page, empty, [plain, withGizmos])
    expect(m.xor01).toBeGreaterThan(0)
    await setDebug(page, 'gizmos', false)
    expect(await page.evaluate(() => (window as HangarWindow).__hangar!.validationErrors)).toEqual([])
  })

  test('10. every committed model is inside its manifest budget as drawn, and the readout says so', async ({ page }) => {
    for (const id of await entries(page)) {
      await select(page, id)
      const r = await page.evaluate(() => (window as HangarWindow).__hangar!.counts())
      console.log(`counts ${id}: ${JSON.stringify(r)}`)
      if (r?.budget) {
        expect(r.over, id).toBe(false)
        expect(await page.locator('[data-over]').getAttribute('data-over'), id).toBe('false')
      }
    }
    // The four registered models have budgets; the Zero draws as the Wildcat.
    for (const id of ['f4f-wildcat', 'essex-cv', 'fletcher-dd', 'type-b-maru']) {
      await select(page, id)
      expect((await page.evaluate(() => (window as HangarWindow).__hangar!.counts()))?.budget, id).not.toBeNull()
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

test('dragging to orbit stops the turntable, and its checkbox says so (H2 review)', async ({ page }) => {
  await page.goto('/hangar.html?bench')
  await page.waitForFunction(() => (window as HangarWindow).__hangar !== undefined, undefined, { timeout: 30_000 })
  await page.evaluate(() => (window as HangarWindow).__hangar!.ready)
  const box = page.getByRole('checkbox', { name: 'Turntable' })
  await expect(box).toBeChecked()
  const c = (await page.locator('#hangar-canvas').boundingBox())!
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2)
  await page.mouse.down()
  await page.mouse.move(c.x + c.width / 2 + 120, c.y + c.height / 2, { steps: 5 })
  await page.mouse.up()
  await expect(box).not.toBeChecked()
  // One click turns it back on, and a model switch keeps what the box says.
  await box.click()
  await expect(box).toBeChecked()
  await page.evaluate(() => (window as HangarWindow).__hangar!.select('essex-cv'))
  await expect(page.getByRole('checkbox', { name: 'Turntable' })).toBeChecked()
})
