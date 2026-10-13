import { expect, test } from '@playwright/test'
import { quickLaunch, waitForTerrain, type DiagWindow } from './harness.js'

/**
 * Browser wiring for the first water-capable aircraft. The deterministic
 * waterOperations suite owns the force/contact envelope; this proves the
 * shipped mission actually boots in that state and can fly out of it through
 * the real input and render loop.
 */
test('the Catalina starts afloat with torpedoes and makes a water takeoff', async ({ page }) => {
  test.setTimeout(180_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 400)) })
  await page.setViewportSize({ width: 1920, height: 1080 })
  await quickLaunch(page, { scenario: 'water-quals', aircraft: 'pby-5a-catalina', loadout: 'torpedoes' })
  await waitForTerrain(page)

  const start = await page.evaluate(() => {
    const d = (window as DiagWindow).__ww2!
    const flight = d.playerFlight()!
    return {
      model: d.playerModel(),
      positionY: flight.state.position.y,
      gear: flight.state.gearFraction,
      floats: flight.state.flapFraction,
      hullDepth: flight.spec.waterOperations!.hullDepthM,
      stores: d.combat()!.player.stores,
      impact: d.impact(),
      validationErrors: d.validationErrors,
    }
  })
  expect(start).toMatchObject({
    model: 'pby-5a-catalina', gear: 0, floats: 1,
    stores: { bombs: 2, rockets: 0 }, impact: null, validationErrors: [],
  })
  expect(start.positionY).toBeCloseTo(start.hullDepth, 3)

  await page.keyboard.down('Equal')
  await page.keyboard.down('ArrowDown')
  try {
    await page.waitForFunction(
      (restY) => {
        const flight = (window as DiagWindow).__ww2!.playerFlight()
        return flight !== null && flight.state.position.y > restY + 10 && flight.state.velocity.y > 0
      },
      start.hullDepth,
      { timeout: 120_000, polling: 250 },
    )
  } finally {
    await page.keyboard.up('ArrowDown')
    await page.keyboard.up('Equal')
  }

  await page.keyboard.down('KeyF')
  await page.waitForTimeout(120)
  await page.keyboard.up('KeyF')
  await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.playerFlight()!.state.flapFraction), { timeout: 30_000 }).toBe(0)
  const after = await page.evaluate(() => ({
    y: (window as DiagWindow).__ww2!.aircraftPositionM().y,
    impact: (window as DiagWindow).__ww2!.impact(),
    validationErrors: (window as DiagWindow).__ww2!.validationErrors,
  }))
  expect(after.y).toBeGreaterThan(start.hullDepth + 10)
  expect(after.impact).toBeNull()
  expect(after.validationErrors).toEqual([])
  expect(errors).toEqual([])
})
