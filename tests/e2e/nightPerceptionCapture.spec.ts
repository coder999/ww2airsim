import { mkdirSync } from 'node:fs'
import { test, type Page } from '@playwright/test'
import { spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'
import { withParams } from './views.js'

// F6B checkpoint 1 captures (docs/night.md, "Perception"): the night patrol, lit and blacked out, with what each
// Zero sees printed beside each frame. A capture tool: skipped unless E2E_CAPTURE=1. Look only; the wiring is asserted
// in nightPerception.spec.ts.
test.skip(process.env.E2E_CAPTURE !== '1', 'capture tool: set E2E_CAPTURE=1')
const OUT = process.env.E2E_CAPTURE_DIR ?? 'test-results/night-perception'
test.setTimeout(240_000)
const START = { x: -14000, y: 1500, z: -50805 }
const QUERY = { scenario: 'night-patrol', launch: '1', aircraft: 'f6f-hellcat', loadout: 'clean', cloudTier: 'off', god: '1' }

async function shot(page: Page, name: string): Promise<void> {
  const p = await page.evaluate(() => (window as DiagWindow).__ww2!.perception())
  console.log(name, JSON.stringify({ lit: p.playerLit, rangeMi: +(p.playerRangeM / 1609.344).toFixed(2), rows: p.rows.map((r) => ({ id: r.id, mi: +(r.distanceM / 1609.344).toFixed(2), sees: r.sees, targets: r.targetsPlayer })) }))
  await page.screenshot({ path: `${OUT}/${name}.png` })
}

for (const dark of [false, true]) {
  test(`capture patrol ${dark ? 'blacked out' : 'lit'}`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true })
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.goto(withParams(spawnUrl(START), { ...QUERY, look: '-25,-2' }))
    await waitForTerrain(page)
    await page.waitForTimeout(1500)
    if (dark) await page.keyboard.press('n')
    const tag = dark ? 'dark' : 'lit'
    for (const [i, wait] of [[0, 1000], [1, 14000], [2, 14000]] as const) {
      await page.waitForTimeout(wait)
      await shot(page, `patrol-${tag}-${i}`)
    }
  })
}
