import { Color, CylinderGeometry, DynamicDrawUsage, Group, IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, Object3D } from 'three'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import { float, hash, instanceIndex, length, positionWorld, smoothstep, uniform } from 'three/tsl'
import { SCENERY_TIERS, TREE_FADE_END_M, type SceneryTierName } from './tiers.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { heightAt, type TerrainField } from '../../sim/world/terrain.js'
import { inAirfieldClearing } from './airfield.js'
import { nearRiver } from '../terrain/rivers.js'

export const TREE_CELL_M = 400
export const TREE_CELL_RADIUS = 5
export const TREES_PER_CELL = 220
/** The per-instance dissolve runs over the last TREE_FADE_BAND_M metres
 *  before the tier's `treeFadeEndM` (scene/tiers.ts, at most
 *  TREE_FADE_END_M); beyond it every fragment of a tree is discarded. */
export const TREE_FADE_BAND_M = 450
export { TREE_FADE_END_M }
export type TreeSite = { x: number; y: number; z: number; height: number; radius: number; shade: number }

/**
 * Cell offsets from the eye's cell that can still show a tree: those whose
 * nearest point to any position inside the eye's cell is within the fade.
 * A disc, not the 11x11 square Codex shipped, whose corner cells sit
 * 1.8-2.3 km out and contributed only discarded fragments and matrix
 * rewrites (measured 2026-09-17, tests/render/scenery.test.ts).
 */
export function residentCellOffsets(fadeEndM = TREE_FADE_END_M): readonly (readonly [number, number])[] {
  const offsets: [number, number][] = []
  if (fadeEndM <= 0) return offsets
  for (let dz = -TREE_CELL_RADIUS; dz <= TREE_CELL_RADIUS; dz++) {
    for (let dx = -TREE_CELL_RADIUS; dx <= TREE_CELL_RADIUS; dx++) {
      const nearest = Math.hypot(Math.max(0, Math.abs(dx) - 1), Math.max(0, Math.abs(dz) - 1)) * TREE_CELL_M
      if (nearest <= fadeEndM) offsets.push([dx, dz])
    }
  }
  return offsets
}
const CAPACITY = residentCellOffsets().length * TREES_PER_CELL

/** One cell's instances, composed once and copied on every later visit. */
type PackedCell = { readonly count: number; readonly crowns: Float32Array; readonly trunks: Float32Array; readonly colors: Float32Array }

function packCell(sites: readonly TreeSite[]): PackedCell {
  const dummy = new Object3D(), tint = new Color()
  const crowns = new Float32Array(sites.length * 16), trunks = new Float32Array(sites.length * 16), colors = new Float32Array(sites.length * 3)
  sites.forEach((t, i) => {
    dummy.position.set(t.x, t.y + t.height * 0.5, t.z)
    dummy.scale.set(1, t.height, 1)
    dummy.rotation.set(0, 0, 0)
    dummy.updateMatrix()
    dummy.matrix.toArray(trunks, i * 16)
    dummy.position.y = t.y + t.height * 0.84
    dummy.scale.set(t.radius, t.height * 0.32, t.radius * (0.85 + t.shade * 0.3))
    dummy.rotation.y = t.shade * Math.PI
    dummy.updateMatrix()
    dummy.matrix.toArray(crowns, i * 16)
    tint.setHSL(0.25 + t.shade * 0.08, 0.24 + t.shade * 0.14, 0.16 + t.shade * 0.07)
    tint.toArray(colors, i * 3)
  })
  return { count: sites.length, crowns, trunks, colors }
}

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

export function createVegetation(field: TerrainField): {
  object: Group
  update(x: number, z: number): void
  /** Apply a quality tier (scene/tiers.ts): the forest is rebuilt at once
   *  for the eye's last position. */
  setTier(name: SceneryTierName): void
  /** Cells generated so far: the crossing test reads it. */
  stats(): { generated: number }
} {
  const object = new Group()
  object.name = 'nearby jungle'
  const leaves = new MeshStandardNodeMaterial({ color: 0xffffff, roughness: 1 })
  const bark = new MeshStandardNodeMaterial({ color: 0x665340, roughness: 1 })
  // positionWorld includes the scene's -eye translation: this is distance
  // from the camera, not distance from the geographic world origin.
  const fadeStart = uniform(TREE_FADE_END_M - TREE_FADE_BAND_M), fadeEnd = uniform(TREE_FADE_END_M)
  const fade = float(1).sub(smoothstep(fadeStart, fadeEnd, length(positionWorld)))
  // A per-instance dissolve: tree i is drawn while fade > hash(i), so the
  // forest thins one whole tree at a time across the 1400-1850 m band and no
  // pixel is ever blended. NOT `alphaHash: true`: three r186's alpha hash
  // takes dFdx/dFdy of the position and then discards, and on the reference
  // desktop (2026-09-17, Playwright 1.63 Chromium, RX 6700 XT) that shader
  // fails pipeline creation with "An error occurred while generating Tint
  // IR" -- every command buffer touching the trees was rejected, the trees
  // never drew, and the app's own error list showed only the downstream
  // "invalid due to a previous error" entries. tests/render/scenery.test.ts
  // guards it; the single-variable probe that found it is in the 13a notes.
  const threshold = hash(instanceIndex)
  for (const material of [leaves, bark]) {
    material.opacityNode = fade
    material.alphaTestNode = threshold
  }
  const lobes = [new IcosahedronGeometry(1, 0),
    new IcosahedronGeometry(0.8, 0).translate(0.5, -0.2, 0.25),
    new IcosahedronGeometry(0.75, 0).translate(-0.45, -0.15, -0.35)]
  const crownGeometry = mergeGeometries(lobes)!
  for (const lobe of lobes) lobe.dispose()
  crownGeometry.computeVertexNormals()
  const crowns = new InstancedMesh(crownGeometry, leaves, CAPACITY)
  const trunks = new InstancedMesh(new CylinderGeometry(0.4, 0.65, 1, 5), bark, CAPACITY)
  crowns.instanceColor = new InstancedBufferAttribute(new Float32Array(CAPACITY * 3), 3)
  for (const mesh of [crowns, trunks]) {
    mesh.instanceMatrix.setUsage(DynamicDrawUsage)
    mesh.frustumCulled = false
    mesh.count = 0
    object.add(mesh)
  }
  const crownArray = crowns.instanceMatrix.array as Float32Array
  const trunkArray = trunks.instanceMatrix.array as Float32Array
  const colorArray = crowns.instanceColor.array as Float32Array
  let previousKey = ''
  let generated = 0
  let offsets = residentCellOffsets()
  let lastX = 0, lastZ = 0
  // Cells stay cached while resident. A crossing composes only the cells
  // that entered and copies the rest: the square window's full recompose of
  // every instance cost 4.7-7.2 ms per crossing in node (2026-09-17).
  let cache = new Map<string, PackedCell>()
  return {
    object,
    stats: () => ({ generated }),
    setTier(name): void {
      const endM = SCENERY_TIERS[name].treeFadeEndM
      fadeEnd.value = endM
      fadeStart.value = Math.max(0, endM - TREE_FADE_BAND_M)
      offsets = residentCellOffsets(endM)
      previousKey = ''
      this.update(lastX, lastZ)
    },
    update(x, z): void {
      lastX = x
      lastZ = z
      const cx = Math.floor(x / TREE_CELL_M), cz = Math.floor(z / TREE_CELL_M)
      const key = `${cx},${cz}`
      if (key === previousKey) return
      previousKey = key
      const nextCache = new Map<string, PackedCell>()
      let index = 0
      for (const [dx, dz] of offsets) {
        const k = `${cx + dx},${cz + dz}`
        let cell = cache.get(k)
        if (!cell) {
          cell = packCell(treeSites(field, cx + dx, cz + dz))
          generated++
        }
        nextCache.set(k, cell)
        crownArray.set(cell.crowns, index * 16)
        trunkArray.set(cell.trunks, index * 16)
        colorArray.set(cell.colors, index * 3)
        index += cell.count
      }
      cache = nextCache
      crowns.count = trunks.count = index
      crowns.instanceMatrix.needsUpdate = trunks.instanceMatrix.needsUpdate = true
      crowns.instanceColor!.needsUpdate = true
    },
  }
}
