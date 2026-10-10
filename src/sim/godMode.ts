import type { AircraftState } from './flight/state.js'
import type { AircraftSpec } from './flight/schema.js'
import type { CombatState } from './weapons/combat.js'
import type { StoresState } from './weapons/stores.js'
import { healthyDamage } from './damage/model.js'
import { qFromAxisAngle, qMul } from './math/quat.js'
import { v3 } from './math/vec3.js'

/**
 * God mode (Dev only; docs/superpowers/plans/2026-10-10-god-mode-range-test.md).
 *
 * A session setting like the Damage Model, so it is a parameter `advance` is
 * handed, not a `World` field: a `World` describes the flight. Absent, the sim
 * is bit-identical to a world that never heard of it. Present, for the player
 * only: nothing damages the airplane, nothing runs out, and a contact with the
 * ground, the sea or a deck bounces it back into the air instead of ending the
 * flight.
 *
 * `stores` is what the racks carried at launch; `advance` cannot recover it
 * once a bomb has gone, so the caller captures it.
 */
export type GodMode = { readonly stores: StoresState }

/** Climb rate the bounce guarantees, m/s (about 80 ft/s): enough to clear a
 *  runway or a wave and to leave the player time to take the controls. */
export const BOUNCE_MIN_CLIMB_MPS = 25
/** Metres above the contact surface the bounce lifts the body origin to. */
export const BOUNCE_LIFT_M = 6
/** The nose is laid along the new flight path, but never flatter than this. */
const BOUNCE_MIN_PITCH_RAD = 8 * Math.PI / 180

/**
 * The state after a contact, as a bounce: lifted clear of the surface, the
 * horizontal motion kept, the vertical speed reflected into a climb of at
 * least `BOUNCE_MIN_CLIMB_MPS`, wings level and the nose along the new path,
 * rotation stopped. Pure.
 */
export function bounceState(state: AircraftState, surfaceHeightM: number): AircraftState {
  const vx = state.velocity.x, vz = state.velocity.z
  let horizontal = Math.hypot(vx, vz)
  let heading = Math.atan2(vz, vx)
  if (horizontal < 1) {
    // Nearly stopped: keep the way the nose points.
    const nose = { x: 1 - 2 * (state.attitude.y ** 2 + state.attitude.z ** 2), z: 2 * (state.attitude.x * state.attitude.z - state.attitude.w * state.attitude.y) }
    heading = Math.atan2(nose.z, nose.x)
    horizontal = Math.max(horizontal, 40)
  }
  const vy = Math.max(BOUNCE_MIN_CLIMB_MPS, Math.abs(state.velocity.y) * 0.6)
  const pitch = Math.max(BOUNCE_MIN_PITCH_RAD, Math.atan2(vy, horizontal))
  // Rotation about +Y by -heading turns +X (forward) toward the heading (state.ts, bodyRates note).
  const yaw = qFromAxisAngle(v3(0, 1, 0), -heading)
  const nose = qFromAxisAngle(v3(0, 0, 1), pitch)
  return {
    ...state,
    position: v3(state.position.x, Math.max(state.position.y, surfaceHeightM + BOUNCE_LIFT_M), state.position.z),
    velocity: v3(Math.cos(heading) * horizontal, vy, Math.sin(heading) * horizontal),
    attitude: qMul(yaw, nose),
    bodyRates: v3(0, 0, 0),
  }
}

/** The player's combat record put back to pristine: full structure and every
 *  subsystem, every gun full, the racks as launched. Other airplanes untouched. */
export function restoreCombat(combat: CombatState, spec: AircraftSpec, playerId: string, god: GodMode): CombatState {
  const rec = combat.aircraft[playerId]
  if (rec === undefined) return combat
  return {
    ...combat,
    aircraft: {
      ...combat.aircraft,
      [playerId]: {
        ...rec,
        damage: healthyDamage(),
        stores: god.stores,
        guns: rec.guns.map((g, i) => ({ ...g, ammo: spec.combat?.guns[i]?.rounds ?? g.ammo })),
      },
    },
  }
}

/** The tank topped up. */
export const refuel = (state: AircraftState, spec: AircraftSpec): AircraftState =>
  state.fuelKg >= spec.mass.fuelCapacityKg ? state : { ...state, fuelKg: spec.mass.fuelCapacityKg }
