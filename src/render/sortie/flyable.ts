import type { AircraftSpec } from '../../sim/flight/schema.js'
import type { Loadout } from '../../sim/weapons/stores.js'
import { figuresFor, type Figure } from '../hangar/stats.js'
import { rosterNameOf, type LibraryEntry } from '../hangar/library.js'

/** One row of Form 3: a spec in content/aircraft/ ("flyable" = has a spec)
 *  with its Library card (sortie spec, Form 3: blurb plus `figuresFor`). */
export type FlyableAircraft = { readonly spec: AircraftSpec; readonly label: string; readonly blurb: string; readonly figures: readonly Figure[] }

const NATION_LABEL = { allied: 'Allied', japanese: 'Japanese' } as const

/** Allied first, then by name. Throws, naming the spec, if one has no Library entry. */
export function flyableAircraft(specs: readonly AircraftSpec[], library: readonly LibraryEntry[]): FlyableAircraft[] {
  return specs.map((spec) => {
    const entry = library.find((e) => e.spec === spec.id)
    if (entry === undefined) throw new Error(`flyable ${spec.id}: no Library entry has spec "${spec.id}"`)
    return { spec, label: rosterNameOf(entry), blurb: entry.blurb, figures: figuresFor({ library: entry, subject: { kind: 'aircraft', spec }, origin: null }) }
  }).sort((a, b) => (a.spec.side === b.spec.side ? a.label.localeCompare(b.label) : a.spec.side === 'allied' ? -1 : 1))
}

/** Enemy aircraft show only with Dev on, labeled with their side (sortie spec, Form 3). */
export function aircraftRowLabel(f: FlyableAircraft, dev: boolean): string {
  return dev && f.spec.side !== 'allied' ? `${f.label} (${NATION_LABEL[f.spec.side]})` : f.label
}

/** Store id -> display name, from the Library's ordnance entries: a store type
 *  in the spec carries no name of its own (StoresSchema). */
export function ordnanceNames(library: readonly LibraryEntry[]): Readonly<Record<string, string>> {
  return Object.fromEntries(library.filter((e) => e.kind === 'ordnance').map((e) => [e.id, e.name]))
}

/** Form 4's right side: exactly what hangs on the aircraft. A store with no
 *  Library entry reads as its id rather than failing the form. */
export function storesLine(spec: AircraftSpec, loadout: Loadout, names: Readonly<Record<string, string>>): string {
  const s = spec.stores
  if (s === undefined || loadout === 'clean') return 'Guns only: no bombs or rockets'
  const part = (n: number, id: string): string => `${n} × ${names[id] ?? id}`
  const bombs = loadout === 'bombs' || loadout === 'both' ? [part(s.racks.length, s.racks[0]!.store)] : []
  const rockets = loadout === 'rockets' || loadout === 'both' ? [part(s.rails.length, s.rails[0]!.store)] : []
  return [...bombs, ...rockets].join(', ')
}
