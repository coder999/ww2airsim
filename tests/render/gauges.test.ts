import { describe, it, expect } from 'vitest'
import {
  gaugeValue,
  needleAngleFor,
  attitudeAngles,
  angleForValue,
  tickMarksFor,
  labelTextFor,
  readoutTextFor,
  GAUGES,
} from '../../src/render/gauges.js'
import { createState } from '../../src/sim/flight/state.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { qFromAxisAngle, qIdentity } from '../../src/sim/math/quat.js'
import { loadAircraftSpec } from '../../tools/content/load.js'

const f6f = loadAircraftSpec('f6f-hellcat')

describe('gaugeValue', () => {
  it('reads airspeed from velocity magnitude', () => {
    const s = createState({ velocity: v3(100, 0, 0) })
    expect(gaugeValue('airspeed', f6f, s)).toBeCloseTo(100, 9)
  })

  it('reads altitude from position.y and vertical speed from velocity.y', () => {
    const s = createState({ position: v3(0, 1234, 0), velocity: v3(100, -7.5, 0) })
    expect(gaugeValue('altimeter', f6f, s)).toBeCloseTo(1234, 9)
    expect(gaugeValue('verticalSpeed', f6f, s)).toBeCloseTo(-7.5, 9)
  })

  it('reads fuel, which the model genuinely burns', () => {
    expect(gaugeValue('fuel', f6f, createState({ fuelKg: 300 }))).toBeCloseTo(300, 9)
  })

  it('reports heading in [0, 2pi) and increases it turning right', () => {
    const north = createState({ velocity: v3(100, 0, 0) })
    expect(gaugeValue('heading', f6f, north)).toBeCloseTo(0, 9)
    // A NEGATIVE rotation about body +Y swings the nose toward +Z, which is
    // right (see the sign note on Controls.yaw in state.ts). A compass reads
    // that as an increasing heading. Exact values, not not-equal: a
    // not-equal assertion here once let the gauge read backwards.
    const right = createState({ attitude: qFromAxisAngle(v3(0, 1, 0), -0.3) })
    expect(gaugeValue('heading', f6f, right)).toBeCloseTo(0.3, 6)
    const hardRight = createState({ attitude: qFromAxisAngle(v3(0, 1, 0), -Math.PI / 2) })
    expect(gaugeValue('heading', f6f, hardRight)).toBeCloseTo(Math.PI / 2, 6)
    const left = createState({ attitude: qFromAxisAngle(v3(0, 1, 0), 0.3) })
    expect(gaugeValue('heading', f6f, left)).toBeCloseTo(Math.PI * 2 - 0.3, 6)
  })

  it('reads zero slip in coordinated flight and non-zero in a skid', () => {
    const straight = createState({ velocity: v3(100, 0, 0) })
    expect(Math.abs(gaugeValue('slip', f6f, straight))).toBeLessThan(1e-9)
    const skidding = createState({ velocity: v3(100, 0, 20) })
    expect(Math.abs(gaugeValue('slip', f6f, skidding))).toBeGreaterThan(0.1)
  })
})

describe('needleAngleFor', () => {
  it('is monotonic across each gauge range', () => {
    for (const g of GAUGES) {
      const lo = needleAngleFor(g.id, f6f, g.sampleLow)
      const hi = needleAngleFor(g.id, f6f, g.sampleHigh)
      expect(hi).toBeGreaterThan(lo)
    }
  })

  it('clamps past the ends of the dial rather than spinning round', () => {
    // A needle that wraps reads as a plausible small value at a moment the
    // pilot most needs to see a pegged one.
    const fast = createState({ velocity: v3(10_000, 0, 0) })
    const stopped = createState({ velocity: v3(0, 0, 0) })
    const a = needleAngleFor('airspeed', f6f, fast)
    const b = needleAngleFor('airspeed', f6f, stopped)
    for (const x of [a, b]) expect(Number.isFinite(x)).toBe(true)
    expect(a).toBeGreaterThan(b)
    const faster = needleAngleFor('airspeed', f6f, createState({ velocity: v3(99_999, 0, 0) }))
    expect(faster).toBeCloseTo(a, 9)
  })

  it('stays finite for a degenerate state', () => {
    const still = createState({ velocity: v3(0, 0, 0), attitude: qIdentity() })
    for (const g of GAUGES) expect(Number.isFinite(needleAngleFor(g.id, f6f, still))).toBe(true)
  })

  it('clamps at BOTH ends of a two-sided gauge', () => {
    // verticalSpeed's range (-25..25 m/s) is reachable from both sides --
    // unlike airspeed, whose low end (0) is unreachable because
    // length(velocity) can never go negative. A dive is a real, physically
    // reachable low-end overshoot, so it is the one that can actually catch a
    // regression in the `t < 0` branch.
    const steepDive = needleAngleFor('verticalSpeed', f6f, createState({ velocity: v3(100, -1000, 0) }))
    const steeperDive = needleAngleFor('verticalSpeed', f6f, createState({ velocity: v3(100, -2000, 0) }))
    expect(steepDive).toBeCloseTo(0, 9)
    expect(steeperDive).toBeCloseTo(steepDive, 9)

    const steepClimb = needleAngleFor('verticalSpeed', f6f, createState({ velocity: v3(100, 1000, 0) }))
    const steeperClimb = needleAngleFor('verticalSpeed', f6f, createState({ velocity: v3(100, 2000, 0) }))
    const sweepRad = (Math.PI * 2 * 3) / 4
    expect(steepClimb).toBeCloseTo(sweepRad, 9)
    expect(steeperClimb).toBeCloseTo(steepClimb, 9)
  })

  it('reads headings across the 0/2pi seam as adjacent, not pegged at either end', () => {
    // Despite sitting in the `needleAngleFor` describe block, this pins
    // `gaugeValue`'s own `h < 0 ? h + TWO_PI : h` normalisation, not the
    // `circular` modulo formula in `needleAngleFor` beside it -- gaugeValue
    // already delivers headings inside [0, 2*pi), so that modulo is a no-op
    // on every value this test can produce (see the doc-comment above
    // `needleAngleFor`). A turn that swings just past due north to the left
    // reads as just under 2pi, not as a value clamped down to 0 (wrong
    // direction) or up to some pegged maximum (wrong instrument entirely --
    // a compass has no "off the end of the dial"). Picked deliberately close
    // to the seam (0.02 rad, about 1 degree) rather than the 0.3 rad already
    // used elsewhere, so a clamp-shaped bug that only misbehaves very close
    // to the boundary would still be caught here.
    const justLeftOfNorth = createState({ attitude: qFromAxisAngle(v3(0, 1, 0), 0.02) })
    const justRightOfNorth = createState({ attitude: qFromAxisAngle(v3(0, 1, 0), -0.02) })
    const left = needleAngleFor('heading', f6f, justLeftOfNorth)
    const right = needleAngleFor('heading', f6f, justRightOfNorth)
    expect(left).toBeCloseTo(Math.PI * 2 - 0.02, 6)
    expect(right).toBeCloseTo(0.02, 6)
    // The two needle positions sit on opposite numeric ends of the dial's
    // scale yet are one degree apart on the actual compass rose -- exactly
    // the case a pegged (non-wrapping) needle would get wrong by reading
    // nearly a full turn apart instead of adjacent.
    expect(Math.abs((left - right + Math.PI) % (Math.PI * 2) - Math.PI)).toBeLessThan(0.05)
  })
})

describe('attitudeAngles', () => {
  it('reports level flight as zero pitch and zero roll', () => {
    const a = attitudeAngles(createState({ velocity: v3(100, 0, 0) }))
    expect(a.pitchRad).toBeCloseTo(0, 9)
    expect(a.rollRad).toBeCloseTo(0, 9)
  })

  it('reports a right bank as positive roll', () => {
    const s = createState({ attitude: qFromAxisAngle(v3(1, 0, 0), Math.PI / 6) })
    expect(attitudeAngles(s).rollRad).toBeCloseTo(Math.PI / 6, 6)
  })

  it('reports nose-up as positive pitch', () => {
    const s = createState({ attitude: qFromAxisAngle(v3(0, 0, 1), Math.PI / 8) })
    expect(attitudeAngles(s).pitchRad).toBeGreaterThan(0)
  })
})

describe('scale marks and readouts (I-2)', () => {
  // Whole-branch review, I-2: until this, a dial was a dark disc with a
  // pointer and no marks. `needleAngleFor` documented its result as
  // "clockwise from the dial's zero" and the dial had no zero, and
  // `GaugeSpec.label` and `.unit` were carried in GAUGES and rendered by
  // nothing -- zero non-definition hits across src, tests and tools.

  it('puts the needle exactly on the mark for the value it is showing', () => {
    // The property the whole split exists for. Scale marks computed by one
    // function and needle angles by another is how a needle ends up pointing
    // between the numbers it should line up with -- obvious in a screenshot,
    // invisible to a test written against either half alone.
    for (const g of GAUGES) {
      for (const mark of tickMarksFor(g)) {
        expect(angleForValue(g, mark.value)).toBeCloseTo(mark.angleRad, 12)
      }
    }
  })

  it('gives every dial marks at both ends of its scale', () => {
    for (const g of GAUGES) {
      const marks = tickMarksFor(g)
      expect(marks.length).toBeGreaterThan(4)
      expect(marks.filter((m) => m.major).length).toBeGreaterThanOrEqual(3)
      expect(marks[0]!.value).toBeCloseTo(g.min, 9)
      if (!g.circular) expect(marks[marks.length - 1]!.value).toBeCloseTo(g.max, 9)
    }
  })

  it('numbers its major marks and leaves the minor ones bare', () => {
    for (const g of GAUGES) {
      for (const m of tickMarksFor(g)) {
        if (m.major) expect(m.text).not.toBe('')
        else expect(m.text).toBe('')
      }
    }
  })

  it('keeps the majors on a round step, including where floats do not cooperate', () => {
    // The slip gauge runs -0.5..0.5 with a 0.125 minor step. A `value %
    // majorStep` test is one representation error away from silently dropping
    // a major mark, so the implementation counts step indices instead.
    const slip = GAUGES.find((g) => g.id === 'slip')!
    const majors = tickMarksFor(slip).filter((m) => m.major).map((m) => m.value)
    expect(majors).toEqual([-0.5, -0.25, 0, 0.25, 0.5])
  })

  it('does not draw north twice on the compass rose', () => {
    // 0 and 2*pi are the same mark. Drawing both leaves a doubled tick and a
    // doubled number at north.
    const heading = GAUGES.find((g) => g.id === 'heading')!
    const marks = tickMarksFor(heading)
    const angles = marks.map((m) => m.angleRad)
    expect(new Set(angles.map((a) => a.toFixed(9))).size).toBe(angles.length)
    expect(Math.max(...angles)).toBeLessThan(Math.PI * 2)
  })

  it('labels every dial with the name and unit that were being carried unused', () => {
    for (const g of GAUGES) {
      const text = labelTextFor(g)
      expect(text).toContain(g.label)
      if (g.unit) expect(text).toContain(g.unit)
    }
  })

  it('reads out the quantity, converted into the unit the label promises', () => {
    const spec = loadAircraftSpec('f6f-hellcat')
    // Heading is stored in radians and labelled "deg", so the readout must
    // convert. A raw-radian readout under a "deg" label is the kind of false
    // claim this project treats as a defect.
    const east = createState({ attitude: qFromAxisAngle(v3(0, 1, 0), -Math.PI / 2) })
    expect(readoutTextFor('heading', spec, east)).toBe('090')
    const north = createState({ attitude: qIdentity() })
    expect(readoutTextFor('heading', spec, north)).toBe('000')
    expect(readoutTextFor('altimeter', spec, createState({ position: v3(0, 1234, 0) }))).toBe('1234')
    expect(readoutTextFor('fuel', spec, createState({ fuelKg: 512 }))).toBe('512')
  })

  it('signs a readout that can go either way, and never prints minus zero', () => {
    const spec = loadAircraftSpec('f6f-hellcat')
    expect(readoutTextFor('verticalSpeed', spec, createState({ velocity: v3(100, 12.5, 0) }))).toBe('+12.5')
    expect(readoutTextFor('verticalSpeed', spec, createState({ velocity: v3(100, -12.5, 0) }))).toBe('-12.5')
    // Level flight must read +0.0, not -0.0: a minus sign appearing and
    // vanishing at the top of a climb reads as a fault.
    expect(readoutTextFor('verticalSpeed', spec, createState({ velocity: v3(100, -0, 0) }))).toBe('+0.0')
  })

  it('stops the readout where the needle stops, rather than counting past the peg', () => {
    // A readout that keeps counting while the needle is pegged tells the pilot
    // the instrument is fine when it is off its scale.
    const spec = loadAircraftSpec('f6f-hellcat')
    const tooHigh = createState({ position: v3(0, 99_000, 0) })
    expect(readoutTextFor('altimeter', spec, tooHigh)).toBe('10000')
    expect(needleAngleFor('altimeter', spec, tooHigh)).toBeCloseTo(
      GAUGES.find((g) => g.id === 'altimeter')!.sweepRad,
      9,
    )
  })

  it('says so rather than printing a number when the state is degenerate', () => {
    const spec = loadAircraftSpec('f6f-hellcat')
    const bad = createState({ velocity: v3(NaN, 0, 0) })
    expect(readoutTextFor('airspeed', spec, bad)).toBe('--')
  })
})
