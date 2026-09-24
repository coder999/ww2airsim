import { BoxGeometry, BufferAttribute, BufferGeometry, CylinderGeometry, Group, Mesh, type Object3D } from 'three'
import { heightAt, type TerrainField } from '../../sim/world/terrain.js'
import { insideRect, localToWorld, worldToLocal, type Airfield } from '../../sim/world/airfields.js'
import type { StructureDamage } from '../../sim/weapons/structures.js'
import { createSmokeColumn } from '../ordnance.js'
import { batched, createBuildingMaterials, drawBuilding, makeCollector, weathered } from './buildings.js'

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
export function createAirfield(field: TerrainField, airfield: Airfield): AirfieldHandle {
  const root = new Group()
  root.name = `${airfield.name} airfield scenery`
  // `drawBuilding` (buildings.ts, extracted Plan 13d Task 3) needs exactly
  // these five; the apron/taxiway/windsock clutter below needs two more that
  // stay local to this file.
  const materials = createBuildingMaterials()
  const { steel, timber, concrete, white } = materials
  const coral = weathered(0x8e8464, 0xbdb392)
  const canvas = weathered(0x696d4b, 0x98916a)
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
  // collapsed rubble and smoke column at the same spot. `drawBuilding`
  // itself moved to `buildings.ts` (Plan 13d Task 3, so `towns.ts` can call
  // it too); `at()` now runs here, before the call, rather than inside it.

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
    const { x, z } = at(b.x, b.z)
    const y = drawBuilding(collector, { kind: b.kind, x, z, width: b.widthM, length: b.lengthM }, field, materials)
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
  for (const h of AIRFIELD_HUTS) {
    const { x, z } = at(h.x, h.z)
    drawBuilding(shared, { kind: 'hut', x, z, width: h.width, length: h.length }, field, materials)
  }

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
  shared.add(sock, weathered(0xb66335, 0xd98c57))
  return finish()
}
