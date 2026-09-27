import { existsSync } from 'node:fs'
import sharp from 'sharp'
import { fetchPinned, pinnedCachePath } from '../../textures/fetchPinned.js'

const PH1K = 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k'

/** Poly Haven "Blue Metal Plate", Rob Tuytel, CC0; a 2.5 m scan of scratched, scuffed painted
 *  steel (https://polyhaven.com/a/blue_metal_plate). MD5s from
 *  api.polyhaven.com/files/blue_metal_plate, read 2026-09-26. Only its luminance, normals and
 *  roughness are used: the paint color is per vertex (mesh.ts). */
export const PAINTED_METAL = {
  id: 'blue_metal_plate', author: 'Rob Tuytel', license: 'CC0-1.0', tileM: 2.5,
  diffuse: { url: `${PH1K}/blue_metal_plate/blue_metal_plate_diff_1k.jpg`, md5: 'a906d0e554596fb76c6969f2f644c5e6' },
  normal: { url: `${PH1K}/blue_metal_plate/blue_metal_plate_nor_gl_1k.jpg`, md5: 'f14c0f01832f8b18c39f07e4b5d6f749' },
  rough: { url: `${PH1K}/blue_metal_plate/blue_metal_plate_rough_1k.jpg`, md5: '76c3911d8ad2416e4db3104a2ef831c7' },
} as const

export const PAINT_TEXTURE_SIZE = 512

export interface PaintTextures { readonly baseColor: Uint8Array; readonly normal: Uint8Array; readonly metallicRoughness: Uint8Array }

/** All three source files are already in tools/textures/cache (the byte-identity tests need them). */
export const paintCached = (): boolean =>
  [PAINTED_METAL.diffuse, PAINTED_METAL.normal, PAINTED_METAL.rough].every((s) => existsSync(pinnedCachePath(s.url)))

/**
 * The three WebP images every generated store embeds. Base color: the scan's luminance,
 * squeezed into 150..239 of 255, so COLOR_0 sets the hue and the scan adds only wear.
 * Metallic-roughness: G = the scan's roughness, B = 0 (paint is a dielectric), R unused.
 */
export async function loadPaintTextures(): Promise<PaintTextures> {
  const size = PAINT_TEXTURE_SIZE
  const diff = await fetchPinned(PAINTED_METAL.diffuse.url, PAINTED_METAL.diffuse.md5)
  const nor = await fetchPinned(PAINTED_METAL.normal.url, PAINTED_METAL.normal.md5)
  const rough = await fetchPinned(PAINTED_METAL.rough.url, PAINTED_METAL.rough.md5)
  const baseColor = await sharp(diff).resize(size, size).greyscale().linear(0.35, 150).toColourspace('srgb').webp({ quality: 80 }).toBuffer()
  const normal = await sharp(nor).resize(size, size).removeAlpha().webp({ quality: 90 }).toBuffer()
  const { data, info } = await sharp(rough).resize(size, size).greyscale().raw().toBuffer({ resolveWithObject: true })
  if (info.channels !== 1) throw new Error(`paint: roughness decoded to ${info.channels} channels, expected 1`)
  const rgb = Buffer.alloc(size * size * 3)
  for (let i = 0; i < size * size; i++) { rgb[3 * i] = 255; rgb[3 * i + 1] = data[i]!; rgb[3 * i + 2] = 0 }
  const metallicRoughness = await sharp(rgb, { raw: { width: size, height: size, channels: 3 } }).webp({ quality: 90 }).toBuffer()
  return { baseColor: new Uint8Array(baseColor), normal: new Uint8Array(normal), metallicRoughness: new Uint8Array(metallicRoughness) }
}
