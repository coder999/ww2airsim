import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { FX_CONTENT_BYTES_MAX, FX_SHEETS, fxSheetManifestSchema } from '../../src/render/fx/sheetManifest.js'
import { readKtx2Header } from '../textures/ktx2.js'
import { ktxBinary } from '../textures/ktxTool.js'
import { PLACEHOLDER, placeholderLayer } from './placeholders.js'

const OUT = fileURLToPath(new URL('../../content/fx/', import.meta.url))
const CACHE = fileURLToPath(new URL('./cache/', import.meta.url)) // gitignored by /tools/**/cache/
const FILES = { lightA: 'fx-light-a.ktx2', lightB: 'fx-light-b.ktx2', motion: 'fx-motion.ktx2' } as const

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true }); mkdirSync(CACHE, { recursive: true })
  const ktx = await ktxBinary()
  const { cellPx, cols, rows, frames } = PLACEHOLDER
  for (const image of ['lightA', 'lightB', 'motion'] as const) {
    const pngs: string[] = []
    for (let f = 0; f < frames; f++) {
      const png = join(CACHE, `${image}-${String(f).padStart(2, '0')}.png`)
      await sharp(Buffer.from(placeholderLayer(image, f)), { raw: { width: cols * cellPx, height: rows * cellPx, channels: 4 } }).png().toFile(png)
      pngs.push(png)
    }
    // Ruling R8: Basis (ETC1S) and linear. --levels 5 stops at 8 px per cell.
    execFileSync(ktx, ['create', '--format', 'R8G8B8A8_UNORM', '--assign-tf', 'linear', '--encode', 'basis-lz', '--clevel', '2', '--qlevel', '128',
      '--generate-mipmap', '--levels', '5', '--layers', String(frames), ...pngs, join(OUT, FILES[image])], { stdio: 'inherit' })
    const h = readKtx2Header(new Uint8Array(readFileSync(join(OUT, FILES[image]))))
    if (h.layerCount !== frames) throw new Error(`${FILES[image]}: ${h.layerCount} layers, expected ${frames}`)
  }
  const manifest = fxSheetManifestSchema.parse({
    version: 1, images: FILES, cellPx, cols, rows, frames, motionScale: PLACEHOLDER.motionScale,
    sheets: FX_SHEETS.map((name, cell) => ({ name, cell })),
    provenance: { generator: 'placeholder', seed: PLACEHOLDER.seed },
  })
  writeFileSync(join(OUT, 'sheets.json'), JSON.stringify(manifest, null, 2) + '\n')
  const bytes = readdirSync(OUT).reduce((sum, f) => sum + statSync(join(OUT, f)).size, 0)
  console.log(`content/fx: ${bytes} bytes`)
  if (bytes > FX_CONTENT_BYTES_MAX) throw new Error(`content/fx is ${bytes} bytes, over the ${FX_CONTENT_BYTES_MAX} gate (spec §6.3)`)
}

await main()
