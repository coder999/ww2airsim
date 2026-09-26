import type { AircraftSpec } from '../flight/schema.js'
import type { AircraftState, Controls } from '../flight/state.js'
import type { AircraftEntity } from '../loop.js'
import type { TerrainField } from '../world/terrain.js'
import type { Deck } from '../world/deck.js'
import { airVelocity } from '../flight/model.js'
import { groundUnder } from '../world/ground.js'
import { SEA_LEVEL_M } from '../world/terrain.js'
import { length, v3, type Vec3 } from '../math/vec3.js'
import { controlsForLiftVector, pitchCommandForLoadFactor } from './liftVector.js'
import { applyControlNoise } from './noise.js'

/**
 * 7c spec §3.2: the AI safety envelope. These are hard overrides, not score
 * terms, following 7b's MIN_ENGAGEMENT_RANGE_M precedent: no weight change
 * can outscore flying into the sea. Every value was measured 2026-09-25
 * through the frame path (plan "Measured", config E). At HEAD, the pursuer
 * overloaded itself to destruction at ticks 2135-2695 of the scripted-evasion
 * soak and followed the player through the sea to -2,842 m. With this
 * envelope: structure 1.000 in all 8 soak runs, peak 7.32 g against a 7.5
 * limit, lowest point 353 m.
 */
export const G_BUDGET = 0.9
export const FLOOR_M = 300
/** Recovery starts this far above FLOOR_M, so the pull-out's own sink stays
 *  above it. Without it the soak dipped to 256-281 m (ruling R6). */
export const FLOOR_BUFFER_M = 100
/** The spec's 8 s was a tuning value. Measured on the green 7d bar: 8 s ->
 *  0 of 4 loadouts behind, 6 s -> 1 of 2, 5 s -> 3 of 4, 4 s -> 4 of 4
 *  (ruling R6). */
export const FLOOR_TIME_S = 4
/** Fractions of `limits.diveSpeedMps` (ruling R7). Measured: a Zero entering
 *  a 60° dive at 150 m/s from 2,500 m kept structure 1.000 and bottomed at
 *  542 m. Without the guard: structure 0. */
export const OVERSPEED_THROTTLE_CUT = 0.9
export const OVERSPEED_RECOVER = 0.95

const UP = v3(0, 1, 0)

export const loadFactorBudget = (spec: AircraftSpec): number => G_BUDGET * spec.limits.gLimit

/** Symmetric because the overload model is symmetric
 *  (`damageFromStructuralOverload` reads the load's magnitude). Zero g for a
 *  float-carburetted engine that starves under negative lift (Z2's
 *  `engine.negativeGCutout`), so an AI never cuts its own engine: 176 ticks
 *  at HEAD in the first 12 s of zero-merge, 0 in 120 s with this floor
 *  (ruling R5). */
export const negativeLoadFloor = (spec: AircraftSpec): number =>
  spec.engine.negativeGCutout === true ? 0 : -loadFactorBudget(spec)

/**
 * Clamp the pitch command so its steady pitch rate stays between the floor
 * and the budget. It runs on every AI output, before control noise, so a
 * green pilot's jitter can still nick the limit, which is human (spec §3.2).
 * Measured: green's soak peak was 7.32 g, within 7.5.
 */
export function limitLoadFactor(state: AircraftState, spec: AircraftSpec, controls: Controls): Controls {
  const hi = pitchCommandForLoadFactor(state, spec, loadFactorBudget(spec))
  const lo = pitchCommandForLoadFactor(state, spec, negativeLoadFloor(spec))
  if (hi === null || lo === null) return controls
  return { ...controls, pitch: Math.min(Math.max(controls.pitch, lo), hi) }
}

/** Height above what is under the aircraft: a deck, the terrain, or sea
 *  level where terrain is null (spec §3.2). */
export function heightAboveGround(state: AircraftState, terrain: TerrainField | null, decks: readonly Deck[]): number {
  const under = groundUnder(terrain, decks, state.position.x, state.position.z)
  return state.position.y - (under?.heightM ?? SEA_LEVEL_M)
}

/** Below FLOOR_M + FLOOR_BUFFER_M, or within FLOOR_TIME_S of reaching it at
 *  the current sink rate. Stateless: it clears itself once the aircraft is
 *  above that height and no longer descending. */
export function needsFloorRecovery(state: AircraftState, terrain: TerrainField | null, decks: readonly Deck[]): boolean {
  const trigger = FLOOR_M + FLOOR_BUFFER_M
  const h = heightAboveGround(state, terrain, decks)
  if (h < trigger) return true
  const vy = state.velocity.y
  return vy < 0 && (h - trigger) / -vy < FLOOR_TIME_S
}

export type SafetyOverride = { readonly mode: 'recover' | 'overspeed'; readonly controls: Controls }

/** Checked every tick, not at rescore: reaction delay models perceiving the
 *  enemy, not a pilot flying into the sea. The floor outranks overspeed.
 *  Never fires. */
export function safetyOverride<M>(
  self: AircraftEntity<M>, terrain: TerrainField | null, decks: readonly Deck[], wind: Vec3 | null,
): SafetyOverride | null {
  const n = loadFactorBudget(self.spec)
  if (needsFloorRecovery(self.state, terrain, decks)) {
    return { mode: 'recover', controls: controlsForLiftVector(self.state, self.spec, UP, n, 1) }
  }
  const airspeed = length(airVelocity(self.state, wind))
  if (airspeed >= OVERSPEED_RECOVER * self.spec.limits.diveSpeedMps && self.state.velocity.y < 0) {
    return { mode: 'overspeed', controls: controlsForLiftVector(self.state, self.spec, UP, n, 0) }
  }
  return null
}

/** The last three stages of every AI command, in order: the load-factor
 *  limiter, the overspeed throttle cut, then 7d's control noise. */
export function finishControls<M>(
  self: AircraftEntity<M>, base: Controls, noiseStdDev: number, cursor: number, wind: Vec3 | null,
): { readonly controls: Controls; readonly cursor: number } {
  const limited = limitLoadFactor(self.state, self.spec, base)
  const fast = length(airVelocity(self.state, wind)) >= OVERSPEED_THROTTLE_CUT * self.spec.limits.diveSpeedMps
  return applyControlNoise(fast ? { ...limited, throttle: 0 } : limited, noiseStdDev, cursor)
}
