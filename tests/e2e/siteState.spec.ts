import { expect, test } from '@playwright/test'
import { waitForTerrain, type DiagWindow } from './harness.js'

/**
 * F8A Task 9 correctness twin of `siteStateCapture.spec.ts` (2026-10-16): `?siteState=` reaches the running game. The
 * state of the world is read through `__ww2`, not compared as pictures: the building glbs replaced their placeholders (none
 * failed), the structures and vehicles of the chosen window exist, clutter is instanced, and WebGPU reported nothing.
 */
const AT = '&spawnX=-30226&spawnY=150&spawnZ=-47755'

test('Tacloban in the buildup: models attached, 12 vehicles, rubble hangar, clutter instanced', async ({ page }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 400)) })
  await page.goto(`/?siteState=tacloban:buildup${AT}`)
  await waitForTerrain(page)
  await page.waitForFunction(() => (window as DiagWindow).__ww2!.siteScenery().some((s) => s.airfield === 'tacloban' && s.modelsAttached > 0), undefined, { timeout: 30_000 })
  const out = await page.evaluate(() => {
    const d = (window as DiagWindow).__ww2!
    return { scenery: d.siteScenery(), structures: d.structures().map((s) => s.id), vehicles: d.vehicles().map((v) => v.id), validation: d.validationErrors }
  })
  const tac = out.scenery.find((s) => s.airfield === 'tacloban')!
  expect(tac.modelsFailed).toEqual([])
  expect(tac.modelsAttached).toBe(19) // 20 buildings, one is rubble
  expect(Object.values(tac.clutter).reduce((n, v) => n + v, 0)).toBeGreaterThan(200)
  expect(out.structures).toContain('tacloban-quonset-1')
  expect(out.structures).not.toContain('tacloban-hangar-2')
  expect(out.vehicles.filter((v) => v.startsWith('tacloban-bu-'))).toHaveLength(12)
  expect(out.validation).toEqual([])
  expect(errors).toEqual([])
})

test('Tanauan has no field before the build-up, and a construction site in the endgame', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto(`/?siteState=tanauan:assault${AT}`)
  await waitForTerrain(page)
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.sceneryAirfields())).not.toContain('tanauan')
  await page.goto(`/?siteState=tanauan:endgame${AT}`)
  await waitForTerrain(page)
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.sceneryAirfields())).toContain('tanauan')
})
