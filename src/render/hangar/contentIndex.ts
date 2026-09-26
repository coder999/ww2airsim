// src/render/hangar/contentIndex.ts
import { parseAircraftSpec } from '../../sim/content.js'
import { parseShipSpec } from '../../sim/world/ships.js'
import { parseAirfield } from '../../sim/world/airfields.js'
import { parseLibraryEntry } from './library.js'
import type { HangarContent } from './catalog.js'

/**
 * The page's content, bundled at build time by Vite's glob import rather
 * than fetched: a browser cannot list `content/library/`, and every file is
 * a few kilobytes of JSON. Parsed through the same Zod schemas the game uses,
 * so a malformed file fails here, loudly (main.ts shows the bad-content
 * screen). Node tests never import this module (import.meta.glob is Vite's);
 * they build `HangarContent` with tools/content/load.ts instead.
 */
const library = import.meta.glob('/content/library/*.json', { eager: true, import: 'default' })
const aircraft = import.meta.glob('/content/aircraft/*.json', { eager: true, import: 'default' })
const ships = import.meta.glob('/content/ships/*.json', { eager: true, import: 'default' })
const bases = import.meta.glob('/content/bases/*.json', { eager: true, import: 'default' })

function parseAll<T>(files: Record<string, unknown>, parse: (raw: unknown) => T): T[] {
  return Object.entries(files).sort(([a], [b]) => a.localeCompare(b)).map(([path, raw]) => {
    try {
      return parse(raw)
    } catch (e) {
      throw new Error(`${path}: ${e instanceof Error ? e.message : String(e)}`)
    }
  })
}

export function loadHangarContent(): HangarContent {
  return {
    library: parseAll(library, parseLibraryEntry),
    aircraft: parseAll(aircraft, parseAircraftSpec),
    ships: parseAll(ships, parseShipSpec),
    airfields: parseAll(bases, parseAirfield),
  }
}
