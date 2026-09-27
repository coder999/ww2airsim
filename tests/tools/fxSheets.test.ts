import { readdirSync, readFileSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readKtx2Header } from '../../tools/textures/ktx2.js'
import { PLACEHOLDER, placeholderLayer } from '../../tools/fx/placeholders.js'
import { FX_CONTENT_BYTES_MAX, FX_SHEETS, fxSheetManifestSchema, sheetLayout } from '../../src/render/fx/sheetManifest.js'

const root = new URL('../../', import.meta.url)
const dir = new URL('content/fx/', root)
const manifest = fxSheetManifestSchema.parse(JSON.parse(readFileSync(new URL('sheets.json', dir), 'utf8')))
// KHR Data Format constants (khr_df.h), as tests/tools/textures.test.ts uses them.
const MODEL_ETC1S = 163, MODEL_UASTC = 166, TF_LINEAR = 1

describe('placeholder fx sheets (effects design §6.4)', () => {
  it('the manifest names every sheet once, in FX_SHEETS order, in distinct atlas cells', () => {
    expect(manifest.sheets.map((s) => s.name)).toEqual([...FX_SHEETS])
    const cells = manifest.sheets.map((s) => s.cell)
    expect(new Set(cells).size).toBe(FX_SHEETS.length)
    expect(Math.max(...cells)).toBeLessThan(manifest.cols * manifest.rows)
    expect(manifest.provenance.generator).toBe('placeholder')
    expect(sheetLayout(manifest).cellOf.flame).toBe(manifest.sheets.find((s) => s.name === 'flame')!.cell)
  })

  for (const image of ['lightA', 'lightB', 'motion'] as const) {
    it(`${image}: a Basis-encoded, linear, ${PLACEHOLDER.frames}-layer array of the atlas size (Rulings R7, R8)`, () => {
      const h = readKtx2Header(new Uint8Array(readFileSync(new URL(manifest.images[image], dir))))
      expect(h.layerCount).toBe(manifest.frames)
      expect(h.pixelWidth).toBe(manifest.cols * manifest.cellPx)
      expect(h.pixelHeight).toBe(manifest.rows * manifest.cellPx)
      expect([MODEL_ETC1S, MODEL_UASTC]).toContain(h.colorModel) // never the uncompressed path: KTX2Loader drops its layers
      expect(h.transferFunction).toBe(TF_LINEAR) // lightmaps and motion are data, not color
      expect(h.levelCount).toBeGreaterThan(1)
    })
  }

  it('the whole content/fx directory stays under the 10 MB gate (spec §6.3)', () => {
    const bytes = readdirSync(dir).reduce((sum, f) => sum + statSync(new URL(f, dir)).size, 0)
    expect(bytes).toBeLessThanOrEqual(FX_CONTENT_BYTES_MAX)
  })

  it('the generator is deterministic and fades every cell to transparent at its border', () => {
    const a = placeholderLayer('lightA', 5), b = placeholderLayer('lightA', 5)
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true)
    const w = PLACEHOLDER.cols * PLACEHOLDER.cellPx
    for (let cell = 0; cell < PLACEHOLDER.cols * PLACEHOLDER.rows; cell++) {
      const x0 = (cell % PLACEHOLDER.cols) * PLACEHOLDER.cellPx, y0 = Math.floor(cell / PLACEHOLDER.cols) * PLACEHOLDER.cellPx
      for (let i = 0; i < PLACEHOLDER.cellPx; i++) {
        // alpha is light A's 4th channel; every edge texel of every cell is 0,
        // so a mip never bleeds one sheet into its neighbor
        for (const [x, y] of [[x0 + i, y0], [x0 + i, y0 + PLACEHOLDER.cellPx - 1], [x0, y0 + i], [x0 + PLACEHOLDER.cellPx - 1, y0 + i]]) {
          expect(a[(y! * w + x!) * 4 + 3]).toBe(0)
        }
      }
    }
  })

  it('emission (light B alpha) is lit only in the fireball and flame cells', () => {
    const b = placeholderLayer('lightB', 0)
    const w = PLACEHOLDER.cols * PLACEHOLDER.cellPx
    const emissionIn = (name: (typeof FX_SHEETS)[number]): number => {
      const cell = FX_SHEETS.indexOf(name)
      const cx = (cell % PLACEHOLDER.cols) * PLACEHOLDER.cellPx + PLACEHOLDER.cellPx / 2
      const cy = Math.floor(cell / PLACEHOLDER.cols) * PLACEHOLDER.cellPx + PLACEHOLDER.cellPx / 2
      return b[(cy * w + cx) * 4 + 3]!
    }
    expect(emissionIn('fireball')).toBeGreaterThan(100)
    expect(emissionIn('flame')).toBeGreaterThan(100)
    for (const name of ['smoke', 'dust', 'water-column', 'spray'] as const) expect(emissionIn(name)).toBe(0)
  })
})
