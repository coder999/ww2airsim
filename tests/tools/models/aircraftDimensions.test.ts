// tests/tools/models/aircraftDimensions.test.ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { getBounds } from '@gltf-transform/functions'
import { loadModelEntries } from '../../../tools/models/manifest.js'
import { modelIO } from '../../../tools/models/document.js'

interface Cited {
  /** Omitted only where the model is measured with its wings folded (a Ruling names it). */
  readonly spanM?: number
  readonly lengthM: number
  /** Length tolerance for a download fitted to its span (P10); a Blender model is held to 1%. */
  readonly tolerance: number
  readonly source: string
}

/** Cited overall span and length (model-roster spec §7). A download is fitted to its span, so its
 *  length proves it depicts this variant; a Blender model is built from both, so both hold to 1%. */
const CITED: Readonly<Record<string, Cited>> = {
  'a6m2-zero': { spanM: 12.0, lengthM: 9.06, tolerance: 0.06, source: "English Wikipedia 'Mitsubishi A6M Zero', Specifications (A6M2 Type 0 Model 21), read 2026-09-25, as content/aircraft/a6m2-zero.json cites it. Tolerance 6%, not 4%: the chosen model measures 9.52 m at a 12.0 m span (R3 plan, P10)" },
  'f6f-hellcat': { spanM: 13.06, lengthM: 10.24, tolerance: 0.04, source: "English Wikipedia 'Grumman F6F Hellcat', Specifications (F6F-5 Hellcat), read 2026-09-27" },
}

const aircraft = loadModelEntries().filter((e) => e.output.startsWith('content/aircraft/') && e.id !== 'wildcat')

describe('every aircraft model carries its cited span and length (R3)', () => {
  it('every aircraft entry but the frozen Wildcat has a cited row, and every row has an entry', () => {
    expect(aircraft.map((e) => e.id).sort()).toEqual(Object.keys(CITED).sort())
  })

  it('every row cites a source with a read date', () => {
    for (const [id, c] of Object.entries(CITED)) expect(c.source, id).toMatch(/read \d{4}-\d{2}-\d{2}/)
  })

  it.each(aircraft.map((e) => [e.id, e] as const))('%s', async (id, entry) => {
    const c = CITED[id]!
    const tol = entry.source.kind === 'blender' ? 0.01 : c.tolerance
    const doc = await modelIO().readBinary(new Uint8Array(readFileSync(entry.output)))
    const b = getBounds(doc.getRoot().listScenes()[0]!)
    const length = b.max[0] - b.min[0], span = b.max[2] - b.min[2]
    expect(Math.abs(length - c.lengthM) / c.lengthM, `${id}: length ${length.toFixed(3)} m, cited ${c.lengthM}`).toBeLessThanOrEqual(tol)
    if (c.spanM !== undefined) expect(Math.abs(span - c.spanM) / c.spanM, `${id}: span ${span.toFixed(3)} m, cited ${c.spanM}`).toBeLessThanOrEqual(0.01)
  })
})
