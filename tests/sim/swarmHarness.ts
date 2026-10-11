import { performance } from 'node:perf_hooks'
import { loadScenario, bundleForScenario } from '../../tools/content/load.js'
import { advance, withAircraftState, type Stepper, type World } from '../../src/sim/loop.js'
import { worldFromScenario } from '../../src/sim/scenario.js'
import { withSwarm, SWARM_PROBE_ANCHOR, type Swarm } from '../../src/sim/swarm.js'
import { initialAircraftState } from '../../src/render/spawn.js'
import { DT, step } from '../../src/sim/flight/model.js'
import { v3 } from '../../src/sim/math/vec3.js'
import type { GodMode } from '../../src/sim/godMode.js'
import type { TerrainField } from '../../src/sim/world/terrain.js'

/**
 * The world the entity-scaling capture flies (plan 2026-10-10-entity-scaling), built headlessly:
 * free-flight, the player moved by the DEV spawn override to `SWARM_PROBE_ANCHOR` (as `main.ts`'s
 * `buildWorld` does it), the swarm around it, God mode on the player so it flies the whole window.
 * With a terrain field, `worldFromScenario` also asserts every ship's loop is over water.
 */
export function swarmWorld(swarm: Swarm, terrain: TerrainField | null): { world: World<undefined>; god: GodMode } {
  const w = worldFromScenario(bundleForScenario(withSwarm(loadScenario('free-flight'), swarm, SWARM_PROBE_ANCHOR)), terrain)
  const a = SWARM_PROBE_ANCHOR
  const world = withAircraftState({ ...w, aircraft: w.aircraft.map((x) => (x.id === w.player ? { ...x, parked: false } : x)) },
    w.player, initialAircraftState(v3(a.x, a.y, a.z), false))
  return { world, god: { stores: world.combat.aircraft[world.player]!.stores } }
}

export type TickTiming = { readonly msPerTick: readonly number[]; readonly world: World<undefined> }

/** Advances `ticks` single ticks, timing each one with the wall clock. */
export function timeTicks(world: World<undefined>, god: GodMode, ticks: number, stepper: Stepper = step): TickTiming {
  const msPerTick: number[] = []
  let w = world
  for (let i = 0; i < ticks; i++) {
    const t0 = performance.now()
    w = advance(w, DT, stepper, undefined, false, god).world
    msPerTick.push(performance.now() - t0)
  }
  return { msPerTick, world: w }
}
