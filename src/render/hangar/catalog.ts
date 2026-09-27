// src/render/hangar/catalog.ts
import type { AircraftSpec, StoreType } from '../../sim/flight/schema.js'
import type { ShipSpec } from '../../sim/world/ships.js'
import type { Airfield, Building } from '../../sim/world/airfields.js'
import { LIBRARY_KINDS, SIDES, type HangarContent, type LibraryEntry, type LibraryKind, type Side } from './library.js'
import { aircraftModelPath, ordnanceModelPath, shipModelPath, staticModelPath } from '../content.js'

export type { HangarContent }

export interface Placement { readonly airfield: Airfield; readonly building: Building }

export type CatalogSubject =
  | { readonly kind: 'aircraft'; readonly spec: AircraftSpec }
  | { readonly kind: 'ship'; readonly spec: ShipSpec }
  | { readonly kind: 'building'; readonly buildingKind: Building['kind']; readonly placements: readonly Placement[] }
  | { readonly kind: 'ordnance'; readonly storeId: string; readonly store: StoreType; readonly carriers: readonly AircraftSpec[] }

export interface CatalogEntry {
  readonly library: LibraryEntry
  /** null = no sim spec: no figures. Drawable anyway if the entry has its own `model` (R1). */
  readonly subject: CatalogSubject | null
  /** Who made what the Hangar draws: `internal` (Blender, generated, or drawn in code) or
   *  `external` (a download); null when nothing is drawn, or its glb has no entry. The list's Origin filter reads it. */
  readonly origin: Origin | null
}

export type Origin = 'internal' | 'external'

/** How an entry stands in the Library (model-roster spec §4.3). */
export type Availability = 'in-game' | 'display-only' | 'not-drawn'

export function availability(e: CatalogEntry): Availability {
  if (e.subject !== null) return 'in-game'
  return e.library.model !== undefined ? 'display-only' : 'not-drawn'
}

/** The Hangar can draw it: a spec, or a model of its own. */
export const drawable = (e: CatalogEntry): boolean => availability(e) !== 'not-drawn'

const STATUS: Readonly<Record<Availability, string | null>> = {
  'in-game': null,
  'display-only': 'not in the game yet',
  'not-drawn': 'not yet in service',
}

/** The list button's text: the name, and the status of anything not in the game. */
export function listLabel(e: CatalogEntry): string {
  const s = STATUS[availability(e)]
  return s === null ? e.library.name : `${e.library.name} (${s})`
}

/** The card's status note, capitalized; null in the game. */
export function statusNote(e: CatalogEntry): string | null {
  const s = STATUS[availability(e)]
  return s === null ? null : `${s[0]!.toUpperCase()}${s.slice(1)}`
}

const AVAILABILITY_RANK: Readonly<Record<Availability, number>> = { 'in-game': 0, 'display-only': 1, 'not-drawn': 2 }

function subjectFor(e: LibraryEntry, c: HangarContent): CatalogSubject | null {
  if (e.spec === undefined) return null
  if (e.kind === 'aircraft') {
    const spec = c.aircraft.find((a) => a.id === e.spec)
    if (!spec) throw new Error(`library ${e.id}: no aircraft spec "${e.spec}"`)
    return { kind: 'aircraft', spec }
  }
  if (e.kind === 'ship') {
    const spec = c.ships.find((s) => s.id === e.spec)
    if (!spec) throw new Error(`library ${e.id}: no ship spec "${e.spec}"`)
    return { kind: 'ship', spec }
  }
  if (e.kind === 'ordnance') {
    const carriers = c.aircraft.filter((a) => a.stores !== undefined && Object.hasOwn(a.stores.types, e.spec!))
    if (carriers.length === 0) throw new Error(`library ${e.id}: no aircraft carries store "${e.spec}"`)
    return { kind: 'ordnance', storeId: e.spec!, store: carriers[0]!.stores!.types[e.spec!]!, carriers }
  }
  const placements = c.airfields.flatMap((airfield) => airfield.buildings.filter((b) => b.kind === e.spec).map((building) => ({ airfield, building })))
  if (placements.length === 0) throw new Error(`library ${e.id}: no building of kind "${e.spec}" in any content/bases file`)
  return { kind: 'building', buildingKind: placements[0]!.building.kind, placements }
}

/** The committed glb the Hangar draws for an entry, the way loadHangarModel picks it (its own
 *  `model` first, then the spec's), `'code'` for a ship with no model or a building drawn by
 *  drawBuilding, null for nothing drawn. */
function modelPathFor(e: LibraryEntry, s: CatalogSubject | null): string | 'code' | null {
  if (e.model !== undefined) {
    const { kind, id } = e.model
    return kind === 'aircraft' ? aircraftModelPath(id) : kind === 'ship' ? shipModelPath(id) : staticModelPath(kind, id)
  }
  if (s === null) return null
  if (s.kind === 'aircraft') return aircraftModelPath(s.spec.view.model)
  if (s.kind === 'ship') return s.spec.view?.model === undefined ? 'code' : shipModelPath(s.spec.view.model)
  if (s.kind === 'ordnance') return ordnanceModelPath(s.storeId)
  return 'code'
}

function originFor(e: LibraryEntry, s: CatalogSubject | null, c: HangarContent): Origin | null {
  const path = modelPathFor(e, s)
  if (path === null) return null
  if (path === 'code') return 'internal'
  // A glb with no entry has no known origin; catalog.test.ts asserts every drawn entry has one.
  const p = c.provenance.get(path)
  return p === undefined ? null : p.kind === 'sketchfab' ? 'external' : 'internal'
}

/** Every library entry with its resolved sim subject, ordered aircraft,
 *  ships, buildings, vehicles, ordnance; within a kind, in the game first,
 *  then display-only, then not drawn, then by name. */
export function buildCatalog(c: HangarContent): CatalogEntry[] {
  const entries = c.library.map((library) => {
    const subject = subjectFor(library, c)
    return { library, subject, origin: originFor(library, subject, c) }
  })
  const rank = (e: CatalogEntry): [number, number, string] =>
    [LIBRARY_KINDS.indexOf(e.library.kind), AVAILABILITY_RANK[availability(e)], e.library.name]
  return entries.sort((a, b) => {
    const [ka, sa, na] = rank(a), [kb, sb, nb] = rank(b)
    return ka - kb || sa - sb || na.localeCompare(nb)
  })
}

export interface CatalogFilter { readonly kind: LibraryKind | 'all'; readonly side: Side | 'all'; readonly origin: Origin | 'all' }

export function filterCatalog(entries: readonly CatalogEntry[], f: CatalogFilter): CatalogEntry[] {
  return entries.filter((e) => (f.kind === 'all' || e.library.kind === f.kind) && (f.side === 'all' || e.library.side === f.side) && (f.origin === 'all' || e.origin === f.origin))
}

export const FILTER_KINDS: readonly (LibraryKind | 'all')[] = ['all', ...LIBRARY_KINDS]
export const FILTER_SIDES: readonly (Side | 'all')[] = ['all', ...SIDES]
export const FILTER_ORIGINS: readonly (Origin | 'all')[] = ['all', 'internal', 'external']
