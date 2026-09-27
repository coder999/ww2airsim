import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readKtx2Header } from '../../tools/textures/ktx2.js'
import { acceptance } from '../../tools/fx/pack.js'
import { fxSceneSha256 } from '../../tools/fx/sceneHash.js'
import type { BakeReport } from '../../tools/fx/bake.js'
import { FX_CONTENT_BYTES_MAX, FX_SHEETS, fxSheetManifestSchema, sheetLayout } from '../../src/render/fx/sheetManifest.js'

const root = new URL('../../', import.meta.url)
const dir = new URL('content/fx/', root)
const manifest = fxSheetManifestSchema.parse(JSON.parse(readFileSync(new URL('sheets.json', dir), 'utf8')))
// KHR Data Format constants (khr_df.h), as tests/tools/textures.test.ts uses them.
const MODEL_ETC1S = 163, MODEL_UASTC = 166, TF_LINEAR = 1

describe('fx sheets (effects design §6; E1 Rulings R7, R8; E2)', () => {
  it('the manifest names every sheet once, in FX_SHEETS order, in distinct atlas cells', () => {
    expect(manifest.sheets.map((s) => s.name)).toEqual([...FX_SHEETS])
    const cells = manifest.sheets.map((s) => s.cell)
    expect(new Set(cells).size).toBe(FX_SHEETS.length)
    expect(Math.max(...cells)).toBeLessThan(manifest.cols * manifest.rows)
    expect(sheetLayout(manifest).cellOf.flame).toBe(manifest.sheets.find((s) => s.name === 'flame')!.cell)
  })

  for (const image of ['lightA', 'lightB', 'motion'] as const) {
    it(`${image}: a Basis-encoded, linear, ${manifest.frames}-layer array of the atlas size, with mips`, () => {
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

  // Task 7 replaces this `if` with `expect(manifest.provenance.generator).toBe('blender')`.
  if (manifest.provenance.generator === 'blender') {
    const report = JSON.parse(readFileSync(new URL('tools/fx/bake-report.json', root), 'utf8')) as BakeReport
    it('was baked by the blender.org 5.0.1 build from the scripts in this commit (Rulings R1, R2; Review Focus 2)', () => {
      expect(manifest.provenance.blenderVersion).toMatch(/^5\.0\.1 [0-9a-f]{12}$/)
      expect(manifest.provenance.seed).toBe(0) // Mantaflow takes no seed (Ruling R2)
      expect(manifest.provenance.sceneSha256, 'a script in tools/fx/blender changed without a rebake: npm run fx:bake').toBe(fxSceneSha256())
      expect(report.sceneSha256).toBe(manifest.provenance.sceneSha256)
    })
    it('every sheet passed its acceptance rules at the size that shipped', () => {
      expect([report.rung.cellPx, report.rung.frames]).toEqual([manifest.cellPx, manifest.frames])
      for (const s of FX_SHEETS) expect(acceptance(s, report.sheets[s].metrics, manifest.frames), s).toEqual([])
      expect(report.motionScale).toBe(manifest.motionScale)
    })
  }

  it('the placeholder generator is gone (E2 replaces it; git remembers)', () => {
    expect(existsSync(new URL('tools/fx/placeholders.ts', root))).toBe(false)
  })
})

describe('fxSceneSha256', () => {
  it('is stable, and covers every rig and sheet script', () => {
    expect(fxSceneSha256()).toMatch(/^[0-9a-f]{64}$/)
    expect(fxSceneSha256()).toBe(fxSceneSha256())
  })
})
