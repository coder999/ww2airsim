import { test, expect } from '@playwright/test'
import { type DiagWindow } from './harness.js'

/**
 * Tier 2, the title screen's scenario picker. Plan 9 Task 7: picking a
 * scenario no longer navigates to `?scenario=<id>` and reloads -- it swaps
 * the entity list in place, via `main.ts`'s `loadScenario`. What only a
 * browser can prove is that this stays true end to end: the URL never
 * changes, the title hides immediately (there is no reload to wait out),
 * and the world that comes up carries the REAL, different entity list the
 * picked scenario declares -- not just a relabelled default and not the
 * previous scenario's meshes left over.
 */
test.setTimeout(120_000)

test('picking a different scenario swaps entities in place, with no navigation', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto('/')
  const title = page.getByRole('dialog', { name: 'Title' })
  await expect(title).toBeVisible()
  const urlBefore = page.url()

  const scenarioGroup = title.getByRole('radiogroup', { name: 'Scenario' })
  await expect(scenarioGroup.getByRole('radio', { name: 'Free Flight' })).toBeChecked()
  await expect(scenarioGroup.getByRole('radio', { name: 'Gunnery Range' })).toBeVisible()

  await scenarioGroup.getByRole('radio', { name: 'Gunnery Range' }).check()
  await title.getByRole('button', { name: 'New game' }).click()

  // No reload: the title hides immediately and the URL never carries
  // `?scenario=`, unlike the pre-Task-7 navigation this replaces.
  await expect(title).toBeHidden()
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, {
    timeout: 30_000,
  })
  expect(page.url()).toBe(urlBefore)

  // The real, different entity list gunnery-range.json carries -- not
  // free-flight's f6f-2 wingman, and not an empty/default world relabelled.
  const ids = await page.evaluate(() => (window as DiagWindow).__ww2!.aircraft().map((a) => a.id))
  expect(ids.sort()).toEqual(['f6f-1', 'target-1', 'target-2'])

  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
  await page.screenshot({ path: 'test-results/scenario-picker.png' })
})

test('picking the already-loaded scenario also stays in place (the same code path, scenarioId === requestedScenarioId)', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto('/')
  const title = page.getByRole('dialog', { name: 'Title' })
  await expect(title).toBeVisible()
  const urlBefore = page.url()

  // Free Flight is already checked (the production default).
  await title.getByRole('button', { name: 'New game' }).click()
  await expect(title).toBeHidden()
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, {
    timeout: 30_000,
  })
  expect(page.url()).toBe(urlBefore)

  const ids = await page.evaluate(() => (window as DiagWindow).__ww2!.aircraft().map((a) => a.id))
  expect(ids.sort()).toEqual(['f6f-1', 'f6f-2'])
})
