// The B-17's bomb racks are inside the hull (B-17G onboarding, D7 to D9, 2026-09-29): no rack is drawn on the outside, so
// every store hangs entirely inside the fuselage skin and nothing pokes out of the belly. The wing-mount fit
// (wildcatMounts.test.ts) does not apply to them, so this holds their offsets to the drawn hull instead.
import { describe, expect, it } from 'vitest'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { sectionAtFor, STORE_MESHES } from '../../../tools/models/mounts.js'

const spec = loadAircraftSpec('b-17-flying-fortress')
const at = await sectionAtFor(spec.view.model, -20)
const bounds = (store: string) => {
  const m = STORE_MESHES[store]!() as unknown as { positions: ArrayLike<number> }
  const lo = [Infinity, Infinity, Infinity]
  const hi = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < m.positions.length; i++) {
    lo[i % 3] = Math.min(lo[i % 3]!, m.positions[i]!)
    hi[i % 3] = Math.max(hi[i % 3]!, m.positions[i]!)
  }
  return { lo, hi }
}

describe('the B-17 bomb racks are inside its drawn hull', () => {
  it.each(spec.stores!.racks.map((r) => [r.id, r] as const))('%s: the whole store is above the belly and below the crown', (_id, rack) => {
    const b = bounds(rack.store)
    const [ox, oy, oz] = rack.offset
    // the section at the store's outboard edge is the narrowest place the hull constrains it
    const s = at(Math.abs(oz) + Math.max(Math.abs(b.lo[2]!), Math.abs(b.hi[2]!)))
    for (const x of [ox + b.lo[0]!, ox, ox + b.hi[0]!]) {
      expect(oy + b.lo[1]!, `bottom at x ${x.toFixed(2)}`).toBeGreaterThan(s.lowerY(x) + 0.02)
      expect(oy + b.hi[1]!, `top at x ${x.toFixed(2)}`).toBeLessThan(s.upperY(x))
    }
  })
})
