import { describe, expect, it } from 'vitest'
import { egressModel } from '../../../src/render/debrief.js'
import { withMissionDebrief } from '../../../src/render/mission/debriefMission.js'
import { missionOutcome, recoveryOf } from '../../../src/sim/mission/outcome.js'
import { parseScenario } from '../../../src/sim/scenario.js'
import { v3 } from '../../../src/sim/math/vec3.js'
import { zeroKillsByType } from '../../../src/sim/weapons/targetType.js'
import { loadAirfield } from '../../../tools/content/load.js'
import { destroyAircraft, destroyShip, destroyStructure, flatField, landOnce, missionWorld, putPlayer, scenario, steps } from './fixture.js'

/**
 * F10-0, Mark 2026-10-17 (Decision 9): a mission that ends at an egress gate (J2, J4, J5). Crossing it alive with every primary complete is the
 * recovery and earns the badge; a landing at a friendly base is not a success there.
 */
const GATE = { point: { x: 30000, z: 0 }, radiusM: 3000 }
const kill = { id: 'kill', label: 'Kill', priority: 'primary', kind: 'destroy', targets: ['convoy'] }
const hangar = { id: 'kill', label: 'Kill', priority: 'primary', kind: 'destroy', targets: ['dulag-hangar-1'] }
const egress = (gate: Record<string, unknown> = {}) => ({ id: 'gate', label: 'Egress', priority: 'primary', kind: 'reach', ...GATE, ...gate })
const BADGE = { id: 'night-egress', name: 'Night Egress' }
const world = (gate: Record<string, unknown> = {}, extra: Record<string, unknown> = {}, terrain = null as ReturnType<typeof flatField> | null) =>
  missionWorld({ objectives: [kill, egress(gate)], recovery: { kind: 'egress', objective: 'gate' }, badge: BADGE, ...extra }, terrain)
const atGate = (w: ReturnType<typeof world>) => steps(putPlayer(w, v3(30000, 3000, 0), 100, 0), 2)
const killed = (w: ReturnType<typeof world>) => destroyShip(destroyShip(w, 'maru-1'), 'maru-2')

describe('recovery: egress', () => {
  it('crossing the gate alive with every primary complete is the recovery, and earns the badge', () => {
    const w = atGate(killed(world({ after: 'kill' })))
    expect(recoveryOf(w)).toEqual({ kind: 'egressed' })
    expect(missionOutcome(w.mission!, recoveryOf(w)!)).toMatchObject({ result: 'success', badge: BADGE, reasons: [] })
  })
  it('a gate with an unmet primary is no badge, naming the objective', () => {
    const w = atGate(world())
    expect(recoveryOf(w)).toEqual({ kind: 'egressed' })
    expect(missionOutcome(w.mission!, recoveryOf(w)!)).toMatchObject({ result: 'no-badge', badge: null, reasons: ['Kill: incomplete'] })
  })
  it('an egress gated by `after` does not complete early, so crossing first changes nothing', () => {
    const w = atGate(world({ after: 'kill' }))
    expect(recoveryOf(w)).toBeNull()
  })
  it('a landing at a friendly base is not a success in an egress mission', () => {
    const tac = loadAirfield('tacloban').runway.center
    // A flat field is all land, so no ships: the kill is a structure.
    const w = landOnce(destroyStructure(world({ after: 'kill' }, { ships: [], objectives: [hangar, egress({ after: 'kill' })] }, flatField(100)), 'dulag-hangar-1'), tac.x, 100, tac.z)
    expect(recoveryOf(w)).toMatchObject({ kind: 'landed' })
    const out = missionOutcome(w.mission!, recoveryOf(w)!)
    expect(out).toMatchObject({ result: 'no-badge', badge: null })
    expect(out.reasons).toContain('Landed: this mission ends at its egress gate')
  })
  it('death still reads as killed', () => {
    const w = steps(destroyAircraft(killed(world({ after: 'kill' })), 'f6f-1'), 2)
    expect(recoveryOf(w)).toEqual({ kind: 'killed' })
    expect(missionOutcome(w.mission!, recoveryOf(w)!).reasons).toContain('Killed')
  })
  it('every mission that ends on a landing is unchanged: the same landing is still a success', () => {
    const tac = loadAirfield('tacloban').runway.center
    const w = landOnce(destroyStructure(missionWorld({ ships: [], objectives: [hangar, { id: 'home', label: 'Home', priority: 'primary', kind: 'land', at: 'tacloban', suggestedRecovery: true }], badge: BADGE }, flatField(100)), 'dulag-hangar-1'), tac.x, 100, tac.z)
    expect(missionOutcome(w.mission!, recoveryOf(w)!)).toMatchObject({ result: 'success', badge: BADGE })
  })
  it('the debrief model banks as a landing and offers no Continue, and the mission verdict agrees', () => {
    const w = atGate(killed(world({ after: 'kill' })))
    const model = egressModel(zeroKillsByType())
    expect(model).toMatchObject({ outcome: 'landed', headline: 'CLEARED THE AREA' })
    expect(model.continueLabel).toBeUndefined()
    const folded = withMissionDebrief(model, w)
    expect(folded.success).toBe(true)
    expect(folded.badgeId).toBe(BADGE.id)
  })
  it('the scenario must name a reach objective, and only a mission may have one', () => {
    expect(() => parseScenario(scenario({ objectives: [kill, egress()], recovery: { kind: 'egress', objective: 'kill' } }))).toThrow(/must name a reach objective/)
    expect(() => parseScenario(scenario({ objectives: [kill, egress()], recovery: { kind: 'egress', objective: 'ghost' } }))).toThrow(/must name a reach objective/)
    expect(() => parseScenario({ ...scenario({}), recovery: { kind: 'egress', objective: 'gate' } })).toThrow(/needs objectives/)
    expect(() => parseScenario(scenario({ objectives: [kill, egress()], recovery: { kind: 'egress', objective: 'gate' } }))).not.toThrow()
  })
})
