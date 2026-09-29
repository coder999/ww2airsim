// How far a retracted leg stands above the airframe's top surface (2026-09-29). Each point of the folded
// leg is ray-cast down onto the airframe triangles: the old measure took the highest airframe vertex
// anywhere over the leg's footprint, and a footprint that reached the fuselage hid a wheel 0.41 m through
// the Corsair's thin wing. A point with no airframe beneath it hangs clear (an exposed wheel) and is skipped.
import { BufferGeometry, DoubleSide, Float32BufferAttribute, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three'
import type { Document, Node } from '@gltf-transform/core'
import { rotateAbout, worldPositions, type Vec3 } from '../../../tools/models/rig.js'

/** Leg points sampled per part: a dense mesh (the Zero's 4,800) would time out a brute-force ray-cast. */
const MAX_POINTS = 1000
const PART = /^(Prop\d*|GearL|GearR|GearNose|Tailwheel|Turret\d+)$/

export function airframeMeshes(doc: Document): Mesh[] {
  const meshes: Mesh[] = []
  for (const n of doc.getRoot().listNodes()) {
    const m = n.getMesh()
    if (!m || PART.test(n.getName())) continue
    const positions = worldPositions(n).flat()
    for (const prim of m.listPrimitives()) {
      const g = new BufferGeometry()
      g.setAttribute('position', new Float32BufferAttribute(positions, 3))
      const idx = prim.getIndices()?.getArray()
      if (idx) g.setIndex(Array.from(idx))
      meshes.push(new Mesh(g, new MeshBasicMaterial({ side: DoubleSide })))
    }
  }
  return meshes
}

/** The largest height of a folded leg point above the airframe surface beneath it, and how many points had airframe beneath. */
export function retractedExcess(meshes: readonly Mesh[], leg: Node, pivot: Vec3, axis: Vec3, upAngleDeg: number): { excess: number; covered: number } {
  const rc = new Raycaster()
  let excess = -Infinity, covered = 0
  const all = worldPositions(leg)
  const stride = Math.max(1, Math.ceil(all.length / MAX_POINTS))
  for (let i = 0; i < all.length; i += stride) {
    const p = all[i]!
    const [x, y, z] = rotateAbout(p, pivot, axis, (upAngleDeg * Math.PI) / 180)
    rc.set(new Vector3(x, 1000, z), new Vector3(0, -1, 0))
    const hit = rc.intersectObjects(meshes as Mesh[], false)[0]
    if (!hit) continue
    covered++
    excess = Math.max(excess, y - hit.point.y)
  }
  return { excess, covered }
}
