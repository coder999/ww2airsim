// tools/models/skin/sidecar.ts
import { z } from 'zod'
import { MARKING_COLOR_NAMES } from './colors.js'
export { skinSidecarPath } from '../blender/run.js'

const finite = z.number().finite()
const vec3 = z.tuple([finite, finite, finite])
const axis3 = vec3.refine((v) => Math.hypot(...v) > 1e-9, { message: 'axis must be a nonzero vector' })
const tags = z.array(z.string().min(1)).min(1)
/** What a marking does to the texels it covers: paint over, wear (lighter, rougher), or stain. */
const common = {
  tags,
  color: z.enum(MARKING_COLOR_NAMES),
  effect: z.enum(['paint', 'wear', 'stain']).default('paint'),
  opacity: z.number().gt(0).lte(1).default(1),
  /** Soft edge width, meters; 0 = a hard (antialiased) edge. */
  featherM: z.number().min(0).default(0),
}
const Disc = z.object({ kind: z.literal('disc'), center: vec3, axis: axis3, radiusM: z.number().positive(), ...common }).strict()
/** A 2D polygon in the plane through `origin` normal to `axis`; `uDir` is its u axis, v = axis x u. */
const Polygon = z.object({ kind: z.literal('polygon'), origin: vec3, axis: axis3, uDir: axis3, points: z.array(z.tuple([finite, finite])).min(3), ...common }).strict()
/** Everything between two planes normal to a model axis (a fuselage band). No facing test. */
const Slab = z.object({ kind: z.literal('slab'), axis: z.enum(['x', 'y', 'z']), fromM: finite, toM: finite, ...common }).strict()
  .refine((s) => s.fromM < s.toM, { message: 'fromM must be < toM', path: ['fromM'] })
/** World-aligned sheet laps: a groove wherever a coordinate crosses a multiple of its spacing. */
const Grid = z.object({
  kind: z.literal('grid'), tags,
  spacingM: z.tuple([z.number().positive().nullable(), z.number().positive().nullable(), z.number().positive().nullable()])
    .refine((s) => s.some((v) => v !== null), { message: 'spacing needs at least one axis' }),
  /** Groove width, meters; depth in groove units (a panel line is 1: see layers.ts). */
  widthM: z.number().positive(), depth: z.number().positive(),
}).strict()
const Marking = z.union([Disc, Polygon, Slab, Grid])

export const SidecarSchema = z.object({
  version: z.literal(1),
  model: z.string().min(1),
  atlasPx: z.union([z.literal(512), z.literal(1024), z.literal(2048)]),
  paddingPx: z.number().int().positive(),
  metersPerPx: z.number().positive(),
  roles: z.record(z.string(), z.tuple([finite, finite, finite])),
  patches: z.array(z.object({
    id: z.number().int().nonnegative(), tag: z.string().min(1),
    rect: z.tuple([z.number().int(), z.number().int(), z.number().int().positive(), z.number().int().positive()]),
    originM: z.tuple([finite, finite]),
  }).strict()).min(1),
  lines: z.array(z.object({
    patch: z.number().int().nonnegative(), axis: z.enum(['u', 'v']), atM: finite, fromM: finite, toM: finite, kind: z.enum(['panel', 'hinge']),
  }).strict()),
  markings: z.array(Marking),
}).strict()

export type Sidecar = z.infer<typeof SidecarSchema>
export type Marking = Sidecar['markings'][number]

/** The schema, then what it cannot say: ids unique, rects inside the atlas, every line on a
 *  patch that exists, and every marking tag on some patch (a typo would paint nothing). */
export function parseSidecar(text: string): Sidecar {
  const s = SidecarSchema.parse(JSON.parse(text))
  const ids = new Set<number>()
  for (const p of s.patches) {
    if (ids.has(p.id)) throw new Error(`sidecar ${s.model}: patch id ${p.id} twice`)
    ids.add(p.id)
    const [x, y, w, h] = p.rect
    if (x < 0 || y < 0 || x + w > s.atlasPx || y + h > s.atlasPx) throw new Error(`sidecar ${s.model}: patch ${p.id} rect ${p.rect.join(',')} is outside the ${s.atlasPx} px atlas`)
  }
  // Dilation fills paddingPx around each patch from that patch alone (compose.ts, Review Focus 4),
  // which holds only if the grown rects are disjoint. kit.py's _shelf_pack insets each rect by pad
  // in its cell, so neighbors' grown rects touch and never overlap.
  const pad = s.paddingPx
  for (let i = 0; i < s.patches.length; i++) for (let j = i + 1; j < s.patches.length; j++) {
    const [ax, ay, aw, ah] = s.patches[i]!.rect, [bx, by, bw, bh] = s.patches[j]!.rect
    if (ax - pad < bx + bw + pad && bx - pad < ax + aw + pad && ay - pad < by + bh + pad && by - pad < ay + ah + pad) {
      throw new Error(`sidecar ${s.model}: patches ${s.patches[i]!.id} and ${s.patches[j]!.id} are closer than 2 x paddingPx (${2 * pad} px), so padding would bleed between them`)
    }
  }
  for (const l of s.lines) if (!ids.has(l.patch)) throw new Error(`sidecar ${s.model}: a line names patch ${l.patch}, which does not exist`)
  const known = new Set(s.patches.map((p) => p.tag))
  for (const m of s.markings) for (const t of m.tags) if (!known.has(t)) throw new Error(`sidecar ${s.model}: a ${m.kind} marking names tag "${t}", which no patch has (tags: ${[...known].sort().join(', ')})`)
  return s
}
