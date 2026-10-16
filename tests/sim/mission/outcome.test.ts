import { describe, it, expect } from 'vitest'
import { createMission } from '../../../src/sim/mission/create.js'
import { missionOutcome } from '../../../src/sim/mission/outcome.js'
import type { Objective } from '../../../src/sim/mission/schema.js'
import type { MissionState, ObjectiveState } from '../../../src/sim/mission/state.js'

const OBJECTIVES: Objective[] = [
  { id: 'kill', label: 'Hangars', priority: 'primary', kind: 'destroy', targets: ['h'] },
  { id: 'carrier', label: 'Carrier', priority: 'primary', kind: 'protect', targets: ['cv-1'] },
  { id: 'aaa', label: 'AAA', priority: 'secondary', kind: 'destroy', targets: ['a'] },
]
const BADGE = { id: 'strike', name: 'Airfield Strike' }
const at = { kind: 'airfield', id: 'tacloban', name: 'Tacloban' } as const
const base = { kind: 'airfield', id: 'tacloban', name: 'Tacloban' } as const
const s = (status: ObjectiveState['status']): ObjectiveState => ({ status, count: 0, heldTicks: 0 })

function mission(progress: ObjectiveState[], badge: typeof BADGE | null = BADGE): MissionState<undefined> {
  const m = createMission<undefined>({
    scenarioId: 'unit', playerSide: 'allied', objectives: OBJECTIVES, triggers: [], badge, held: [], respot: null,
    entities: [{ id: 'h', tags: [], side: 'axis' }, { id: 'cv-1', tags: [], side: 'allied' }, { id: 'a', tags: [], side: 'axis' }],
  })
  return { ...m, progress }
}

describe('missionOutcome (spec 2026-09-25 §2.4)', () => {
  it('a landing at a named base with every primary done earns the badge; a live protect counts as held', () => {
    const o = missionOutcome(mission([s('complete'), s('active'), s('active')]), { kind: 'landed', at, base })
    expect(o).toEqual({
      result: 'success', badge: BADGE, reasons: [],
      objectives: [
        { id: 'kill', label: 'Hangars', priority: 'primary', final: 'complete' },
        { id: 'carrier', label: 'Carrier', priority: 'primary', final: 'complete' },
        { id: 'aaa', label: 'AAA', priority: 'secondary', final: 'incomplete' },
      ],
    })
  })

  it('ditching banks nothing toward a badge, and says why', () => {
    const o = missionOutcome(mission([s('complete'), s('active'), s('complete')]), { kind: 'ditched' })
    expect(o.result).toBe('no-badge')
    expect(o.badge).toBeNull()
    expect(o.reasons).toEqual(['Ditched'])
  })

  it('an off-field landing earns no badge', () => {
    expect(missionOutcome(mission([s('complete'), s('active'), s('active')]), { kind: 'landed', at: null, base: null }).reasons).toEqual(['Landed off-field'])
  })

  // F5C D3: only a friendly base is a recovery. An enemy field or a carrier the other side holds names a place and fails.
  it('a landing at a base the player\'s side does not hold earns no badge, and names the field', () => {
    const enemy = { kind: 'airfield', id: 'dulag', name: 'Dulag' } as const
    const o = missionOutcome(mission([s('complete'), s('active'), s('active')]), { kind: 'landed', at: enemy, base: null })
    expect(o.result).toBe('no-badge')
    expect(o.reasons).toEqual(['Landed at Dulag, not a friendly base'])
  })

  it('any friendly base counts, not only the one the mission suggests', () => {
    const bayug = { kind: 'airfield', id: 'bayug', name: 'Bayug' } as const
    const o = missionOutcome(mission([s('complete'), s('active'), s('active')]), { kind: 'landed', at: bayug, base: { kind: 'airfield', id: 'bayug', name: 'Bayug' } })
    expect(o.result).toBe('success')
  })

  it('a failed primary blocks the badge even after a good landing; reasons in fixed order (ruling R16)', () => {
    const o = missionOutcome(mission([s('active'), s('failed'), s('failed')]), { kind: 'landed', at: null, base: null })
    expect(o.reasons).toEqual(['Landed off-field', 'Carrier: failed', 'Hangars: incomplete'])
    expect(o.objectives.map((x) => x.final)).toEqual(['incomplete', 'failed', 'failed'])
  })

  it('death is terminal: killed, no badge', () => {
    expect(missionOutcome(mission([s('complete'), s('active'), s('active')]), { kind: 'killed' }).reasons).toEqual(['Killed'])
  })

  it('an objective still waiting on after is incomplete, even a protect', () => {
    const m = mission([s('complete'), s('inactive'), s('active')])
    expect(missionOutcome(m, { kind: 'landed', at, base }).reasons).toEqual(['Carrier: incomplete'])
  })

  it('a mission with no badge can still succeed', () => {
    const o = missionOutcome(mission([s('complete'), s('active'), s('active')], null), { kind: 'landed', at, base })
    expect(o.result).toBe('success')
    expect(o.badge).toBeNull()
  })

  // F7A: a pilot who bailed out is never a mission success, whatever the objectives say (Mark, 2026-10-15).
  it.each(['rescued', 'captured'] as const)('%s after a bailout earns no badge even with every primary complete', (kind) => {
    const o = missionOutcome(mission([s('complete'), s('active'), s('complete')]), { kind })
    expect(o.result).toBe('no-badge')
    expect(o.badge).toBeNull()
    expect(o.reasons).toEqual(['Bailed out'])
  })
})
