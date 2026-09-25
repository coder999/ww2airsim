/** Cloud Fidelity II §3.4's packed noise assets: shape RGBA8, detail RGBA8
 *  (RGB used; A is padding for WebGPU's supported 3D formats), curl RG8, and
 *  the §3.3 weather map RGBA8. All are tileable and committed under
 *  content/sky/. Sizes live here so the build and browser loader cannot
 *  disagree about a byte count. */
export const SHAPE_SIZE = 128
export const DETAIL_SIZE = 64
export const CURL_SIZE = 128
/** Weather map texels per side, and metres per repeat: 78 m per texel, so
 *  a 700 m-wide cloud spans ~9 texels of its own footprint. */
export const WEATHER_SIZE = 512
export const WEATHER_TILE_M = 40_000
export const shapeByteLength = (): number => SHAPE_SIZE ** 3 * 4
export const detailByteLength = (): number => DETAIL_SIZE ** 3 * 4
export const curlByteLength = (): number => CURL_SIZE ** 2 * 2
export const weatherByteLength = (): number => WEATHER_SIZE ** 2 * 4
