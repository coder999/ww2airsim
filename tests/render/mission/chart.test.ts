import { describe, expect, it } from 'vitest'
import { v3 } from '../../../src/sim/math/vec3.js'
import { isDestroyed } from '../../../src/sim/mission/step.js'
import type { MissionState, ObjectiveState, ResolvedObjective } from '../../../src/sim/mission/state.js'
import { objectiveMarks, objectiveRows } from '../../../src/render/mission/chart.js'
import {
  destroyAircraft, destroyShip, destroyStructure, missionWorld, moveAircraft, steps,
} from '../../sim/mission/fixture.js'

const CV = { x: -25629, z: -16479 }

/** Builds a `MissionState` from (objective, progress) pairs -- `hud.test.ts`'s
 *  own pattern -- so `objectiveRows` can be pinned without a real world. */
function missionOf(pairs: readonly [Partial<ResolvedObjective> & { id: string; priority: 'primary' | 'secondary'; kind: ResolvedObjective['kind']; label: string }, Partial<ObjectiveState>][]): MissionState<undefined> {
  const objectives = pairs.map(([o]) => ({ resolved: [], ...o }) as unknown as ResolvedObjective)
  const progress: ObjectiveState[] = pairs.map(([, p]) => ({ status: 'inactive', count: 0, heldTicks: 0, ...p }))
  return {
    scenarioId: 'dev-chart-fixture',
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

describe('objectiveRows', () => {
  it('is empty without a mission', () => {
    expect(objectiveRows(null)).toEqual([])
  })

  it('maps every objective status to its chart label, in file order', () => {
    const m = missionOf([
      [{ id: 'a', label: 'Alpha', priority: 'primary', kind: 'reach' }, { status: 'inactive' }],
      [{ id: 'b', label: 'Bravo', priority: 'secondary', kind: 'reach' }, { status: 'active' }],
      [{ id: 'c', label: 'Charlie', priority: 'primary', kind: 'reach' }, { status: 'complete' }],
      [{ id: 'd', label: 'Delta', priority: 'secondary', kind: 'reach' }, { status: 'failed' }],
    ])
    expect(objectiveRows(m)).toEqual([
      { label: 'Alpha', priority: 'primary', status: 'PENDING' },
      { label: 'Bravo', priority: 'secondary', status: 'ACTIVE' },
      { label: 'Charlie', priority: 'primary', status: 'COMPLETE' },
      { label: 'Delta', priority: 'secondary', status: 'FAILED' },
    ])
  })
})

describe('objectiveMarks', () => {
  it('is empty without a mission', () => {
    const w = missionWorld({})
    expect(w.mission).toBeNull()
    expect(objectiveMarks(w)).toEqual({ targets: new Map(), stations: [], structures: [] })
  })

  it('an active destroy marks its present, undestroyed resolved ids "destroy"', () => {
    const DESTROY = { id: 'raid-obj', label: 'Raid', priority: 'secondary', kind: 'destroy', targets: ['raid'] }
    const w = missionWorld({ objectives: [DESTROY] })
    expect(objectiveMarks(w).targets).toEqual(new Map([['bandit-1', 'destroy']]))
  })

  it('an active protect marks its targets "protect"', () => {
    const PROTECT = { id: 'convoy-obj', label: 'Convoy', priority: 'primary', kind: 'protect', targets: ['convoy'] }
    const w = missionWorld({ objectives: [PROTECT] })
    expect(objectiveMarks(w).targets).toEqual(new Map([['maru-1', 'protect'], ['maru-2', 'protect']]))
  })

  it('an active deny marks its hostiles "destroy"', () => {
    const DENY = { id: 'screen', label: 'Screen', priority: 'primary', kind: 'deny', hostiles: ['raid'], around: 'cv-1', radiusM: 5000 }
    const w = missionWorld({ objectives: [DENY] })
    expect(objectiveMarks(w).targets).toEqual(new Map([['bandit-1', 'destroy']]))
  })

  it('an active reach gives a station point: id, label, radiusM and targetable', () => {
    const REACH = { id: 'point', label: 'Rally Point', priority: 'primary', kind: 'reach', point: { x: 1000, z: -2000 }, radiusM: 3000 }
    const w = missionWorld({ objectives: [REACH] })
    expect(objectiveMarks(w).stations).toEqual([
      { id: 'station:point', kind: 'station', label: 'Rally Point', x: 1000, z: -2000, targetable: true, objective: 'station', radiusM: 3000 },
    ])
  })

  it('an active hold gives a station point the same way', () => {
    const HOLD = { id: 'orbit', label: 'CAP Station', priority: 'primary', kind: 'hold', point: { x: 500, z: 500 }, radiusM: 4000, seconds: 60 }
    const w = missionWorld({ objectives: [HOLD] })
    expect(objectiveMarks(w).stations).toEqual([
      { id: 'station:orbit', kind: 'station', label: 'CAP Station', x: 500, z: 500, targetable: true, objective: 'station', radiusM: 4000 },
    ])
  })

  it('a deny with a point around gives a station ring, not targetable', () => {
    const DENY = { id: 'screen', label: 'Screen', priority: 'primary', kind: 'deny', hostiles: ['raid'], around: { x: 9000, z: -1000 }, radiusM: 6000 }
    const w = missionWorld({ objectives: [DENY] })
    expect(objectiveMarks(w).stations).toEqual([
      { id: 'station:screen', kind: 'station', label: 'Screen', x: 9000, z: -1000, targetable: false, objective: 'station', radiusM: 6000 },
    ])
  })

  it('a deny with an entity around gives a station ring at that entity\'s position (PF10)', () => {
    const DENY = { id: 'screen', label: 'Screen', priority: 'primary', kind: 'deny', hostiles: ['raid'], around: 'cv-1', radiusM: 5000 }
    const w = missionWorld({ objectives: [DENY] })
    const cv = w.ships.find((s) => s.id === 'cv-1')!
    expect(objectiveMarks(w).stations).toEqual([
      {
        id: 'station:screen', kind: 'station', label: 'Screen',
        x: cv.state.position.x, z: cv.state.position.z, targetable: false, objective: 'station', radiusM: 5000,
      },
    ])
  })

  it('a structure target gives a structure point at its position, targetable', () => {
    const DESTROY = { id: 'strike', label: 'Strike', priority: 'primary', kind: 'destroy', targets: ['tacloban-tower'] }
    const w = missionWorld({ objectives: [DESTROY] })
    const structure = w.structures.find((s) => s.id === 'tacloban-tower')!
    expect(objectiveMarks(w).structures).toEqual([
      {
        id: 'structure:tacloban-tower', kind: 'structure', label: 'tacloban-tower',
        x: structure.position.x, z: structure.position.z, targetable: true, objective: 'destroy',
      },
    ])
    expect(objectiveMarks(w).targets).toEqual(new Map())
  })

  it('complete, failed and inactive objectives mark nothing', () => {
    const DESTROY = { id: 'raid-obj', label: 'Raid', priority: 'secondary', kind: 'destroy', targets: ['raid'] }
    let w = missionWorld({ objectives: [DESTROY] })
    w = steps(destroyAircraft(w, 'bandit-1'), 1)
    expect(w.mission!.progress[0]!.status).toBe('complete')
    expect(objectiveMarks(w)).toEqual({ targets: new Map(), stations: [], structures: [] })

    const PROTECT = { id: 'convoy-obj', label: 'Convoy', priority: 'primary', kind: 'protect', targets: ['convoy'], maxLost: 0 }
    let failed = missionWorld({ objectives: [PROTECT] })
    failed = steps(destroyShip(failed, 'maru-1'), 1)
    expect(failed.mission!.progress[0]!.status).toBe('failed')
    expect(objectiveMarks(failed)).toEqual({ targets: new Map(), stations: [], structures: [] })

    const GATED = { id: 'gated', label: 'Gated', priority: 'secondary', kind: 'destroy', targets: ['raid'], after: 'never' }
    const NEVER = { id: 'never', label: 'Never', priority: 'primary', kind: 'reach', point: { x: 90000, z: 90000 }, radiusM: 100 }
    const inactive = missionWorld({ objectives: [NEVER, GATED] })
    expect(inactive.mission!.progress[1]!.status).toBe('inactive')
    expect(objectiveMarks(inactive).targets).toEqual(new Map())
  })

  it('an unspawned held target marks nothing, because it is not in the world', () => {
    const DESTROY = { id: 'kill', label: 'Kill', priority: 'primary', kind: 'destroy', targets: ['raid-2'] }
    const w = steps(missionWorld({
      objectives: [DESTROY],
      triggers: [{ id: 'launch', when: { at: 100000 }, then: [{ spawn: 'wave-1' }] }],
      heldGroups: [{ id: 'wave-1', aircraft: [{ id: 'raid-2', spec: 'f6f-hellcat', tags: ['raid'], airborneAt: { position: [-20000, 3000, -16479], headingDeg: 90, speedMps: 130 } }] }],
    }), 30)
    expect(objectiveMarks(w).targets).toEqual(new Map())
  })

  it('agrees with the engine on destroyed status: a destroyed target stops being marked', () => {
    const DESTROY = { id: 'raid-obj', label: 'Raid', priority: 'secondary', kind: 'destroy', targets: ['raid'], count: 1 }
    let w = missionWorld({ objectives: [DESTROY] })
    expect(isDestroyed({ combat: w.combat, aircraft: w.aircraft }, 'bandit-1')).toBe(false)
    expect(objectiveMarks(w).targets.get('bandit-1')).toBe('destroy')

    w = steps(destroyAircraft(w, 'bandit-1'), 1)
    expect(isDestroyed({ combat: w.combat, aircraft: w.aircraft }, 'bandit-1')).toBe(true)
    expect(objectiveMarks(w).targets.has('bandit-1')).toBe(false)
  })

  it('a destroyed structure stops being marked, same as an aircraft or ship', () => {
    const DESTROY = { id: 'strike', label: 'Strike', priority: 'primary', kind: 'destroy', targets: ['tacloban-tower'] }
    let w = missionWorld({ objectives: [DESTROY] })
    expect(objectiveMarks(w).structures).toHaveLength(1)
    w = steps(destroyStructure(w, 'tacloban-tower'), 1)
    expect(objectiveMarks(w).structures).toHaveLength(0)
  })
})

// A live hostile off in the distance is still "active"; moving it just
// exercises the fixture the same way tests/sim/mission/objectives.test.ts
// does, to be sure `objectiveMarks` reads the LIVE combat state each call.
describe('objectiveMarks reads live state', () => {
  it('a hostile marked, then moved, is still marked the same way', () => {
    const DENY = { id: 'screen', label: 'Screen', priority: 'primary', kind: 'deny', hostiles: ['raid'], around: 'cv-1', radiusM: 5000 }
    let w = missionWorld({ objectives: [DENY] })
    w = steps(moveAircraft(w, 'bandit-1', v3(CV.x + 4000, 9000, CV.z)), 1)
    expect(w.mission!.progress[0]!.status).toBe('failed')
    expect(objectiveMarks(w).targets).toEqual(new Map())
  })
})
