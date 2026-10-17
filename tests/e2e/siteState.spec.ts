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

// F8B (2026-10-17): the Burauen fields reach the running game. Buri's twelve buildings are all standing in the pre-invasion window
// and every glb attaches; San Pablo's pre-invasion field is one grown-over revetment; San Pablo's endgame carries the ten drop-zone
// lights. Spawned 700 m west of each strip at 150 m, facing east.
test('Buri before the invasion: twelve glb buildings, five Japanese aircraft parked, clutter instanced', async ({ page }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 400)) })
  await page.goto('/?siteState=buri:pre-invasion&spawnX=-41800&spawnY=150&spawnZ=-22000')
  await waitForTerrain(page)
  await page.waitForFunction(() => (window as DiagWindow).__ww2!.siteScenery().some((s) => s.airfield === 'buri' && s.modelsAttached > 0), undefined, { timeout: 30_000 })
  const out = await page.evaluate(() => {
    const d = (window as DiagWindow).__ww2!
    return { scenery: d.siteScenery(), structures: d.structures().map((s) => s.id), vehicles: d.vehicles().map((v) => v.id), validation: d.validationErrors }
  })
  const buri = out.scenery.find((s) => s.airfield === 'buri')!
  expect(buri.modelsFailed).toEqual([])
  expect(buri.modelsAttached).toBe(12)
  expect(Object.values(buri.clutter).reduce((n, v) => n + v, 0)).toBeGreaterThan(20)
  expect(out.structures.filter((s) => s.startsWith('buri-'))).toHaveLength(12)
  expect(out.vehicles.filter((v) => v.startsWith('buri-pre-'))).toHaveLength(4)
  expect(out.validation).toEqual([])
  expect(errors).toEqual([])
})

test('San Pablo: one grown-over revetment before the invasion, the camp and abandoned frames in the endgame', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/?siteState=san-pablo:pre-invasion&spawnX=-40700&spawnY=150&spawnZ=-20500')
  await waitForTerrain(page)
  await page.waitForFunction(() => (window as DiagWindow).__ww2!.siteScenery().some((s) => s.airfield === 'san-pablo'), undefined, { timeout: 30_000 })
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.structures().filter((s) => s.id.startsWith('san-pablo-')).map((s) => s.id))).toEqual(['san-pablo-revetment-1'])
  await page.goto('/?siteState=san-pablo:endgame&spawnX=-40700&spawnY=150&spawnZ=-20500')
  await waitForTerrain(page)
  await page.waitForFunction(() => (window as DiagWindow).__ww2!.siteScenery().some((s) => s.airfield === 'san-pablo' && s.modelsAttached > 0), undefined, { timeout: 30_000 })
  const out = await page.evaluate(() => ({ structures: (window as DiagWindow).__ww2!.structures().filter((s) => s.id.startsWith('san-pablo-')).map((s) => s.id), validation: (window as DiagWindow).__ww2!.validationErrors }))
  expect(out.structures.sort()).toEqual(['san-pablo-camp-1', 'san-pablo-camp-2', 'san-pablo-fuel-farm', 'san-pablo-revetment-1', 'san-pablo-tower'])
  expect(out.validation).toEqual([])
})

// F8C (2026-10-17): the three sites without a strip reach the running game. Their buildings are glbs (the mooring buoy's comes from the
// equipment table), nothing fails to load, the floating craft are there, and the sites draw no strip (the airfield is in the scenery list
// but only its buildings and clutter are drawn). Spawned 300 m off each shore at 120 m, facing east, as the other twins are.
test('Ormoc, the beaches and Jinamoc: every standing building is a glb, craft are placed, no WebGPU error', async ({ page }) => {
  test.setTimeout(240_000)
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 400)) })
  const cases = [
    { url: '/?siteState=ormoc:buildup&spawnX=-75900&spawnY=120&spawnZ=-22500', id: 'ormoc', models: 11, structures: 11, vehicles: 12, vehiclePrefix: 'ormoc-veh-' },
    { url: '/?siteState=landing-beaches:buildup&spawnX=-30300&spawnY=120&spawnZ=-42000', id: 'landing-beaches', models: 11, structures: 11, vehicles: 12, vehiclePrefix: 'beach-veh-' },
    { url: '/?siteState=jinamoc:buildup&spawnX=-27800&spawnY=120&spawnZ=-45900', id: 'jinamoc', models: 16, structures: 16, vehicles: 5, vehiclePrefix: 'jinamoc-veh-' },
  ]
  for (const c of cases) {
    await page.goto(c.url)
    await waitForTerrain(page)
    await page.waitForFunction((id) => (window as DiagWindow).__ww2!.siteScenery().some((s) => s.airfield === id && s.modelsAttached > 0), c.id, { timeout: 30_000 })
    const out = await page.evaluate(() => {
      const d = (window as DiagWindow).__ww2!
      return { scenery: d.siteScenery(), structures: d.structures().map((s) => s.id), vehicles: d.vehicles().map((v) => v.id), validation: d.validationErrors }
    })
    const site = out.scenery.find((s) => s.airfield === c.id)!
    expect(site.modelsFailed, c.id).toEqual([])
    expect(site.modelsAttached, c.id).toBe(c.models)
    expect(out.structures.filter((s) => s.startsWith(c.id === 'landing-beaches' ? 'beach-' : `${c.id}-`)), c.id).toHaveLength(c.structures)
    expect(out.vehicles.filter((v) => v.startsWith(c.vehiclePrefix)), c.id).toHaveLength(c.vehicles)
    expect(out.validation, c.id).toEqual([])
  }
  // Jinamoc has no field before the invasion
  await page.goto('/?siteState=jinamoc:pre-invasion&spawnX=-27800&spawnY=120&spawnZ=-45900')
  await waitForTerrain(page)
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.sceneryAirfields())).not.toContain('jinamoc')
  expect(errors).toEqual([])
})
