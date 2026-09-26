// tests/render/hangar/content.ts
import { readdirSync, readFileSync } from 'node:fs'
import { loadAircraftSpec, loadAirfield, loadShipSpec } from '../../../tools/content/load.js'
import { parseLibraryEntry, type HangarContent, type LibraryEntry } from '../../../src/render/hangar/library.js'

const ids = (dir: string): string[] => readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => f.replace(/\.json$/, ''))

export const LIBRARY_DIR = 'content/library'
export const libraryIds = (): string[] => ids(LIBRARY_DIR)
export const loadLibraryEntry = (id: string): LibraryEntry => parseLibraryEntry(JSON.parse(readFileSync(`${LIBRARY_DIR}/${id}.json`, 'utf8')))

/** The same `HangarContent` contentIndex.ts builds in the page, from disk. */
export function nodeHangarContent(): HangarContent {
  return {
    library: libraryIds().map(loadLibraryEntry),
    aircraft: ids('content/aircraft').map(loadAircraftSpec),
    ships: ids('content/ships').map(loadShipSpec),
    airfields: ids('content/bases').map(loadAirfield),
  }
}

/** First-column cells (or the `column`th) of the first `nth` markdown table in
 *  GAMEPLAY.md's `## <section>`, backticks stripped. Throws if the table is
 *  missing, so a reformat fails loudly (Hangar spec §14). */
export function rosterColumn(markdown: string, section: string, nth = 0, column = 0): string[] {
  const body = markdown.split(/^## /m).find((s) => s.startsWith(`${section}\n`))
  if (body === undefined) throw new Error(`GAMEPLAY.md has no "## ${section}" section`)
  const tables: string[][] = []
  let current: string[] | null = null
  for (const line of body.split('\n')) {
    if (line.startsWith('|')) {
      if (current === null) { current = []; tables.push(current) }
      current.push(line)
    } else current = null
  }
  const table = tables[nth]
  if (table === undefined || table.length < 3) throw new Error(`"## ${section}" has no table #${nth + 1}`)
  return table.slice(2).map((row) => row.split('|')[column + 1]!.trim().replace(/`/g, ''))
}
