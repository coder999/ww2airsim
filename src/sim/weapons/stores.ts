import type { AircraftSpec } from '../flight/schema.js'

export type StoresState = { readonly bombs: number; readonly rockets: number }
export const emptyStores: StoresState = { bombs: 0, rockets: 0 }

export type Loadout = 'clean' | 'bombs' | 'rockets' | 'both'

/** Counts from the title screen's choice (spec §2.4: loadout is NOT scenario
 *  content). A spec with no `stores` block only ever returns `emptyStores`. */
export function storesFromLoadout(spec: AircraftSpec, loadout: Loadout): StoresState {
  const s = spec.stores
  if (s === undefined || loadout === 'clean') return emptyStores
  return {
    bombs: loadout === 'bombs' || loadout === 'both' ? s.racks.length : 0,
    rockets: loadout === 'rockets' || loadout === 'both' ? s.rails.length : 0,
  }
}

/**
 * Bakes the REMAINING store mass and drag area into a derived spec, exactly
 * as `damagedSpec` bakes damage in (Plan 6b, following that precedent so
 * `massKg` and the drag sum need no new parameter). Returns the SAME OBJECT
 * when there is nothing carried, so the calm path is bit-identical -- the
 * `=== f6f` identity the tests in `stores.test.ts` pin.
 *
 * Assumes every rack carries the same store type and every rail carries the
 * same store type, true of the shipped content; if a future loadout mixes
 * types per-rack, `storesFromLoadout`/`storesSpec` need a per-slot count
 * instead of a flat `bombs`/`rockets` total -- out of scope here.
 */
export function storesSpec(spec: AircraftSpec, stores: StoresState): AircraftSpec {
  if (stores.bombs === 0 && stores.rockets === 0) return spec
  const s = spec.stores
  if (s === undefined) return spec
  const bombType = s.types[s.racks[0]!.store]!
  const rocketType = s.types[s.rails[0]!.store]!
  const massKgLoad = stores.bombs * bombType.massKg + stores.rockets * rocketType.massKg
  const dragAreaM2Load = stores.bombs * bombType.dragAreaM2 + stores.rockets * rocketType.dragAreaM2
  return {
    ...spec,
    mass: { ...spec.mass, emptyKg: spec.mass.emptyKg + massKgLoad },
    storesLoad: { massKg: massKgLoad, dragAreaM2: dragAreaM2Load },
  }
}
