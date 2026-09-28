import { parseAircraftSpec } from '../../sim/content.js'
import { parseLibraryEntry, type LibraryEntry } from '../hangar/library.js'
import { flyableAircraft, ordnanceNames, type FlyableAircraft } from './flyable.js'

// Bundled at build time, as hangar/contentIndex.ts does (a browser cannot list
// content/aircraft/); Node tests never import this module.
const aircraft = import.meta.glob('/content/aircraft/*.json', { eager: true, import: 'default' })
const library = import.meta.glob('/content/library/*.json', { eager: true, import: 'default' })
const all = (files: Record<string, unknown>): unknown[] => Object.entries(files).sort(([a], [b]) => a.localeCompare(b)).map(([, raw]) => raw)
const libraryEntries = (): LibraryEntry[] => all(library).map(parseLibraryEntry)

export function loadFlyableAircraft(): FlyableAircraft[] {
  return flyableAircraft(all(aircraft).map(parseAircraftSpec), libraryEntries().filter((e) => e.kind === 'aircraft'))
}

export function loadOrdnanceNames(): Readonly<Record<string, string>> {
  return ordnanceNames(libraryEntries())
}
