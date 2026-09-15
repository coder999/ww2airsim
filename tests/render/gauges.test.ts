import { describe, it, expect } from 'vitest'
import {
  gaugeValue,
  needleAngleFor,
  attitudeAngles,
  angleForValue,
  fractionForValue,
  tickMarksFor,
  labelTextFor,
  readoutTextFor,
  tapeOffsetFor,
  GAUGES,
  type DialSpec,
  type TapeSpec,
} from '../../src/render/gauges.js'
import { createState, type Controls } from '../../src/sim/flight/state.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { qFromAxisAngle, qIdentity, qMul } from '../../src/sim/math/quat.js'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { GAUGE_SAMPLES } from './gaugeSamples.js'

const f6f = loadAircraftSpec('f6f-hellcat')
// `gaugeValue`/`readoutTextFor` require `controls` (controller ruling R3,
// 2026-09-15): every gauge below except the dedicated throttle tests reads
// only `state`, so this fixture is what they pass.
const NEUTRAL_CONTROLS: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0 }

describe('the heading tape (2026-09-15)', () => {
  const tape = () => GAUGES.find((g) => g.id === 'heading') as TapeSpec

  it('centres the current heading under the index', () => {
    expect(tapeOffsetFor(tape(), 0)).toBeCloseTo(0, 9)
    expect(tapeOffsetFor(tape(), 90)).toBeCloseTo(90 / 360, 9)
  })

  it('wraps through north without a jump', () => {
    // 359 -> 001 is two degrees of travel, not 358. A tape that fails this
    // whips the whole rose across the screen once per circuit.
    const step = tapeOffsetFor(tape(), 1) - tapeOffsetFor(tape(), 359)
    expect(Math.abs(((step % 1) + 1.5) % 1 - 0.5)).toBeCloseTo(2 / 360, 6)
  })

  it('shows a 90 degree window', () => {
    expect(tape().windowSpan).toBe(90)
  })

  it('does not double the mark at the seam, the same hazard tickMarksFor already names for a circular dial', () => {
    // Review round 1, Finding 1 (Important): `tickMarksFor`'s wrap-dedup
    // short-circuit was `g.circular && g.kind === 'dial'`, so a tape (which
    // has no `circular` field to be true) kept BOTH the 0 and 360 marks.
    // Copied three times for the panel's slide, that put a tick AND a
    // numeral at the exact same seam position twice over -- z-fighting ticks
    // and two identical "000" plates blended on top of each other.
    const marks = tickMarksFor(tape())
    const fractions = marks.map((m) => m.fraction)
    expect(fractions).toContain(0)
    expect(fractions).not.toContain(1)
    expect(new Set(fractions.map((f) => f.toFixed(9))).size).toBe(fractions.length)
  })
})

describe('gaugeValue', () => {
  it('reads airspeed from velocity magnitude', () => {
    const s = createState({ velocity: v3(100, 0, 0) })
    // In mph since 2026-09-15 -- `gaugeValue` returns the DIAL's unit, not
    // the simulation's. The conversion itself is pinned in the imperial
    // block below; what this asserts is where the quantity comes from.
    expect(gaugeValue('airspeed', f6f, s, NEUTRAL_CONTROLS)).toBeCloseTo(100 / 0.44704, 9)
  })

  it('reads altitude from position.y and vertical speed from velocity.y', () => {
    const s = createState({ position: v3(0, 1234, 0), velocity: v3(100, -7.5, 0) })
    expect(gaugeValue('altimeter', f6f, s, NEUTRAL_CONTROLS)).toBeCloseTo(1234 / 0.3048, 9)
    expect(gaugeValue('verticalSpeed', f6f, s, NEUTRAL_CONTROLS)).toBeCloseTo((-7.5 / 0.3048) * 60, 9)
  })

  it('reads fuel, which the model genuinely burns', () => {
    expect(gaugeValue('fuel', f6f, createState({ fuelKg: 300 }), NEUTRAL_CONTROLS)).toBeCloseTo(300 / (6 * 0.45359237), 9)
  })

  it('reports heading in [0, 360) degrees and increases it turning right', () => {
    const north = createState({ velocity: v3(100, 0, 0) })
    expect(gaugeValue('heading', f6f, north, NEUTRAL_CONTROLS)).toBeCloseTo(0, 9)
    // A NEGATIVE rotation about body +Y swings the nose toward +Z, which is
    // right (see the sign note on Controls.yaw in state.ts). A compass reads
    // that as an increasing heading. Exact values, not not-equal: a
    // not-equal assertion here once let the gauge read backwards.
    const right = createState({ attitude: qFromAxisAngle(v3(0, 1, 0), -0.3) })
    const deg = (rad: number) => (rad * 180) / Math.PI
    expect(gaugeValue('heading', f6f, right, NEUTRAL_CONTROLS)).toBeCloseTo(deg(0.3), 6)
    const hardRight = createState({ attitude: qFromAxisAngle(v3(0, 1, 0), -Math.PI / 2) })
    expect(gaugeValue('heading', f6f, hardRight, NEUTRAL_CONTROLS)).toBeCloseTo(90, 6)
    const left = createState({ attitude: qFromAxisAngle(v3(0, 1, 0), 0.3) })
    expect(gaugeValue('heading', f6f, left, NEUTRAL_CONTROLS)).toBeCloseTo(360 - deg(0.3), 6)
  })

  it('reads zero slip in coordinated flight and non-zero in a skid', () => {
    const straight = createState({ velocity: v3(100, 0, 0) })
    expect(Math.abs(gaugeValue('slip', f6f, straight, NEUTRAL_CONTROLS))).toBeLessThan(1e-9)
    const skidding = createState({ velocity: v3(100, 0, 20) })
    expect(Math.abs(gaugeValue('slip', f6f, skidding, NEUTRAL_CONTROLS))).toBeGreaterThan(0.1)
  })
})

describe('needleAngleFor', () => {
  it('is monotonic across each dial range', () => {
    // Dial-only: needleAngleFor throws for a column or a tape.
    for (const g of GAUGES) {
      if (g.kind !== 'dial') continue
      const lo = needleAngleFor(g.id, f6f, GAUGE_SAMPLES[g.id].low)
      const hi = needleAngleFor(g.id, f6f, GAUGE_SAMPLES[g.id].high)
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
    for (const g of GAUGES) {
      if (g.kind !== 'dial') continue
      expect(Number.isFinite(needleAngleFor(g.id, f6f, still))).toBe(true)
    }
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

})

describe('gaugeValue at the heading seam', () => {
  it('reads headings across the 0/360 seam as adjacent, not pegged at either end', () => {
    // Moved out of the `needleAngleFor` describe block on 2026-09-15: heading
    // became a tape (controller ruling R1) and has no needle any more, so
    // this now pins `gaugeValue`'s own `h < 0 ? h + TWO_PI : h`
    // normalisation directly rather than through `needleAngleFor`. A turn
    // that swings just past due north to the left reads as just under 360,
    // not as a value clamped down to 0 (wrong direction) or up to some
    // pegged maximum (wrong instrument entirely -- a compass has no "off the
    // end of the dial"). Picked deliberately close to the seam (0.02 rad,
    // about 1 degree) rather than the 0.3 rad already used elsewhere, so a
    // clamp-shaped bug that only misbehaves very close to the boundary would
    // still be caught here.
    const justLeftOfNorth = createState({ attitude: qFromAxisAngle(v3(0, 1, 0), 0.02) })
    const justRightOfNorth = createState({ attitude: qFromAxisAngle(v3(0, 1, 0), -0.02) })
    const left = gaugeValue('heading', f6f, justLeftOfNorth, NEUTRAL_CONTROLS)
    const right = gaugeValue('heading', f6f, justRightOfNorth, NEUTRAL_CONTROLS)
    const deg = (rad: number) => (rad * 180) / Math.PI
    expect(left).toBeCloseTo(360 - deg(0.02), 6)
    expect(right).toBeCloseTo(deg(0.02), 6)
    // The two readings sit on opposite numeric ends of the gauge's scale yet
    // are one degree apart on the actual compass rose -- exactly the case a
    // pegged (non-wrapping) reading would get wrong by reading nearly a full
    // turn apart instead of adjacent.
    expect(Math.abs((left - right + 180) % 360 - 180)).toBeLessThan(3)
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
    //
    // Dial-only since 2026-09-15: `angleRad` is meaningless for a column or a
    // tape (`tickMarksFor` sets it to 0 for those kinds), and `angleForValue`
    // is typed to `DialSpec` accordingly.
    for (const g of GAUGES) {
      if (g.kind !== 'dial') continue
      for (const mark of tickMarksFor(g)) {
        expect(angleForValue(g, mark.value)).toBeCloseTo(mark.angleRad, 12)
      }
    }
  })

  it('gives every gauge marks at both ends of its scale', () => {
    for (const g of GAUGES) {
      const marks = tickMarksFor(g)
      expect(marks.length).toBeGreaterThan(4)
      // Every dial has a labelled mark somewhere between its two ends; the
      // throttle column is deliberately the exception (2026-09-15), numbered
      // "only at the ends, like the reference" -- gauges.test.ts's own
      // throttle describe block pins exactly two majors for it.
      const minMajors = g.id === 'throttle' ? 2 : 3
      expect(marks.filter((m) => m.major).length).toBeGreaterThanOrEqual(minMajors)
      expect(marks[0]!.value).toBeCloseTo(g.min, 9)
      // A tape wraps too, since review round 1 (Finding 1): `min` and `max`
      // are the same seam mark on a tape's full turn, just as they are on a
      // circular dial, so `tickMarksFor` now drops the top one for both.
      const wraps = g.kind === 'tape' || (g.kind === 'dial' && g.circular)
      if (!wraps) expect(marks[marks.length - 1]!.value).toBeCloseTo(g.max, 9)
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
    // Coarsened from a 0.25 step on 2026-09-13: five printed numbers over a
    // 90-degree sweep collided on screen. The float hazard this test exists
    // for is unchanged -- 0.5 is still four 0.125 minor steps, so the index
    // arithmetic still has to be exact.
    expect(majors).toEqual([-0.5, 0, 0.5])
    expect(tickMarksFor(slip).length).toBe(9)
  })

  it('does not draw north twice on a circular dial', () => {
    // 0 and 2*pi are the same mark. Drawing both leaves a doubled tick and a
    // doubled number at north.
    //
    // No gauge in the table is a circular dial today -- `heading` moved to a
    // tape on 2026-09-15 (controller ruling R1), which has no needle and no
    // seam to double at, so `tickMarksFor` sets its `angleRad` to 0 for every
    // mark. The short-stop this pins is still live code (guarded by
    // `g.kind === 'dial' && g.circular` in `tickMarksFor`), so it is tested
    // against a synthetic dial rather than deleted with the last real one.
    const compass: DialSpec = {
      id: 'heading', label: 'HEADING', unit: 'deg', kind: 'dial',
      min: 0, max: 360, sweepRad: Math.PI * 2, circular: true,
      majorStep: 90, minorStep: 30, fromSI: 1, decimals: 0,
    }
    const marks = tickMarksFor(compass)
    const angles = marks.map((m) => m.angleRad)
    expect(new Set(angles.map((a) => a.toFixed(9))).size).toBe(angles.length)
    expect(Math.max(...angles)).toBeLessThan(Math.PI * 2)
  })

  it('labels every dial with the name and unit that were being carried unused', () => {
    for (const g of GAUGES) {
      const text = labelTextFor(g)
      // `toBe`, not `toContain`: the old form compared labelTextFor's output
      // against the pieces it is built from, so it could not fail for any
      // implementation that concatenated them in any order with any
      // separator (Plan 4 whole-branch review, minor 6).
      expect(text).toBe(g.unit ? `${g.label}  ${g.unit}` : g.label)
    }
  })

  it('reads out the quantity, converted into the unit the label promises', () => {
    const spec = loadAircraftSpec('f6f-hellcat')
    // Heading is stored in radians and labelled "deg", so the readout must
    // convert. A raw-radian readout under a "deg" label is the kind of false
    // claim this project treats as a defect.
    //
    // Zero-padded to three digits: F3, 2026-09-15 -- see "zero-pads the
    // heading readout..." below. This briefly regressed to a bare, unpadded
    // number when heading moved from a circular `DialSpec` to a `TapeSpec`
    // (R1), which dropped the field `formatDisplay` used to key the padding
    // off; restored here keyed on `kind === 'tape'` instead.
    const east = createState({ attitude: qFromAxisAngle(v3(0, 1, 0), -Math.PI / 2) })
    expect(readoutTextFor('heading', spec, east, NEUTRAL_CONTROLS)).toBe('090')
    const north = createState({ attitude: qIdentity() })
    expect(readoutTextFor('heading', spec, north, NEUTRAL_CONTROLS)).toBe('000')
    // 1234 m is 4048.6 ft and 512 kg of avgas is 188.1 US gal: the readout
    // converts, so neither prints the number the simulation stores.
    expect(readoutTextFor('altimeter', spec, createState({ position: v3(0, 1234, 0) }), NEUTRAL_CONTROLS)).toBe('4049')
    expect(readoutTextFor('fuel', spec, createState({ fuelKg: 512 }), NEUTRAL_CONTROLS)).toBe('188')
  })

  it('signs a readout that can go either way, and never prints minus zero', () => {
    const spec = loadAircraftSpec('f6f-hellcat')
    // 12.5 m/s is 2460.6 ft/min. A VSI reads whole feet per minute, so the
    // climb dial lost its decimal place when the units changed.
    expect(readoutTextFor('verticalSpeed', spec, createState({ velocity: v3(100, 12.5, 0) }), NEUTRAL_CONTROLS)).toBe('+2461')
    expect(readoutTextFor('verticalSpeed', spec, createState({ velocity: v3(100, -12.5, 0) }), NEUTRAL_CONTROLS)).toBe('-2461')
    // Level flight must read +0.0, not -0.0: a minus sign appearing and
    // vanishing at the top of a climb reads as a fault.
    expect(readoutTextFor('verticalSpeed', spec, createState({ velocity: v3(100, -0, 0) }), NEUTRAL_CONTROLS)).toBe('+0')
  })

  it('stops the readout where the needle stops, rather than counting past the peg', () => {
    // A readout that keeps counting while the needle is pegged tells the pilot
    // the instrument is fine when it is off its scale.
    const spec = loadAircraftSpec('f6f-hellcat')
    const tooHigh = createState({ position: v3(0, 99_000, 0) })
    expect(readoutTextFor('altimeter', spec, tooHigh, NEUTRAL_CONTROLS)).toBe('40000')
    const altimeter = GAUGES.find((g) => g.id === 'altimeter')!
    if (altimeter.kind !== 'dial') throw new Error('expected altimeter to stay a dial')
    expect(needleAngleFor('altimeter', spec, tooHigh)).toBeCloseTo(altimeter.sweepRad, 9)
  })

  it('says so rather than printing a number when the state is degenerate', () => {
    const spec = loadAircraftSpec('f6f-hellcat')
    const bad = createState({ velocity: v3(NaN, 0, 0) })
    expect(readoutTextFor('airspeed', spec, bad, NEUTRAL_CONTROLS)).toBe('--')
  })
})

describe('attitudeAngles bank reference frame', () => {
  const yaw = (d: number) => qFromAxisAngle(v3(0, 1, 0), (d * Math.PI) / 180)
  const pitchQ = (d: number) => qFromAxisAngle(v3(0, 0, 1), (d * Math.PI) / 180)
  const deg = (r: number) => (r * 180) / Math.PI

  it('reads zero bank whenever the wings are level, whatever the heading and pitch', () => {
    // The defect this replaced: `atan2(up.z, up.y)` is body-up's sideways
    // lean measured in the BODY frame, which is a bank angle only when the
    // aeroplane points along world +X. Pitch tilts body up out of vertical
    // and yaw swings that tilt into the lateral axis, so a wings-level
    // aeroplane read a bank set purely by its heading.
    for (const h of [0, 30, 45, 90, 135, 180, -60]) {
      for (const p of [0, 10, -15, 30]) {
        const state = createState({ attitude: qMul(yaw(h), pitchQ(p)) })
        expect(deg(attitudeAngles(state).rollRad)).toBeCloseTo(0, 9)
      }
    }
  })

  it('still reads the bank itself, on any heading', () => {
    // The other half: a fix that returns zero everywhere would pass the test
    // above and break the instrument completely.
    for (const h of [0, 45, 135]) {
      for (const bank of [30, -45]) {
        const q = qMul(yaw(h), qFromAxisAngle(v3(1, 0, 0), (bank * Math.PI) / 180))
        expect(deg(attitudeAngles(createState({ attitude: q })).rollRad)).toBeCloseTo(bank, 9)
      }
    }
  })

  it('reports pitch independently of heading', () => {
    for (const h of [0, 45, 90, 180]) {
      const state = createState({ attitude: qMul(yaw(h), pitchQ(12)) })
      expect(deg(attitudeAngles(state).pitchRad)).toBeCloseTo(12, 9)
    }
  })
})

describe('gauge scale integrity (review 2026-09-13)', () => {
  it('zero-pads the heading readout to three digits, restored for the tape (F3, 2026-09-15)', () => {
    // CARRIED FINDING F3: when `heading` moved from a circular `DialSpec` to
    // a `TapeSpec` (controller ruling R1), `readoutTextFor`'s zero-padding
    // went with the `circular` field it used to key off -- `TapeSpec` has no
    // such field. A compass reads "005", not "5": the tape ships its own
    // digital readout (Task 5), so the padding is restored here, driven off
    // `g.kind === 'tape'` rather than a resurrected `circular` field (which
    // would mean nothing for a tape -- it has no needle to wrap).
    const spec = loadAircraftSpec('f6f-hellcat')
    const at = (headingDeg: number) =>
      readoutTextFor(
        'heading',
        spec,
        createState({ attitude: qFromAxisAngle(v3(0, 1, 0), (-headingDeg * Math.PI) / 180) }),
        NEUTRAL_CONTROLS,
      )
    expect(at(0)).toBe('000')
    expect(at(90)).toBe('090')
    expect(at(359.4)).toBe('359')
  })

  it('rolls the heading readout through north instead of pegging at 360 (F3, 2026-09-15)', () => {
    // The other half of F3: `toFixed(0)` rounds 359.6 up to "360", which is
    // not a compass heading a rose ever prints, so the wrap has to happen
    // AFTER rounding -- exactly the `formatDisplay` fix a circular DialSpec
    // used to get, now restored for `kind === 'tape'`.
    const spec = loadAircraftSpec('f6f-hellcat')
    const at = (headingDeg: number) =>
      readoutTextFor(
        'heading',
        spec,
        createState({ attitude: qFromAxisAngle(v3(0, 1, 0), (-headingDeg * Math.PI) / 180) }),
        NEUTRAL_CONTROLS,
      )
    expect(at(359.6)).toBe('000')
  })

  it('pins every dial to its own sweep, not to one shared literal', () => {
    // Review 2026-09-13: giving every gauge the airspeed sweep left the whole
    // 335-test suite green. Only verticalSpeed's sweep was pinned against a
    // literal; the others were read out of the same field the implementation
    // reads, so a wrongly computed sweep was undetectable. The slip dial is
    // specified at a quarter turn and would have been drawn over three
    // quarters with nothing red.
    //
    // Scoped to `kind === 'dial'` since 2026-09-15: heading moved to a tape
    // (R1) and has no `sweepRad` to pin, and throttle (a column) never had
    // one.
    const expected: Record<string, number> = {
      airspeed: (Math.PI * 2 * 3) / 4,
      altimeter: (Math.PI * 2 * 3) / 4,
      verticalSpeed: (Math.PI * 2 * 3) / 4,
      fuel: (Math.PI * 2 * 3) / 4,
      slip: Math.PI / 2,
    }
    const dials = GAUGES.filter((g) => g.kind === 'dial')
    expect(Object.keys(expected).sort()).toEqual(dials.map((g) => g.id).sort())
    for (const g of dials) {
      expect(g.sweepRad).toBeCloseTo(expected[g.id]!, 12)
      expect(angleForValue(g, g.max)).toBeCloseTo(g.circular ? 0 : g.sweepRad, 9)
      expect(angleForValue(g, g.min)).toBeCloseTo(0, 9)
    }
  })

  it('actually points the NEEDLE at the mark, which the sibling test only appeared to', () => {
    // The test titled "puts the needle exactly on the mark" compares
    // `angleForValue` against `TickMark.angleRad`, which `tickMarksFor`
    // defines as that same call. Adding 0.3 rad to every needle left it
    // green. This one calls `needleAngleFor`, the function the panel uses.
    //
    // Dial-only: `needleAngleFor` throws for a column or a tape (neither has
    // a needle), so this is scoped the same way the panel itself is scoped
    // (panel.ts filters `GAUGES` to `kind === 'dial'` when it builds needles).
    const spec = loadAircraftSpec('f6f-hellcat')
    for (const g of GAUGES) {
      if (g.kind !== 'dial') continue
      for (const sample of [GAUGE_SAMPLES[g.id].low, GAUGE_SAMPLES[g.id].high]) {
        const value = gaugeValue(g.id, spec, sample, NEUTRAL_CONTROLS)
        expect(needleAngleFor(g.id, spec, sample)).toBeCloseTo(angleForValue(g, value), 12)
      }
    }
  })

  it('holds the step relations its own comments only assert in prose', () => {
    // `minorStep` carries "Must divide majorStep" as a comment, and
    // `tickMarksFor` also assumes the range is a whole number of minor steps.
    // Neither was validated or tested; a plausible boost gauge at 0..60 with
    // majorStep 10 and minorStep 4 would silently number its dial every 8 and
    // 12 units. Prefer an assertion to a sentence.
    for (const g of GAUGES) {
      expect(Number.isInteger(Math.round((g.max - g.min) / g.minorStep))).toBe(true)
      expect(Math.abs((g.max - g.min) / g.minorStep - Math.round((g.max - g.min) / g.minorStep))).toBeLessThan(1e-9)
      expect(Math.abs(g.majorStep / g.minorStep - Math.round(g.majorStep / g.minorStep))).toBeLessThan(1e-9)
    }
  })
})

describe('imperial instrumentation (2026-09-15)', () => {
  const spec = loadAircraftSpec('f6f-hellcat')

  // A WWII US aeroplane had no metric instruments, and the trial data this
  // model is graded against is itself imperial -- 391.0 mph, 2,660 ft/min,
  // 98.0 mph clean stall (content/aircraft/f6f-hellcat.json's `reference`).
  // These pin the CONVERSION, not the formatting: each expected value is the
  // SI quantity times an exact definitional factor, so a dial left in SI
  // fails, and so does one scaled by a plausible-but-wrong constant.

  it('reads airspeed in mph, not metres per second', () => {
    const s = createState({ velocity: v3(100, 0, 0) })
    // 1 m/s = 1/0.44704 mph exactly (the international mile is 1609.344 m).
    expect(gaugeValue('airspeed', f6f, s, NEUTRAL_CONTROLS)).toBeCloseTo(100 / 0.44704, 9)
  })

  it('reads altitude in feet', () => {
    const s = createState({ position: v3(0, 3000, 0) })
    // 1 ft = 0.3048 m exactly.
    expect(gaugeValue('altimeter', f6f, s, NEUTRAL_CONTROLS)).toBeCloseTo(3000 / 0.3048, 9)
  })

  it('reads climb in feet per minute, the unit a VSI is calibrated in', () => {
    const s = createState({ velocity: v3(100, 10, 0) })
    expect(gaugeValue('verticalSpeed', f6f, s, NEUTRAL_CONTROLS)).toBeCloseTo((10 / 0.3048) * 60, 9)
  })

  it('reads fuel in US gallons, and a full tank is the documented 250', () => {
    // The aircraft spec stores 681 kg. At avgas 100/130's standard planning
    // weight of 6.0 lb/US gal that is 250.2 gal -- and the F6F-5's documented
    // internal capacity is 250 US gallons, so the two agree to a rounding.
    // This is the one gauge whose conversion is a physical constant rather
    // than a definition, which is exactly why it is pinned here.
    const full = createState({ fuelKg: spec.mass.fuelCapacityKg })
    expect(gaugeValue('fuel', f6f, full, NEUTRAL_CONTROLS)).toBeCloseTo(681 / (6 * 0.45359237), 9)
    expect(readoutTextFor('fuel', spec, full, NEUTRAL_CONTROLS)).toBe('250')
  })

  it('labels the dials with imperial units', () => {
    const units = new Map(GAUGES.map((g) => [g.id, g.unit]))
    expect(units.get('airspeed')).toBe('mph')
    expect(units.get('altimeter')).toBe('ft')
    expect(units.get('verticalSpeed')).toBe('ft/min')
    expect(units.get('fuel')).toBe('US gal')
    // Unchanged: degrees are not a metric unit, and slip is a ratio.
    expect(units.get('heading')).toBe('deg')
    expect(units.get('slip')).toBe('')
  })

  it('numbers the major marks in round imperial values a pilot can read', () => {
    const numerals = (id: string) =>
      tickMarksFor(GAUGES.find((g) => g.id === id)!)
        .filter((m) => m.major)
        .map((m) => m.text)
    expect(numerals('airspeed')).toEqual(['0', '100', '200', '300', '400', '500'])
    expect(numerals('altimeter')).toEqual(['0', '10000', '20000', '30000', '40000'])
    expect(numerals('verticalSpeed')).toEqual(['-5000', '+0', '+5000'])
  })
})

const throttleSpec = () => {
  const g = GAUGES.find((x) => x.id === 'throttle')
  if (!g) throw new Error('no throttle gauge')
  return g
}

describe('the throttle column (2026-09-15)', () => {
  it('is a column, not a dial', () => {
    expect(throttleSpec().kind).toBe('column')
  })

  it('maps the control vector 0..1 onto 0..100 percent of the column', () => {
    const controls = (throttle: number) => ({ pitch: 0, roll: 0, yaw: 0, throttle })
    const level = createState({ position: v3(0, 1000, 0), velocity: v3(120, 0, 0) })
    expect(gaugeValue('throttle', f6f, level, controls(0))).toBeCloseTo(0, 9)
    expect(gaugeValue('throttle', f6f, level, controls(0.5))).toBeCloseTo(50, 9)
    expect(gaugeValue('throttle', f6f, level, controls(1))).toBeCloseTo(100, 9)
  })

  it('places its fill fraction linearly, clamped at both ends', () => {
    const g = throttleSpec()
    expect(fractionForValue(g, 0)).toBeCloseTo(0, 9)
    expect(fractionForValue(g, 50)).toBeCloseTo(0.5, 9)
    expect(fractionForValue(g, 100)).toBeCloseTo(1, 9)
    expect(fractionForValue(g, -10)).toBeCloseTo(0, 9)
    expect(fractionForValue(g, 250)).toBeCloseTo(1, 9)
  })

  it('carries nine tick marks, numbered only at the ends, like the reference', () => {
    const marks = tickMarksFor(throttleSpec())
    expect(marks).toHaveLength(9)
    expect(marks.filter((m) => m.major).map((m) => m.text)).toEqual(['0', '100'])
  })
})
