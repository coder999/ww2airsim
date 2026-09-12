import { readFileSync } from 'node:fs'
import { parseAircraftSpec } from '../../src/sim/content.js'
import type { AircraftSpec } from '../../src/sim/flight/schema.js'

/**
 * Node-only content loader, used by tests and tools. The browser build loads
 * content over fetch and calls `parseAircraftSpec` (in `src/sim/content.ts`)
 * directly.
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
export function loadAircraftSpec(id: string): AircraftSpec {
  const path = new URL(`../../content/aircraft/${id}.json`, import.meta.url)

  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Failed to read aircraft content file for id "${id}" (${path.pathname}): ${message}`)
  }

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Failed to parse aircraft content file for id "${id}" (${path.pathname}) as JSON: ${message}`)
  }

  return parseAircraftSpec(json)
}
