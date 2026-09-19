import { type Vec3, sub, dot, ZERO } from './math/vec3.js'
import type { AircraftSpec } from './flight/schema.js'
import { type AircraftState, type Controls, clampFinite, step } from './flight/model.js'
import type { SimContext } from './loop.js'

const G = 9.80665
const ENERGY_EPS = 1e-3

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
  ['tick', (s) => s.tick],
]

export function assertFinite(state: AircraftState, context: string): void {
  for (const [name, get] of FIELDS) {
    if (!Number.isFinite(get(state))) {
      throw new Error(`Non-finite ${name} (${get(state)}) in aircraft state at ${context}`)
    }
  }
}

/**
 * Throws if airmass specific energy rose from `before` to `after` by more than
 * `ENERGY_EPS`, naming `context` in the message. Split out of `stepChecked`
 * (Ruling R30) so the throw path -- the other half of this module's purpose,
 * alongside `assertFinite` -- can be unit-tested directly with synthetic
 * numbers. With the current still-air physics and legitimate control input,
 * no reachable state from `stepChecked`'s own call sites can actually trip
 * this, so staging a physics violation to exercise it would not be a
 * meaningful test; testing the comparison itself is.
 */
export function assertNoEnergyGain(before: number, after: number, context: string): void {
  if (after > before + ENERGY_EPS) {
    throw new Error(
      `Airmass specific energy increased at idle throttle: ${before} -> ${after} (at ${context})`,
    )
  }
}

/**
 * True when `controls.throttle`, after the same clamping `step()`'s thrust
 * model applies internally (see `clampFinite` in `flight/model.ts`,
 * Important 4), evaluates to zero. Gating the energy invariant on this
 * rather than a strict `controls.throttle === 0` check matters because a
 * non-finite throttle (a malformed input event, a bad replay file, ...)
 * clamps to 0 in the actual physics -- idle thrust -- but `NaN === 0` is
 * false, so the strict check would silently skip the invariant on exactly
 * the malformed input it is most useful for.
 */
export function isIdleThrottle(controls: Controls): boolean {
  return clampFinite(controls.throttle, 0, 1) === 0
}

/**
 * step() with the spec §11 invariants asserted. Use this in tests and in the
 * soak harness; use the bare step() in the hot path of the running game.
 *
 * Plan 8 (2026-09-18) coupled wind into `step()`, so the airmass frame is now
 * the frame the physics produces and this passes `ctx.wind` through. R29's
 * measurement (a 130 m/s wind tripping the check by +0.104 J/kg) was of the
 * OLD model; `tests/sim/wind.test.ts` runs 20 s at idle in a 12 m/s wind
 * through this function.
 */
export function stepChecked(
  spec: AircraftSpec,
  state: AircraftState,
  controls: Controls,
  ctx: SimContext,
): AircraftState {
  const wind = ctx.wind ?? ZERO
  const before = specificEnergyAirmass(state, wind)
  const next = step(spec, state, controls, ctx)
  assertFinite(next, 'stepChecked')
  if (isIdleThrottle(controls)) {
    const after = specificEnergyAirmass(next, wind)
    assertNoEnergyGain(before, after, 'stepChecked')
  }
  return next
}
