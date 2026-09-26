// tools/models/measure.ts
import { getBounds } from '@gltf-transform/functions'
import type { Document, Node, Primitive } from '@gltf-transform/core'
import { meshNodes, onlyScene } from './document.js'

const TRIANGLES = 4

/** Triangles one primitive draws: index count / 3, or vertex count / 3 when
 *  unindexed. Points and lines draw none. */
export function primitiveTriangles(prim: Primitive): number {
  if (prim.getMode() !== TRIANGLES) return 0
  const indices = prim.getIndices()
  const count = indices ? indices.getCount() : (prim.getAttribute('POSITION')?.getCount() ?? 0)
  return Math.floor(count / 3)
}

export function nodeTriangles(node: Node): number {
  return node.getMesh()?.listPrimitives().reduce((sum, p) => sum + primitiveTriangles(p), 0) ?? 0
}

/** Width and height of a WebP image, read from its RIFF header (lossy `VP8 `,
 *  lossless `VP8L`, extended `VP8X`). glTF-Transform's `ImageUtils.getSize`
 *  returns null for sharp's lossy output (measured 2026-09-25, v4.5.0), so the
 *  budget check reads the header itself rather than trusting a null. */
export function webpSize(b: Uint8Array): [number, number] | null {
  const ascii = (o: number, n: number): string => String.fromCharCode(...b.subarray(o, o + n))
  if (b.length < 30 || ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WEBP') return null
  const chunk = ascii(12, 4)
  if (chunk === 'VP8 ') return [(b[26]! | (b[27]! << 8)) & 0x3fff, (b[28]! | (b[29]! << 8)) & 0x3fff]
  if (chunk === 'VP8L') {
    const v = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24)
    return [(v & 0x3fff) + 1, ((v >>> 14) & 0x3fff) + 1]
  }
  if (chunk === 'VP8X') return [(b[24]! | (b[25]! << 8) | (b[26]! << 16)) + 1, (b[27]! | (b[28]! << 8) | (b[29]! << 16)) + 1]
  return null
}

export interface ModelMeasure {
  /** Summed over every mesh-bearing node in the scene, so an instanced mesh counts once per node. */
  readonly triangles: number
  /** One per primitive per mesh-bearing node: what three.js issues. */
  readonly drawCalls: number
  readonly textures: number
  /** The largest width or height of any texture, 0 if there are none. */
  readonly maxTextureSize: number
  readonly extensionsRequired: readonly string[]
  readonly blendMaterials: readonly string[]
  readonly animations: number
  readonly bounds: { readonly min: readonly number[]; readonly max: readonly number[] }
}

export function measureDocument(doc: Document): ModelMeasure {
  const nodes = meshNodes(doc)
  const root = doc.getRoot()
  let maxTextureSize = 0
  for (const t of root.listTextures()) {
    const image = t.getImage()
    const size = t.getMimeType() === 'image/webp' && image ? webpSize(image) : t.getSize()
    if (!size) throw new Error(`texture "${t.getName() || t.getURI()}" (${t.getMimeType()}): size unreadable`)
    maxTextureSize = Math.max(maxTextureSize, size[0], size[1])
  }
  const bounds = getBounds(onlyScene(doc))
  return {
    triangles: nodes.reduce((sum, n) => sum + nodeTriangles(n), 0),
    drawCalls: nodes.reduce((sum, n) => sum + (n.getMesh()?.listPrimitives().length ?? 0), 0),
    textures: root.listTextures().length,
    maxTextureSize,
    extensionsRequired: root.listExtensionsUsed().filter((e) => e.isRequired()).map((e) => e.extensionName).sort(),
    blendMaterials: root.listMaterials().filter((m) => m.getAlphaMode() === 'BLEND').map((m) => m.getName()),
    animations: root.listAnimations().length,
    bounds: { min: [...bounds.min], max: [...bounds.max] },
  }
}
