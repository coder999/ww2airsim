import { mkdirSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { waitForTerrain, spawnUrl, type DiagWindow } from './harness.js'
import { withParams } from './views.js'

// L3 Phase 0b: shipping terrain, the best existing drape and the whole-map
// synthetic ground at the same views and three altitudes, for a human to read
// against OpenSkyFlight (docs/superpowers/plans/2026-10-09-l3-land-quality.md).
// A capture tool, not a test: skipped unless E2E_CAPTURE=1 (docs/testing.md).
test.skip(process.env.E2E_CAPTURE !== '1', 'capture tool: set E2E_CAPTURE=1')
const OUT = process.env.E2E_CAPTURE_DIR ?? 'test-results/land-gap'
// Centre of the synthsr bake (content/drape-spike/drape-synthsr.json), heading east.
const C = { x: -31629, z: -47829 }
const FT = 0.3048
const VIEWS = [
  { name: 'alt-1000ft', x: C.x - 5000, y: 1000 * FT },
  { name: 'alt-4000ft', x: C.x - 6000, y: 4000 * FT },
  { name: 'alt-13000ft', x: C.x - 6500, y: 13000 * FT },
] as const
const VARIANTS = (process.env.DRAPE_VARIANTS ?? 'off,synth,synthsr').split(',')
test.setTimeout(150_000)
for (const view of VIEWS) for (const v of VARIANTS) {
  test(`${view.name} ${v}`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true })
    const errors: string[] = []
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 400)) })
    await page.setViewportSize({ width: 1920, height: 1080 })
    const url = spawnUrl({ x: view.x, y: view.y, z: C.z })
    await page.goto(withParams(url, { sceneryView: '1', cloudTier: 'off', oceanTier: 'high', ...(v === 'off' ? {} : { drape: v }) }))
    await waitForTerrain(page)
    await page.waitForTimeout(3000)
    await page.keyboard.press('Slash')
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${OUT}/${view.name}-${v}.png` })
    expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
    expect(errors).toEqual([])
  })
}
