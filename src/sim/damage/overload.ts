import type { AircraftState } from '../flight/state.js'
import { length, scale, sub, v3, ZERO, type Vec3 } from '../math/vec3.js'
import type { Damage } from './model.js'

export const STANDARD_GRAVITY_MPS2 = 9.80665

export type StructuralLimits = {
  readonly diveSpeedMps: number
  readonly gLimit: number
}

export type StructuralStress = {
  readonly loadFactorG: number
  readonly airspeedMps: number
  readonly overG: boolean
  readonly overspeed: boolean
  readonly peakLoadFactorG: number
  readonly peakAirspeedMps: number
}

export function initialStructuralStress(
  state: AircraftState,
  limits: StructuralLimits,
  wind: Vec3 | null = null,
): StructuralStress {
  const airspeedMps = length(sub(state.velocity, wind ?? ZERO))
  return {
    loadFactorG: 1,
    airspeedMps,
    overG: 1 > limits.gLimit,
    overspeed: airspeedMps > limits.diveSpeedMps,
    peakLoadFactorG: 1,
    peakAirspeedMps: airspeedMps,
  }
}

/** Derive proper load and aerodynamic speed from two consecutive fixed ticks. */
export function measureStructuralStress(
  previous: AircraftState,
  current: AircraftState,
  wind: Vec3 | null,
  limits: StructuralLimits,
  dt: number,
  before: StructuralStress,
): StructuralStress {
  if (!Number.isFinite(dt) || dt <= 0) return before
  const acceleration = scale(sub(current.velocity, previous.velocity), 1 / dt)
  const properAcceleration = sub(acceleration, v3(0, -STANDARD_GRAVITY_MPS2, 0))
  const loadFactorG = length(properAcceleration) / STANDARD_GRAVITY_MPS2
  const airspeedMps = length(sub(current.velocity, wind ?? ZERO))
  return {
    loadFactorG,
    airspeedMps,
    overG: loadFactorG > limits.gLimit,
    overspeed: airspeedMps > limits.diveSpeedMps,
    peakLoadFactorG: Math.max(before.peakLoadFactorG, loadFactorG),
    peakAirspeedMps: Math.max(before.peakAirspeedMps, airspeedMps),
  }
}

/** Continuous, deterministic structure loss from the fractional excess. */
export function damageFromStructuralOverload(
  before: Damage,
  stress: StructuralStress,
  limits: StructuralLimits,
  tick: number,
  dt: number,
): Damage {
  if (before.destroyedAt !== null || !Number.isFinite(dt) || dt <= 0) return before
  const gExcess = Math.max(0, stress.loadFactorG / limits.gLimit - 1)
  const speedExcess = Math.max(0, stress.airspeedMps / limits.diveSpeedMps - 1)
  const loss = (gExcess + speedExcess) * dt
  if (loss <= 0) return before
  const structure = Math.max(0, before.structure - loss)
  const destroyed = structure < 1e-10
  return {
    ...before,
    structure: destroyed ? 0 : structure,
    destroyedAt: destroyed ? tick : before.destroyedAt,
    attacker: destroyed ? null : before.attacker,
  }
}

