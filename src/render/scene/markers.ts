import { BoxGeometry, Group, Mesh, MeshStandardMaterial, type Object3D } from 'three'

/** Known spacing is what turns "something moved" into "I am 300 m up". */
export const MARKER_SPACING_M = 1000

export function createMarkers(): Object3D {
  const group = new Group()
  const geo = new BoxGeometry(12, 12, 12)
  const mat = new MeshStandardMaterial({ color: 0xd8552f, roughness: 0.6 })
  for (let i = -10; i <= 10; i++) {
    for (let j = -2; j <= 2; j++) {
      const m = new Mesh(geo, mat)
      m.position.set(i * MARKER_SPACING_M, 6, j * MARKER_SPACING_M)
      group.add(m)
    }
  }
  return group
}
