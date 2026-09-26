import type { SurfaceLayer } from '../../src/render/terrain/surfaceManifest.js'

export type TextureSource = {
  readonly layer: SurfaceLayer
  readonly id: string
  readonly author: string
  readonly license: 'CC0-1.0'
  readonly tileM: number
  readonly diffuse: { readonly url: string; readonly md5: string }
  readonly normal: { readonly url: string; readonly md5: string }
}

const PH = 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k'

/** Poly Haven, 2k JPG, MD5s from api.polyhaven.com/files/<id> (2026-09-25).
 *  `tileM` is Poly Haven's own real-world scan size for the asset. In
 *  SURFACE_LAYERS order. */
export const TEXTURE_SOURCES: readonly TextureSource[] = [
  { layer: 'sand', id: 'aerial_beach_01', author: 'Rob Tuytel', license: 'CC0-1.0', tileM: 30,
    diffuse: { url: `${PH}/aerial_beach_01/aerial_beach_01_diff_2k.jpg`, md5: 'b06496ad69bc0587e03e9cbcf9a80d76' },
    normal: { url: `${PH}/aerial_beach_01/aerial_beach_01_nor_gl_2k.jpg`, md5: 'fdf59672f1e41cd406c2107f6cea538d' } },
  { layer: 'grass', id: 'leafy_grass', author: 'Charlotte Baglioni', license: 'CC0-1.0', tileM: 2,
    diffuse: { url: `${PH}/leafy_grass/leafy_grass_diff_2k.jpg`, md5: '8014f4dace676a62ed71b3dd76119dae' },
    normal: { url: `${PH}/leafy_grass/leafy_grass_nor_gl_2k.jpg`, md5: 'ea5e91abe01dc5e5d7028c68c3bc9194' } },
  { layer: 'dirt', id: 'dirt_aerial_02', author: 'Rob Tuytel', license: 'CC0-1.0', tileM: 20,
    diffuse: { url: `${PH}/dirt_aerial_02/dirt_aerial_02_diff_2k.jpg`, md5: '100d18e171bc3c4929a54bd1efe10755' },
    normal: { url: `${PH}/dirt_aerial_02/dirt_aerial_02_nor_gl_2k.jpg`, md5: 'bc6e87fda54e73ff8b9f15c56f4632b3' } },
  // Note `_diffuse_`, not `_diff_`: this asset's file name differs.
  { layer: 'jungle', id: 'forest_leaves_02', author: 'Rob Tuytel', license: 'CC0-1.0', tileM: 3,
    diffuse: { url: `${PH}/forest_leaves_02/forest_leaves_02_diffuse_2k.jpg`, md5: 'b7837ba1c51fb0e11af36d6b4e225c20' },
    normal: { url: `${PH}/forest_leaves_02/forest_leaves_02_nor_gl_2k.jpg`, md5: 'f974000a2ddc7dcd22bc84c37aa5d7ce' } },
  { layer: 'rock', id: 'aerial_rocks_02', author: 'Rob Tuytel', license: 'CC0-1.0', tileM: 50,
    diffuse: { url: `${PH}/aerial_rocks_02/aerial_rocks_02_diff_2k.jpg`, md5: 'f493fa9b31911f8a30ecd1d41cbc6f3d' },
    normal: { url: `${PH}/aerial_rocks_02/aerial_rocks_02_nor_gl_2k.jpg`, md5: '7c405cfd3308a2672c99b44e102c328e' } },
]
