import { readFileSync } from 'node:fs'
import { AircraftSpecSchema, type AircraftSpec } from './flight/schema.js'

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

/** Node-only loader, used by tests and tools. The browser build loads content
 *  over fetch and calls parseAircraftSpec directly. */
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
