import type { Scene } from 'three'
import type { ShipView } from './scene/ship.js'
import { loadRegisteredShipView, type LoadShipView } from './scene/shipModels.js'
import { createEngineSmoke } from './scene/smoke.js'
import { airframeFor } from './scene/airframes.js'
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
  readonly shipHandles: readonly ShipView[]
  readonly smokes: readonly ReturnType<typeof createEngineSmoke>[]
  readonly player: Airframe
}

/** Builds the airframe a spec's `view.model` names. Injectable so tests
 *  substitute a cheap synchronous stand-in and never run GLTFLoader in Node. */
export type LoadAirframe = (modelId: string) => Promise<Airframe>

export const loadRegisteredAirframe: LoadAirframe = (modelId) => airframeFor(modelId)()

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
 * `previous`, when given, is torn down AFTER the new airframes and ships have
 * loaded: each airframe and each ship through its own `dispose()` (which
 * releases a shared model instance, never walks it -- modelCache.ts), each
 * smoke trail through `disposeMeshTree`. Loading first means a model both scenarios use
 * keeps its one parse through the switch, and a load that fails leaves the
 * running scenario exactly as it was.
 */
export async function buildScenarioEntities(
  scene: Scene,
  world: Pick<World<undefined>, 'aircraft' | 'ships' | 'player'>,
  previous: ScenarioEntities | null,
  // Defaulted for production; tests substitute a cheap synchronous stand-in
  // (createHellcat) so they never run a real GLTFLoader parse in Node.
  loadAirframe: LoadAirframe = loadRegisteredAirframe,
  // Ship-models spec §3.3-3.4: never rejects; a model that fails draws boxes
  // and reports through the loader's own sink (main.ts passes validationErrors).
  loadShip: LoadShipView = loadRegisteredShipView,
): Promise<ScenarioEntities> {
  const [settled, shipSettled] = await Promise.all([
    Promise.allSettled(world.aircraft.map((a) => loadAirframe(a.spec.view.model))),
    Promise.allSettled(world.ships.map((s) => loadShip(s.spec))),
  ])
  const failed = [...settled, ...shipSettled].find((r): r is PromiseRejectedResult => r.status === 'rejected')
  if (failed !== undefined) {
    for (const r of settled) if (r.status === 'fulfilled') r.value.dispose()
    for (const r of shipSettled) if (r.status === 'fulfilled') r.value.dispose()
    throw failed.reason
  }
  const airframes = settled.map((r) => (r as PromiseFulfilledResult<Airframe>).value)
  const shipHandles = shipSettled.map((r) => (r as PromiseFulfilledResult<ShipView>).value)

  if (previous !== null) {
    previous.airframes.forEach((a, i) => {
      scene.remove(a.root)
      disposeMeshTree(previous.smokes[i]!.object)
      a.dispose()
    })
    // Through each view's own dispose(): a model view RELEASES its shared
    // instance. disposeMeshTree on its root would free geometry and materials
    // every other instance of that glb is still drawing (modelCache.ts).
    for (const handle of previous.shipHandles) {
      scene.remove(handle.root)
      handle.dispose()
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
  for (const h of shipHandles) scene.add(h.root)

  return { airframes, shipHandles, smokes, player }
}
