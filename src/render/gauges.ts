import { v3, length, dot, normalize, type Vec3 } from '../sim/math/vec3.js'
import { qRotate } from '../sim/math/quat.js'
import { airVelocity } from '../sim/flight/model.js'
import type { AircraftState, Controls } from '../sim/flight/state.js'
import type { AircraftSpec } from '../sim/flight/schema.js'

/**
 * The velocity of the air, or `null` for calm: `World.wind`, threaded down to
 * the one gauge that reads it (`airspeed`).
 *
 * DEFAULTED to `null` at every entry point below, which is the one place this
 * file departs from controller ruling R3's "required, so a caller cannot
 * forget to thread it" (see `gaugeValue`'s `controls`). The trade, made
 * deliberately 2026-09-19: a required parameter would touch 70-odd call sites
 * across four test files that have no wind and no opinion about one, and
 * `null` is the honest value for all of them -- every world's wind is `null`
 * until a scenario sets one. The residual risk is real and is the bug this
 * parameter fixes: a NEW consumer that forgets it reads ground speed again.
 * `src/render/main.ts` is the only production caller and passes
 * `current.world.wind` to both `updatePanel` and `flightData.update`;
 * `tests/render/gauges.test.ts` and `tests/render/cockpitFeedback.test.ts`
 * pin the wind case itself, but main.ts has no Tier 1 test (see `audio.ts`'s
 * header for why that gap exists), so the deck-quals Tier 2 test pins the displayed SPD in wind.
 * The panel test also pins its needle and numeric readout together.
 */
export type Wind = Vec3 | null

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
  | 'throttle'

/**
 * Which shape an instrument is drawn as.
 *
 * There is deliberately no `'ball'`: the attitude indicator is panel geometry
 * with a layout slot, driven by `attitudeAngles(state)` rather than a scalar
 * `gaugeValue`, and it has no `min`/`max`/step scale for `GaugeBase` to
 * describe. Built in `panel.ts`'s `createPanel`/`updatePanel` (Task 6,
 * 2026-09-15). Controller ruling R1, 2026-09-15.
 */
export type GaugeKind = 'dial' | 'column' | 'tape'

type GaugeBase = {
  /** False for diagnostic quantities that do not need a cockpit instrument. */
  readonly cockpit?: boolean
  readonly id: GaugeId
  readonly label: string
  readonly unit: string
  /** Scale ends, in the gauge's own unit. */
  readonly min: number
  readonly max: number
  /**
   * Spacing of labelled scale marks, in the gauge's own unit.
   *
   * Coarsened for the climb, fuel and slip dials on 2026-09-13 after Mark flew
   * it: printed numerals need arc room, and at the old spacing the fuel dial's
   * eight majors and the slip dial's five ran into each other on screen. Slip
   * was the worst at 22.5 degrees apart, where the numeral plate is more than
   * twice the available arc. Climb also gains a major mark AT ZERO, which the
   * old 10-unit step could not produce from a -25 minimum.
   */
  readonly majorStep: number
  /** Spacing of unlabelled scale marks. Must divide `majorStep`. */
  readonly minorStep: number
  /**
   * Multiply the SIMULATION's SI quantity by this to get the gauge's own unit.
   *
   * Applied once, in `gaugeValue`, so everything downstream -- `min`, `max`,
   * both step sizes, the needle, the marks and the readout -- is already in
   * the unit the label promises. The alternative, keeping the table in SI and
   * scaling only at print time, was what this file did until 2026-09-15: it
   * would have put `majorStep: 1524` in the altimeter to get a 5,000 ft
   * numeral, which is a constant nobody can check by reading.
   *
   * `sim/` stays SI throughout and is untouched by this -- the golden
   * trajectory, the Patuxent test cards and every determinism guarantee are
   * built on those units. This is a display conversion and nothing more.
   */
  readonly fromSI: number
  /** Decimal places in the digital readout. */
  readonly decimals: number
}

/** A round dial with a needle. `sweepRad` and `circular` mean nothing to the
 *  other kinds, which is the whole reason this is a union. */
export type DialSpec = GaugeBase & {
  readonly kind: 'dial'
  /** Needle sweep, radians, from `min` to `max`. */
  readonly sweepRad: number
  /** Wraps rather than clamping (a compass rose). */
  readonly circular: boolean
}
/** A vertical bar that fills from the bottom. */
export type ColumnSpec = GaugeBase & { readonly kind: 'column' }
/** A sliding strip showing `windowSpan` of the scale either side of the index. */
export type TapeSpec = GaugeBase & { readonly kind: 'tape'; readonly windowSpan: number }

export type GaugeSpec = DialSpec | ColumnSpec | TapeSpec

/**
 * A control vector with no input held.
 *
 * Private -- not a default for any exported function (controller ruling R3:
 * `controls` is required everywhere a caller could plausibly need to supply
 * a real one). This exists only for `needleAngleFor`, which is dial-only by
 * construction (it throws for anything else) and so can NEVER reach the one
 * gauge, `throttle`, that reads `controls` at all: passing a fixed vector
 * through `gaugeValue` there is not a silent default, it is dead code
 * documenting that the value truly cannot matter.
 */
const NEUTRAL_CONTROLS: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0 }

const TWO_PI = Math.PI * 2

export const GAUGES: readonly GaugeSpec[] = [
  {
    id: 'airspeed', label: 'AIRSPEED', unit: 'mph', kind: 'dial',
    min: 0, max: 500, sweepRad: (TWO_PI * 3) / 4, circular: false,
    majorStep: 100, minorStep: 25, fromSI: 1 / 0.44704, decimals: 0,
  },
  {
    id: 'altimeter', label: 'ALTITUDE', unit: 'ft', kind: 'dial',
    min: 0, max: 40_000, sweepRad: (TWO_PI * 3) / 4, circular: false,
    majorStep: 10_000, minorStep: 2000, fromSI: 1 / 0.3048, decimals: 0,
  },
  {
    id: 'verticalSpeed', label: 'CLIMB', unit: 'ft/min', kind: 'dial',
    min: -5000, max: 5000, sweepRad: (TWO_PI * 3) / 4, circular: false,
    majorStep: 5000, minorStep: 1000, fromSI: 60 / 0.3048, decimals: 0,
  },
  // Converted from a circular dial to a tape here -- the only place either
  // happens (controller ruling R1, 2026-09-15). `sweepRad` and `circular`
  // are gone; `fractionForValue` is the replacement for placement, and
  // `windowSpan` sets the angular range of the sliding strip.
  {
    id: 'heading', label: 'HEADING', unit: 'deg', kind: 'tape',
    min: 0, max: 360, windowSpan: 90,
    majorStep: 30, minorStep: 10, fromSI: 180 / Math.PI, decimals: 0,
  },
  {
    id: 'fuel', label: 'FUEL', unit: 'US gal', kind: 'column',
    min: 0, max: 250,
    majorStep: 125, minorStep: 62.5, fromSI: 1 / (6 * 0.45359237), decimals: 0,
  },
  {
    id: 'slip', label: 'SLIP', unit: '', kind: 'dial', cockpit: false,
    min: -0.5, max: 0.5, sweepRad: Math.PI / 2, circular: false,
    majorStep: 0.5, minorStep: 0.125, fromSI: 1, decimals: 2,
  },
  // Appended here, per R1 -- the table is finalised in this task, not spread
  // across later ones.
  {
    id: 'throttle', label: 'THROTTLE', unit: '%', kind: 'column',
    min: 0, max: 100, majorStep: 100, minorStep: 12.5,
    fromSI: 100, decimals: 0,
  },
]

const byId = new Map(GAUGES.map((g) => [g.id, g]))

export const COCKPIT_GAUGES = GAUGES.filter(g => g.cockpit !== false)

/** Fuel bar reads actual tank capacity, not the rounded gallon dial scale. */
export const fuelFraction = (spec: AircraftSpec, state: AircraftState): number =>
  Math.max(0, Math.min(1, state.fuelKg / spec.mass.fuelCapacityKg))

// Moved to sim/ in Plan 10 so `src/sim/contact.ts` can reach it; re-exported
// here because panel.ts, flightData.ts and tests/render/gauges.test.ts all
// import it from this module, and the move should be invisible to them.
export { attitudeAngles } from '../sim/flight/attitude.js'

/**
 * `controls` is required, even though every gauge except `throttle` reads
 * the flight model's `state` alone. Controller ruling R3, 2026-09-15: a
 * defaulted control vector would let a call site forget to thread it and get
 * a plausible-looking "0% throttle" instead of a compile error -- the same
 * wired-vs-unwired failure mode `tests/render/frameAssists.test.ts` exists to
 * catch. Callers that genuinely have no input to report pass the shared
 * `NEUTRAL_CONTROLS` fixture explicitly (tests/render/panel.test.ts).
 */
export function gaugeValue(
  id: GaugeId,
  spec: AircraftSpec,
  state: AircraftState,
  controls: Controls,
  wind: Wind = null,
): number {
  const g = byId.get(id)
  if (!g) throw new Error(`Unknown gauge: ${id}`)
  return siValueFor(id, spec, state, controls, wind) * g.fromSI
}

/** The quantity the SIMULATION holds, in SI, before the dial's unit is applied. */
function siValueFor(id: GaugeId, _spec: AircraftSpec, state: AircraftState, controls: Controls, wind: Wind): number {
  switch (id) {
    case 'airspeed':
      // AIRSPEED, which is what the pitot tube in the wing measures and the
      // only speed a pilot flies an approach on -- not the ground speed this
      // read until the Plan 8 review (2026-09-19). Measured on the deck-quals
      // scenario: a Hellcat chocked on a carrier steaming at 7.717 m/s into a
      // 7.717 m/s headwind showed 17 mph while it genuinely had 34.5 mph of
      // air over the wings. `airVelocity` and NOT an air-relative state
      // substituted for `state` throughout: the altimeter and the vertical
      // speed are world-frame facts that the airmass must not shift, and
      // `verticalSpeed` reading `air.velocity.y` would ride along with any
      // later vertical wind component.
      return length(airVelocity(state, wind))
    case 'altimeter':
      return state.position.y
    case 'verticalSpeed':
      return state.velocity.y
    case 'fuel':
      return state.fuelKg
    // Throttle lives in Controls, not AircraftState (state.ts:8) -- it is a
    // pilot input, not something the flight model produces.
    case 'throttle':
      return controls.throttle
    case 'heading': {
      // Geographic compass: north (-Z) is 000, east (+X) is 090.
      // Body +Z is right; right turns increase this clockwise bearing.
      const fwd = qRotate(state.attitude, v3(1, 0, 0))
      const h = Math.atan2(fwd.x, -fwd.z)
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
  wind: Wind = null,
): number {
  const g = byId.get(id)
  if (!g) throw new Error(`Unknown gauge: ${id}`)
  // Dial-only: a column or a tape has no needle for this to be the angle of.
  // The panel only ever calls this for a gauge it has built a needle for
  // (panel.ts filters `GAUGES` to `kind === 'dial'`), so reaching here for
  // another kind is a caller bug, not a value to degrade gracefully for.
  if (g.kind !== 'dial') throw new Error(`needleAngleFor is dial-only, not for '${g.kind}': ${id}`)

  // NEUTRAL_CONTROLS, not a real vector: `g.kind === 'dial'` above rules out
  // `throttle`, the only gauge `gaugeValue` reads `controls` for, so nothing
  // here can ever be sensitive to which vector is passed.
  const value = gaugeValue(id, spec, state, NEUTRAL_CONTROLS, wind)
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
export function angleForValue(g: DialSpec, value: number): number {
  // One mapping for both kinds of dial. The circular branch used to be
  // `value % TWO_PI`, which silently assumed the compass stored RADIANS --
  // true until 2026-09-15, when the table moved into display units and
  // heading became degrees. Expressed as a fraction of the dial's own span
  // it no longer cares what unit that span is in.
  const t = (value - g.min) / (g.max - g.min)
  if (g.circular) return (((t % 1) + 1) % 1) * g.sweepRad
  return (t < 0 ? 0 : t > 1 ? 1 : t) * g.sweepRad
}

/**
 * Where `value` sits along the gauge's span, 0..1.
 *
 * The linear equivalent of `angleForValue`, and the one every kind can use --
 * a column's fill height and a tape's index position are both fractions of a
 * span, not angles. Clamped for a linear gauge; wrapped for a circular dial,
 * exactly as `angleForValue` does.
 */
export function fractionForValue(g: GaugeSpec, value: number): number {
  const t = (value - g.min) / (g.max - g.min)
  if (g.kind === 'dial' && g.circular) return (((t % 1) + 1) % 1)
  return t < 0 ? 0 : t > 1 ? 1 : t
}

/** How far to slide the rose, in fractions of the full 360. Wrapped, so the
 *  strip never travels the long way round. */
export function tapeOffsetFor(g: TapeSpec, headingDeg: number): number {
  return fractionForValue(g, ((headingDeg % 360) + 360) % 360)
}

export type TickMark = {
  /** The value this mark stands for, in the gauge's own unit. */
  readonly value: number
  /** Radians clockwise from the dial's zero -- `angleForValue(g, value)`.
   *  Zero for a non-dial gauge, which has no needle to angle. */
  readonly angleRad: number
  /** Where the mark sits along the gauge's span, 0..1 -- `fractionForValue(g,
   *  value)`. Meaningful for every kind, unlike `angleRad`. */
  readonly fraction: number
  /** Longer, and the only kind that carries a printed number. */
  readonly major: boolean
  /** The number printed beside a major mark; empty for a minor one. */
  readonly text: string
}

/**
 * The scale marks for a gauge, minor and major, from `min` to `max`.
 *
 * Design spec section 7 asks for gauges that are "oversized, high-contrast,
 * clearly labelled". Until this, a dial was a dark disc with a needle and no
 * marks at all: `needleAngleFor` documented its output as "clockwise from the
 * dial's zero", and the dial had no zero -- six identical faces with six
 * indistinguishable pointers (whole-branch review, I-2).
 *
 * A gauge that WRAPS stops one step short of `max`, because `min` and `max`
 * are the same mark on a full turn and drawing both leaves a doubled mark at
 * the seam. Review round 1 (2026-09-15), Finding 1: this used to be
 * `g.kind === 'dial' && g.circular` only, so when `heading` moved to a
 * `TapeSpec` (which has no `circular` field) it kept BOTH ends -- the tape's
 * panel rendering then copies these marks three times to slide seamlessly
 * (`panel.ts`), which put a tick AND a numeral at the exact same seam
 * position twice over. Driven off `wrapsAndPads`, the same KIND-based test
 * `formatDisplay`/`readoutTextFor` use for the readout's own wrap (F3) --
 * one decision, not two copies that can drift apart again.
 */
export function tickMarksFor(g: GaugeSpec): readonly TickMark[] {
  const marks: TickMark[] = []
  const steps = Math.round((g.max - g.min) / g.minorStep)
  const wraps = wrapsAndPads(g)
  const last = wraps ? steps - 1 : steps
  for (let i = 0; i <= last; i++) {
    const value = g.min + i * g.minorStep
    // Integer arithmetic on the step index, not a float modulo of the value:
    // 0.125 * 2 === 0.25 exactly, but a `value % majorStep` test on the slip
    // gauge is one representation error away from dropping a major mark.
    const perMajor = Math.round(g.majorStep / g.minorStep)
    const major = i % perMajor === 0
    marks.push({
      value,
      angleRad: g.kind === 'dial' ? angleForValue(g, value) : 0,
      fraction: fractionForValue(g, value),
      major,
      text: major ? formatDisplay(g, value) : '',
    })
  }
  return marks
}

/**
 * Whether a gauge's printed value should WRAP into `[min, max)` rather than
 * clamp, and zero-pad to a fixed width -- the compass convention ("005", not
 * "5"), and a 359 -> 000 roll rather than sticking at 360.
 *
 * Driven off the gauge's KIND, not a resurrected `circular` field on
 * `TapeSpec`. CARRIED FINDING F3, 2026-09-15: when `heading` moved from a
 * circular `DialSpec` to a `TapeSpec` (controller ruling R1), both
 * behaviours went with the `circular` field they used to key off --
 * `TapeSpec` has no such field, and a needle-less tape has no angle to wrap
 * either way. `formatDisplay` and `readoutTextFor` both need this same
 * decision, so it lives in one place rather than two copies drifting apart.
 * The `dial && circular` half is kept for whichever later circular dial
 * revives it -- `tickMarksFor`'s doc comment on the same subject.
 */
function wrapsAndPads(g: GaugeSpec): boolean {
  return g.kind === 'tape' || (g.kind === 'dial' && g.circular)
}

/** The value as it is printed: scaled into the display unit and rounded. */
function formatDisplay(g: GaugeSpec, value: number): string {
  const n = value
  // `Math.abs` and the `n < 0` test below both treat -0 as zero, so a climb
  // gauge sitting exactly level reads "+0.0" and never flickers to "-0.0".
  // An explicit Object.is(-0) guard was written here first and removed: a
  // mutation check found it changed no output, i.e. it was dead. The test
  // that pins the behaviour stays.
  const body = Math.abs(n).toFixed(g.decimals)
  // A compass reads 005, not 5 -- three digits is the convention, and a
  // varying width makes a heading unreadable at a glance while turning.
  //
  // The wrap has to happen AFTER rounding, not before. `gaugeValue` already
  // normalises heading into [0, 2*pi), but `toFixed(0)` rounds anything from
  // 359.5 up to "360", which is not a compass heading and is not a number the
  // rose prints -- so a right turn through north read 358, 359, 360, 001 for
  // half a degree on every pass. Found by review, 2026-09-13.
  //
  // The `decimals > 0` padding width is dead-by-absence: no wrapping gauge
  // has decimals today. It is 3 integer digits plus the point plus the
  // decimals.
  if (wrapsAndPads(g)) {
    const turn = g.max - g.min
    const wrapped = (((Number(body) % turn) + turn) % turn).toFixed(g.decimals)
    return wrapped.padStart(g.decimals > 0 ? g.decimals + 4 : 3, '0')
  }
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
 *
 * `controls` is required, like `gaugeValue`'s (controller ruling R3): a
 * defaulted vector here would let a caller silently show a plausible-looking
 * throttle reading instead of failing to compile.
 */
export function readoutTextFor(
  id: GaugeId,
  spec: AircraftSpec,
  state: AircraftState,
  controls: Controls,
  wind: Wind = null,
): string {
  const g = byId.get(id)
  if (!g) throw new Error(`Unknown gauge: ${id}`)
  const raw = gaugeValue(id, spec, state, controls, wind)
  if (!Number.isFinite(raw)) return '--'
  const value = wrapsAndPads(g) ? raw : Math.min(g.max, Math.max(g.min, raw))
  return formatDisplay(g, value)
}
