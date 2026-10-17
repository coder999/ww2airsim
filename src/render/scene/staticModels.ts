import { staticModelUrl } from '../content.js'

export type StaticModelKind = 'building' | 'vehicle' | 'equipment'

/**
 * Model id to committed glb, for the kinds with no sim module (model-roster spec §4.3): buildings
 * and vehicles, which the Hangar draws and the game does not (spec §6.3). The twin of
 * shipModels.ts's SHIP_MODELS. Each id equals its manifest entry's id;
 * tests/render/staticModels.test.ts checks that every id here has its entry and its committed glb.
 */
export const STATIC_MODELS: Readonly<Record<StaticModelKind, Readonly<Record<string, { readonly url: string }>>>> = {
  building: {
    aaa: { url: staticModelUrl('building', 'aaa') },
    'ammunition-bunker': { url: staticModelUrl('building', 'ammunition-bunker') },
    'barracks-and-huts': { url: staticModelUrl('building', 'barracks-and-huts') },
    'coastal-gun-battery': { url: staticModelUrl('building', 'coastal-gun-battery') },
    'fuel-tank-farm': { url: staticModelUrl('building', 'fuel-tank-farm') },
    hangar: { url: staticModelUrl('building', 'hangar') },
    'jinamoc-seaplane-ramp': { url: staticModelUrl('building', 'jinamoc-seaplane-ramp') },
    'ormoc-customs-building': { url: staticModelUrl('building', 'ormoc-customs-building') },
    'pier-and-warehouses': { url: staticModelUrl('building', 'pier-and-warehouses') },
    'pontoon-pier-segment': { url: staticModelUrl('building', 'pontoon-pier-segment') },
    'quonset-hut-20x48': { url: staticModelUrl('building', 'quonset-hut-20x48') },
    'radio-radar-station': { url: staticModelUrl('building', 'radio-radar-station') },
    revetment: { url: staticModelUrl('building', 'revetment') },
    tower: { url: staticModelUrl('building', 'tower') },
  },
  vehicle: {
    'caterpillar-d7-3t': { url: staticModelUrl('vehicle', 'caterpillar-d7-3t') },
    'gmc-cckw-353': { url: staticModelUrl('vehicle', 'gmc-cckw-353') },
    lcvp: { url: staticModelUrl('vehicle', 'lcvp') },
    'm4-sherman': { url: staticModelUrl('vehicle', 'm4-sherman') },
    'type38-75mm-field-gun': { url: staticModelUrl('vehicle', 'type38-75mm-field-gun') },
    'type94-cargo-truck': { url: staticModelUrl('vehicle', 'type94-cargo-truck') },
    'type95-kurogane': { url: staticModelUrl('vehicle', 'type95-kurogane') },
    'type97-chi-ha': { url: staticModelUrl('vehicle', 'type97-chi-ha') },
    'usaaf-63ft-rescue-boat': { url: staticModelUrl('vehicle', 'usaaf-63ft-rescue-boat') },
    'willys-mb-jeep': { url: staticModelUrl('vehicle', 'willys-mb-jeep') },
  },
  equipment: {
    'm1942-60in-searchlight': { url: staticModelUrl('equipment', 'm1942-60in-searchlight') },
    'm24-aircraft-parachute-flare': { url: staticModelUrl('equipment', 'm24-aircraft-parachute-flare') },
    'parachuting-person-rig': { url: staticModelUrl('equipment', 'parachuting-person-rig') },
    'paratrooper-supply-bundle': { url: staticModelUrl('equipment', 'paratrooper-supply-bundle') },
    'panirugan-red-harbor-light': { url: staticModelUrl('equipment', 'panirugan-red-harbor-light') },
    'pby-mooring-buoy': { url: staticModelUrl('equipment', 'pby-mooring-buoy') },
    'portable-runway-flare-pot': { url: staticModelUrl('equipment', 'portable-runway-flare-pot') },
    'ranger-temporary-nav-light': { url: staticModelUrl('equipment', 'ranger-temporary-nav-light') },
    'suluan-damaged-lighthouse': { url: staticModelUrl('equipment', 'suluan-damaged-lighthouse') },
    'type-a3-life-raft-survivors': { url: staticModelUrl('equipment', 'type-a3-life-raft-survivors') },
  },
}

export function staticModelUrlFor(kind: StaticModelKind, id: string): string {
  const table = STATIC_MODELS[kind]
  if (!Object.hasOwn(table, id)) {
    throw new Error(`no ${kind} model "${id}" (registered: ${Object.keys(table).join(', ') || 'none'}); register it in src/render/scene/staticModels.ts`)
  }
  return table[id]!.url
}
