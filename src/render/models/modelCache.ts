// src/render/models/modelCache.ts
import type { Object3D } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { disposeMeshTree } from './dispose.js'

/**
 * One loaded model, as one aircraft or ship sees it (A6M Zero spec §7.1).
 * `root` is this instance's own clone of the scene graph: posing it, hiding
 * it and re-parenting it are the caller's business. Geometry, materials and
 * textures are SHARED with every other instance of the same URL, so an
 * instance must never mutate a material (a test pins `===` identity).
 */
export interface ModelInstance {
  readonly root: Object3D
  /** The named node inside THIS instance's clone. Throws, naming the model and the node, if absent. */
  node(name: string): Object3D
  /** Idempotent. The last release of a URL disposes its geometry, materials and textures. */
  release(): void
}

/** Parses a URL into a scene graph. Injectable so Node tests never run GLTFLoader. */
export type ParseModel = (url: string) => Promise<Object3D>

export const parseGltf: ParseModel = async (url) => (await new GLTFLoader().loadAsync(url)).scene

export interface ModelCache {
  acquire(url: string): Promise<ModelInstance>
  /** Instances of `url` acquired and not yet released (in-flight acquires included). 0 once disposed. */
  refCount(url: string): number
}

interface Entry {
  readonly source: Promise<Object3D>
  refs: number
}

/**
 * One parse per URL; every acquire clones. Before this (Z1), each aircraft
 * ran its own `GLTFLoader.loadAsync`, so every Wildcat uploaded its own 26
 * textures, about 139 MiB of VRAM each (spec §2).
 */
export function createModelCache(parse: ParseModel = parseGltf): ModelCache {
  const entries = new Map<string, Entry>()
  return {
    async acquire(url: string): Promise<ModelInstance> {
      let entry = entries.get(url)
      if (entry === undefined) {
        const created: Entry = { source: parse(url), refs: 0 }
        // A failed parse is forgotten, so the next acquire retries it rather than replaying the rejection forever.
        created.source.catch(() => { if (entries.get(url) === created) entries.delete(url) })
        entries.set(url, created)
        entry = created
      }
      const held = entry
      // Counted before the await: a sibling instance released while this parse is in flight must not dispose it.
      held.refs++
      let source: Object3D
      try {
        source = await held.source
      } catch (error) {
        held.refs--
        throw error
      }
      const root = source.clone(true)
      let released = false
      return {
        root,
        node(name: string): Object3D {
          const found = root.getObjectByName(name)
          if (!found) throw new Error(`model ${url}: required node "${name}" not found (re-exported with different names? see ASSETS.md and tools/models/entries/)`)
          return found
        },
        release(): void {
          if (released) return
          released = true
          held.refs--
          if (held.refs === 0 && entries.get(url) === held) {
            entries.delete(url)
            disposeMeshTree(source)
          }
        },
      }
    },
    refCount(url: string): number {
      return entries.get(url)?.refs ?? 0
    },
  }
}

const shared = createModelCache()

/** The page-wide cache every airframe and ship module loads through. */
export function acquireModel(url: string): Promise<ModelInstance> {
  return shared.acquire(url)
}
