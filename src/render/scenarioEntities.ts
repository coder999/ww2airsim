import { Mesh, type Object3D, type Scene } from 'three'
import { createShipMesh } from './scene/ship.js'
import { createEngineSmoke } from './scene/smoke.js'
import { loadWildcat } from './scene/wildcat.js'
import type { Airframe } from './scene/airframe.js'
import type { World } from '../sim/loop.js'

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
 * Frees the GPU resources a mesh subtree holds -- every `Mesh`'s geometry
 * buffer and material(s) -- and leaves `root` itself for the caller to
 * remove from the scene graph.
 *
 * Plan 9 Task 7 (design doc §5): nothing in this codebase disposed an
 * aircraft or ship mesh before this task, because `airframes`/`shipHandles`
 * were built once at boot and lived for the page's whole lifetime. Written
 * as an explicit walk over every `Mesh` under `root`, rather than trusted to
 * cascade from a single call: `Object3D.remove` alone drops the scene
 * graph's references but leaves the GPU buffers allocated, which would leak
 * a little more on every repeated scenario switch.
 */
export function disposeMeshTree(root: Object3D): void {
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return
    node.geometry.dispose()
    const material = node.material
    if (Array.isArray(material)) material.forEach((m) => m.dispose())
    else material.dispose()
  })
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
 * `previous`, when given, is disposed first via `disposeMeshTree` on every
 * handle's `root` and removed from `scene` -- the caller passes the
 * scenario currently loaded (or `null`, on the very first call) so a switch
 * cannot leak the meshes it is replacing.
 */
export async function buildScenarioEntities(
  scene: Scene,
  world: Pick<World<undefined>, 'aircraft' | 'ships' | 'player'>,
  previous: ScenarioEntities | null,
  // Defaulted for production; tests substitute a cheap synchronous stand-in
  // (createHellcat) so they never run a real GLTFLoader parse in Node --
  // see this task's Files section for why that matters.
  loadAirframe: () => Promise<Airframe> = loadWildcat,
): Promise<ScenarioEntities> {
  if (previous !== null) {
    for (const handle of [...previous.airframes, ...previous.shipHandles]) {
      disposeMeshTree(handle.root)
      scene.remove(handle.root)
    }
  }

  // One airframe load per aircraft in the scenario (player and any wingman
  // alike -- Review Focus above), in parallel: a scenario with two entries
  // should not pay for two sequential network round-trips.
  const airframes = await Promise.all(world.aircraft.map(() => loadAirframe()))
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
