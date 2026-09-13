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

type GaugeSpec = {
  readonly id: GaugeId
  readonly label: string
  readonly unit: string
  /** Dial ends, in the gauge's own unit. */
  readonly min: number
  readonly max: number
  /** Needle sweep, radians, from `min` to `max`. */
  readonly sweepRad: number
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
    sampleLow: createState({ velocity: v3(20, 0, 0) }),
    sampleHigh: createState({ velocity: v3(200, 0, 0) }),
  },
  {
    id: 'altimeter', label: 'ALTITUDE', unit: 'm',
    min: 0, max: 10_000, sweepRad: (TWO_PI * 3) / 4, circular: false,
    sampleLow: createState({ position: v3(0, 100, 0) }),
    sampleHigh: createState({ position: v3(0, 8000, 0) }),
  },
  {
    id: 'verticalSpeed', label: 'CLIMB', unit: 'm/s',
    min: -25, max: 25, sweepRad: (TWO_PI * 3) / 4, circular: false,
    sampleLow: createState({ velocity: v3(100, -20, 0) }),
    sampleHigh: createState({ velocity: v3(100, 20, 0) }),
  },
  {
    id: 'heading', label: 'HEADING', unit: 'deg',
    min: 0, max: TWO_PI, sweepRad: TWO_PI, circular: true,
    // Heading reads attitude, not velocity. A velocity-only sample here left
    // both ends at 0 and the monotonic test comparing 0 > 0.
    sampleLow: createState({ attitude: qFromAxisAngle(v3(0, 1, 0), -0.2) }),
    sampleHigh: createState({ attitude: qFromAxisAngle(v3(0, 1, 0), -Math.PI / 2) }),
  },
  {
    id: 'fuel', label: 'FUEL', unit: 'kg',
    min: 0, max: 700, sweepRad: (TWO_PI * 3) / 4, circular: false,
    sampleLow: createState({ fuelKg: 50 }),
    sampleHigh: createState({ fuelKg: 650 }),
  },
  {
    id: 'slip', label: 'SLIP', unit: '',
    min: -0.5, max: 0.5, sweepRad: Math.PI / 2, circular: false,
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

  if (g.circular) return ((value % TWO_PI) + TWO_PI) % TWO_PI

  const t = (value - g.min) / (g.max - g.min)
  return (t < 0 ? 0 : t > 1 ? 1 : t) * g.sweepRad
}
