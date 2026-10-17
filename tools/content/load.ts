import { readFileSync } from 'node:fs'
import { parseAircraftSpec } from '../../src/sim/content.js'
import type { AircraftSpec } from '../../src/sim/flight/schema.js'
import { isParkedAircraft, isShipParked, parseScenario, scenarioAircraftSpecIds, scenarioShipSpecIds, scenarioVehicleSpecIds, type Scenario, type ScenarioBundle } from '../../src/sim/scenario.js'
import { parseAirfield, type Airfield } from '../../src/sim/world/airfields.js'
import { parseShipSpec, type ShipSpec } from '../../src/sim/world/ships.js'
import { parseVehicleSpec, type VehicleSpec } from '../../src/sim/world/vehicles.js'
import { expandScenario, parseSite, type Site } from '../../src/sim/world/sites.js'
import { windowsForChapter } from '../../src/campaign/worldStates.js'

/**
 * Node-only content loader, used by tests and tools. The browser build loads
 * content over fetch and calls `parseAircraftSpec`/`parseShipSpec` directly.
 *
 * Finding I1: this lived in `src/sim/content.ts`, which made `node:fs` and
 * `import.meta.url` reachable from the one tree that must also load in a
 * browser -- where a bundler either fails on them or silently shims them. The
 * docstring there already said "Node-only loader", i.e. it described a
 * constraint nothing enforced. It is enforced now: the
 * `sim-must-not-import-node-core` rule in `.dependency-cruiser.cjs` fails the
 * build if anything under `src/sim` imports a Node core module, and
 * `tests/architecture/boundary.test.ts` proves that rule bites.
 */
function readContentJson(kind: string, dir: string, id: string): unknown {
  const path = new URL(`../../content/${dir}/${id}.json`, import.meta.url)

  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Failed to read ${kind} content file for id "${id}" (${path.pathname}): ${message}`)
  }

  try {
    return JSON.parse(raw) as unknown
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Failed to parse ${kind} content file for id "${id}" (${path.pathname}) as JSON: ${message}`)
  }
}

export function loadAircraftSpec(id: string): AircraftSpec {
  return parseAircraftSpec(readContentJson('aircraft', 'aircraft', id))
}

export function loadShipSpec(id: string): ShipSpec {
  return parseShipSpec(readContentJson('ship', 'ships', id))
}

export function loadVehicleSpec(id: string): VehicleSpec {
  return parseVehicleSpec(readContentJson('vehicle', 'vehicles', id))
}

export function loadAirfield(id: string): Airfield {
  return parseAirfield(readContentJson('airfield', 'bases', id))
}

export function loadSite(id: string): Site {
  return parseSite(readContentJson('site', 'sites', id))
}

export function loadScenario(id: string): Scenario {
  return parseScenario(readContentJson('scenario', 'scenarios', id))
}

/** Every content file a scenario names, loaded and validated. Node only;
 *  `src/render/scenarioLoad.ts` is the browser twin. */
export function loadScenarioBundle(id: string, siteWindows?: Readonly<Record<string, string>>): ScenarioBundle {
  // F10A (2026-10-17): with no windows given, a CHAPTER scenario is built in the windows its chapter is played in, not the loader's
  // default (`pre-invasion`): A3 lands at Tacloban, which only the campaign's buildup window leaves serviceable, and a landing objective at
  // a field that is down or on the other side is refused at load. Every other scenario keeps the default.
  // (the registry is read from disk, not imported: src/campaign/chapterMissions.ts has a JSON import Playwright's Node loader cannot read)
  const registry = readContentJson('chapter registry', 'campaign', 'chapter-missions') as { chapters: Record<string, { scenario: string | null }> }
  const chapter = Object.keys(registry.chapters).find((c) => registry.chapters[c]!.scenario === id)
  return bundleForScenario(loadScenario(id), siteWindows ?? (chapter === undefined ? {} : windowsForChapter(chapter)))
}

/** Every content file an already-parsed scenario names, loaded and
 *  validated -- the half of `loadScenarioBundle` that does not care where the
 *  scenario itself came from (a test fixture, for one). */
export function bundleForScenario(parsed: Scenario, siteWindows: Readonly<Record<string, string>> = {}): ScenarioBundle {
  // F8: a scenario that names `sites` is expanded with each site's chosen window before its content is gathered, so the
  // vehicles and parked aircraft the window adds have their specs loaded. A scenario with no `sites` is returned as is.
  const sites = Object.fromEntries((parsed.sites ?? []).map((i) => [i, loadSite(i)]))
  const { scenario, airfields: siteFields } = expandScenario(parsed, sites, siteWindows)
  const table = <T>(ids: readonly string[], load: (i: string) => T): Readonly<Record<string, T>> =>
    Object.fromEntries([...new Set(ids)].map((i) => [i, load(i)]))
  return {
    scenario,
    aircraftSpecs: table(scenarioAircraftSpecIds(scenario), loadAircraftSpec),
    shipSpecs: table(scenarioShipSpecIds(scenario), loadShipSpec),
    vehicleSpecs: table(scenarioVehicleSpecIds(scenario), loadVehicleSpec),
    airfields: {
      ...table([
        ...scenario.airfields,
        ...scenario.aircraft.flatMap((a) =>
          isParkedAircraft(a) && !isShipParked(a.parkedAt) ? [a.parkedAt.airfield] : []),
      ].filter((a) => siteFields[a] === undefined), loadAirfield),
      ...siteFields,
    },
  }
}
