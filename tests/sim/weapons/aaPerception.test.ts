import { describe, expect, it } from 'vitest'
import { loadShipSpec } from '../../../tools/content/load.js'
import { v3 } from '../../../src/sim/math/vec3.js'
import { initialAa, mountsOf, stepAa, takeDueBursts, type AaOwner, type AaTarget } from '../../../src/sim/weapons/aaFire.js'

/** F6B Task 6: anti-aircraft fire respects the night detection range (decision D9: blackout limits flak). */
const ship: AaOwner = {
  id: 'dd', side: 'axis', mounts: mountsOf(loadShipSpec('fletcher-dd').armament!), armament: loadShipSpec('fletcher-dd').armament!,
  position: v3(0, 0, 0), previous: v3(0, 0, 0), headingRad: 0,
}
const plane = (at: ReturnType<typeof v3>): AaTarget => ({ id: 'p', side: 'allied', kind: 'aircraft', position: at, velocity: v3(100, 0, 0), accel: v3(0, 0, 0) })
function fire(target: AaTarget, seenWithinM?: Record<string, number>): number {
  let aa = initialAa(7), shots = 0
  for (let tick = 1; tick <= 12 * 60; tick++) {
    const out = stepAa(aa, [ship], [target], tick, 1 / 60, 0, [], seenWithinM)
    shots += out.rounds.length
    aa = out.aa
    const taken = takeDueBursts(aa, tick); shots += taken.due.length; aa = taken.aa
  }
  return shots
}
describe('flak and the night detection range', () => {
  const far = plane(v3(3000, 600, 0)) // 3 km: heavy flak only
  it('a lit aircraft (range 6 km) is engaged at 3 km, a blacked-out one (range 830 m) is not, a flare-lit one (3.1 km) is', () => {
    expect(fire(far, { p: 6000 })).toBeGreaterThan(0)
    expect(fire(far, { p: 830 })).toBe(0)
    expect(fire(far, { p: 3100 })).toBeGreaterThan(0)
  })
  it('the dark aircraft is engaged once it is inside its range; the day path (no table) is unchanged', () => {
    expect(fire(plane(v3(700, 150, 0)), { p: 830 })).toBeGreaterThan(0)
    expect(fire(far, undefined)).toBe(fire(far, undefined))
    expect(fire(far, undefined)).toBeGreaterThan(0)
  })
})
