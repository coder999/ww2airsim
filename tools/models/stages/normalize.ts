// tools/models/stages/normalize.ts
import type { Document, mat4 } from '@gltf-transform/core'
import { getBounds, transformMesh } from '@gltf-transform/functions'
import type { ModelEntry } from '../manifest.js'
import { meshNodes, moveToSceneRoot, onlyScene, ownMesh, subtree } from '../document.js'
import { applyMatrix } from './geometry.js'
import { axisVector, cross, dot, type Vec3 } from './axes.js'

type Normalize = NonNullable<ModelEntry['normalize']>

/** Column-major 4x4 multiply, a * b. */
function mul(a: readonly number[], b: readonly number[]): mat4 {
  const out = new Array<number>(16).fill(0)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r]! += a[k * 4 + r]! * b[c * 4 + k]!
  return out as unknown as mat4
}

/** The source-to-output matrix: translate `origin` to 0, rotate `forward` onto
 *  +X and `up` onto +Y (so forward x up lands on +Z, the sim's right), then
 *  scale uniformly so the fitted extent is `fit.meters`. */
export function normalizeMatrix(n: Normalize, sourceMin: readonly number[], sourceMax: readonly number[]): mat4 {
  const f = axisVector(n.forward), u = axisVector(n.up), r: Vec3 = cross(f, u)
  const fitAxis = n.fit.extent === 'span' ? r : f
  const k = fitAxis.findIndex((v) => v !== 0)
  const extent = sourceMax[k]! - sourceMin[k]!
  if (!(extent > 0)) throw new Error(`normalize: the model has no extent along the ${n.fit.extent} axis`)
  const s = n.fit.meters / extent
  // Rows of the rotation are f, u, r: output = (f.v, u.v, r.v).
  const rot = [f[0], u[0], r[0], 0, f[1], u[1], r[1], 0, f[2], u[2], r[2], 0, 0, 0, 0, 1]
  const scale = [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1]
  const shift = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -n.origin[0], -n.origin[1], -n.origin[2], 1]
  return mul(scale, mul(rot, shift))
}

/**
 * Stage 4: bakes the source-to-output matrix into every mesh. Afterwards every
 * mesh node hangs directly under the scene with only a translation (its
 * origin, or its pivot, in output meters), every group node is gone, and a
 * `pivotAxis` extra is rotated into the output frame. Runtime applies no
 * basis or scale fix (A6M Zero spec §6.1).
 */
export function normalizeDocument(doc: Document, n: Normalize): void {
  const scene = onlyScene(doc)
  const b = getBounds(scene)
  const m = normalizeMatrix(n, b.min, b.max)
  const f = axisVector(n.forward), u = axisVector(n.up), r = cross(f, u)
  const nodes = meshNodes(doc)
  const plans = nodes.map((node) => {
    const world = node.getWorldMatrix()
    const t = applyMatrix(mul(m, world), [0, 0, 0], 0)
    return { node, world, t }
  })
  for (const { node, world, t } of plans) {
    const bake = mul([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -t[0], -t[1], -t[2], 1], mul(m, world))
    transformMesh(ownMesh(doc, node)!, bake)
    moveToSceneRoot(doc, node)
    node.setTranslation(t).setRotation([0, 0, 0, 1]).setScale([1, 1, 1])
    const axis = node.getExtras()['pivotAxis'] as number[] | undefined
    if (axis) node.setExtras({ ...node.getExtras(), pivotAxis: [dot(f, axis), dot(u, axis), dot(r, axis)] })
  }
  for (const child of scene.listChildren()) {
    for (const n2 of subtree(child).reverse()) if (!n2.getMesh() && n2.listChildren().length === 0) n2.dispose()
  }
}
