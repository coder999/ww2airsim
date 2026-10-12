import { expect, test } from '@playwright/test'
import { readFileSync, readdirSync } from 'node:fs'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { cockpitFor } from '../../src/render/scene/cockpitLayouts.js'
import { spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'
import { withParams } from './views.js'

/**
 * C3's final human checkpoint: one matched 1440p cockpit frame for every
 * flyable aircraft. The four family representatives are selected from these
 * images and all fourteen are reduced into a contact sheet after the run.
 * A capture tool, not a correctness test (docs/testing.md).
 */
test.setTimeout(180_000)
test.skip(process.env.E2E_CAPTURE !== '1', 'capture tool: set E2E_CAPTURE=1')
test.describe.configure({ mode: 'serial' })

const OUT = process.env.E2E_CAPTURE_DIR ?? 'test-results/c3-cockpits'
const LOADOUT = process.env.E2E_COCKPIT_LOADOUT ?? 'clean'
const ids = readdirSync('content/aircraft')
  .filter((name) => name.endsWith('.json'))
  .map((name) => name.slice(0, -5))
  .sort()

for (const id of ids) {
  test(`capture cockpit: ${id}`, async ({ page }) => {
    const config = cockpitFor(loadAircraftSpec(id))
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text().slice(0, 400))
    })

    await page.setViewportSize({ width: 2560, height: 1440 })
    await page.goto(withParams(spawnUrl({ x: 0, y: 1500, z: 0 }), {
      scenario: 'free-flight',
      launch: '1',
      aircraft: id,
      loadout: LOADOUT,
      cloudTier: 'off',
      oceanTier: 'high',
    }))
    await waitForTerrain(page)
    for (let i = 0; i < 4 && (await page.evaluate(() => (window as DiagWindow).__ww2!.cameraMode())) !== 'cockpit'; i++) {
      await page.keyboard.press('KeyC')
    }
    await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.cameraMode())).toBe('cockpit')
    await page.keyboard.press('Slash')
    await page.keyboard.down('Equal')
    await page.waitForTimeout(900)
    await page.keyboard.up('Equal')
    await page.waitForTimeout(400)

    await page.screenshot({ path: `${OUT}/${config.layout.id}--${id}.png` })
    expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
    expect(errors).toEqual([])
  })
}

test('capture cockpit: all-aircraft contact sheet', async ({ page }) => {
  const cards = ids.map((id) => {
    const family = cockpitFor(loadAircraftSpec(id)).layout.id
    const png = readFileSync(`${OUT}/${family}--${id}.png`).toString('base64')
    return `<figure><img src="data:image/png;base64,${png}"><figcaption>${family}<br><b>${id}</b></figcaption></figure>`
  }).join('')
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.setContent(`<!doctype html><style>
    * { box-sizing: border-box } body { margin: 0; padding: 18px; background: #11171b; color: #eef3f4;
      font: 17px/1.2 ui-monospace, monospace } h1 { margin: 0 0 14px; font-size: 24px; font-weight: 600 }
    main { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px }
    figure { margin: 0; padding: 5px; background: #263138; border: 1px solid #52636b }
    img { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: cover }
    figcaption { padding: 5px 3px 2px; color: #b9c5ca } b { color: #fff }
  </style><h1>C3 cockpit substitutions — 14 aircraft / four families</h1><main>${cards}</main>`)
  await page.screenshot({ path: `${OUT}/all-aircraft-contact-sheet.png`, fullPage: true })
})
