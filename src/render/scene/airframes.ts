// src/render/scene/airframes.ts
import type { Airframe } from './airframe.js'
import { loadWildcat } from './wildcat.js'

/** Builds one airframe. Called once per aircraft in a scenario. */
export type AirframeLoader = () => Promise<Airframe>

/**
 * Model id (an aircraft spec's `view.model`) to the module that builds it
 * (A6M Zero spec §7.2). A loader runs only when a scenario names its id, so a
 * scenario that flies no Zero never fetches the Zero. Every
 * `content/aircraft/*.json` must name an id here; tests/render/airframes.test.ts
 * checks that.
 */
export const AIRFRAME_MODELS: Readonly<Record<string, AirframeLoader>> = {
  wildcat: () => loadWildcat(),
}

export function airframeFor(modelId: string): AirframeLoader {
  if (!Object.hasOwn(AIRFRAME_MODELS, modelId)) {
    throw new Error(`no airframe module for view.model "${modelId}" (registered: ${Object.keys(AIRFRAME_MODELS).join(', ')}); register it in src/render/scene/airframes.ts`)
  }
  return AIRFRAME_MODELS[modelId]!
}
