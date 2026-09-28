// tests/render/_wildcatCache.ts
// The drawn Wildcat's real scene graph for Node tests. GLTFLoader never runs under Vitest's
// node environment, so this rebuilds wildcat.glb's node tree from gltf-transform: every node's
// name and translation/rotation/scale as authored, and each mesh as a position-only, indexed
// BufferGeometry (no materials or textures). That is all loadWildcat reads (its node lookups,
// the gear groups' children and their bounds), so a test through this cache exercises the same
// graph the game draws (W1 Task 3, 2026-09-28).
import { readFileSync } from 'node:fs'
import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, type Object3D } from 'three'
import type { Node } from '@gltf-transform/core'
import { modelIO, onlyScene } from '../../tools/models/document.js'
import { WILDCAT_MODEL_PATH } from '../../src/render/content.js'
import { createModelCache } from '../../src/render/models/modelCache.js'

const docOnce = modelIO().readBinary(new Uint8Array(readFileSync(WILDCAT_MODEL_PATH)))

function build(n: Node): Object3D {
  const mesh = n.getMesh()
  let o: Object3D
  if (mesh === null) o = new Group()
  else {
    const xyz: number[] = []
    const index: number[] = []
    const v = [0, 0, 0]
    for (const p of mesh.listPrimitives()) {
      const a = p.getAttribute('POSITION')
      if (a === null) continue
      const base = xyz.length / 3
      for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); xyz.push(v[0]!, v[1]!, v[2]!) }
      const idx = p.getIndices()
      if (idx === null) for (let i = 0; i < a.getCount(); i++) index.push(base + i)
      else for (let i = 0; i < idx.getCount(); i++) index.push(base + idx.getScalar(i))
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(xyz, 3))
    g.setIndex(index)
    o = new Mesh(g, new MeshStandardMaterial())
  }
  o.name = n.getName()
  o.position.fromArray(n.getTranslation())
  o.quaternion.fromArray(n.getRotation())
  o.scale.fromArray(n.getScale())
  for (const c of n.listChildren()) o.add(build(c))
  return o
}

/** A fresh three.js copy of wildcat.glb's scene graph, as authored (gear down). */
export async function wildcatGlbScene(): Promise<Group> {
  const root = new Group()
  for (const n of onlyScene(await docOnce).listChildren()) root.add(build(n))
  return root
}

/** A cache whose "parse" is the real Wildcat graph (wildcatGlbScene) or, for an ordnance URL, one
 *  store mesh (O1). */
export function syntheticCache(opts: { failOrdnance?: boolean } = {}) {
  return createModelCache(async (url) => {
    if (url.includes('/ordnance/')) {
      if (opts.failOrdnance) throw new Error(`404 ${url}`)
      const root = new Group()
      const m = new Mesh(new BoxGeometry(1, 0.2, 0.2), new MeshStandardMaterial())
      m.name = url
      root.add(m)
      return root
    }
    return wildcatGlbScene()
  })
}
