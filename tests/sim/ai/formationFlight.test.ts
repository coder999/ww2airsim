import { describe, expect, it } from 'vitest'
import { aircraftById } from '../../../src/sim/loop.js'
import { length, v3 } from '../../../src/sim/math/vec3.js'
import { qRotate } from '../../../src/sim/math/quat.js'
import { stationErrorM } from '../../../src/sim/ai/formation.js'
import { runCanned } from './maneuverWorlds.js'
import { PLAYER_EAST, buildFormation, formationLeader, rmsStationError, wingman } from './formationWorlds.js'

/** 7f spec, Acceptance, Tier 1: station, turn, rejoin, ahead of station.
 *  The player is the leader, flown by script at 110 m/s, reduced power as a
 *  real formation leader flies, so a wingman has overtake margin below the
 *  Hellcat's ~150 m/s level ceiling at 3,000 m. The wingmen start at 110 m/s too. */
const HOLD = { 'f6f-1': formationLeader(110, 3000, 0) }
const TURN = { 'f6f-1': formationLeader(110, 3000, 30) }
const LEAD = { ...PLAYER_EAST, airborneAt: { ...PLAYER_EAST.airborneAt, speedMps: 110 } }
const wing = (slot: 1 | 2 | 3, position: readonly [number, number, number]) => wingman('wing-1', 'f6f-1', slot, position, 'allied', 'veteran', 110)

describe('a wingman holds station on the player (7f spec §3)', () => {
  it('the scripted leader, alone, holds a 30-degree bank, 110 +/- 10 m/s and 3,000 +/- 100 m for 60 s', () => {
    const settled = runCanned(buildFormation([LEAD]), HOLD, 20, () => {})
    let t = 0
    let worst = { bankDeg: 0, speed: 0, height: 0 }
    runCanned(settled, TURN, 60, (x) => {
      t += 1 / 60
      const a = aircraftById(x, 'f6f-1')!
      const up = qRotate(a.state.attitude, v3(0, 1, 0))
      const right = qRotate(a.state.attitude, v3(0, 0, 1))
      const bankDeg = Math.atan2(-right.y, up.y) * 180 / Math.PI
      worst = {
        bankDeg: t > 10 ? Math.max(worst.bankDeg, Math.abs(bankDeg - 30)) : 0,
        speed: Math.max(worst.speed, Math.abs(length(a.state.velocity) - 110)),
        height: Math.max(worst.height, Math.abs(a.state.position.y - 3000)),
      }
    })
    expect(worst.bankDeg, 'bank error after a 10 s roll-in, degrees').toBeLessThan(3)
    expect(worst.speed).toBeLessThan(10)
    expect(worst.height).toBeLessThan(100)
  })

  for (const slot of [1, 2, 3] as const) {
    it(`slot ${slot}: straight and level, RMS error under 25 m after 20 s`, () => {
      const w = buildFormation([LEAD, wing(slot, [-300, 3000, 0])])
      expect(aircraftById(w, 'wing-1')!.pilot!.decision.mode).toBe('formation')
      const { rms, world } = rmsStationError(w, HOLD, 60, 'wing-1', 'f6f-1', slot, 20)
      expect(rms).toBeLessThan(25)
      expect(aircraftById(world, 'wing-1')!.pilot!.decision.mode).toBe('formation')
    })
  }

  it('through a sustained 30-degree-bank turn (n = 1.155) at 110 m/s, RMS under 60 m for slots 1 and 2', () => {
    for (const slot of [1, 2] as const) {
      const w = buildFormation([LEAD, wing(slot, [-80, 3000, slot === 1 ? 100 : -100])])
      const settled = runCanned(w, HOLD, 20, () => {})
      const { rms } = rmsStationError(settled, TURN, 60, 'wing-1', 'f6f-1', slot, 0)
      expect(rms, `slot ${slot}`).toBeLessThan(60)
    }
  })

  it('rejoins from 2 km astern to within 50 m in under 90 s', () => {
    const w = buildFormation([LEAD, wing(1, [-2080, 3000, 100])])
    let joinedAt: number | null = null
    let t = 0
    runCanned(w, HOLD, 120, (x) => {
      t += 1 / 60
      if (joinedAt === null && stationErrorM(aircraftById(x, 'wing-1')!, aircraftById(x, 'f6f-1')!, 1) < 50) joinedAt = t
    })
    expect(joinedAt).not.toBeNull()
    expect(joinedAt!).toBeLessThan(90)
  })

  it('from 1.5 km ahead, drops back to station without falling below 1.2x clean stall (Review Focus 1)', () => {
    const w = buildFormation([LEAD, wing(1, [1500, 3000, 100])])
    let minSpeed = Infinity
    const end = runCanned(w, HOLD, 120, (x) => { minSpeed = Math.min(minSpeed, length(aircraftById(x, 'wing-1')!.state.velocity)) })
    const spec = aircraftById(end, 'wing-1')!.spec
    expect(minSpeed).toBeGreaterThan(1.2 * spec.reference.stallSpeedMps)
    expect(stationErrorM(aircraftById(end, 'wing-1')!, aircraftById(end, 'f6f-1')!, 1)).toBeLessThan(50)
  })
})
