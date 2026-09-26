// src/render/scene/shipPalette.ts
/**
 * Ship paint, one color per palette role (ship-models spec §5.1). The boxes
 * in ship.ts and the models built by tools/models/stages/shipMaterials.ts both
 * read this, so a ship looks the same color whichever path draws it. The
 * values are a render choice, not a sourced Measure: `hull` and `flightDeck`
 * are the two colors ship.ts drew before S1, which photoreal Task 12's deck
 * luminance gate (tests/e2e/deckQuals.spec.ts) measured at 0.64 of the
 * runway on 2026-09-25; tune inside that gate, never re-baseline it.
 */
export const SHIP_ROLES = ['hull', 'deck', 'flightDeck', 'boot', 'antifouling', 'superstructure', 'fitting'] as const
export type ShipRole = (typeof SHIP_ROLES)[number]

export const SHIP_PALETTES = {
  'usn-1944': {
    hull: 0x5c6670,
    deck: 0x3b3f44,
    flightDeck: 0x3b3f44,
    boot: 0x1e2124,
    antifouling: 0x5b2a24,
    superstructure: 0x5c6670,
    fitting: 0x4b535b,
  },
} as const satisfies Record<string, Record<ShipRole, number>>

export type ShipPaletteId = keyof typeof SHIP_PALETTES
export const SHIP_PALETTE_IDS = Object.keys(SHIP_PALETTES) as ShipPaletteId[]

/** Every role's roughness; metalness is always 0 (spec §5.1-5.2). */
export const SHIP_ROUGHNESS = 0.8

/** An sRGB hex color as a LINEAR glTF baseColorFactor, the conversion three.js applies to `color: 0x...`. */
export function linearFactor(hex: number): [number, number, number, number] {
  const lin = (c: number): number => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
  return [lin((hex >> 16) & 0xff), lin((hex >> 8) & 0xff), lin(hex & 0xff), 1]
}
