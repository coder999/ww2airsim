import { describe, it, expect } from 'vitest'
import { v3, length } from '../../../src/sim/math/vec3.js'
import { qIdentity, qFromAxisAngle } from '../../../src/sim/math/quat.js'
import { createState, step, airspeed, angleOfAttack, isStalled, DT, type Controls }
  from '../../../src/sim/flight/model.js'
import { loadAircraftSpec } from '../../../src/sim/content.js'

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
    // A single expect() per iteration over 18000 steps buried the one that
    // mattered in noise on failure (Important 4, minor). Track the first bad
    // step and assert once, so a regression points straight at when it broke.
    let firstBadStep = -1
    for (let i = 0; i < 60 * 300; i++) {
      s = step(f6f, s, { pitch: 0, roll: 0, yaw: 0, throttle: 0.8 }, DT)
      const all = [s.position.x, s.position.y, s.position.z, s.velocity.x, s.velocity.y,
        s.velocity.z, s.attitude.x, s.attitude.y, s.attitude.z, s.attitude.w, s.fuelKg]
      if (firstBadStep === -1 && !all.every(Number.isFinite)) firstBadStep = i
    }
    expect(firstBadStep).toBe(-1)
  })

  it('reaches a terminal velocity in a nose-down power-off dive', () => {
    // Ruling R23: a genuine nose-down dive, not a level attitude with vertical
    // velocity. The old scenario left the aircraft wings-level while falling
    // straight down, so alpha sat near +/-90 degrees; post-Task-9, that is
    // well past alphaCritDeg, triggers isStalled, and the injected wing-drop
    // roll rate turns the fall into a rolling spiral -- lift stops being zero
    // as body up leaves the velocity vector, and the "terminal velocity" the
    // old test measured was really just wherever the spiral happened to leave
    // it (measured before this fix: 1019 m / 138.7 m/s after all 7200 steps,
    // nowhere near equilibrium). Pointing the nose straight down instead keeps
    // alpha within a degree or so of 0 (confirmed by the isStalled assertion
    // below), so bodyRates from neutral input stay exactly zero and the
    // attitude never rotates -- no stall, no spiral.
    const noseDown = qFromAxisAngle(v3(0, 0, 1), -Math.PI / 2)
    let s = createState({ position: v3(0, 25000, 0), velocity: v3(0, -60, 0), attitude: noseDown })

    // Measured empirically at this commit: the dive accelerates well past
    // any altitude's local equilibrium speed near the top of the fall, then
    // crosses and tracks the (falling, since descending into denser air)
    // local terminal velocity closely from about t=40s on. Sampled 20s apart,
    // well before the ground (impact measured at t=72s, y=0):
    //   t=46s, y=12255 m: speed=466.52 m/s
    //   t=66s, y=2569 m:  speed=467.26 m/s   (delta 0.75 m/s)
    let vAt46: number | undefined
    let vAt66: number | undefined
    let sawStall = false
    for (let i = 0; i < 60 * 150; i++) {
      s = step(f6f, s, NEUTRAL, DT)
      if (isStalled(f6f, s)) sawStall = true
      const t = (i + 1) / 60
      if (Math.abs(t - 46) < 1e-9) vAt46 = airspeed(s)
      if (Math.abs(t - 66) < 1e-9) vAt66 = airspeed(s)
      if (s.position.y <= 0) break
    }

    expect(sawStall).toBe(false)
    expect(vAt46).toBeDefined()
    expect(vAt66).toBeDefined()
    // Convergence, not just a band: two samples 20 seconds apart, after the
    // initial transient, agree within a few m/s -- what "reaches a terminal
    // velocity" actually claims. A drag-free model could never satisfy this;
    // the old band (60 < speed < 400) was satisfied by almost anything,
    // including the still-accelerating pre-fix run above.
    expect(Math.abs(vAt66! - vAt46!)).toBeLessThan(5)

    // Absolute ceiling, derived rather than guessed: at the sampling window's
    // higher altitude (y=12255 m here, rho=0.2986 kg/m^3 per the ISA model),
    // the zero-lift analytic terminal velocity is
    //   Vt = sqrt(2*m*g / (rho*A*Cd0))
    //      = sqrt(2*4590*9.80665 / (0.2986*31.03*0.0211))
    //      = sqrt(90033 / 0.1955) = sqrt(460532) ~= 678.6 m/s
    // (m = emptyKg 4190 + default fuelKg 400; idle throttle burns none, so
    // mass is constant through the run). Lower altitude means denser air and
    // therefore a LOWER local terminal velocity, so this bounds every later
    // sample too. 700 gives a little headroom without going anywhere near
    // the ~467 m/s the dive actually converges to.
    expect(vAt46!).toBeLessThan(700)
    expect(vAt66!).toBeLessThan(700)
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
