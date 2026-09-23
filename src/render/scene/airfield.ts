import { BoxGeometry, BufferAttribute, BufferGeometry, CylinderGeometry, DoubleSide, Group, Mesh, type Material, type Object3D } from 'three'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import { color, mix, positionLocal, varying } from 'three/tsl'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { heightAt, type TerrainField } from '../../sim/world/terrain.js'
import { groundNoise } from '../terrain/surface.js'
import { insideRect, localToWorld, worldToLocal, type Airfield } from '../../sim/world/airfields.js'
import type { StructureDamage } from '../../sim/weapons/structures.js'
import { createSmokeColumn } from '../ordnance.js'

/** How long a collapsed building's smoke column fades over, seconds (spec
 *  §4: "a 60 s fading smoke column"). Longer than an ordnance impact's own
 *  `IMPACT_LIFETIME_S` (20 s, `ordnance.ts`) -- a razed building smoulders
 *  longer than the bomb that razed it flashes. */
const COLLAPSE_SMOKE_LIFETIME_S = 60

/** What `createAirfield` hands back (Plan 6b Task 8, fixed post-Task-8): the
 *  scene object, plus the per-structure update path -- following `ship.ts`'s
 *  own `setDamage` precedent of a per-frame VIEW of current `World.combat`
 *  state, not a one-way latch. The original Task 8 shape was a one-shot
 *  `setDestroyed(id)` called only for currently-destroyed ids, which meant a
 *  building never had a path back to intact -- Restart rebuilds a fresh
 *  `World.combat.structures` (`destroyedTick: null` for everyone) but
 *  nothing in the frame loop ever asked this handle to reflect that, so a
 *  destroyed hangar stayed collapsed rubble forever even once the sim
 *  itself reported it healthy again. `sync` replaces that: it is handed the
 *  CURRENT damage state for every structure every frame (mirroring
 *  `shipHandles[i].setDamage`, which already gets `World.combat.ships` every
 *  frame unconditionally) and sets each owned building's visuals from
 *  scratch each call, so reverting to intact needs no special case. */
export type AirfieldHandle = {
  readonly object: Group
  /** Sets every building this airfield owns to intact or collapsed from the
   *  CURRENT `structureDamage` map, every call -- not just on a rising edge
   *  to destroyed. A silent no-op for ids this airfield does not own (a
   *  structure belongs to exactly one airfield; `main.ts` calls this on
   *  every airfield with the full map rather than tracking which owns
   *  which). Idempotent in both directions: repeating the same destroyed or
   *  the same healthy state does not restart the smoke column or re-hide an
   *  already-hidden one. Forward (destroyed) keeps the existing 60 s smoke
   *  fade, started once on the transition into collapsed; backward (only
   *  reachable via Restart, since nothing else heals a structure) hides the
   *  collapsed geometry and smoke immediately -- Restart is a hard reset,
   *  not an animation. */
  sync(structureDamage: Readonly<Record<string, StructureDamage>>): void
  /** Ages every collapsed building's smoke column by one frame. */
  update(dtSeconds: number): void
}

/** Scenery layout, runway-local metres (`x` across the strip, `z` along it).
 * A period-inspired scene, not a claim to reconstruct the exact 1944 building
 * survey.
 *
 * Decorative only -- never a strike target, never in content, never in
 * `World.structures` (Plan 6b: the design spec's `buildings.kind` enum is
 * `'hangar' | 'tower'` only, and huts were never mentioned in it). The
 * hangars and the tower moved into each base's `content/bases/<id>.json` as
 * `Airfield.buildings`; huts stayed a small hardcoded table because widening
 * the damage-relevant `kind` enum for an undestroyable third case would be
 * worse than the small duplication of keeping them here. */
export const AIRFIELD_HUTS = [
  { x: -216, z: -60, width: 12, length: 28 },
  { x: -216, z: -15, width: 12, length: 28 },
  { x: -216, z: 30, width: 12, length: 28 },
] as const

/**
 * Also used by vegetation: leave every airfield's strip, its approaches and
 * its service apron clear.
 *
 * Takes the whole list rather than one base (Plan 12 Task 7) because the
 * caller is `treeSites`, which asks about a point and not about a base: with
 * one hardcoded airfield the jungle grew straight down the middle of Dulag's
 * strip. The 65 m half-width and the 220 m of approach past each threshold
 * are the pre-Plan-12 numbers, kept exactly (`scenery.test.ts` pins the
 * agreement against the old formula at Tacloban); the second box is now
 * `airfield.clearing`, read from content, and is `null` for a bare strip.
 */
export function inAirfieldClearing(airfields: readonly Airfield[], x: number, z: number): boolean {
  for (const a of airfields) {
    const l = worldToLocal(a, x, z)
    if (Math.abs(l.x) < 65 && Math.abs(l.z) < a.runway.lengthM / 2 + 220) return true
    if (a.clearing !== null && insideRect(a, a.clearing, x, z)) return true
  }
  return false
}

/** Terrain-draped apron or taxiway, with enough samples to avoid cutting hills. */
function groundPatch(field: TerrainField, x: number, z: number, width: number, length: number): BufferGeometry {
  const nx = Math.ceil(width / 8), nz = Math.ceil(length / 8)
  const positions: number[] = [], indices: number[] = []
  for (let r = 0; r <= nz; r++) for (let c = 0; c <= nx; c++) {
    const px = x - width / 2 + c * width / nx, pz = z - length / 2 + r * length / nz
    positions.push(px, heightAt(field, px, pz) + 0.045, pz)
  }
  for (let r = 0; r < nz; r++) for (let c = 0; c < nx; c++) {
    const a = r * (nx + 1) + c, b = a + nx + 1
    indices.push(a, b, a + 1, a + 1, b, b + 1)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  g.setIndex(indices)
  g.computeVertexNormals()
  return g
}

function weathered(base: number, worn: number): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ roughness: 0.93, side: DoubleSide })
  m.colorNode = mix(color(base), color(worn), groundNoise(varying(positionLocal.xz), 30).g)
  return m
}

/**
 * Static batches: one draw per material, including roof ribs and window frames.
 * These are visual objects; building collision belongs to the entity phase.
 *
 * Every position is authored in the RUNWAY-LOCAL frame (`x` across the strip,
 * `z` along it) and mapped through `at`, so where a thing SITS follows the
 * record's heading. What a thing is ORIENTED to does not: `groundPatch` lays
 * an axis-aligned rectangle and the buildings are axis-aligned boxes, so at a
 * heading other than 0 the apron would be in the right place and square to
 * the world rather than to its own strip. Every base that ships is at heading
 * 0 (`content/bases/`), where that distinction is exactly nothing; a rotated
 * base with scenery on it is Plan 13d's problem along with the building table
 * itself. Stated here rather than left silently true.
 */
/** One material/geometry collector, the same shape the top-level `batches`
 *  map used to be before Task 8 needed a SEPARATE one per strike-target
 *  building (see `createAirfield`'s doc comment on why buildings can no
 *  longer share the airfield-wide batch). */
function makeCollector(): {
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

export function createAirfield(field: TerrainField, airfield: Airfield): AirfieldHandle {
  const root = new Group()
  root.name = `${airfield.name} airfield scenery`
  const steel = weathered(0x59645a, 0x919286)
  const timber = weathered(0x61513c, 0x8d7957)
  const concrete = weathered(0x8d8978, 0xb3ac92)
  const coral = weathered(0x8e8464, 0xbdb392)
  const dark = weathered(0x172624, 0x263e3b)
  const canvas = weathered(0x696d4b, 0x98916a)
  const white = weathered(0xd5c9a0, 0xefe4c9)
  // Decorative content (the apron, huts, taxiways, stores, windsock) still
  // shares ONE airfield-wide batch, merged into as few draw calls as before.
  const shared = makeCollector()
  const at = (lx: number, lz: number): { x: number; z: number } => localToWorld(airfield, lx, lz)
  if (airfield.apron !== null) {
    const p = at(airfield.apron.x, airfield.apron.z)
    shared.add(groundPatch(field, p.x, p.z, airfield.apron.widthM, airfield.apron.lengthM), coral)
  }
  // Buildings (content, strike targets, Plan 6b) and huts (decorative,
  // `AIRFIELD_HUTS`) draw at every base -- unlike the taxiways/stores/windsock
  // below, which stay Tacloban's until 13d gives Dulag its own set.
  //
  // Takes a COLLECTOR now (Task 8), not the airfield-wide `shared` one
  // implicitly: a content `buildings` entry is a strike target
  // (`World.structures`), and `sync` has to hide exactly the one building
  // that was hit without touching its neighbours -- impossible once
  // `batched()` has merged every building of the same material into one
  // mesh. Huts, never a strike target, still go through `shared` below. It
  // returns the building's ground height so the caller can place the
  // collapsed rubble and smoke column at the same spot.
  const drawBuilding = (
    collector: ReturnType<typeof makeCollector>,
    b: { kind: 'hangar' | 'tower' | 'hut'; x: number; z: number; width: number; length: number },
  ): number => {
    const { add, box } = collector
    const { x, z } = at(b.x, b.z)
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

  // Every content building gets its OWN group -- `intact` (this building's
  // own merge, via `batched`, of exactly the geometry `drawBuilding` just
  // built for it), `collapsed` (a low broken box, hidden until destroyed,
  // sharing this file's own `concrete` weathered material rather than a new
  // one), and `smoke` (`ordnance.ts`'s `createSmokeColumn`, reused rather
  // than reimplemented). `structures` is the lookup `sync` uses.
  const structures = new Map<string, {
    readonly intact: Object3D
    readonly collapsed: Object3D
    readonly smoke: ReturnType<typeof createSmokeColumn>
  }>()
  for (const b of airfield.buildings) {
    const collector = makeCollector()
    const y = drawBuilding(collector, { kind: b.kind, x: b.x, z: b.z, width: b.widthM, length: b.lengthM })
    const { x, z } = at(b.x, b.z)
    const intact = batched(new Group(), collector.batches)
    intact.name = 'intact'

    const collapsed = new Group()
    collapsed.name = 'collapsed'
    collapsed.visible = false
    // A low slab across the whole footprint, plus one smaller tilted chunk --
    // "a low, broken box", not a claim to model real debris distribution.
    const slab = new Mesh(new BoxGeometry(b.widthM + 1, 1.3, b.lengthM + 1), concrete)
    slab.position.set(x, y + 0.65, z)
    slab.receiveShadow = true // Plan 16b, see hellcat.ts -- `batched` misses these, unlike `intact`.
    collapsed.add(slab)
    const chunk = new Mesh(new BoxGeometry(b.widthM * 0.4, 2.6, b.lengthM * 0.35), concrete)
    chunk.position.set(x + b.widthM * 0.18, y + 1.3, z - b.lengthM * 0.22)
    chunk.rotation.y = 0.35
    chunk.receiveShadow = true
    collapsed.add(chunk)

    const smoke = createSmokeColumn()
    smoke.object.name = 'smoke'
    smoke.object.position.set(x, y + 2.5, z)
    smoke.object.scale.setScalar(4)

    const group = new Group()
    group.name = `structure:${b.id}`
    group.add(intact, collapsed, smoke.object)
    root.add(group)
    structures.set(b.id, { intact, collapsed, smoke })
  }
  for (const h of AIRFIELD_HUTS) drawBuilding(shared, { kind: 'hut', x: h.x, z: h.z, width: h.width, length: h.length })

  const finish = (): AirfieldHandle => {
    const object = batched(root, shared.batches)
    // A blanket pass, not per-piece: `batched()` already sets this on its own
    // merged meshes (buildings' `intact` included), but the hand-built
    // `collapsed` rubble and the smoke puffs need it too, and re-setting an
    // already-true flag is harmless (Plan 16b, see hellcat.ts).
    object.traverse((o) => { o.receiveShadow = true })
    return {
      object,
      sync(structureDamage: Readonly<Record<string, StructureDamage>>): void {
        for (const [id, s] of structures) {
          const destroyed = (structureDamage[id]?.destroyedTick ?? null) !== null
          if (destroyed === s.collapsed.visible) continue // already in the right state
          s.intact.visible = !destroyed
          s.collapsed.visible = destroyed
          if (destroyed) s.smoke.start(COLLAPSE_SMOKE_LIFETIME_S)
          else s.smoke.object.visible = false // Restart is a hard reset, not a fade-out
        }
      },
      update(dtSeconds: number): void {
        for (const s of structures.values()) s.smoke.update(dtSeconds)
      },
    }
  }

  // The taxiways and the apron clutter below are Tacloban's, for the reason
  // `AIRFIELD_HUTS` gives; 13d parameterizes them.
  if (airfield.id !== 'tacloban') {
    return finish()
  }
  for (const dz of [-190, 60]) { const p = at(-46, dz); shared.add(groundPatch(field, p.x, p.z, 70, 18), coral) }

  // Canvas stores, fuel drums and supply crates make the apron readable at taxi height.
  for (let i = 0; i < 4; i++) {
    const { x, z } = at(-211, 90 + i * 23)
    const y = heightAt(field, x, z)
    shared.box(x, y, z, 8, 2.6, 12, canvas)
    const roof = new CylinderGeometry(5.3, 5.3, 12.6, 3).rotateX(Math.PI / 2).translate(x, y + 1.8, z)
    shared.add(roof, canvas)
  }
  for (let i = 0; i < 18; i++) {
    const { x, z } = at(-78 - (i % 6) * 1.3, 130 + Math.floor(i / 6) * 1.3)
    shared.add(new CylinderGeometry(0.36, 0.36, 0.95, 8).translate(x, heightAt(field, x, z) + 0.475, z), steel)
  }
  for (let i = 0; i < 7; i++) {
    const { x, z } = at(-185 + i % 3 * 2, 155 + Math.floor(i / 3) * 2)
    shared.box(x, heightAt(field, x, z), z, 1.4, 1.1, 1.3, timber)
  }
  // Windsock: a modest orange/cream cone beside the tower.
  const { x: wx, z: wz } = at(-55, -98)
  const wy = heightAt(field, wx, wz)
  shared.box(wx, wy, wz, 0.12, 6, 0.12, white)
  const sock = new CylinderGeometry(0.4, 0.15, 2.4, 10, 1, true).rotateZ(Math.PI / 2).translate(wx + 1.1, wy + 6, wz)
  shared.add(sock, weathered(0xb66335, 0xd98c57))
  return finish()
}

/** One merged mesh per material, and the source geometries released. Extracted
 *  so the early return for a base with no building set (above) cannot skip it
 *  and hand back a `Group` with nothing in it but an unmerged batch map. */
function batched(root: Group, batches: Map<Material, BufferGeometry[]>): Group {
  for (const [material, geometries] of batches) {
    const geometry = mergeGeometries(geometries)
    if (!geometry) throw new Error('airfield: incompatible scenery geometry')
    const mesh = new Mesh(geometry, material)
    mesh.receiveShadow = true // Plan 16b, see hellcat.ts
    root.add(mesh)
    for (const g of geometries) g.dispose()
  }
  return root
}
