// src/render/scene/airframes.ts
import type { Airframe } from './airframe.js'
import { loadWildcat } from './wildcat.js'
import type { StoreMounts } from './stores.js'
import { AIRFRAME_RIGS } from './airframeRigs.js'
import { loadPivotedAirframe } from './pivotedAirframe.js'
import { aircraftModelUrl } from '../content.js'

/** Builds one airframe, hanging stores at the flying spec's own mounts (undefined = none).
 *  Called once per aircraft in a scenario. */
export type AirframeLoader = (stores: StoreMounts | undefined) => Promise<Airframe>

/**
 * Model id (an aircraft spec's `view.model`) to the module that builds it
 * (A6M Zero spec §7.2). Rigged models (R3) register from `airframeRigs.ts`.
 * A loader runs only when a scenario names its id, so a scenario that flies
 * no Zero never fetches the Zero. Every
 * `content/aircraft/*.json` must name an id here; tests/render/airframes.test.ts
 * checks that.
 */
export const AIRFRAME_MODELS: Readonly<Record<string, AirframeLoader>> = {
  wildcat: (stores) => loadWildcat(stores),
  // R3: every rigged model, through the one generic module (airframeRigs.ts says how each moves).
  ...Object.fromEntries(Object.entries(AIRFRAME_RIGS).map(([id, rig]) => [id, (stores: StoreMounts | undefined) => loadPivotedAirframe(id, aircraftModelUrl(id), rig, stores)])),
}

export function airframeFor(modelId: string): AirframeLoader {
  if (!Object.hasOwn(AIRFRAME_MODELS, modelId)) {
    throw new Error(`no airframe module for view.model "${modelId}" (registered: ${Object.keys(AIRFRAME_MODELS).join(', ')}); register it in src/render/scene/airframes.ts`)
  }
  return AIRFRAME_MODELS[modelId]!
}
