import { readFileSync } from 'node:fs'
import { parseAircraftSpec } from '../../src/sim/content.js'
import type { AircraftSpec } from '../../src/sim/flight/schema.js'
import { isShipParked, parseScenario, type Scenario, type ScenarioBundle } from '../../src/sim/scenario.js'
import { parseAirfield, type Airfield } from '../../src/sim/world/airfields.js'
import { parseShipSpec, type ShipSpec } from '../../src/sim/world/ships.js'

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

export function loadAirfield(id: string): Airfield {
  return parseAirfield(readContentJson('airfield', 'bases', id))
}

export function loadScenario(id: string): Scenario {
  return parseScenario(readContentJson('scenario', 'scenarios', id))
}

/** Every content file a scenario names, loaded and validated. Node only;
 *  `src/render/scenarioLoad.ts` is the browser twin. */
export function loadScenarioBundle(id: string): ScenarioBundle {
  const scenario = loadScenario(id)
  const table = <T>(ids: readonly string[], load: (i: string) => T): Readonly<Record<string, T>> =>
    Object.fromEntries([...new Set(ids)].map((i) => [i, load(i)]))
  return {
    scenario,
    aircraftSpecs: table(scenario.aircraft.map((a) => a.spec), loadAircraftSpec),
    shipSpecs: table(scenario.ships.map((s) => s.spec), loadShipSpec),
    airfields: table([...scenario.airfields, ...scenario.aircraft.flatMap((a) => (isShipParked(a.parkedAt) ? [] : [a.parkedAt.airfield]))], loadAirfield),
  }
}
