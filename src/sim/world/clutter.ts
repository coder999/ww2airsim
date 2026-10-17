import { createRng } from '../rng.js'
import { localToWorld, type Airfield } from './airfields.js'

/**
 * Procedural ground clutter (F8A Task 7, F3 section 9): mats, tents, sandbags, drums, crates, mud, ruts and craters are
 * instanced scenery, never entities. Authored as a density per area (instances per 1,000 square meters, runway-local
 * rectangles); the instances are a pure function of the airfield's own seed, so a window always draws the same field.
 */
export const CLUTTER_KINDS = ['mat', 'tent', 'sandbag', 'drum', 'crate', 'mud', 'rut', 'crater'] as const
export type ClutterKind = typeof CLUTTER_KINDS[number]

/** Most instances one site-state may carry (all areas, all kinds). A schema-time ceiling, 2026-10-16, an estimate: 8 instanced draws of this many small shapes. */
export const CLUTTER_CEILING = 1200

export type ClutterInstance = { readonly kind: ClutterKind; readonly x: number; readonly z: number; readonly yawRad: number; readonly scale: number }
type Clutter = NonNullable<Airfield['clutter']>

const isKind = (k: string): k is ClutterKind => (CLUTTER_KINDS as readonly string[]).includes(k)

/** How many of each kind an area holds. A density key that is not a kind is a content error, caught here. */
export function clutterCounts(area: Clutter['areas'][number]): Readonly<Record<ClutterKind, number>> {
  const out = Object.fromEntries(CLUTTER_KINDS.map((k) => [k, 0])) as Record<ClutterKind, number>
  for (const [k, d] of Object.entries(area.density)) {
    if (!isKind(k)) throw new Error(`clutter area "${area.id}": "${k}" is not a clutter kind (${CLUTTER_KINDS.join(', ')})`)
    out[k] = Math.round(d * area.widthM * area.lengthM / 1000)
  }
  return out
}

export const clutterTotal = (c: Clutter): number =>
  c.areas.reduce((n, a) => n + Object.values(clutterCounts(a)).reduce((s, v) => s + v, 0), 0)

/** World-space instances for an airfield's clutter; `[]` for a base with none. Pure in the airfield's seed and areas. */
export function clutterInstances(airfield: Airfield): readonly ClutterInstance[] {
  const c = airfield.clutter
  if (c === undefined) return []
  const rng = createRng(c.seed)
  const out: ClutterInstance[] = []
  for (const area of c.areas) {
    const counts = clutterCounts(area)
    for (const kind of CLUTTER_KINDS) {
      for (let i = 0; i < counts[kind]; i++) {
        const lx = area.x + (rng() - 0.5) * area.widthM
        const lz = area.z + (rng() - 0.5) * area.lengthM
        const w = localToWorld(airfield, lx, lz)
        out.push({ kind, x: w.x, z: w.z, yawRad: rng() * Math.PI, scale: 0.8 + rng() * 0.5 })
      }
    }
  }
  return out
}
