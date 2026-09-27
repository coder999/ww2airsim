import { describe, expect, it } from 'vitest'
import { aircraftById } from '../../../src/sim/loop.js'
import { length } from '../../../src/sim/math/vec3.js'
import { stationErrorM } from '../../../src/sim/ai/formation.js'
import { holdHeight, levelTurn, runCanned } from './maneuverWorlds.js'
import { PLAYER_EAST, buildFormation, rmsStationError, wingman } from './formationWorlds.js'

/** 7f spec, Acceptance, Tier 1: station, turn, rejoin, ahead of station.
 *  The player is the leader, flown by script. */
const HOLD = { 'f6f-1': holdHeight(3000, null, 6, 120) }

describe('a wingman holds station on the player (7f spec §3)', () => {
  for (const slot of [1, 2, 3] as const) {
    it(`slot ${slot}: straight and level, RMS error under 25 m after 20 s`, () => {
      const w = buildFormation([PLAYER_EAST, wingman('wing-1', 'f6f-1', slot, [-300, 3000, 0])])
      expect(aircraftById(w, 'wing-1')!.pilot!.decision.mode).toBe('formation')
      const { rms, world } = rmsStationError(w, HOLD, 60, 'wing-1', 'f6f-1', slot, 20)
      expect(rms).toBeLessThan(25)
      expect(aircraftById(world, 'wing-1')!.pilot!.decision.mode).toBe('formation')
    })
  }

  it('through a sustained 30-degree-bank turn (n = 1.155), RMS under 60 m for slots 1 and 2', () => {
    for (const slot of [1, 2] as const) {
      const w = buildFormation([PLAYER_EAST, wingman('wing-1', 'f6f-1', slot, [-80, 3000, slot === 1 ? 100 : -100])])
      const settled = runCanned(w, HOLD, 20, () => {})
      const { rms } = rmsStationError(settled, { 'f6f-1': levelTurn(1.155, 1) }, 60, 'wing-1', 'f6f-1', slot, 0)
      expect(rms, `slot ${slot}`).toBeLessThan(60)
    }
  })

  it('rejoins from 2 km astern to within 50 m in under 90 s', () => {
    const w = buildFormation([PLAYER_EAST, wingman('wing-1', 'f6f-1', 1, [-2080, 3000, 100])])
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
    const w = buildFormation([PLAYER_EAST, wingman('wing-1', 'f6f-1', 1, [1500, 3000, 100])])
    let minSpeed = Infinity
    const end = runCanned(w, HOLD, 120, (x) => { minSpeed = Math.min(minSpeed, length(aircraftById(x, 'wing-1')!.state.velocity)) })
    const spec = aircraftById(end, 'wing-1')!.spec
    expect(minSpeed).toBeGreaterThan(1.2 * spec.reference.stallSpeedMps)
    expect(stationErrorM(aircraftById(end, 'wing-1')!, aircraftById(end, 'f6f-1')!, 1)).toBeLessThan(50)
  })
})
