import { describe, it, expect } from 'vitest'
import { v3, length } from '../../../src/sim/math/vec3.js'
import { qIdentity, qFromAxisAngle } from '../../../src/sim/math/quat.js'
import { createState, step, airspeed, angleOfAttack, isStalled, DT, type Controls }
  from '../../../src/sim/flight/model.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { densityAt } from '../../../src/sim/atmosphere.js'
import { assertFinite } from '../../../src/sim/invariants.js'
import { liftCoefficient, dragCoefficient, windmillDragCd0 } from '../../../src/sim/aero.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const NEUTRAL: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0 }

describe('flight integrator: forces', () => {
  it('accelerates downward in free fall with no airspeed', () => {
    const s0 = createState({ position: v3(0, 5000, 0), velocity: v3(0, 0, 0) })
    const s1 = step(f6f, s0, NEUTRAL, { dt: DT, tick: 1 })
    expect(s1.velocity.y).toBeLessThan(0)
    expect(s1.velocity.y).toBeCloseTo(-9.80665 * DT, 3)
  })

  it('never produces a non-finite state over a long run', () => {
    let s = createState({ position: v3(0, 3000, 0), velocity: v3(120, 0, 0) })
    // Finding I7: this hand-copied 11 of the 14 fields in `invariants.ts`'s
    // canonical FIELDS list, omitting all three `bodyRates` components -- it
    // predated `assertFinite` and was never refactored onto it. It calls the
    // canonical checker now, so the list cannot drift here again.
    //
    // A single expect() per iteration over 18000 steps buried the one that
    // mattered in noise on failure (Important 4, minor), so the first
    // failure's own message is captured and asserted once, which also names
    // the offending field rather than just the step index.
    let firstFailure: string | undefined
    for (let i = 0; i < 60 * 300; i++) {
      s = step(f6f, s, { pitch: 0, roll: 0, yaw: 0, throttle: 0.8 }, { dt: DT, tick: i + 1 })
      if (firstFailure === undefined) {
        try {
          assertFinite(s, `step ${i}`)
        } catch (err) {
          firstFailure = (err as Error).message
        }
      }
    }
    expect(firstFailure).toBeUndefined()
  })

  // Shared by both dive tests below: a genuine nose-down attitude (body
  // forward pointing straight down), not a level attitude with vertical
  // velocity (Ruling R23). The old scenario left the aircraft wings-level
  // while falling straight down, so alpha sat near +/-90 degrees;
  // post-Task-9, that is well past alphaCritDeg, triggers isStalled, and the
  // injected wing-drop roll rate turns the fall into a rolling spiral --
  // lift stops being zero as body up leaves the velocity vector, and the
  // "terminal velocity" the old test measured was really just wherever the
  // spiral happened to leave it (measured before that fix: 1019 m / 138.7
  // m/s after all 7200 steps, nowhere near equilibrium). Pointing the nose
  // straight down instead keeps alpha small: the model trims toward its own
  // Cl = 0 angle (about -1.19 degrees), and the measured peak over the 8000 m
  // dive below is 1.1862 degrees -- comfortably inside the 15.5 degree stall
  // margin, so bodyRates from neutral input stay exactly zero and the
  // attitude never rotates -- no stall, no spiral.
  const noseDownAttitude = () => qFromAxisAngle(v3(0, 0, 1), -Math.PI / 2)

  it('sits at equilibrium when placed at its own analytic terminal velocity at 4000 m', () => {
    // Ruling R27(a): the honest terminal-velocity test is a closed-form
    // check at one altitude, not a fitted sample pair from a long fall.
    // Round 1's 25 km-fall version could never pass for the right reason:
    // this aero model has no Mach drag rise (Ruling R26 -- a deliberate
    // fidelity limit for this arcade-scope sim, not a bug to fix here), so
    // its vertical Vt is far beyond anything a fall of any reasonable length
    // reaches (503.6 m/s at 8000 m, Mach 1.635 -- not zero-lift: it includes
    // induced drag from Cl(0) = 0.1, the true zero-lift value is 511.68 m/s)
    // -- the "convergence" round 1 measured was really two samples
    // straddling a speed peak, one at 69% of local Vt and the other at 123%
    // of it.
    //
    // Here we instead derive the model's OWN equilibrium speed at 4000 m --
    // using its actual Cl and Cd at alpha=0, not just cd0 -- and place the
    // aircraft there. If the drag model is self-consistent, one step from
    // exactly that speed should show ~zero net acceleration along the
    // velocity vector.
    const mass = f6f.mass.emptyKg + 400 // default fuelKg; idle throttle burns none
    const rho = densityAt(4000)
    const cl0 = liftCoefficient(f6f, 0)
    // Includes the windmilling-propeller term: this dive is flown at NEUTRAL,
    // i.e. closed throttle, where that term is at its full value. Derived from
    // the model rather than restated, so the two cannot drift apart -- which is
    // the whole point of this test computing its own equilibrium speed.
    const cd0Attached = dragCoefficient(f6f, cl0, 0) + windmillDragCd0(f6f, NEUTRAL.throttle)
    const vt4000 = Math.sqrt((2 * mass * 9.80665) / (rho * f6f.geometry.wingAreaM2 * cd0Attached))
    // Computed by the test at run time, so it cannot drift out of sync with the
    // content file. The closed-throttle Cd is now the clean 0.021781 plus the
    // windmilling propeller's 0.0422, which roughly triples the total and so
    // drops this equilibrium speed well below the 403.2 m/s it was before
    // 2026-09-16 -- the airplane in this dive has its engine off.

    const s0 = createState({ position: v3(0, 4000, 0), velocity: v3(0, -vt4000, 0), attitude: noseDownAttitude() })
    expect(isStalled(f6f, s0)).toBe(false)
    const s1 = step(f6f, s0, NEUTRAL, { dt: DT, tick: 1 })

    const dvdt = (airspeed(s1) - airspeed(s0)) / DT
    // Measured at this commit: dv/dt = 0.0419 m/s^2 -- a few cm/s^2, as
    // expected for one 60 Hz step starting exactly at the closed-form
    // equilibrium speed.
    expect(Math.abs(dvdt)).toBeLessThan(0.1)
  })

  it('approaches, but does not reach, a terminal velocity over an 8000 m dive', () => {
    // Ruling R27(b): what an 8000 m fall can honestly show is APPROACH to
    // equilibrium, not attainment of it -- this model's vertical Vt at
    // 8000 m (503.6 m/s, derived below -- not zero-lift: it includes induced
    // drag from Cl(0) = 0.1, the true zero-lift value is 511.68 m/s) sits at
    // 2.33x the spec's own diveSpeedMps (216) and needs far more than 8000 m
    // of fall to reach (measured: the aircraft is still accelerating, at
    // 309.87 m/s, when it reaches the sea at t=37.8s -- see the closed-form
    // check above for the honest convergence test). What this scenario CAN
    // prove: the acceleration shrinks monotonically as speed builds (it is
    // approaching some equilibrium, even if it never gets there), and speed
    // never exceeds the analytic ceiling for the whole fall.
    const mass = f6f.mass.emptyKg + 400
    const rho8000 = densityAt(8000)
    const cl0 = liftCoefficient(f6f, 0)
    const cd0Attached = dragCoefficient(f6f, cl0, 0)
    const vt8000 = Math.sqrt((2 * mass * 9.80665) / (rho8000 * f6f.geometry.wingAreaM2 * cd0Attached))
    // Measured at this commit: vt8000 = 503.6169157910434 m/s.

    let s = createState({ position: v3(0, 8000, 0), velocity: v3(0, -60, 0), attitude: noseDownAttitude() })
    let prevSpeed = airspeed(s)
    let firstDvDt: number | undefined
    let lastDvDt: number | undefined
    let sawStall = false
    for (let i = 0; i < 60 * 120; i++) {
      s = step(f6f, s, NEUTRAL, { dt: DT, tick: i + 1 })
      if (isStalled(f6f, s)) sawStall = true
      const speed = airspeed(s)
      const dvdt = (speed - prevSpeed) / DT
      firstDvDt ??= dvdt
      lastDvDt = dvdt
      prevSpeed = speed
      if (s.position.y <= 0) break
    }

    expect(sawStall).toBe(false)
    // Measured at this commit: firstDvDt=9.6675 m/s^2 (near free-fall g, as
    // expected at low initial speed), lastDvDt=1.4185 m/s^2 at splashdown --
    // under 15% of the initial value. Approach to equilibrium, not
    // attainment: the acceleration keeps falling but is still nonzero when
    // the fall runs out of altitude.
    expect(lastDvDt!).toBeLessThan(firstDvDt! * 0.3)
    // Bounded by the analytic ceiling for the whole scenario (measured final
    // speed 309.87 m/s against a derived ceiling of 503.6 m/s) -- not
    // attained, per the comment above.
    expect(airspeed(s)).toBeLessThan(vt8000)
  })

  it('produces more thrust at sea level than at high altitude for equal throttle', () => {
    const low = createState({ position: v3(0, 0, 0), velocity: v3(100, 0, 0) })
    const high = createState({ position: v3(0, 11000, 0), velocity: v3(100, 0, 0) })
    const full: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 1 }
    const dLow = step(f6f, low, full, { dt: DT, tick: 1 }).velocity.x - low.velocity.x
    const dHigh = step(f6f, high, full, { dt: DT, tick: 1 }).velocity.x - high.velocity.x
    expect(dLow).toBeGreaterThan(dHigh)
  })

  /**
   * Finding I9: no test exercised partial throttle at low airspeed. Every
   * low-speed test used throttle 0 or 1, and removing `* throttle` from the
   * static-thrust cap in `thrustMagnitude` -- doubling thrust at half throttle
   * from a standstill -- passed all 111 tests. That cap is the sole
   * determinant of thrust below 55.91 m/s at sea level (measured
   * 2026-09-12: propEfficiency*maxPowerW/staticThrustN = 0.75*1,491,000/20,000
   * -- note the crossover is independent of throttle, since both terms scale
   * with it), which is the entire carrier-launch and wave-off regime a later
   * plan depends on.
   *
   * `thrustMagnitude` is module-private, so thrust is recovered from the
   * state: mass * dv_x/dt along the body forward axis, with the throttle-0 run
   * subtracted to cancel drag and the lift component. Nothing else in the
   * x-force depends on throttle, and `step` takes the mass from the incoming
   * state, so the subtraction is exact rather than approximate.
   */
  describe('partial throttle at low airspeed (finding I9)', () => {
    const thrustAt = (speedMps: number, throttle: number): number => {
      const s0 = createState({
        position: v3(0, 0, 0),
        velocity: v3(speedMps, 0, 0),
        attitude: qIdentity(),
        fuelKg: 400,
      })
      const s1 = step(f6f, s0, { pitch: 0, roll: 0, yaw: 0, throttle }, { dt: DT, tick: 1 })
      const xForce = ((s1.velocity.x - s0.velocity.x) / DT) * (f6f.mass.emptyKg + s0.fuelKg)
      if (throttle === 0) return xForce
      return xForce - thrustAt(speedMps, 0)
    }

    it('produces about half the thrust at half throttle from a standstill', () => {
      const half = thrustAt(0, 0.5)
      const full = thrustAt(0, 1)
      // Measured 2026-09-12: 10,000.000 N and 20,000.000 N.
      expect(half / full).toBeCloseTo(0.5, 3)
    })

    it('is the static-thrust cap, scaled by throttle, that sets low-speed thrust', () => {
      // If the cap did not scale with throttle, half throttle would produce
      // the full 20,000 N here. Both ends asserted so the test says which
      // term it is pinning: the power-based term at a standstill would be
      // propEfficiency*maxPowerW/1 m/s = 1,118,250 N, 56x larger.
      expect(thrustAt(0, 1)).toBeCloseTo(f6f.engine.staticThrustN, 3)
      expect(thrustAt(0, 0.5)).toBeCloseTo(f6f.engine.staticThrustN * 0.5, 3)
    })

    it('still scales with throttle at 30 m/s, below the 55.91 m/s crossover', () => {
      // A wave-off / carrier-launch speed, still in the capped regime.
      expect(thrustAt(30, 0.5) / thrustAt(30, 1)).toBeCloseTo(0.5, 3)
      expect(thrustAt(30, 0.25) / thrustAt(30, 1)).toBeCloseTo(0.25, 3)
    })
  })

  it('burns fuel at full throttle and not at idle', () => {
    const s0 = createState({ position: v3(0, 1000, 0), velocity: v3(120, 0, 0), fuelKg: 600 })
    const burned = s0.fuelKg - step(f6f, s0, { pitch: 0, roll: 0, yaw: 0, throttle: 1 }, { dt: DT, tick: 1 }).fuelKg
    const idle = s0.fuelKg - step(f6f, s0, NEUTRAL, { dt: DT, tick: 1 }).fuelKg
    expect(burned).toBeGreaterThan(0)
    expect(burned).toBeGreaterThan(idle)
  })

  it('computes zero angle of attack for velocity along the body X axis', () => {
    const s = createState({ velocity: v3(100, 0, 0), attitude: qIdentity() })
    expect(angleOfAttack(s)).toBeCloseTo(0, 6)
  })

  it('computes positive angle of attack when descending through level attitude', () => {
    const s = createState({ velocity: v3(100, -10, 0), attitude: qIdentity() })
    expect(angleOfAttack(s)).toBeGreaterThan(0)
  })

  it('is deterministic: identical inputs give identical output', () => {
    const run = () => {
      let s = createState({ position: v3(0, 2000, 0), velocity: v3(130, 0, 0) })
      for (let i = 0; i < 600; i++) s = step(f6f, s, { pitch: 0.2, roll: 0.1, yaw: 0, throttle: 0.7 }, { dt: DT, tick: i + 1 })
      return s
    }
    expect(run()).toEqual(run())
  })

  it('conserves speed within tolerance in level flight at trim', () => {
    // Straight and level at 130 m/s with enough throttle to hold it: speed
    // should not run away in either direction over 30 seconds.
    let s = createState({ position: v3(0, 2000, 0), velocity: v3(130, 0, 0) })
    for (let i = 0; i < 60 * 30; i++) s = step(f6f, s, { pitch: 0, roll: 0, yaw: 0, throttle: 0.75 }, { dt: DT, tick: i + 1 })
    expect(length(s.velocity)).toBeGreaterThan(40)
    expect(length(s.velocity)).toBeLessThan(300)
    // Ruling R24: the speed band alone passes even with lift deleted entirely
    // (measured: 248.6 m/s at 30s with lift forced to zero) -- while the
    // aircraft is 1813 m *below* sea level by then. An altitude floor is what
    // actually proves lift is doing anything here.
    expect(s.position.y).toBeGreaterThan(1500)
  })
})
