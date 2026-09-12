import { describe, it, expect } from 'vitest'
import { v3, length } from '../../../src/sim/math/vec3.js'
import { qIdentity, qFromAxisAngle } from '../../../src/sim/math/quat.js'
import { createState, step, airspeed, angleOfAttack, isStalled, DT, type Controls }
  from '../../../src/sim/flight/model.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { densityAt } from '../../../src/sim/atmosphere.js'
import { assertFinite } from '../../../src/sim/invariants.js'
import { liftCoefficient, dragCoefficient } from '../../../src/sim/aero.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const NEUTRAL: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0 }

describe('flight integrator: forces', () => {
  it('accelerates downward in free fall with no airspeed', () => {
    const s0 = createState({ position: v3(0, 5000, 0), velocity: v3(0, 0, 0) })
    const s1 = step(f6f, s0, NEUTRAL, DT)
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
      s = step(f6f, s, { pitch: 0, roll: 0, yaw: 0, throttle: 0.8 }, DT)
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
    const cd0Attached = dragCoefficient(f6f, cl0, 0)
    const vt4000 = Math.sqrt((2 * mass * 9.80665) / (rho * f6f.geometry.wingAreaM2 * cd0Attached))
    // Measured at this commit: mass=4590, rho(4000m)=0.819129, cl(0)=0.1,
    // Cd(0)=0.021781, giving vt4000=403.2486164201407 m/s via the formula
    // above (Vt = sqrt(2*m*g / (rho*A*Cd))) -- computed by the test itself
    // at run time, so it can't drift out of sync with the content file.

    const s0 = createState({ position: v3(0, 4000, 0), velocity: v3(0, -vt4000, 0), attitude: noseDownAttitude() })
    expect(isStalled(f6f, s0)).toBe(false)
    const s1 = step(f6f, s0, NEUTRAL, DT)

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
      s = step(f6f, s, NEUTRAL, DT)
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
    const dLow = step(f6f, low, full, DT).velocity.x - low.velocity.x
    const dHigh = step(f6f, high, full, DT).velocity.x - high.velocity.x
    expect(dLow).toBeGreaterThan(dHigh)
  })

  it('burns fuel at full throttle and not at idle', () => {
    const s0 = createState({ position: v3(0, 1000, 0), velocity: v3(120, 0, 0), fuelKg: 600 })
    const burned = s0.fuelKg - step(f6f, s0, { pitch: 0, roll: 0, yaw: 0, throttle: 1 }, DT).fuelKg
    const idle = s0.fuelKg - step(f6f, s0, NEUTRAL, DT).fuelKg
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
      for (let i = 0; i < 600; i++) s = step(f6f, s, { pitch: 0.2, roll: 0.1, yaw: 0, throttle: 0.7 }, DT)
      return s
    }
    expect(run()).toEqual(run())
  })

  it('conserves speed within tolerance in level flight at trim', () => {
    // Straight and level at 130 m/s with enough throttle to hold it: speed
    // should not run away in either direction over 30 seconds.
    let s = createState({ position: v3(0, 2000, 0), velocity: v3(130, 0, 0) })
    for (let i = 0; i < 60 * 30; i++) s = step(f6f, s, { pitch: 0, roll: 0, yaw: 0, throttle: 0.75 }, DT)
    expect(length(s.velocity)).toBeGreaterThan(40)
    expect(length(s.velocity)).toBeLessThan(300)
    // Ruling R24: the speed band alone passes even with lift deleted entirely
    // (measured: 248.6 m/s at 30s with lift forced to zero) -- while the
    // aircraft is 1813 m *below* sea level by then. An altitude floor is what
    // actually proves lift is doing anything here.
    expect(s.position.y).toBeGreaterThan(1500)
  })
})
