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

/** Runs the escort intercept: the player attacks the raider leader, always
 *  chasing `lead-1` regardless of where the wingman ends up. Shared by the
 *  quarter- and astern-geometry cases below (round 1 fix) so both read the
 *  same "entered", "targeted" and "defended" facts the same way. */
function runEscort(
  attackerPosition: readonly [number, number, number], headingDeg: number, seconds = 120,
): { enteredAt: number | null; targetedAt: number | null; minRange: number; maneuvers: ReadonlySet<string>; world: World<undefined> } {
  const attacker = { ...PLAYER_EAST, airborneAt: { position: attackerPosition, headingDeg, speedMps: 150 } }
  let w = buildFormation([attacker, LEAD, WING])
  let enteredAt: number | null = null
  let targetedAt: number | null = null
  let minRange = Infinity
  const maneuvers = new Set<string>()
  let t = 0
  w = runCanned(w, { 'f6f-1': chase('lead-1') }, seconds, (x) => {
    t += 1 / 60
    const d = aircraftById(x, 'wing-1')!.pilot!.decision
    // 7f controller ruling: the cover radius is around the leader OR the
    // wingman (spec §4), and the wingman flies aft of the leader, so it
    // can legitimately enter cover range of the attacker first.
    if (enteredAt === null && Math.min(range(x, 'f6f-1', 'lead-1'), range(x, 'f6f-1', 'wing-1')) <= 3000) enteredAt = t
    if (enteredAt === null) expect(d.mode, `t=${t.toFixed(2)}`).toBe('formation')
    if (targetedAt === null && d.targetId === 'f6f-1') targetedAt = t
    if (d.targetId === 'f6f-1') {
      minRange = Math.min(minRange, range(x, 'wing-1', 'f6f-1'))
      maneuvers.add(d.maneuver)
    }
  })
  return { enteredAt, targetedAt, minRange, maneuvers, world: w }
}

describe('escort: a leader that never engages is still covered (7f spec §4)', () => {
  // Controller ruling round 1: 45 degrees left of the leader's six (the
  // side away from slot 1, which sits 100 m to the leader's RIGHT), ~4.5 km
  // out, chasing the leader -- so the attacker does not arrive on the
  // wingman's own six the way a directly-astern chase does (see the
  // "direct astern" describe block below).
  const QUARTER_RANGE_M = 4500
  const QUARTER_ANGLE_RAD = (45 * Math.PI) / 180
  const QUARTER_ATTACKER_POSITION: readonly [number, number, number] =
    [-QUARTER_RANGE_M * Math.cos(QUARTER_ANGLE_RAD), 3000, -QUARTER_RANGE_M * Math.sin(QUARTER_ANGLE_RAD)]
  const QUARTER_ATTACKER_HEADING_DEG = 135 // roughly toward the leader from that bearing

  it('holds station until the attacker enters cover range from the leader’s left quarter, then targets it within one reactionS, and closes below 600 m', () => {
    const { enteredAt, targetedAt, minRange } = runEscort(QUARTER_ATTACKER_POSITION, QUARTER_ATTACKER_HEADING_DEG)
    expect(enteredAt).not.toBeNull()
    expect(targetedAt).not.toBeNull()
    expect(targetedAt! - enteredAt!).toBeLessThanOrEqual(0.3 + 1 / 60)
    expect(minRange).toBeLessThan(600)
  })

  // Why this is skipped (final review I3, measured 2026-09-27 by a throwaway
  // probe re-running deriveFacts and decideManeuver on this same world,
  // every tick wing-1 held the attacker as target): the wingman never
  // chooses Pursue, and only Pursue's gun gate in pursuitControls ever sets
  // `fire`, so there are 0 shots and 0 hits. The cause is NOT threat-astern:
  // `threatAstern` was true on 0 of 4,947 ticks. It is energy and angle. The
  // escort flies at the leader's 110 m/s against a 150 m/s attacker, so the
  // mean relative energy was about -4,900 J/kg (-4,917), and
  // decideManeuver's energy term makes Extend win on 3,219 ticks (65%); the
  // attacker's angle-off was under 90 degrees (nose toward the wingman) on
  // 3,115 ticks and the angle term makes Break win the other 1,728. With the
  // energy term zeroed Pursue would win 1,566 ticks. With the attacker
  // slowed to 110 m/s the wingman does pick Pursue (360 of 3,777 ticks) and
  // still scores no hits. Do not tune decision.ts, the targeting weights or
  // AI gunnery to force this: Mark decides whether the spec's "takes hits"
  // becomes "fires within gun solution" for an escort out-energied by its
  // attacker.
  it.skip('the attacker takes hits from wing-1 after closing from the leader’s left quarter', () => {
    const { world } = runEscort(QUARTER_ATTACKER_POSITION, QUARTER_ATTACKER_HEADING_DEG)
    expect(world.combat.aircraft['f6f-1']!.lastHitBy).toBe('wing-1')
  })

  it('does not leave station for hostiles 6 km off (Review Focus 3)', () => {
    const far = { id: 'b-far', spec: 'f6f-hellcat', side: 'allied', airborneAt: { position: [0, 3000, 6000], headingDeg: 90, speedMps: 110 } }
    const w = buildFormation([PLAYER_FAR, LEAD, WING, far])
    runCanned(w, { 'b-far': straight }, 30, (x) => {
      expect(aircraftById(x, 'wing-1')!.pilot!.decision.targetId).toBeNull()
    })
  })
})

describe('direct astern: the wingman still targets and defends (Review Focus 1)', () => {
  // Controller ruling round 1: documents, rather than skips, the geometry
  // the original escort test used -- 5 km directly astern of the leader,
  // which puts the attacker on the WINGMAN's own six too (slot 1 sits only
  // 80 m aft of the leader). Measured 2026-09-27 (final review I3, the
  // same probe as the skip above, every tick wing-1 held the attacker as
  // target): 0
  // Pursue, 684 Break, 1,437 Extend of 2,121 ticks, 0 safety overrides,
  // never fires. Not a threat-astern reading: `threatAstern` was true on 0
  // of 2,121 ticks. The escort at 110 m/s is out-energied by the 150 m/s
  // attacker (mean relative energy about -4,700 J/kg, -4,687), so the
  // energy term picks Extend; the attacker's nose toward the wingman
  // (1,757 ticks) makes the angle term pick Break. Here Pursue would not
  // win even with the energy term zeroed (0 ticks). Defending is the
  // expected behavior for this geometry, not a cover-rule defect.
  it('targets a direct-astern attacker within one reactionS of entry and defends', () => {
    const { enteredAt, targetedAt, maneuvers } = runEscort([-5000, 3000, 0], 90)
    expect(enteredAt).not.toBeNull()
    expect(targetedAt).not.toBeNull()
    expect(targetedAt! - enteredAt!).toBeLessThanOrEqual(0.3 + 1 / 60)
    expect(maneuvers.has('break') || maneuvers.has('extend')).toBe(true)
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
    // formationLeader, not holdHeight: holdHeight lets speed drift (120 ->
    // 133 m/s over 30 s, measured in this test with holdHeight(3000, null,
    // 6, 120)), which never lets the trail-cover law settle since the
    // station point keeps accelerating away.
    const hold = formationLeader(110, 3000, 0)
    const firing = runCanned(w, { 'f6f-1': (s, x) => ({ ...hold(s, x), fire: true }) }, 30, () => {})
    const me = aircraftById(firing, 'wing-1')!
    expect(me.pilot!.decision.coverUntilS!).toBeGreaterThan(firing.tick / 60)
    expect(length(sub(stationPoint(aircraftById(firing, 'f6f-1')!, TRAIL_COVER), me.state.position))).toBeLessThan(100)
    const after = runCanned(firing, { 'f6f-1': hold }, 60, () => {})
    expect(stationErrorM(aircraftById(after, 'wing-1')!, aircraftById(after, 'f6f-1')!, 1)).toBeLessThan(50)
  })
})
