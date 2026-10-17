import { expect, test } from '@playwright/test'
import type { DiagWindow } from './harness.js'

/**
 * F9 campaign scenes (plan 2026-10-17). The chapter scenes do not exist yet (F10), so this drives the demo opening on the
 * `escort` scenario through the DEV entry `?scene=` (a quick launch). Correctness only: the scene plays on its own world,
 * Esc skips it, and the flight is then live. Skip-equals-completion is proven headless (tests/render/sceneFlow.test.ts).
 */
test.setTimeout(180_000)

const scene = (page: import('@playwright/test').Page) => page.evaluate(() => (window as DiagWindow).__ww2?.scene() ?? null)
const tick = (page: import('@playwright/test').Page) => page.evaluate(() => (window as DiagWindow).__ww2?.tick() ?? 0)

test('the demo opening plays, Esc skips it to the handoff, and the flight resumes', async ({ page }) => {
  await page.goto('/?scenario=escort&launch&scene=demo-opening')
  await page.waitForFunction(() => (window as DiagWindow).__ww2?.scene() != null, undefined, { timeout: 90_000 })
  const playing = await scene(page)
  expect(playing?.id).toBe('demo-opening')
  const total = playing!.ticksLeft
  expect(total).toBeGreaterThan(0)
  // the scene is stepping its own world, and the HUD is hidden
  await page.waitForFunction((t) => ((window as DiagWindow).__ww2?.scene()?.ticksLeft ?? t) < t, total, { timeout: 30_000 })
  await expect(page.locator('#app')).toHaveClass(/replaying/)

  await page.keyboard.press('Escape')
  await page.waitForFunction(() => (window as DiagWindow).__ww2?.scene() == null, undefined, { timeout: 10_000 })
  // skip landed at the handoff: the whole pre-roll (15 s = 900 ticks) is behind us, and the flight is live
  const atHandoff = await tick(page)
  expect(atHandoff).toBeGreaterThanOrEqual(900)
  await page.waitForFunction((t) => ((window as DiagWindow).__ww2?.tick() ?? 0) > t + 30, atHandoff, { timeout: 30_000 })
})
