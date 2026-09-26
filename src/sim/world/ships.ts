import { z } from 'zod'
import type { SimContext } from '../loop.js'
import { type Vec3, v3 } from '../math/vec3.js'
import { heightAt, SEA_LEVEL_M, type TerrainField } from './terrain.js'

/**
 * Ships: pure kinematics on a closed waypoint loop (spec §5).
 *
 * A ship is a reference frame the airplane will one day land on (Plan 8),
 * not another airplane: it has no aerodynamics, no assists and no impact.
 * It holds an ordered speed, turns toward its current waypoint at no more
 * than its class's turn rate, and switches waypoint once within a ship's
 * length of it -- a length, not a distance of zero, because a turn-rate-
 * limited hull that cannot reach the exact point must not orbit it.
 *
 * `src/sim/` rules apply: no `render/`, no Node core, no `Math.random`, no
 * wall clock. Only `Math.sin`/`cos`/`atan2` enter, which is why goldens
 * assert within tolerance across engines (master spec §3).
 */

const finite = z.number().refine(Number.isFinite, { message: 'must be a finite number' })
const positive = finite.refine((n) => n > 0, { message: 'must be greater than zero' })

/** LSO cue parameters; the function that reads them is `src/sim/paddles.ts`. */
const PaddlesObject = z
  .object({
    glideslopeDeg: positive,
    glideslopeToleranceDeg: positive,
    speedBandMps: positive,
    coneHalfAngleDeg: positive,
    maxRangeM: positive,
    cutRangeM: positive,
    waveOffRangeM: positive,
  })
  .strict()
  .refine((p) => p.cutRangeM <= p.waveOffRangeM, {
    message: 'cutRangeM must not exceed waveOffRangeM', path: ['cutRangeM'],
  })
  .refine((p) => p.waveOffRangeM <= p.maxRangeM, {
    message: 'waveOffRangeM must not exceed maxRangeM', path: ['waveOffRangeM'],
  })

const ShipSpecObject = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    role: z.enum(['carrier', 'cruiser', 'battleship', 'escort', 'merchant']),
    lengthM: positive,
    beamM: positive,
    deckWidthM: positive,
    deckHeightM: positive,
    maxSpeedMps: positive,
    turnRateRadPerS: positive,
    hullHp: positive,
    /** The flight deck a Plan 8 `Deck` is derived from: a rectangle centered
     *  on the ship's position, `heightM` above the waterline. Carriers only. */
    flightDeck: z.object({ lengthM: positive, widthM: positive, heightM: positive }).strict().optional(),
    /** The arcade trap zone, meters forward of the stern. */
    trapZone: z
      .object({ fromSternM: finite.refine((n) => n >= 0, { message: 'must not be negative' }), toSternM: positive })
      .strict()
      .refine((z) => z.toSternM > z.fromSternM, { message: 'toSternM must exceed fromSternM', path: ['toSternM'] })
      .optional(),
    paddles: PaddlesObject.optional(),
    /** Render-only; `sim/` never reads it (ship-models spec §3.1). `model` is a key of
     *  src/render/scene/shipModels.ts's registry. Optional: a spec without it is drawn
     *  as the procedural boxes, a supported state. */
    view: z.object({ model: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, { message: 'must be a lowercase model id' }) }).strict().optional(),
    reference: z.object({ source: z.string().min(1) }).strict(),
  })
  .strict()
  .refine((s) => s.flightDeck === undefined || s.flightDeck.heightM === s.deckHeightM, {
    message: 'flightDeck.heightM must equal deckHeightM', path: ['flightDeck', 'heightM'],
  })

export type ShipSpec = z.infer<typeof ShipSpecObject>
export type PaddlesParams = z.infer<typeof PaddlesObject>

/** Spec §9 of the master design: malformed content fails loudly at load,
 *  with every offending field named, the same way `parseAircraftSpec` does. */
export function parseShipSpec(raw: unknown): ShipSpec {
  const result = ShipSpecObject.safeParse(raw)
  if (!result.success) {
    const detail = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Invalid ship spec: ${detail}`)
  }
  return result.data
}

export type ShipState = {
  /** World meters. `y` is always `SEA_LEVEL_M`: the sim has no waves. */
  readonly position: Vec3
  /** Compass heading: 0 north (-z), pi/2 east (+x) -- the gauges' own
   *  `atan2(forward.x, -forward.z)`. Kept in (-pi, pi] by `wrapPi`. */
  readonly headingRad: number
  readonly speedMps: number
  /** Index into `ShipOrders.waypoints` of the point currently steered for. */
  readonly waypoint: number
  /** The tick this state is the result of, like `AircraftState.tick`. */
  readonly tick: number
}

export type ShipOrders = {
  /** A closed loop, visited in order, repeated. At least two points. */
  readonly waypoints: readonly { readonly x: number; readonly z: number }[]
  readonly speedMps: number
}

export const createShipState = (init: Partial<ShipState> = {}): ShipState => ({
  position: init.position ?? v3(0, SEA_LEVEL_M, 0),
  headingRad: init.headingRad ?? 0,
  speedMps: init.speedMps ?? 0,
  waypoint: init.waypoint ?? 0,
  tick: init.tick ?? 0,
})

/** Angle wrapped into (-pi, pi]. */
export function wrapPi(a: number): number {
  const twoPi = 2 * Math.PI
  let r = a - twoPi * Math.floor((a + Math.PI) / twoPi)
  if (r <= -Math.PI) r += twoPi
  return r
}

/** Velocity for a compass heading (spec §5.2): +x east, +z south, so north is
 *  -z. Pinned against the gauge formula by tests/sim/world/ships.test.ts. */
export function shipVelocity(headingRad: number, speedMps: number): Vec3 {
  return v3(Math.sin(headingRad) * speedMps, 0, -Math.cos(headingRad) * speedMps)
}

/** Compass bearing from one point to another, same convention. */
export function bearingTo(
  from: { readonly x: number; readonly z: number },
  to: { readonly x: number; readonly z: number },
): number {
  return Math.atan2(to.x - from.x, -(to.z - from.z))
}

export function stepShip(spec: ShipSpec, state: ShipState, orders: ShipOrders, ctx: SimContext): ShipState {
  const dt = ctx.dt
  const n = orders.waypoints.length
  let waypoint = ((state.waypoint % n) + n) % n
  let target = orders.waypoints[waypoint]!

  // Arrival is judged at the START of the step, before steering, so a ship
  // that crossed its waypoint last tick steers for the next one this tick
  // rather than turning back for a point it has already passed.
  const dist = Math.hypot(target.x - state.position.x, target.z - state.position.z)
  if (dist <= spec.lengthM) {
    waypoint = (waypoint + 1) % n
    target = orders.waypoints[waypoint]!
  }

  // If the target is at the ship's position (zero-distance), maintain current heading
  // to avoid atan2(0, -0) = pi artifact (spec §5.3).
  const newDist = Math.hypot(target.x - state.position.x, target.z - state.position.z)
  const wanted = newDist === 0 ? state.headingRad : bearingTo(state.position, target)
  const maxTurn = spec.turnRateRadPerS * dt
  const delta = wrapPi(wanted - state.headingRad)
  const turn = delta > maxTurn ? maxTurn : delta < -maxTurn ? -maxTurn : delta
  const headingRad = wrapPi(state.headingRad + turn)

  // A non-finite order is "stopped", the same posture `clampFinite` takes for
  // a broken control channel: fail toward the less energetic behavior.
  const ordered = Number.isFinite(orders.speedMps) ? orders.speedMps : 0
  const speedMps = ordered < 0 ? 0 : ordered > spec.maxSpeedMps ? spec.maxSpeedMps : ordered

  const velocity = shipVelocity(headingRad, speedMps)
  return {
    position: v3(state.position.x + velocity.x * dt, SEA_LEVEL_M, state.position.z + velocity.z * dt),
    headingRad,
    speedMps,
    waypoint,
    tick: ctx.tick,
  }
}

/**
 * Content validation (spec §5.4): every leg of the loop, sampled every
 * `sampleM`, must read as water on the field the physics uses. A ship whose
 * loop crosses land is malformed content and fails at load, not on the beach.
 */
export function assertLoopOverWater(id: string, orders: ShipOrders, terrain: TerrainField, sampleM = 100): void {
  const wps = orders.waypoints
  for (let i = 0; i < wps.length; i++) {
    const a = wps[i]!
    const b = wps[(i + 1) % wps.length]!
    const len = Math.hypot(b.x - a.x, b.z - a.z)
    const samples = Math.max(1, Math.ceil(len / sampleM))
    for (let s = 0; s <= samples; s++) {
      const t = s / samples
      const x = a.x + (b.x - a.x) * t
      const z = a.z + (b.z - a.z) * t
      const h = heightAt(terrain, x, z)
      if (h > SEA_LEVEL_M) {
        throw new Error(
          `ship ${id}: leg ${i} of its loop crosses land at (${x.toFixed(0)}, ${z.toFixed(0)}), ` +
            `${h.toFixed(1)} m above sea level`,
        )
      }
    }
  }
}
