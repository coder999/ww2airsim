import { z } from 'zod'
import { localToWorld, runwayHeadingRad, runwayRect, type Airfield } from './airfields.js'

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

/**
 * What a touchdown was on, as the physics sees it (Mark, 2026-09-28: landing
 * surface depends on land cover, not just "land").
 *
 * - `runway`: inside an airfield's runway, apron or clearing. Firm.
 * - `soft`: off-airfield land that is not woodland -- paddy, grass, scrub,
 *   bare ground, and any coastal cell whose cover is mostly water. A field
 *   landing: a lower sink limit and more rolling resistance.
 * - `forest`: tree or mangrove canopy. No gear contact is survivable.
 * - `unclassified`: no cover data (null field, tests, the seconds before the
 *   raster arrives). Judged exactly as all land was before this existed.
 */
export type LandClass = 'runway' | 'soft' | 'forest' | 'unclassified'

/**
 * Combined tree + mangrove fraction at which a cell counts as woodland. An
 * UNTUNED GUESS, the same standing `MAX_SUPPORTED_SINK_MPS` has
 * (`src/sim/ground.ts`): nobody has flown it. The raster is 4-bit quantized
 * (sixteenths), so 0.5 is not exactly representable; a cell is forest from
 * 8/15 up.
 */
export const FOREST_COVER_FRACTION = 0.5

/** The rectangles (runway, apron, clearing) inside which the surface is
 *  firm whatever the raster says: a paddy-green raster cell under a runway is
 *  a raster artifact, not a paddy. Plain numbers so `sim/` needs no airfield
 *  type here; `createCoverField` builds them from `Airfield`. */
export type FirmRect = {
  readonly centreX: number
  readonly centreZ: number
  readonly cos: number
  readonly sin: number
  readonly halfWidthM: number
  readonly halfLengthM: number
}

/** A land-cover raster usable by the physics layer, injected the way
 *  `TerrainField` is (`TerrainField.cover`). */
export type CoverField = {
  readonly header: CoverHeader
  readonly data: Uint8Array
  readonly firm: readonly FirmRect[]
}

export function createCoverField(header: CoverHeader, data: Uint8Array, airfields: readonly Airfield[]): CoverField {
  if (data.length !== coverByteLength(header)) {
    throw new Error(`cover field expects ${coverByteLength(header)} bytes, got ${data.length}`)
  }
  const firm: FirmRect[] = []
  for (const a of airfields) {
    const h = runwayHeadingRad(a)
    const cos = Math.cos(h), sin = Math.sin(h)
    for (const r of [runwayRect(a), a.apron, a.clearing]) {
      if (r === null) continue
      const c = localToWorld(a, r.x, r.z)
      firm.push({ centreX: c.x, centreZ: c.z, cos, sin, halfWidthM: r.widthM / 2, halfLengthM: r.lengthM / 2 })
    }
  }
  return { header, data, firm }
}

/** The four fractions at (x, z) (nearest sample). */
export function coverAt(field: CoverField, x: number, z: number): { tree: number; crop: number; mangrove: number; open: number } {
  return coverFractionsAt(field.data, field.header, x, z)
}

/** Same rotation as `worldToLocal` (airfields.ts): local x is across the
 *  runway (its width), local z along it (its length). */
function insideFirm(f: FirmRect, x: number, z: number): boolean {
  const dx = x - f.centreX, dz = z - f.centreZ
  return Math.abs(dx * f.cos + dz * f.sin) <= f.halfWidthM && Math.abs(-dx * f.sin + dz * f.cos) <= f.halfLengthM
}

/** The class of LAND at (x, z). Callers ask only for land points; water and
 *  decks never reach here. `null` field is `unclassified`. */
export function landClassAt(field: CoverField | null | undefined, x: number, z: number): LandClass {
  if (field === null || field === undefined) return 'unclassified'
  for (const f of field.firm) if (insideFirm(f, x, z)) return 'runway'
  const c = coverAt(field, x, z)
  return c.tree + c.mangrove >= FOREST_COVER_FRACTION ? 'forest' : 'soft'
}
