// The Corsair's retracted main legs stay inside the wing (2026-09-29: the first rig swung them aft
// about +z and the wheels stood 0.41 m above the wing top; Mark saw them through the skin).
import { readFileSync } from 'node:fs'
import { BufferGeometry, DoubleSide, Float32BufferAttribute, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { modelIO } from '../../../tools/models/document.js'
import { rotateAbout, worldPositions } from '../../../tools/models/rig.js'
import { AIRFRAME_RIGS } from '../../../src/render/scene/airframeRigs.js'

const TOLERANCE_M = 0.08

describe('f4u-corsair retracted gear', () => {
  it('lies within the wing top surface to a tolerance', async () => {
    const doc = await modelIO().readBinary(new Uint8Array(readFileSync('content/aircraft/f4u-corsair.glb')))
    const meshes: Mesh[] = []
    for (const n of doc.getRoot().listNodes()) {
      const m = n.getMesh()
      if (!m || /^(Prop|Tailwheel|Gear[LR])$/.test(n.getName())) continue
      const wp = worldPositions(n).flat()
      for (const prim of m.listPrimitives()) {
        const g = new BufferGeometry()
        g.setAttribute('position', new Float32BufferAttribute(wp, 3))
        const idx = prim.getIndices()?.getArray()
        if (idx) g.setIndex(Array.from(idx))
        meshes.push(new Mesh(g, new MeshBasicMaterial({ side: DoubleSide })))
      }
    }
    const rc = new Raycaster()
    for (const rig of AIRFRAME_RIGS['f4u-corsair']!.gear) {
      const node = doc.getRoot().listNodes().find((n) => n.getName() === rig.node)!
      const pivot = node.getTranslation() as [number, number, number]
      const axis = (node.getExtras() as { pivotAxis: [number, number, number] }).pivotAxis
      let worst = -Infinity
      for (const p of worldPositions(node)) {
        const [x, y, z] = rotateAbout(p as [number, number, number], pivot, axis, (rig.upAngleDeg * Math.PI) / 180)
        rc.set(new Vector3(x, 5, z), new Vector3(0, -1, 0))
        const hit = rc.intersectObjects(meshes, false)[0]
        if (hit) worst = Math.max(worst, y - hit.point.y)
      }
      expect(worst, `${rig.node} pokes ${worst.toFixed(3)} m above the wing top`).toBeLessThan(TOLERANCE_M)
    }
  })
})
