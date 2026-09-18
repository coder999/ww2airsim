import { z } from 'zod'

/**
 * The shipped land-cover raster: coverage FRACTIONS, not a class index, so
 * the GPU can filter it linearly. Design:
 * docs/superpowers/specs/2026-09-18-land-cover-design.md section 4.
 * Browser-safe on purpose: no node imports, so tools/, tests and the
 * renderer all read the same bytes the same way.
 */
export const COVER_CHANNELS = ['tree', 'crop', 'mangrove', 'open'] as const
export const COVER_SAMPLES = 1025

const finite = z.number().refine(Number.isFinite, { message: 'must be finite' })
const positive = finite.refine((v) => v > 0, { message: 'must be positive' })

const HeaderSchema = z.object({
  centreLatDeg: finite,
  centreLonDeg: finite,
  halfExtentM: positive,
  samples: z.literal(COVER_SAMPLES),
  channels: z.tuple([z.literal('tree'), z.literal('crop'), z.literal('mangrove'), z.literal('open')]),
  encoding: z.literal('rgba8-sixteenths'),
}).strict()
export type CoverHeader = z.infer<typeof HeaderSchema>

export function parseCoverHeader(raw: unknown): CoverHeader {
  return HeaderSchema.parse(raw)
}

export function coverByteLength(header: CoverHeader): number {
  return header.samples * header.samples * COVER_CHANNELS.length
}

/** Sixteen levels: `round(15 f) * 17` puts 0 at 0 and 1 at 255 exactly. */
export function quantize(fraction: number): number {
  return Math.round(15 * Math.min(1, Math.max(0, fraction))) * 17
}
export function dequantize(byte: number): number {
  return byte / 255
}

/** Nearest sample for a world position. Row 0 = north (z = -half),
 *  column 0 = west (x = -half), as `tools/terrain/resample.ts` lays the
 *  terrain out. Clamped to the edge outside the box. */
export function coverIndex(header: CoverHeader, x: number, z: number): number {
  const last = header.samples - 1
  const step = (2 * header.halfExtentM) / last
  const col = Math.min(last, Math.max(0, Math.round((x + header.halfExtentM) / step)))
  const row = Math.min(last, Math.max(0, Math.round((z + header.halfExtentM) / step)))
  return row * header.samples + col
}

export function coverFractionsAt(data: Uint8Array, header: CoverHeader, x: number, z: number): {
  tree: number; crop: number; mangrove: number; open: number
} {
  const i = coverIndex(header, x, z) * 4
  return { tree: dequantize(data[i]!), crop: dequantize(data[i + 1]!), mangrove: dequantize(data[i + 2]!), open: dequantize(data[i + 3]!) }
}
