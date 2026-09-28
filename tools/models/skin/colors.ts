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
