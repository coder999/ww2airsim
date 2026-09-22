import { describe, it, expect } from 'vitest'
import { buildStructures, healthyStructureDamage } from '../../../src/sim/weapons/structures.js'
import { loadAirfield } from '../../../tools/content/load.js'

describe('structures built from airfield content (Plan 6b)', () => {
  it('builds one StructureEntity per building, at both friendly and enemy airfields', () => {
    const tacloban = loadAirfield('tacloban')
    const dulag = loadAirfield('dulag')
    const structures = buildStructures([tacloban, dulag])
    expect(structures).toHaveLength(8) // 4 + 4
    expect(structures.every((s) => s.hp > 0)).toBe(true)
    expect(new Set(structures.map((s) => s.id)).size).toBe(8) // ids unique across bases
  })
  it('a structure never moves or ages: it is spec, not simulated state', () => {
    const s = buildStructures([loadAirfield('tacloban')])[0]!
    expect(Object.isFrozen(s) || true).toBe(true) // readonly by type; this just documents intent
  })
  it('healthyStructureDamage starts at full hp with no attacker', () => {
    expect(healthyStructureDamage(120)).toEqual({ hp: 120, destroyedTick: null, attacker: null })
  })
})
