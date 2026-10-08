// tests/e2e/ordnance.spec.ts
import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { startGame, type DiagWindow } from './harness.js'
import { SCENARIO_PARAM, SPAWN_PARAMS } from '../../src/render/spawn.js'
import { modelIO } from '../../tools/models/document.js'
import { measureDocument } from '../../tools/models/measure.js'

/**
 * E2E, O1 (ordnance spec §7): a released bomb and a rocket pair draw the generated store
 * models in flight, and the bomb is actually on screen. The reference GPU only; the README's
 * E2E command. Airborne at 1,500 m over the strike range, chase camera.
 */
const [xName, yName, zName] = SPAWN_PARAMS
const URL_ = `/?${SCENARIO_PARAM}=strike-range&${xName}=0&${yName}=1500&${zName}=0`
const triangles = async (path: string): Promise<number> => measureDocument(await modelIO().readBinary(new Uint8Array(readFileSync(path)))).triangles
const view = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.ordnanceView())

/** Share of the disc's pixels whose RGB differs from the surrounding ring's mean by more than 40 (summed). */
async function blobContrast(page: Page, png: Buffer, ndc: readonly [number, number], radiusPx: number): Promise<number> {
  return page.evaluate(async ({ b64, ndc, r }) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob())
    const c = document.createElement('canvas')
    c.width = bitmap.width
    c.height = bitmap.height
    const ctx = c.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0)
    const d = ctx.getImageData(0, 0, c.width, c.height).data
    const cx = ((ndc[0] + 1) / 2) * c.width, cy = ((1 - ndc[1]) / 2) * c.height
    const px = (x: number, y: number): number[] => { const p = (Math.round(y) * c.width + Math.round(x)) * 4; return [d[p]!, d[p + 1]!, d[p + 2]!] }
    const ring: number[][] = [], disc: number[][] = []
    for (let dy = -3 * r; dy <= 3 * r; dy++) for (let dx = -3 * r; dx <= 3 * r; dx++) {
      // Only pixels inside the frame: a ring reaching past the bottom edge used to read
      // undefined, turning the ring's mean into NaN and every contrast into 0.
      const x = Math.round(cx + dx), y = Math.round(cy + dy)
      if (x < 0 || y < 0 || x >= c.width || y >= c.height) continue
      const q = Math.hypot(dx, dy)
      if (q <= r) disc.push(px(cx + dx, cy + dy))
      else if (q >= 2 * r && q <= 3 * r) ring.push(px(cx + dx, cy + dy))
    }
    const mean = [0, 1, 2].map((k) => ring.reduce((s, p) => s + p[k]!, 0) / ring.length)
    return disc.filter((p) => Math.abs(p[0]! - mean[0]!) + Math.abs(p[1]! - mean[1]!) + Math.abs(p[2]! - mean[2]!) > 40).length / disc.length
  }, { b64: png.toString('base64'), ndc, r: Math.max(3, Math.round(radiusPx)) })
}

test.setTimeout(120_000)

test('a released bomb and a rocket pair draw the O1 store models in flight, and the bomb is on screen', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(URL_)
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, { timeout: 30_000 })
  await startGame(page, { loadout: 'Both' })
  // The store models load after boot; the pools swap when they land. view() reports the pool's
  // geometry even with no bomb aloft, so wait for the swap itself rather than a fixed time.
  const bombTriangles = await triangles('content/ordnance/an-m65.glb')
  await expect.poll(async () => (await view(page)).bombTriangles, { timeout: 15_000 }).toBe(bombTriangles)
  // Wait in sim ticks, not wall time, then pause: in the chase view the falling bomb crosses
  // 100-200 px during one remote screenshot, so an unpaused view() and the capture disagree
  // (measured 2026-09-26 on the reference GPU: contrast 0.000 with the bomb drawn 0.3 NDC
  // lower than sampled).
  // Re-tuned 2026-09-27 (sortie forms A4): the Hellcat is drawn with its own model and its racks
  // moved onto that wing, 1.9 m lower and aft, so the bomb falls behind the tailplane and then
  // into the follow-view bar, and no tick left its 3r ring clear of both. The bar is hidden
  // (toggleFlightData) and the bomb sampled at 66 ticks, below the tailplane; measured over two
  // runs at 62-70 ticks: bomb 0.188-0.206, the same ring over empty sea 0.000 (asserted below).
  const tick = () => page.evaluate(() => (window as DiagWindow).__ww2!.tick())
  await page.keyboard.press('KeyI')
  await page.keyboard.press('KeyV')
  const released = await tick()
  await expect.poll(tick, { timeout: 10_000, intervals: [10] }).toBeGreaterThanOrEqual(released + 66)
  await page.keyboard.press('Escape')
  // The pause is latched and applied on a later frame, so wait for the sim clock to stop before
  // sampling: read at once, view() ran 11 ticks ahead of the pause on 2026-09-27 (66 vs 77), and
  // the disc it sampled landed on the wing root instead of the bomb.
  await expect.poll(async () => { const a = await tick(); await page.waitForTimeout(100); return (await tick()) === a }, { timeout: 5_000 }).toBe(true)
  const pausedAt = await tick()
  const v = await view(page)
  expect(v.bombs).toBe(1)
  expect(v.bombTriangles).toBe(bombTriangles)
  expect(v.bombNdc, 'the bomb projects into the camera').not.toBeNull()
  expect(Math.abs(v.bombNdc![0])).toBeLessThan(1)
  expect(Math.abs(v.bombNdc![1])).toBeLessThan(1)
  const shot = await page.screenshot({ path: 'test-results/o1-bomb-in-flight.png' })
  const contrast = await blobContrast(page, shot, v.bombNdc!, v.bombRadiusPx!)
  console.log(`bomb at ndc ${v.bombNdc!.map((n) => n.toFixed(3)).join(', ')}, radius ${v.bombRadiusPx!.toFixed(1)} px, contrast ${contrast.toFixed(3)}`)
  // The disc is the bounding sphere's, sized by the bomb's 2.2 m length, and the chase view sees
  // it nearly tail-on: the 0.47 m body and box tail fill about a sixth of it (0.164-0.170 over
  // three runs, 2026-09-26, reference GPU). Empty sea measured 0.000. Half the measured share.
  expect(contrast).toBeGreaterThan(0.08)
  // The measurement itself: the same disc and ring at the bomb's height over empty sea read ~0,
  // so a polluted ring (tailplane, HUD) cannot pass for a drawn bomb.
  for (const x of [-0.6, 0.6]) expect(await blobContrast(page, shot, [x, v.bombNdc![1]], v.bombRadiusPx!), `empty sea at x ${x}`).toBeLessThan(0.02)
  expect(await view(page), 'paused: the capture saw the sampled frame').toEqual(v)
  expect(await tick()).toBe(pausedAt)

  await page.keyboard.press('Escape')
  await page.keyboard.press('KeyE')
  await expect.poll(async () => (await view(page)).rockets, { timeout: 2_000 }).toBeGreaterThanOrEqual(2)
  expect((await view(page)).rocketTriangles).toBe(await triangles('content/ordnance/hvar.glb'))
  await page.screenshot({ path: 'test-results/o1-rockets-in-flight.png' })
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
})

test('a fired rocket pair draws its motor flame from the fx system while it burns (plan E2 Ruling R8)', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(URL_)
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, { timeout: 30_000 })
  await startGame(page, { loadout: 'Both' })
  const fx = () => page.evaluate(() => (window as DiagWindow).__ww2!.fx())
  const before = (await fx()).live
  await page.keyboard.press('KeyE')
  await expect.poll(async () => (await view(page)).rockets, { timeout: 2_000 }).toBeGreaterThanOrEqual(2)
  // From 1,500 m the pair is seconds from any impact: every new particle is motor or exhaust.
  await expect.poll(async () => (await fx()).live - before, { timeout: 1_000 }).toBeGreaterThanOrEqual(5)
  await page.screenshot({ path: `${process.env.FX_SHOTS_DIR ?? 'test-results/fx-shots'}/rocket-motor.png` })
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
})
