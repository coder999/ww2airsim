import { longForestEnabled } from './forestDistance.js'
import { forestCanopyMode, type ForestCanopyMode } from './forestCanopy.js'
import { TREE_CELL_M, TREES_PER_CELL, residentCellOffsets } from './treeCells.js'
import { createDistantTrees, distantTreesEnabled, type DistantTreeStats } from './distantTrees.js'
import { Color, CylinderGeometry, DynamicDrawUsage, Group, IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, Object3D } from 'three'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import { float, hash, instanceIndex, length, positionWorld, smoothstep, uniform } from 'three/tsl'
import { treeFadeMode, treePixelThreshold, type TreeFadeMode } from './treeFade.js'
import { SCENERY_TIERS, TREE_FADE_END_M, type SceneryTierName } from './tiers.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { EMERGENT_HEIGHT_SCALE, EMERGENT_RADIUS_SCALE, standRole, type StandRole } from './standModel.js'
import { heightAt, type TerrainField } from '../../sim/world/terrain.js'
import { inAirfieldClearing } from './airfield.js'
import type { Airfield } from '../../sim/world/airfields.js'
import type { HutFootprint } from './towns.js'
import { nearRiver } from '../terrain/rivers.js'
import { coverFractionsAt, type CoverHeader } from '../landcover/cover.js'
import { COVER_HEADER } from '../landcover/load.js'

export type CoverLookup = { fractionsAt(x: number, z: number): { tree: number; crop: number; mangrove: number; open: number } }

/** CPU twin of the shader's raster read: same bytes, same index
 *  (`coverIndex`'s nearest-sample rounding) -- the shader reads those same
 *  bytes through `LinearFilter`, not nearest, so the two agree on which
 *  sample a world position means but not on how a fragment between samples
 *  blends. */
export function coverLookup(data: Uint8Array, header: CoverHeader = COVER_HEADER): CoverLookup {
  return { fractionsAt: (x, z) => coverFractionsAt(data, header, x, z) }
}

export { TREE_CELL_M, TREE_CELL_RADIUS, TREES_PER_CELL, residentCellOffsets } from './treeCells.js'
export const TREE_FADE_BAND_M = 450
export { TREE_FADE_END_M }
export type TreeSite = { x: number; y: number; z: number; height: number; radius: number; shade: number
  /** Only when `treeSites` is asked for it (`stand`): where the tree sits in its stand, see standModel.ts. */
  role?: StandRole }

const CAPACITY = residentCellOffsets().length * TREES_PER_CELL

/** Keeps a candidate tree out of a town or village hut's footprint (Plan 13d
 *  Task 3, design §7: "each hut's footprint is cleared of trees the way the
 *  airfield's is"). `AIRFIELD_HUTS` gets that incidentally, by sitting
 *  inside its own airfield's `clearing` rect -- `inAirfieldClearing` already
 *  excludes it below. A town's huts are placed OUTSIDE every airfield
 *  clearing (`townHutFootprints`), so nothing else keeps trees off them;
 *  this is the exclusion `treeSites` needs for those. An axis-aligned box,
 *  like `drawBuilding`'s own footprint -- huts do not rotate. */
export function nearTownHut(huts: readonly HutFootprint[], x: number, z: number): boolean {
  return huts.some((h) => Math.abs(x - h.x) < h.width / 2 && Math.abs(z - h.z) < h.length / 2)
}

/** One cell's instances, composed once and copied on every later visit. */
type PackedCell = { readonly count: number; readonly crowns: Float32Array; readonly trunks: Float32Array; readonly colors: Float32Array; readonly seeds: Float32Array; readonly topY: number }

function packCell(sites: readonly TreeSite[]): PackedCell {
  const dummy = new Object3D(), tint = new Color()
  const crowns = new Float32Array(sites.length * 16), trunks = new Float32Array(sites.length * 16), colors = new Float32Array(sites.length * 3)
  const seeds = new Float32Array(sites.length)
  let topY = -Infinity
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
    seeds[i] = t.shade
    topY = Math.max(topY, t.y + t.height * 1.25)
  })
  return { count: sites.length, crowns, trunks, colors, seeds, topY }
}

/** Stable per-cell placement. Camera motion never rerolls the forest.
 *  With a cover lookup (Plan 13b) a candidate survives with probability
 *  equal to the local tree-plus-mangrove fraction, drawn from the same
 *  per-cell stream so determinism holds; without one, every candidate
 *  survives, which is the daa1b39 forest. Mangrove (fraction above 0.25)
 *  lifts the 3 m shore exclusion to 0.5 m: that is where mangroves grow.
 *
 *  `airfields` is the world's whole list, not one base (Plan 12 Task 7):
 *  `inAirfieldClearing` is what keeps the jungle off a strip, and before the
 *  list it only knew about Tacloban -- so Dulag had trees down the middle of
 *  it. Ahead of `cover` in the parameter list because it is required and
 *  `cover` is not.
 *
 *  `huts` (Plan 13d Task 3) defaults to empty so every existing caller --
 *  this file's own tests included -- is unaffected; only `createVegetation`
 *  (via `main.ts`, which also builds the town huts) passes a real list. */
export function treeSites(field: TerrainField, cellX: number, cellZ: number, airfields: readonly Airfield[], cover?: CoverLookup, huts: readonly HutFootprint[] = [], candidates = TREES_PER_CELL, stand = false): TreeSite[] {
  let seed = (Math.imul(cellX, 73856093) ^ Math.imul(cellZ, 19349663) ^ 1944) >>> 0
  const random = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  const sites: TreeSite[] = []
  const forestAt = stand ? forestProbe(field, airfields, cover, huts) : () => true
  for (let i = 0; i < candidates; i++) {
    const x = (cellX + random()) * TREE_CELL_M, z = (cellZ + random()) * TREE_CELL_M
    const height = 12 + random() * 15, radius = 6 + random() * 5, shade = random()
    const roll = random()
    const f = cover?.fractionsAt(x, z)
    if (f && roll >= f.tree + f.mangrove) continue
    const shoreM = f && f.mangrove > 0.25 ? 0.5 : 3
    const y = heightAt(field, x, z)
    if (y < shoreM || y > 1250 || inAirfieldClearing(airfields, x, z) || nearTownHut(huts, x, z) || nearRiver(x, z)) continue
    const slope = Math.hypot(heightAt(field, x + 10, z) - heightAt(field, x - 10, z),
      heightAt(field, x, z + 10) - heightAt(field, x, z - 10)) / 20
    if (slope > 0.65) continue
    sites.push(stand ? { x, y, z, height, radius, shade, role: standRole(x, z, forestAt, cellX, cellZ, i) } : { x, y, z, height, radius, shade })
  }
  return sites
}

/** The part of `treeSites`'s exclusions a stand boundary is made of (cover, shore, clearing, huts, river); no slope. */
function forestProbe(field: TerrainField, airfields: readonly Airfield[], cover: CoverLookup | undefined, huts: readonly HutFootprint[]): (x: number, z: number) => boolean {
  return (x, z) => {
    const f = cover?.fractionsAt(x, z)
    if (f && f.tree + f.mangrove < STAND_COVER_MIN) return false
    const y = heightAt(field, x, z)
    return y >= (f && f.mangrove > 0.25 ? 0.5 : 3) && y <= 1250 && !inAirfieldClearing(airfields, x, z) && !nearTownHut(huts, x, z) && !nearRiver(x, z)
  }
}
/** A point counts as stand when at least this fraction of it is tree or mangrove (a candidate survives with that probability). */
const STAND_COVER_MIN = 0.5

/** What the distant layers draw under the relief canopy (D2, D3): edge-band trees and emergents only, the emergents taller.
 *  The interior is the terrain's job. The near trees never call this. */
export function standEdgeSites(field: TerrainField, cellX: number, cellZ: number, airfields: readonly Airfield[], cover: CoverLookup | undefined, huts: readonly HutFootprint[], candidates = TREES_PER_CELL): TreeSite[] {
  return treeSites(field, cellX, cellZ, airfields, cover, huts, candidates, true).filter(t => t.role !== 'interior')
    .map(t => t.role === 'emergent' ? { ...t, height: t.height * EMERGENT_HEIGHT_SCALE, radius: t.radius * EMERGENT_RADIUS_SCALE } : t)
}

export function createVegetation(field: TerrainField, airfields: readonly Airfield[], huts: readonly HutFootprint[] = [], fadeMode: TreeFadeMode = treeFadeMode(), distant = distantTreesEnabled(), longForest = longForestEnabled(), canopyMode: ForestCanopyMode = forestCanopyMode()): {
  object: Group
  update(x: number, z: number, eyeY?: number): void
  /** Apply a quality tier (scene/tiers.ts): the forest is rebuilt at once
   *  for the eye's last position. */
  setTier(name: SceneryTierName): void
  /** Apply the land-cover raster (Plan 13b) once it has loaded: the cache is
   *  discarded and the forest is rebuilt at once for the eye's last position. */
  setCover(cover: CoverLookup): void
  /** Resident and submitted tree counts; generated tracks cell-cache work. */
  stats(): { generated: number; instances: number; visible: boolean; drawnInstances: number; fadeMode: TreeFadeMode; fadeStartM: number; fadeEndM: number; distant: DistantTreeStats; coarse: DistantTreeStats; canopyMode: ForestCanopyMode }
} {
  const object = new Group()
  object.name = 'nearby jungle'
  const leaves = new MeshStandardNodeMaterial({ color: 0xffffff, roughness: 1 })
  const bark = new MeshStandardNodeMaterial({ color: 0x665340, roughness: 1 })
  // positionWorld includes the scene's -eye translation: this is distance
  // from the camera, not distance from the geographic world origin.
  const range = (name: SceneryTierName) => SCENERY_TIERS[name].treeFadeEndM
  const start = (end: number) => Math.max(0, end - TREE_FADE_BAND_M)
  const fadeStart = uniform(start(range('high'))), fadeEnd = uniform(range('high'))
  const fade = float(1).sub(smoothstep(fadeStart, fadeEnd, length(positionWorld)))
  // Both comparison modes use the original 1400-1850 m band and tree art.
  // Pixel mode dissolves coverage within each crown, instead of removing it
  // in one step. Its stable site seed survives buffer repacking. NOT `alphaHash: true`: three r186's alpha hash
  // takes dFdx/dFdy of the position and then discards, and on the reference
  // desktop (2026-09-17, Playwright 1.63 Chromium, RX 6700 XT) that shader
  // fails pipeline creation with "An error occurred while generating Tint
  // IR" -- every command buffer touching the trees was rejected, the trees
  // never drew, and the app's own error list showed only the downstream
  // "invalid due to a previous error" entries. tests/render/scenery.test.ts
  // guards it; the single-variable probe that found it is in the 13a notes.
  const threshold = fadeMode === 'pixel' ? treePixelThreshold() : hash(instanceIndex)
  for (const material of [leaves, bark]) {
    material.opacityNode = fadeMode === 'soft' ? fade.greaterThanEqual(1).select(1, 0) : fade
    material.alphaTestNode = fadeMode === 'soft' ? float(0.5) : threshold
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
    mesh.receiveShadow = true // Plan 16b, see hellcat.ts
    mesh.count = 0
    object.add(mesh)
  }
  // Keep the near forest in the opaque depth pass. Only the distance band
  // blends; shared buffers keep both representations aligned across cell changes.
  // The blended band has no per-instance sorting: inspect overlapping crowns
  // in motion before promoting this DEV experiment (2026-10-13).
  const fading: InstancedMesh[] = []
  if (fadeMode === 'soft') for (const solid of [crowns, trunks]) {
    const material = (solid.material as MeshStandardNodeMaterial).clone()
    material.transparent = true
    material.depthWrite = false
    material.opacityNode = fade.lessThan(1).select(fade, 0)
    material.alphaTestNode = float(0)
    const mesh = new InstancedMesh(solid.geometry, material, 0)
    mesh.instanceMatrix = solid.instanceMatrix
    mesh.instanceColor = solid.instanceColor
    mesh.frustumCulled = false
    mesh.receiveShadow = true
    object.add(mesh)
    fading.push(mesh)
  }
  const meshes = [crowns, trunks, ...fading]
  const crownArray = crowns.instanceMatrix.array as Float32Array
  const trunkArray = trunks.instanceMatrix.array as Float32Array
  const colorArray = crowns.instanceColor.array as Float32Array
  const fadeSeeds = new InstancedBufferAttribute(new Float32Array(CAPACITY), 1).setUsage(DynamicDrawUsage)
  if (fadeMode === 'pixel') for (const mesh of [crowns, trunks]) mesh.geometry.setAttribute('treeFadeSeed', fadeSeeds)
  let previousKey = ''
  let generated = 0
  let offsets = residentCellOffsets(range('high'))
  let lastX = 0, lastZ = 0, lastY = 0, topY = -Infinity
  const cull = () => {
    // A conservative upper bound on every crown: safe even over steep ground.
    // Group visibility is independent of the scenery tier.
    const visible = lastY - topY <= fadeEnd.value
    for (const mesh of meshes) mesh.visible = visible
  }
  let cover: CoverLookup | undefined
  // Relief canopy (D1, D2, D3): the interior is the terrain's job, so the distant layers keep only edge-band trees and emergents.
  const relief = canopyMode === 'relief'
  const farSites = (cx: number, cz: number, candidates = TREES_PER_CELL): TreeSite[] => relief
    ? standEdgeSites(field, cx, cz, airfields, cover, huts, candidates) : treeSites(field, cx, cz, airfields, cover, huts, candidates)
  const far = distant ? createDistantTrees((cx, cz) => farSites(cx, cz)) : null
  if (far) object.add(far.object)
  // A coarse cell contains 16 original cells. Taking only the first 14
  // candidates preserves canonical locations and all placement exclusions.
  const coarse = longForest ? createDistantTrees((cx, cz) => {
    const sites: TreeSite[] = []
    for (let dz = 0; dz < 4; dz++) for (let dx = 0; dx < 4; dx++) {
      sites.push(...farSites(cx * 4 + dx, cz * 4 + dz, 14))
    }
    return sites
  }, true) : null
  if (coarse) object.add(coarse.object)
  const disabled: DistantTreeStats = { enabled: false, ready: true, instances: 0, drawnInstances: 0, pending: 0, generated: 0, maxUpdateMs: 0, fadeEndM: 0 }
  // Cells stay cached while resident. A crossing composes only the cells
  // that entered and copies the rest: the square window's full recompose of
  // every instance cost 4.7-7.2 ms per crossing in node (2026-09-17).
  let cache = new Map<string, PackedCell>()
  return {
    object,
    stats: () => ({ generated, instances: crowns.count, visible: object.visible, drawnInstances: object.visible && crowns.visible ? crowns.count : 0, fadeMode, fadeStartM: fadeStart.value, fadeEndM: fadeEnd.value, distant: far?.stats(object.visible) ?? disabled, coarse: coarse?.stats(object.visible) ?? disabled, canopyMode }),
    setTier(name): void {
      far?.setTier(name)
      coarse?.setTier(name)
      const endM = range(name)
      fadeEnd.value = endM
      fadeStart.value = start(endM)
      offsets = residentCellOffsets(endM)
      previousKey = ''
      this.update(lastX, lastZ, lastY)
    },
    setCover(next): void {
      cover = next
      far?.reset()
      coarse?.reset()
      cache = new Map()
      previousKey = ''
      this.update(lastX, lastZ, lastY)
    },
    update(x, z, eyeY = 0): void {
      lastX = x
      lastZ = z
      lastY = eyeY
      // Preserve the last eye for tier/cover changes, but skip all streaming
      // and buffer uploads while the player's tree switch is off.
      if (!object.visible) return
      far?.update(x, z, eyeY)
      coarse?.update(x, z, eyeY)
      const cx = Math.floor(x / TREE_CELL_M), cz = Math.floor(z / TREE_CELL_M)
      const key = `${cx},${cz}`
      if (key === previousKey) { cull(); return }
      previousKey = key
      const nextCache = new Map<string, PackedCell>()
      let index = 0
      topY = -Infinity
      for (const [dx, dz] of offsets) {
        const k = `${cx + dx},${cz + dz}`
        let cell = cache.get(k)
        if (!cell) {
          cell = packCell(treeSites(field, cx + dx, cz + dz, airfields, cover, huts))
          generated++
        }
        nextCache.set(k, cell)
        crownArray.set(cell.crowns, index * 16)
        trunkArray.set(cell.trunks, index * 16)
        colorArray.set(cell.colors, index * 3)
        if (fadeMode === 'pixel') (fadeSeeds.array as Float32Array).set(cell.seeds, index)
        topY = Math.max(topY, cell.topY)
        index += cell.count
      }
      cache = nextCache
      for (const mesh of meshes) mesh.count = index
      crowns.instanceMatrix.needsUpdate = trunks.instanceMatrix.needsUpdate = true
      crowns.instanceColor!.needsUpdate = true
      fadeSeeds.needsUpdate = true
      cull()
    },
  }
}
