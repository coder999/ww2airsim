import { Color, CylinderGeometry, DynamicDrawUsage, Group, IcosahedronGeometry, InstancedMesh, Object3D } from 'three'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import { float, length, positionWorld, smoothstep } from 'three/tsl'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { heightAt, type TerrainField } from '../../sim/world/terrain.js'
import { inAirfieldClearing } from './airfield.js'
import { nearRiver } from '../terrain/rivers.js'

export const TREE_CELL_M = 400
export const TREE_CELL_RADIUS = 5
export const TREES_PER_CELL = 220
const CAPACITY = (TREE_CELL_RADIUS * 2 + 1) ** 2 * TREES_PER_CELL
export type TreeSite = { x: number; y: number; z: number; height: number; radius: number; shade: number }

/** Stable per-cell placement. Camera motion never rerolls the forest. */
export function treeSites(field: TerrainField, cellX: number, cellZ: number): TreeSite[] {
  let seed = (Math.imul(cellX, 73856093) ^ Math.imul(cellZ, 19349663) ^ 1944) >>> 0
  const random = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  const sites: TreeSite[] = []
  for (let i = 0; i < TREES_PER_CELL; i++) {
    const x = (cellX + random()) * TREE_CELL_M, z = (cellZ + random()) * TREE_CELL_M
    const height = 12 + random() * 15, radius = 6 + random() * 5, shade = random()
    const y = heightAt(field, x, z)
    if (y < 3 || y > 1250 || inAirfieldClearing(x, z) || nearRiver(x, z)) continue
    const slope = Math.hypot(heightAt(field, x + 10, z) - heightAt(field, x - 10, z),
      heightAt(field, x, z + 10) - heightAt(field, x, z - 10)) / 20
    if (slope > 0.65) continue
    sites.push({ x, y, z, height, radius, shade })
  }
  return sites
}

export function createVegetation(field: TerrainField): { object: Group; update(x: number, z: number): void } {
  const object = new Group()
  object.name = 'nearby jungle'
  const leaves = new MeshStandardNodeMaterial({ color: 0xffffff, roughness: 1, alphaHash: true })
  const bark = new MeshStandardNodeMaterial({ color: 0x665340, roughness: 1, alphaHash: true })
  // positionWorld includes the scene's -eye translation: this is distance
  // from the camera, not distance from the geographic world origin.
  const fade = float(1).sub(smoothstep(1400, 1850, length(positionWorld)))
  leaves.opacityNode = fade
  bark.opacityNode = fade
  const lobes = [new IcosahedronGeometry(1, 0),
    new IcosahedronGeometry(0.8, 0).translate(0.5, -0.2, 0.25),
    new IcosahedronGeometry(0.75, 0).translate(-0.45, -0.15, -0.35)]
  const crownGeometry = mergeGeometries(lobes)!
  for (const lobe of lobes) lobe.dispose()
  crownGeometry.computeVertexNormals()
  const crowns = new InstancedMesh(crownGeometry, leaves, CAPACITY)
  const trunks = new InstancedMesh(new CylinderGeometry(0.4, 0.65, 1, 5), bark, CAPACITY)
  for (const mesh of [crowns, trunks]) {
    mesh.instanceMatrix.setUsage(DynamicDrawUsage)
    mesh.frustumCulled = false
    mesh.count = 0
    object.add(mesh)
  }
  const dummy = new Object3D(), tint = new Color()
  let previousKey = ''
  let cache = new Map<string, TreeSite[]>()
  return {
    object,
    update(x, z): void {
      const cx = Math.floor(x / TREE_CELL_M), cz = Math.floor(z / TREE_CELL_M)
      const key = `${cx},${cz}`
      if (key === previousKey) return
      previousKey = key
      const nextCache = new Map<string, TreeSite[]>()
      let index = 0
      for (let dz = -TREE_CELL_RADIUS; dz <= TREE_CELL_RADIUS; dz++) {
        for (let dx = -TREE_CELL_RADIUS; dx <= TREE_CELL_RADIUS; dx++) {
          const k = `${cx + dx},${cz + dz}`
          const sites = cache.get(k) ?? treeSites(field, cx + dx, cz + dz)
          nextCache.set(k, sites)
          for (const t of sites) {
            dummy.position.set(t.x, t.y + t.height * 0.5, t.z)
            dummy.scale.set(1, t.height, 1)
            dummy.rotation.set(0, 0, 0)
            dummy.updateMatrix()
            trunks.setMatrixAt(index, dummy.matrix)
            dummy.position.y = t.y + t.height * 0.84
            dummy.scale.set(t.radius, t.height * 0.32, t.radius * (0.85 + t.shade * 0.3))
            dummy.rotation.y = t.shade * Math.PI
            dummy.updateMatrix()
            crowns.setMatrixAt(index, dummy.matrix)
            tint.setHSL(0.25 + t.shade * 0.08, 0.24 + t.shade * 0.14, 0.16 + t.shade * 0.07)
            crowns.setColorAt(index, tint)
            index++
          }
        }
      }
      cache = nextCache
      crowns.count = trunks.count = index
      crowns.instanceMatrix.needsUpdate = trunks.instanceMatrix.needsUpdate = true
      if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true
    },
  }
}
