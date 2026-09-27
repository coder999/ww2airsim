import { describe, expect, it } from 'vitest'
import { bankSortie, createPilot, type PilotRecord, type SortieFacts } from '../../src/render/roster.js'
import { zeroKillsByType } from '../../src/sim/weapons/targetType.js'
import { EMPTY_SEGMENT } from '../../src/render/flightRecord.js'

// A pilot with a banked history, so an accidental write shows in every field.
const pilot: PilotRecord = { ...createPilot('Dev Test'), cumulativeScore: 120, sorties: 3 }
const roster: readonly PilotRecord[] = [pilot]
const sortie = (outcome: SortieFacts['outcome']): SortieFacts => ({
  at: '2026-09-27T12:00:00.000Z', scenarioId: 'free-flight', aircraft: 'Grumman F6F-5 Hellcat', loadout: 'both', outcome,
  segment: EMPTY_SEGMENT,
})
const kills = { ...zeroKillsByType(), fighter: 1 }
const bank = (devSortie: boolean, outcome: 'landed' | 'ditched' | 'killed', friendlyFire: 'discharged' | 'forfeit' | null) =>
  bankSortie(roster, pilot.id, {
    devSortie, scoreTotal: 50, outcome, killsSinceLastBank: kills,
    sortie: sortie(outcome === 'landed' ? 'field' : outcome), friendlyFire, badgeId: 'airfield-strike',
  })

describe('a Dev sortie leaves the roster byte-identical on every debrief path (A5)', () => {
  const paths = [
    ['landed', 'landed', null], ['ditched', 'ditched', null], ['killed', 'killed', null],
    ['discharged', 'landed', 'discharged'], ['forfeit', 'killed', 'forfeit'],
  ] as const
  it.each(paths)('%s', (_name, outcome, ff) => {
    const before = JSON.stringify(roster)
    expect(bank(true, outcome, ff)).toBe(roster)
    expect(JSON.stringify(roster)).toBe(before)
  })
  it('the same landing without Dev banks score, the sortie and the badge', () => {
    const after = bank(false, 'landed', null)
    expect(after).not.toBe(roster)
    expect(after[0]!.cumulativeScore).toBe(170)
    expect(after[0]!.badges).toContain('airfield-strike')
  })
  it('a forfeit never writes a badge; a discharge sets the status', () => {
    expect(bank(false, 'killed', 'forfeit')[0]!.badges).not.toContain('airfield-strike')
    expect(bank(false, 'landed', 'discharged')[0]!.status).toBe('discharged')
  })
})
