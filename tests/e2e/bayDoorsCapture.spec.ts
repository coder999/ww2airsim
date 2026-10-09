// tests/e2e/bayDoorsCapture.spec.ts
import { mkdirSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'
import { SCENARIO_PARAM } from '../../src/render/spawn.js'

// A capture tool, not a test: a plain E2E run skips it (docs/testing.md, "Philosophy"). The C2 viewing
// checkpoint, a flown drop: V with the doors shut (the notice), O, V again (the bomb leaves). That the
// gate holds and the doors travel is asserted in Node (tests/sim/bayDoors.test.ts, combat.test.ts,
// frame.test.ts); this is for Mark's eye, and it reads the state back so a capture of nothing fails loudly.
test.skip(!process.env.E2E_CAPTURE, 'set E2E_CAPTURE=1 to run the bay-door capture')

const OUT = process.env.CAPTURE_DIR ?? 'test-results/bay-doors'

test('a B-29 drop, flown: refused shut, then doors open and a bomb away (C2 checkpoint)', async ({ page }) => {
  test.setTimeout(180_000)
  mkdirSync(OUT, { recursive: true })
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto(`${spawnUrl({ x: 0, y: 2500, z: 0 })}&${SCENARIO_PARAM}=strike-range&launch&aircraft=b-29-superfortress&loadout=bombs`)
  await waitForTerrain(page)
  const doors = () => page.evaluate(() => (window as DiagWindow).__ww2!.playerFlight()!.state.bayDoorFraction)
  // The quick launch opens in the chase view, which shows the belly; a C press would cycle it to the cockpit.
  // Each key held for frames: a bare press can fall between two frames and never be seen.
  const tap = async (key: string): Promise<void> => { await page.keyboard.down(key); await page.waitForTimeout(120); await page.keyboard.up(key) }
  await tap('KeyV')
  await expect(page.getByText('BAY DOORS CLOSED')).toBeVisible()
  await page.screenshot({ path: `${OUT}/1-refused-shut.jpg`, type: 'jpeg', quality: 80 })
  await tap('KeyO')
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/2-opening.jpg`, type: 'jpeg', quality: 80 })
  await expect.poll(doors, { timeout: 10_000 }).toBe(1)
  await page.screenshot({ path: `${OUT}/3-open.jpg`, type: 'jpeg', quality: 80 })
  await tap('KeyV')
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/4-bomb-away.jpg`, type: 'jpeg', quality: 80 })
})
