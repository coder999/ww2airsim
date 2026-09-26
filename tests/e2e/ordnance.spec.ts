// tests/e2e/ordnance.spec.ts
import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { startGame, type DiagWindow } from './harness.js'
import { SCENARIO_PARAM, SPAWN_PARAMS } from '../../src/render/spawn.js'
import { modelIO } from '../../tools/models/document.js'
import { measureDocument } from '../../tools/models/measure.js'

/**
 * Tier 2, O1 (ordnance spec §7): a released bomb and a rocket pair draw the generated store
 * models in flight, and the bomb is actually on screen. The reference GPU only; the README's
 * Tier 2 command. Airborne at 1,500 m over the strike range, chase camera.
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
  await page.waitForTimeout(1000) // the store models load after boot; the pools swap when they land
  await page.keyboard.press('KeyV')
  await page.waitForTimeout(1000) // about 5 m of fall: clear of the wing in the chase view
  const v = await view(page)
  expect(v.bombs).toBe(1)
  expect(v.bombTriangles).toBe(await triangles('content/ordnance/an-m65.glb'))
  expect(v.bombNdc, 'the bomb projects into the camera').not.toBeNull()
  expect(Math.abs(v.bombNdc![0])).toBeLessThan(1)
  expect(Math.abs(v.bombNdc![1])).toBeLessThan(1)
  const shot = await page.screenshot({ path: 'test-results/o1-bomb-in-flight.png' })
  const contrast = await blobContrast(page, shot, v.bombNdc!, v.bombRadiusPx!)
  console.log(`bomb at ndc ${v.bombNdc!.map((n) => n.toFixed(3)).join(', ')}, radius ${v.bombRadiusPx!.toFixed(1)} px, contrast ${contrast.toFixed(3)}`)
  expect(contrast).toBeGreaterThan(0.3)

  await page.keyboard.press('KeyE')
  await expect.poll(async () => (await view(page)).rockets, { timeout: 2_000 }).toBeGreaterThanOrEqual(2)
  expect((await view(page)).rocketTriangles).toBe(await triangles('content/ordnance/hvar.glb'))
  await page.screenshot({ path: 'test-results/o1-rockets-in-flight.png' })
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
})
