import { describe, expect, it } from 'vitest'
import { GREEN_SKILL, VETERAN_SKILL, type ManeuverName } from '../../../src/sim/ai/pilot.js'
import { MIN_ENGAGEMENT_RANGE_M } from '../../../src/sim/ai/decision.js'
import { hasGunSolution } from '../../../src/sim/ai/pursuit.js'
import { LATCH_CAP_S } from '../../../src/sim/ai/maneuvers.js'
import { YOYO_TAIL_ANGLE_RAD } from '../../../src/sim/ai/maneuverFlight.js'
import { DT } from '../../../src/sim/flight/model.js'
import { createWorldOf, type AircraftEntity, type World } from '../../../src/sim/loop.js'
import { dot, length, scale, sub, v3 } from '../../../src/sim/math/vec3.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { closureOf, level, levelTurn, pilotFor, runCanned, straight, withRepertoire, type ScriptedFlight } from './maneuverWorlds.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const P = 'p', T = 't'
const self = (w: World<undefined>) => w.aircraft.find((a) => a.id === P)!
const other = (w: World<undefined>) => w.aircraft.find((a) => a.id === T)!

/** The pilot starts fast behind a target in a 3 g left turn. Its first
 *  rescore is at 1 s, when the target is already turning. If the named
 *  maneuver is never selected, print the first rescore's facts and move the
 *  START (range, speeds), never the thresholds, and record the change in the
 *  ledger. */
function overshootWorld(skill: typeof GREEN_SKILL, pilotSpeed = 170) {
  return createWorldOf({
    aircraft: [
      level(P, f6f, v3(0, 3000, 0), v3(pilotSpeed, 0, 0), pilotFor(T, skill, 1.0)),
      level(T, f6f, v3(450, 3000, 0), v3(110, 0, 0)),
    ],
    player: T,
  })
}

describe('lag pursuit (7c spec §3.5)', () => {
  // Green's parameters with lag pursuit added back: green lost it on
  // 2026-09-26 (Mark: "green pilots should be beaten easily"), and the veteran
  // flies the high yo-yo here instead. Same skill numbers as when this was
  // measured, so the flight is the same one.
  const LAG_PILOT = withRepertoire(GREEN_SKILL, [...GREEN_SKILL.repertoire, 'lag-pursuit'])
  // Measured 2026-09-26 (closure = the range rate, `closureRateMps`):
  // selected at the first rescore (tick 60) at 57.8 m/s of closure, ended on
  // LAG_END_CLOSURE_MPS at 14.9 m/s 3.3 s later, minimum range 245.1 m.
  it('a green-parameter pilot with lag, overshooting a turning target: selected, closure falls, range stays above MIN_ENGAGEMENT_RANGE_M', () => {
    const m = { selected: false, entryClosure: 0, lastClosure: 0, minRange: Infinity }
    runCanned(overshootWorld(LAG_PILOT), { [T]: levelTurn(3, -1) }, 20, (w) => {
      const d = self(w).pilot!.decision
      if (d.named !== 'lag-pursuit') return
      const c = closureOf(self(w), other(w))
      if (!m.selected) { m.selected = true; m.entryClosure = c }
      m.lastClosure = c
      m.minRange = Math.min(m.minRange, length(sub(other(w).state.position, self(w).state.position)))
    })
    expect(m.selected).toBe(true)
    expect(m.lastClosure).toBeLessThan(m.entryClosure)
    expect(m.minRange).toBeGreaterThan(MIN_ENGAGEMENT_RANGE_M)
  })

  it('shipped green, same world: never selects lag pursuit (Mark, 2026-09-26)', () => {
    let lag = 0
    runCanned(overshootWorld(GREEN_SKILL), { [T]: levelTurn(3, -1) }, 20, (w) => { if (self(w).pilot!.decision.named === 'lag-pursuit') lag++ })
    expect(lag).toBe(0)
  })
})

describe('high yo-yo', () => {
  // Measured 2026-09-26 in this world with the brief's flight.
  //
  // The target flies `levelTurn(3, -1)` until its airspeed first falls below
  // TURN_FLOOR_MPS, then straight. 85 m/s is the slowest the scripted Hellcat
  // still holds its commanded 3 g: flown alone from 110 m/s at 3000 m it held
  // 2.89-2.96 g down to 83.5 m/s, then 2.83 g at 81.8 m/s, 1.92 g at
  // 71.6 m/s, 0.76 g at 50 m/s. Below the floor it is a stalling airframe on a
  // lift-vector controller, not a bandit. Here it eases at tick 755 (12.6 s).
  //
  // The yo-yo: selected at the first rescore at 57.7 m/s of closure, climbs
  // 101.9 m, closure falls to -22.7 m/s, and the latch ends at tick 215
  // (3.58 s) on spec §3.5's exit, 23.9° off the tail, while the target is
  // still turning.
  //
  // Known 7b limitation, measured the same day: lead pursuit cannot then
  // convert against a target still pulling a sustained 3 g. Its velocity
  // controller banks at most 70° (about 2.9 g level). It turned at
  // 0.12-0.16 rad/s against the target's 0.31 and circled 100-250 m above
  // with the target 41-73° off the nose, until the target eased. The gun cone
  // returned at tick 1564, 13.5 s after the target eased, so
  // CONE_AFTER_EASING_S = 16 leaves 2.5 s of headroom. This test therefore
  // proves the yo-yo sets up the geometry, not that it converts against a
  // sustained max-g turner. The limitation is reported to Mark separately and
  // is not fixed in Task 8.
  const TURN_FLOOR_MPS = 85
  const CONE_AFTER_EASING_S = 16
  /** `levelTurn(3, -1)` until the airspeed first falls below `floorMps`,
   *  then straight; `easedTick` records when. */
  const turnWhileFast = (floorMps: number) => {
    const turn = levelTurn(3, -1)
    const state = { easedTick: null as number | null }
    const flight: ScriptedFlight = (a, w) => {
      if (state.easedTick === null && length(a.state.velocity) < floorMps) state.easedTick = w.tick
      return state.easedTick === null ? turn(a, w) : straight(a, w)
    }
    return { flight, state }
  }
  const angleOffTailRad = (pursuer: AircraftEntity<undefined>, target: AircraftEntity<undefined>): number => {
    const back = scale(target.state.velocity, -1)
    const toPursuer = sub(pursuer.state.position, target.state.position)
    return Math.acos(Math.min(1, Math.max(-1, dot(back, toPursuer) / (length(back) * length(toPursuer)))))
  }

  it('veteran with energy to spare: selected, climbs at least 100 m, closure falls, ends inside 30° of the tail while the target turns, and the cone returns once it eases', () => {
    const skill = withRepertoire(VETERAN_SKILL, ['lead-pursuit', 'high-yo-yo', 'defensive-break', 'extend'] as ManeuverName[])
    const target = turnWhileFast(TURN_FLOOR_MPS)
    const m = {
      selected: false, entryTick: 0, entryY: 0, peakY: -Infinity, entryClosure: 0, minClosure: Infinity,
      endTick: null as number | null, endAngleOffRad: NaN, coneTick: null as number | null,
    }
    runCanned(overshootWorld(skill), { [T]: target.flight }, 35, (w) => {
      const s = self(w)
      if (s.pilot!.decision.named === 'high-yo-yo') {
        if (!m.selected) { m.selected = true; m.entryTick = w.tick; m.entryY = s.state.position.y; m.entryClosure = closureOf(s, other(w)) }
        m.peakY = Math.max(m.peakY, s.state.position.y)
        m.minClosure = Math.min(m.minClosure, closureOf(s, other(w)))
      } else if (m.selected && m.endTick === null) {
        m.endTick = w.tick
        m.endAngleOffRad = angleOffTailRad(s, other(w))
      }
      if (m.coneTick === null && target.state.easedTick !== null && hasGunSolution(s, other(w))) m.coneTick = w.tick
    })
    const eased = target.state.easedTick
    expect(m.selected).toBe(true)
    expect(m.peakY - m.entryY).toBeGreaterThanOrEqual(100)
    expect(m.minClosure).toBeLessThan(m.entryClosure)
    // (c) ended on the spec's exit, not the latch cap, while the target still turned
    expect(m.endTick).not.toBeNull()
    expect((m.endTick! - m.entryTick) * DT).toBeLessThan(LATCH_CAP_S)
    expect(m.endAngleOffRad).toBeLessThan(YOYO_TAIL_ANGLE_RAD)
    expect(eased, 'the target never eased out of its turn').not.toBeNull()
    expect(m.endTick!).toBeLessThan(eased!)
    // (d) the gun cone returns within CONE_AFTER_EASING_S of the target easing
    expect(m.coneTick, 'no gun cone after the target eased').not.toBeNull()
    expect((m.coneTick! - eased!) * DT).toBeLessThanOrEqual(CONE_AFTER_EASING_S)
  })
})

describe('low yo-yo', () => {
  // Measured 2026-09-26 (closure = the range rate): selected at the first
  // rescore (tick 60), at about -10 m/s, the 10 m/s speed deficit; descended
  // 9.6 m (3150.4 -> 3140.8) before closure turned positive and ended it.
  it('veteran falling behind a faster turning target: selected, descends, closure turns positive', () => {
    const skill = withRepertoire(VETERAN_SKILL, ['lead-pursuit', 'low-yo-yo', 'defensive-break', 'extend'] as ManeuverName[])
    const world = createWorldOf({
      aircraft: [
        level(P, f6f, v3(0, 3150, 0), v3(115, 0, 0), pilotFor(T, skill, 1.0)),
        level(T, f6f, v3(700, 3000, 0), v3(125, 0, 0)),
      ],
      player: T,
    })
    const m = { selected: false, entryY: 0, minY: Infinity, positiveClosure: false }
    runCanned(world, { [T]: levelTurn(3, -1) }, 25, (w) => {
      const s = self(w)
      if (s.pilot!.decision.named !== 'low-yo-yo') return
      if (!m.selected) { m.selected = true; m.entryY = s.state.position.y }
      m.minY = Math.min(m.minY, s.state.position.y)
      if (closureOf(s, other(w)) > 0) m.positiveClosure = true
    })
    expect(m.selected).toBe(true)
    expect(m.minY).toBeLessThan(m.entryY)
    expect(m.positiveClosure).toBe(true)
  })
})
