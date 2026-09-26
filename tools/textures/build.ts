import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { SURFACE_LAYERS, surfaceManifestSchema, type SurfaceManifest } from '../../src/render/terrain/surfaceManifest.js'
import { readKtx2Header } from './ktx2.js'
import { ktxBinary, TEXTURE_CACHE } from './ktxTool.js'
import { TEXTURE_SOURCES } from './sources.js'

const OUT = fileURLToPath(new URL('../../content/textures/', import.meta.url))
const VENDOR = fileURLToPath(new URL('../../content/vendor/basis/', import.meta.url))
const THREE_BASIS = fileURLToPath(new URL('../../node_modules/three/examples/jsm/libs/basis/', import.meta.url))
const ALBEDO_SIZE = 1024
const NORMAL_SIZE = 512

async function fetchPinned(url: string, md5: string): Promise<string> {
  const file = join(TEXTURE_CACHE, url.split('/').pop()!)
  if (!existsSync(file)) {
    const res = await globalThis.fetch(url, { headers: { 'User-Agent': 'ww2airsim-textures-build' } })
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
    writeFileSync(file, new Uint8Array(await res.arrayBuffer()))
  }
  const got = createHash('md5').update(readFileSync(file)).digest('hex')
  if (got !== md5) throw new Error(`${file}: md5 ${got}, expected ${md5}`)
  return file
}

const toLinear = (c: number): number => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }

async function main(): Promise<void> {
  if (TEXTURE_SOURCES.map(s => s.layer).join() !== SURFACE_LAYERS.join()) throw new Error('TEXTURE_SOURCES is not in SURFACE_LAYERS order')
  mkdirSync(TEXTURE_CACHE, { recursive: true }); mkdirSync(OUT, { recursive: true }); mkdirSync(VENDOR, { recursive: true })
  const ktx = await ktxBinary()
  const albedoPngs: string[] = [], normalPngs: string[] = []
  const layers: SurfaceManifest['layers'] = []
  for (const s of TEXTURE_SOURCES) {
    const diff = await fetchPinned(s.diffuse.url, s.diffuse.md5)
    const nor = await fetchPinned(s.normal.url, s.normal.md5)
    const a = join(TEXTURE_CACHE, `${s.id}_albedo${ALBEDO_SIZE}.png`)
    const n = join(TEXTURE_CACHE, `${s.id}_normal${NORMAL_SIZE}.png`)
    await sharp(diff).resize(ALBEDO_SIZE, ALBEDO_SIZE).removeAlpha().ensureAlpha(1).png().toFile(a)
    await sharp(nor).resize(NORMAL_SIZE, NORMAL_SIZE).removeAlpha().ensureAlpha(1).png().toFile(n)
    const { data, info } = await sharp(a).raw().toBuffer({ resolveWithObject: true })
    const sum = [0, 0, 0]
    for (let i = 0; i < data.length; i += info.channels) for (let c = 0; c < 3; c++) sum[c]! += toLinear(data[i + c]!)
    const px = data.length / info.channels
    const round = (x: number): number => Math.round(x * 1e5) / 1e5
    layers.push({ name: s.layer, source: s.id, tileM: s.tileM, meanLinear: [round(sum[0]! / px), round(sum[1]! / px), round(sum[2]! / px)] })
    albedoPngs.push(a); normalPngs.push(n)
  }
  const albedo = join(OUT, 'terrain-albedo.ktx2'), normal = join(OUT, 'terrain-normal.ktx2')
  // Encoder settings measured 2026-09-25: 1,155,101 B / 1,614,032 B.
  execFileSync(ktx, ['create', '--format', 'R8G8B8A8_SRGB', '--assign-tf', 'srgb', '--encode', 'basis-lz', '--clevel', '2', '--qlevel', '192',
    '--generate-mipmap', '--layers', String(albedoPngs.length), ...albedoPngs, albedo], { stdio: 'inherit' })
  execFileSync(ktx, ['create', '--format', 'R8G8B8A8_UNORM', '--assign-tf', 'linear', '--encode', 'uastc', '--uastc-quality', '2', '--zstd', '18',
    '--generate-mipmap', '--layers', String(normalPngs.length), ...normalPngs, normal], { stdio: 'inherit' })
  for (const f of [albedo, normal]) {
    const h = readKtx2Header(new Uint8Array(readFileSync(f)))
    if (h.layerCount !== SURFACE_LAYERS.length) throw new Error(`${f}: ${h.layerCount} layers`)
  }
  const manifest = surfaceManifestSchema.parse({ version: 1, albedo: 'terrain-albedo.ktx2', normal: 'terrain-normal.ktx2', layers })
  writeFileSync(join(OUT, 'terrain.json'), JSON.stringify(manifest, null, 2) + '\n')
  for (const f of ['basis_transcoder.js', 'basis_transcoder.wasm']) copyFileSync(join(THREE_BASIS, f), join(VENDOR, f))
  for (const f of [albedo, normal]) console.log(`${f}: ${readFileSync(f).length} bytes`)
}

await main()
