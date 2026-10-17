import { z } from 'zod'
import type { SimContext } from '../loop.js'
import { type Vec3, v3 } from '../math/vec3.js'
import type { Side } from '../sides.js'
import { heightAt, SEA_LEVEL_M, type TerrainField } from './terrain.js'
import { bearingTo, wrapPi } from './ships.js'

const finite = z.number().refine(Number.isFinite, { message: 'must be finite' })
const positive = finite.refine((n) => n > 0, { message: 'must be greater than zero' })

const VehicleSpecObject = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  lengthM: positive,
  widthM: positive,
  heightM: positive,
  maxSpeedMps: positive,
  turnRateRadPerS: positive,
  hp: positive,
  targetType: z.enum(['building', 'tank', 'light-vehicle', 'landing-craft']).default('building'),
  /** F8C: a craft that rests on the sea surface (y = sea level, no pitch or roll from the ground under it). Absent for every land vehicle. */
  floats: z.boolean().optional(),
  view: z.object({ model: z.string().regex(/^[a-z0-9][a-z0-9-]*$/) }).strict(),
}).strict()

export type VehicleSpec = z.infer<typeof VehicleSpecObject>
export const parseVehicleSpec = (raw: unknown): VehicleSpec => VehicleSpecObject.parse(raw)

export type VehicleOrders = {
  readonly waypoints: readonly { readonly x: number; readonly z: number }[]
  readonly speedMps: number
  readonly loop: boolean
  /** Optional authored start heading, used by a stationary vehicle. */
  readonly headingRad?: number
}

export type VehicleState = {
  readonly position: Vec3
  /** Compass heading: 0 north (-z), pi/2 east (+x). */
  readonly headingRad: number
  readonly pitchRad: number
  readonly rollRad: number
  readonly speedMps: number
  readonly waypoint: number
  readonly distanceM: number
  /** Signed fraction of full steering lock, for the render rig. */
  readonly steer: number
  readonly stopped: boolean
  readonly tick: number
}

export type VehicleEntity = {
  readonly id: string
  readonly spec: VehicleSpec
  readonly state: VehicleState
  readonly previous: VehicleState
  readonly orders: VehicleOrders
  readonly side?: Side
}

function terrainPose(position: Vec3, headingRad: number, spec: VehicleSpec, terrain: TerrainField | null): Pick<VehicleState, 'position' | 'pitchRad' | 'rollRad'> {
  if (terrain === null) return { position, pitchRad: 0, rollRad: 0 }
  if (spec.floats === true) return { position: v3(position.x, SEA_LEVEL_M, position.z), pitchRad: 0, rollRad: 0 }
  const f = { x: Math.sin(headingRad), z: -Math.cos(headingRad) }
  const r = { x: Math.cos(headingRad), z: Math.sin(headingRad) }
  const halfL = spec.lengthM * 0.4
  const halfW = spec.widthM * 0.4
  const front = heightAt(terrain, position.x + f.x * halfL, position.z + f.z * halfL)
  const rear = heightAt(terrain, position.x - f.x * halfL, position.z - f.z * halfL)
  const right = heightAt(terrain, position.x + r.x * halfW, position.z + r.z * halfW)
  const left = heightAt(terrain, position.x - r.x * halfW, position.z - r.z * halfW)
  return {
    position: v3(position.x, heightAt(terrain, position.x, position.z), position.z),
    pitchRad: Math.atan2(front - rear, halfL * 2),
    rollRad: Math.atan2(left - right, halfW * 2),
  }
}

export function createVehicleState(spec: VehicleSpec, orders: VehicleOrders, terrain: TerrainField | null): VehicleState {
  if (orders.waypoints.length === 0) throw new Error('vehicle route needs at least one waypoint')
  if (orders.speedMps < 0 || orders.speedMps > spec.maxSpeedMps) throw new Error(`vehicle speed must be in [0, ${spec.maxSpeedMps}]`)
  const first = orders.waypoints[0]!
  const second = orders.waypoints[1] ?? first
  const headingRad = orders.headingRad ?? (second === first ? 0 : bearingTo(first, second))
  const posed = terrainPose(v3(first.x, 0, first.z), headingRad, spec, terrain)
  return {
    ...posed, headingRad, speedMps: orders.speedMps, waypoint: orders.waypoints.length > 1 ? 1 : 0,
    distanceM: 0, steer: 0, stopped: orders.speedMps === 0 || orders.waypoints.length < 2, tick: 0,
  }
}

/** Fixed-step authored-route motion. It reads only orders, terrain and the previous state. */
export function stepVehicle(
  spec: VehicleSpec, state: VehicleState, orders: VehicleOrders, ctx: Pick<SimContext, 'dt' | 'tick' | 'terrain'>,
  destroyed = false,
): VehicleState {
  // F8A Task 5: a vehicle that is already at rest (a placed truck, a parked dozer, a destroyed hulk that has stopped)
  // needs no new pose: the ground under it has not changed, and `vehicleOnTerrain` re-seats it whenever a new terrain
  // field arrives. Measured 2026-10-16: re-posing 12 of them cost about 5 microseconds a tick (tools/sites/vehicleCost.ts).
  // Same state back, only the clock moves, so every number a checksum reads is unchanged.
  if (state.stopped && state.speedMps === 0 && state.steer === 0) return state.tick === ctx.tick ? state : { ...state, tick: ctx.tick }
  if (destroyed || state.stopped || orders.speedMps === 0) {
    const posed = terrainPose(state.position, state.headingRad, spec, ctx.terrain ?? null)
    return { ...state, ...posed, speedMps: 0, steer: 0, stopped: true, tick: ctx.tick }
  }
  const speedMps = Math.min(orders.speedMps, spec.maxSpeedMps)
  let waypoint = state.waypoint
  let stopped = false
  let x = state.position.x
  let z = state.position.z
  let headingRad = state.headingRad
  let steer = 0
  let distanceM = state.distanceM
  let timeLeftS = ctx.dt
  // At a corner, time left in this tick first pays for the bounded heading
  // change, then continues down the next leg. This avoids both the old
  // instantaneous heading snap and throwing away the rest of a long tick.
  for (let transitions = 0; timeLeftS > 1e-12 && !stopped && transitions <= orders.waypoints.length; transitions++) {
    const target = orders.waypoints[waypoint]
    if (target === undefined) { stopped = true; break }
    const dx = target.x - x
    const dz = target.z - z
    const remainingM = Math.hypot(dx, dz)
    if (remainingM <= 1e-9) {
      if (waypoint + 1 < orders.waypoints.length) waypoint++
      else if (orders.loop) waypoint = 0
      else stopped = true
      continue
    }

    const desired = bearingTo({ x, z }, target)
    const error = wrapPi(desired - headingRad)
    if (Math.abs(error) > 1e-12) {
      const maxTurn = spec.turnRateRadPerS * timeLeftS
      const turn = Math.max(-maxTurn, Math.min(maxTurn, error))
      headingRad = wrapPi(headingRad + turn)
      steer = Math.max(-1, Math.min(1, turn / (spec.turnRateRadPerS * ctx.dt)))
      timeLeftS -= Math.abs(turn) / spec.turnRateRadPerS
      if (Math.abs(turn) + 1e-12 < Math.abs(error)) break
    }

    const travelM = speedMps * timeLeftS
    if (remainingM <= travelM + 1e-9) {
      x = target.x
      z = target.z
      distanceM += remainingM
      timeLeftS = Math.max(0, timeLeftS - remainingM / speedMps)
      if (waypoint + 1 < orders.waypoints.length) waypoint++
      else if (orders.loop) waypoint = 0
      else stopped = true
    } else {
      x += Math.sin(headingRad) * travelM
      z -= Math.cos(headingRad) * travelM
      distanceM += travelM
      timeLeftS = 0
    }
  }
  const posed = terrainPose(v3(x, state.position.y, z), headingRad, spec, ctx.terrain ?? null)
  return {
    ...posed, headingRad, speedMps: stopped ? 0 : speedMps, waypoint,
    distanceM, steer, stopped, tick: ctx.tick,
  }
}

/** Re-seat a not-yet-stepped vehicle when the asynchronous terrain field arrives. */
export function vehicleOnTerrain(entity: VehicleEntity, terrain: TerrainField): VehicleEntity {
  const pose = terrainPose(entity.state.position, entity.state.headingRad, entity.spec, terrain)
  const state = { ...entity.state, ...pose }
  return { ...entity, state, previous: state }
}
