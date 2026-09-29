import type { AircraftEntity } from '../loop.js'
import type { Controls } from '../flight/state.js'
import { airVelocity, DT } from '../flight/model.js'
import { attitudeAngles } from '../flight/attitude.js'
import { effectiveStallSpeedMps } from '../ground.js'
import { wheelDepthOf } from '../gearContact.js'
import { qRotate } from '../math/quat.js'
import { length, sub, v3 } from '../math/vec3.js'
import { isAircraftDown } from '../weapons/combat.js'
import { airborne } from './airborne.js'
import { FLOOR_BUFFER_M, FLOOR_M, heightAboveGround } from './safety.js'
import type { PilotTickContext } from './pilotTick.js'

/**
 * 7h: the AI takeoff phase machine (plan 2026-09-28-ai-7h-takeoff, Design).
 * `wait` on the brakes until there is terrain and the runway is clear;
 * `roll` at full throttle, steering to the heading latched on the first
 * tick, rotating near the stall; `climb` at a held flight-path angle, wings
 * level, gear up, until TAKEOFF_DONE_M above the ground, when the machine
 * returns null and the ordinary pilot takes over (Task 3).
 */
export type TakeoffPhase = 'wait' | 'roll' | 'climb'
export type TakeoffState = {
  readonly phase: TakeoffPhase
  readonly sinceS: number
  /** Runway heading, compass, latched on the first tick. */
  readonly headingRad: number | null
  /** The climb-out hold's integral term. */
  readonly pitchIntegral: number
}
export type TakeoffContext = Pick<PilotTickContext, 'nowS' | 'terrain' | 'decks' | 'wind' | 'combat'>

/*
 * Tuning. The starting values were the player's `deckRun` law
 * (tests/sim/mission/fly.ts, F6F). Measured 2026-09-28 with this law through
 * production `advance` on the real terrain at Dulag (runway 1,500 m on 000,
 * ground 10.9 m at the start rising to 13.6 m at the center), from a settled
 * parked start at runway-local z +650 (1,400 m of runway ahead), 60 s each:
 *
 *   aircraft  flaps  wind          run to 10 m  150 m AGL at
 *   Zero      up     calm          309 m        26.4 s
 *   Zero      up     3 m/s at 000  277 m        26.3 s
 *   Zero      down   calm          267 m        26.6 s
 *   Zero      down   3 m/s at 000  244 m        26.6 s
 *   f6f       up     calm          507 m        29.3 s
 *   f6f       up     3 m/s at 000  437 m        29.1 s
 *   f6f       down   calm          371 m        28.6 s
 *   f6f       down   3 m/s at 000  324 m        28.0 s
 *
 * T1 merge note (2026-09-29): the table and the paragraph below were measured on
 * the pre-T1 ground model (level parked attitude, no tail-down stance). Under
 * T1 the airplane parks at its layout's rest pitch, the tail rises with
 * airflow inside `groundBodyRates`, and this law's stick/rudder are unchanged
 * (yaw steers on the ground, roll stays 0 on the wheels). Only the Zero's calm
 * run was re-measured: 267 m -> 253.3 m (`ZERO_TAKEOFF_RUN_M`); the other
 * rows are the old model's and were not re-run.
 *
 * (Pre-T1) The "tail comes up" airspeed the plan asked for did not exist:
 * the sim modeled no tail-down ground attitude and no takeoff swing. Runway-local z -650, the spot the
 * plan named, is the runway's DEPARTURE end on 000: it leaves 100 m ahead,
 * and the Zero (flaps up, 3 m/s) rolled and climbed 194 m past the end of
 * the strip before its wheels were 10 m up (294 m).
 */
export const TAKEOFF_ROTATE_STALL_MULTIPLE = 1.1
export const TAKEOFF_ROTATE_PITCH = 0.6
export const TAKEOFF_CLIMB_OUT_M = 10
export const TAKEOFF_CLIMB_DEG = 10
export const TAKEOFF_CLIMB_MIN_STALL_MULTIPLE = 1.3
/** The gear, and the flaps with it, come up above this wheel height. */
export const TAKEOFF_GEAR_UP_M = 30
/**
 * The climb ends here, above the ground: the safety floor's trigger
 * (FLOOR_M + FLOOR_BUFFER_M, 400 m) plus 50 m, so the ordinary pilot starts
 * above the floor. The plan's 150 m handed a ~64 m/s pilot to a floor that
 * pulled full stick: it looped past vertical, stalled and spun in, every
 * time: from Dulag (takeoff-fixture, through `pilotTick`), the Zero hit the
 * ground 73 s (calm) and 96 s (3 m/s) in, the F6F 57 s in. At 450 m all four
 * and the pair fly 130 s past the hand-off, lowest 375-388 m above the
 * ground (the floor catches the loiter's first sag); 500 m was no better
 * (382-389 m) and 4 s later. Hand-off 49.5-50.9 s after brakes off.
 * Measured 2026-09-28 (7h Task 3).
 */
export const TAKEOFF_DONE_M = FLOOR_M + FLOOR_BUFFER_M + 50
export const TAKEOFF_CLEAR_M = 400
/**
 * Yaw per radian of heading error. 2 (deckRun's F6F used yaw 0) corrected a
 * staged 5 degree error slowly (1.1 deg left at 10 s) and drifted the Zero
 * 8.8 m off the centerline by liftoff, 13.3 m by 150 m AGL; 6 drifted it
 * 2.5 m; 15 drifts it 0.5 m (1.7 m from a 10 degree error; the F6F 0.1 m
 * and 0.2 m) with no overshoot on the roll or in the climb. Measured
 * 2026-09-28. With no swing modeled, this only matters for a disturbed start.
 */
export const TAKEOFF_STEER_GAIN = 15
/** Flaps down for the roll: the shorter run for both types, with the climb
 *  held (table above; measured 2026-09-28). */
export const TAKEOFF_FLAPS = true
/**
 * The Zero's run under this law, brakes off to wheels 10 m up, calm, flaps
 * down, from Dulag's z +650: 253 m (re-measured 2026-09-29 on the T1 ground
 * model with the wheels' pitch-dependent depth; was 267 m before T1;
 * airfield-strike's 3 m/s headwind shortens it to 244 m). The calm figure is
 * the conservative one. 7h Task 4's runway-length content check (RF1) reads
 * it, and tests/sim/ai/takeoff.test.ts fails if the law's run grows past it.
 */
export const ZERO_TAKEOFF_RUN_M = 253

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x))
const wrapPi = (x: number): number => Math.atan2(Math.sin(x), Math.cos(x))
/** Compass heading of the nose (body +x): 0 north (-z), pi/2 east (+x). */
const headingOf = <M>(a: AircraftEntity<M>): number => {
  const f = qRotate(a.state.attitude, v3(1, 0, 0))
  return Math.atan2(f.x, -f.z)
}

export const startTakeoff = (): TakeoffState => ({ phase: 'wait', sinceS: 0, headingRad: null, pitchIntegral: 0 })

/**
 * Whether `a` may start its roll: no lower-id aircraft still in `takeoff`,
 * alive and on the ground is within TAKEOFF_CLEAR_M of it. Id order, never
 * array position (7g spec §7). A destroyed or impacted one never blocks
 * (plan Review Focus 3). Reads only the start-of-tick `snapshot`.
 */
export function takeoffClear<M>(
  a: AircraftEntity<M>, snapshot: readonly AircraftEntity<M>[], ctx: Pick<TakeoffContext, 'terrain' | 'decks' | 'combat'>,
): boolean {
  return !snapshot.some((c) => {
    if (c.id >= a.id || c.pilot?.decision.mode !== 'takeoff') return false
    if (isAircraftDown(ctx.combat.aircraft, c)) return false
    if (airborne(c, ctx.terrain, ctx.decks)) return false
    return length(sub(c.state.position, a.state.position)) < TAKEOFF_CLEAR_M
  })
}

/** One tick of the takeoff: the controls, and the next state, or null when
 *  the climb is done. Pure. */
export function takeoffControls<M>(
  a: AircraftEntity<M>, t: TakeoffState, ctx: TakeoffContext, snapshot: readonly AircraftEntity<M>[],
): { controls: Controls; takeoff: TakeoffState | null } {
  const held: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0, gearDown: true, flapDown: false, hookDown: false, brake: 1 }
  const headingRad = t.headingRad ?? headingOf(a)
  const s = a.state
  const now = ctx.nowS
  const heightM = heightAboveGround(s, ctx.terrain, ctx.decks)
  const wheelsM = heightM - wheelDepthOf(a.spec, s)
  let next: TakeoffState = { ...t, headingRad }

  if (next.phase === 'wait') {
    if (ctx.terrain === null || !takeoffClear(a, snapshot, ctx)) return { controls: held, takeoff: next }
    next = { ...next, phase: 'roll', sinceS: now }
  }
  const air = length(airVelocity(s, ctx.wind))
  // The stall for the flaps as they are, not as commanded: they travel for
  // seconds, and they come up with the gear on the climb.
  const stall = effectiveStallSpeedMps(a.spec, s.flapFraction)
  if (next.phase === 'roll' && wheelsM >= TAKEOFF_CLIMB_OUT_M) next = { ...next, phase: 'climb', sinceS: now }
  const yaw = clamp(TAKEOFF_STEER_GAIN * wrapPi(headingRad - headingOf(a)), -1, 1)

  if (next.phase === 'roll') {
    const pitch = air >= TAKEOFF_ROTATE_STALL_MULTIPLE * stall ? TAKEOFF_ROTATE_PITCH : 0
    return { controls: { pitch, roll: 0, yaw, throttle: 1, gearDown: true, flapDown: TAKEOFF_FLAPS, hookDown: false, brake: 0 }, takeoff: next }
  }
  // climb. On the tick it ends, the climb's own controls, not `held`: the
  // pilot that takes over may not replace them until its next tick.
  const gammaDeg = (Math.atan2(s.velocity.y, Math.hypot(s.velocity.x, s.velocity.z)) * 180) / Math.PI
  const error = (air < TAKEOFF_CLIMB_MIN_STALL_MULTIPLE * stall ? 0 : TAKEOFF_CLIMB_DEG) - gammaDeg
  const pitchIntegral = clamp(next.pitchIntegral + (error * DT) / 40, -0.5, 1)
  const pitch = clamp(error / 20 + pitchIntegral, -1, 1)
  const roll = clamp(-2 * attitudeAngles(s).rollRad, -1, 1)
  return {
    controls: { pitch, roll, yaw, throttle: 1, gearDown: wheelsM < TAKEOFF_GEAR_UP_M, flapDown: TAKEOFF_FLAPS && wheelsM < TAKEOFF_GEAR_UP_M, hookDown: false, brake: 0 },
    takeoff: heightM >= TAKEOFF_DONE_M ? null : { ...next, pitchIntegral },
  }
}
