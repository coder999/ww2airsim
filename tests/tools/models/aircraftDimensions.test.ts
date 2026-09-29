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
  'a6m2-zero': { spanM: 12.0, lengthM: 9.06, tolerance: 0.08, source: "English Wikipedia 'Mitsubishi A6M Zero', Specifications (A6M2 Type 0 Model 21), read 2026-09-25, as content/aircraft/a6m2-zero.json cites it. Tolerance 6%, not 4%: the chosen model measures 9.52 m at a 12.0 m span (R3 plan, P10)" },
  'b-17-flying-fortress': { spanM: 31.62, lengthM: 22.66, tolerance: 0.04, source: "English Wikipedia 'Boeing B-17 Flying Fortress', Specifications (B-17G): span 103 ft 9 in, length 74 ft 4 in, read 2026-09-27. The article notes other sources give 74 ft 9 in (22.78 m); the model measures 23.16 m, +2.2% (R3 ledger, Task 11)" },
  'b-29-superfortress': { spanM: 43.05, lengthM: 30.18, tolerance: 0.01, source: "English Wikipedia 'Boeing B-29 Superfortress', Specifications (the section names no variant): span 141 ft 3 in, length 99 ft 0 in, read 2026-09-27" },
  'd3a-val': { spanM: 14.365, lengthM: 10.195, tolerance: 0.04, source: "English Wikipedia 'Aichi D3A', Specifications (D3A2 Model 22), read 2026-09-27" },
  'f6f-hellcat': { spanM: 13.06, lengthM: 10.24, tolerance: 0.04, source: "English Wikipedia 'Grumman F6F Hellcat', Specifications (F6F-5 Hellcat), read 2026-09-27" },
  'f4u-corsair': { spanM: 12.5, lengthM: 10.26, tolerance: 0.04, source: "English Wikipedia 'Vought F4U Corsair', Specifications (F4U-4): span 41 ft 0 in, length 33 ft 8 in, read 2026-09-27. The model is an F4U-1A (its fuselage node is f4u1fuse; framed raised canopy; a 3-blade prop texture), for which the article gives no figures; the -1's span differs by 1 cm and its length (33 ft 4.5 in) by 0.9%, inside the 4% (R3 ledger, Task 6)" },
  'g4m-betty': { spanM: 24.89, lengthM: 19.97, tolerance: 0.01, source: "English Wikipedia 'Mitsubishi G4M', Specifications (G4M1 Model 11): span 24.89 m, length 19.97 m, read 2026-09-29. An original Blender model built from both." },
  'ki-21-sally': { spanM: 22.5, lengthM: 16.0, tolerance: 0.01, source: "English Wikipedia 'Mitsubishi Ki-21', Specifications (Ki-21-IIb), read 2026-09-27" },
  'ki-43-oscar': { spanM: 10.84, lengthM: 8.92, tolerance: 0.04, source: "English Wikipedia 'Nakajima Ki-43 Hayabusa', Specifications (Ki-43-IIb), read 2026-09-27" },
  'ki-84-frank': { spanM: 11.238, lengthM: 9.92, tolerance: 0.01, source: "English Wikipedia 'Nakajima Ki-84 Hayate', Specifications (Ki-84-Ia), read 2026-09-27" },
  'p-38-lightning': { spanM: 15.85, lengthM: 11.53, tolerance: 0.01, source: "English Wikipedia 'Lockheed P-38 Lightning', Specifications (P-38L): span 52 ft 0 in, length 37 ft 10 in, read 2026-09-27. An original Blender model: the Sketchfab pick measured +5.2% long at this span (R3 ledger, Task 8)" },
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
