import { expect, test, type Page } from '@playwright/test'
import { percentile, TRIPWIRE_1440P_P95_MS, waitForTerrain, type DiagWindow } from './harness.js'
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

  test('?terrainTextures=off turns the texture detail off and nothing breaks', async ({ page }) => {
    // State, not pixels: the detail's on/off screen difference is under 1/255 (measured
    // 2026-09-30), so a screenshot diff sat in noise. The graph wiring is unit-tested in
    // tests/render/terrainSurface.test.ts.
    for (const [url, expected] of [
      [view('runway'), { texturesLoaded: true, detail: true }],
      [withQuery(view('runway'), 'terrainTextures=off'), { texturesLoaded: false, detail: false }],
    ] as const) {
      await page.goto(url)
      await waitForTerrain(page)
      await expect.poll(() => surface(page), { timeout: 30_000 }).toEqual(expected)
      expect(await errors(page)).toEqual([])
    }
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

  // Textures cost 4.1 ms at the runway view (on 8.31-8.35 ms, off 4.2 ms, measured 2026-09-29),
  // which straddles the 8.33 ms tripwire with GPU load. Mark set 9.0 ms for this view that day.
  // H0 (2026-10-10, three runs on the reference GPU): on 8.65 ms, off 8.55, a 0.10 ms delta. The runway
  // view's cost is now its clouds (6.65 of 8.96 ms by H0's ablation). H0's rule caps a tripwire at the 8.33 gate;
  // Mark kept 9.0 here as an exception (2026-10-10, H0 ruling 4).
  const RUNWAY_TEXTURES_P95_MS = 9.0

  // terrain.spec.ts's sampling sequence (SETTLE 1.5 s, reset, 5 s window,
  // p95), at the two views where the near ground fills the most frame.
  for (const name of ['runway', 'low-land-600'] as const) {
    test(`GPU p95 at 1440p with textures on stays inside the budget at ${name}; on/off delta recorded`, async ({ page }) => {
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
      expect(on, detail).toBeLessThanOrEqual(name === 'runway' ? RUNWAY_TEXTURES_P95_MS : TRIPWIRE_1440P_P95_MS)
      expect(await errors(page)).toEqual([])
    })
  }
})
