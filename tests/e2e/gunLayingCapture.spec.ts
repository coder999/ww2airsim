import { mkdirSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { spawnUrl, snapshot, waitForTerrain, type DiagWindow } from './harness.js'
import { withParams } from './views.js'

// M3, gun-laying AI (docs/superpowers/plans/2026-10-10-m3-gun-laying-ai.md):
// put the player close to aa-range's destroyer, inspect the bounded laying wire,
// and capture the trained/elevated mounts for the final human checkpoint. This is
// a capture tool, not a correctness test: skipped unless E2E_CAPTURE=1.
test.skip(process.env.E2E_CAPTURE !== '1', 'capture tool: set E2E_CAPTURE=1')
const OUT = process.env.E2E_CAPTURE_DIR ?? 'test-results/gun-laying'
test.setTimeout(120_000)

const SHIP = { x: -27916, z: -48605 }

test('aa-range: the destroyer lays its AA mounts onto the player', async ({ page }) => {
  mkdirSync(OUT, { recursive: true })
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)) })
  await page.setViewportSize({ width: 1920, height: 1080 })
  const url = withParams(spawnUrl({ x: SHIP.x - 250, y: 100, z: SHIP.z + 150 }), {
    scenario: 'aa-range', launch: '1', aircraft: 'f6f-hellcat', loadout: 'both', god: '1',
    cloudTier: 'off', oceanTier: 'high', look: '31,0',
  })
  await page.goto(url)
  // Acquire, then freeze before the 120 m/s DEV spawn flies past the ship.
  await page.waitForFunction(() => (window as DiagWindow).__ww2?.combat()?.aa.laying.some((pose) => pose.targetKind === 'aircraft') === true)
  await page.keyboard.press('Escape')
  await waitForTerrain(page)

  const state = await page.evaluate(() => (window as DiagWindow).__ww2!.combat()!.aa)
  const aircraftLaying = state.laying.filter((pose) => pose.targetKind === 'aircraft')
  expect(aircraftLaying.length, 'the destroyer has mounts tracking the player').toBeGreaterThan(0)
  expect(new Set(aircraftLaying.map((pose) => pose.targetId)).size, 'all tracking mounts chose the same nearest airplane').toBe(1)
  expect(aircraftLaying.every((pose) => Number.isFinite(pose.trainingRad) && Number.isFinite(pose.elevationRad))).toBe(true)
  expect(aircraftLaying.some((pose) => pose.elevationRad > 0), 'at least one mount is elevated').toBe(true)

  await page.keyboard.press('Slash')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(120)
  await page.screenshot({ path: `${OUT}/aa-range-trained-mounts.png` })
  test.info().annotations.push({ type: 'laying', description: `${aircraftLaying.length} mounts target ${aircraftLaying[0]!.targetId}` })
  expect((await snapshot(page)).errors).toEqual([])
  expect(errors).toEqual([])
})
