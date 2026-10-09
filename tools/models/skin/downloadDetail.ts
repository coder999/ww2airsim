// tools/models/skin/downloadDetail.ts
import { z } from 'zod'
import type { Marking } from './sidecar.js'
import { MARKING_COLOR_NAMES } from './colors.js'

/**
 * M1d: bake detail and weathering for a downloaded ship (plan 2026-10-09-m1d-download-detail). A
 * Blender script places each `m.detail(...)` and `m.marking(...)` by hand; a download's are rows and
 * runs in its entry, expanded here into the same detail list bake.py builds (kit.py's format) and
 * the same markings layers.ts paints. Every hull-side detail is on both sides: its origin is at
 * |z| = sideZM, outside the widest hull, and bake.py ray-casts it inboard as far as `reach` to land
 * on whatever is outermost there. A row past the hull's ends misses, and bake.py reports the miss.
 * Positions are model meters (x fore, y up, z starboard), ESTIMATES read off each ship's profile.
 */
const finite = z.number().finite()
const pos = z.number().positive()
const range = z.tuple([finite, finite]).refine(([a, b]) => a < b, { message: 'range must be [low, high]' })

export const DownloadDetailSchema = z.object({
  /** |z| of every hull-side detail's origin, meters: just outside the widest point of the hull. */
  sideZM: pos,
  /** Plating strakes: a painted lap line every this many meters up the hull (layers.ts grid). */
  strakesM: pos.optional(),
  /** Waterline grime: a soot stain between these heights (m). */
  grimeM: range.optional(),
  /** Deck planks or linoleum (layers.ts planks) on these roles' sky-facing faces. */
  planks: z.array(z.object({ role: z.enum(['deck', 'flightDeck']), widthM: pos, lengthM: pos, contrast: z.number().min(0).max(0.5), seam: z.number().min(0).max(1), belowM: finite.optional() }).strict()).default([]),
  /** Porthole rows on both sides; every `rustEvery`th one weeps a rust streak to the waterline. */
  portholes: z.array(z.object({ xM: range, yM: finite, everyM: pos, radiusM: pos.default(0.2), rustEvery: z.number().int().positive().default(3) }).strict()).default([]),
  /** Vertical butt welds on the hull sides: a raised strip from yM[1] down to yM[0] every `everyM`. */
  butts: z.object({ xM: range, yM: range, everyM: pos }).strict().optional(),
  /** Deck hatches: cast down from yM, at most reachM, every `everyM` along x at each z. */
  hatches: z.array(z.object({ xM: range, yM: finite, everyM: pos, zM: z.array(finite).min(1).default([0]), wM: pos.default(1.4), hM: pos.default(1.4), reachM: pos.default(3) }).strict()).default([]),
  /** M1e: camouflage patches, painted under everything else. `sides`: (x, y) points, mirrored onto
   *  both sides of the hull and the island; `flightDeck`: (x, z) points seen from above. */
  camo: z.array(z.object({ on: z.enum(['sides', 'flightDeck']), color: z.enum(MARKING_COLOR_NAMES), points: z.array(z.tuple([finite, finite])).min(3) }).strict()).default([]),
}).strict()
export type DownloadDetail = z.infer<typeof DownloadDetailSchema>

/** One bake.py detail (kit.py's `m.detail` dict). */
export type Detail = Record<string, unknown> & { kind: string; origin: number[]; axis: number[] }

const r3 = (x: number): number => Math.round(x * 1000) / 1000
/** Positions from lo to hi every `every`, centered in the range. */
function along([lo, hi]: readonly [number, number], every: number): number[] {
  const n = Math.floor((hi - lo) / every)
  const start = (lo + hi) / 2 - (n * every) / 2
  return Array.from({ length: n + 1 }, (_, i) => r3(start + i * every))
}
const SIDES = [1, -1] as const

export function downloadDetails(d: DownloadDetail): Detail[] {
  const out: Detail[] = []
  const reach = r3(d.sideZM)
  for (const row of d.portholes) for (const s of SIDES) for (const x of along(row.xM, row.everyM)) {
    out.push({ kind: 'porthole', origin: [x, row.yM, s * d.sideZM], axis: [0, 0, s], radius: row.radiusM, reach })
  }
  if (d.butts) for (const s of SIDES) for (const x of along(d.butts.xM, d.butts.everyM)) {
    out.push({ kind: 'strip', origin: [x, d.butts.yM[1], s * d.sideZM], to: [x, d.butts.yM[0], s * d.sideZM], axis: [0, 0, s], width: 0.06, proud: 0.025, reach })
  }
  for (const row of d.hatches) for (const z0 of row.zM) for (const x of along(row.xM, row.everyM)) {
    out.push({ kind: 'hatch', origin: [x, row.yM, z0], axis: [0, 1, 0], w: row.wM, h: row.hM, reach: row.reachM })
  }
  return out
}

/** The paint: strakes, grime, planks and the porthole rust. Tags are box-projected roles (`ship:<role>`). */
export function downloadMarkings(d: DownloadDetail): Marking[] {
  const out: Marking[] = []
  for (const c of d.camo) {
    if (c.on === 'flightDeck') {
      // axis +y, u along +x: v = y x x = -z, so a point (x, z) sits at (x, -z).
      out.push({ kind: 'polygon', tags: ['ship:flightDeck'], origin: [0, 0, 0], axis: [0, 1, 0], uDir: [1, 0, 0], points: c.points.map(([x, z]) => [x, -z] as [number, number]), color: c.color, effect: 'paint', opacity: 1, featherM: 0 })
      continue
    }
    // As the rust below: axis (0, 0, s), u along (s, 0, 0) and so v up, so x reads as s * x.
    for (const tag of ['ship:hull', 'ship:superstructure']) for (const s of SIDES) {
      out.push({ kind: 'polygon', tags: [tag], origin: [0, 0, s * d.sideZM], axis: [0, 0, s], uDir: [s, 0, 0], points: c.points.map(([x, y]) => [s * x, y] as [number, number]), color: c.color, effect: 'paint', opacity: 1, featherM: 0 })
    }
  }
  if (d.strakesM) out.push({ kind: 'grid', tags: ['ship:hull'], spacingM: [null, d.strakesM, null], widthM: 0.02, depth: 0.6 })
  if (d.grimeM) out.push({ kind: 'slab', tags: ['ship:hull'], axis: 'y', fromM: d.grimeM[0], toM: d.grimeM[1], color: 'exhaustSoot', effect: 'stain', opacity: 0.35, featherM: 0.5 })
  for (const p of d.planks) out.push({ kind: 'planks', tags: [`ship:${p.role}`], widthM: p.widthM, lengthM: p.lengthM, contrast: p.contrast, seam: p.seam, ...(p.belowM !== undefined ? { belowM: p.belowM } : {}) })
  for (const row of d.portholes) for (const s of SIDES) along(row.xM, row.everyM).forEach((x, i) => {
    if (i % row.rustEvery !== 1 % row.rustEvery) return
    const top = row.yM - row.radiusM
    out.push({ kind: 'polygon', tags: ['ship:hull'], origin: [x, 0, s * d.sideZM], axis: [0, 0, s], uDir: [s, 0, 0],
      points: [[-0.15, top], [0.15, top], [0.3, Math.max(0.2, top - 3)], [-0.25, Math.max(0.3, top - 2.6)]], color: 'rustStain', effect: 'stain', opacity: 0.35, featherM: 0.1 })
  })
  return out
}
