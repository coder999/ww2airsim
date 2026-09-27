// src/render/scene/storeModels.ts
import { Mesh, type Material, type Object3D } from 'three'
import { acquireModel, type ModelInstance } from '../models/modelCache.js'
import { ordnanceModelUrl } from '../content.js'
import type { StoreVisual, StoreVisuals } from './stores.js'

/** The one mesh a generated store glb holds (tools/models/generated/mesh.ts writes exactly one). */
export function storeMeshOf(root: Object3D, id: string): StoreVisual {
  const meshes: Mesh[] = []
  root.traverse((o) => { if (o instanceof Mesh) meshes.push(o) })
  if (meshes.length !== 1) throw new Error(`store model "${id}": expected exactly one mesh, found ${meshes.length}`)
  return { geometry: meshes[0]!.geometry, material: meshes[0]!.material as Material }
}

/** Acquires each distinct store's model through the shared cache. On any failure, releases
 *  what it acquired and rethrows, so the caller can fall back whole. */
export async function loadStoreVisuals(storeIds: readonly string[], pitchRad: number, acquire: (url: string) => Promise<ModelInstance> = acquireModel): Promise<StoreVisuals & { release(): void }> {
  const ids = [...new Set(storeIds)]
  const settled = await Promise.allSettled(ids.map((id) => acquire(ordnanceModelUrl(id))))
  const failed = settled.find((r): r is PromiseRejectedResult => r.status === 'rejected')
  if (failed !== undefined) {
    for (const r of settled) if (r.status === 'fulfilled') r.value.release()
    throw failed.reason
  }
  const instances = settled.map((r) => (r as PromiseFulfilledResult<ModelInstance>).value)
  const release = (): void => { for (const i of instances) i.release() }
  try {
    // A bad glb (not exactly one mesh) is a failure too: release everything, as above.
    const byStore = new Map(ids.map((id, i) => [id, storeMeshOf(instances[i]!.root, id)] as const))
    return { byStore, pitchRad, release }
  } catch (e) {
    release()
    throw e
  }
}
