import { test, expect } from '@playwright/test'
import { readdirSync } from 'node:fs'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { GROUND_CONTACT_TOLERANCE_M } from '../../src/sim/ground.js'
import { quickLaunch, waitForTerrain, type DiagWindow } from './harness.js'

/**
 * E2E, the definition of "onboarded" (docs/aircraft.md, Part H): every
 * flyable aircraft (one with a spec in content/aircraft/) launches from the
 * runway with its armament loaded, is drawn as itself, rolls, gets airborne
 * with no validation error, and releases a bomb if it carries any. A new
 * aircraft joins this list by existing; nothing is registered here.
 */
test.setTimeout(240_000)

const ids = readdirSync('content/aircraft').filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5))

for (const id of ids) {
  test(`${id}: launches loaded, takes off and drops its bombs`, async ({ page }) => {
    const spec = loadAircraftSpec(id)
    const bombs = spec.stores?.racks.length ?? 0
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.setViewportSize({ width: 1920, height: 1080 })
    await quickLaunch(page, { scenario: 'free-flight', aircraft: id, loadout: bombs > 0 ? 'bombs' : 'clean' })
    await waitForTerrain(page)
    await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.supportedContact()), { timeout: 20_000 }).toBe(true)
    expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
    expect(await page.evaluate(() => (window as DiagWindow).__ww2!.playerModel())).toBe(spec.view.model)
    expect(await page.evaluate(() => (window as DiagWindow).__ww2!.combat()!.player.stores.bombs)).toBe(bombs)
    await page.screenshot({ path: `test-results/flyable-${id}-parked.png` })

    await page.keyboard.down('Equal')
    await page.keyboard.down('ArrowDown')
    await page.waitForFunction(
      ([h, tol]) => {
        const d = (window as DiagWindow).__ww2!
        const g = d.groundHeightM()
        return g !== null && !d.supportedContact() && d.aircraftPositionM().y - h - g > tol
      },
      [spec.gear.heightM, GROUND_CONTACT_TOLERANCE_M] as const,
      { timeout: 120_000, polling: 250 },
    ).catch(async (e) => {
      throw e
    })
    await page.keyboard.up('ArrowDown')
    await page.keyboard.up('Equal')
    await page.screenshot({ path: `test-results/flyable-${id}-airborne.png` })

    if (bombs > 0) {
      await page.keyboard.down('KeyV')
      await page.waitForTimeout(120)
      await page.keyboard.up('KeyV')
      await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.combat()!.player.stores.bombs), { timeout: 5_000 }).toBe(bombs - 1)
    }
    const after = await page.evaluate(() => ({ impact: (window as DiagWindow).__ww2!.impact(), errors: (window as DiagWindow).__ww2!.validationErrors }))
    expect(after.errors).toEqual([])
    expect(errors).toEqual([])
  })
}
