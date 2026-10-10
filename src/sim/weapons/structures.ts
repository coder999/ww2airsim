import { v3, type Vec3 } from '../math/vec3.js'
import { localToWorld, runwayHeadingRad, type Airfield } from '../world/airfields.js'
import { heightAt, type TerrainField } from '../world/terrain.js'
import type { Side } from '../sides.js'

/** A strike target derived from airfield content, never stepped (spec §3.5:
 *  "no motion, no aging"). Built once at world creation from EVERY airfield's
 *  `buildings` -- friendly and enemy both, because only content (`enemyAirfields`
 *  on the scenario) decides what is worth bombing, not this list. */
export type StructureEntity = {
  readonly id: string
  readonly airfield: string
  readonly kind: 'hangar' | 'tower' | 'aaa'
  readonly position: Vec3
  readonly headingRad: number
  readonly halfSize: { readonly x: number; readonly y: number; readonly z: number }
  readonly hp: number
  /** Its airfield's side (friendly-fire spec §2), stamped by `createWorldOf`
   *  through `airfieldSideOf`; absent reads as axis through `sideOf`. */
  readonly side?: Side
}

/** A generous, content-independent height: buildings are never modelled
 *  taller than this, and the box test only needs an upper bound. */
const BUILDING_HEIGHT_M = 10

export function buildStructures(
  airfields: readonly Airfield[],
  terrain: TerrainField | null = null,
): readonly StructureEntity[] {
  const out: StructureEntity[] = []
  for (const a of airfields) {
    const heading = runwayHeadingRad(a)
    for (const b of a.buildings) {
      const world = localToWorld(a, b.x, b.z)
      const groundHeightM = terrain === null ? 0 : heightAt(terrain, world.x, world.z)
      out.push({
        id: b.id,
        airfield: a.id,
        kind: b.kind,
        position: v3(world.x, groundHeightM + BUILDING_HEIGHT_M / 2, world.z),
        headingRad: heading,
        halfSize: { x: b.widthM / 2, y: BUILDING_HEIGHT_M / 2, z: b.lengthM / 2 },
        hp: b.hp,
      })
    }
  }
  return out
}

/**
 * The same structures with their heights read from `terrain`, KEEPING each one's `side`. The browser has no terrain
 * at boot, so `withTerrain` (frame.ts) and `buildWorld` (main.ts) rebuild the list when the field arrives; building
 * it anew dropped the sides `createWorldOf` stamped (friendly-fire spec §2), which read as axis everywhere through
 * `sideOf`. Found 2026-10-10, when M2 made a battery's side decide who it shoots: Tacloban's own AAA fired at the
 * Hellcat taking off from it.
 */
export function rebuildStructures(
  previous: readonly StructureEntity[], airfields: readonly Airfield[], terrain: TerrainField | null,
): readonly StructureEntity[] {
  const sides = new Map(previous.map((s) => [s.id, s.side]))
  return buildStructures(airfields, terrain).map((s) => {
    const side = sides.get(s.id)
    return side === undefined ? s : { ...s, side }
  })
}

export type StructureDamage = {
  readonly hp: number
  readonly destroyedTick: number | null
  readonly attacker: string | null
}
export const healthyStructureDamage = (hp: number): StructureDamage => ({ hp, destroyedTick: null, attacker: null })
