import { describe, it, expect } from 'vitest'
import { applyAssists, type AssistSettings } from '../../src/assists/index.js'
import { step, DT } from '../../src/sim/flight/model.js'
import { createState, type AircraftState, type Controls } from '../../src/sim/flight/state.js'
import { v3, length, normalize, dot } from '../../src/sim/math/vec3.js'
import { qRotate, qIdentity } from '../../src/sim/math/quat.js'
import { loadAircraftSpec } from '../../tools/content/load.js'

const spec = loadAircraftSpec('f6f-hellcat')

/** Sideslip, degrees: positive when the airflow comes from the right of the
 *  nose. Same convention and formula as `sim/flight/model.ts`'s
 *  `weathercockY` and `tests/sim/flight/weathercock.test.ts`'s `slipRad`. */
const slipDeg = (s: AircraftState): number => {
  const v = length(s.velocity)
  if (v < 1e-6) return 0
  const right = qRotate(s.attitude, v3(0, 0, 1))
  const rad = Math.asin(Math.max(-1, Math.min(1, dot(normalize(s.velocity), right))))
  return (rad * 180) / Math.PI
}

/** ONLY autoRudder toggles; the other two stages are still identity stubs as
 *  of this task, but isolating the flag under test keeps this file correct
 *  once they are not. */
const ONLY_AUTO_RUDDER = (on: boolean): AssistSettings => ({
  stallLimiter: false,
  autoRudder: on,
})

/** One second of full-deflection aileron, wings-level entry, level flight,
 *  no other pilot input. Runs `applyAssists` -> `step` once per fixed tick,
 *  exactly the order `sim/loop.ts`'s `advance` uses in production, so this
 *  is the same seam Task 1 built, not a hand-rolled shortcut around it. */
function rollFor(seconds: number, speed: number, rollSign: 1 | -1, enabled: AssistSettings): AircraftState {
  let s = createState({ position: v3(0, 2000, 0), velocity: v3(speed, 0, 0), attitude: qIdentity() })
  const raw: Controls = { pitch: 0, roll: rollSign, yaw: 0, throttle: 0.7 }
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const controls = applyAssists(s, spec, raw, DT, enabled)
    s = step(spec, s, controls, { dt: DT, tick: i + 1 })
  }
  return s
}

describe('auto-rudder coordination (Plan 3 Task 2)', () => {
  // NACA Wartime Report L-716 measured the real F6F-3's aileron yaw at about
  // 18.5 degrees of sideslip in left rolls and 23.5 in right rolls at
  // roughly 100 mph, and called the directional stability "low" -- real,
  // and asymmetric between roll directions. This project's flight model has
  // no engine-torque or slipstream asymmetry (verified: the bare-physics
  // sideslip this test measures with the assist off is the exact mirror
  // image between rollSign +1 and -1 at every speed below), so nothing here
  // reproduces THAT particular asymmetry -- but a sign error in the assist
  // itself would not care whether the underlying physics happens to be
  // symmetric, and running both directions is what would catch one that
  // only showed up going one way (e.g. a formula that used the pilot's roll
  // command instead of the measured sideslip, which happen to agree in sign
  // in this symmetric case, but would visibly not be "proportional on
  // sideslip" the moment they were tested against a zero-slip state).
  it.each([90, 130, 180])('reduces sideslip after a full-deflection roll at %i m/s, both directions', (speed) => {
    for (const rollSign of [1, -1] as const) {
      const off = rollFor(1.0, speed, rollSign, ONLY_AUTO_RUDDER(false))
      const on = rollFor(1.0, speed, rollSign, ONLY_AUTO_RUDDER(true))
      expect(Math.abs(slipDeg(on)), `speed=${speed} rollSign=${rollSign}`).toBeLessThan(Math.abs(slipDeg(off)))
    }
  })

  it('does nothing when sideslip is already zero', () => {
    // Straight, wings-level, velocity exactly along the nose: the dot product
    // defining sideslip is exactly 0, so the correction must be exactly 0,
    // not merely small -- an assist that fires on zero sideslip would yaw a
    // perfectly coordinated airplane off its heading for no reason.
    const straight = createState({ position: v3(0, 2000, 0), velocity: v3(130, 0, 0), attitude: qIdentity() })
    const raw: Controls = { pitch: 0.2, roll: -0.3, yaw: 0.1, throttle: 0.8 }
    const result = applyAssists(straight, spec, raw, DT, ONLY_AUTO_RUDDER(true))
    expect(result).toEqual(raw)
  })

  it('leaves pilot rudder input effective with the assist on', () => {
    // A moderate, non-saturating sideslip, so the correction term has
    // headroom left and does not itself clamp the sum. With that headroom,
    // adding rudder must move the output by exactly the amount added -- the
    // assist adds its own term on top of the pilot's, it does not replace or
    // cap the pilot's contribution.
    const slipped = createState({
      position: v3(0, 2000, 0),
      // 5 degrees of sideslip to the right (airflow from the right).
      velocity: v3(130 * Math.cos((5 * Math.PI) / 180), 0, 130 * Math.sin((5 * Math.PI) / 180)),
      attitude: qIdentity(),
    })
    const base: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0.7 }
    const withPilotRudder: Controls = { ...base, yaw: 0.3 }
    const yawNoRudder = applyAssists(slipped, spec, base, DT, ONLY_AUTO_RUDDER(true)).yaw
    const yawWithRudder = applyAssists(slipped, spec, withPilotRudder, DT, ONLY_AUTO_RUDDER(true)).yaw
    expect(yawWithRudder - yawNoRudder).toBeCloseTo(0.3, 10)
  })
})
