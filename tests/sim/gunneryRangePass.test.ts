import { describe, it, expect } from 'vitest'
import { playerAircraft } from '../../src/sim/loop.js'
import { flyPass } from '../pilot/flyPass.js'
import { groundTruthTerrain, rangePass } from '../pilot/rangePass.js'

/**
 * The shipped Gunnery Range, flown the way a player flies it (plan
 * 2026-09-29-gunnery-range-strafing-pass): a strafing pass from the run-in
 * start that kills target-1, then a landing straight ahead on Tacloban. The
 * Deterministic half of what `gunnery.spec.ts` and the meta-game specs fly in the
 * browser, through the same frame pipeline and the same pilot.
 *
 * It replaces the parked-start sortie `friendlyFire.test.ts` used to fly with
 * the shooter levelled by hand, which stopped being the shipped sortie when
 * T1 (2026-09-28) parked the Hellcat at its 9.45 degree rest pitch, and it
 * keeps that test's ruling FF-2: the pass never touches Tacloban.
 */
const terrain = groundTruthTerrain()

describe('the Gunnery Range strafing pass', () => {
  const run = flyPass('gunnery-range', 'target-1', rangePass('gunnery-range', 'target-1', terrain), terrain)
  const w = run.frame.world

  it('kills target-1 on the pass', () => {
    expect(run.killS, `no kill, ${run.hits} hits`).not.toBeNull()
  })

  it('lands on Tacloban straight ahead and comes to rest on the runway', () => {
    expect(run.crashed).toBe(false)
    expect(run.landing?.at).toMatchObject({ kind: 'airfield', id: 'tacloban' })
  })

  it('touches no Tacloban structure, no one else, and records no friendly fire (ruling FF-2)', () => {
    for (const s of w.structures) expect(w.combat.structures[s.id]!.hp, s.id).toBe(s.hp)
    expect(w.combat.aircraft[playerAircraft(w).id]!.friendlyFire).toBeNull()
  })
})
