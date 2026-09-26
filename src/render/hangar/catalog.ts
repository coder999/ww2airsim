// src/render/hangar/catalog.ts
import type { AircraftSpec } from '../../sim/flight/schema.js'
import type { ShipSpec } from '../../sim/world/ships.js'
import type { Airfield, Building } from '../../sim/world/airfields.js'
import { LIBRARY_KINDS, SIDES, type HangarContent, type LibraryEntry, type LibraryKind, type Side } from './library.js'

export type { HangarContent }

export interface Placement { readonly airfield: Airfield; readonly building: Building }

export type CatalogSubject =
  | { readonly kind: 'aircraft'; readonly spec: AircraftSpec }
  | { readonly kind: 'ship'; readonly spec: ShipSpec }
  | { readonly kind: 'building'; readonly buildingKind: Building['kind']; readonly placements: readonly Placement[] }

export interface CatalogEntry {
  readonly library: LibraryEntry
  /** null = "Not yet in service": no spec, no model, no figures (§4.3). */
  readonly subject: CatalogSubject | null
}

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
  const placements = c.airfields.flatMap((airfield) => airfield.buildings.filter((b) => b.kind === e.spec).map((building) => ({ airfield, building })))
  if (placements.length === 0) throw new Error(`library ${e.id}: no building of kind "${e.spec}" in any content/bases file`)
  return { kind: 'building', buildingKind: placements[0]!.building.kind, placements }
}

/** Every library entry with its resolved sim subject, ordered aircraft,
 *  ships, buildings; within a kind, in-service first, then by name. */
export function buildCatalog(c: HangarContent): CatalogEntry[] {
  const entries = c.library.map((library) => ({ library, subject: subjectFor(library, c) }))
  const rank = (e: CatalogEntry): [number, number, string] =>
    [LIBRARY_KINDS.indexOf(e.library.kind), e.subject === null ? 1 : 0, e.library.name]
  return entries.sort((a, b) => {
    const [ka, sa, na] = rank(a), [kb, sb, nb] = rank(b)
    return ka - kb || sa - sb || na.localeCompare(nb)
  })
}

export interface CatalogFilter { readonly kind: LibraryKind | 'all'; readonly side: Side | 'all' }

export function filterCatalog(entries: readonly CatalogEntry[], f: CatalogFilter): CatalogEntry[] {
  return entries.filter((e) => (f.kind === 'all' || e.library.kind === f.kind) && (f.side === 'all' || e.library.side === f.side))
}

export const FILTER_KINDS: readonly (LibraryKind | 'all')[] = ['all', ...LIBRARY_KINDS]
export const FILTER_SIDES: readonly (Side | 'all')[] = ['all', ...SIDES]
