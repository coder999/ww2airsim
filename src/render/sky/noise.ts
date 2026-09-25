/** Shape and detail volumes (Plan 16a design §3), R8, and the cumulus
 *  weather map (Cloud Fidelity II §3.3), RGBA8: tileable, committed under
 *  content/sky/. Sizes are here, importable by both the Node build and the
 *  browser loader, so the two cannot disagree about a byte count. */
export const SHAPE_SIZE = 128
export const DETAIL_SIZE = 32
/** Weather map texels per side, and metres per repeat: 78 m per texel, so
 *  a 700 m-wide cloud spans ~9 texels of its own footprint. */
export const WEATHER_SIZE = 512
export const WEATHER_TILE_M = 40_000
export const shapeByteLength = (): number => SHAPE_SIZE ** 3
export const detailByteLength = (): number => DETAIL_SIZE ** 3
export const weatherByteLength = (): number => WEATHER_SIZE ** 2 * 4
