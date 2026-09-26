import type { AircraftSpec } from '../flight/schema.js'
import type { AircraftState, Controls } from '../flight/state.js'
import type { AircraftEntity } from '../loop.js'
import type { TerrainField } from '../world/terrain.js'
import type { Deck } from '../world/deck.js'
import { DT, airVelocity } from '../flight/model.js'
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
/** Mark's decision, 2026-09-26: "ai chases you unless under 50 *feet*. 500
 *  meters is still pretty high". 50 ft above the ground under the AI. While
 *  the intent is Pursue, the floor follows the target down to this and no
 *  lower (`floorTriggerM`). Mark chose it: it is not a tuning value. */
export const PURSUIT_FLOOR_M = 50 * 0.3048
/** How far below the pursued target's height the pursuit floor sits. A
 *  tuning value, swept 2026-09-26 (7c Task 15) in tests/sim/ai/lowChase.test.ts's
 *  sea worlds (targets holding 150, 60, 20 m; F6F and Zero, green and
 *  veteran, 4 cursors, 90 s), floor alone:
 *  - 0 (floor at the target's height): the veteran F6F rides the floor above
 *    the target and scores 0 hits at 150, 60 and 20 m in all 4 cursors while
 *    firing 552-1,302 rounds.
 *  - 10 and 25: every F6F run kills (12 hits) at 150 and 60 m; 25 also hits
 *    in every F6F run at 20 m (4-12). Lowest points about 5 m under the target.
 *  - 50, 100, 1,000: the same hits with deeper dips (veteran F6F, cursor
 *    7919, to 15.06 m chasing a 60 m target; 51-99 m chasing a 150 m one).
 *  25 is kept. */
export const PURSUIT_FLOOR_BELOW_TARGET_M = 25

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
  return heightAboveGroundAt(state.position, terrain, decks)
}

/** Height of a point above what is under it; `heightAboveGround` for a
 *  position alone (the pursued target as the pilot last perceived it). */
export function heightAboveGroundAt(position: Vec3, terrain: TerrainField | null, decks: readonly Deck[]): number {
  const under = groundUnder(terrain, decks, position.x, position.z)
  return position.y - (under?.heightM ?? SEA_LEVEL_M)
}

/** The height above the ground at which the floor recovery starts.
 *  `pursuedTargetHeightM` is the pursued target's height above its own
 *  ground, or null for every intent but Pursue. Without one it is today's
 *  FLOOR_M + FLOOR_BUFFER_M. With one it follows the target down
 *  (PURSUIT_FLOOR_BELOW_TARGET_M under it) and stops at PURSUIT_FLOOR_M,
 *  Mark's 50 ft: a target lower than that is not chased lower. It never
 *  rises above today's trigger, so a pursuit of a high target is exactly
 *  what it was. */
export function floorTriggerM(pursuedTargetHeightM: number | null): number {
  const today = FLOOR_M + FLOOR_BUFFER_M
  if (pursuedTargetHeightM === null) return today
  return Math.min(today, Math.max(PURSUIT_FLOOR_M, pursuedTargetHeightM - PURSUIT_FLOOR_BELOW_TARGET_M))
}

/** Below `triggerM` (by default FLOOR_M + FLOOR_BUFFER_M), or within
 *  FLOOR_TIME_S of reaching it at the current sink rate. Stateless: it
 *  clears itself once the aircraft is above that height and no longer
 *  descending.
 *
 *  Below today's trigger only (the pursuit floor), it also projects the
 *  current downward acceleration `verticalAccelMps2` over FLOOR_TIME_S:
 *  h + vy·T + ½·a·T² under the trigger. Found and measured 2026-09-26 (7c
 *  Task 15) in aiSafety's soak, whose player dives through the sea: the
 *  pursuer tops a loop at 139.6 m inverted, pulling about 3 g toward the
 *  target below. The sink-rate check cannot fire on an aircraft climbing or
 *  level, so the recovery began at 127.2 m, vy -31 m/s, still inverted; it
 *  rolled upright for about 1.3 s and bottomed at -22.7 m. With the floor
 *  alone all 8 soak runs went into the sea (-14.6 to -22.7 m); with this
 *  term all 8 hold 15.37-15.47 m, and the 80 low-chase runs' lowest point
 *  rises from 15.81 to 17.1 m, 0 crashes either way. Its cost: a veteran
 *  F6F chasing a target at 20 m holds about 25 m and scores 0 hits (4-12
 *  without it). Today's floor is unchanged, so no other intent sees it. */
export function needsFloorRecovery(
  state: AircraftState, terrain: TerrainField | null, decks: readonly Deck[], triggerM: number = floorTriggerM(null),
  verticalAccelMps2 = 0,
): boolean {
  const h = heightAboveGround(state, terrain, decks)
  if (h < triggerM) return true
  const vy = state.velocity.y
  if (vy < 0 && (h - triggerM) / -vy < FLOOR_TIME_S) return true
  if (triggerM >= floorTriggerM(null) || verticalAccelMps2 >= 0) return false
  const t = FLOOR_TIME_S
  return h + vy * t + 0.5 * verticalAccelMps2 * t * t < triggerM
}

export type SafetyOverride = { readonly mode: 'recover' | 'overspeed'; readonly controls: Controls }

/** Checked every tick, not at rescore: reaction delay models perceiving the
 *  enemy, not a pilot flying into the sea. The floor outranks overspeed.
 *  Never fires. */
export function safetyOverride<M>(
  self: AircraftEntity<M>, terrain: TerrainField | null, decks: readonly Deck[], wind: Vec3 | null,
  floorM: number = floorTriggerM(null),
): SafetyOverride | null {
  const n = loadFactorBudget(self.spec)
  // The vertical acceleration over the last tick; 0 on a world's first tick
  // (or after a `withState` reset), when `previous` is the state itself.
  const ay = self.previous.tick === self.state.tick - 1 ? (self.state.velocity.y - self.previous.velocity.y) / DT : 0
  if (needsFloorRecovery(self.state, terrain, decks, floorM, ay)) {
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
