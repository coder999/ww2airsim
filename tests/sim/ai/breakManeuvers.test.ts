import { describe, expect, it } from 'vitest'
import { flyScissors, flySplitS } from '../../../src/sim/ai/maneuverFlight.js'
import { loopRadiusM, openLatch } from '../../../src/sim/ai/maneuvers.js'
import { VETERAN_SKILL, type ManeuverLatch } from '../../../src/sim/ai/pilot.js'
import { FLOOR_M, loadFactorBudget } from '../../../src/sim/ai/safety.js'
import { createWorldOf, type World } from '../../../src/sim/loop.js'
import { dot, sub, v3, ZERO } from '../../../src/sim/math/vec3.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { BREAK_SET, chase, headingChangeRad, level, pilotFor, runCanned, splitSWorld, straight, withRepertoire } from './maneuverWorlds.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const zero = loadAircraftSpec('a6m2-zero')
const self = (w: World<undefined>) => w.aircraft.find((a) => a.id === 'p')!
const other = (w: World<undefined>) => w.aircraft.find((a) => a.id === 't')!

/** A veteran `pilotSpec` pilot below its corner speed, with a `threatSpec`
 *  chaser 150 m behind and 30 m to the side, also below its corner speed. */
const scissorsWorld = (pilotSpec: typeof f6f, pilotSpeed: number, threatSpec: typeof f6f, threatSpeed: number) => createWorldOf({
  aircraft: [
    level('p', pilotSpec, v3(0, 3000, 0), v3(pilotSpeed, 0, 0), pilotFor('t', withRepertoire(VETERAN_SKILL, BREAK_SET))),
    level('t', threatSpec, v3(-150, 3000, 30), v3(threatSpeed, 0, 0)),
  ],
  player: 't',
})

const CAP_TICKS = 20 * 60

describe('split-S (7c spec §3.5)', () => {
  /** Measured 2026-09-26: selected at the first rescore (tick 1), rolled
   *  inverted by tick 135, ended on its own at tick 530 (8.8 s): heading
   *  change 167.5°, 504 m lost (3,000 -> 2,496 m), peak 6.41 g against the
   *  F6F's 7.5, lowest point 2,496 m, no safety override. Everything is read
   *  on this one selection, entry to the tick its latch closes. */
  it('selected, reverses heading by 150°+, loses 400-1,500 m, stays within gLimit and above the floor', () => {
    const m = {
      entry: null as null | { heading: number; y: number; tick: number }, exitHeading: 0, exitY: 0, exitTick: 0, done: false,
      peakG: 0, lowest: Infinity, overridden: false,
    }
    runCanned(splitSWorld(), { t: straight }, 20, (w) => {
      const s = self(w)
      const d = s.pilot!.decision
      m.lowest = Math.min(m.lowest, s.state.position.y)
      if (m.done) return
      if (d.named === 'split-s' && d.latch !== null) {
        if (m.entry === null) m.entry = { heading: d.latch.entryHeadingRad, y: d.latch.entryAltitudeM, tick: w.tick }
        m.peakG = Math.max(m.peakG, w.combat.aircraft['p']!.stress.loadFactorG)
        if (d.safety !== 'none') m.overridden = true
      } else if (m.entry !== null) {
        m.done = true
        m.exitTick = w.tick
        m.exitHeading = Math.atan2(s.state.velocity.z, s.state.velocity.x)
        m.exitY = s.state.position.y
      }
    })
    expect(m.entry, 'split-S never selected').not.toBeNull()
    expect(m.done, 'split-S never ended').toBe(true)
    // Its own end, not the latch cap or a safety override.
    expect(m.exitTick - m.entry!.tick).toBeLessThan(CAP_TICKS)
    expect(m.overridden).toBe(false)
    expect(headingChangeRad(m.entry!.heading, m.exitHeading)).toBeGreaterThanOrEqual(150 * Math.PI / 180)
    const lost = m.entry!.y - m.exitY
    expect(lost).toBeGreaterThanOrEqual(400)
    expect(lost).toBeLessThanOrEqual(1500)
    expect(m.peakG).toBeLessThanOrEqual(f6f.limits.gLimit)
    expect(m.lowest).toBeGreaterThanOrEqual(FLOOR_M)
  })
})

describe('scissors, and the envelope gate (7c spec §3.6)', () => {
  /** Measured 2026-09-26: selected at the first rescore (tick 1), turning
   *  right into the Hellcat; roll reversals at 4.25 s (left) and 9.7 s
   *  (right), the latch counting the same 2; ended on its own at 14.4 s
   *  (tick 864) with the Hellcat abeam, ahead of the Zero's 3/9 line. Peak
   *  2.04 g; lowest speed 38.0 m/s (stall 34.87). Reversals, the threat
   *  passing and the end are all read on this one selection. */
  it('a veteran Zero chased by a Hellcat: selected, at least 2 roll reversals in 12 s, and the Hellcat ends up ahead', () => {
    const m = { enteredTick: null as number | null, endTick: null as number | null, reversals: 0, latchReversals: 0, lastSign: 0, threatAhead: false }
    runCanned(scissorsWorld(zero, 88, f6f, 100), { t: chase('p') }, 30, (w) => {
      const s = self(w)
      const d = s.pilot!.decision
      if (m.endTick !== null) return
      if (m.enteredTick === null) {
        if (d.named !== 'scissors') return
        m.enteredTick = w.tick
      }
      if (d.named !== 'scissors') {
        // The tick the latch closed: where is the Hellcat now?
        m.endTick = w.tick
        m.threatAhead = dot(sub(other(w).state.position, s.state.position), s.state.velocity) > 0
        return
      }
      m.latchReversals = d.latch!.reversals
      const r = s.controls.roll
      if (w.tick - m.enteredTick <= 12 * 60 && Math.abs(r) >= 0.5) {
        const sign = Math.sign(r)
        if (m.lastSign !== 0 && sign !== m.lastSign) m.reversals++
        m.lastSign = sign
      }
    })
    expect(m.enteredTick, 'scissors never selected').not.toBeNull()
    expect(m.endTick, 'scissors never ended').not.toBeNull()
    expect(m.endTick! - m.enteredTick!).toBeLessThan(CAP_TICKS)
    expect(m.reversals).toBeGreaterThanOrEqual(2)
    expect(m.latchReversals).toBeGreaterThanOrEqual(2)
    expect(m.threatAhead).toBe(true)
  })

  /** Measured 2026-09-26: the Hellcat reads turnAdvantage 0.627
   *  (boom-and-zoom) against the Zero. Over these 120 s, 18 of its 314 Break
   *  rescores meet every other scissors condition (the first at tick 37),
   *  so it is the envelope gate, not the geometry, that keeps it out. */
  it('a veteran Hellcat chased by a Zero never enters a scissors in 120 s: a boom-and-zoom airframe does not turn with a better turner', () => {
    let scissorsTicks = 0
    runCanned(scissorsWorld(f6f, 100, zero, 88), { t: chase('p') }, 120, (w) => {
      if (self(w).pilot!.decision.named === 'scissors') scissorsTicks++
    })
    expect(scissorsTicks).toBe(0)
  })
})

describe('the Break family\'s latches (the Flown contract)', () => {
  const latchOf = (name: 'scissors' | 'split-s', phase: number, lastSide: number): ManeuverLatch =>
    ({ name, phase, enteredAtS: 0, entryHeadingRad: 0, entryAltitudeM: 3000, loopCenter: v3(0, 2000, 0), reversals: 0, lastSide, lowestAltitudeM: 3000 })
  const p = level('p', f6f, v3(0, 3000, 0), v3(100, 0, 0))

  it('openLatch fixes the split-S loop center one loop radius below the entry point, and only for the split-S', () => {
    const r = loopRadiusM(100, loadFactorBudget(f6f))
    expect(openLatch('split-s', p, 0).loopCenter.y).toBeCloseTo(3000 - r, 9)
    expect(openLatch('scissors', p, 0).loopCenter).toEqual(ZERO)
  })

  it('scissors: the same latch while the threat stays on its side, a new one counting the reversal once it is 5 m across', () => {
    const l = latchOf('scissors', 0, 1)
    expect(flyScissors(p, level('t', f6f, v3(-150, 3000, 30), v3(100, 0, 0)), l).latch).toBe(l)
    expect(flyScissors(p, level('t', f6f, v3(-150, 3000, -4), v3(100, 0, 0)), l).latch).toBe(l)
    expect(flyScissors(p, level('t', f6f, v3(-150, 3000, -6), v3(100, 0, 0)), l).latch).toMatchObject({ lastSide: -1, reversals: 1 })
    expect(flyScissors(p, level('t', f6f, v3(150, 3000, 0), v3(100, 0, 0)), l).latch).toBeNull()
  })

  it('split-S: the same latch while pulling through, none once reversed and near level', () => {
    const l = latchOf('split-s', 1, 0)
    const t = level('t', f6f, v3(-250, 3000, 0), v3(130, 0, 0))
    expect(flySplitS(level('p', f6f, v3(0, 2600, 0), v3(0, -100, 0)), t, l).latch).toBe(l)
    expect(flySplitS(level('p', f6f, v3(0, 2500, 0), v3(-100, -5, 0)), t, l).latch).toBeNull()
  })
})
