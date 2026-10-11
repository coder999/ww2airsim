import { expect, test } from '@playwright/test'
import { quickLaunch, waitForTerrain, type DiagWindow } from './harness.js'

test.setTimeout(120_000)
test.use({ viewport: { width: 2560, height: 1440 } })

test('Tank Buster renders its armor column and exposes its live objectives', async ({ page }) => {
  await quickLaunch(page, { scenario: 'tank-buster', aircraft: 'f6f-hellcat', loadout: 'both' })
  await waitForTerrain(page)
  await page.waitForTimeout(500)

  const state = await page.evaluate(() => {
    const diagnostics = (window as DiagWindow).__ww2!
    return {
      tanks: diagnostics.structures().filter((structure) => structure.id.startsWith('tank-')),
      vehicleModelCount: diagnostics.vehicleModelCount(),
      stores: diagnostics.combat()!.player.stores,
      errors: diagnostics.validationErrors,
    }
  })
  expect(state.tanks).toHaveLength(6)
  expect(state.vehicleModelCount).toBe(6)
  expect(state.tanks.map((tank) => tank.hp)).toEqual([48, 48, 48, 48, 48, 48])
  expect(state.stores).toEqual({ bombs: 2, rockets: 6 })
  expect(state.errors, `WebGPU validation errors:\n${JSON.stringify(state.errors, null, 2)}`).toEqual([])

  await page.keyboard.press('Escape')
  const pause = page.getByRole('dialog', { name: 'Pause menu' })
  await expect(pause).toBeVisible()
  await expect(pause.getByRole('tabpanel', { name: 'Tally' }).getByText('Break the tank column')).toBeVisible()
  await expect(pause.getByRole('tabpanel', { name: 'Tally' }).getByText('Recover at Tacloban')).toBeVisible()

  await pause.getByRole('tab', { name: 'Mission Description' }).click()
  await expect(pause.getByRole('tabpanel', { name: 'Mission Description' })).toContainText(
    'Japanese tank column is moving inland southwest of Dulag',
  )
})
