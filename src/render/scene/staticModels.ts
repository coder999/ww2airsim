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
    hangar: { url: staticModelUrl('building', 'hangar') },
    tower: { url: staticModelUrl('building', 'tower') },
  },
  vehicle: {},
}

export function staticModelUrlFor(kind: StaticModelKind, id: string): string {
  const table = STATIC_MODELS[kind]
  if (!Object.hasOwn(table, id)) {
    throw new Error(`no ${kind} model "${id}" (registered: ${Object.keys(table).join(', ') || 'none'}); register it in src/render/scene/staticModels.ts`)
  }
  return table[id]!.url
}
