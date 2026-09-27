// src/render/scene/airframes.ts
import type { Airframe } from './airframe.js'
import { loadWildcat } from './wildcat.js'
import type { StoreMounts } from './stores.js'

/** Builds one airframe, hanging stores at the flying spec's own mounts (undefined = none).
 *  Called once per aircraft in a scenario. */
export type AirframeLoader = (stores: StoreMounts | undefined) => Promise<Airframe>

/**
 * Model id (an aircraft spec's `view.model`) to the module that builds it
 * (A6M Zero spec §7.2). A loader runs only when a scenario names its id, so a
 * scenario that flies no Zero never fetches the Zero. Every
 * `content/aircraft/*.json` must name an id here; tests/render/airframes.test.ts
 * checks that.
 */
export const AIRFRAME_MODELS: Readonly<Record<string, AirframeLoader>> = {
  wildcat: (stores) => loadWildcat(stores),
}

export function airframeFor(modelId: string): AirframeLoader {
  if (!Object.hasOwn(AIRFRAME_MODELS, modelId)) {
    throw new Error(`no airframe module for view.model "${modelId}" (registered: ${Object.keys(AIRFRAME_MODELS).join(', ')}); register it in src/render/scene/airframes.ts`)
  }
  return AIRFRAME_MODELS[modelId]!
}
