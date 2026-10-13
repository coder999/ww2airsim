import { mkdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import type { HangarWindow } from '../../src/render/hangar/hooks.js'
import { quickLaunch, waitForTerrain, type DiagWindow } from './harness.js'

/** Final-product checkpoint for the PBY-5A. Pixels are review evidence, not a correctness oracle. */
test.skip(process.env.E2E_CAPTURE !== '1', 'capture tool: set E2E_CAPTURE=1')
test.setTimeout(180_000)

const OUT = process.env.E2E_CAPTURE_DIR ?? 'test-results/pby-5a'
const settle = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

test('Catalina Hangar and water-operation views', async ({ page }) => {
  mkdirSync(OUT, { recursive: true })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 400)) })
  await page.setViewportSize({ width: 1920, height: 1080 })

  await page.goto('/hangar.html?bench')
  await page.waitForFunction(() => (window as HangarWindow).__hangar !== undefined, undefined, { timeout: 30_000 })
  await page.evaluate(() => (window as HangarWindow).__hangar!.ready)
  await page.evaluate(() => (window as HangarWindow).__hangar!.freeze())
  await page.evaluate(() => (window as HangarWindow).__hangar!.select('pby-5a-catalina'))
  const collapse = page.getByRole('button', { name: 'Collapse details' })
  if (await collapse.isVisible()) await collapse.click()

  await page.evaluate(() => (window as HangarWindow).__hangar!.camera('three-quarter'))
  await page.evaluate(() => (window as HangarWindow).__hangar!.pose({ gearFraction: 1, flapFraction: 1, bombs: true }))
  await page.evaluate(settle)
  await page.locator('#hangar-canvas').screenshot({ path: `${OUT}/pby-5a-hangar-gear-floats-down-bombs.png` })

  await page.evaluate(() => (window as HangarWindow).__hangar!.pose({ gearFraction: 0.5, flapFraction: 1, bombs: true }))
  await page.evaluate(settle)
  await page.locator('#hangar-canvas').screenshot({ path: `${OUT}/pby-5a-hangar-gear-mid-cycle.png` })

  await page.evaluate(() => (window as HangarWindow).__hangar!.camera('side'))
  await page.evaluate(() => (window as HangarWindow).__hangar!.pose({ gearFraction: 0, flapFraction: 0, bombs: false }))
  await page.evaluate(settle)
  await page.locator('#hangar-canvas').screenshot({ path: `${OUT}/pby-5a-hangar-clean-side.png` })
  expect(await page.evaluate(() => (window as HangarWindow).__hangar!.validationErrors)).toEqual([])

  await quickLaunch(page, { scenario: 'water-quals', aircraft: 'pby-5a-catalina', loadout: 'torpedoes' })
  await waitForTerrain(page)
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/pby-5a-afloat-torpedoes.png` })
  const restY = await page.evaluate(() => (window as DiagWindow).__ww2!.playerFlight()!.state.position.y)
  await page.keyboard.down('Equal')
  await page.keyboard.down('ArrowDown')
  try {
    await page.waitForFunction((y) => {
      const flight = (window as DiagWindow).__ww2!.playerFlight()!
      return Math.hypot(flight.state.velocity.x, flight.state.velocity.z) > flight.spec.waterOperations!.planingSpeedMps + 5
        && flight.state.position.y < y + 1.5
    }, restY, { timeout: 120_000, polling: 100 })
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${OUT}/pby-5a-on-step-wake-torpedoes.png` })
    await page.waitForFunction((y) => (window as DiagWindow).__ww2!.aircraftPositionM().y > y + 10, restY, { timeout: 120_000, polling: 250 })
  } finally {
    await page.keyboard.up('ArrowDown')
    await page.keyboard.up('Equal')
  }
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/pby-5a-water-takeoff-torpedoes.png` })
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
  expect(errors).toEqual([])
})
