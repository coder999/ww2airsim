import { BoxGeometry, BufferAttribute, BufferGeometry, Box3, CylinderGeometry, Group, Mesh, type Object3D } from 'three'
import type { Vec3 } from '../../sim/math/vec3.js'
import { heightAt, type TerrainField } from '../../sim/world/terrain.js'
import { insideRect, localToWorld, runwayHeadingRad, worldToLocal, type Airfield } from '../../sim/world/airfields.js'
import type { StructureDamage } from '../../sim/weapons/structures.js'
import { acquireModel } from '../models/modelCache.js'
import { batched, createBuildingMaterials, drawBuilding, drawConstruction, footprintTop, makeCollector, weathered } from './buildings.js'
import { createClutter } from './clutter.js'
import { staticModelUrlFor } from './staticModels.js'
import type { SceneryTextures } from './sceneryTextures.js'

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
   *  the same healthy state re-sets the same visibility rather than
   *  restarting anything. Backward (only reachable via Restart, since
   *  nothing else heals a structure) hides the collapsed geometry
   *  immediately -- Restart is a hard reset, not an animation. The collapse's
   *  dust and smoke are E1's `structure.collapse` recipe, anchored at
   *  `smokeAnchors`. */
  sync(structureDamage: Readonly<Record<string, StructureDamage>>): void
  /** World metres, per content building id: where its collapse smoke rises
   *  from, 2.5 m above the rendered building's ground (E1 Ruling R13). */
  readonly smokeAnchors: ReadonlyMap<string, Vec3>
  /**
   * F8A Task 3: swaps every `model: true` building's procedural placeholder for its glb (the one that shares its kind's
   * id), fitted and rotated to the building's own box. Resolves with the number attached. A load that fails leaves that
   * building's placeholder drawn and is reported through the returned `failed` list rather than thrown: a missing glb
   * must not blank a whole airfield.
   */
  loadModels(load?: LoadBuildingModel): Promise<{ readonly attached: number; readonly failed: readonly string[] }>
  /** Releases every model `loadModels` took from the shared cache and detaches it. Call before disposing `object`'s geometry. */
  dispose(): void
  /** Instanced clutter, by kind (F8A Task 7); all zero for a base with none. */
  readonly clutterCounts: Readonly<Record<string, number>>
}

/** What `loadModels` needs from the model cache; injectable so a Node test never runs GLTFLoader. */
export type LoadBuildingModel = (kind: string) => Promise<{ readonly root: Object3D; release(): void }>
const loadRegisteredBuildingModel: LoadBuildingModel = (kind) => acquireModel(staticModelUrlFor('building', kind))

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
export function createAirfield(field: TerrainField, airfield: Airfield, textures?: SceneryTextures | null): AirfieldHandle {
  const root = new Group()
  root.name = `${airfield.name} airfield scenery`
  // `drawBuilding` (buildings.ts, extracted Plan 13d Task 3) needs exactly
  // these five; the apron/taxiway/windsock clutter below needs two more that
  // stay local to this file.
  const materials = createBuildingMaterials(textures)
  const { steel, timber, concrete, white } = materials
  const coral = weathered(0x8e8464, 0xbdb392, textures, 'concrete')
  const canvas = weathered(0x696d4b, 0x98916a, textures, 'timber')
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
  // below, which draw only where `airfield.apron !== null` (Plan 13d Task 4;
  // see that gate further down). Dulag has no apron -- a hastily-built 1944
  // strip plausibly had none (content/bases/dulag.json's reference.source)
  // -- so it stays silent there too, but on the data, not a hardcoded id.
  //
  // Takes a COLLECTOR now (Task 8), not the airfield-wide `shared` one
  // implicitly: a content `buildings` entry is a strike target
  // (`World.structures`), and `sync` has to hide exactly the one building
  // that was hit without touching its neighbours -- impossible once
  // `batched()` has merged every building of the same material into one
  // mesh. Huts, never a strike target, still go through `shared` below. It
  // returns the building's ground height so the caller can place the
  // collapsed rubble at the same spot. `drawBuilding` itself moved to
  // `buildings.ts` (Plan 13d Task 3, so `towns.ts` can call it too); `at()`
  // now runs here, before the call, rather than inside it.

  // Every content building gets its OWN group -- `intact` (this building's
  // own merge, via `batched`, of exactly the geometry `drawBuilding` just
  // built for it) and `collapsed` (a low broken box, hidden until destroyed,
  // sharing this file's own `concrete` weathered material rather than a new
  // one). `structures` is the lookup `sync` uses. The collapse's dust and
  // smoke are E1's `structure.collapse` recipe, anchored at `smokeAnchors`
  // rather than rendered here.
  const structures = new Map<string, {
    readonly intact: Object3D
    readonly collapsed: Object3D
  }>()
  const anchors = new Map<string, Vec3>()
  // F8A: buildings whose glb replaces the placeholder once `loadModels` runs.
  const modelSlots: { id: string; kind: string; x: number; y: number; z: number; rotY: number; intact: Group; placeholder: Object3D[] }[] = []
  for (const b of airfield.buildings) {
    const collector = makeCollector()
    const { x, z } = at(b.x, b.z)
    const state = b.state ?? 'intact'
    // `destroyed` is rubble only (no hit box exists, `buildStructures`), `construction` is a procedural frame, and the
    // rest are the building itself, procedural until its glb arrives.
    const y = state === 'destroyed' ? footprintTop(field, x, z, b.widthM, b.lengthM)
      : state === 'construction' ? drawConstruction(collector, { x, z, width: b.widthM, length: b.lengthM }, field, materials)
        : drawBuilding(collector, { kind: b.kind, x, z, width: b.widthM, length: b.lengthM }, field, materials)
    const intact = batched(new Group(), collector.batches)
    intact.name = 'intact'
    if (state === 'destroyed') intact.visible = false
    if (state === 'damaged') {
      // A scorch patch: dark, flat, a little larger than the footprint.
      const scorch = new Mesh(new BoxGeometry(b.widthM + 4, 0.06, b.lengthM + 4), materials.dark)
      scorch.position.set(x, y + 0.04, z)
      scorch.receiveShadow = true
      intact.add(scorch)
    }
    if (b.model === true && state !== 'destroyed' && state !== 'construction') {
      modelSlots.push({ id: b.id, kind: b.kind, x, y, z, rotY: -(runwayHeadingRad(airfield) + ((b.headingDeg ?? 0) * Math.PI) / 180), intact, placeholder: [...intact.children] })
    }

    const collapsed = new Group()
    collapsed.name = 'collapsed'
    collapsed.visible = state === 'destroyed'
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

    const group = new Group()
    group.name = `structure:${b.id}`
    group.add(intact, collapsed)
    root.add(group)
    // Rubble that was there from the start is not a strike target and never smokes or heals.
    if (state === 'destroyed') continue
    anchors.set(b.id, { x, y: y + 2.5, z })
    structures.set(b.id, { intact, collapsed })
  }
  // A site's procedural clutter (F8A) replaces the legacy hand-placed huts, canvas stores, drums and crates below.
  const clutter = airfield.clutter === undefined ? null : createClutter(field, airfield)
  if (clutter !== null) root.add(clutter.object)
  if (clutter === null) {
    for (const h of AIRFIELD_HUTS) {
      const { x, z } = at(h.x, h.z)
      drawBuilding(shared, { kind: 'hut', x, z, width: h.width, length: h.length }, field, materials)
    }
  }
  const attached: { holder: Object3D; release(): void }[] = []
  let disposed = false

  const finish = (): AirfieldHandle => {
    const object = batched(root, shared.batches)
    // A blanket pass, not per-piece: `batched()` already sets this on its own
    // merged meshes (buildings' `intact` included), but the hand-built
    // `collapsed` rubble needs it too, and re-setting an already-true flag
    // is harmless (Plan 16b, see hellcat.ts).
    object.traverse((o) => { o.receiveShadow = true })
    return {
      object,
      smokeAnchors: anchors,
      clutterCounts: clutter === null ? {} : clutter.counts,
      async loadModels(load: LoadBuildingModel = loadRegisteredBuildingModel) {
        const failed: string[] = []
        let n = 0
        await Promise.all(modelSlots.map(async (slot) => {
          try {
            const instance = await load(slot.kind)
            // The scenery was rebuilt while this model loaded: give it straight back rather than hold it forever.
            if (disposed) { instance.release(); return }
            // Centered on its own footprint, so a model whose origin is off-center (a pier) still sits on its box.
            const box = new Box3().setFromObject(instance.root)
            instance.root.position.set(-(box.min.x + box.max.x) / 2, 0, -(box.min.z + box.max.z) / 2)
            const holder = new Group()
            holder.name = `model:${slot.id}`
            holder.position.set(slot.x, slot.y, slot.z)
            holder.rotation.y = slot.rotY
            holder.add(instance.root)
            holder.traverse((o) => { o.receiveShadow = true; o.castShadow = true })
            slot.intact.add(holder)
            for (const p of slot.placeholder) p.visible = false
            attached.push({ holder, release: () => instance.release() })
            n++
          } catch {
            failed.push(slot.id)
          }
        }))
        return { attached: n, failed }
      },
      dispose() {
        disposed = true
        for (const a of attached.splice(0)) { a.holder.removeFromParent(); a.release() }
      },
      sync(structureDamage: Readonly<Record<string, StructureDamage>>): void {
        for (const [id, s] of structures) {
          const destroyed = (structureDamage[id]?.destroyedTick ?? null) !== null
          if (destroyed === s.collapsed.visible) continue // already in the right state
          s.intact.visible = !destroyed
          s.collapsed.visible = destroyed
        }
      },
    }
  }

  // The taxiways and the apron clutter below belong to a base only if it HAS
  // an apron (Plan 13d Task 4 -- was `airfield.id !== 'tacloban'`, a
  // hardcoded exclusion of the one other base that existed; generalized here
  // because Dulag is now the second base actually proving it, per its own
  // `apron: null` and the reasoning in `content/bases/dulag.json`'s
  // `reference.source`). Every base that ships today is still either
  // Tacloban (apron non-null) or Dulag (apron null), so this changes no
  // shipped behavior -- it only stops relying on the id.
  if (airfield.apron === null) {
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
  shared.add(sock, weathered(0xb66335, 0xd98c57, textures, 'timber'))
  return finish()
}

/**
 * Ground rectangles trees must stay off (F8A): each building of a site-derived field and each of its clutter areas, as the
 * world-space axis-aligned box around the rotated rectangle, plus a margin. Empty for a base from `content/bases`, which
 * keeps the exclusions it always had (`inAirfieldClearing`).
 */
export function siteExclusions(airfield: Airfield, marginM = 8): readonly { readonly x: number; readonly z: number; readonly width: number; readonly length: number }[] {
  if (airfield.clutter === undefined && !airfield.buildings.some((b) => b.model === true)) return []
  const box = (lx: number, lz: number, w: number, l: number, headingDeg = 0): { x: number; z: number; width: number; length: number } => {
    const c = localToWorld(airfield, lx, lz)
    const r = runwayHeadingRad(airfield) + (headingDeg * Math.PI) / 180
    const cos = Math.abs(Math.cos(r)), sin = Math.abs(Math.sin(r))
    return { x: c.x, z: c.z, width: w * cos + l * sin + 2 * marginM, length: w * sin + l * cos + 2 * marginM }
  }
  return [
    ...airfield.buildings.filter((b) => b.model === true).map((b) => box(b.x, b.z, b.widthM, b.lengthM, b.headingDeg)),
    ...(airfield.clutter?.areas ?? []).map((a) => box(a.x, a.z, a.widthM, a.lengthM)),
  ]
}
