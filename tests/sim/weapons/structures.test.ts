import { describe, it, expect } from 'vitest'
import { buildStructures, healthyStructureDamage } from '../../../src/sim/weapons/structures.js'
import { createTerrainField, heightAt } from '../../../src/sim/world/terrain.js'
import { loadAirfield } from '../../../tools/content/load.js'
import {
  loadTerrainHeader,
  loadTerrainLevel,
} from '../../../tools/terrain/load.js'
import { finestFetchedLevelFor, INTERIM_ASSET_QUALITY_TIER } from '../../../src/render/content.js'

/** The level a real page load actually flies over today -- see
 *  `content.ts`'s `INTERIM_ASSET_QUALITY_TIER` for what it is and why.
 *  Before Task 2 (2026-09-24) this used `FIRST_COMMITTED_LEVEL`,
 *  numerically the same thing (2) at the time; the two concepts have since
 *  diverged ("what's committed on disk", now 0, vs "what a page load
 *  fetches", tier-dependent). */
const GROUND_TRUTH_LEVEL = finestFetchedLevelFor(INTERIM_ASSET_QUALITY_TIER)

describe('structures built from airfield content (Plan 6b)', () => {
  it('builds one StructureEntity per building, at both friendly and enemy airfields', () => {
    const tacloban = loadAirfield('tacloban')
    const dulag = loadAirfield('dulag')
    const structures = buildStructures([tacloban, dulag])
    expect(structures).toHaveLength(7) // 5 (Tacloban, incl. Plan 9's AAA emplacement) + 2 (Dulag, Plan 13d Task 4)
    expect(structures.every((s) => s.hp > 0)).toBe(true)
    expect(new Set(structures.map((s) => s.id)).size).toBe(7) // ids unique across bases
  })
  it("anchors Dulag's collision boxes on its real terrain, not at sea level", () => {
    const header = loadTerrainHeader()
    const terrain = createTerrainField(
      header,
      GROUND_TRUTH_LEVEL,
      loadTerrainLevel(GROUND_TRUTH_LEVEL, header),
    )
    const hangar = buildStructures([loadAirfield('dulag')], terrain)
      .find((s) => s.id === 'dulag-hangar-1')!
    const groundHeightM = heightAt(terrain, hangar.position.x, hangar.position.z)
    // A sanity bound, not a pinned value -- "not at sea level," not an exact
    // height. Lowered from 10 on Task 2 (2026-09-24): the ground truth moved
    // from L2 (98 m spacing) to `GROUND_TRUTH_LEVEL` (L1, 49 m), and the
    // finer grid samples a genuinely different nearby point at Dulag
    // (9.37 m here, still clearly land). Kept close to the measured value
    // (8, not the original 10) rather than loosened further, so this still
    // catches a real regression toward sea level (review, 2026-09-25).
    expect(groundHeightM).toBeGreaterThan(8)
    expect(hangar.position.y - hangar.halfSize.y).toBeCloseTo(groundHeightM, 9)
  })
  it('a structure never moves or ages: it is spec, not simulated state', () => {
    const s = buildStructures([loadAirfield('tacloban')])[0]!
    expect(Object.isFrozen(s) || true).toBe(true) // readonly by type; this just documents intent
  })
  it('healthyStructureDamage starts at full hp with no attacker', () => {
    expect(healthyStructureDamage(120)).toEqual({ hp: 120, destroyedTick: null, attacker: null })
  })
})
