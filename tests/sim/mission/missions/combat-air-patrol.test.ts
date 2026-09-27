/**
 * Combat Air Patrol, flown headless (spec §4.4, §5; M4 Task 1).
 *
 * Tuning notes (M3-R9), 2026-09-27:
 *
 * - **The raiders are Zeros (`a6m2-zero`), ruling M4-PF1.** The plan drew
 *   them as Hellcat stand-ins "until Lane B's Zero lands"; the Zero's spec
 *   and model landed on this branch from R3 first. The route and the spawn
 *   points are the plan's, unchanged.
 * - **Measured timing, raiders on 7e's ingress pilot** (the content exactly,
 *   the player held passive about 120 km away; `.superpowers/m4/t1-measure.ts`
 *   on the shipped file, re-derived by the first headless test below on
 *   every run):
 *
 *   | Wave | Spawn | First inside 5 km of `cv-1` | Spawn to breach | Closest approach |
 *   | --- | --- | --- | --- | --- |
 *   | 1 (`raid-1`, `raid-2`) | 60 s, (-29.55, -73.34) km, 3,500 m | 384.6 s, 385.4 s | 324.6 s | 612 m, 608 m |
 *   | 2 (`raid-3`, `raid-4`) | 240 s, (-31.55, -74.34) km | 567.6 s, 568.2 s | 327.6 s | 619 m, 603 m |
 *
 *   `shield` (deny) fails at tick 23,078 (384.6 s). With Hellcats the same
 *   route breached at 380.4 s (tick 22,826); the Zero is about 4 s slower
 *   over it. The timing pin brackets the measured breach: [365, 405] s.
 *   After a breach the raiders orbit the carrier (7e's ORBIT_RADIUS_M 1500,
 *   relative to the moving ship) and never attack it: 7e has no bombing or
 *   torpedo AI, so `cv-1`'s hull HP is unchanged at 700 s (pinned below).
 * - **The station, a 10 km circle at (-14537, -36349), 1,500-5,000 m
 *   (M4-R2).** `hold` takes a point, not an entity, so the station is the
 *   centroid of the Essex's loop (-9084, -28558) -> (-13444, -41903) ->
 *   (-19988, -44130) -> (-15631, -30784). Every waypoint is within 9.51 km
 *   of it (the plan said 9.3; re-measured 2026-09-27: 9,509.7, 5,660.5,
 *   9,500.4 and 5,671.5 m), and the loop's legs lie inside their corners, so
 *   the circle covers the whole loop and the ship never leaves it. The
 *   content test below pins it.
 * - **The spawn distances.** From the station center, wave 1 spawns 39.9 km
 *   (21.5 nm) away at 338 degrees and wave 2 41.6 km (22.5 nm) at 336, which
 *   the CIC lines round to "twenty" and "twenty-two miles".
 */
import { describe, it, expect } from 'vitest'
import { loadScenarioBundle } from '../../../../tools/content/load.js'
import { worldFromScenario } from '../../../../src/sim/scenario.js'
import { playerAircraft, type World } from '../../../../src/sim/loop.js'
import { createState } from '../../../../src/sim/flight/model.js'
import { heightAt, SEA_LEVEL_M } from '../../../../src/sim/world/terrain.js'
import { ticksFor, radioMessages, type MissionLogEntry } from '../../../../src/sim/mission/state.js'
import { missionOutcome, recoveryOf } from '../../../../src/sim/mission/outcome.js'
import { v3 } from '../../../../src/sim/math/vec3.js'
import { progressOf } from '../fixture.js'
import { carrierApproach, destroyNow, headingAttitude, hold, levelAt, stageDitch, stepsWithControls, terrainOrSkip } from '../fly.js'

const STATION = { x: -14537, z: -36349 }
const RAIDERS = ['raid-1', 'raid-2', 'raid-3', 'raid-4']
const SHIELD_FAILED = 'Keep the raid off: failed'
const SPLASHED = 'Essex CIC: All raiders splashed. Bring it aboard.'
/** The scenario's own start: on station, 3,000 m, heading 330, clean. */
const ON_STATION = createState({ position: v3(-14537, 3000, -36349), velocity: v3(-60, 0, -104), attitude: headingAttitude(330), gearFraction: 0 })
/** A passive player well away from the raid's route and the station. */
const FAR = levelAt({ x: 60000, z: 60000 }, 3000, 120, 90)
/** 20 km outside the station circle (30 km east of its center). */
const OFF_STATION = levelAt({ x: STATION.x + 30000, z: STATION.z }, 3000, 120, 90)
/** The first breach, in seconds (measured 384.6; see the header). */
const BREACH_S: readonly [number, number] = [365, 405]

const terrain = terrainOrSkip()

const logTick = (w: World<undefined>, pred: (e: MissionLogEntry) => boolean): number | undefined =>
  w.mission!.log.find(pred)?.tick

const spawnTick = (w: World<undefined>, group: string): number | undefined =>
  logTick(w, (e) => e.kind === 'spawn' && e.group === group)

const completedTick = (w: World<undefined>, id: string): number | undefined =>
  logTick(w, (e) => e.kind === 'objective' && e.id === id && e.status === 'complete')

/** Holds `state` one tick at a time until `done` or `maxS` of mission time. */
function holdUntil(w: World<undefined>, state: Parameters<typeof hold>[1], maxS: number, done: (w: World<undefined>) => boolean): World<undefined> {
  let world = w
  while (!done(world) && world.tick < ticksFor(maxS)) world = hold(world, state, 1)
  return world
}

/** Holds `state` until mission time `s` (from wherever the world is). */
const holdTo = (w: World<undefined>, state: Parameters<typeof hold>[1], s: number): World<undefined> =>
  hold(w, state, ticksFor(s) - w.tick)

const cap = (): World<undefined> => worldFromScenario(loadScenarioBundle('combat-air-patrol'), terrain)

describe('Combat Air Patrol content', () => {
  it('every raider is a Zero on the ingress route to cv-1 (M4-PF1), and the station covers the Essex', () => {
    const { scenario } = loadScenarioBundle('combat-air-patrol')
    const raiders = scenario.heldGroups!.flatMap((g) => g.aircraft ?? [])
    expect(raiders.map((a) => a.id)).toEqual(RAIDERS)
    for (const a of raiders) expect(a.spec).toBe('a6m2-zero')
    const station = scenario.objectives!.find((o) => o.id === 'station')!
    expect(station).toMatchObject({ kind: 'hold', point: STATION, radiusM: 10000, seconds: 180 })
    const cv = scenario.ships!.find((s) => s.id === 'cv-1')!
    const reach = Math.max(...cv.waypoints.map(([x, z]) => Math.hypot(x - STATION.x, z - STATION.z)))
    expect(reach).toBeCloseTo(9509.7, 0)
    expect(reach).toBeLessThan(10000)
  })
})

describe.skipIf(terrain === null)('Combat Air Patrol, headless (spec §5)', () => {
  it('timing: a passive player; wave 1 breaches 5 km in [365, 405] s, shield fails that tick, the carrier is untouched at 700 s', () => {
    let w = cap()
    const hull0 = w.combat.ships['cv-1']!.hp
    let breach: number | null = null
    while (w.tick < ticksFor(700)) {
      w = hold(w, FAR, 1)
      if (breach !== null) continue
      const cv = w.ships.find((s) => s.id === 'cv-1')!.state.position
      const inside = w.aircraft.some((a) => RAIDERS.includes(a.id) && Math.hypot(a.state.position.x - cv.x, a.state.position.z - cv.z) <= 5000)
      if (inside) breach = w.tick
    }
    expect(breach).not.toBeNull()
    expect(breach! / 60).toBeGreaterThanOrEqual(BREACH_S[0])
    expect(breach! / 60).toBeLessThanOrEqual(BREACH_S[1])
    expect(progressOf(w, 'shield').status).toBe('failed')
    expect(logTick(w, (e) => e.kind === 'objective' && e.id === 'shield' && e.status === 'failed')).toBe(breach)
    expect(radioMessages(w.mission!).find((e) => e.text === SHIELD_FAILED)?.tick).toBe(breach)
    expect(spawnTick(w, 'wave-1')).toBe(ticksFor(60))
    expect(spawnTick(w, 'wave-2')).toBe(ticksFor(240))
    expect(w.combat.ships['cv-1']!.hp).toBe(hull0) // Review Focus 4
  })

  it('success (Review Focus 1): wave 1 killed during the hold counts when the raid activates; wave 2; trap; badge', () => {
    let w = hold(cap(), ON_STATION, ticksFor(170))
    expect(spawnTick(w, 'wave-1')).toBe(ticksFor(60))
    expect(progressOf(w, 'raid').status).toBe('inactive')
    w = destroyNow(w, ['raid-1', 'raid-2'])
    w = holdTo(w, ON_STATION, 190)
    expect(completedTick(w, 'station')).toBe(ticksFor(180))
    expect(progressOf(w, 'station').heldTicks).toBe(10800)
    expect(progressOf(w, 'raid')).toMatchObject({ status: 'active', count: 2 })
    w = holdTo(w, ON_STATION, 245)
    expect(spawnTick(w, 'wave-2')).toBe(ticksFor(240))
    w = hold(destroyNow(w, ['raid-3', 'raid-4']), ON_STATION, 1)
    expect(progressOf(w, 'raid')).toMatchObject({ status: 'complete', count: 4 })
    expect(radioMessages(w.mission!).map((e) => e.text)).toContain(SPLASHED)
    // Hold beyond the natural 384.6 s breach: the kills, not an early trap,
    // must be what keeps the shield active.
    w = holdTo(w, ON_STATION, 420)
    expect(progressOf(w, 'shield').status).toBe('active')
    w = carrierApproach(w, 'cv-1')
    const out = missionOutcome(w.mission!, recoveryOf(w)!)
    expect(out).toMatchObject({ result: 'success', badge: { id: 'combat-air-patrol' }, reasons: [] })
    expect(out.objectives.find((o) => o.id === 'shield')!.final).toBe('complete')
  })

  it('failure (Review Focus 2): wave 1 breaches, then everything is killed and he traps: no badge, the breach is the only reason', () => {
    let w = holdTo(cap(), ON_STATION, 190)
    expect(progressOf(w, 'station').status).toBe('complete')
    w = holdUntil(w, ON_STATION, BREACH_S[1], (x) => progressOf(x, 'shield').status === 'failed')
    expect(progressOf(w, 'shield').status).toBe('failed')
    expect(w.tick / 60).toBeGreaterThanOrEqual(BREACH_S[0])
    expect(radioMessages(w.mission!).map((e) => e.text)).toContain(SHIELD_FAILED)
    // Announced, not enforced (spec §0.6): the flight goes on.
    expect(playerAircraft(w).impact).toBeNull()
    expect(w.combat.aircraft[w.player]!.damage.destroyedAt).toBeNull()
    w = hold(destroyNow(w, RAIDERS), ON_STATION, 1)
    w = carrierApproach(w, 'cv-1')
    const out = missionOutcome(w.mission!, recoveryOf(w)!)
    expect(out).toMatchObject({ result: 'no-badge', badge: null, reasons: [SHIELD_FAILED] })
    expect(out.objectives.find((o) => o.id === 'raid')!.final).toBe('complete')
    expect(out.objectives.find((o) => o.id === 'home')!.final).toBe('complete')
  })

  it('the hold is accumulated (Review Focus 3): 100 s on, 60 s 20 km off, 80 s on completes at 240 s, not 180', () => {
    let w = hold(cap(), ON_STATION, ticksFor(100))
    expect(progressOf(w, 'station').heldTicks).toBe(ticksFor(100))
    w = hold(w, OFF_STATION, ticksFor(60))
    expect(progressOf(w, 'station')).toMatchObject({ status: 'active', heldTicks: ticksFor(100) }) // paused, not reset
    expect(completedTick(w, 'station')).toBeUndefined()
    w = hold(w, ON_STATION, ticksFor(80))
    expect(completedTick(w, 'station')).toBe(ticksFor(240))
  })

  it('ditching alongside the task group (Review Focus 5): Ditched, no badge', () => {
    let w = holdTo(cap(), ON_STATION, 241)
    expect(progressOf(w, 'station').status).toBe('complete')
    w = hold(destroyNow(w, RAIDERS), ON_STATION, 1)
    expect(progressOf(w, 'raid').status).toBe('complete')
    // 1,500 m west of the Essex, over open water (fly.ts's DITCH says why
    // the staging is 1 m up and not the brief's 5 m).
    const cv = w.ships.find((s) => s.id === 'cv-1')!.state.position
    const at = { x: cv.x - 1500, z: cv.z }
    expect(heightAt(terrain!, at.x, at.z)).toBeLessThanOrEqual(SEA_LEVEL_M)
    w = stageDitch(w, at)
    for (let i = 0; i < 600 && playerAircraft(w).impact === null; i++) w = stepsWithControls(w, 1, { throttle: 0 })
    expect(playerAircraft(w).impact?.kind).toBe('ditched')
    const out = missionOutcome(w.mission!, recoveryOf(w)!)
    expect(out).toMatchObject({ result: 'no-badge', badge: null })
    expect(out.reasons[0]).toBe('Ditched')
    expect(out.reasons).toEqual(['Ditched', 'Recover: incomplete'])
  })
})
