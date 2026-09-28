// Every drawn model's wing quarter-chord sits at the sim body origin, x = 0 (W1, 2026-09-28):
// the origin stands for the center of gravity, which a WWII fighter carries near 25-30% MAC.
// Measured that day: Hellcat 0.04 m, Zero 0.11 m; the Wildcat was drawn 2.11 m forward.
import { describe, expect, it } from 'vitest'
import { readdirSync } from 'node:fs'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { sectionAtFor } from '../../../tools/models/mounts.js'

const TOLERANCE_M = 0.15
const specs = readdirSync('content/aircraft').filter((f) => f.endsWith('.json')).map((f) => loadAircraftSpec(f.replace(/\.json$/, '')))

describe('every drawn model is centered on its quarter-chord', () => {
  it.each(specs.map((s) => [s.id, s] as const))('%s', async (_id, spec) => {
    const at = await sectionAtFor(spec.view.model)
    const s = at(0.3 * spec.geometry.wingSpanM / 2)
    const qc = s.leadingX - 0.25 * (s.leadingX - s.trailingX)
    expect(Math.abs(qc), `${spec.id}: quarter-chord at x ${qc.toFixed(3)} m`).toBeLessThanOrEqual(TOLERANCE_M)
  })
})
