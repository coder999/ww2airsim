// tools/models/skin/colors.ts
/**
 * Marking colors for the skin stage (DP0), sRGB 0-255. Every value is an ESTIMATE unless its
 * comment cites a source (Task 1 of the DP0 plan replaces an estimate only with a citation).
 * The palette roles' own colors are not here: the kit writes them into each sidecar, so
 * kit.py's PALETTE stays their one source.
 */
export const MARKING_COLORS = {
  hinomaruRed: [0xb3, 0x24, 0x2a], // ESTIMATE: a faded IJAAF hinomaru red
  insigniaWhite: [0xe6, 0xe4, 0xdc], // ESTIMATE: off-white, weathered
  idYellow: [0xe0, 0xa8, 0x1e], // ESTIMATE: IJAAF leading-edge identification yellow
  exhaustSoot: [0x2a, 0x26, 0x22], // ESTIMATE
  walkwayDark: [0x33, 0x33, 0x30], // ESTIMATE
  lensClear: [0xc8, 0xd4, 0xdc], // ESTIMATE: a landing-light cover
  // DP1 (USAAF). The 1943 insignia's colors are named by Army-Navy spec AN-I-9 (English Wikipedia, "United States
  // military aircraft national insignia", read 2026-09-28: blue outline from 14 Aug 1943, TO 07-1-1 of 24 Sep 1943);
  // no chip, FS number or RGB was read, so every value below is an ESTIMATE.
  usaaInsigniaBlue: [0x1c, 0x2a, 0x4a], // ESTIMATE: Insignia Blue, weathered
  usaaInsigniaWhite: [0xe8, 0xe6, 0xdf], // ESTIMATE: insignia white, weathered
  usaaInsigniaRed: [0x9a, 0x22, 0x26], // ESTIMATE: Insignia Red (the June-Sep 1943 outline; the red of the cited 1943 style)
  usaaOliveDrab: [0x5b, 0x58, 0x3a], // ESTIMATE: a common sRGB rendering of olive drab (the anti-glare panel); no chip read
  propTipYellow: [0xe6, 0xb8, 0x1c], // ESTIMATE: US propeller-tip yellow; no source read
  // M1 (ships, 2026-10-08). The USN Measure colors are named by the 1941-1945 Ship Camouflage Instructions
  // (SHIPS-2); no chip or Munsell value was read, so every value is an ESTIMATE of a weathered sRGB rendering.
  rustStain: [0x6e, 0x3e, 0x24], // ESTIMATE: a rust streak's brown
  navyBlue5N: [0x3a, 0x45, 0x55], // ESTIMATE: 5-N Navy Blue (Measure 21's vertical surfaces)
  oceanGray5O: [0x5f, 0x68, 0x70], // ESTIMATE: 5-O Ocean Gray
  lightGray5L: [0x9a, 0xa0, 0xa4], // ESTIMATE: 5-L Light Gray
  dullBlackBK: [0x24, 0x26, 0x28], // ESTIMATE: BK Dull Black
  // M1e (2026-10-09): Zuikaku's Leyte camouflage. The U.S. Navy photographs of her off Cape Engano,
  // 25 October 1944 (English Wikipedia, "Japanese aircraft carrier Zuikaku"), show a disruptive pattern
  // on the hull, island and flight deck, but they are black and white: every color is an ESTIMATE.
  ijnCamoGreen: [0x3e, 0x48, 0x36], // ESTIMATE: a dark green over the Kure gray
  ijnCamoLight: [0x8a, 0x8e, 0x86], // ESTIMATE: a light green-gray
  ijnCamoDark: [0x3a, 0x3c, 0x3a], // ESTIMATE: a black-gray (the flight deck's darkest bands)
} as const satisfies Record<string, readonly [number, number, number]>

export type MarkingColor = keyof typeof MARKING_COLORS
export const MARKING_COLOR_NAMES = Object.keys(MARKING_COLORS).sort() as [MarkingColor, ...MarkingColor[]]
/** What a paint chip shows: kit.py PALETTE's naturalMetal, sRGB 0-255. */
export const BARE_METAL = [0xb4, 0xb8, 0xbc] as const

export const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

/** Built once: the per-texel math is table lookups, so no transcendental runs per sample. */
export const SRGB8_TO_LINEAR = Float64Array.from({ length: 256 }, (_, i) => srgbToLinear(i / 255))
const STEPS = 65536
const TO_SRGB8 = Uint8Array.from({ length: STEPS + 1 }, (_, i) => {
  const l = i / STEPS
  return Math.round((l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055) * 255)
})
export const linearToSrgb8 = (l: number): number => TO_SRGB8[Math.round(Math.min(1, Math.max(0, l)) * STEPS)]!
