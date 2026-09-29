import { playerAircraft, type World } from '../sim/loop.js'
import { interpolateAircraft, interpolateShip, type RenderState, type ShipPose } from '../sim/interpolate.js'
import { DT } from '../sim/flight/model.js'
import { length, v3 } from '../sim/math/vec3.js'
import type { Recording } from './recorder.js'

export type ReplayPoses = {
  /** The world everything but the poses is drawn from: the LATER of the pair, as live draws world N with lerp(N-1, N). */
  readonly world: World<undefined>
  readonly poses: readonly RenderState[]
  readonly shipPoses: readonly ShipPose[]
  readonly render: RenderState
  readonly speedMps: number
  /** `world.tick * DT`. */
  readonly tickTimeS: number
}

/**
 * The recorded moment at sim time `tS` (plan R-1, R-2). Between two recorded
 * worlds A and B, each entity is lerped from A's `state` to B's, matched by
 * id, so a gap of several ticks (triple time) is still continuous; an entity
 * that is not in A (a spawn) uses B's own previous -> state. Before the
 * first world it is the first; past the last, the last, held (spec §3
 * "After the last tick").
 */
export function replayPosesAt(rec: Recording, tS: number): ReplayPoses {
  const ws = rec.worlds
  let i = 0
  // Strict `<`: at an EXACT recorded tick time, this must land on that tick
  // itself (b = that world, alpha = 1), not treat it as alpha=0 into the
  // next one -- `<=` here would attribute an exact hit to the wrong world
  // (verified by the "at a recorded tick time" test below).
  while (i + 1 < ws.length && ws[i + 1]!.tick * DT < tS) i++
  const heldOrFirst = i === ws.length - 1 || tS <= ws[0]!.tick * DT
  const b = heldOrFirst ? ws[i]! : ws[i + 1]!
  const a = heldOrFirst ? b : ws[i]!
  const alpha = heldOrFirst ? 1 : (tS - a.tick * DT) / ((b.tick - a.tick) * DT)
  const aAircraft = new Map(a.aircraft.map((e) => [e.id, e.state] as const))
  const aShips = new Map(a.ships.map((s) => [s.id, s.state] as const))
  const poses = b.aircraft.map((e) => {
    const from = heldOrFirst ? undefined : aAircraft.get(e.id)
    return from === undefined ? interpolateAircraft(e.state, e.state, 1) : interpolateAircraft(from, e.state, alpha)
  })
  const shipPoses = b.ships.map((s) => {
    const from = heldOrFirst ? undefined : aShips.get(s.id)
    return from === undefined ? interpolateShip(s.state, s.state, 1) : interpolateShip(from, s.state, alpha)
  })
  const playerIndex = b.aircraft.findIndex((e) => e.id === b.player)
  const pb = playerAircraft(b).state.velocity
  const pa = heldOrFirst ? pb : (aAircraft.get(b.player)?.velocity ?? pb)
  const speedMps = length(v3(pa.x + (pb.x - pa.x) * alpha, pa.y + (pb.y - pa.y) * alpha, pa.z + (pb.z - pa.z) * alpha))
  return { world: b, poses, shipPoses, render: poses[playerIndex]!, speedMps, tickTimeS: b.tick * DT }
}
