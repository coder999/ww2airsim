import type { SceneryTextureLayer } from '../../src/render/scene/sceneryTextureManifest.js'

export type SceneryTextureSource = {
  readonly layer: SceneryTextureLayer
  readonly id: string
  readonly author: string
  readonly license: 'CC0-1.0'
  readonly tileM: number
  readonly diffuse: { readonly url: string; readonly md5: string }
  readonly normal: { readonly url: string; readonly md5: string }
}

const PH = 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k'

/** Poly Haven 2k JPGs, pinned to API-reported MD5s on 2026-10-11. */
export const SCENERY_TEXTURE_SOURCES: readonly SceneryTextureSource[] = [
  { layer: 'steel', id: 'corrugated_iron_02', author: 'Jenelle van Heerden, Sergej Majboroda', license: 'CC0-1.0', tileM: 2.7,
    diffuse: { url: `${PH}/corrugated_iron_02/corrugated_iron_02_diff_2k.jpg`, md5: '88f0ec0310e41f408dd0092c8c53db58' },
    normal: { url: `${PH}/corrugated_iron_02/corrugated_iron_02_nor_gl_2k.jpg`, md5: '7ce1e415161ddffdf06fb1f9a80bae5c' } },
  { layer: 'timber', id: 'brown_planks_04', author: 'Rob Tuytel', license: 'CC0-1.0', tileM: 1,
    diffuse: { url: `${PH}/brown_planks_04/brown_planks_04_diff_2k.jpg`, md5: '4722ea52e7271faa2bea987c3161738e' },
    normal: { url: `${PH}/brown_planks_04/brown_planks_04_nor_gl_2k.jpg`, md5: 'bbd6eb38ca99ffd1fa1b64c65b6e2a03' } },
  { layer: 'concrete', id: 'concrete_wall_008', author: 'Charlotte Baglioni, Dario Barresi', license: 'CC0-1.0', tileM: 2.71,
    diffuse: { url: `${PH}/concrete_wall_008/concrete_wall_008_diff_2k.jpg`, md5: '9e834dad5c07a3ba452a2ad0f1454c9f' },
    normal: { url: `${PH}/concrete_wall_008/concrete_wall_008_nor_gl_2k.jpg`, md5: 'deca87f9fa074c7f041d23178f74ec95' } },
]
