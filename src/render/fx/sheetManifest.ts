// Imported by tools/ under tsx (no Vite): must stay free of import.meta.env
// and of `three`. The runtime loader is src/render/fx/sheets.ts.
import { z } from 'zod'

/** The six flipbooks (effects design §6.1). Their order is the atlas cell
 *  order the build writes and every consumer indexes by. */
export const FX_SHEETS = ['fireball', 'smoke', 'dust', 'water-column', 'spray', 'flame'] as const
export type FxSheetName = (typeof FX_SHEETS)[number]

/** Spec §6.3: the whole of content/fx/. tests/tools/fxSheets.test.ts enforces
 *  it from E1 on, so E2's bake inherits a gate, not a promise. */
export const FX_CONTENT_BYTES_MAX = 10_000_000

export const fxSheetManifestSchema = z.object({
  version: z.literal(1),
  /** File names in content/fx/. One KTX2 array each; layer = frame (plan E1 Ruling R7). */
  images: z.object({ lightA: z.string().endsWith('.ktx2'), lightB: z.string().endsWith('.ktx2'), motion: z.string().endsWith('.ktx2') }),
  cellPx: z.number().int().positive(),
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
  /** Layers per image. WebGPU's default maxTextureArrayLayers is 256. */
  frames: z.number().int().min(1).max(256),
  /** Cell-UV displacement per frame at a motion texel of 0 or 1 (0.5 = none). */
  motionScale: z.number().nonnegative(),
  sheets: z.array(z.object({ name: z.enum(FX_SHEETS), cell: z.number().int().nonnegative() })).length(FX_SHEETS.length),
  /** E2 fills the Blender fields (spec §6.1); the placeholder build records its seed. */
  provenance: z.object({
    generator: z.enum(['placeholder', 'blender']),
    seed: z.number().int(),
    blenderVersion: z.string().optional(),
    sceneSha256: z.string().optional(),
  }),
}).refine((m) => m.sheets.every((s, i) => s.name === FX_SHEETS[i]), 'sheets must be in FX_SHEETS order')
  .refine((m) => new Set(m.sheets.map((s) => s.cell)).size === m.sheets.length && m.sheets.every((s) => s.cell < m.cols * m.rows), 'cells must be distinct and inside the atlas')
export type FxSheetManifest = z.infer<typeof fxSheetManifestSchema>

export type FxSheetLayout = {
  readonly frames: number; readonly cols: number; readonly rows: number; readonly motionScale: number
  readonly cellOf: Readonly<Record<FxSheetName, number>>
}
export function sheetLayout(m: FxSheetManifest): FxSheetLayout {
  return {
    frames: m.frames, cols: m.cols, rows: m.rows, motionScale: m.motionScale,
    cellOf: Object.fromEntries(m.sheets.map((s) => [s.name, s.cell])) as Record<FxSheetName, number>,
  }
}
