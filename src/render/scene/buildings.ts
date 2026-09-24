import { BoxGeometry, BufferAttribute, BufferGeometry, DoubleSide, Group, Mesh, type Material } from 'three'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import { color, mix, positionLocal, varying } from 'three/tsl'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { heightAt, type TerrainField } from '../../sim/world/terrain.js'
import { groundNoise } from '../terrain/surface.js'

/**
 * Shared mesh-construction plumbing for both `airfield.ts` (hangars, the
 * tower, AAA pits and its own decorative huts) and `towns.ts` (Plan 13d Task
 * 3: village/town hut rings). Extracted from `airfield.ts`, which owned all
 * of this alone through Plan 12 -- `drawBuilding` took airfield-local
 * coordinates via a closure-captured `at()` transform and closure-captured
 * materials, neither of which a caller outside `createAirfield` could reuse.
 * Both are now explicit parameters so a second caller can supply its own
 * world-space positions and its own material set.
 */

export function weathered(base: number, worn: number): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ roughness: 0.93, side: DoubleSide })
  m.colorNode = mix(color(base), color(worn), groundNoise(varying(positionLocal.xz), 30).g)
  return m
}

/** One material/geometry collector: the shape `airfield.ts`'s top-level
 *  `shared` batch and each content building's own per-structure batch both
 *  use (Task 8's doc comment on `createAirfield` explains why a strike-target
 *  building cannot share the airfield-wide batch). `towns.ts` uses the same
 *  shape for its own single, never-a-strike-target batch. */
export function makeCollector(): {
  readonly add: (g: BufferGeometry, m: Material) => void
  readonly box: (x: number, y: number, z: number, w: number, h: number, d: number, m: Material) => void
  readonly batches: Map<Material, BufferGeometry[]>
} {
  const batches = new Map<Material, BufferGeometry[]>()
  const add = (g: BufferGeometry, m: Material): void => {
    // Merge a common position/normal layout, regardless of primitive UVs.
    g.deleteAttribute('uv')
    const list = batches.get(m) ?? []
    list.push(g)
    batches.set(m, list)
  }
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, m: Material): void => {
    add(new BoxGeometry(w, h, d).translate(x, y + h / 2, z), m)
  }
  return { add, box, batches }
}

/** One merged mesh per material, and the source geometries released. */
export function batched(root: Group, batches: Map<Material, BufferGeometry[]>): Group {
  for (const [material, geometries] of batches) {
    const geometry = mergeGeometries(geometries)
    if (!geometry) throw new Error('buildings: incompatible scenery geometry')
    const mesh = new Mesh(geometry, material)
    mesh.receiveShadow = true // Plan 16b, see hellcat.ts
    root.add(mesh)
    for (const g of geometries) g.dispose()
  }
  return root
}

/** The five weathered materials `drawBuilding` itself paints with. Airfield
 *  scenery beyond a building -- the apron, the taxiways, stores, the windsock
 *  -- has its own `coral`/`canvas` materials that stay in `airfield.ts`, so
 *  this set is exactly what `drawBuilding` needs and no more. A fresh call
 *  makes a fresh set of materials (`createAirfield` calls this once per
 *  airfield already, same as it made these five directly before this
 *  extraction; `createTowns` calls it once for every settlement combined). */
export type BuildingMaterials = {
  readonly steel: Material
  readonly timber: Material
  readonly concrete: Material
  readonly dark: Material
  readonly white: Material
}

export function createBuildingMaterials(): BuildingMaterials {
  return {
    steel: weathered(0x59645a, 0x919286),
    timber: weathered(0x61513c, 0x8d7957),
    concrete: weathered(0x8d8978, 0xb3ac92),
    dark: weathered(0x172624, 0x263e3b),
    white: weathered(0xd5c9a0, 0xefe4c9),
  }
}

/**
 * Static batches: one draw per material, including roof ribs and window
 * frames. These are visual objects; building collision belongs to the entity
 * phase.
 *
 * `x`/`z` are now WORLD-space (Plan 13d Task 3): the airfield-local-to-world
 * transform used to happen inside this function, via a closure-captured
 * `at()`; now every caller does its own transform (or has none, for a town
 * hut placed directly in world space) before calling in. `field` is an
 * explicit parameter for the same reason -- both used to be closed over by
 * `createAirfield` alone.
 *
 * Returns the building's ground height so the caller can place a collapsed
 * rubble pile, a smoke column, or nothing at all (towns' huts, never a
 * strike target) at the same spot.
 */
export function drawBuilding(
  collector: ReturnType<typeof makeCollector>,
  b: { kind: 'hangar' | 'tower' | 'hut' | 'aaa'; x: number; z: number; width: number; length: number },
  field: TerrainField,
  materials: BuildingMaterials,
): number {
  const { steel, timber, concrete, dark, white } = materials
  const { add, box } = collector
  const { x, z } = b
  const y = Math.max(...[-1, 1].flatMap(sx => [-1, 1].map(sz =>
    heightAt(field, x + sx * b.width / 2, z + sz * b.length / 2))))
  box(x, y - 0.5, z, b.width + 1, 0.8, b.length + 1, concrete)
  if (b.kind === 'tower') {
    for (const dx of [-3.5, 3.5]) for (const dz of [-3.5, 3.5]) {
      box(x + dx, y, z + dz, 0.45, 10, 0.45, timber)
    }
    box(x, y + 8, z, 8.5, 1.1, 8.5, timber)
    box(x, y + 9.1, z, 7.5, 2.4, 7.5, dark)
    for (const dx of [-3.8, 0, 3.8]) for (const dz of [-3.8, 3.8]) {
      box(x + dx, y + 9, z + dz, 0.22, 2.8, 0.22, white)
    }
    box(x, y + 11.7, z, 10, 0.4, 10, steel)
    box(x, y + 12.1, z, 0.12, 4, 0.12, steel)
    for (let i = 0; i < 16; i++) box(x + 5, y + i * 0.5, z + 4 - i * 0.55, 1.2, 0.16, 0.6, timber)
    return y
  }
  const wall = b.kind === 'hangar' ? 5.5 : 2.8
  const roofHeight = b.kind === 'hangar' ? b.width * 0.25 : 2.2
  box(x - b.width / 2, y, z, 0.35, wall, b.length, steel)
  box(x + b.width / 2, y, z, 0.35, wall, b.length, steel)
  box(x, y, z - b.length / 2, b.width, wall, 0.3, b.kind === 'hut' ? timber : dark)
  if (b.kind === 'hut') box(x, y, z + b.length / 2, b.width, wall, 0.3, timber)
  // Barrel roof, open toward the apron; an actual shell, not a solid block.
  const positions: number[] = [], indices: number[] = []
  const segments = 16
  for (let end = 0; end < 2; end++) for (let i = 0; i <= segments; i++) {
    const a = i / segments * Math.PI
    positions.push(x + Math.cos(a) * b.width / 2, y + wall + Math.sin(a) * roofHeight, z + (end - 0.5) * b.length)
  }
  for (let i = 0; i < segments; i++) {
    const j = i + segments + 1
    indices.push(i, i + 1, j, i + 1, j + 1, j)
  }
  const roof = new BufferGeometry()
  roof.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  roof.setIndex(indices)
  roof.computeVertexNormals()
  add(roof, steel)
  // Close the curved gable at the rear; huts are closed at both ends.
  // Without this, a view through the hangar sees sky through its back wall.
  for (const end of b.kind === 'hut' ? [-1, 1] : [-1]) {
    const gablePositions = [x, y + wall, z + end * b.length / 2]
    const gableIndices: number[] = []
    for (let i = 0; i <= segments; i++) {
      const a = i / segments * Math.PI
      gablePositions.push(x + Math.cos(a) * b.width / 2,
        y + wall + Math.sin(a) * roofHeight, z + end * b.length / 2)
      if (i > 0) gableIndices.push(0, i, i + 1)
    }
    const gable = new BufferGeometry()
    gable.setAttribute('position', new BufferAttribute(new Float32Array(gablePositions), 3))
    gable.setIndex(gableIndices)
    gable.computeVertexNormals()
    add(gable, steel)
  }
  for (let dz = -b.length / 2; dz <= b.length / 2; dz += 4) {
    for (let i = 0; i < segments; i++) {
      const a = (i + 0.5) / segments * Math.PI
      const rib = new BoxGeometry(b.width * Math.PI / segments / 2, 0.09, 0.12)
      rib.rotateZ(Math.atan2(roofHeight * Math.cos(a), -b.width / 2 * Math.sin(a)))
      rib.translate(x + Math.cos(a) * b.width / 2, y + wall + Math.sin(a) * roofHeight + 0.04, z + dz)
      add(rib, timber)
    }
  }
  return y
}
