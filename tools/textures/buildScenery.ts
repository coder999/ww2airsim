import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { SCENERY_TEXTURE_LAYERS, sceneryTextureManifestSchema, type SceneryTextureManifest } from '../../src/render/scene/sceneryTextureManifest.js'
import { fetchPinned } from './fetchPinned.js'
import { readKtx2Header } from './ktx2.js'
import { ktxBinary, TEXTURE_CACHE } from './ktxTool.js'
import { SCENERY_TEXTURE_SOURCES } from './scenerySources.js'

const OUT = fileURLToPath(new URL('../../content/textures/', import.meta.url))
const ALBEDO_SIZE = 1024
const NORMAL_SIZE = 512
const toLinear = (c: number): number => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }

async function main(): Promise<void> {
  if (SCENERY_TEXTURE_SOURCES.map(s => s.layer).join() !== SCENERY_TEXTURE_LAYERS.join()) throw new Error('scenery sources are out of order')
  mkdirSync(TEXTURE_CACHE, { recursive: true }); mkdirSync(OUT, { recursive: true })
  const ktx = await ktxBinary()
  const layers: SceneryTextureManifest['layers'] = []
  for (const source of SCENERY_TEXTURE_SOURCES) {
    const diffuse = await fetchPinned(source.diffuse.url, source.diffuse.md5)
    const normalSource = await fetchPinned(source.normal.url, source.normal.md5)
    const albedoPng = join(TEXTURE_CACHE, `${source.id}_scenery_albedo${ALBEDO_SIZE}.png`)
    const normalPng = join(TEXTURE_CACHE, `${source.id}_scenery_normal${NORMAL_SIZE}.png`)
    await sharp(diffuse).resize(ALBEDO_SIZE, ALBEDO_SIZE).removeAlpha().ensureAlpha(1).png().toFile(albedoPng)
    await sharp(normalSource).resize(NORMAL_SIZE, NORMAL_SIZE).removeAlpha().ensureAlpha(1).png().toFile(normalPng)
    const { data, info } = await sharp(albedoPng).raw().toBuffer({ resolveWithObject: true })
    const sum = [0, 0, 0]
    for (let i = 0; i < data.length; i += info.channels) for (let c = 0; c < 3; c++) sum[c]! += toLinear(data[i + c]!)
    const px = data.length / info.channels
    const meanLinear = sum.map(x => Math.round(x / px * 1e5) / 1e5) as [number, number, number]
    const albedo = `scenery-${source.layer}-albedo.ktx2`
    const normal = `scenery-${source.layer}-normal.ktx2`
    execFileSync(ktx, ['create', '--format', 'R8G8B8A8_SRGB', '--assign-tf', 'srgb', '--encode', 'basis-lz', '--clevel', '2', '--qlevel', '180', '--generate-mipmap', albedoPng, join(OUT, albedo)], { stdio: 'inherit' })
    execFileSync(ktx, ['create', '--format', 'R8G8B8A8_UNORM', '--assign-tf', 'linear', '--encode', 'uastc', '--uastc-quality', '2', '--zstd', '18', '--generate-mipmap', normalPng, join(OUT, normal)], { stdio: 'inherit' })
    for (const file of [albedo, normal]) {
      const header = readKtx2Header(new Uint8Array(readFileSync(join(OUT, file))))
      if (header.layerCount !== 0) throw new Error(`${file}: expected an ordinary 2-D texture, got ${header.layerCount} layers`)
    }
    layers.push({ name: source.layer, source: source.id, author: source.author, tileM: source.tileM, albedo, normal, meanLinear })
  }
  const manifest = sceneryTextureManifestSchema.parse({ version: 1, layers })
  writeFileSync(join(OUT, 'scenery.json'), JSON.stringify(manifest, null, 2) + '\n')
  for (const layer of layers) for (const file of [layer.albedo, layer.normal]) console.log(`${file}: ${readFileSync(join(OUT, file)).length} bytes`)
}

await main()
