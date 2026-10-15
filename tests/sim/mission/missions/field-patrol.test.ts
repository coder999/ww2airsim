/**
 * Field Patrol, flown headless (F5A Task 9, ruling D3, 2026-10-14): the first mission with a Japanese
 * player, so a Japanese campaign always has an entry-rank, day, single-engine, non-campaign lifeline.
 * A clone of Combat Air Patrol with the roles reversed: an A6M2 Zero holds station over the
 * Japanese-held Dulag strip while two waves of American Hellcats come in from the east.
 *
 * The wind is from 000, down Dulag's north-south runway: `fieldApproach` lands off-field in any
 * crosswind (fly.ts says why), and an off-field landing is no recovery.
 *
 * What this pins that the table-driven suites cannot: that the Zero is a PLAYER aircraft here (the
 * verdict path, the recovery at a Japanese-held field), and that the raiders really are hostile to
 * a player on the `axis` side.
 */
import { describe, it, expect } from 'vitest'
import { loadScenarioBundle } from '../../../../tools/content/load.js'
import { worldFromScenario } from '../../../../src/sim/scenario.js'
import { sideOf } from '../../../../src/sim/sides.js'
import { advance, playerAircraft, withAircraftState, withControls, type World } from '../../../../src/sim/loop.js'
import { DT } from '../../../../src/sim/flight/model.js'
import { createState } from '../../../../src/sim/flight/model.js'
import { v3 } from '../../../../src/sim/math/vec3.js'
import { ticksFor, radioMessages } from '../../../../src/sim/mission/state.js'
import { missionOutcome, recoveryOf } from '../../../../src/sim/mission/outcome.js'
import { progressOf } from '../fixture.js'
import { destroyNow, fieldApproach, headingAttitude, hold, levelAt, terrainOrSkip } from '../fly.js'

const FIELD = { x: -31629, z: -16479 } // Dulag's runway center
const RAIDERS = ['raid-1', 'raid-2', 'raid-3', 'raid-4']
const SHIELD_FAILED = 'Keep the raid off: failed'
const SPLASHED = 'Dulag tower: All raiders splashed. Come home.'
/** The scenario's own start: on station, 3,000 m, heading east, clean. */
const ON_STATION = createState({ position: v3(FIELD.x, 3000, FIELD.z), velocity: v3(120, 0, 0), attitude: headingAttitude(90), gearFraction: 0 })
const FAR = levelAt({ x: -90000, z: 60000 }, 3000, 120, 90)
/** The first breach, in seconds, measured 2026-10-14 with a passive player 130 km away: 239.67 s (wave 1
 *  spawns at 60 s, 28 km east of the strip at 130 m/s). The bracket is [225, 255]. */
const BREACH_S: readonly [number, number] = [225, 255]

const terrain = terrainOrSkip()
const patrol = (): World<undefined> => worldFromScenario(loadScenarioBundle('field-patrol'), terrain)
const holdTo = (w: World<undefined>, state: Parameters<typeof hold>[1], s: number): World<undefined> => hold(w, state, ticksFor(s) - w.tick)

describe('Field Patrol content', () => {
  it('a Zero player on the Japanese side, four American Hellcat raiders, a Japanese-held field', () => {
    const { scenario } = loadScenarioBundle('field-patrol')
    const world = worldFromScenario(loadScenarioBundle('field-patrol'), null)
    const player = scenario.aircraft.find((a) => a.id === scenario.player)!
    expect(player.spec).toBe('a6m2-zero')
    expect(sideOf(world, world.aircraft.find((a) => a.id === world.player)!)).toBe('axis')
    const raiders = scenario.heldGroups!.flatMap((g) => g.aircraft ?? [])
    expect(raiders.map((a) => a.id)).toEqual(RAIDERS)
    for (const a of raiders) {
      expect(a.spec).toBe('f6f-hellcat')
      expect(a.side).toBe('allied')
      expect(a.pilot?.ingress?.destination).toEqual({ airfield: 'dulag' })
    }
    expect(world.airfields.find((a) => a.id === 'dulag')!.side).toBe('axis')
    expect(scenario.objectives!.find((o) => o.id === 'station')).toMatchObject({ kind: 'hold', point: FIELD, radiusM: 10000, seconds: 180 })
    expect(scenario.objectives!.find((o) => o.id === 'shield')).toMatchObject({ kind: 'deny', around: FIELD, radiusM: 5000 })
    expect(scenario.weather!.timeOfDay!).toBeGreaterThanOrEqual(7) // day (F5A: a day, entry-rank mission)
    expect(scenario.weather!.timeOfDay!).toBeLessThanOrEqual(17)
  })
})

describe.skipIf(terrain === null)('Field Patrol, headless', () => {
  it('timing: a passive player far away; wave 1 breaches 5 km of Dulag and the shield fails that tick; both waves spawn on time', () => {
    let w = patrol()
    let breach: number | null = null
    while (w.tick < ticksFor(700)) {
      w = hold(w, FAR, 1)
      if (breach !== null) continue
      if (w.aircraft.some((a) => RAIDERS.includes(a.id) && Math.hypot(a.state.position.x - FIELD.x, a.state.position.z - FIELD.z) <= 5000)) breach = w.tick
    }
    expect(breach).not.toBeNull()
    expect(breach! / 60).toBeGreaterThanOrEqual(BREACH_S[0])
    expect(breach! / 60).toBeLessThanOrEqual(BREACH_S[1])
    expect(progressOf(w, 'shield').status).toBe('failed')
    expect(radioMessages(w.mission!).find((e) => e.text === SHIELD_FAILED)?.tick).toBe(breach)
    expect(w.mission!.log.find((e) => e.kind === 'spawn' && e.group === 'wave-1')?.tick).toBe(ticksFor(60))
    expect(w.mission!.log.find((e) => e.kind === 'spawn' && e.group === 'wave-2')?.tick).toBe(ticksFor(240))
  })

  it('success: hold three minutes, the raid shot down, the tower call, a Zero lands at Dulag: badge field-patrol', () => {
    let w = holdTo(patrol(), ON_STATION, 170)
    w = destroyNow(w, ['raid-1', 'raid-2']) // wave 1 down during the hold: it counts when the raid objective activates
    w = holdTo(w, ON_STATION, 245)
    expect(progressOf(w, 'station').status).toBe('complete')
    w = hold(destroyNow(w, ['raid-3', 'raid-4']), ON_STATION, 1)
    expect(progressOf(w, 'raid').status).toBe('complete')
    expect(radioMessages(w.mission!).map((e) => e.text)).toContain(SPLASHED)
    w = fieldApproach(w, 'dulag')
    expect(playerAircraft(w).spec.id).toBe('a6m2-zero')
    const out = missionOutcome(w.mission!, recoveryOf(w)!)
    expect(out).toMatchObject({ result: 'success', badge: { id: 'field-patrol' }, reasons: [] })
  })

  it('failure: a Hellcat gets inside 5 km; the rest are shot down and the Zero lands: no badge, the breach is the only reason', () => {
    let w = holdTo(patrol(), ON_STATION, 190)
    expect(progressOf(w, 'station').status).toBe('complete')
    // Away while wave 1 comes in, so it is not shot down before it reaches the field.
    while (progressOf(w, 'shield').status !== 'failed' && w.tick < ticksFor(BREACH_S[1] + 5)) w = hold(w, FAR, 1)
    expect(progressOf(w, 'shield').status).toBe('failed')
    w = holdTo(destroyNow(w, ['raid-1', 'raid-2']), ON_STATION, 245) // wave 2 spawns at 240 s
    w = hold(destroyNow(w, ['raid-3', 'raid-4']), ON_STATION, 1)
    w = fieldApproach(w, 'dulag')
    const out = missionOutcome(w.mission!, recoveryOf(w)!)
    expect(out).toMatchObject({ result: 'no-badge', badge: null, reasons: [SHIELD_FAILED] })
  })

  it('the Zero\'s guns are an enemy\'s: a Hellcat 300 m ahead is shot down, credited as a kill and a campaign tag, and is not friendly fire', () => {
    let w = holdTo(patrol(), ON_STATION, 61)
    const raider = w.aircraft.find((a) => a.id === 'raid-1')!
    const pinned = { ...raider.state, position: v3(FIELD.x + 300, 3000, FIELD.z), velocity: v3(0, 0, 0) }
    for (let i = 0; i < ticksFor(30) && w.combat.aircraft['raid-1']!.damage.destroyedAt === null; i++) {
      w = withAircraftState(w, 'raid-1', { ...pinned, tick: w.tick })
      w = withAircraftState(w, w.player, { ...ON_STATION, tick: w.tick })
      w = advance(withControls(w, w.player, { pitch: 0, roll: 0, yaw: 0, throttle: 0, fire: true }), DT).world
    }
    w = hold(w, ON_STATION, 2)
    const me = w.combat.aircraft[w.player]!
    expect(w.combat.aircraft['raid-1']!.damage.destroyedAt).not.toBeNull()
    expect(me.friendlyFire).toBeNull()
    expect(me.friendlyKills).toBe(0)
    expect(me.kills).toBe(1)
    expect(me.tagged).toEqual(['raid-1'])
    expect(me.tagCredits.fighter).toBe(1)
  })
})
