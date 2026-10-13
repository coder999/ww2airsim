import { mkdir } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { waitForTerrain } from './harness.js'
import { takramFlightUrl, validationErrors } from './takramGameHarness.js'

test.skip(process.env.E2E_CAPTURE !== '1', 'capture tool, not a correctness test')

test('captures the final Takram game checkpoint', async ({ page }) => {
  test.setTimeout(180_000)
  const renderer = process.env.TAKRAM_RENDERER === 'takram-tsl' ? 'takram-tsl' : 'takram'
  const output = `artifacts/clouds-${renderer}-game`
  await mkdir(output, { recursive: true })
  await page.setViewportSize({ width: 2560, height: 1440 })
  for (const [name, y] of [['under', 1300], ['inside', 1800], ['above', 3200]] as const) {
    await page.goto(takramFlightUrl(y, renderer))
    await waitForTerrain(page)
    await page.waitForTimeout(6000)
    await page.screenshot({ path: `${output}/${name}.png` })
    expect(await validationErrors(page)).toEqual([])
  }
})
