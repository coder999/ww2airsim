import type { Scene } from 'three'
import type { ShipView } from './scene/ship.js'
import { loadRegisteredShipView, type LoadShipView } from './scene/shipModels.js'
import { airframeFor } from './scene/airframes.js'
import type { Airframe } from './scene/airframe.js'
import type { StoreMounts } from './scene/stores.js'
import { disposeMeshTree } from './models/dispose.js'
import type { World } from '../sim/loop.js'

export { disposeMeshTree }

/**
 * Every mesh handle sized to one scenario's entity lists. `main.ts`'s render
 * loop indexes `airframes[i]`/`shipHandles[i]` against
 * `frame.poses`/`frame.shipPoses`/`frame.world.aircraft`, which are built in
 * the same world order (Plan 12) -- so these two stay parallel arrays, not
 * maps. `player` is the PLAYER's own `Airframe`, picked out by id rather than
 * assumed to be index 0: a scenario is free to list the wingman first.
 */
export interface ScenarioEntities {
  readonly airframes: readonly Airframe[]
  readonly shipHandles: readonly ShipView[]
  readonly player: Airframe
  /** A mission's held-group meshes, keyed by entity id (M2 R1): world order
   *  cannot index them, since `spawnInto` appends in trigger order.
   *  `entityViews` (mission/entityViews.ts) merges them into world order. */
  readonly held: { readonly airframes: ReadonlyMap<string, Airframe>; readonly ships: ReadonlyMap<string, ShipView> }
}

/** Builds the airframe a spec's `view.model` names, receiving the spec's store mounts
 *  (`spec.stores`; undefined = none hung, O1). Injectable so tests substitute a cheap
 *  synchronous stand-in and never run GLTFLoader in Node. */
export type LoadAirframe = (modelId: string, stores: StoreMounts | undefined) => Promise<Airframe>

export const loadRegisteredAirframe: LoadAirframe = (modelId, stores) => airframeFor(modelId)(stores)

/**
 * Builds one airframe mesh per `world.aircraft` entry and one hull per
 * `world.ships` entry, in world order -- the exact construction `main.ts`'s
 * `boot()` always did inline, extracted so it can run again from
 * `loadScenario` (Plan 9 Task 7) without also rebuilding terrain, ocean or
 * sky: those are world geography, not scenario content (design doc §5), and
 * are untouched by this function and its caller alike.
 *
 * A mission's held-group meshes are built here at load too, added to the
 * scene hidden, and shown only once their entity spawns (M2 R1). They are
 * keyed by id rather than appended to the world-order arrays, because
 * `spawnInto` appends held entities in trigger order, not `heldGroups` order.
 *
 * `previous`, when given, is torn down AFTER the new airframes and ships have
 * loaded: each airframe and each ship through its own `dispose()` (which
 * releases a shared model instance, never walks it -- modelCache.ts). Loading
 * first means a model both scenarios use keeps its one parse through the
 * switch, and a load that fails leaves the running scenario exactly as it
 * was.
 */
export async function buildScenarioEntities(
  scene: Scene,
  world: Pick<World<undefined>, 'aircraft' | 'ships' | 'player' | 'mission'>,
  previous: ScenarioEntities | null,
  // Defaulted for production; tests substitute a cheap synchronous stand-in
  // (createHellcat) so they never run a real GLTFLoader parse in Node. It receives
  // each aircraft's spec store mounts, so stores hang where the sim releases them (O1).
  loadAirframe: LoadAirframe = loadRegisteredAirframe,
  // Ship-models spec §3.3-3.4: never rejects; a model that fails draws boxes
  // and reports through the loader's own sink (main.ts passes validationErrors).
  loadShip: LoadShipView = loadRegisteredShipView,
): Promise<ScenarioEntities> {
  const heldAircraft = (world.mission?.held ?? []).flatMap((g) => g.aircraft)
  const heldShips = (world.mission?.held ?? []).flatMap((g) => g.ships)
  const [settled, shipSettled, heldSettled, heldShipSettled] = await Promise.all([
    Promise.allSettled(world.aircraft.map((a) => loadAirframe(a.spec.view.model, a.spec.stores))),
    Promise.allSettled(world.ships.map((s) => loadShip(s.spec))),
    Promise.allSettled(heldAircraft.map((a) => loadAirframe(a.spec.view.model, a.spec.stores))),
    Promise.allSettled(heldShips.map((s) => loadShip(s.spec))),
  ])
  const all = [...settled, ...shipSettled, ...heldSettled, ...heldShipSettled]
  const failed = all.find((r): r is PromiseRejectedResult => r.status === 'rejected')
  if (failed !== undefined) {
    for (const r of all) if (r.status === 'fulfilled') r.value.dispose()
    throw failed.reason
  }
  const airframes = settled.map((r) => (r as PromiseFulfilledResult<Airframe>).value)
  const shipHandles = shipSettled.map((r) => (r as PromiseFulfilledResult<ShipView>).value)
  const heldAirframes = heldSettled.map((r) => (r as PromiseFulfilledResult<Airframe>).value)
  const heldShipHandles = heldShipSettled.map((r) => (r as PromiseFulfilledResult<ShipView>).value)

  if (previous !== null) {
    previous.airframes.forEach((a) => {
      scene.remove(a.root)
      a.dispose()
    })
    // Through each view's own dispose(): a model view RELEASES its shared
    // instance. disposeMeshTree on its root would free geometry and materials
    // every other instance of that glb is still drawing (modelCache.ts).
    for (const handle of [...previous.shipHandles, ...previous.held.ships.values()]) {
      scene.remove(handle.root)
      handle.dispose()
    }
    for (const a of previous.held.airframes.values()) {
      scene.remove(a.root)
      a.dispose()
    }
  }

  for (const a of airframes) scene.add(a.root)
  const playerIndex = world.aircraft.findIndex((a) => a.id === world.player)
  const player = airframes[playerIndex]!
  for (const h of shipHandles) scene.add(h.root)
  for (const h of [...heldAirframes, ...heldShipHandles]) {
    h.root.visible = false
    scene.add(h.root)
  }

  return {
    airframes,
    shipHandles,
    player,
    held: {
      airframes: new Map(heldAircraft.map((a, i) => [a.id, heldAirframes[i]!])),
      ships: new Map(heldShips.map((s, i) => [s.id, heldShipHandles[i]!])),
    },
  }
}
