import { BoxGeometry, CircleGeometry, CylinderGeometry, Group, InstancedMesh, Matrix4, Quaternion, Vector3, type BufferGeometry } from 'three'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import { clutterInstances, CLUTTER_KINDS, type ClutterKind } from '../../sim/world/clutter.js'
import type { Airfield } from '../../sim/world/airfields.js'
import { heightAt, type TerrainField } from '../../sim/world/terrain.js'

/**
 * Procedural clutter, instanced (F8A Task 7, F3 section 9): one `InstancedMesh` per kind, so a whole site-state costs at
 * most eight draws however many instances it holds. The instance list is `clutterInstances`, a pure function of the
 * airfield's seed, so a window always looks the same. Shapes are deliberately plain: they read at taxi height, not at a
 * cockpit's eye.
 */
type Shape = { readonly geometry: BufferGeometry; readonly color: number; readonly lift: number }
const flat = (g: BufferGeometry): BufferGeometry => g.rotateX(-Math.PI / 2)

const SHAPES: Readonly<Record<ClutterKind, () => Shape>> = {
  // Pierced steel plank stacks: low, long, pale.
  mat: () => ({ geometry: new BoxGeometry(10, 0.12, 4), color: 0x8a8d8f, lift: 0.07 }),
  // A ridge tent: a three-sided prism lying along x, olive canvas.
  tent: () => ({ geometry: new CylinderGeometry(1.5, 1.5, 5, 3).rotateZ(Math.PI / 2).translate(0, 0.75, 0), color: 0x6b6f4a, lift: 0 }),
  sandbag: () => ({ geometry: new BoxGeometry(1.8, 0.8, 0.7).translate(0, 0.4, 0), color: 0x9a8f6a, lift: 0 }),
  drum: () => ({ geometry: new CylinderGeometry(0.3, 0.3, 0.9, 8).translate(0, 0.45, 0), color: 0x4a5a3a, lift: 0 }),
  crate: () => ({ geometry: new BoxGeometry(1.2, 1, 1.2).translate(0, 0.5, 0), color: 0x7a6038, lift: 0 }),
  mud: () => ({ geometry: flat(new CircleGeometry(3.2, 12)), color: 0x4a3d2c, lift: 0.05 }),
  rut: () => ({ geometry: new BoxGeometry(0.5, 0.03, 14), color: 0x3b3023, lift: 0.045 }),
  crater: () => ({ geometry: flat(new CircleGeometry(4.5, 14)), color: 0x2f2a24, lift: 0.055 }),
}

export type ClutterView = { readonly object: Group; readonly counts: Readonly<Record<ClutterKind, number>> }

export function createClutter(field: TerrainField, airfield: Airfield): ClutterView {
  const object = new Group()
  object.name = `${airfield.name} clutter`
  const counts = Object.fromEntries(CLUTTER_KINDS.map((k) => [k, 0])) as Record<ClutterKind, number>
  const instances = clutterInstances(airfield)
  const m = new Matrix4(), q = new Quaternion(), up = new Vector3(0, 1, 0)
  for (const kind of CLUTTER_KINDS) {
    const of = instances.filter((i) => i.kind === kind)
    if (of.length === 0) continue
    const shape = SHAPES[kind]()
    const mesh = new InstancedMesh(shape.geometry, new MeshStandardNodeMaterial({ color: shape.color, roughness: 0.95 }), of.length)
    mesh.name = `clutter ${kind}`
    mesh.frustumCulled = false
    mesh.receiveShadow = true
    of.forEach((i, n) => {
      q.setFromAxisAngle(up, i.yawRad)
      m.compose(new Vector3(i.x, heightAt(field, i.x, i.z) + shape.lift, i.z), q, new Vector3(i.scale, i.scale, i.scale))
      mesh.setMatrixAt(n, m)
    })
    mesh.instanceMatrix.needsUpdate = true
    object.add(mesh)
    counts[kind] = of.length
  }
  return { object, counts }
}
