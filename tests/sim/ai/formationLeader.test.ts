import { describe, expect, it } from 'vitest'
import { aircraftById, type World } from '../../../src/sim/loop.js'
import { createState } from '../../../src/sim/flight/state.js'
import { qFromAxisAngle } from '../../../src/sim/math/quat.js'
import { length, sub, v3 } from '../../../src/sim/math/vec3.js'
import { PURSUIT_FLOOR_M } from '../../../src/sim/ai/safety.js'
import { stationErrorM } from '../../../src/sim/ai/formation.js'
import { chase, runCanned } from './maneuverWorlds.js'
import { PLAYER_EAST, PLAYER_FAR, buildFormation, formationLeader, wingman } from './formationWorlds.js'

/** 7f spec §4: leader lost; parked leader. */
const ROUTE = [
  { x: 20000, z: 0, altitudeM: 3000, speedMps: 120 },
  { x: 20000, z: 20000, altitudeM: 3200, speedMps: 120 },
  { x: 40000, z: 20000, altitudeM: 3000, speedMps: 120 },
]
const LEAD = { id: 'lead-1', spec: 'f6f-hellcat', airborneAt: { position: [0, 3000, 0], headingDeg: 90, speedMps: 120 }, pilot: { skill: 'green', ingress: { route: ROUTE } } }
const WING = wingman('wing-1', 'lead-1', 1, [-80, 3000, 100], 'axis', 'green')

/** Down the leader now, as a kill would (destroyedAt is a tick). */
function destroy(w: World<undefined>, id: string): World<undefined> {
  const rec = w.combat.aircraft[id]!
  return { ...w, combat: { ...w.combat, aircraft: { ...w.combat.aircraft, [id]: { ...rec, damage: { ...rec.damage, destroyedAt: w.tick } } } } }
}

describe('leader lost (7f spec §4)', () => {
  it('a raider wingman takes on the route at the leader legIndex and finishes it', () => {
    let w = buildFormation([PLAYER_FAR, LEAD, WING])
    w = runCanned(w, {}, 200, () => {}) // past the first waypoint
    const leg = aircraftById(w, 'lead-1')!.pilot!.decision.legIndex
    expect(leg).toBeGreaterThanOrEqual(1)
    w = destroy(w, 'lead-1')
    w = runCanned(w, {}, 1, () => {})
    const p = aircraftById(w, 'wing-1')!.pilot!
    expect(p.formation).toBeUndefined()
    expect(p.ingress?.route).toEqual(ROUTE)
    expect(p.decision.legIndex).toBeGreaterThanOrEqual(leg)
    w = runCanned(w, {}, 400, () => {})
    expect(aircraftById(w, 'wing-1')!.pilot!.decision.legIndex).toBe(ROUTE.length + 1)
  })

  it('a wingman whose leader dies mid-fight keeps fighting, then flies on sane (Review Focus 5)', () => {
    const attacker = { ...PLAYER_EAST, airborneAt: { position: [-1500, 3000, 0], headingDeg: 90, speedMps: 150 } }
    let w = buildFormation([attacker, LEAD, WING])
    w = runCanned(w, { 'f6f-1': chase('lead-1') }, 10, () => {})
    expect(aircraftById(w, 'wing-1')!.pilot!.decision.targetId).toBe('f6f-1')
    w = destroy(w, 'lead-1')
    let minY = Infinity
    w = runCanned(w, { 'f6f-1': chase('wing-1') }, 60, (x) => {
      const s = aircraftById(x, 'wing-1')!.state
      expect([s.position.x, s.position.y, s.position.z].every(Number.isFinite)).toBe(true)
      minY = Math.min(minY, s.position.y)
      expect(x.combat.aircraft['wing-1']!.stress.loadFactorG).toBeLessThanOrEqual(aircraftById(x, 'wing-1')!.spec.limits.gLimit)
    })
    expect(minY).toBeGreaterThan(PURSUIT_FLOOR_M)
    expect(aircraftById(w, 'wing-1')!.pilot!.formation).toBeUndefined()
  })
})

describe('a parked leader (7f spec §4)', () => {
  it('the wingman loiters while the player is parked on the deck (the CAP launch case)', () => {
    // A deck park works with terrain null (tests/sim/mission/objectives.test.ts does the same).
    const parked = { id: 'f6f-1', spec: 'f6f-hellcat', parkedAt: { ship: 'cv-1', spot: { x: 0, z: -110 } }, chocked: true }
    const cv = { id: 'cv-1', spec: 'essex-cv', side: 'allied', waypoints: [[0, 0]], speedMps: 0 }
    const w = buildFormation([parked, wingman('wing-1', 'f6f-1', 1, [0, 2000, -3000])], { ships: [cv] })
    const end = runCanned(w, {}, 20, (x) => {
      expect(aircraftById(x, 'wing-1')!.pilot!.decision.mode).toBe('loiter')
    })
    expect(length(sub(aircraftById(end, 'wing-1')!.state.position, aircraftById(w, 'wing-1')!.state.position))).toBeGreaterThan(0)
  })

  it('joins once the leader takes off', () => {
    // A deck park works with terrain null (tests/sim/mission/objectives.test.ts does the same).
    const parked = { id: 'f6f-1', spec: 'f6f-hellcat', parkedAt: { ship: 'cv-1', spot: { x: 0, z: -110 } }, chocked: true }
    const cv = { id: 'cv-1', spec: 'essex-cv', side: 'allied', waypoints: [[0, 0]], speedMps: 0 }
    let w = buildFormation([parked, wingman('wing-1', 'f6f-1', 1, [0, 2000, -3000])], { ships: [cv] })
    w = runCanned(w, {}, 5, () => {}) // settle into the loiter first, like a real launch wait
    expect(aircraftById(w, 'wing-1')!.pilot!.decision.mode).toBe('loiter')

    // The leader goes airborne, 3,000 m, heading east at 110 m/s, near the wingman.
    const leaderBefore = aircraftById(w, 'f6f-1')!
    const position = v3(0, 3000, -3000)
    const velocity = v3(110, 0, 0)
    const state = createState({ position, velocity, attitude: qFromAxisAngle(v3(0, 1, 0), Math.atan2(-velocity.z, velocity.x)) })
    const airborneLeader = { ...leaderBefore, parked: false, state, previous: state }
    w = { ...w, aircraft: w.aircraft.map((a) => (a.id === 'f6f-1' ? airborneLeader : a)) }

    const scripts = { 'f6f-1': formationLeader(110, 3000, 0) }
    w = runCanned(w, scripts, 1, () => {})
    expect(aircraftById(w, 'wing-1')!.pilot!.decision.mode).toBe('formation')
    const end = runCanned(w, scripts, 89, () => {})
    expect(stationErrorM(aircraftById(end, 'wing-1')!, aircraftById(end, 'f6f-1')!, 1)).toBeLessThan(50)
  })
})
