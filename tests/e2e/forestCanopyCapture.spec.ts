import { mkdirSync, writeFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import sharp from 'sharp'
import { spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'
import { withParams } from './views.js'
import { compareLooks, type Image } from '../../tools/terrain/forestLook.js'

/**
 * Forest canopy rework, Tasks 6 and 8 (2026-10-16): matched frozen-view captures for two settings and the D8 look
 * statistics between them. A capture tool, not a test: `npm run capture:e2e -- forestCanopyCapture.spec.ts`.
 *   FOREST_LOOK_A / FOREST_LOOK_B  query strings for the two settings (default `forestCanopy=current` and `forestCanopy=relief`)
 *   FOREST_LOOK_VIEWS              comma list of view names (default all)
 *   E2E_CAPTURE_DIR                output; writes <view>-a.png, <view>-b.png, look.json and look.md
 * The table is reported with tolerances (tools/terrain/forestLook.ts), never asserted: Mark's eye decides.
 */
test.skip(process.env.E2E_CAPTURE !== '1', 'capture tool: set E2E_CAPTURE=1')
test.setTimeout(1_800_000)
const OUT = process.env.E2E_CAPTURE_DIR ?? 'test-results/forest-look'
const SETTING_A = process.env.FOREST_LOOK_A ?? 'forestCanopy=current'
const SETTING_B = process.env.FOREST_LOOK_B ?? 'forestCanopy=relief'
const TAC = { x: -29666, z: -47605 }
const FROZEN = { sceneryView: '1', launch: '1', timeOfDay: '12', cloudTier: 'off', oceanTier: 'high' }
const frozen = (p: { x: number; y: number; z: number }, look: string, extra: Record<string, string> = {}) =>
  withParams(spawnUrl(p), { ...FROZEN, look, ...extra })
/** Metres: 1,000 ft = 304.8, 6,000 ft = 1828.8. */
export const LOOK_VIEWS: readonly { name: string; url: string; frozen: boolean }[] = [
  { name: 'runway-low', url: withParams('/', { ...FROZEN, look: '0,3' }), frozen: true },
  { name: 'ridge-6000ft', url: frozen({ x: -63000, y: 1828.8, z: -32000 }, '0,-12'), frozen: true },
  { name: 'inland-6000ft', url: frozen({ x: -63000, y: 1828.8, z: -32000 }, '180,-10'), frozen: true },
  { name: 'ridge-side-6000ft', url: frozen({ x: -63000, y: 1828.8, z: -32000 }, '90,-10'), frozen: true },
  { name: 'forward-1500ft', url: frozen({ x: -36629, y: 457.2, z: -47829 }, '0,-15'), frozen: true },
  { name: 'side-1000ft', url: frozen({ x: -36629, y: 304.8, z: -47829 }, '90,-6'), frozen: true },
  { name: 'grazing-250ft', url: frozen({ x: -36629, y: 76.2, z: -47829 }, '0,1'), frozen: true },
  { name: 'photo', url: withParams('/', { ...FROZEN, look: '55,30', cloudTier: 'high' }), frozen: true },
  { name: 'under-cloud', url: frozen({ x: TAC.x, y: 1200, z: TAC.z - 8000 }, '0,6', { cloudTier: 'high' }), frozen: true },
]
const want = process.env.FOREST_LOOK_VIEWS ? new Set(process.env.FOREST_LOOK_VIEWS.split(',')) : null

async function shoot(page: import('@playwright/test').Page, view: (typeof LOOK_VIEWS)[number], setting: string, file: string): Promise<Image> {
  await page.goto(view.url + (view.url.includes('?') ? '&' : '?') + setting)
  if (view.frozen) await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, { timeout: 60000 })
  else await waitForTerrain(page)
  await expect.poll(() => page.evaluate(() => { const v = (window as DiagWindow).__ww2!.vegetation(); return !!v && v.distant.pending === 0 && v.coarse.pending === 0 }), { timeout: 60000 }).toBe(true)
  await page.waitForFunction(() => (window as DiagWindow).__ww2!.canopy().ready, undefined, { timeout: 60000 })
  if (setting.includes('forestCanopy=relief')) await page.waitForFunction(() => (window as DiagWindow).__ww2!.forestCanopy().reliefReady, undefined, { timeout: 60000 })
  // The look statistics and the pictures are of the world: hide every overlay (HUD, dev readout, pause banner) but keep the canvas.
  await page.addStyleTag({ content: '#app > :not(canvas), body > pre { visibility: hidden !important }' })
  await page.waitForTimeout(5000)
  const png = await page.screenshot({ type: 'png' })
  writeFileSync(file, png)
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height, channels: 3 }
}

test('forest look: matched captures and statistics', async ({ page }) => {
  mkdirSync(OUT, { recursive: true })
  await page.setViewportSize({ width: 2560, height: 1440 })
  const rows: { view: string; setA: string; setB: string; comparison: ReturnType<typeof compareLooks> }[] = []
  for (const view of LOOK_VIEWS) {
    if (want && !want.has(view.name)) continue
    const a = await shoot(page, view, SETTING_A, `${OUT}/${view.name}-a.png`)
    const b = await shoot(page, view, SETTING_B, `${OUT}/${view.name}-b.png`)
    const comparison = compareLooks(a, b)
    rows.push({ view: view.name, setA: SETTING_A, setB: SETTING_B, comparison })
    console.log(`FOREST_LOOK ${view.name} ${JSON.stringify({ change: comparison.change, mad: comparison.meanAbsDifference, outside: comparison.outside })}`)
    writeFileSync(`${OUT}/look.json`, JSON.stringify(rows, null, 2) + '\n')
  }
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`
  const md = ['| View | Luminance A \\| B | Canopy A \\| B | Edges A \\| B | Outline A \\| B | Mean abs diff | Outside tolerance |', '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map(({ view, comparison: c }) => `| ${view} | ${c.a.meanLuminance.toFixed(3)} \\| ${c.b.meanLuminance.toFixed(3)} (${pct(c.change.meanLuminance)}) | ${pct(c.a.canopyCoverage)} \\| ${pct(c.b.canopyCoverage)} | ${c.a.edgeCount} \\| ${c.b.edgeCount} (${pct(c.change.edgeCount)}) | ${c.a.silhouetteCount} \\| ${c.b.silhouetteCount} (${pct(c.change.silhouetteCount)}) | ${pct(c.meanAbsDifference)} | ${c.outside.join(', ') || 'none'} |`)]
  writeFileSync(`${OUT}/look.md`, `A = \`${SETTING_A}\`, B = \`${SETTING_B}\`\n\n${md.join('\n')}\n`)
})
