import type { AircraftSpec } from './flight/schema.js'
import { isParkedAircraft, isShipParked, type Scenario, type ScenarioBundle } from './scenario.js'
import type { Loadout } from './weapons/stores.js'

/**
 * The sortie rules (spec docs/superpowers/specs/2026-09-27-sortie-forms-design.md,
 * "Rules and data", amendments A5 and A6). Pure: the title's forms, the
 * quick-launch URL and main.ts's loader all ask these, so the rules cannot
 * differ between the two ways into a flight.
 */
export type StartKind = 'carrier' | 'airfield' | 'airborne'
export type AircraftNation = AircraftSpec['side']
/** `timeOfDay`: Form 2's takeoff hour (A3, solar hours); absent flies the scenario's own. */
export type SortieChoice = { readonly scenarioId: string; readonly aircraftSpec: string; readonly loadout: Loadout; readonly dev: boolean; readonly timeOfDay?: number }
export type SortieRule = 'dev-scenario' | 'enemy-aircraft' | 'not-carrier-capable' | 'no-stations'
export type SortieFacts = { readonly devScenario: boolean; readonly start: StartKind; readonly spec: AircraftSpec; readonly loadout: Loadout }

export const ALL_LOADOUTS: readonly Loadout[] = ['clean', 'bombs', 'rockets', 'both']
/** SF-R2: the Dev stores layout is this spec's own `stores` block, read at runtime. */
export const DEV_STORES_SPEC_ID = 'f6f-hellcat'
/** SF-R3: the bundle key of a player spec given the Dev stores layout. */
export const DEV_STORES_SUFFIX = '~dev-stores'

export function startKindOf(scenario: Scenario): StartKind {
  const player = scenario.aircraft.find((a) => a.id === scenario.player)
  if (player === undefined) throw new Error(`scenario ${scenario.id}: no player aircraft ${scenario.player}`)
  if (!isParkedAircraft(player)) return 'airborne'
  return isShipParked(player.parkedAt) ? 'carrier' : 'airfield'
}

export function eligibleAircraft(specs: readonly AircraftSpec[], start: StartKind, dev: boolean): AircraftSpec[] {
  if (dev) return [...specs]
  return specs.filter((s) => s.side === 'allied' && (start !== 'carrier' || s.carrierCapable))
}

export function eligibleLoadouts(spec: AircraftSpec, dev: boolean): Loadout[] {
  // Dev lends the Hellcat layout only to an airplane with no stores of its own; one that has a
  // stores block (a bomber with no rails, say) offers what it really carries, in Dev too.
  if (spec.stores === undefined) return dev ? [...ALL_LOADOUTS] : ['clean']
  // StoresSchema requires at least one rack and one rail, so a spec with a
  // stores block has both today; the checks stay per kind for the day it may not.
  const racks = spec.stores.racks.length > 0, rails = spec.stores.rails.length > 0
  return ALL_LOADOUTS.filter((l) => l === 'clean' || (l === 'bombs' && racks) || (l === 'rockets' && rails) || (l === 'both' && racks && rails))
}

export function needsDevStores(spec: AircraftSpec, loadout: Loadout): boolean {
  return loadout !== 'clean' && !eligibleLoadouts(spec, false).includes(loadout)
}

export function sortieRulesBroken(f: SortieFacts): SortieRule[] {
  const broken: SortieRule[] = []
  if (f.devScenario) broken.push('dev-scenario')
  if (f.spec.side !== 'allied') broken.push('enemy-aircraft')
  if (f.start === 'carrier' && !f.spec.carrierCapable) broken.push('not-carrier-capable')
  if (needsDevStores(f.spec, f.loadout)) broken.push('no-stations')
  return broken
}

/** A5: Dev only if it NEEDED Dev; A6: a quick launch always is. Gates recording. */
export function isDevSortie(f: SortieFacts & { readonly quickLaunch: boolean }): boolean {
  return f.quickLaunch || sortieRulesBroken(f).length > 0
}

export function validateSortie(f: SortieFacts & { readonly dev: boolean }): void {
  const broken = sortieRulesBroken(f)
  if (!f.dev && broken.length > 0) throw new Error(`sortie needs Dev: ${broken.join(', ')}`)
}

export function withPlayerSpec(scenario: Scenario, specId: string): Scenario {
  return { ...scenario, aircraft: scenario.aircraft.map((a) => (a.id === scenario.player ? { ...a, spec: specId } : a)) }
}

/**
 * The bundle a sortie flies. Returns the SAME bundle unless the player's
 * spec lacks the stations its loadout needs; then the player alone flies a
 * copy under `<spec>~dev-stores` with `devStores` hung on it (SF-R2, SF-R3).
 */
export function sortieBundle(bundle: ScenarioBundle, loadout: Loadout, devStores: AircraftSpec['stores']): ScenarioBundle {
  const s = bundle.scenario
  const key = s.aircraft.find((a) => a.id === s.player)!.spec
  const spec = bundle.aircraftSpecs[key]!
  if (!needsDevStores(spec, loadout)) return bundle
  if (devStores === undefined) throw new Error(`sortie: ${spec.id} needs the Dev stores layout (${DEV_STORES_SPEC_ID}) and none was loaded`)
  const devKey = `${key}${DEV_STORES_SUFFIX}`
  return {
    ...bundle,
    scenario: withPlayerSpec(s, devKey),
    aircraftSpecs: { ...bundle.aircraftSpecs, [devKey]: { ...spec, stores: devStores } },
  }
}
