import { describe, it, expect, vi } from 'vitest'
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Scene, Texture } from 'three'
import { loadScenarioBundle } from '../../tools/content/load.js'
import { worldFromScenario } from '../../src/sim/scenario.js'
import type { World } from '../../src/sim/loop.js'
import { buildScenarioEntities, disposeMeshTree, type ScenarioEntities } from '../../src/render/scenarioEntities.js'
import { createHellcat } from '../../src/render/scene/hellcat.js'
import { loadWildcat } from '../../src/render/scene/wildcat.js'
import { createModelCache } from '../../src/render/models/modelCache.js'
import { WILDCAT_MODEL_URL } from '../../src/render/content.js'

// Real shipped content, not fixtures: `content/scenarios/deck-quals.json` and
// `free-flight.json` both carry 2 aircraft + 3 ships (the largest ship count
// any scenario ships), `strike-range.json` carries 1 aircraft + 1 ship (the
// smallest of both), and `gunnery-range.json` carries 3 aircraft + 0 ships --
// between them, switching among these three exercises a genuine SHRINK in
// both counts at once, a genuine GROW in both, and the zero-ship case.
const deckQuals: World<undefined> = worldFromScenario(loadScenarioBundle('deck-quals'), null, 'clean')
const strikeRange: World<undefined> = worldFromScenario(loadScenarioBundle('strike-range'), null, 'clean')
const gunneryRange: World<undefined> = worldFromScenario(loadScenarioBundle('gunnery-range'), null, 'clean')

/** The stand-in `loadAirframe` every call in this file passes: real,
 *  synchronous, no network or texture decode, so this suite exercises
 *  buildScenarioEntities's OWN logic (array sizing, disposal, id lookup)
 *  without depending on GLTFLoader working in Vitest's `environment: 'node'`
 *  (it doesn't -- Task 5's wildcat.ts doc comment has the reason). Which
 *  aircraft type this resolves to is not what this suite is testing. */
const stubAirframe = async () => createHellcat()

function allMeshes(entities: ScenarioEntities): Mesh[] {
  const meshes: Mesh[] = []
  for (const handle of [...entities.airframes, ...entities.shipHandles]) {
    handle.root.traverse((node) => {
      if (node instanceof Mesh) meshes.push(node)
    })
  }
  return meshes
}

/**
 * `buildScenarioEntities` (Plan 9 Task 7, design doc §5) is what `main.ts`'s
 * `loadScenario` calls on every scenario switch -- the entity-sized meshes
 * (`airframes`/`shipHandles`/`smokes`/`player`), not terrain,
 * ocean or sky, which are untouched. This suite is the Tier 1 half of the
 * plan's own Review Focus: a headless test cannot see a Tier 2 GPU leak
 * directly, but it CAN see that every mesh the previous call built had its
 * `dispose()` called and is no longer in the scene -- which is the only
 * mechanism a leak could hide behind.
 */
describe('buildScenarioEntities', () => {
  it('sizes the mesh arrays to the world passed in: one airframe per aircraft, one hull per ship, one smoke per airframe', async () => {
    const scene = new Scene()
    const entities = await buildScenarioEntities(scene, deckQuals, null, stubAirframe)
    expect(entities.airframes).toHaveLength(deckQuals.aircraft.length)
    expect(entities.shipHandles).toHaveLength(deckQuals.ships.length)
    expect(entities.smokes).toHaveLength(deckQuals.aircraft.length)
    for (const handle of [...entities.airframes, ...entities.shipHandles]) {
      expect(scene.children).toContain(handle.root)
    }
  })

  it("picks the player's airframe out by id, not index 0", async () => {
    const scene = new Scene()
    const entities = await buildScenarioEntities(scene, deckQuals, null, stubAirframe)
    const playerIndex = deckQuals.aircraft.findIndex((a) => a.id === deckQuals.player)
    expect(entities.player).toBe(entities.airframes[playerIndex])
  })

  it('a SHRINK (fewer aircraft AND fewer ships) disposes every mesh the larger scenario built, not just the ones the smaller count happens to reuse', async () => {
    const scene = new Scene()
    const before = await buildScenarioEntities(scene, deckQuals, null, stubAirframe) // 2 aircraft, 3 ships
    const oldRoots = [...before.airframes, ...before.shipHandles].map((h) => h.root)
    const oldMeshes = allMeshes(before)
    // A sanity floor, not a precise count: each airframe/hull is several
    // meshes on its own (hellcat.ts, ship.ts), so 5 roots is comfortably
    // more than 5 meshes if the walk is actually recursive.
    expect(oldMeshes.length).toBeGreaterThan(5)

    const geometrySpies = oldMeshes.map((m) => vi.spyOn(m.geometry, 'dispose'))
    // Materials are shared across several meshes within one airframe or hull
    // (hellcat.ts's `paint`/`dark`, ship.ts's `grey`/`deck`) -- de-duplicated
    // by identity so each one is spied exactly once, not once per mesh that
    // references it.
    const materials = [...new Set(oldMeshes.flatMap((m) => (Array.isArray(m.material) ? m.material : [m.material])))]
    const materialSpies = materials.map((mat) => vi.spyOn(mat, 'dispose'))

    const after = await buildScenarioEntities(scene, strikeRange, before, stubAirframe) // 1 aircraft, 1 ship

    expect(after.airframes).toHaveLength(1)
    expect(after.shipHandles).toHaveLength(1)

    for (const spy of geometrySpies) expect(spy).toHaveBeenCalled()
    for (const spy of materialSpies) expect(spy.mock.calls.length).toBeGreaterThanOrEqual(1)

    for (const root of oldRoots) expect(scene.children).not.toContain(root)
    for (const handle of [...after.airframes, ...after.shipHandles]) expect(scene.children).toContain(handle.root)
  })

  it('a GROW (more aircraft, more ships) also disposes the smaller scenario it replaces and produces exactly the new counts', async () => {
    const scene = new Scene()
    const before = await buildScenarioEntities(scene, strikeRange, null, stubAirframe) // 1 aircraft, 1 ship
    const oldRoots = [...before.airframes, ...before.shipHandles].map((h) => h.root)
    const oldMeshes = allMeshes(before)
    const geometrySpies = oldMeshes.map((m) => vi.spyOn(m.geometry, 'dispose'))

    const after = await buildScenarioEntities(scene, deckQuals, before, stubAirframe) // 2 aircraft, 3 ships

    expect(after.airframes).toHaveLength(2)
    expect(after.shipHandles).toHaveLength(3)
    for (const spy of geometrySpies) expect(spy).toHaveBeenCalled()
    for (const root of oldRoots) expect(scene.children).not.toContain(root)
  })

  it('a scenario with no ships at all (gunnery-range) produces an empty shipHandles array, not a leftover from the previous scenario', async () => {
    const scene = new Scene()
    const before = await buildScenarioEntities(scene, deckQuals, null, stubAirframe) // 3 ships
    const after = await buildScenarioEntities(scene, gunneryRange, before, stubAirframe) // 0 ships
    expect(after.airframes).toHaveLength(3)
    expect(after.shipHandles).toHaveLength(0)
    for (const handle of before.shipHandles) expect(scene.children).not.toContain(handle.root)
  })

  it('the very first call (no previous scenario) disposes nothing -- there is nothing to dispose yet', async () => {
    const scene = new Scene()
    // Would reject if `buildScenarioEntities` tried to walk a null `previous`.
    await expect(buildScenarioEntities(scene, strikeRange, null, stubAirframe)).resolves.toBeDefined()
  })
})

describe('disposeMeshTree', () => {
  it('disposes every mesh geometry (and material) in a subtree', async () => {
    const scene = new Scene()
    const entities = await buildScenarioEntities(scene, strikeRange, null, stubAirframe)
    const { root } = entities.airframes[0]!
    const meshes: Mesh[] = []
    root.traverse((node) => {
      if (node instanceof Mesh) meshes.push(node)
    })
    expect(meshes.length).toBeGreaterThan(0)
    const geometrySpies = meshes.map((m) => vi.spyOn(m.geometry, 'dispose'))

    disposeMeshTree(root)

    for (const spy of geometrySpies) expect(spy).toHaveBeenCalled()
  })

  it('disposes textures on a material, not just the material itself (review finding, Task 6)', () => {
    // `stubAirframe`/`createHellcat()` above is procedural and texture-free,
    // so it cannot exercise this path at all -- `Material.dispose()` frees
    // the material's own GPU state but explicitly does NOT dispose textures
    // it references (Three.js's documented behaviour). Before this task
    // every airframe was procedural (no textures existed to miss); now
    // `loadWildcat()` loads a real glTF with embedded textures, and this
    // function runs on every scenario switch -- so a real `Texture`, not the
    // stub, is what proves the leak is actually closed.
    const map = new Texture()
    const normalMap = new Texture()
    const material = new MeshStandardMaterial({ map, normalMap })
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), material)
    const root = new Group()
    root.add(mesh)

    const mapSpy = vi.spyOn(map, 'dispose')
    const normalMapSpy = vi.spyOn(normalMap, 'dispose')
    const materialSpy = vi.spyOn(material, 'dispose')

    disposeMeshTree(root)

    expect(mapSpy).toHaveBeenCalled()
    expect(normalMapSpy).toHaveBeenCalled()
    expect(materialSpy).toHaveBeenCalled()
  })
})

describe('buildScenarioEntities and the model cache (Z1)', () => {
  it('a switch disposes every previous airframe through its own dispose(), and its smoke', async () => {
    const scene = new Scene()
    const before = await buildScenarioEntities(scene, deckQuals, null, stubAirframe)
    const disposeSpies = before.airframes.map((a) => vi.spyOn(a, 'dispose'))
    const smokeMeshes: Mesh[] = []
    for (const s of before.smokes) s.object.traverse((n) => { if (n instanceof Mesh) smokeMeshes.push(n) })
    const smokeSpies = smokeMeshes.map((m) => vi.spyOn(m.geometry, 'dispose'))
    await buildScenarioEntities(scene, strikeRange, before, stubAirframe)
    for (const spy of disposeSpies) expect(spy).toHaveBeenCalledTimes(1)
    for (const spy of smokeSpies) expect(spy).toHaveBeenCalled()
  })

  it('if one airframe fails to load, the ones that loaded are disposed and the previous scenario is untouched', async () => {
    const scene = new Scene()
    const before = await buildScenarioEntities(scene, strikeRange, null, stubAirframe)
    const disposeSpies: ReturnType<typeof vi.fn>[] = []
    let calls = 0
    const flaky = async () => {
      calls++
      if (calls === 2) throw new Error('model fetch 404')
      const a = createHellcat()
      const spy = vi.fn(a.dispose)
      disposeSpies.push(spy)
      return { ...a, dispose: spy }
    }
    await expect(buildScenarioEntities(scene, deckQuals, before, flaky)).rejects.toThrow('model fetch 404')
    expect(disposeSpies.length).toBe(deckQuals.aircraft.length - 1)
    for (const spy of disposeSpies) expect(spy).toHaveBeenCalledTimes(1)
    for (const h of [...before.airframes, ...before.shipHandles]) expect(scene.children).toContain(h.root)
  })

  it('switching between two scenarios that both fly the Wildcat parses it once and frees nothing still drawn', async () => {
    let parses = 0
    const cache = createModelCache(async () => {
      parses++
      const root = new Group()
      for (const name of ['Helice', 'GRP_Rueda_Der', 'GRP_Rueda_Izq']) {
        const m = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial())
        m.name = name
        root.add(m)
      }
      return root
    })
    const load = () => loadWildcat((url) => cache.acquire(url))
    const scene = new Scene()
    const first = await buildScenarioEntities(scene, deckQuals, null, load)
    const second = await buildScenarioEntities(scene, strikeRange, first, load)
    expect(parses).toBe(1)
    expect(cache.refCount(WILDCAT_MODEL_URL)).toBe(second.airframes.length)
  })
})

describe('per-spec model selection (Z1)', () => {
  it("loads each aircraft by its own spec's view.model", async () => {
    const asked: string[] = []
    await buildScenarioEntities(new Scene(), deckQuals, null, async (id) => { asked.push(id); return createHellcat() })
    expect(asked).toEqual(deckQuals.aircraft.map((a) => a.spec.view.model))
  })
})
