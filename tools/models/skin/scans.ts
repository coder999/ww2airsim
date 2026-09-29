// tools/models/skin/scans.ts
import { existsSync } from 'node:fs'
import sharp from 'sharp'
import { fetchPinned, pinnedCachePath } from '../../textures/fetchPinned.js'
import { PAINTED_METAL } from '../generated/paint.js'
import type { ScanId } from './surfaces.js'

const PH1K = 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k'
const files = (id: string, diff: string, nor: string, rough: string) => ({
  diffuse: { url: `${PH1K}/${id}/${id}_diff_1k.jpg`, md5: diff },
  normal: { url: `${PH1K}/${id}/${id}_nor_gl_1k.jpg`, md5: nor },
  rough: { url: `${PH1K}/${id}/${id}_rough_1k.jpg`, md5: rough },
})

export interface ScanFile { readonly url: string; readonly md5: string }
export interface ScanSource {
  readonly polyHaven: string; readonly authors: string; readonly license: 'CC0-1.0'; readonly tileM: number
  readonly diffuse: ScanFile; readonly normal: ScanFile; readonly rough: ScanFile
}

/** MD5s from api.polyhaven.com/files/<id>, read 2026-09-28 (painted metal: O1's, read 2026-09-26).
 *  Tile sizes are each asset's own "dimensions" (mm) from api.polyhaven.com/info/<id>. */
export const SCANS: Readonly<Record<ScanId, ScanSource>> = {
  'painted-metal': { polyHaven: PAINTED_METAL.id, authors: PAINTED_METAL.author, license: 'CC0-1.0', tileM: PAINTED_METAL.tileM, diffuse: PAINTED_METAL.diffuse, normal: PAINTED_METAL.normal, rough: PAINTED_METAL.rough },
  'corrugated-iron': { polyHaven: 'worn_corrugated_iron', authors: 'Dimitrios Savva (photography), Jenelle van Heerden (processing)', license: 'CC0-1.0', tileM: 1.8,
    ...files('worn_corrugated_iron', 'dee4306e2c337afcb3a815eb3345c7bd', 'b1fdf9a7fa3ca2764fe1621a6bdea0db', '78ed19c7b13281d6bfcf12fc9ee27dc3') },
  concrete: { polyHaven: 'concrete_floor_worn_001', authors: 'Dimitrios Savva (photography), Rico Cilliers (processing)', license: 'CC0-1.0', tileM: 3.0,
    ...files('concrete_floor_worn_001', 'e35597cca586150b1ab2aa9a331a39c5', '9de6626758f8793b71182b892c110827', 'b158eae73029ac6a849481274a0e1b35') },
}

export const scansCached = (ids: readonly ScanId[] = Object.keys(SCANS) as ScanId[]): boolean =>
  ids.every((id) => [SCANS[id].diffuse, SCANS[id].normal, SCANS[id].rough].every((f) => existsSync(pinnedCachePath(f.url))))

export interface ScanLevel { readonly size: number; readonly lum: Float32Array; readonly rough: Float32Array; readonly nrm: Float32Array }
export interface Scan {
  readonly size: number; readonly tileM: number; readonly levels: readonly ScanLevel[]; readonly meanLum: number
  lumAtQuantile(q: number): number
}
export interface ScanSample { readonly lum: number; readonly rough: number; readonly n: [number, number, number] }

function halve(l: ScanLevel): ScanLevel {
  const s = l.size / 2
  const lum = new Float32Array(s * s), rough = new Float32Array(s * s), nrm = new Float32Array(3 * s * s)
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const o = y * s + x
    const i = [(2 * y) * l.size + 2 * x, (2 * y) * l.size + 2 * x + 1, (2 * y + 1) * l.size + 2 * x, (2 * y + 1) * l.size + 2 * x + 1]
    lum[o] = (l.lum[i[0]!]! + l.lum[i[1]!]! + l.lum[i[2]!]! + l.lum[i[3]!]!) / 4
    rough[o] = (l.rough[i[0]!]! + l.rough[i[1]!]! + l.rough[i[2]!]! + l.rough[i[3]!]!) / 4
    for (let c = 0; c < 3; c++) nrm[3 * o + c] = (l.nrm[3 * i[0]! + c]! + l.nrm[3 * i[1]! + c]! + l.nrm[3 * i[2]! + c]! + l.nrm[3 * i[3]! + c]!) / 4
  }
  return { size: s, lum, rough, nrm }
}

/** A scan from decoded channels: `size` a power of two, `nrm` xyz in [-1, 1] interleaved. */
export function scanFromChannels(size: number, tileM: number, lum: Float32Array, rough: Float32Array, nrm: Float32Array): Scan {
  if (size < 1 || (size & (size - 1)) !== 0) throw new Error(`scan: size ${size} is not a power of two`)
  const levels: ScanLevel[] = [{ size, lum, rough, nrm }]
  while (levels[levels.length - 1]!.size > 1) levels.push(halve(levels[levels.length - 1]!))
  const sorted = Float32Array.from(lum).sort()
  return {
    size, tileM, levels, meanLum: levels[levels.length - 1]!.lum[0]!,
    lumAtQuantile: (q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))]!,
  }
}

const wrap = (i: number, n: number): number => ((i % n) + n) % n

/**
 * The scan at chart coordinates (uM, vM) meters, averaged over a texel `footprintM` wide: the
 * mip level is the finest whose texel covers the footprint, then bilinear with wrap. One level,
 * not two, so the result is a plain function of its inputs (Review Focus 3).
 */
export function sampleScan(scan: Scan, uM: number, vM: number, footprintM: number): ScanSample {
  let k = 0, texel = scan.tileM / scan.size
  while (texel < footprintM && k < scan.levels.length - 1) { k++; texel *= 2 }
  const l = scan.levels[k]!
  const fx = (uM / scan.tileM) * l.size - 0.5, fy = (vM / scan.tileM) * l.size - 0.5
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0
  const idx = [wrap(y0, l.size) * l.size + wrap(x0, l.size), wrap(y0, l.size) * l.size + wrap(x0 + 1, l.size),
    wrap(y0 + 1, l.size) * l.size + wrap(x0, l.size), wrap(y0 + 1, l.size) * l.size + wrap(x0 + 1, l.size)]
  const w = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty]
  let lum = 0, rough = 0, nx = 0, ny = 0, nz = 0
  for (let j = 0; j < 4; j++) {
    const i = idx[j]!, wj = w[j]!
    lum += wj * l.lum[i]!; rough += wj * l.rough[i]!
    nx += wj * l.nrm[3 * i]!; ny += wj * l.nrm[3 * i + 1]!; nz += wj * l.nrm[3 * i + 2]!
  }
  return { lum, rough, n: [nx, ny, nz] }
}

/** Decodes the three pinned 1k JPGs (fetched once into tools/textures/cache). Luminance is the
 *  diffuse's grayscale; the normal is Poly Haven's OpenGL map, glTF's convention, unchanged. */
export async function loadScan(id: ScanId): Promise<Scan> {
  const src = SCANS[id]
  const raw = async (f: ScanFile, channels: 1 | 3): Promise<{ data: Buffer; size: number }> => {
    const img = sharp(await fetchPinned(f.url, f.md5))
    const { data, info } = await (channels === 1 ? img.greyscale() : img.removeAlpha()).raw().toBuffer({ resolveWithObject: true })
    if (info.channels !== channels || info.width !== info.height) throw new Error(`scan ${id}: ${f.url} decoded to ${info.width}x${info.height}x${info.channels}, expected square x${channels}`)
    return { data, size: info.width }
  }
  const diff = await raw(src.diffuse, 1), nor = await raw(src.normal, 3), rgh = await raw(src.rough, 1)
  if (nor.size !== diff.size || rgh.size !== diff.size) throw new Error(`scan ${id}: map sizes differ`)
  const n = diff.size, count = n * n
  const lum = new Float32Array(count), rough = new Float32Array(count), nrm = new Float32Array(3 * count)
  for (let i = 0; i < count; i++) {
    lum[i] = diff.data[i]! / 255
    rough[i] = rgh.data[i]! / 255
    for (let c = 0; c < 3; c++) nrm[3 * i + c] = nor.data[3 * i + c]! / 127.5 - 1
  }
  return scanFromChannels(n, src.tileM, lum, rough, nrm)
}
