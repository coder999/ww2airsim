import { describe, expect, it } from 'vitest'
import { GREEN_SKILL, VETERAN_SKILL, type ManeuverName } from '../../../src/sim/ai/pilot.js'
import { MIN_ENGAGEMENT_RANGE_M } from '../../../src/sim/ai/decision.js'
import { hasGunSolution } from '../../../src/sim/ai/pursuit.js'
import { createWorldOf, type World } from '../../../src/sim/loop.js'
import { length, sub, v3 } from '../../../src/sim/math/vec3.js'
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
  // Measured 2026-09-26 (closure = the range rate, `closureRateMps`):
  // selected at the first rescore (tick 60) at 57.8 m/s of closure, ended on
  // LAG_END_CLOSURE_MPS at 14.9 m/s about 3.4 s later, minimum range 245.1 m.
  it('green, overshooting a turning target: selected, closure falls, range stays above MIN_ENGAGEMENT_RANGE_M', () => {
    const m = { selected: false, entryClosure: 0, lastClosure: 0, minRange: Infinity }
    runCanned(overshootWorld(GREEN_SKILL), { [T]: levelTurn(3, -1) }, 20, (w) => {
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
})

describe('high yo-yo', () => {
  // The target turns for 6 s and then flies straight, rather than turning for
  // the whole 25 s: `levelTurn(3, -1)` cannot be sustained by the scripted
  // Hellcat, which bled from 110 to 72 m/s by 16 s and to 36 m/s by 24 s
  // (measured 2026-09-26 in this world, target airspeed logged per tick), so after about 15 s the
  // "turning target" is a stalled airframe on its lift-vector controller,
  // not a bandit. This changes the scripted target, not `overshootWorld`'s
  // start, any threshold or the flight. Measured 2026-09-26: selected at the
  // first rescore (57.7 m/s of closure), climbed 101.9 m (3002.5 -> 3104.4,
  // peak at tick 214), closure fell to -22.7 m/s, the gun cone reopened at
  // tick 1079 (18.0 s).
  const turnThenLevel = (seconds: number): ScriptedFlight => {
    const turn = levelTurn(3, -1)
    return (a, w) => (w.tick < seconds * 60 ? turn(a, w) : straight(a, w))
  }

  it('veteran with energy to spare: selected, climbs at least 100 m, closure falls, then the gun cone comes back', () => {
    const skill = withRepertoire(VETERAN_SKILL, ['lead-pursuit', 'high-yo-yo', 'defensive-break', 'extend'] as ManeuverName[])
    const m = { selected: false, entryY: 0, peakY: -Infinity, peakTick: 0, entryClosure: 0, minClosure: Infinity, coneAfterPeak: false }
    runCanned(overshootWorld(skill), { [T]: turnThenLevel(6) }, 25, (w) => {
      const s = self(w)
      if (s.pilot!.decision.named === 'high-yo-yo') {
        if (!m.selected) { m.selected = true; m.entryY = s.state.position.y; m.entryClosure = closureOf(s, other(w)) }
        if (s.state.position.y > m.peakY) { m.peakY = s.state.position.y; m.peakTick = w.tick }
        m.minClosure = Math.min(m.minClosure, closureOf(s, other(w)))
      }
      if (m.selected && w.tick > m.peakTick && hasGunSolution(s, other(w))) m.coneAfterPeak = true
    })
    expect(m.selected).toBe(true)
    expect(m.peakY - m.entryY).toBeGreaterThanOrEqual(100)
    expect(m.minClosure).toBeLessThan(m.entryClosure)
    expect(m.coneAfterPeak).toBe(true)
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
