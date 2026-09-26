import { describe, expect, it } from 'vitest'
import { dossierModel, formatFeet, formatHours, formatKnots, nextRankProgress } from '../../src/render/dossier.js'
import { RANK_LADDER, applyMissionResult, createPilot } from '../../src/render/roster.js'
import { zeroKillsByType } from '../../src/sim/weapons/targetType.js'

const label = (id: string): string => `Scenario ${id}`

describe('dossier formatting (dossier spec §B.4)', () => {
  it('formats hours as h:mm, feet with separators, knots rounded', () => {
    expect(formatHours(0)).toBe('0:00')
    expect(formatHours(3725)).toBe('1:02')
    expect(formatFeet(3048)).toBe('10,000 ft')
    expect(formatKnots(100)).toBe('194 kt')
  })

  it('reports progress to the next rank, and none at the top', () => {
    expect(nextRankProgress(1_250)).toEqual({ next: RANK_LADDER[1], fraction: 0.5 })
    const top = RANK_LADDER[RANK_LADDER.length - 1]!
    expect(nextRankProgress(top.threshold + 1)).toEqual({ next: null, fraction: 1 })
  })
})

describe('dossierModel', () => {
  it('an unflown pilot: empty-state lines, zeroed record', () => {
    const m = dossierModel(createPilot('Ace'), label)
    expect(m.since).toBe('No missions logged yet')
    expect(m.badges).toEqual([])
    expect(m.badgesEmpty).toBe('No badges yet — awarded for completing mission objectives.')
    expect(m.record).toContainEqual(['Flight hours', '0:00'])
    expect(m.log).toEqual([])
  })

  it('a flown pilot: records-since date, landings split, log newest first', () => {
    let p = createPilot('Ace')
    const seg = { flightSeconds: 3600, maxAltitudeM: 3048, maxTrueAirspeedMps: 100 }
    p = applyMissionResult(p, 100, 'landed', zeroKillsByType(), { at: '2026-09-20T10:00:00.000Z', scenarioId: 'a', aircraft: 'F6F-5 Hellcat', loadout: 'clean', outcome: 'trap', segment: seg })
    p = applyMissionResult(p, 50, 'ditched', { ...zeroKillsByType(), fighter: 2 }, { at: '2026-09-21T10:00:00.000Z', scenarioId: 'b', aircraft: 'F6F-5 Hellcat', loadout: 'both', outcome: 'ditched', segment: seg })
    const m = dossierModel(p, label)
    expect(m.since).toBe('Records kept since 2026-09-20')
    expect(m.record).toContainEqual(['Landings', '1 trap · 0 field · 1 ditched'])
    expect(m.record).toContainEqual(['Highest altitude', '10,000 ft'])
    expect(m.record).toContainEqual(['Fastest speed', '194 kt TAS'])
    expect(m.log.map((r) => r.scenario)).toEqual(['Scenario b', 'Scenario a'])
    expect(m.log[0]!.kills).toBe(2)
    expect(m.kills).toContainEqual(['Fighter', 2])
  })
})
