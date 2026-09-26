import { BoxGeometry, CylinderGeometry, Mesh, type MeshStandardMaterial, type Object3D } from 'three'

/**
 * Rack and rail offsets, body-frame metres, mirrored from
 * `content/aircraft/f6f-hellcat.json`'s `stores.racks`/`stores.rails` (read
 * 2026-09-22). Shared between every airframe module (hellcat.ts, wildcat.ts)
 * because both content files carry the identical offsets -- wildcat.ts's
 * content is a verbatim copy of the Hellcat's (Task 3) -- and both airframm
 * roots are posed in the same sim body frame (+X forward, +Y up, +Z right),
 * so the same offsets attach correctly regardless of which underlying mesh
 * the root wraps.
 */
export const RACK_OFFSETS: readonly { readonly id: string; readonly offset: readonly [number, number, number] }[] = [
  { id: 'left-rack', offset: [0.4, -0.55, -2.6] },
  { id: 'right-rack', offset: [0.4, -0.55, 2.6] },
]
export const RAIL_OFFSETS: readonly { readonly id: string; readonly offset: readonly [number, number, number] }[] = [
  { id: 'left-rail-1', offset: [0.4, -0.4, -3.6] },
  { id: 'left-rail-2', offset: [0.4, -0.4, -4.3] },
  { id: 'left-rail-3', offset: [0.4, -0.4, -5.0] },
  { id: 'right-rail-1', offset: [0.4, -0.4, 3.6] },
  { id: 'right-rail-2', offset: [0.4, -0.4, 4.3] },
  { id: 'right-rail-3', offset: [0.4, -0.4, 5.0] },
]
const RAIL_DROP_ORDER: readonly number[] = RAIL_OFFSETS
  .map((_, i) => i)
  .sort((x, y) => Math.abs(RAIL_OFFSETS[y]!.offset[2]) - Math.abs(RAIL_OFFSETS[x]!.offset[2]) || x - y)

/** Builds one bomb mesh per rack and one rocket mesh per rail, adds them all
 *  to `root`, and returns the same visibility-toggling `setStores` every
 *  airframe module exposes. `material` is the airframe's own dark trim
 *  material, passed in so stores match that aircraft's existing palette
 *  rather than hardcoding a second one here. */
export function attachStores(root: Object3D, material: MeshStandardMaterial): { setStores(bombsLeft: number, rocketsLeft: number): void; dispose(): void } {
  const bombGeometry = new BoxGeometry(1.6, 0.5, 0.5)
  const bombMeshes = RACK_OFFSETS.map(({ id, offset }) => {
    const mesh = new Mesh(bombGeometry, material)
    mesh.name = id
    mesh.position.set(...offset)
    root.add(mesh)
    return mesh
  })
  const rocketGeometry = new CylinderGeometry(0.09, 0.09, 1.4, 8)
  rocketGeometry.rotateZ(Math.PI / 2)
  const rocketMeshes = RAIL_OFFSETS.map(({ id, offset }) => {
    const mesh = new Mesh(rocketGeometry, material)
    mesh.name = id
    mesh.position.set(...offset)
    root.add(mesh)
    return mesh
  })

  return {
    setStores(bombsLeft: number, rocketsLeft: number): void {
      const droppedBombs = RACK_OFFSETS.length - bombsLeft
      bombMeshes.forEach((mesh, i) => { mesh.visible = i >= droppedBombs })
      const firedRockets = RAIL_OFFSETS.length - rocketsLeft
      const hidden = new Set(RAIL_DROP_ORDER.slice(0, firedRockets))
      rocketMeshes.forEach((mesh, i) => { mesh.visible = !hidden.has(i) })
    },
    /** Frees the two store geometries this call built. `material` is the
     *  caller's, so it is the caller's to free. */
    dispose(): void {
      bombGeometry.dispose()
      rocketGeometry.dispose()
    },
  }
}
