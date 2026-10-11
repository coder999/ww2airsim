import type { AircraftSpec } from '../flight/schema.js'
import type { AircraftState, Controls } from '../flight/state.js'
import type { AircraftEntity } from '../loop.js'
import type { TerrainField } from '../world/terrain.js'
import type { Deck } from '../world/deck.js'
import { DT, airVelocity, angleOfAttack, commandedBodyRates } from '../flight/model.js'
import { STANDARD_GRAVITY_MPS2 } from '../damage/overload.js'
import { qRotate } from '../math/quat.js'
import { alphaCritRad } from '../aero.js'
import { groundUnder } from '../world/ground.js'
import { SEA_LEVEL_M } from '../world/terrain.js'
import { length, v3, type Vec3 } from '../math/vec3.js'
import { controlsForDesiredVelocity } from './controller.js'
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
/** The climb a floor recovery that is already climbing holds (E1). */
export const RECOVERY_CLIMB_RAD = 20 * Math.PI / 180
/** Fractions of `limits.diveSpeedMps` (ruling R7). Measured: a Zero entering
 *  a 60° dive at 150 m/s from 2,500 m kept structure 1.000 and bottomed at
 *  542 m. Without the guard: structure 0. */
/** Below this multiple of the stall speed a floor recovery unloads before it pulls. ESTIMATE. */
export const STALL_RECOVERY_FACTOR = 1.1
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

/**
 * E4, the stall guard (7c handoff open item 7): the pitch command is capped at
 * STALL_GUARD_GAIN x (STALL_GUARD_ALPHA_FRACTION - alpha / alphaCrit), and
 * floored at its mirror for negative alpha, so the stick eases from about
 * 0.65 of the critical angle, is neutral at 0.85 and comes forward past it.
 * Alpha is read off the air (`airVelocity`), as the model's `isStalled` is.
 * Before it (census, 2026-10-10, the E1 duels at 4 cursors): an AI was
 * stalled on 20.7% of its live ticks, 98.6% of them under no safety
 * override, as slow as 16 mph; with it, 0.4% (measured 2026-10-10). The
 * fraction, swept the same day in the duels with every E4 change in: 0.85 ->
 * 37 kills of 72, 0.95 -> 34. Handoff: docs/handoff/2026-10-10-e4-ai-fixes.md.
 */
export const STALL_GUARD_ALPHA_FRACTION = 0.85
export const STALL_GUARD_GAIN = 5

export function limitAngleOfAttack(state: AircraftState, spec: AircraftSpec, controls: Controls, wind: Vec3 | null): Controls {
  const r = angleOfAttack({ ...state, velocity: airVelocity(state, wind) }) / alphaCritRad(spec)
  const hi = STALL_GUARD_GAIN * (STALL_GUARD_ALPHA_FRACTION - r)
  const lo = -STALL_GUARD_GAIN * (STALL_GUARD_ALPHA_FRACTION + r)
  return { ...controls, pitch: Math.min(Math.max(controls.pitch, lo), hi) }
}

const UP = v3(0, 1, 0)

/** `fraction` of the airframe's `gLimit`: the AI's `G_BUDGET` unless a caller
 *  (the player's pursuit autopilot, B3) brings its own margin. */
export const loadFactorBudget = (spec: AircraftSpec, fraction = G_BUDGET): number => fraction * spec.limits.gLimit

/** Symmetric because the overload model is symmetric
 *  (`damageFromStructuralOverload` reads the load's magnitude). Zero g for a
 *  float-carburetted engine that starves under negative lift (Z2's
 *  `engine.negativeGCutout`), so an AI never cuts its own engine: 176 ticks
 *  at HEAD in the first 12 s of zero-merge, 0 in 120 s with this floor
 *  (ruling R5). */
export const negativeLoadFloor = (spec: AircraftSpec, fraction = G_BUDGET): number =>
  spec.engine.negativeGCutout === true ? 0 : -loadFactorBudget(spec, fraction)

/**
 * Clamp the pitch command so its steady pitch rate stays between the floor
 * and the budget. It runs on every AI output, before control noise, so a
 * green pilot's jitter can still nick the limit, which is human (spec §3.2).
 * Measured: green's soak peak was 7.32 g, within 7.5. The player's pursuit
 * autopilot runs it too, with its own `fraction` (B3, `autoPursuit.ts`).
 */
export function limitLoadFactor(state: AircraftState, spec: AircraftSpec, controls: Controls, fraction = G_BUDGET): Controls {
  const hi = pitchCommandForLoadFactor(state, spec, loadFactorBudget(spec, fraction))
  const lo = pitchCommandForLoadFactor(state, spec, negativeLoadFloor(spec, fraction))
  if (hi === null || lo === null) return controls
  return { ...controls, pitch: Math.min(Math.max(controls.pitch, lo), hi) }
}

/**
 * `limitLoadFactor` on the pitch, with the caller's fraction, then the
 * rudder held to the lateral load the pitch leaves inside the same budget.
 * The load the overload model reads is the magnitude of the whole proper
 * acceleration, and at 230 m/s full rudder alone is about 5 g of sideslip:
 * measured 2026-10-10 (pursuitProbe crossing/green) with the pitch limited
 * to 0.9 x 7.5 g, the yaw at 1.00 took the F6F to 8.27 g. Both rates are
 * linear in the stick (`commandedBodyRates`), so a unit command converts.
 * The lateral term ignores gravity along the wing, as `pitchCommandForLoadFactor`
 * does not: the measured peaks are what say it is enough.
 *
 * B3 wrote it for the player's autopilot; E4 runs it on every AI command
 * (`finishControls`): a veteran's defensive break at 194 m/s in the furball
 * soak reached 7.66 g against a 7.5 g limit on the rudder (measured 2026-10-10).
 */
export function limitLoadFactorAndRudder(state: AircraftState, spec: AircraftSpec, controls: Controls, fraction = G_BUDGET): Controls {
  const c = limitLoadFactor(state, spec, controls, fraction)
  const speed = length(state.velocity)
  const unit = commandedBodyRates(spec, state, { roll: 0, pitch: 1, yaw: 1, throttle: 0 })
  if (speed < 1 || Math.abs(unit.z) < 1e-6 || Math.abs(unit.y) < 1e-6) return c
  const budget = loadFactorBudget(spec, fraction)
  const normal = speed * unit.z * c.pitch / STANDARD_GRAVITY_MPS2 + qRotate(state.attitude, v3(0, 1, 0)).y
  const lateral = Math.sqrt(Math.max(0, budget * budget - normal * normal))
  const yawMax = lateral * STANDARD_GRAVITY_MPS2 / (speed * Math.abs(unit.y))
  return { ...c, yaw: Math.min(yawMax, Math.max(-yawMax, c.yaw)) }
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
 *  Never fires. `floorM` at -Infinity turns the floor off and leaves the
 *  overspeed guard: 7g's approach (spec §6, `exemptFromFloor`). */
export function safetyOverride<M>(
  self: AircraftEntity<M>, terrain: TerrainField | null, decks: readonly Deck[], wind: Vec3 | null,
  floorM: number = floorTriggerM(null),
): SafetyOverride | null {
  const n = loadFactorBudget(self.spec)
  // The vertical acceleration over the last tick; 0 on a world's first tick
  // (or after a `withState` reset), when `previous` is the state itself.
  const ay = self.previous.tick === self.state.tick - 1 ? (self.state.velocity.y - self.previous.velocity.y) / DT : 0
  if (needsFloorRecovery(self.state, terrain, decks, floorM, ay)) {
    // Already climbing: climb out on RECOVERY_CLIMB_RAD rather than pull on.
    // E1, measured 2026-10-09 (lowChase.test.ts, green Zero after a kill at
    // 150 m): with the target dead the floor jumps from the pursuit floor to
    // 400 m, the full-G pull went vertical, the Zero stalled at 25 mph and
    // fell into the sea under a second recovery it no longer had the speed
    // to fly. No AI had made that kill before honest gunnery.
    // Stalled (damage stages round 2, 2026-10-09): fights last longer at the tougher HP, and in the
    // furball soak a slow-fighting wingman stalled at 105 mph near 600 m and pulled full back stick
    // under this recovery, mushing into the sea. Pulling cannot fly a stalled wing; unload instead,
    // full throttle, nose RECOVERY_CLIMB_RAD below the horizon, until there is the speed to climb.
    const airspeed0 = length(airVelocity(self.state, wind))
    if (airspeed0 < STALL_RECOVERY_FACTOR * self.spec.reference.stallSpeedMps) return { mode: 'recover', controls: unloadControls(self) }
    if (self.state.velocity.y >= 0) {
      const v = self.state.velocity
      const flat = Math.hypot(v.x, v.z)
      const heading = flat < 1e-6 ? v3(1, 0, 0) : v3(v.x / flat, 0, v.z / flat)
      const speed = Math.max(length(v), self.spec.reference.stallSpeedMps * 1.3)
      const climb = v3(heading.x * Math.cos(RECOVERY_CLIMB_RAD) * speed, Math.sin(RECOVERY_CLIMB_RAD) * speed, heading.z * Math.cos(RECOVERY_CLIMB_RAD) * speed)
      return { mode: 'recover', controls: limitLoadFactor(self.state, self.spec, { ...controlsForDesiredVelocity(self.state, self.spec, climb), throttle: 1 }) }
    }
    return { mode: 'recover', controls: controlsForLiftVector(self.state, self.spec, UP, n, 1) }
  }
  const airspeed = length(airVelocity(self.state, wind))
  // E4, the stall guard's speed half: below the stall speed, wherever it is, unload as above. The
  // angle-of-attack limit (`limitAngleOfAttack`) cannot fly a wing that has run out of airspeed:
  // with it alone, the E1 duels still stalled on 1.13% of their ticks, almost all of them in Extend's
  // climb back toward a threat above, zoomed to under 10 mph (census, 2026-10-10). Exempt where the
  // floor is (7g's approach, E2's committed runs), which fly their own speeds.
  if (Number.isFinite(floorM) && airspeed < self.spec.reference.stallSpeedMps) return { mode: 'recover', controls: unloadControls(self) }
  if (airspeed >= OVERSPEED_RECOVER * self.spec.limits.diveSpeedMps && self.state.velocity.y < 0) {
    return { mode: 'overspeed', controls: controlsForLiftVector(self.state, self.spec, UP, n, 0) }
  }
  return null
}

/** A stalled wing's recovery: full throttle, the nose RECOVERY_CLIMB_RAD below the horizon on the
 *  current heading, until there is the speed to fly. */
function unloadControls<M>(self: AircraftEntity<M>): Controls {
  const v0 = self.state.velocity
  const flat = Math.hypot(v0.x, v0.z)
  const heading = flat < 1e-6 ? v3(1, 0, 0) : v3(v0.x / flat, 0, v0.z / flat)
  const speed = self.spec.reference.stallSpeedMps * 1.3
  const dive = v3(heading.x * Math.cos(RECOVERY_CLIMB_RAD) * speed, -Math.sin(RECOVERY_CLIMB_RAD) * speed, heading.z * Math.cos(RECOVERY_CLIMB_RAD) * speed)
  return limitLoadFactor(self.state, self.spec, { ...controlsForDesiredVelocity(self.state, self.spec, dive), throttle: 1 })
}

/** The last three stages of every AI command, in order: the load-factor
 *  limiter, the overspeed throttle cut, then 7d's control noise. */
export function finishControls<M>(
  self: AircraftEntity<M>, base: Controls, noiseStdDev: number, cursor: number, wind: Vec3 | null,
): { readonly controls: Controls; readonly cursor: number } {
  // The stall guard first (E4), then the load factor, whose negative-g floor
  // (an engine that cuts out) outranks it.
  const limit = (c: Controls): Controls => limitLoadFactorAndRudder(self.state, self.spec, limitAngleOfAttack(self.state, self.spec, c, wind))
  const limited = limit(base)
  const fast = length(airVelocity(self.state, wind)) >= OVERSPEED_THROTTLE_CUT * self.spec.limits.diveSpeedMps
  // The noise is limited too (E1, 2026-10-09): unlimited, green's 0.15 put a
  // defensive break 0.2 of stick past the budget, at 7.54 g against a 7.5 g
  // limit (formationLeader.test.ts, once E1's lead had changed the geometry).
  const noisy = applyControlNoise(fast ? { ...limited, throttle: 0 } : limited, noiseStdDev, cursor)
  return { ...noisy, controls: limit(noisy.controls) }
}
