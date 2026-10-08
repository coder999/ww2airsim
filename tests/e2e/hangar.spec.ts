// tests/e2e/hangar.spec.ts
import { readFileSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import type { HangarWindow } from '../../src/render/hangar/hooks.js'
import type { PartPose } from '../../src/render/hangar/models.js'
import type { CameraPreset } from '../../src/render/hangar/framing.js'

/**
 * E2E, the Hangar (spec §10): every model "renders, articulates and is
 * lit sanely", by pixel masks against an empty frame with the camera frozen.
 * Only the canvas is captured (`#hangar-canvas`); the panel sits beside it,
 * not over it. Run on any free dev-server slot.
 * Nothing here is a timing budget.
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
const setDebug = (page: Page, which: 'wireframe' | 'gizmos' | 'turntable' | 'checker', on: boolean) => page.evaluate(([w, o]) => (window as HangarWindow).__hangar!.setDebug(w, o), [which, on] as const)

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
async function masks(page: Page, empty: Frame, frames: Frame[]): Promise<{ areas: number[]; luminance: number[]; total: number; xor01: number; changed01: number }> {
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
    const pixels: Uint8ClampedArray[] = []
    const areas: number[] = [], luminance: number[] = []
    for (const f64 of frames64) {
      const f = await decode(f64)
      pixels.push(f)
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
    // xor01 is the silhouette change; changed01 counts pixels inside either mask whose color moved, which a dense mesh's wireframe or a bright model's checker changes without moving the silhouette or the mean.
    let xor01 = 0, changed01 = 0
    if (sets.length >= 2) {
      const a = pixels[0]!, b = pixels[1]!
      for (let p = 0; p < total; p++) {
        if (sets[0]![p] !== sets[1]![p]) xor01++
        if ((sets[0]![p] || sets[1]![p]) && Math.abs(a[p * 4]! - b[p * 4]!) + Math.abs(a[p * 4 + 1]! - b[p * 4 + 1]!) + Math.abs(a[p * 4 + 2]! - b[p * 4 + 2]!) > 24) changed01++
      }
    }
    return { areas, luminance, total, xor01, changed01 }
  }, { empty64: empty.toString('base64'), frames64: frames.map((f) => f.toString('base64')) })
}

/**
 * For each NDC point: 0 if its pixel is in the model-vs-empty mask, k if the first mask pixel
 * is k px straight up (k <= reachPx), -1 if none. The frames are the canvas only. Decodes its
 * own frames: `page.evaluate` closures are serialized, so it cannot share `masks`' decoder.
 */
async function maskReach(page: Page, empty: Frame, model: Frame, ndcs: readonly (readonly [number, number])[], reachPx: number): Promise<number[]> {
  return page.evaluate(async ({ empty64, model64, ndcs, reachPx }) => {
    const decode = async (b64: string) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob())
      const c = document.createElement('canvas')
      c.width = bitmap.width
      c.height = bitmap.height
      const ctx = c.getContext('2d')!
      ctx.drawImage(bitmap, 0, 0)
      bitmap.close()
      return { data: ctx.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height }
    }
    const e = await decode(empty64), m = await decode(model64)
    const inMask = (x: number, y: number): boolean => {
      if (x < 0 || y < 0 || x >= m.w || y >= m.h) return false
      const p = (y * m.w + x) * 4
      return Math.abs(m.data[p]! - e.data[p]!) + Math.abs(m.data[p + 1]! - e.data[p + 1]!) + Math.abs(m.data[p + 2]! - e.data[p + 2]!) > 24
    }
    return ndcs.map(([nx, ny]) => {
      const x = Math.round(((nx + 1) / 2) * m.w), y = Math.round(((1 - ny) / 2) * m.h)
      for (let k = 0; k <= reachPx; k++) if (inMask(x, y - k)) return k
      return -1
    })
  }, { empty64: empty.toString('base64'), model64: model.toString('base64'), ndcs, reachPx })
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

  test("5. every aircraft is lit sanely: its lit/unlit luminance within 0.5x to 1.5x of the Wildcat's", async ({ page }) => {
    // Lit over unlit, each in the model's own paint, so the paint cancels (R3, 2026-09-27): the old
    // lit-luminance ratio read a correctly lit bare-metal B-17 at 3.10x and the pale G4M at 3.56x
    // the blue Wildcat. What is left fails an emissive, black or inside-out material all the same.
    const response = async (id: string): Promise<number> => {
      const v = await view(page, id, 'three-quarter')
      await page.evaluate(() => (window as HangarWindow).__hangar!.setUnlit(true))
      const flat = await shot(page)
      await page.evaluate(() => (window as HangarWindow).__hangar!.setUnlit(false))
      const [lit, unlit] = (await masks(page, v.empty, [v.model, flat])).luminance
      return lit! / unlit!
    }
    const ref = await response('f4f-wildcat')
    for (const id of await entries(page)) {
      await select(page, id)
      if ((await current(page)).kind !== 'aircraft') continue
      const r = (await response(id)) / ref
      console.log(`lighting ${id}: ${r.toFixed(3)}x the Wildcat's lit/unlit response`)
      // Soft, so one aircraft out of band does not hide the others' ratios (R3).
      expect.soft(r, `${id} lighting ratio`).toBeGreaterThanOrEqual(0.5)
      expect.soft(r, `${id} lighting ratio`).toBeLessThanOrEqual(1.5)
    }
    expect(await page.evaluate(() => (window as HangarWindow).__hangar!.validationErrors)).toEqual([])
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
      // A display-only aircraft (no spec) has no gear travel, so no Cycle button (R3 Review Focus 3).
      if (((await page.locator(`ul[aria-label="Objects"] button[data-id="${id}"]`).textContent()) ?? '').includes('(not in the game yet)')) {
        await expect(page.getByRole('button', { name: 'Cycle landing gear' })).toHaveCount(0)
        continue
      }
      const { empty, model: down } = await view(page, id, 'front', { gearFraction: 1 })
      await pose(page, { gearFraction: 0 })
      const up = await shot(page)
      await pose(page, { gearFraction: 1 })
      await page.getByRole('button', { name: 'Cycle landing gear' }).click()
      // 25 s at 60 Hz covers every shipped spec's gear.travelSeconds (20 s for the B-29, 12 s for the B-17, 7 s the fighters', 2026-09-29).
      await page.evaluate(() => { for (let i = 0; i < 1500; i++) (window as HangarWindow).__hangar!.tick(1 / 60) })
      expect(await page.evaluate(() => (window as HangarWindow).__hangar!.bench()), id).toMatchObject({ gearFraction: 0, cycling: null })
      const cycled = await shot(page)
      const vsUp = await masks(page, empty, [cycled, up])
      const vsDown = await masks(page, empty, [cycled, down])
      console.log(`cycle ${id}: vs up ${vsUp.xor01}/${vsUp.areas[1]}, vs down ${vsDown.xor01}/${vsDown.areas[1]}`)
      expect(vsUp.xor01 / vsUp.areas[1]!, `${id} vs up`).toBeLessThanOrEqual(0.002)
      expect(vsDown.xor01 / vsDown.areas[1]!, `${id} vs down`).toBeGreaterThanOrEqual(0.01)
    }
  })

  test("7b. every bay bomber's doors Cycle open over the spec's travel and visibly open, from the side (C2)", async ({ page }) => {
    let bombers = 0
    for (const id of await entries(page)) {
      await select(page, id)
      if (!hasPart(await current(page), 'doors')) continue
      bombers++
      // From the side, gear up: an open door hangs flat-on to this view. From the front the B-17's chin
      // turret hides its whole belly line (measured 2026-10-08: 0 px changed).
      const { empty, model: shut } = await view(page, id, 'side', { bayDoorFraction: 0, gearFraction: 0 })
      await page.getByRole('button', { name: 'Cycle bay doors' }).click()
      // 12 s at 60 Hz covers every shipped spec's bayDoors.travelSeconds (10 s for the B-17, 2026-10-08).
      await page.evaluate(() => { for (let i = 0; i < 720; i++) (window as HangarWindow).__hangar!.tick(1 / 60) })
      expect(await page.evaluate(() => (window as HangarWindow).__hangar!.bench()), id).toMatchObject({ bayDoorFraction: 1, cycling: null })
      const open = await shot(page)
      const m = await masks(page, empty, [shut, open])
      console.log(`doors ${id}: changed ${m.xor01}/${m.areas[0]}`)
      // Measured 2026-10-08: 93 px (B-17) to 207 px (G4M) at the side preset; nothing moves at all if the doors are not drawn.
      expect(m.xor01, `${id} open differs from shut`).toBeGreaterThan(50)
    }
    expect(bombers).toBe(4)
  })

  test('8. wireframe changes every model, and switching models keeps the setting', async ({ page }) => {
    // Three captures per Library entry: R3's eleven aircraft took it past the 60 s default (26 of 28 entries, 2026-09-27).
    test.setTimeout(180_000)
    const ids = await entries(page)
    for (const id of ids) {
      const { empty, model: solid } = await view(page, id, 'three-quarter')
      await setDebug(page, 'wireframe', true)
      const wire = await shot(page)
      await setDebug(page, 'wireframe', false)
      const m = await masks(page, empty, [solid, wire])
      console.log(`wireframe ${id}: ${((100 * m.xor01) / m.areas[0]!).toFixed(2)}% silhouette, ${((100 * m.changed01) / m.areas[0]!).toFixed(2)}% pixels`)
      expect(Math.max(m.xor01, m.changed01) / m.areas[0]!, id).toBeGreaterThanOrEqual(0.05)
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

  test("9. the Wildcat's pivot gizmos are its two wheel groups, its propeller and the strut and wheel nodes the W1 leg stretch moves, and they draw", async ({ page }) => {
    const { empty, model: plain } = await view(page, 'f4f-wildcat', 'three-quarter')
    await setDebug(page, 'gizmos', true)
    expect((await page.evaluate(() => (window as HangarWindow).__hangar!.gizmoNodes())).sort()).toEqual(['GRP_Rueda_Der', 'GRP_Rueda_Izq', 'Helice', 'polySurface255', 'polySurface257', 'polySurface272', 'polySurface277', 'polySurface302', 'polySurface303'])
    const withGizmos = await shot(page)
    const m = await masks(page, empty, [plain, withGizmos])
    expect(m.xor01).toBeGreaterThan(0)
    await setDebug(page, 'gizmos', false)
    expect(await page.evaluate(() => (window as HangarWindow).__hangar!.validationErrors)).toEqual([])
  })

  test('10. every committed model is inside its manifest limits as drawn, and the readout says so', async ({ page }) => {
    for (const id of await entries(page)) {
      await select(page, id)
      const r = await page.evaluate(() => (window as HangarWindow).__hangar!.counts())
      console.log(`counts ${id}: ${JSON.stringify(r)}`)
      if (r?.budget) {
        expect(r.over, id).toBe(false)
        expect(await page.locator('[data-over]').getAttribute('data-over'), id).toBe('false')
      }
    }
    // The registered models have budgets (R3: every aircraft draws its own model).
    for (const id of ['f4f-wildcat', 'a6m-zero', 'f6f-hellcat', 'f4u-corsair', 'p-38-lightning', 'ki-43-oscar', 'd3a-val', 'g4m-betty', 'b-17-flying-fortress', 'ki-84-frank', 'ki-21-sally', 'b-29-superfortress', 'essex-cv', 'fletcher-dd', 'type-b-maru']) {
      await select(page, id)
      expect((await page.evaluate(() => (window as HangarWindow).__hangar!.counts()))?.budget, id).not.toBeNull()
    }
    // R1-R5: every Library building and vehicle is drawn from its own model, with its manifest budget.
    for (const [id, folder] of [...['aaa', 'ammunition-bunker', 'barracks-and-huts', 'coastal-gun-battery', 'fuel-tank-farm', 'hangar', 'pier-and-warehouses', 'radio-radar-station', 'revetment', 'tower'].map((b) => [b, 'buildings'] as const), ['type97-chi-ha', 'vehicles'] as const, ['willys-mb-jeep', 'vehicles'] as const]) {
      await select(page, id)
      const r = await page.evaluate(() => (window as HangarWindow).__hangar!.counts())
      expect(r?.budget, id).not.toBeNull()
      expect(r?.modelUrl ?? '', id).toMatch(new RegExp(`content/${folder}/${id}\\.glb$`))
    }
    // R3: the Zero and the Hellcat draw their own glbs in the Hangar, not the Wildcat's.
    for (const [id, glb] of [['a6m-zero', 'a6m2-zero'], ['f6f-hellcat', 'f6f-hellcat']] as const) {
      await select(page, id)
      expect((await page.evaluate(() => (window as HangarWindow).__hangar!.counts()))?.modelUrl ?? '', id).toMatch(new RegExp(`content/aircraft/${glb}\\.glb$`))
    }
  })

  test('12. the list marks exactly the entries it cannot draw, and every other one is drawn (R1)', async ({ page }) => {
    const buttons = page.locator('ul[aria-label="Objects"] button')
    const all = await buttons.count()
    const notDrawn = await buttons.filter({ hasText: '(not yet in service)' }).count()
    const ids = await entries(page)
    expect(all - notDrawn).toBe(ids.length)
    for (const id of ids) await expect(page.locator(`ul[aria-label="Objects"] button[data-id="${id}"]`)).not.toContainText('(not yet in service)')
    // R5: nothing in the Library is undrawn.
    expect(notDrawn).toBe(0)
  })

  /**
   * The stores are posed off, so the mask is the airframe alone. From above, a mount on the
   * airframe is inside the wing's silhouette; the 1 px reach absorbs rounding. From the side,
   * the lug point sits one drop (about 0.05-0.12 m, 2-5 px) under the lower skin. Before O1 the
   * rack points were 1.9 m low, about 70 px, and fail.
   */
  test("11. the Wildcat's stores hang on its wing: from above every mount lies on the airframe, from the side each meets it within 10 px (O1)", async ({ page }) => {
    for (const [preset, reach] of [['top', 1], ['side', 10]] as const) {
      const { empty, model } = await view(page, 'f4f-wildcat', preset, { bombs: false, rockets: false })
      const mounts = await page.evaluate(() => (window as HangarWindow).__hangar!.storeMounts())
      expect(mounts).toHaveLength(2) // the two bomb racks; the F4F-4 has no rails (W1 R3)
      const hits = await maskReach(page, empty, model, mounts.map((m) => m.ndc), reach)
      console.log(`check 11 ${preset}: ${mounts.map((m, i) => `${m.id} ${hits[i]}`).join(', ')}`)
      mounts.forEach((m, i) => expect(hits[i], `${preset} ${m.id}`).toBeGreaterThanOrEqual(0))
    }
  })

  test("13. every rigged aircraft's pivot gizmos are its named props, gear legs and control surfaces (R3, C1)", async ({ page }) => {
    await setDebug(page, 'gizmos', true)
    for (const id of await entries(page)) {
      await select(page, id)
      const c = await current(page)
      if (c.kind !== 'aircraft' || id === 'f4f-wildcat') continue
      const nodes = await page.evaluate(() => (window as HangarWindow).__hangar!.gizmoNodes())
      for (const n of nodes) expect(n, id).toMatch(/^(Prop\d*|GearL|GearR|GearNose|Tailwheel|(Aileron|Elevator|Flap\d+|BayDoor\d+)[LR]|Rudder\d*)$/)
      expect(nodes.some((n) => n.startsWith('BayDoor')), `${id} bay door gizmos`).toBe(hasPart(c, 'doors'))
      expect(nodes.some((n) => /^(Aileron|Elevator|Rudder)/.test(n)), `${id} control surface gizmos`).toBe(hasPart(c, 'surfaces'))
      expect(nodes.some((n) => n.startsWith('Flap')), `${id} flap gizmos`).toBe(hasPart(c, 'flaps'))
      expect(nodes.some((n) => n.startsWith('Prop')), `${id} prop gizmo`).toBe(hasPart(c, 'prop'))
      expect(nodes.some((n) => /^(Gear|Tailwheel)/.test(n)), `${id} gear gizmo`).toBe(hasPart(c, 'gear'))
    }
    await setDebug(page, 'gizmos', false)
    expect(await page.evaluate(() => (window as HangarWindow).__hangar!.validationErrors)).toEqual([])
  })

  test("14. the card's Model row says where the model came from, and the Origin filter splits ours from downloads", async ({ page }) => {
    const row = page.getByRole('table', { name: 'Figures' }).getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'Model', exact: true }) })
    await select(page, 'f4u-corsair')
    await expect(row).toContainText('Sketchfab download by manilov.ap (CC BY 4.0)')
    await expect(row.getByRole('link', { name: 'manilov.ap' })).toHaveAttribute('href', /^https:\/\/sketchfab\.com\/3d-models\/f4u-/)
    await select(page, 'ki-84-frank')
    await expect(row).toContainText('Original Blender model (AGPL-3.0-or-later)')
    // Since R4 no Library entry is drawn in code; provenance.test.ts covers that case in Node.
    await select(page, 'tower')
    await expect(row).toContainText('Original Blender model (AGPL-3.0-or-later)')
    // The Origin filter: ours (Blender, generated, drawn in code) versus downloads.
    const listed = (id: string) => page.locator(`ul[aria-label="Objects"] button[data-id="${id}"]`)
    const origin = page.getByRole('combobox', { name: 'Origin' })
    await origin.selectOption('internal')
    await expect(listed('ki-84-frank')).toHaveCount(1)
    await expect(listed('f4u-corsair')).toHaveCount(0)
    await origin.selectOption('external')
    await expect(listed('f4u-corsair')).toHaveCount(1)
    await expect(listed('ki-84-frank')).toHaveCount(0)
    await origin.selectOption('all')
    await expect(listed('ki-84-frank')).toHaveCount(1)
    // Three filters must not push the sheet sideways (the Origin select once ran off its edge).
    expect(await page.locator('.hangar-panel .sheet').evaluate((e) => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(0)
  })

  test('15. every skinned model is lit inside 0.6x to 1.5x of its flat predecessor: no black, missing or blown-out skin (DP0)', async ({ page }) => {
    const flat = JSON.parse(readFileSync('tests/e2e/fixtures/flat-luminance.json', 'utf8')) as Record<string, number>
    for (const id of Object.keys(flat).filter((k) => k !== 'note')) {
      const v = await view(page, id, 'three-quarter')
      const [lum] = (await masks(page, v.empty, [v.model])).luminance
      const r = lum! / flat[id]!
      console.log(`skin ${id}: ${r.toFixed(3)}x its flat predecessor's luminance`)
      expect.soft(r, `${id} luminance ratio`).toBeGreaterThanOrEqual(0.6)
      expect.soft(r, `${id} luminance ratio`).toBeLessThanOrEqual(1.5)
    }
    expect(await page.evaluate(() => (window as HangarWindow).__hangar!.validationErrors)).toEqual([])
  })

  test('16. the UV checker changes a skinned model and restores it exactly (DP0, spec §9)', async ({ page }) => {
    for (const id of ['ki-84-frank', 'hangar', 'pennsylvania-bb', 'essex-cv', 'ki-21-sally', 'p-38-lightning', 'b-29-superfortress', 'g4m-betty',
      'aaa', 'ammunition-bunker', 'barracks-and-huts', 'coastal-gun-battery', 'fuel-tank-farm', 'pier-and-warehouses', 'radio-radar-station', 'revetment', 'tower']) {
      const { empty, model } = await view(page, id, 'three-quarter')
      await setDebug(page, 'checker', true)
      const on = await shot(page)
      await setDebug(page, 'checker', false)
      const off = await shot(page)
      const m = await masks(page, empty, [model, on, off])
      console.log(`checker ${id}: luminance ${m.luminance.map((x) => x.toFixed(4)).join(' / ')}, ${((100 * m.changed01) / m.areas[0]!).toFixed(1)}% pixels changed`)
      expect(Math.max(Math.abs(m.luminance[1]! - m.luminance[0]!) / m.luminance[0]!, m.changed01 / m.areas[0]!), `${id} checker differs`).toBeGreaterThan(0.05)
      expect(Math.abs(m.luminance[2]! - m.luminance[0]!) / m.luminance[0]!, `${id} restored`).toBeLessThanOrEqual(0.005)
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

test('the details panel appears on the right once something is picked, and collapses to give the model the width', async ({ page }) => {
  await openHangar(page)
  const details = page.getByRole('region', { name: 'Details' })
  await expect(details).toBeHidden()
  await expect(page.getByText('Pick an item')).toBeVisible()
  await page.getByRole('list', { name: 'Objects' }).getByRole('button').first().click()
  await expect(details).toBeVisible()
  await expect(page.getByText('Pick an item')).toHaveCount(0)
  await expect(details.getByRole('table', { name: 'Figures' })).toBeVisible()
  const edges = () => page.evaluate(() => {
    const box = (s: string) => document.querySelector(s)!.getBoundingClientRect()
    return { canvas: box('#hangar-canvas'), details: box('.hangar-detail'), list: box('.hangar-panel'), w: innerWidth, h: innerHeight }
  })
  const open = await edges()
  // Left list, model, details: three columns side by side, nothing off-screen.
  expect(open.list.right).toBeLessThanOrEqual(open.canvas.left + 1)
  expect(open.canvas.right).toBeLessThanOrEqual(open.details.left + 1)
  expect(open.details.right).toBeLessThanOrEqual(open.w)
  expect(open.details.bottom).toBeLessThanOrEqual(open.h)
  await details.getByRole('button', { name: 'Collapse details' }).click()
  await expect(details.getByRole('table', { name: 'Figures' })).toBeHidden()
  await expect.poll(async () => (await edges()).canvas.width).toBeGreaterThan(open.canvas.width + 200)
  await details.getByRole('button', { name: 'Expand details' }).click()
  await expect(details.getByRole('table', { name: 'Figures' })).toBeVisible()
})

test("the title's Hangar button opens the hangar", async ({ page }) => {
  await page.goto('/')
  const title = page.getByRole('dialog', { name: 'Title' })
  await expect(title).toBeVisible()
  await title.getByRole('button', { name: 'Hangar' }).click()
  await page.waitForURL(/hangar\.html$/)
  await page.waitForFunction(() => (window as HangarWindow).__hangar !== undefined, undefined, { timeout: 30_000 })
})

test('dragging to orbit stops the turntable, and its checkbox says so (H2 review)', async ({ page }) => {
  await page.goto('/hangar.html?bench')
  await page.waitForFunction(() => (window as HangarWindow).__hangar !== undefined, undefined, { timeout: 30_000 })
  await page.evaluate(() => (window as HangarWindow).__hangar!.ready)
  // Nothing is picked on load, so there is no bench until a pick (2026-10-08).
  await page.evaluate(() => (window as HangarWindow).__hangar!.select('f4f-wildcat'))
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
