// A belly rack hangs on the centerline, on the outside of the hull: neither a wing mount (wildcatMounts.test.ts) nor an
// internal bay (internalBay.test.ts). This holds its offset to the drawn belly: the D3A Val's bomb (D3A onboarding,
// 2026-09-30) and the B5N2 Kate's torpedo (D1, 2026-10-09).
import { describe, expect, it } from 'vitest'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { sectionAtFor, STORE_MESHES, MIN_CLEARANCE_M } from '../../../tools/models/mounts.js'

const BELLY = ['d3a-val', 'b5n2-kate']
const sections = new Map(await Promise.all(BELLY.map(async (id) => [id, await sectionAtFor(loadAircraftSpec(id).view.model, -20)] as const)))
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

describe.each(BELLY)('%s belly rack', (id) => {
  const spec = loadAircraftSpec(id)
  const at = sections.get(id)!
  it('is one centerline rack and no rails', () => {
    expect(spec.stores!.racks.map((r) => [r.id, r.offset[2]])).toEqual([['belly-rack', 0]])
    expect(spec.stores!.rails).toEqual([])
  })
  it.each(spec.stores!.racks.map((r) => [r.id, r] as const))('%s: the whole store hangs just below the drawn belly, clear of the skin, the propeller and the spats', (_id, rack) => {
    const b = bounds(rack.store)
    const [ox, oy, oz] = rack.offset
    const s = at(oz)
    const xs = Array.from({ length: 15 }, (_, i) => ox + b.lo[0]! + ((b.hi[0]! - b.lo[0]!) * i) / 14)
    const belly = Math.min(...xs.map((x) => s.lowerY(x)))
    const gap = belly - (oy + b.hi[1]!)
    expect(gap, 'lug top below the lowest belly point under the store').toBeGreaterThanOrEqual(MIN_CLEARANCE_M - 0.005)
    expect(gap, 'not floating: within 5 cm of the belly').toBeLessThan(0.05)
    expect(ox + b.hi[0]!, 'nose behind the propeller disc').toBeLessThan(spec.gear.mainX + 1.5)
    expect(Math.abs(oz) + b.hi[2]!, 'inside the spats').toBeLessThan(1.4)
  })
})
