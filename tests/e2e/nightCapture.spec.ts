import { mkdirSync } from 'node:fs'
import { test, type Page } from '@playwright/test'
import { spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'
import { withParams } from './views.js'
import { frameStats } from './nightStats.js'

// F6A night renderer (docs/night.md): captures of the night look at fixed sun
// elevations, for a person to read, with the frame statistics night.spec.ts
// asserts on printed beside them. A capture tool: skipped unless E2E_CAPTURE=1
// (docs/testing.md). The nexus 680M is fine for look only.
test.skip(process.env.E2E_CAPTURE !== '1', 'capture tool: set E2E_CAPTURE=1')
const OUT = process.env.E2E_CAPTURE_DIR ?? 'test-results/night'
const EXTRA = process.env.NIGHT_QUERY ?? ''
test.setTimeout(240_000)
const TAC = { x: -29666, z: -47605 }
/** Hours on day 294 at Leyte: sun about -6, -9 and -46 deg (sun.ts; the spec asserts the elevations). */
export const HOURS = [{ name: 'sun-6', hour: 18.33 }, { name: 'sun-9', hour: 18.5 }, { name: 'sun-46', hour: 21 }] as const

export async function heldView(page: Page, url: string): Promise<void> {
  await page.goto(url)
  await waitForTerrain(page)
  await page.waitForTimeout(2500)
}

for (const h of HOURS) {
  test(`capture ${h.name}`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true })
    await page.setViewportSize({ width: 1920, height: 1080 })
    const extra = Object.fromEntries(new URLSearchParams(EXTRA))
    await heldView(page, withParams(spawnUrl({ x: TAC.x, y: 600, z: TAC.z - 6000 }), { timeOfDay: String(h.hour), cloudTier: 'off', ...extra }))
    const png = await page.screenshot({ path: `${OUT}/${h.name}.png` })
    const s = await page.evaluate(() => (window as DiagWindow).__ww2!.sun())
    console.log(h.name, `elev ${s.elevationDeg.toFixed(1)}`, JSON.stringify(await frameStats(page, png)))
  })
}

// The fixed moon (az 250, el 40) for a plane heading 090: 160 deg to the right of the nose = look yaw +200 (left positive).
test('capture moon', async ({ page }) => {
  mkdirSync(OUT, { recursive: true })
  await page.setViewportSize({ width: 1920, height: 1080 })
  await heldView(page, withParams(spawnUrl({ x: TAC.x, y: 600, z: TAC.z - 6000 }), { timeOfDay: '21', cloudTier: 'off', look: '200,40' }))
  await page.screenshot({ path: `${OUT}/moon.png` })
})
