import { describe, expect, it } from 'vitest'
import { aircraftById, type World } from '../../../src/sim/loop.js'
import { length, sub } from '../../../src/sim/math/vec3.js'
import { PURSUIT_FLOOR_M } from '../../../src/sim/ai/safety.js'
import { leaderAirborne, stationErrorM } from '../../../src/sim/ai/formation.js'
import { decksOf } from '../../../src/sim/world/deck.js'
import { chase, runCanned, type ScriptedFlight } from './maneuverWorlds.js'
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
    let t = 0
    w = runCanned(w, { 'f6f-1': chase('wing-1') }, 60, (x) => {
      t += 1 / 60
      // Still fighting after the handoff, not only before it (final review M6).
      if (t <= 2) expect(aircraftById(x, 'wing-1')!.pilot!.decision.targetId).toBe('f6f-1')
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

  it('joins once the leader takes off from the deck, through production advance (final review C1)', () => {
    // The leader launches for real: a full-throttle deck run, a pitch-up at
    // 6 s, then a climb to 600 m at 110 m/s. `parked` stays true all the
    // way (nothing in the sim clears it), so only a state-based "airborne"
    // test lets the wingman join. Measured 2026-09-27
    // (scratchpad probeLaunch.ts, same world): wheels off at 9.95 s,
    // 'formation' at 10.03 s, within 50 m of slot 1 at 99.7 s (89.8 s after
    // lift-off, from 3.3 km away) and 4 m by 140 s.
    const parked = { id: 'f6f-1', spec: 'f6f-hellcat', parkedAt: { ship: 'cv-1', spot: { x: 0, z: -110 } }, chocked: false }
    const cv = { id: 'cv-1', spec: 'essex-cv', side: 'allied', waypoints: [[0, 0], [20000, 0]], speedMps: 12 }
    const w = buildFormation([parked, wingman('wing-1', 'f6f-1', 1, [0, 600, -3000])], { ships: [cv] })
    const deckY = aircraftById(w, 'f6f-1')!.state.position.y
    const cruise = formationLeader(110, 600, 0)
    let t = 0
    let climbing = false
    const launch: ScriptedFlight = (a, x) => {
      if (a.state.position.y > deckY + 30) climbing = true
      return climbing ? cruise(a, x) : { roll: 0, pitch: t > 6 ? 0.25 : 0, yaw: 0, throttle: 1, brakes: 0 }
    }
    let liftOffS: number | null = null
    let formationS: number | null = null
    let closeS: number | null = null
    const end = runCanned(w, { 'f6f-1': launch }, 150, (x) => {
      t += 1 / 60
      const lead = aircraftById(x, 'f6f-1')!
      const wing = aircraftById(x, 'wing-1')!
      expect(lead.impact).toBeNull()
      if (liftOffS === null && leaderAirborne(lead, x.terrain, decksOf(x.ships))) liftOffS = t
      // On the deck: loiter, never formation.
      if (liftOffS === null) expect(wing.pilot!.decision.mode).toBe('loiter')
      if (formationS === null && wing.pilot!.decision.mode === 'formation') formationS = t
      if (formationS !== null && closeS === null && stationErrorM(wing, lead, 1) < 50) closeS = t
    })
    expect(liftOffS).not.toBeNull()
    expect(liftOffS!).toBeGreaterThan(6) // it did sit on the deck first
    expect(formationS).not.toBeNull()
    expect(formationS! - liftOffS!).toBeLessThanOrEqual(aircraftById(w, 'wing-1')!.pilot!.skill.reactionS + 1 / 60)
    expect(closeS).not.toBeNull()
    expect(closeS! - liftOffS!).toBeLessThan(120) // measured 89.8 s
    expect(aircraftById(end, 'f6f-1')!.parked).toBe(true) // the spawn flag never clears: why the test is state-based
    expect(stationErrorM(aircraftById(end, 'wing-1')!, aircraftById(end, 'f6f-1')!, 1)).toBeLessThan(50)
  })
})
