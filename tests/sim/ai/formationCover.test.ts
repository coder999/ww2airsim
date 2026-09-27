import { describe, expect, it } from 'vitest'
import { aircraftById, type World } from '../../../src/sim/loop.js'
import { length, sub } from '../../../src/sim/math/vec3.js'
import { stationErrorM, stationPoint, TRAIL_COVER } from '../../../src/sim/ai/formation.js'
import { chase, runCanned, straight } from './maneuverWorlds.js'
import { buildFormation, formationLeader, PLAYER_EAST, PLAYER_FAR, wingman } from './formationWorlds.js'

/** 7f spec §4: the cover trigger reads the threat to the leader, not its mode. */
const ROUTE = [{ x: 60000, z: 0, altitudeM: 3000, speedMps: 110 }]
/** An axis raider pair on ingress east: the escort case, a fighter standing in for a bomber. */
const LEAD = { id: 'lead-1', spec: 'f6f-hellcat', airborneAt: { position: [0, 3000, 0], headingDeg: 90, speedMps: 110 }, pilot: { skill: 'green', ingress: { route: ROUTE } } }
const WING = wingman('wing-1', 'lead-1', 1, [-80, 3000, 100], 'axis', 'veteran')
const range = (w: World<undefined>, a: string, b: string) => length(sub(aircraftById(w, a)!.state.position, aircraftById(w, b)!.state.position))

describe('escort: a leader that never engages is still covered (7f spec §4)', () => {
  // 7f ruling: escort hits blocked by AI gunnery (R-F1); see handoff.
  // Everything up through minRange passes; the AI wingman never reaches a
  // gun solution on this intercept geometry (closest range 333 m, well
  // inside AI_GUN_RANGE_M, but 0 shots and 0 hits over 120 s -- the same
  // furball-ruling gunnery weakness against a target that is not flying
  // straight relative to the shooter, not a formation-cover bug). Do not
  // tune AI gunnery or the targeting weights to force this; Mark decides.
  it.skip('holds station until the attacker is within cover range, then targets it within one reactionS, closes, and hits it', () => {
    // The player attacks the raider leader from 5 km astern at full chase.
    const attacker = { ...PLAYER_EAST, airborneAt: { position: [-5000, 3000, 0], headingDeg: 90, speedMps: 150 } }
    let w = buildFormation([attacker, LEAD, WING])
    let enteredAt: number | null = null
    let targetedAt: number | null = null
    let minRange = Infinity
    let t = 0
    w = runCanned(w, { 'f6f-1': chase('lead-1') }, 120, (x) => {
      t += 1 / 60
      const d = aircraftById(x, 'wing-1')!.pilot!.decision
      // 7f controller ruling: the cover radius is around the leader OR the
      // wingman (spec §4), and the wingman flies aft of the leader, so it
      // can legitimately enter cover range of the attacker first.
      if (enteredAt === null && Math.min(range(x, 'f6f-1', 'lead-1'), range(x, 'f6f-1', 'wing-1')) <= 3000) enteredAt = t
      if (enteredAt === null) expect(d.mode, `t=${t.toFixed(2)}`).toBe('formation')
      if (targetedAt === null && d.targetId === 'f6f-1') targetedAt = t
      if (targetedAt !== null) minRange = Math.min(minRange, range(x, 'wing-1', 'f6f-1'))
    })
    expect(enteredAt).not.toBeNull()
    expect(targetedAt).not.toBeNull()
    expect(targetedAt! - enteredAt!).toBeLessThanOrEqual(0.3 + 1 / 60)
    expect(minRange).toBeLessThan(600)
    expect(w.combat.aircraft['f6f-1']!.lastHitBy).toBe('wing-1')
  })

  it('does not leave station for hostiles 6 km off (Review Focus 3)', () => {
    const far = { id: 'b-far', spec: 'f6f-hellcat', side: 'allied', airborneAt: { position: [0, 3000, 6000], headingDeg: 90, speedMps: 110 } }
    const w = buildFormation([PLAYER_FAR, LEAD, WING, far])
    runCanned(w, { 'b-far': straight }, 30, (x) => {
      expect(aircraftById(x, 'wing-1')!.pilot!.decision.targetId).toBeNull()
    })
  })
})

describe('the sandwich (7f spec §4)', () => {
  it('picks the hostile on the leader tail over the leader own target', () => {
    const lead = { id: 'lead-1', spec: 'f6f-hellcat', side: 'allied', airborneAt: { position: [0, 3000, 0], headingDeg: 90, speedMps: 120 }, pilot: { skill: 'veteran', target: 'bandit-a' } }
    const wing = wingman('wing-1', 'lead-1', 1, [-80, 3000, 100], 'allied', 'veteran')
    const a = { id: 'bandit-a', spec: 'f6f-hellcat', airborneAt: { position: [400, 3000, 0], headingDeg: 90, speedMps: 120 } }
    const b = { id: 'bandit-b', spec: 'f6f-hellcat', airborneAt: { position: [-300, 3000, 0], headingDeg: 90, speedMps: 130 } }
    const w = buildFormation([PLAYER_FAR, lead, wing, a, b])
    const end = runCanned(w, { 'bandit-a': straight, 'bandit-b': chase('lead-1') }, 1, () => {})
    expect(aircraftById(end, 'wing-1')!.pilot!.decision.targetId).toBe('bandit-b')
  })
})

describe('the player leads: fire opens trail cover (7f spec §4)', () => {
  it('moves to trail cover while the player fires with nothing near, and back to slot 1 after', () => {
    const w = buildFormation([PLAYER_EAST, wingman('wing-1', 'f6f-1', 1, [-80, 3000, 100])])
    // formationLeader, not holdHeight: holdHeight lets speed drift (~110 ->
    // 128 m/s over tens of seconds, measured Task 3), which never lets the
    // trail-cover law settle since the station point keeps accelerating away.
    const hold = formationLeader(110, 3000, 0)
    const firing = runCanned(w, { 'f6f-1': (s, x) => ({ ...hold(s, x), fire: true }) }, 30, () => {})
    const me = aircraftById(firing, 'wing-1')!
    expect(me.pilot!.decision.coverUntilS!).toBeGreaterThan(firing.tick / 60)
    expect(length(sub(stationPoint(aircraftById(firing, 'f6f-1')!, TRAIL_COVER), me.state.position))).toBeLessThan(100)
    const after = runCanned(firing, { 'f6f-1': hold }, 60, () => {})
    expect(stationErrorM(aircraftById(after, 'wing-1')!, aircraftById(after, 'f6f-1')!, 1)).toBeLessThan(50)
  })
})
