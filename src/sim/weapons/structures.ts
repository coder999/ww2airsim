import { v3, type Vec3 } from '../math/vec3.js'
import { localToWorld, runwayHeadingRad, type Airfield } from '../world/airfields.js'
import { heightAt, type TerrainField } from '../world/terrain.js'

/** A strike target derived from airfield content, never stepped (spec §3.5:
 *  "no motion, no aging"). Built once at world creation from EVERY airfield's
 *  `buildings` -- friendly and enemy both, because only content (`enemyAirfields`
 *  on the scenario) decides what is worth bombing, not this list. */
export type StructureEntity = {
  readonly id: string
  readonly airfield: string
  readonly kind: 'hangar' | 'tower'
  readonly position: Vec3
  readonly headingRad: number
  readonly halfSize: { readonly x: number; readonly y: number; readonly z: number }
  readonly hp: number
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

export type StructureDamage = {
  readonly hp: number
  readonly destroyedTick: number | null
  readonly attacker: string | null
}
export const healthyStructureDamage = (hp: number): StructureDamage => ({ hp, destroyedTick: null, attacker: null })
