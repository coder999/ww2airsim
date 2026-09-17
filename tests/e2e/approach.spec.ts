import { test, expect } from '@playwright/test'
import { waitForTerrain, type DiagWindow } from './harness.js'

/**
 * Tier 2, the landing configuration. Same platform and caveats as
 * `adapter.spec.ts`: a real GPU on the Windows reference desktop, never hosted
 * CI.
 *
 * **What this deliberately does NOT do: fly an approach.** Plan 11b's approach
 * autopilot is a node-side test instrument in `tools/`, so it cannot reach the
 * browser, and hand-driving a five-kilometre approach through
 * `page.keyboard` would be a fragile test of the harness rather than of the
 * game. `tests/sim/landing.test.ts` flies the approach, headlessly, every
 * commit -- that is the right tier for it.
 *
 * What only Tier 2 can prove is the WIRING: that the flap lever a pilot
 * actually presses reaches `world.controls` in a real browser. That is the
 * Plan 3 defect class -- an assist that shipped inert while its own unit tests
 * passed, because they called the module directly -- and it is invisible to
 * every tier below this one.
 */
test('the gear and flap levers reach the simulation in a real browser', async ({ page }) => {
  // No query string: the DEFAULT spawn, parked on the runway with the gear
  // down. `?spawnX/Y/Z` would turn `groundSpawn` off and start the airplane
  // airborne with its gear up (see `hasSpawnOverride`, src/render/spawn.ts).
  await page.goto('/')
  await waitForTerrain(page)

  const controls = () => page.evaluate(() => (window as DiagWindow).__ww2!.controls())

  // Parked: the gear is down because a ground spawn starts on its wheels, and
  // the flaps are up because no airplane is left with them hanging out.
  const parked = await controls()
  expect(parked.gearDown).toBe(true)
  expect(parked.flapDown ?? false).toBe(false)

  // F lowers the flaps. Edge-triggered, so holding it is one command.
  await page.keyboard.down('KeyF')
  await page.waitForTimeout(300)
  await page.keyboard.up('KeyF')
  await expect.poll(async () => (await controls()).flapDown, { timeout: 5000 }).toBe(true)

  // And raises them again -- a lever, not a one-way switch.
  await page.keyboard.down('KeyF')
  await page.waitForTimeout(300)
  await page.keyboard.up('KeyF')
  await expect.poll(async () => (await controls()).flapDown, { timeout: 5000 }).toBe(false)

  // G still works, which is worth asserting beside it: the two levers share an
  // edge-detection shape, and a copy-paste that read the wrong `*Pressed`
  // field would break exactly one of them.
  await page.keyboard.down('KeyG')
  await page.waitForTimeout(300)
  await page.keyboard.up('KeyG')
  await expect.poll(async () => (await controls()).gearDown, { timeout: 5000 }).toBe(false)

  // Only trusted last, and only because every phase above proved it took
  // effect: an empty error list on a page where no key ever landed would be
  // indistinguishable from a passing run.
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
})
