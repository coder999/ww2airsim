import { AircraftSpecSchema, type AircraftSpec } from './flight/schema.js'

/**
 * Validates raw parsed JSON into an `AircraftSpec`, throwing with every
 * offending field named (spec §9: malformed content fails loudly at load).
 *
 * Pure and platform-free on purpose -- this module has to load in the browser,
 * so it must not reach for `node:fs` or `import.meta.url`. The Node-only file
 * loader that used to live here is now `tools/content/load.ts` (finding I1),
 * and `.dependency-cruiser.cjs`'s `sim-must-not-import-node-core` rule keeps
 * it out.
 */
export function parseAircraftSpec(raw: unknown): AircraftSpec {
  const result = AircraftSpecSchema.safeParse(raw)
  if (!result.success) {
    const detail = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ')
    throw new Error(`Invalid aircraft spec: ${detail}`)
  }
  return result.data
}
