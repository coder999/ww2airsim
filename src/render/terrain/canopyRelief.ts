/**
 * Shared constants of the canopy relief channel (forest canopy rework, 2026-10-16). The bake
 * (`tools/terrain/canopy.ts`) and the shader (`canopy.ts`) must agree on them, so they live in one file.
 */
/** One tile of the periodic canopy material covers this many metres a side (about 1,680 ft). */
export const CANOPY_TILE_M = 512
/** The height byte maps linearly onto this range of crown height above the forest floor, metres. */
export const CANOPY_HEIGHT_MIN_M = 4
export const CANOPY_HEIGHT_MAX_M = 28
/** The R8 height texture is the same size as the packed material. */
export const CANOPY_TEXELS = 1024
