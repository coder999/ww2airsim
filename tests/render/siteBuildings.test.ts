import { describe, it, expect } from 'vitest'
import { BoxGeometry, Box3, Mesh, Object3D, type BufferGeometry } from 'three'
import { createAirfield } from '../../src/render/scene/airfield.js'
import { BUILDING_KINDS, parseAirfield, type Airfield } from '../../src/sim/world/airfields.js'
import { loadAirfield } from '../../tools/content/load.js'
import { buildStructures } from '../../src/sim/weapons/structures.js'
import { groundTruthTerrain } from '../../tools/sites/terrain.js'
import { STATIC_MODELS } from '../../src/render/scene/staticModels.js'

const field = groundTruthTerrain()

/** What a scene graph is made of, in numbers: meshes, vertices, triangles, and a rounded bounding box. */
function signature(root: Object3D): { meshes: number; vertices: number; triangles: number; box: number[] } {
  let meshes = 0, vertices = 0, triangles = 0
  root.updateMatrixWorld(true)
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return
    const g = o.geometry as BufferGeometry
    meshes++
    vertices += g.getAttribute('position').count
    triangles += g.index === null ? g.getAttribute('position').count / 3 : g.index.count / 3
  })
  const b = new Box3().setFromObject(root)
  return { meshes, vertices, triangles, box: [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].map((n) => Math.round(n * 10) / 10) }
}

const oneBuilding = (kind: (typeof BUILDING_KINDS)[number], extra: Record<string, unknown> = {}): Airfield => {
  const base = JSON.parse(JSON.stringify(loadAirfield('tacloban'))) as Record<string, unknown>
  return parseAirfield({ ...base, buildings: [{ id: 'b1', kind, x: -150, z: 100, widthM: 20, lengthM: 30, hp: 50, ...extra }] })
}

const SHIPPED: Record<string, ReturnType<typeof signature>> = {
  tacloban: { meshes: 38, vertices: 27092, triangles: 15640, box: [-29888.5, -0.3, -47897.5, -29677, 18, -47432.5] },
  dulag: { meshes: 27, vertices: 17098, triangles: 8724, box: [-31851.5, 8.1, -16832.5, -31685.5, 21.9, -16434.5] },
  bayug: { meshes: 16, vertices: 11542, triangles: 5880, box: [-45322.5, 51.5, -20774.5, -45154.4, 68.1, -20496.5] },
}

describe('the three shipped bases render exactly as before F8A (Task 3)', () => {
  // Measured 2026-10-16 on main df762b14, BEFORE createAirfield changed; a base with no `model` building draws procedurally.
  it.each(['tacloban', 'dulag', 'bayug'])('%s scenery signature is unchanged', (id) => {
    const sig = signature(createAirfield(field, loadAirfield(id)).object)
    expect(sig).toEqual(SHIPPED[id])
  })
})

describe('every placeable kind draws and has a hit box (Task 3)', () => {
  it('the building kinds are exactly the registered building models', () => {
    expect([...BUILDING_KINDS].sort()).toEqual(Object.keys(STATIC_MODELS.building).sort())
  })

  it.each([...BUILDING_KINDS])('%s: a placeholder draws now, and a hit box exists and matches its footprint', (kind) => {
    const a = oneBuilding(kind, { model: true, heightM: 7 })
    const handle = createAirfield(field, a)
    const group = handle.object.getObjectByName('structure:b1')
    expect(group, 'structure group').toBeDefined()
    expect(signature(group!).triangles, 'placeholder geometry').toBeGreaterThan(0)
    const hit = buildStructures([a], field)
    expect(hit).toHaveLength(1)
    expect(hit[0]!.kind).toBe(kind)
    expect(hit[0]!.halfSize).toEqual({ x: 10, y: 3.5, z: 15 })
  })

  it('a building heading rotates its hit box with it', () => {
    const a = oneBuilding('hangar', { headingDeg: 90 })
    expect(buildStructures([a], field)[0]!.headingRad).toBeCloseTo(Math.PI / 2, 9)
    expect(buildStructures([oneBuilding('hangar')], field)[0]!.headingRad).toBe(0)
  })
})

describe('building states (Task 3)', () => {
  it('destroyed is rubble with no hit box and no smoke anchor; construction draws a frame and keeps a hit box', () => {
    const ruin = oneBuilding('hangar', { state: 'destroyed', model: true })
    const handle = createAirfield(field, ruin)
    expect(buildStructures([ruin], field)).toHaveLength(0)
    expect(handle.smokeAnchors.size).toBe(0)
    const g = handle.object.getObjectByName('structure:b1')!
    expect(g.getObjectByName('collapsed')!.visible).toBe(true)
    expect(g.getObjectByName('intact')!.visible).toBe(false)
    const frame = oneBuilding('hangar', { state: 'construction', model: true })
    const f = createAirfield(field, frame).object.getObjectByName('structure:b1')!
    expect(f.getObjectByName('intact')!.visible).toBe(true)
    expect(signature(f.getObjectByName('intact')!).triangles).toBeGreaterThan(0)
    expect(buildStructures([frame], field)).toHaveLength(1)
  })
})

describe('loadModels (Task 3)', () => {
  const stub = (): { load: (k: string) => Promise<{ root: Object3D; release(): void }>; released: string[]; asked: string[] } => {
    const released: string[] = [], asked: string[] = []
    return {
      released, asked,
      load: async (k) => {
        asked.push(k)
        const root = new Object3D()
        root.add(new Mesh(new BoxGeometry(20, 5, 30)))
        return { root, release: () => { released.push(k) } }
      },
    }
  }

  it('replaces the placeholder with the model, sync still hides it when destroyed, dispose releases it', async () => {
    const a = oneBuilding('quonset-hut-20x48', { model: true })
    const handle = createAirfield(field, a)
    const s = stub()
    expect(await handle.loadModels(s.load)).toEqual({ attached: 1, failed: [] })
    expect(s.asked).toEqual(['quonset-hut-20x48'])
    const intact = handle.object.getObjectByName('structure:b1')!.getObjectByName('intact')!
    const placeholders = intact.children.filter((c) => c.name !== 'model:b1')
    expect(placeholders.length).toBeGreaterThan(0)
    expect(placeholders.every((p) => !p.visible)).toBe(true)
    expect(intact.getObjectByName('model:b1')!.visible).toBe(true)
    handle.sync({ b1: { hp: 0, destroyedTick: 5, attacker: 'x' } })
    expect(intact.visible).toBe(false)
    handle.dispose()
    expect(s.released).toEqual(['quonset-hut-20x48'])
    expect(intact.getObjectByName('model:b1')).toBeUndefined()
  })

  it('a model that fails to load leaves its placeholder and is reported, not thrown', async () => {
    const handle = createAirfield(field, oneBuilding('hangar', { model: true }))
    const out = await handle.loadModels(async () => { throw new Error('404') })
    expect(out).toEqual({ attached: 0, failed: ['b1'] })
    const intact = handle.object.getObjectByName('structure:b1')!.getObjectByName('intact')!
    expect(intact.children.every((c) => c.visible)).toBe(true)
  })

  it('a building without `model` is never asked for', async () => {
    const handle = createAirfield(field, oneBuilding('hangar'))
    const s = stub()
    expect(await handle.loadModels(s.load)).toEqual({ attached: 0, failed: [] })
    expect(s.asked).toEqual([])
  })

  it('the model sits on its box: horizontally centered and rotated with the building', async () => {
    const a = oneBuilding('hangar', { model: true, headingDeg: 90 })
    const handle = createAirfield(field, a)
    await handle.loadModels(async () => {
      const root = new Object3D()
      const m = new Mesh(new BoxGeometry(10, 4, 10)); m.position.set(30, 2, 0) // origin 30 m off-center, like a pier
      root.add(m)
      return { root, release: () => undefined }
    })
    const holder = handle.object.getObjectByName('model:b1')!
    handle.object.updateMatrixWorld(true)
    const box = new Box3().setFromObject(holder)
    const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2
    const c = buildStructures([a], field)[0]!.position
    expect(cx).toBeCloseTo(c.x, 3)
    expect(cz).toBeCloseTo(c.z, 3)
    expect(holder.rotation.y).toBeCloseTo(-Math.PI / 2, 9)
  })
})
