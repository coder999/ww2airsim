import type { Scene } from 'three'
import { createShipMesh } from './scene/ship.js'
import { createEngineSmoke } from './scene/smoke.js'
import { loadWildcat } from './scene/wildcat.js'
import type { Airframe } from './scene/airframe.js'
import { disposeMeshTree } from './models/dispose.js'
import type { World } from '../sim/loop.js'

export { disposeMeshTree }

/**
 * Every mesh handle sized to one scenario's entity lists. `main.ts`'s render
 * loop indexes `airframes[i]`/`shipHandles[i]`/`smokes[i]` against
 * `frame.poses`/`frame.shipPoses`/`frame.world.aircraft`, which are built in
 * the same world order (Plan 12) -- so these three stay parallel arrays, not
 * maps. `player` is the PLAYER's own `Airframe`, picked out by id rather than
 * assumed to be index 0: a scenario is free to list the wingman first.
 */
export interface ScenarioEntities {
  readonly airframes: readonly Airframe[]
  readonly shipHandles: readonly ReturnType<typeof createShipMesh>[]
  readonly smokes: readonly ReturnType<typeof createEngineSmoke>[]
  readonly player: Airframe
}

/**
 * Builds one airframe mesh per `world.aircraft` entry and one hull per
 * `world.ships` entry, in world order, plus one engine-smoke trail per
 * airframe as a child of its own root so it rides the airplane (Plan 6) --
 * the exact construction `main.ts`'s `boot()` always did inline, extracted
 * so it can run again from `loadScenario` (Plan 9 Task 7) without also
 * rebuilding terrain, ocean or sky: those are world geography, not scenario
 * content (design doc §5), and are untouched by this function and its
 * caller alike.
 *
 * `previous`, when given, is torn down AFTER the new airframes have loaded:
 * each airframe through its own `dispose()` (which releases its shared model
 * instance, never walks it -- modelCache.ts), each smoke trail and hull
 * through `disposeMeshTree`. Loading first means a model both scenarios use
 * keeps its one parse through the switch, and a load that fails leaves the
 * running scenario exactly as it was.
 */
export async function buildScenarioEntities(
  scene: Scene,
  world: Pick<World<undefined>, 'aircraft' | 'ships' | 'player'>,
  previous: ScenarioEntities | null,
  // Defaulted for production; tests substitute a cheap synchronous stand-in
  // (createHellcat) so they never run a real GLTFLoader parse in Node.
  loadAirframe: () => Promise<Airframe> = loadWildcat,
): Promise<ScenarioEntities> {
  const settled = await Promise.allSettled(world.aircraft.map(() => loadAirframe()))
  const failed = settled.find((r): r is PromiseRejectedResult => r.status === 'rejected')
  if (failed !== undefined) {
    for (const r of settled) if (r.status === 'fulfilled') r.value.dispose()
    throw failed.reason
  }
  const airframes = settled.map((r) => (r as PromiseFulfilledResult<Airframe>).value)

  if (previous !== null) {
    previous.airframes.forEach((a, i) => {
      scene.remove(a.root)
      disposeMeshTree(previous.smokes[i]!.object)
      a.dispose()
    })
    for (const handle of previous.shipHandles) {
      disposeMeshTree(handle.root)
      scene.remove(handle.root)
    }
  }

  for (const a of airframes) scene.add(a.root)
  const smokes = airframes.map((a) => {
    const smoke = createEngineSmoke()
    a.root.add(smoke.object)
    return smoke
  })
  const playerIndex = world.aircraft.findIndex((a) => a.id === world.player)
  const player = airframes[playerIndex]!
  const shipHandles = world.ships.map((ship) => createShipMesh(ship.spec))
  for (const h of shipHandles) scene.add(h.root)

  return { airframes, shipHandles, smokes, player }
}
