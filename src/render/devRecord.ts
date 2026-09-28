import type { AircraftSpec } from '../sim/flight/schema.js'
import { isDevSortie } from '../sim/sortie.js'
import type { Loadout } from '../sim/weapons/stores.js'
import type { ScenarioOption } from './titleScreen.js'

/**
 * Which sorties the roster records (sortie spec A5, A6). Shared by the
 * title's launch-time write and main.ts's debrief banking, so the two
 * recording points cannot disagree.
 */
export function sortieIsDev(option: ScenarioOption, spec: AircraftSpec, loadout: Loadout, quickLaunch: boolean): boolean {
  return isDevSortie({ devScenario: option.dev, start: option.start, spec, loadout, quickLaunch })
}

/** SF-R6: `?recordDevSorties` makes a Dev sortie record anyway, for the Tier 2
 *  specs that prove the banking chain from Dev-only test beds. A DEV-build
 *  switch: a production build passes `devBuild: false` and never honors it. */
export function recordDevSortiesFromQuery(search: string, devBuild: boolean): boolean {
  return devBuild && new URLSearchParams(search).has('recordDevSorties')
}
