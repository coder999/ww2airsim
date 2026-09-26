import { expect, test, type Page } from '@playwright/test'
import sharp from 'sharp'
import { percentile, waitForTerrain, type DiagWindow } from './harness.js'
import { VIEWS } from './views.js'

const surface = (page: Page) =>
  page.evaluate(() => (window as DiagWindow).__ww2!.terrainSurface())
const errors = (page: Page) =>
  page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)
const view = (name: string): string => VIEWS.find(v => v.name === name)!.url
const withQuery = (url: string, q: string): string => url + (url.includes('?') ? '&' : '?') + q

/** Wait for the terrain without dismissing the Title dialog. `waitForTerrain`
 * starts the game, so the Settings-only test uses the same split wait as
 * settingsUi.spec.ts. */
async function waitForTerrainOnly(page: Page): Promise<void> {
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, {
    timeout: 30_000,
  })
}

test.describe('terrain textures (visual realism §2.1)', () => {
  test.setTimeout(120_000)

  test('load at the default tier and draw with zero validation errors', async ({ page }) => {
    await page.goto(view('runway'))
    await waitForTerrain(page)
    expect(await surface(page)).toEqual({ texturesLoaded: true, detail: true })
    expect(await errors(page)).toEqual([])
  })

  test('a failed texture fetch boots on the procedural surface (Review Focus 1)', async ({ page }) => {
    await page.route('**/content/textures/**', route => route.abort())
    await page.goto(view('runway'))
    await waitForTerrain(page)
    expect(await surface(page)).toEqual({ texturesLoaded: false, detail: false })
    expect(await errors(page)).toEqual([])
  })

  test('?terrainTextures=off changes the near ground and nothing breaks', async ({ page }) => {
    const shot = async (url: string): Promise<Buffer> => {
      await page.goto(url)
      await waitForTerrain(page)
      await page.waitForTimeout(1500)
      return page.screenshot()
    }
    const on = await shot(view('runway'))
    const off = await shot(withQuery(view('runway'), 'terrainTextures=off'))
    expect(await surface(page)).toEqual({ texturesLoaded: false, detail: false })
    // The unobstructed left-side ground is where the texture is legible. A
    // full-width crop dilutes it with the aircraft, runway, HUD and controls.
    const crop = async (bytes: Buffer): Promise<Buffer> => {
      const metadata = await sharp(bytes).metadata()
      return sharp(bytes).extract({
        left: 0,
        top: Math.floor(metadata.height! / 2),
        width: Math.floor(metadata.width! * 0.39),
        height: Math.floor(metadata.height! * 0.28),
      }).raw().toBuffer()
    }
    const [a, b] = await Promise.all([crop(on), crop(off)])
    let sum = 0
    for (let i = 0; i < a.length; i++) sum += Math.abs(a[i]! - b[i]!)
    // Measured 0.62 MAE on the reference GPU in Task 5. The value is a
    // regression floor, not a target; disabled detail is pixel-identical here.
    expect(sum / a.length).toBeGreaterThan(0.25)
  })

  test('scenery tier low <-> high swaps the terrain graph without validation errors (Review Focus 2)', async ({ page }) => {
    // Settings opens from the Title dialog. Keep it present while terrain loads;
    // `waitForTerrain` would press New game and dismiss it.
    await page.setViewportSize({ width: 2560, height: 1440 })
    await page.goto('/')
    await waitForTerrainOnly(page)
    await page.getByRole('dialog', { name: 'Title' }).getByRole('button', { name: 'Settings' }).click()
    const dialog = page.getByRole('dialog', { name: 'Settings' })
    await dialog.getByRole('button', { name: /Advanced/ }).click()
    const scenery = dialog.getByRole('radiogroup', { name: 'Scenery quality' })
    await scenery.getByRole('radio', { name: /Low\b/ }).click()
    await page.waitForTimeout(1500) // one pipeline recompile per ring
    expect(await surface(page)).toEqual({ texturesLoaded: true, detail: false })
    await scenery.getByRole('radio', { name: /High\b/ }).click()
    await page.waitForTimeout(1500)
    expect(await surface(page)).toEqual({ texturesLoaded: true, detail: true })
    expect(await errors(page)).toEqual([])
  })

  // terrain.spec.ts's sampling sequence (SETTLE 1.5 s, reset, 5 s window,
  // p95), at the two views where the near ground fills the most frame.
  for (const name of ['runway', 'low-land-600'] as const) {
    test(`GPU p95 at 1440p with textures on stays inside 6.0 ms at ${name}; on/off delta recorded`, async ({ page }) => {
      await page.setViewportSize({ width: 2560, height: 1440 })
      const p95 = async (url: string): Promise<number> => {
        await page.goto(url)
        await waitForTerrain(page)
        await page.waitForTimeout(1500)
        await page.evaluate(() => { (window as DiagWindow).__ww2!.resetFrameTimes() })
        await page.waitForTimeout(5000)
        const gpu = await page.evaluate(() => (window as DiagWindow).__ww2!.gpuFrameTimesMs())
        expect(gpu.length, 'too few GPU timestamp samples to take a percentile').toBeGreaterThan(100)
        return percentile(gpu, 0.95)
      }
      // Hold detail on while the one-shot quality probe runs; on a busy
      // desktop it may otherwise select scenery `low` during this 6.5 s window.
      const on = await p95(withQuery(view(name), 'terrainTextures=on'))
      expect(await surface(page)).toEqual({ texturesLoaded: true, detail: true })
      const off = await p95(withQuery(view(name), 'terrainTextures=off'))
      const detail = `${name}: textures on p95 ${on.toFixed(3)} ms, off ${off.toFixed(3)} ms, delta ${(on - off).toFixed(3)} ms`
      // Printed on a pass too: the handoff quotes this line (terrain.spec.ts's convention).
      console.log(`terrain textures budget: ${detail}`)
      test.info().annotations.push({ type: 'budget', description: detail })
      expect(on, detail).toBeLessThanOrEqual(6.0)
      expect(await errors(page)).toEqual([])
    })
  }
})
