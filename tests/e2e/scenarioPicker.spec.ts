import { test, expect } from '@playwright/test'
import { type DiagWindow } from './harness.js'
import { SCENARIO_PARAM } from '../../src/render/spawn.js'

/**
 * Tier 2, the title screen's scenario picker. What only a browser can prove:
 * picking a non-default scenario and pressing New game actually navigates to
 * `?scenario=<id>` (not just updates in-memory state), that the resulting
 * fresh boot's title screen preselects the scenario that is now actually
 * loaded, and that pressing New game a second time boots the REAL, different
 * entity list that scenario carries -- not just a relabelled default.
 */
test.setTimeout(120_000)

test('picking a scenario navigates to it, the reloaded title reflects it, and it actually loads', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto('/')
  const title = page.getByRole('dialog', { name: 'Title' })
  await expect(title).toBeVisible()

  const scenarioGroup = title.getByRole('radiogroup', { name: 'Scenario' })
  await expect(scenarioGroup.getByRole('radio', { name: 'Free Flight' })).toBeChecked()
  await expect(scenarioGroup.getByRole('radio', { name: 'Gunnery Range' })).toBeVisible()

  await scenarioGroup.getByRole('radio', { name: 'Gunnery Range' }).check()
  await title.getByRole('button', { name: 'New game' }).click()

  // A real navigation, not an in-place state change.
  await page.waitForURL((url) => url.searchParams.get(SCENARIO_PARAM) === 'gunnery-range', { timeout: 15_000 })

  // The reloaded page's title reflects what is now actually loaded, not the
  // production default.
  const reloadedTitle = page.getByRole('dialog', { name: 'Title' })
  await expect(reloadedTitle).toBeVisible()
  const reloadedScenarioGroup = reloadedTitle.getByRole('radiogroup', { name: 'Scenario' })
  await expect(reloadedScenarioGroup.getByRole('radio', { name: 'Gunnery Range' })).toBeChecked()
  await expect(reloadedScenarioGroup.getByRole('radio', { name: 'Free Flight' })).not.toBeChecked()

  await reloadedTitle.getByRole('button', { name: 'New game' }).click()
  await expect(reloadedTitle).toBeHidden()
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, {
    timeout: 30_000,
  })

  // The real, different entity list gunnery-range.json carries -- not
  // free-flight's f6f-2 wingman, and not an empty/default world relabelled.
  const ids = await page.evaluate(() => (window as DiagWindow).__ww2!.aircraft().map((a) => a.id))
  expect(ids.sort()).toEqual(['f6f-1', 'target-1', 'target-2'])

  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
  await page.screenshot({ path: 'test-results/scenario-picker.png' })
})

test('picking the already-loaded scenario does not navigate', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto('/')
  const title = page.getByRole('dialog', { name: 'Title' })
  await expect(title).toBeVisible()
  const urlBefore = page.url()

  // Free Flight is already checked (the production default) -- New game
  // should take the existing in-place path, not a reload.
  await title.getByRole('button', { name: 'New game' }).click()
  await expect(title).toBeHidden()
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, {
    timeout: 30_000,
  })
  expect(page.url()).toBe(urlBefore)

  const ids = await page.evaluate(() => (window as DiagWindow).__ww2!.aircraft().map((a) => a.id))
  expect(ids.sort()).toEqual(['f6f-1', 'f6f-2'])
})
