import { test, expect } from '@playwright/test'
import { spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'

/**
 * Tier 2, contact. Same platform and caveats as `adapter.spec.ts`.
 *
 * Both cases fly the airplane INTO something rather than constructing an
 * impact, because the thing under test is the whole production path --
 * `advance` classifying and freezing, `main.ts` raising the modal -- and a
 * constructed impact would skip most of it.
 *
 * Reads `window.__ww2.impact()`, not `frame().world.impact` (the brief's
 * original wording): `Ww2Diagnostics` deliberately exposes granular getters
 * -- `tick()`, `cameraMode()`, `controls()`, `look()`, `assists()` and now
 * `impact()` -- never the whole `FrameState`, so a caller here proves exactly
 * one field of it, the same way every other Tier 2 spec does (binding
 * ruling, Task 11; see the comment on `impact` in `src/render/diagnostics.ts`).
 */
test('going into the sea ends the flight and raises the debrief', async ({ page }) => {
  await page.goto(spawnUrl({ x: 0, y: 120, z: 0 }))
  await waitForTerrain(page)
  // Nose down, throttle closed, and wait: 120 m over open water at a steep
  // dive arrives in a few seconds.
  await page.keyboard.down('ArrowUp')
  await page.waitForSelector('[role="dialog"]', { timeout: 20000 })
  await page.keyboard.up('ArrowUp')

  const text = await page.locator('[role="dialog"]').innerText()
  expect(text).toContain('KILLED')
  expect(text).toContain('sea')

  const frozen = await page.evaluate(() => (window as DiagWindow).__ww2?.impact() ?? null)
  expect(frozen).not.toBeNull()
  expect(frozen!.surface).toBe('water')
})

test('restart puts a fresh airplane back in the air', async ({ page }) => {
  await page.goto(spawnUrl({ x: 0, y: 120, z: 0 }))
  await waitForTerrain(page)
  await page.keyboard.down('ArrowUp')
  await page.waitForSelector('[role="dialog"]', { timeout: 20000 })
  await page.keyboard.up('ArrowUp')

  await page.getByRole('button', { name: 'Restart' }).click()
  await expect(page.locator('[role="dialog"]')).toBeHidden()

  const after = await page.evaluate(() => (window as DiagWindow).__ww2?.impact() ?? null)
  expect(after).toBeNull()
})
