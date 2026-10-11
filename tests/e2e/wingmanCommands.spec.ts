import { test, expect, type Page } from '@playwright/test'
import { waitForTerrain, type DiagWindow } from './harness.js'
import { SCENARIO_PARAM } from '../../src/render/spawn.js'
import { BINDINGS } from '../../src/input/bindings.js'
import { WINGMAN_RADIO } from '../../src/render/frame.js'

/**
 * E4 (Mark, 2026-10-10): the player's three calls to his wingman reach the
 * running game. `furball-range`'s `ally-1` flies on the player (7f). Wiring
 * only: what each call makes the wingman fly is `tests/sim/ai/wingmanOrders.test.ts`.
 */
const FURBALL = `/?${SCENARIO_PARAM}=furball-range`

test.setTimeout(180_000)

const orderOf = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.aircraft().find((a) => a.id === 'ally-1')?.order ?? null)

test('wingman calls: each key gives ally-1 its order and puts the answer on the radio line', async ({ page }) => {
  await page.goto(FURBALL)
  await waitForTerrain(page)
  const radio = page.getByRole('status', { name: 'Radio' })
  expect(await orderOf(page)).toBeNull()

  const calls = [
    { key: BINDINGS.wingmanCover[0], order: 'cover', text: WINGMAN_RADIO.cover },
    { key: BINDINGS.wingmanFormUp[0], order: 'form', text: WINGMAN_RADIO.form },
    { key: BINDINGS.wingmanAttack[0], order: 'attack', text: WINGMAN_RADIO.attack },
  ] as const
  for (const c of calls) {
    await page.keyboard.press(c.key)
    await expect.poll(() => orderOf(page), { timeout: 5_000 }).toBe(c.order)
    // Each answer holds the line for RADIO_SHOW_MS, so the next one waits its turn.
    await expect(radio).toHaveText(c.text, { timeout: 15_000 })
  }
  await page.screenshot({ path: 'test-results/wingman-commands.png' })
})
