// tests/render/storeModels.test.ts
import { describe, expect, it } from 'vitest'
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three'
import { loadStoreVisuals } from '../../src/render/scene/storeModels.js'
import { createModelCache } from '../../src/render/models/modelCache.js'
import { ordnanceModelUrl } from '../../src/render/content.js'

const storeMesh = (): Mesh => new Mesh(new BoxGeometry(1, 0.2, 0.2), new MeshStandardMaterial())

describe('loadStoreVisuals (O1): any failure releases everything it acquired', () => {
  it('one visual per distinct store, held until release', async () => {
    const cache = createModelCache(async () => new Group().add(storeMesh()))
    const v = await loadStoreVisuals(['an-m65', 'an-m65', 'hvar'], 0.128, (url) => cache.acquire(url))
    expect([...v.byStore.keys()]).toEqual(['an-m65', 'hvar'])
    expect(v.pitchRad).toBe(0.128)
    expect(cache.refCount(ordnanceModelUrl('an-m65'))).toBe(1)
    v.release()
    expect(cache.refCount(ordnanceModelUrl('an-m65'))).toBe(0)
    expect(cache.refCount(ordnanceModelUrl('hvar'))).toBe(0)
  })

  it('a bad glb (two meshes) rejects naming the store, and every ordnance instance is released', async () => {
    const cache = createModelCache(async (url) => {
      const root = new Group().add(storeMesh())
      if (url === ordnanceModelUrl('hvar')) root.add(storeMesh())
      return root
    })
    await expect(loadStoreVisuals(['an-m65', 'hvar'], 0, (url) => cache.acquire(url))).rejects.toThrow(/store model "hvar": expected exactly one mesh, found 2/)
    expect(cache.refCount(ordnanceModelUrl('an-m65'))).toBe(0)
    expect(cache.refCount(ordnanceModelUrl('hvar'))).toBe(0)
  })

  it('a partial failure (one resolves, one rejects) releases the one that resolved', async () => {
    const cache = createModelCache(async (url) => {
      if (url === ordnanceModelUrl('hvar')) throw new Error(`404 ${url}`)
      return new Group().add(storeMesh())
    })
    await expect(loadStoreVisuals(['an-m65', 'hvar'], 0, (url) => cache.acquire(url))).rejects.toThrow(/404/)
    expect(cache.refCount(ordnanceModelUrl('an-m65'))).toBe(0)
    expect(cache.refCount(ordnanceModelUrl('hvar'))).toBe(0)
  })
})
