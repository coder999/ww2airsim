import { v3, length, dot, normalize } from '../sim/math/vec3.js'
import { qFromAxisAngle, qRotate } from '../sim/math/quat.js'
import { airspeed } from '../sim/flight/model.js'
import { createState, type AircraftState } from '../sim/flight/state.js'
import type { AircraftSpec } from '../sim/flight/schema.js'

/**
 * Instruments fitted to the panel.
 *
 * Every one of these is backed by a quantity the flight model actually
 * produces. Deliberately absent: tachometer, manifold pressure, oil and
 * cylinder-head temperatures -- Plan 1's model has no engine RPM or thermal
 * state, and a needle driven by `throttle * 2700` would be a lie rendered at
 * 60 fps. This project treats a false claim in a comment as a defect; a gauge
 * is a louder claim than a comment. Each goes in when a plan models it.
 */
export type GaugeId =
  | 'airspeed'
  | 'altimeter'
  | 'verticalSpeed'
  | 'heading'
  | 'fuel'
  | 'slip'

export type GaugeSpec = {
  readonly id: GaugeId
  readonly label: string
  readonly unit: string
  /** Dial ends, in the gauge's own unit. */
  readonly min: number
  readonly max: number
  /** Needle sweep, radians, from `min` to `max`. */
  readonly sweepRad: number
  /** Spacing of labelled scale marks, in the gauge's own unit. */
  readonly majorStep: number
  /** Spacing of unlabelled scale marks. Must divide `majorStep`. */
  readonly minorStep: number
  /** Multiply the raw value by this to get the displayed number: the heading
   *  gauge holds radians and reads degrees, everything else reads as stored. */
  readonly displayScale: number
  /** Decimal places in the digital readout. */
  readonly decimals: number
  /** Wraps rather than clamping (a compass rose). */
  readonly circular: boolean
  readonly sampleLow: AircraftState
  readonly sampleHigh: AircraftState
}

const TWO_PI = Math.PI * 2

export const GAUGES: readonly GaugeSpec[] = [
  {
    id: 'airspeed', label: 'AIRSPEED', unit: 'm/s',
    min: 0, max: 250, sweepRad: (TWO_PI * 3) / 4, circular: false,
    majorStep: 50, minorStep: 10, displayScale: 1, decimals: 0,
    sampleLow: createState({ velocity: v3(20, 0, 0) }),
    sampleHigh: createState({ velocity: v3(200, 0, 0) }),
  },
  {
    id: 'altimeter', label: 'ALTITUDE', unit: 'm',
    min: 0, max: 10_000, sweepRad: (TWO_PI * 3) / 4, circular: false,
    majorStep: 2000, minorStep: 500, displayScale: 1, decimals: 0,
    sampleLow: createState({ position: v3(0, 100, 0) }),
    sampleHigh: createState({ position: v3(0, 8000, 0) }),
  },
  {
    id: 'verticalSpeed', label: 'CLIMB', unit: 'm/s',
    min: -25, max: 25, sweepRad: (TWO_PI * 3) / 4, circular: false,
    majorStep: 10, minorStep: 5, displayScale: 1, decimals: 1,
    sampleLow: createState({ velocity: v3(100, -20, 0) }),
    sampleHigh: createState({ velocity: v3(100, 20, 0) }),
  },
  {
    id: 'heading', label: 'HEADING', unit: 'deg',
    min: 0, max: TWO_PI, sweepRad: TWO_PI, circular: true,
    majorStep: Math.PI / 2, minorStep: Math.PI / 6, displayScale: 180 / Math.PI, decimals: 0,
    // Heading reads attitude, not velocity. A velocity-only sample here left
    // both ends at 0 and the monotonic test comparing 0 > 0.
    sampleLow: createState({ attitude: qFromAxisAngle(v3(0, 1, 0), -0.2) }),
    sampleHigh: createState({ attitude: qFromAxisAngle(v3(0, 1, 0), -Math.PI / 2) }),
  },
  {
    id: 'fuel', label: 'FUEL', unit: 'kg',
    min: 0, max: 700, sweepRad: (TWO_PI * 3) / 4, circular: false,
    majorStep: 100, minorStep: 50, displayScale: 1, decimals: 0,
    sampleLow: createState({ fuelKg: 50 }),
    sampleHigh: createState({ fuelKg: 650 }),
  },
  {
    id: 'slip', label: 'SLIP', unit: '',
    min: -0.5, max: 0.5, sweepRad: Math.PI / 2, circular: false,
    majorStep: 0.25, minorStep: 0.125, displayScale: 1, decimals: 2,
    sampleLow: createState({ velocity: v3(100, 0, -20) }),
    sampleHigh: createState({ velocity: v3(100, 0, 20) }),
  },
]

const byId = new Map(GAUGES.map((g) => [g.id, g]))

/** Pitch and roll as a human reads them off an attitude indicator. */
export function attitudeAngles(state: AircraftState): {
  readonly pitchRad: number
  readonly rollRad: number
} {
  const fwd = qRotate(state.attitude, v3(1, 0, 0))
  const up = qRotate(state.attitude, v3(0, 1, 0))
  const pitchRad = Math.asin(Math.max(-1, Math.min(1, fwd.y)))
  // Roll from where body-up sits relative to world-up, about the nose.
  const rollRad = Math.atan2(up.z, up.y)
  return { pitchRad, rollRad }
}

export function gaugeValue(id: GaugeId, _spec: AircraftSpec, state: AircraftState): number {
  switch (id) {
    case 'airspeed':
      return airspeed(state)
    case 'altimeter':
      return state.position.y
    case 'verticalSpeed':
      return state.velocity.y
    case 'fuel':
      return state.fuelKg
    case 'heading': {
      // Compass convention: clockwise seen from above, so a RIGHT turn increases
      // it. Body +Z is right, so the nose swinging toward +Z must read as an
      // increasing heading -- hence atan2(+z, x). A first draft had the sign
      // reversed and read backwards; the test pins it with exact values.
      const fwd = qRotate(state.attitude, v3(1, 0, 0))
      const h = Math.atan2(fwd.z, fwd.x)
      return h < 0 ? h + TWO_PI : h
    }
    case 'slip': {
      const v = length(state.velocity)
      if (v < 1e-6) return 0
      const vn = normalize(state.velocity)
      // Sideways component of the airflow in body frame: the ball's deflection.
      return dot(vn, qRotate(state.attitude, v3(0, 0, 1)))
    }
  }
}

/**
 * Needle angle, radians, clockwise from the dial's zero.
 *
 * Non-circular gauges CLAMP past their ends rather than wrapping. A needle
 * that wraps shows a plausible small value at exactly the moment the pilot
 * most needs to see a pegged one.
 *
 * The `circular` branch below is genuinely dead-by-divergence today, not
 * dead-by-absence: `heading` is the only circular gauge, and `gaugeValue`'s
 * heading case already normalises into `[0, 2*pi)` before this function ever
 * sees the value, so on every input this branch can currently receive, the
 * modulo-wrap here and the clamp path below it agree exactly -- verified by
 * forcing `heading`'s `GaugeSpec.circular` to `false` and finding all tests
 * still pass. It becomes load-bearing the moment either changes: a second
 * circular gauge, or a heading/angle producer that does not pre-normalise
 * (e.g. a raw, unwrapped multi-turn yaw accumulator).
 */
export function needleAngleFor(
  id: GaugeId,
  spec: AircraftSpec,
  state: AircraftState,
): number {
  const g = byId.get(id)
  if (!g) throw new Error(`Unknown gauge: ${id}`)

  const value = gaugeValue(id, spec, state)
  if (!Number.isFinite(value)) return 0

  return angleForValue(g, value)
}

/**
 * Where a value sits on a dial, radians clockwise from the dial's zero.
 *
 * Split out of `needleAngleFor` so the SCALE MARKS and the NEEDLE cannot
 * disagree (whole-branch review, I-2). Two functions computing the same
 * mapping separately is how a needle ends up pointing between the marks it is
 * supposed to line up with, and it is the kind of error that is obvious in a
 * screenshot and invisible in a unit test written against either half alone.
 */
export function angleForValue(g: GaugeSpec, value: number): number {
  if (g.circular) return ((value % TWO_PI) + TWO_PI) % TWO_PI
  const t = (value - g.min) / (g.max - g.min)
  return (t < 0 ? 0 : t > 1 ? 1 : t) * g.sweepRad
}

export type TickMark = {
  /** The value this mark stands for, in the gauge's own unit. */
  readonly value: number
  /** Radians clockwise from the dial's zero -- `angleForValue(g, value)`. */
  readonly angleRad: number
  /** Longer, and the only kind that carries a printed number. */
  readonly major: boolean
  /** The number printed beside a major mark; empty for a minor one. */
  readonly text: string
}

/**
 * The scale marks for a dial, minor and major, from `min` to `max`.
 *
 * Design spec section 7 asks for gauges that are "oversized, high-contrast,
 * clearly labelled". Until this, a dial was a dark disc with a needle and no
 * marks at all: `needleAngleFor` documented its output as "clockwise from the
 * dial's zero", and the dial had no zero -- six identical faces with six
 * indistinguishable pointers (whole-branch review, I-2).
 *
 * A circular gauge stops one step short of `max`, because 0 and 2*pi are the
 * same mark on a compass rose and drawing both leaves a doubled tick at north.
 */
export function tickMarksFor(g: GaugeSpec): readonly TickMark[] {
  const marks: TickMark[] = []
  const steps = Math.round((g.max - g.min) / g.minorStep)
  const last = g.circular ? steps - 1 : steps
  for (let i = 0; i <= last; i++) {
    const value = g.min + i * g.minorStep
    // Integer arithmetic on the step index, not a float modulo of the value:
    // 0.125 * 2 === 0.25 exactly, but a `value % majorStep` test on the slip
    // gauge is one representation error away from dropping a major mark.
    const perMajor = Math.round(g.majorStep / g.minorStep)
    const major = i % perMajor === 0
    marks.push({
      value,
      angleRad: angleForValue(g, value),
      major,
      text: major ? formatDisplay(g, value) : '',
    })
  }
  return marks
}

/** The value as it is printed: scaled into the display unit and rounded. */
function formatDisplay(g: GaugeSpec, value: number): string {
  const n = value * g.displayScale
  // `Math.abs` and the `n < 0` test below both treat -0 as zero, so a climb
  // gauge sitting exactly level reads "+0.0" and never flickers to "-0.0".
  // An explicit Object.is(-0) guard was written here first and removed: a
  // mutation check found it changed no output, i.e. it was dead. The test
  // that pins the behaviour stays.
  const body = Math.abs(n).toFixed(g.decimals)
  // A compass reads 005, not 5 -- three digits is the convention, and a
  // varying width makes a heading unreadable at a glance while turning.
  if (g.circular) return body.padStart(g.decimals > 0 ? g.decimals + 4 : 3, '0')
  const sign = g.min < 0 ? (n < 0 ? '-' : '+') : n < 0 ? '-' : ''
  return sign + body
}

/** The name printed under a dial, with its unit where it has one. */
export function labelTextFor(g: GaugeSpec): string {
  return g.unit ? `${g.label}  ${g.unit}` : g.label
}

/**
 * The digital readout inside a dial.
 *
 * Design spec section 7: "digital readouts alongside needles where that
 * helps". It helps most for altitude and heading, where reading a needle to
 * better than a few hundred metres or a few degrees is exactly what the
 * oversized-dial trade gave up.
 *
 * Clamped to the dial's ends for a non-circular gauge, matching the needle:
 * a readout that keeps counting while the needle is pegged tells the pilot
 * the instrument is fine when it is off its scale.
 */
export function readoutTextFor(id: GaugeId, spec: AircraftSpec, state: AircraftState): string {
  const g = byId.get(id)
  if (!g) throw new Error(`Unknown gauge: ${id}`)
  const raw = gaugeValue(id, spec, state)
  if (!Number.isFinite(raw)) return '--'
  const value = g.circular ? raw : Math.min(g.max, Math.max(g.min, raw))
  return formatDisplay(g, value)
}
