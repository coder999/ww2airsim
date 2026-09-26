/** Cloud Fidelity II §3.4's packed noise assets: shape RGBA8, detail RGBA8
 *  (RGB used; A is padding for WebGPU's supported 3D formats), curl RG8, and
 *  the §3.3 weather map RGBA8. All are tileable and committed under
 *  content/sky/. Sizes live here so the build and browser loader cannot
 *  disagree about a byte count. */
export const SHAPE_SIZE = 128
export const DETAIL_SIZE = 64
export const CURL_SIZE = 128
/** Cumulus archetype density, R8, indexed [x, y, z]: one procedural
 *  cumulus (stacked spheres billowed by Worley noise), built at half its
 *  generated resolution by tools/sky/cumulus.py (numpy seed 7). */
export const CUMULUS_DIMS = [125, 85, 153] as const
/** Weather map texels per side, and metres per repeat: 39 m per texel. */
export const WEATHER_SIZE = 1024
export const WEATHER_TILE_M = 40_000
/** Metres between feature points on the weather map's jittered grid (one
 *  cloud per grid cell), and the footprint radius range of one cloud. */
export const WEATHER_CELL_SPACING_M = 1500
export const WEATHER_RADIUS_M: readonly [number, number] = [330, 950]
/** Feature points are snapped to 1/51 of a cell. With the winning cloud at
 *  most 2 cells from a texel's own cell, its position fits one byte
 *  exactly: 5 cells x 51 steps = 255 (see tools/sky/weather.ts). */
export const WEATHER_FEATURE_STEPS = 51
export const WEATHER_CELL_REACH = 2
export const shapeByteLength = (): number => SHAPE_SIZE ** 3 * 4
export const detailByteLength = (): number => DETAIL_SIZE ** 3 * 4
export const curlByteLength = (): number => CURL_SIZE ** 2 * 2
export const cumulusByteLength = (): number => CUMULUS_DIMS[0] * CUMULUS_DIMS[1] * CUMULUS_DIMS[2]
export const weatherByteLength = (): number => WEATHER_SIZE ** 2 * 4
