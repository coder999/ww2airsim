// tools/fx/contact.ts
/**
 * `npx tsx tools/fx/contact.ts <out.png> <render dir> [<render dir> ...]` draws a contact sheet
 * for looking at bakes side by side (plan E2 Task 6): one row per render directory (e.g.
 * tools/fx/renders/water-column and .../water-column-gas), 8 evenly spaced frames each, 128 px
 * cells, over a sea-blue background. Each cell is the front pass in white plus the right pass in
 * a warm tint, so the side lighting shows; each row is scaled by its own 99.9th-percentile covered
 * value (Ruling R6), composited by the front pass's straight alpha. A dev tool: not in verify.
 */
import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import sharp from 'sharp'
import { COVERED, pickFrames, quantile } from './pack.js'
import { read16 } from './png16.js'

const CELL = 128, PER_ROW = 8, LABEL = 18
const SEA = [0x3d, 0x5a, 0x6e] as const
const FRONT = [1, 1, 1] as const, RIGHT = [0.55, 0.42, 0.25] as const

type Cell = { front: Float32Array; right: Float32Array; alpha: Float32Array }

async function row(dir: string): Promise<Cell[]> {
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')) as { frames: number }
  const cells: Cell[] = []
  for (const k of pickFrames(meta.frames, Math.min(PER_ROW, meta.frames))) {
    const f = join(dir, `f${String(k).padStart(2, '0')}`)
    const front = await read16(join(f, 'front.png'), CELL), right = await read16(join(f, 'right.png'), CELL)
    cells.push({ front: front.lum, right: right.lum, alpha: front.alpha })
  }
  return cells
}

async function main(): Promise<void> {
  const [out, ...dirs] = process.argv.slice(2)
  if (out === undefined || dirs.length === 0) throw new Error('usage: contact.ts <out.png> <render dir> [...]')
  const W = PER_ROW * CELL, rowH = CELL + LABEL, H = dirs.length * rowH
  const px = new Uint8Array(W * H * 3)
  for (let i = 0; i < W * H; i++) px.set(SEA, i * 3)
  const labels: string[] = []
  for (const [r, dir] of dirs.entries()) {
    const cells = await row(dir)
    const k = 1 / (quantile((visit) => {
      for (const c of cells) for (let i = 0; i < c.alpha.length; i++) if (c.alpha[i]! > COVERED) visit(Math.max(c.front[i]!, c.right[i]!))
    }, 0.999) || 1)
    cells.forEach((c, col) => {
      for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
        const i = y * CELL + x, a = Math.min(1, c.alpha[i]!), o = ((r * rowH + LABEL + y) * W + col * CELL + x) * 3
        for (let ch = 0; ch < 3; ch++) {
          const lit = Math.min(1, k * (0.75 * FRONT[ch]! * c.front[i]! + RIGHT[ch]! * c.right[i]!))
          px[o + ch] = Math.round(SEA[ch]! * (1 - a) + 255 * lit * a)
        }
      }
    })
    labels.push(`<text x="4" y="${r * rowH + 13}" font-family="sans-serif" font-size="12" fill="#fff">${basename(dir.replace(/\/$/, ''))}</text>`)
  }
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${labels.join('')}</svg>`)
  await sharp(Buffer.from(px), { raw: { width: W, height: H, channels: 3 } }).composite([{ input: svg }]).png().toFile(out)
  console.log(`contact: ${out} (${dirs.length} rows)`)
}

await main()
