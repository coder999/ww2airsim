import { parseAircraftSpec } from '../sim/content.js'
import { isParkedAircraft, isShipParked, parseScenario, scenarioAircraftSpecIds, scenarioShipSpecIds, scenarioVehicleSpecIds, type Scenario, type ScenarioBundle } from '../sim/scenario.js'
import { parseAirfield } from '../sim/world/airfields.js'
import { parseShipSpec } from '../sim/world/ships.js'
import { parseVehicleSpec } from '../sim/world/vehicles.js'
import { expandScenario, parseSite, type SiteOmit } from '../sim/world/sites.js'
import { aircraftUrl, airfieldUrl, scenarioUrl, shipUrl, siteUrl, vehicleUrl } from './content.js'
import { withPlayerSpec } from '../sim/sortie.js'

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
/** The scenario file alone, parsed: what the title's briefing needs (M2)
 *  without fetching the specs and bases a flight needs. Same error text as
 *  the bundle loader for a failed fetch. */
export async function loadScenarioFile(id: string, fetchImpl: typeof fetch = fetch): Promise<Scenario> {
  const res = await fetchImpl(scenarioUrl(id))
  if (!res.ok) throw new Error(`Failed to fetch content ${scenarioUrl(id)}: ${res.status} ${res.statusText}`)
  return parseScenario(await res.json())
}

/** `playerSpec` (sortie forms) flies the scenario's player as that spec: the
 *  entry is rewritten BEFORE the spec table is built, so the chosen spec is
 *  fetched and parsed like any other the scenario names. `extend` (DEV only,
 *  the entity-scaling swarm) rewrites the scenario at the same point, for the
 *  same reason. */
export async function loadScenarioBundle(id: string, fetchImpl: typeof fetch = fetch, playerSpec?: string, extend?: (s: Scenario) => Scenario, siteWindows: Readonly<Record<string, string>> = {}, siteOmit: readonly SiteOmit[] = []): Promise<ScenarioBundle> {
  const json = async (url: string): Promise<unknown> => {
    const res = await fetchImpl(url)
    if (!res.ok) throw new Error(`Failed to fetch content ${url}: ${res.status} ${res.statusText}`)
    return res.json() as Promise<unknown>
  }
  const parsed = await loadScenarioFile(id, fetchImpl)
  const chosen = playerSpec === undefined ? parsed : withPlayerSpec(parsed, playerSpec)
  const extended = extend === undefined ? chosen : extend(chosen)
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
  // F8: sites are merged in before the spec tables are built, so what a window adds has its specs fetched (the node
  // twin is `bundleForScenario`). A scenario with no `sites` comes back as it went in.
  const siteTable = await table(extended.sites ?? [], siteUrl, parseSite)
  const { scenario, airfields: siteFields } = expandScenario(extended, siteTable, siteWindows, siteOmit)
  const [aircraftSpecs, shipSpecs, vehicleSpecs, baseFields] = await Promise.all([
    table(scenarioAircraftSpecIds(scenario), aircraftUrl, parseAircraftSpec),
    table(scenarioShipSpecIds(scenario), shipUrl, parseShipSpec),
    table(scenarioVehicleSpecIds(scenario), vehicleUrl, parseVehicleSpec),
    table([
      ...scenario.airfields,
      ...scenario.aircraft.flatMap((a) =>
        isParkedAircraft(a) && !isShipParked(a.parkedAt) ? [a.parkedAt.airfield] : []),
    ].filter((a) => siteFields[a] === undefined), airfieldUrl, parseAirfield),
  ])
  return { scenario, aircraftSpecs, shipSpecs, vehicleSpecs, airfields: { ...baseFields, ...siteFields } }
}
