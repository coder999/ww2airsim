import { type Vec3, sub, dot, ZERO } from './math/vec3.js'
import type { AircraftSpec } from './flight/schema.js'
import { type AircraftState, type Controls, step } from './flight/model.js'

const G = 9.80665

/**
 * Specific energy in the AIRMASS frame, J/kg: v_air^2/2 + g*h.
 *
 * Spec §11: the ground frame is wrong for this invariant. Under a scenario wind
 * vector, ground-frame energy legitimately changes as the aircraft turns
 * relative to the wind, so a ground-frame assertion flaps in soak runs for
 * entirely correct physics.
 */
export function specificEnergyAirmass(state: AircraftState, windMps: Vec3 = ZERO): number {
  const vAir = sub(state.velocity, windMps)
  return dot(vAir, vAir) / 2 + G * state.position.y
}

const FIELDS: ReadonlyArray<readonly [string, (s: AircraftState) => number]> = [
  ['position.x', (s) => s.position.x], ['position.y', (s) => s.position.y], ['position.z', (s) => s.position.z],
  ['velocity.x', (s) => s.velocity.x], ['velocity.y', (s) => s.velocity.y], ['velocity.z', (s) => s.velocity.z],
  ['attitude.x', (s) => s.attitude.x], ['attitude.y', (s) => s.attitude.y],
  ['attitude.z', (s) => s.attitude.z], ['attitude.w', (s) => s.attitude.w],
  ['bodyRates.x', (s) => s.bodyRates.x], ['bodyRates.y', (s) => s.bodyRates.y],
  ['bodyRates.z', (s) => s.bodyRates.z], ['fuelKg', (s) => s.fuelKg],
]

export function assertFinite(state: AircraftState, context: string): void {
  for (const [name, get] of FIELDS) {
    if (!Number.isFinite(get(state))) {
      throw new Error(`Non-finite ${name} (${get(state)}) in aircraft state at ${context}`)
    }
  }
}

/**
 * step() with the spec §11 invariants asserted. Use this in tests and in the
 * soak harness; use the bare step() in the hot path of the running game.
 */
export function stepChecked(
  spec: AircraftSpec,
  state: AircraftState,
  controls: Controls,
  dt: number,
  windMps: Vec3 = ZERO,
): AircraftState {
  const before = specificEnergyAirmass(state, windMps)
  const next = step(spec, state, controls, dt)
  assertFinite(next, 'stepChecked')
  if (controls.throttle === 0) {
    const after = specificEnergyAirmass(next, windMps)
    if (after > before + 1e-3) {
      throw new Error(
        `Airmass specific energy increased at idle throttle: ${before} -> ${after}`,
      )
    }
  }
  return next
}
