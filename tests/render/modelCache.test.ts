// tests/render/modelCache.test.ts
import { describe, expect, it, vi } from 'vitest'
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture, type Object3D } from 'three'
import { createModelCache } from '../../src/render/models/modelCache.js'

/** A synthetic "parsed glTF": a group holding a named prop mesh with a textured material. */
function syntheticModel() {
  const map = new Texture()
  const material = new MeshStandardMaterial({ map })
  const geometry = new BoxGeometry(1, 1, 1)
  const root = new Group()
  const prop = new Mesh(geometry, material)
  prop.name = 'Prop'
  root.add(prop)
  return { root, map, material, geometry }
}

function countingParse() {
  const made: ReturnType<typeof syntheticModel>[] = []
  const parse = vi.fn(async (_url: string): Promise<Object3D> => {
    const m = syntheticModel()
    made.push(m)
    return m.root
  })
  return { parse, made }
}

describe('createModelCache', () => {
  it('tags every instance root with the URL it was acquired from (Hangar budgets, H2)', async () => {
    const cache = createModelCache(async () => new Group())
    const a = await cache.acquire('/content/aircraft/wildcat.glb')
    const b = await cache.acquire('/content/aircraft/wildcat.glb')
    expect(a.root.userData.modelUrl).toBe('/content/aircraft/wildcat.glb')
    expect(b.root.userData.modelUrl).toBe('/content/aircraft/wildcat.glb')
    a.release(); b.release()
  })

  it('parses a URL once, however many instances, concurrent or later', async () => {
    const { parse } = countingParse()
    const cache = createModelCache(parse)
    const [a, b] = await Promise.all([cache.acquire('zero.glb'), cache.acquire('zero.glb')])
    const c = await cache.acquire('zero.glb')
    expect(parse).toHaveBeenCalledTimes(1)
    expect(cache.refCount('zero.glb')).toBe(3)
    expect(new Set([a.root, b.root, c.root]).size).toBe(3)
  })

  it('instances share geometry and material by identity, and pose independently', async () => {
    const cache = createModelCache(countingParse().parse)
    const a = await cache.acquire('zero.glb')
    const b = await cache.acquire('zero.glb')
    const pa = a.node('Prop') as Mesh, pb = b.node('Prop') as Mesh
    expect(pa).not.toBe(pb)
    expect(pa.material).toBe(pb.material)
    expect(pa.geometry).toBe(pb.geometry)
    pa.rotation.x = 1
    expect(pb.rotation.x).toBeCloseTo(0, 12)
  })

  it('node() throws naming the model and the node', async () => {
    const cache = createModelCache(countingParse().parse)
    const a = await cache.acquire('zero.glb')
    expect(() => a.node('Tailwheel')).toThrow(/zero\.glb.*"Tailwheel"/)
  })

  it('disposes geometry, material and texture only on the LAST release, and a double release counts once', async () => {
    const { parse, made } = countingParse()
    const cache = createModelCache(parse)
    const a = await cache.acquire('zero.glb')
    const b = await cache.acquire('zero.glb')
    const { geometry, material, map } = made[0]!
    const spies = [vi.spyOn(geometry, 'dispose'), vi.spyOn(material, 'dispose'), vi.spyOn(map, 'dispose')]
    a.release()
    a.release()
    expect(cache.refCount('zero.glb')).toBe(1)
    for (const s of spies) expect(s).not.toHaveBeenCalled()
    b.release()
    expect(cache.refCount('zero.glb')).toBe(0)
    for (const s of spies) expect(s).toHaveBeenCalledTimes(1)
  })

  it('after the last release, the next acquire parses afresh rather than reuse freed GPU resources', async () => {
    const { parse } = countingParse()
    const cache = createModelCache(parse)
    ;(await cache.acquire('zero.glb')).release()
    await cache.acquire('zero.glb')
    expect(parse).toHaveBeenCalledTimes(2)
  })

  it('a failed parse rejects every waiter, holds no reference, and is retried by the next acquire', async () => {
    let fail = true
    const parse = vi.fn(async (_url: string): Promise<Object3D> => {
      if (fail) throw new Error('404 zero.glb')
      return syntheticModel().root
    })
    const cache = createModelCache(parse)
    await expect(Promise.all([cache.acquire('zero.glb'), cache.acquire('zero.glb')])).rejects.toThrow('404 zero.glb')
    expect(cache.refCount('zero.glb')).toBe(0)
    fail = false
    await expect(cache.acquire('zero.glb')).resolves.toBeDefined()
    expect(parse).toHaveBeenCalledTimes(2)
  })

  it('different URLs are different parses', async () => {
    const { parse } = countingParse()
    const cache = createModelCache(parse)
    await cache.acquire('zero.glb')
    await cache.acquire('zero-lod1.glb')
    expect(parse).toHaveBeenCalledTimes(2)
  })
})
