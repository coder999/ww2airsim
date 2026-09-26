// src/render/models/dispose.ts
import { Mesh, type Material, type Object3D, type Texture } from 'three'

/** Every texture-valued property `MeshStandardMaterial` (or a sibling
 *  material type) can carry. `Material.dispose()` frees the material's own
 *  GPU program/uniform state but explicitly does NOT dispose the textures it
 *  references (Three.js's own documented behaviour), so a loaded glTF's
 *  textures leak unless this list is walked (found in review, F4F Task 6).
 *  Moved here from scenarioEntities.ts (Z1), because the model cache disposes
 *  a loaded model's shared parse the same way. */
const TEXTURE_PROPS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap', 'bumpMap', 'displacementMap'] as const

function disposeMaterialTextures(material: Material): void {
  for (const prop of TEXTURE_PROPS) {
    const tex = (material as unknown as Record<string, Texture | null>)[prop]
    if (tex) tex.dispose()
  }
}

/**
 * Frees the GPU resources a mesh subtree holds -- every `Mesh`'s geometry
 * buffer, material(s), and the textures those materials reference -- and
 * leaves `root` itself for the caller to remove from the scene graph.
 *
 * Only for subtrees that own what they draw: procedural hulls, smoke, the
 * Hellcat stand-in, and the model cache's own parsed source once its last
 * instance is released. NEVER call it on a `ModelInstance.root`: an instance
 * shares geometry, materials and textures with every other instance of the
 * same URL (modelCache.ts), and this would free them under the others.
 */
export function disposeMeshTree(root: Object3D): void {
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return
    node.geometry.dispose()
    const material = node.material
    const materials = Array.isArray(material) ? material : [material]
    for (const m of materials) {
      disposeMaterialTextures(m)
      m.dispose()
    }
  })
}
