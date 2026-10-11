import { z } from 'zod'
import type { SimContext } from '../loop.js'
import { type Vec3, v3 } from '../math/vec3.js'
import type { Side } from '../sides.js'
import { heightAt, type TerrainField } from './terrain.js'
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
  view: z.object({ model: z.string().regex(/^[a-z0-9][a-z0-9-]*$/) }).strict(),
}).strict()

export type VehicleSpec = z.infer<typeof VehicleSpecObject>
export const parseVehicleSpec = (raw: unknown): VehicleSpec => VehicleSpecObject.parse(raw)

export type VehicleOrders = {
  readonly waypoints: readonly { readonly x: number; readonly z: number }[]
  readonly speedMps: number
  readonly loop: boolean
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
  const headingRad = second === first ? 0 : bearingTo(first, second)
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
  if (destroyed || state.stopped || orders.speedMps === 0) return { ...state, speedMps: 0, steer: 0, stopped: true, tick: ctx.tick }
  const target = orders.waypoints[state.waypoint]
  if (target === undefined) return { ...state, speedMps: 0, steer: 0, stopped: true, tick: ctx.tick }
  const dx = target.x - state.position.x
  const dz = target.z - state.position.z
  const remaining = Math.hypot(dx, dz)
  const travel = Math.min(orders.speedMps, spec.maxSpeedMps) * ctx.dt
  let waypoint = state.waypoint
  let stopped = false
  let x = state.position.x
  let z = state.position.z
  let headingRad = state.headingRad
  let steer = 0
  if (remaining <= travel + 1e-9) {
    x = target.x
    z = target.z
    if (waypoint + 1 < orders.waypoints.length) waypoint++
    else if (orders.loop) waypoint = 0
    else stopped = true
    const next = orders.waypoints[waypoint]
    if (!stopped && next !== undefined) headingRad = bearingTo({ x, z }, next)
  } else {
    const desired = bearingTo({ x: state.position.x, z: state.position.z }, target)
    const error = wrapPi(desired - state.headingRad)
    const maxTurn = spec.turnRateRadPerS * ctx.dt
    const turn = Math.max(-maxTurn, Math.min(maxTurn, error))
    headingRad = wrapPi(state.headingRad + turn)
    steer = maxTurn <= 0 ? 0 : turn / maxTurn
    x += Math.sin(headingRad) * travel
    z -= Math.cos(headingRad) * travel
  }
  const posed = terrainPose(v3(x, state.position.y, z), headingRad, spec, ctx.terrain ?? null)
  return {
    ...posed, headingRad, speedMps: stopped ? 0 : Math.min(orders.speedMps, spec.maxSpeedMps), waypoint,
    distanceM: state.distanceM + Math.hypot(x - state.position.x, z - state.position.z), steer, stopped, tick: ctx.tick,
  }
}

/** Re-seat a not-yet-stepped vehicle when the asynchronous terrain field arrives. */
export function vehicleOnTerrain(entity: VehicleEntity, terrain: TerrainField): VehicleEntity {
  const pose = terrainPose(entity.state.position, entity.state.headingRad, entity.spec, terrain)
  const state = { ...entity.state, ...pose }
  return { ...entity, state, previous: state }
}
