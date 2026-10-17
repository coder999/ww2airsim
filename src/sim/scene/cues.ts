import { DT } from '../flight/model.js'
import type { World } from '../loop.js'
import { spawnInto } from '../mission/spawn.js'
import { ticksFor } from '../mission/state.js'
import type { Preroll } from './preroll.js'
import type { Cue, EntityOrderT, Scene } from './schema.js'

/** What a cue hands the renderer: it changed no simulation state. */
export type Emitted = Extract<Cue['order'], { kind: 'message' | 'fx' }> & { readonly t: number }

type Due<M> = { world: World<M>; mission: World<M>['mission']; nextCue: number; emitted: readonly Emitted[] }

/** Every cue that names an entity or group must name one this world has (or a held group will bring). Throws at load, not in flight. */
export function checkScene<M>(world: World<M>, mission: World<M>['mission'], scene: Scene): void {
  const held = mission?.held ?? []
  const ids = new Set<string>([
    ...world.aircraft.map((a) => a.id), ...world.ships.map((s) => s.id), ...world.vehicles.map((v) => v.id),
    ...held.flatMap((g) => [...g.aircraft.map((a) => a.id), ...g.ships.map((s) => s.id), ...(g.vehicles ?? []).map((v) => v.id)]),
  ])
  for (const { order } of scene.cues) {
    if (order.kind === 'order' && !ids.has(order.entity)) throw new Error(`scene ${scene.id}: order names missing entity "${order.entity}"`)
    if (order.kind === 'spawn' && !held.some((g) => g.id === order.group)) throw new Error(`scene ${scene.id}: spawn names missing held group "${order.group}"`)
  }
}

function orderEntity<M>(world: World<M>, id: string, order: EntityOrderT): World<M> {
  const now = world.tick * DT
  if ('attack' in order) {
    return { ...world, aircraft: world.aircraft.map((a) => a.id !== id || a.pilot == null ? a : {
      ...a, pilot: { ...a.pilot, target: order.attack, decision: { ...a.pilot.decision, nextRescoreS: now } },
    }) }
  }
  if ('course' in order) {
    const { waypoints, speedMps } = order.course
    return {
      ...world,
      ships: world.ships.map((s) => s.id !== id ? s : { ...s, orders: { ...s.orders, waypoints, speedMps } }),
      vehicles: world.vehicles.map((v) => v.id !== id ? v : { ...v, orders: { ...v.orders, waypoints, speedMps } }),
    }
  }
  return { ...world, ships: world.ships.map((s) => s.id !== id ? s : { ...s, orders: { ...s.orders, fireAt: order.fireAt } }) }
}

/** Applies every cue due at `elapsedTicks` that is not yet applied, in file order. */
export function applyDueCues<M>(p: Preroll<M>, elapsedTicks: number): Due<M> {
  let world = p.world
  let mission = p.mission
  let nextCue = p.nextCue
  const emitted = [...p.emitted]
  const cues = p.scene.cues
  while (nextCue < cues.length && ticksFor(cues[nextCue]!.t) <= elapsedTicks) {
    const { t, order } = cues[nextCue]!
    nextCue++
    if (order.kind === 'message' || order.kind === 'fx') emitted.push({ ...order, t })
    else if (order.kind === 'order') world = orderEntity(world, order.entity, order.order)
    else if (mission !== null) {
      const s = spawnInto({ tick: world.tick, aircraft: world.aircraft, ships: world.ships, vehicles: world.vehicles, combat: world.combat, mission, terrain: world.terrain }, order.group)
      world = { ...world, aircraft: s.aircraft, ships: s.ships, vehicles: s.vehicles, combat: s.combat }
      mission = s.mission
    }
  }
  return { world, mission, nextCue, emitted }
}
