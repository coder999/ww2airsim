import type { AircraftSpec } from './flight/schema.js'
import { isAfloatAircraft, isParkedAircraft, isShipParked, type Scenario, type ScenarioBundle } from './scenario.js'
import type { Loadout } from './weapons/stores.js'

/**
 * The sortie rules (spec docs/superpowers/specs/2026-09-27-sortie-forms-design.md,
 * "Rules and data", amendments A5 and A6). Pure: the title's forms, the
 * quick-launch URL and main.ts's loader all ask these, so the rules cannot
 * differ between the two ways into a flight.
 */
export type StartKind = 'carrier' | 'airfield' | 'water' | 'airborne'
export type AircraftNation = AircraftSpec['side']
export type Cloudiness = 'sunny' | 'partly-cloudy' | 'cloudy' | 'overcast'
/** `timeOfDay`: Form 2's takeoff hour (A3, solar hours); absent flies the scenario's own.
 *  `cloudiness`: Form 2's rolled weather choice; absent (quick launch) flies the scenario's own coverage. */
export type SortieChoice = { readonly scenarioId: string; readonly aircraftSpec: string; readonly loadout: Loadout; readonly dev: boolean; readonly timeOfDay?: number
  readonly cloudiness?: Cloudiness
  /** God mode (godMode.ts): only meaningful with `dev`; the title screen never sets it without. */
  readonly god?: boolean
  /**
   * F6B: the pilot's rank allows the bombsight and torpedosight (`abilities(tier).sights`, src/campaign/ranks.ts). The
   * launch path supplies it (`bootHq`: `pilotSights`, F5B's headquarters); `src/sim` never reads Campaign. Absent is false.
   */
  readonly sights?: boolean }
export type SortieRule = 'dev-scenario' | 'enemy-aircraft' | 'not-carrier-capable' | 'not-water-capable' | 'no-stations'
/** `authored`: `spec` is the airplane the scenario itself puts the player in (F5A Task 9, 2026-10-14).
 *  An authored airplane is never an "enemy airplane" for the Dev rule: the Japanese Field Patrol
 *  ships with a Zero, and flying the mission as written is not a Dev sortie. */
export type SortieFacts = { readonly devScenario: boolean; readonly start: StartKind; readonly spec: AircraftSpec; readonly loadout: Loadout; readonly authored?: boolean }

export const ALL_LOADOUTS: readonly Loadout[] = ['clean', 'bombs', 'torpedoes', 'rockets', 'both']
const DEV_LOADOUTS: readonly Loadout[] = ['clean', 'bombs', 'rockets', 'both']
/** SF-R2: the Dev stores layout is this spec's own `stores` block, read at runtime. */
export const DEV_STORES_SPEC_ID = 'f6f-hellcat'
/** SF-R3: the bundle key of a player spec given the Dev stores layout. */
export const DEV_STORES_SUFFIX = '~dev-stores'
export const TORPEDO_STORES_SUFFIX = '~torpedoes'

export function startKindOf(scenario: Scenario): StartKind {
  const player = scenario.aircraft.find((a) => a.id === scenario.player)
  if (player === undefined) throw new Error(`scenario ${scenario.id}: no player aircraft ${scenario.player}`)
  if (isAfloatAircraft(player)) return 'water'
  if (!isParkedAircraft(player)) return 'airborne'
  return isShipParked(player.parkedAt) ? 'carrier' : 'airfield'
}

/** `authored` is the airplane the scenario puts the player in, or (F10-0) a chapter's own list: every airplane in it is flown as written, so none is an "enemy airplane". */
export function eligibleAircraft(specs: readonly AircraftSpec[], start: StartKind, dev: boolean, authored?: string | readonly string[]): AircraftSpec[] {
  if (dev) return [...specs]
  const own = typeof authored === 'string' ? [authored] : authored ?? []
  return specs.filter((s) => (s.side === 'allied' || own.includes(s.id))
    && (start !== 'carrier' || s.carrierCapable)
    && (start !== 'water' || s.waterOperations !== undefined))
}

export function eligibleLoadouts(spec: AircraftSpec, dev: boolean): Loadout[] {
  // Dev lends the Hellcat layout only to an airplane with no stores of its own; one that has a
  // stores block (a bomber with no rails, say) offers what it really carries, in Dev too.
  if (spec.stores === undefined) return dev ? [...DEV_LOADOUTS] : ['clean']
  // StoresSchema requires at least one rack and one rail, so a spec with a
  // stores block has both today; the checks stay per kind for the day it may not.
  const racks = spec.stores.racks.length > 0, torpedoes = (spec.stores.torpedoRacks?.length ?? 0) > 0, rails = spec.stores.rails.length > 0
  return ALL_LOADOUTS.filter((l) => l === 'clean' || (l === 'bombs' && racks) || (l === 'torpedoes' && torpedoes) || (l === 'rockets' && rails) || (l === 'both' && racks && rails))
}

export function needsDevStores(spec: AircraftSpec, loadout: Loadout): boolean {
  return loadout !== 'clean' && !eligibleLoadouts(spec, false).includes(loadout)
}

export function sortieRulesBroken(f: SortieFacts): SortieRule[] {
  const broken: SortieRule[] = []
  if (f.devScenario) broken.push('dev-scenario')
  if (f.spec.side !== 'allied' && f.authored !== true) broken.push('enemy-aircraft')
  if (f.start === 'carrier' && !f.spec.carrierCapable) broken.push('not-carrier-capable')
  if (f.start === 'water' && f.spec.waterOperations === undefined) broken.push('not-water-capable')
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
  if (loadout === 'torpedoes' && spec.stores?.torpedoRacks !== undefined) {
    const torpedoKey = `${key}${TORPEDO_STORES_SUFFIX}`
    return {
      ...bundle,
      scenario: withPlayerSpec(s, torpedoKey),
      aircraftSpecs: {
        ...bundle.aircraftSpecs,
        [torpedoKey]: { ...spec, stores: { ...spec.stores, racks: spec.stores.torpedoRacks } },
      },
    }
  }
  if (!needsDevStores(spec, loadout)) return bundle
  if (devStores === undefined) throw new Error(`sortie: ${spec.id} needs the Dev stores layout (${DEV_STORES_SPEC_ID}) and none was loaded`)
  const devKey = `${key}${DEV_STORES_SUFFIX}`
  return {
    ...bundle,
    scenario: withPlayerSpec(s, devKey),
    aircraftSpecs: { ...bundle.aircraftSpecs, [devKey]: { ...spec, stores: devStores } },
  }
}

/**
 * Scenarios with a second file for a Japanese pilot (the Range Test: what
 * spawns depends on the side of the airplane chosen). The title screen and
 * `?scenario=` know only the first id; `scenarioFileFor` picks the file at
 * load. The variant is NOT a title-screen option of its own.
 */
export const AXIS_VARIANTS: Readonly<Record<string, string>> = { 'range-test': 'range-test-axis' }

export function scenarioFileFor(scenarioId: string, pilotNation: AircraftNation): string {
  return pilotNation === 'japanese' ? AXIS_VARIANTS[scenarioId] ?? scenarioId : scenarioId
}

/** DEV `?sights=on` or `?sights=off`: forces the gate open or closed, to see both states without a rank. */
export type SightsOverride = 'on' | 'off'

/**
 * F6B (Mark 2026-10-15): does this sortie have the bombsight and torpedosight (the `U` impact marker)? Dev (the checkbox
 * inside the production headquarters/picker) and every Training Ground row, the Basic Flying tutorial included, always;
 * the campaign and single missions by the pilot's rank (`sights`). Weapons can always be released; this only gates the aid.
 */
export function sightsAllowed(f: { readonly dev: boolean; readonly pool: 'noncampaign' | 'training' | 'single' | 'campaign'; readonly sights?: boolean | undefined }, override?: SightsOverride): boolean {
  if (override === 'on') return true
  if (override === 'off') return false
  return f.dev || f.pool === 'training' || f.sights === true
}

export function sightsOverrideFromQuery(search: string): SightsOverride | undefined {
  const v = new URLSearchParams(search).get('sights')
  if (v === null) return undefined
  if (v === 'on' || v === 'off') return v
  throw new Error(`sights: ${JSON.stringify(v)} is not on or off`)
}
