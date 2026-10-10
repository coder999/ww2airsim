import { mkdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { waitForTerrain, type DiagWindow } from './harness.js'

// Track L2's human viewing checkpoint. These fixed, paused views compare the
// original terrain edge against the Blender-built shoreline ribbon. Like the
// other capture tools, the ordinary suite skips it (docs/testing.md).
test.skip(process.env.E2E_CAPTURE !== '1', 'capture tool: set E2E_CAPTURE=1')

const OUT = process.env.E2E_CAPTURE_DIR ?? 'test-results/beaches'
const VIEWS = [
  { name: 'tacloban-low', x: -26000, y: 1800, z: -52000 },
  { name: 'tacloban-close', x: -24317, y: 600, z: -54383 },
  { name: 'tacloban-high', x: -30000, y: 3500, z: -50000 },
] as const

for (const view of VIEWS) for (const beaches of ['off', 'on'] as const) {
  test(`${view.name}: beaches ${beaches}`, async ({ page }) => {
    test.setTimeout(120_000)
    mkdirSync(OUT, { recursive: true })
    const consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 400))
    })
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.goto(`/?spawnX=${view.x}&spawnY=${view.y}&spawnZ=${view.z}&sceneryView=1&beaches=${beaches}`)
    await waitForTerrain(page)
    await page.waitForTimeout(3000)
    await page.screenshot({ path: `${OUT}/${view.name}-${beaches}.png` })
    expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
    expect(consoleErrors).toEqual([])
  })
}
