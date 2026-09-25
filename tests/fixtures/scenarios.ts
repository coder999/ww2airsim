import { readFileSync } from 'node:fs'
import { parseScenario, type ScenarioBundle } from '../../src/sim/scenario.js'
import { bundleForScenario } from '../../tools/content/load.js'

/**
 * A scenario that exists only for tests: `tests/fixtures/scenarios/<id>.json`,
 * validated by the same `parseScenario` as shipped content and resolved
 * against the real `content/` aircraft, ships and airfields. Nothing ships
 * these and the title screen never lists them, so a test can hold a geometry
 * still while the shipped scenario of the same shape moves on.
 */
export function loadFixtureScenarioBundle(id: string): ScenarioBundle {
  const path = new URL(`./scenarios/${id}.json`, import.meta.url)
  return bundleForScenario(parseScenario(JSON.parse(readFileSync(path, 'utf8')) as unknown))
}
