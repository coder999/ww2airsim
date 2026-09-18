import { parseAircraftSpec } from '../sim/content.js'
import { parseScenario, type ScenarioBundle } from '../sim/scenario.js'
import { parseAirfield } from '../sim/world/airfields.js'
import { parseShipSpec } from '../sim/world/ships.js'
import { aircraftUrl, airfieldUrl, scenarioUrl, shipUrl } from './content.js'

/**
 * The browser twin of `tools/content/load.ts`'s `loadScenarioBundle`: the
 * same bundle, read over `fetch` instead of `node:fs`. Only the byte-reading
 * half differs -- every `parse*` below is the platform-free validator from
 * `src/sim/`, which is the point of Finding I1's split.
 *
 * `fetchImpl` is injectable the way `loadDepth`'s is, so a Node test can
 * serve `content/` from disk and assert the two loaders agree
 * (`tests/render/scenarioLoad.test.ts`). Nothing else is testable about this
 * file: it is I/O around validators that are each tested elsewhere, and the
 * one thing that could silently rot is the two loaders disagreeing.
 *
 * A failed fetch throws with the URL and the status in the message, because
 * `main.ts` routes it to the bad-content failure screen, where the operator
 * needs to know WHICH file 404'd -- five are fetched here, not one.
 */
export async function loadScenarioBundle(id: string, fetchImpl: typeof fetch = fetch): Promise<ScenarioBundle> {
  const json = async (url: string): Promise<unknown> => {
    const res = await fetchImpl(url)
    if (!res.ok) throw new Error(`Failed to fetch content ${url}: ${res.status} ${res.statusText}`)
    return res.json() as Promise<unknown>
  }
  const scenario = parseScenario(await json(scenarioUrl(id)))
  // Deduplicated and fetched in parallel: the free-flight scenario names one
  // aircraft spec twice (two Hellcats) and Tacloban twice (the strip and both
  // parked airplanes), so the naive form would ask for the same file four
  // times over the network.
  const table = async <T>(
    ids: readonly string[],
    url: (i: string) => string,
    parse: (raw: unknown) => T,
  ): Promise<Readonly<Record<string, T>>> => {
    const unique = [...new Set(ids)]
    const values = await Promise.all(unique.map(async (i) => [i, parse(await json(url(i)))] as const))
    return Object.fromEntries(values)
  }
  const [aircraftSpecs, shipSpecs, airfields] = await Promise.all([
    table(scenario.aircraft.map((a) => a.spec), aircraftUrl, parseAircraftSpec),
    table(scenario.ships.map((s) => s.spec), shipUrl, parseShipSpec),
    table([...scenario.airfields, ...scenario.aircraft.map((a) => a.parkedAt.airfield)], airfieldUrl, parseAirfield),
  ])
  return { scenario, aircraftSpecs, shipSpecs, airfields }
}
