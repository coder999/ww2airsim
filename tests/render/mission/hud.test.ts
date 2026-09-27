import { describe, it, expect } from 'vitest'
import type { MissionState, ObjectiveState, ResolvedObjective } from '../../../src/sim/mission/state.js'
import { NO_RADIO, RADIO_SHOW_MS, missionDiagnostics, nextRadioLine, objectiveLineLabel } from '../../../src/render/mission/hud.js'

/** Builds a `MissionState` from a list of (objective, progress) pairs, so
 *  each test can hand-write just the fields it cares about (brief: "spread
 *  a real MissionState and replace progress"). Fields the label never reads
 *  are filled with harmless placeholders. */
function missionOf(pairs: readonly [Partial<ResolvedObjective> & { id: string; priority: 'primary' | 'secondary'; kind: ResolvedObjective['kind']; label: string }, Partial<ObjectiveState>][]): MissionState<undefined> {
  const objectives = pairs.map(([o]) => ({ resolved: [], ...o }) as unknown as ResolvedObjective)
  const progress: ObjectiveState[] = pairs.map(([, p]) => ({ status: 'inactive', count: 0, heldTicks: 0, ...p }))
  return {
    scenarioId: 'dev-hud-fixture',
    objectives,
    triggers: [],
    badge: null,
    held: [],
    progress,
    fired: [],
    spawned: [],
    recovery: { touchdown: null },
    log: [],
  } as unknown as MissionState<undefined>
}

describe('objectiveLineLabel (M2 R7)', () => {
  it('is null without a mission', () => {
    expect(objectiveLineLabel(null)).toBeNull()
  })

  it('shows the active primary, uppercased', () => {
    const m = missionOf([
      [{ id: 'takeoff', priority: 'primary', kind: 'takeoff', label: 'Take off', from: 'tacloban' }, { status: 'active' }],
    ])
    expect(objectiveLineLabel(m)).toBe('TAKE OFF')
  })

  it('shows destroy progress as count/needed, needed = count ?? targets', () => {
    const m = missionOf([
      [{ id: 'convoy', priority: 'primary', kind: 'destroy', label: 'Convoy', targets: ['a', 'b'], resolved: ['a', 'b'] }, { status: 'active', count: 1 }],
    ])
    expect(objectiveLineLabel(m)).toBe('CONVOY 1/2')
  })

  it('shows land progress only for count > 1', () => {
    const m = missionOf([
      [{ id: 'circuit', priority: 'primary', kind: 'land', label: 'Circuit', at: 'tacloban', count: 2 }, { status: 'active', count: 1 }],
    ])
    expect(objectiveLineLabel(m)).toBe('CIRCUIT 1/2')
  })

  it('shows hold seconds from ticks', () => {
    const m = missionOf([
      [{ id: 'cap', priority: 'primary', kind: 'hold', label: 'CAP station', point: { x: 0, z: 0 }, radiusM: 1000, seconds: 180 }, { status: 'active', heldTicks: 2700 }],
    ])
    expect(objectiveLineLabel(m)).toBe('CAP STATION 45/180 S')
  })

  it('shows at most two, in file order, joined by " · "', () => {
    const m = missionOf([
      [{ id: 'convoy', priority: 'primary', kind: 'destroy', label: 'Convoy', targets: ['a', 'b'], resolved: ['a', 'b'] }, { status: 'active', count: 0 }],
      [{ id: 'cap', priority: 'primary', kind: 'hold', label: 'CAP station', point: { x: 0, z: 0 }, radiusM: 1000, seconds: 180 }, { status: 'active', heldTicks: 0 }],
      [{ id: 'extra', priority: 'primary', kind: 'takeoff', label: 'Extra', from: 'tacloban' }, { status: 'active' }],
    ])
    expect(objectiveLineLabel(m)).toBe('CONVOY 0/2 · CAP STATION 0/180 S')
  })

  it('skips protect and deny', () => {
    const m = missionOf([
      [{ id: 'protect', priority: 'primary', kind: 'protect', label: 'Protect', targets: ['a'] }, { status: 'active' }],
      [{ id: 'recover', priority: 'primary', kind: 'land', label: 'Recover', at: 'tacloban' }, { status: 'active' }],
    ])
    expect(objectiveLineLabel(m)).toBe('RECOVER')
  })

  it('prefixes NO BADGE once a primary has failed', () => {
    const m = missionOf([
      [{ id: 'protect', priority: 'primary', kind: 'protect', label: 'Protect', targets: ['a'] }, { status: 'failed' }],
      [{ id: 'recover', priority: 'primary', kind: 'land', label: 'Recover', at: 'tacloban' }, { status: 'active' }],
    ])
    expect(objectiveLineLabel(m)).toBe('NO BADGE · RECOVER')
  })

  it('reads OBJECTIVES COMPLETE when every primary is complete', () => {
    const m = missionOf([
      [{ id: 'takeoff', priority: 'primary', kind: 'takeoff', label: 'Take off', from: 'tacloban' }, { status: 'complete' }],
      [{ id: 'recover', priority: 'primary', kind: 'land', label: 'Recover', at: 'tacloban' }, { status: 'complete' }],
    ])
    expect(objectiveLineLabel(m)).toBe('OBJECTIVES COMPLETE')
  })

  it('is null when a primary is still inactive and none has failed or is active', () => {
    const m = missionOf([
      [{ id: 'takeoff', priority: 'primary', kind: 'takeoff', label: 'Take off', from: 'tacloban' }, { status: 'complete' }],
      [{ id: 'recover', priority: 'primary', kind: 'land', label: 'Recover', at: 'tacloban', after: 'takeoff' }, { status: 'inactive' }],
    ])
    expect(objectiveLineLabel(m)).toBeNull()
  })

  it('reads NO BADGE · RETURN TO BASE when a primary failed and none is active', () => {
    const m = missionOf([
      [{ id: 'convoy', priority: 'primary', kind: 'destroy', label: 'Convoy', targets: ['a'], resolved: ['a'] }, { status: 'failed' }],
      [{ id: 'recover', priority: 'primary', kind: 'land', label: 'Recover', at: 'tacloban' }, { status: 'complete' }],
    ])
    expect(objectiveLineLabel(m)).toBe('NO BADGE · RETURN TO BASE')
  })

  it('ignores secondaries', () => {
    const m = missionOf([
      [{ id: 'takeoff', priority: 'primary', kind: 'takeoff', label: 'Take off', from: 'tacloban' }, { status: 'active' }],
      [{ id: 'bonus', priority: 'secondary', kind: 'destroy', label: 'Bonus', targets: ['a'], resolved: ['a'] }, { status: 'active', count: 0 }],
    ])
    expect(objectiveLineLabel(m)).toBe('TAKE OFF')
  })
})

describe('nextRadioLine (M2 R8, open question 4)', () => {
  const msgs = [{ text: 'Tower: cleared.' }, { text: 'Trap 1 of 3' }]

  it('shows the oldest unseen message for RADIO_SHOW_MS', () => {
    const r = nextRadioLine(NO_RADIO, msgs, 16)
    expect(r).toEqual({ seen: 1, text: 'Tower: cleared.', remainingMs: RADIO_SHOW_MS })
  })

  it('queues: the next shows only after the first has run out', () => {
    let r = nextRadioLine(NO_RADIO, msgs, 16)
    r = nextRadioLine(r, msgs, RADIO_SHOW_MS - 1)
    expect(r.text).toBe('Tower: cleared.')
    r = nextRadioLine(r, msgs, 1)
    expect(r.text).toBe('Trap 1 of 3')
  })

  it('clears when everything has been shown and run out', () => {
    let r = nextRadioLine(NO_RADIO, msgs, 16)
    r = nextRadioLine(r, msgs, RADIO_SHOW_MS)
    expect(r.text).toBe('Trap 1 of 3')
    r = nextRadioLine(r, msgs, RADIO_SHOW_MS)
    expect(r).toEqual({ seen: 2, text: null, remainingMs: 0 })
  })

  it('does not count down at dtMs 0 (paused)', () => {
    const r = nextRadioLine(NO_RADIO, msgs, 16)
    const paused = nextRadioLine(r, msgs, 0)
    expect(paused).toEqual(r)
  })

  it('a shorter log resets (Restart): the new first message shows', () => {
    const r = nextRadioLine({ seen: 2, text: 'Trap 1 of 3', remainingMs: 100 }, [{ text: 'fresh' }], 16)
    expect(r).toEqual({ seen: 1, text: 'fresh', remainingMs: RADIO_SHOW_MS })
  })
})

describe('missionDiagnostics (M2 Task 8, `__ww2.mission`)', () => {
  const shown = { text: () => ({ objective: 'RECOVER', radio: 'Tower: a friendly is passing overhead.' }) }
  const held = (visible: boolean) => ({ held: { airframes: new Map([['drone-1', { root: { visible } }]]) } })

  it('is null without a mission or before the scenario entities exist', () => {
    expect(missionDiagnostics(null, shown, held(false))).toBeNull()
    expect(missionDiagnostics(missionOf([]), shown, null)).toBeNull()
  })

  it('reports the shown lines, the log, the spawned groups and each held mesh by id', () => {
    const log = [{ tick: 3, kind: 'spawn', group: 'drone' }] as const
    const m = { ...missionOf([]), log, spawned: ['drone'] } as unknown as MissionState<undefined>
    expect(missionDiagnostics(m, shown, held(true))).toEqual({
      objective: 'RECOVER', radio: 'Tower: a friendly is passing overhead.', log, spawned: ['drone'],
      meshes: [{ id: 'drone-1', visible: true }],
    })
  })
})
