import { test, expect } from '@playwright/test'
import { toConditions } from './harness.js'

/**
 * Form 4 (Flight Conditions) opens on the mission's recommended weather and tags it. Convoy Strike recommends
 * Overcast (Mark, 2026-10-15: "start above the deck, then drop in on the convoy through the clouds"); a mission with
 * no recommendation keeps the build's random roll and tags nothing.
 */
test.setTimeout(120_000)

test('Convoy Strike opens on Overcast (recommended); a mission with no recommendation tags nothing', async ({ page }) => {
  await page.goto('/')
  const title = await toConditions(page, { scenario: 'Convoy Strike' })
  const clouds = title.getByRole('radiogroup', { name: 'Cloudiness' })
  await expect(clouds.getByRole('radio', { name: /Overcast \(recommended\)/ })).toHaveAttribute('aria-checked', 'true')
  await expect(clouds.getByRole('radio', { name: /recommended/ })).toHaveCount(1)
  // The player's own pick stands over the recommendation.
  await clouds.getByRole('radio', { name: /^(?:✕\s*)?Clear$/ }).check()
  await expect(clouds.getByRole('radio', { name: /^(?:✕\s*)?Clear$/ })).toHaveAttribute('aria-checked', 'true')

  await page.reload()
  const other = await toConditions(page, { scenario: 'Gunnery Range' })
  await expect(other.getByRole('radiogroup', { name: 'Cloudiness' }).getByRole('radio', { name: /recommended/ })).toHaveCount(0)
})
