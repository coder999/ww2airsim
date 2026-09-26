// src/render/scene/shipModels.ts
import type { ShipSpec } from '../../sim/world/ships.js'
import { shipModelUrl } from '../content.js'
import { acquireModel, type ModelInstance } from '../models/modelCache.js'
import { createShipMesh, createShipView, type ShipView } from './ship.js'

/**
 * Model id (a ship spec's `view.model`) to its committed glb (ship-models
 * spec §3.1), the ships twin of airframes.ts. An id equals its spec id and its
 * entry id (§3.2). tests/render/shipModels.test.ts checks that every
 * content/ships JSON that names a model names one registered here, and that
 * every id here has its entry and its committed glb.
 */
export const SHIP_MODELS: Readonly<Record<string, { readonly url: string }>> = {
  'essex-cv': { url: shipModelUrl('essex-cv') },
  'fletcher-dd': { url: shipModelUrl('fletcher-dd') },
  'type-b-maru': { url: shipModelUrl('type-b-maru') },
}

export function shipModelUrlFor(modelId: string): string {
  if (!Object.hasOwn(SHIP_MODELS, modelId)) {
    throw new Error(`no ship model "${modelId}" (registered: ${Object.keys(SHIP_MODELS).join(', ')}); register it in src/render/scene/shipModels.ts`)
  }
  return SHIP_MODELS[modelId]!.url
}

/** Builds one ship's view. Never rejects: a model that fails draws the boxes (below). */
export type LoadShipView = (spec: ShipSpec) => Promise<ShipView>

/**
 * The loader, with its error sink and its cache injected (§3.4). A spec with
 * no `view.model` draws the boxes, a supported state. A model that fails to
 * load or lacks a node the view needs ALSO draws the boxes, so the game still
 * runs, AND reports the failure: `main.ts` and the hangar pass a sink that
 * pushes into their `validationErrors`, which Tier 2 asserts empty. A silent
 * fallback would ship a broken asset as boxes and nothing would notice.
 */
export function makeShipViewLoader(reportError: (message: string) => void, acquire: (url: string) => Promise<ModelInstance> = acquireModel): LoadShipView {
  return async (spec) => {
    const modelId = spec.view?.model
    if (modelId === undefined) return createShipMesh(spec)
    let instance: ModelInstance | null = null
    try {
      instance = await acquire(shipModelUrlFor(modelId))
      return createShipView(spec, modelId, instance)
    } catch (error) {
      instance?.release()
      reportError(`ship ${spec.id}: model "${modelId}" failed, drawing the procedural boxes instead: ${error instanceof Error ? error.message : String(error)}`)
      return createShipMesh(spec)
    }
  }
}

/** The default for callers with no `validationErrors` of their own. */
export const loadRegisteredShipView: LoadShipView = makeShipViewLoader((message) => { console.error(message) })
