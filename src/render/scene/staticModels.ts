import { staticModelUrl } from '../content.js'

export type StaticModelKind = 'building' | 'vehicle'

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
    'pier-and-warehouses': { url: staticModelUrl('building', 'pier-and-warehouses') },
    'radio-radar-station': { url: staticModelUrl('building', 'radio-radar-station') },
    revetment: { url: staticModelUrl('building', 'revetment') },
    tower: { url: staticModelUrl('building', 'tower') },
  },
  vehicle: {
    'type97-chi-ha': { url: staticModelUrl('vehicle', 'type97-chi-ha') },
    'willys-mb-jeep': { url: staticModelUrl('vehicle', 'willys-mb-jeep') },
  },
}

export function staticModelUrlFor(kind: StaticModelKind, id: string): string {
  const table = STATIC_MODELS[kind]
  if (!Object.hasOwn(table, id)) {
    throw new Error(`no ${kind} model "${id}" (registered: ${Object.keys(table).join(', ') || 'none'}); register it in src/render/scene/staticModels.ts`)
  }
  return table[id]!.url
}
