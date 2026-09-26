import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { loadModelEntries, type ModelEntry } from '../../../tools/models/manifest.js'
import { finishGenerated } from '../../../tools/models/build.js'
import { GENERATORS } from '../../../tools/models/generated/registry.js'
import { paintCached } from '../../../tools/models/generated/paint.js'
import { modelIO } from '../../../tools/models/document.js'
import type { MeshData } from '../../../tools/models/generated/mesh.js'
import { INSIGNIA_YELLOW } from '../../../tools/models/generated/colors.js'
import { AN_M65_AXIS_Y, AN_M65_CITED, AN_M65_SEAT_X, anM65Parts } from '../../../tools/models/generated/an-m65.js'

const xs = (m: MeshData): number[] => m.positions.filter((_, i) => i % 3 === 0)
const ys = (m: MeshData): number[] => m.positions.filter((_, i) => i % 3 === 1)
const zs = (m: MeshData): number[] => m.positions.filter((_, i) => i % 3 === 2)
const extent = (v: number[]): number => Math.max(...v) - Math.min(...v)
/** Largest distance of any vertex from the axis line y = axisY, z = 0. */
const maxRadius = (m: MeshData, axisY: number): number => {
  let r = 0
  for (let i = 0; i < m.positions.length; i += 3) r = Math.max(r, Math.hypot(m.positions[i + 1]! - axisY, m.positions[i + 2]!))
  return r
}
const within1pct = (measured: number, cited: number, label: string): void => {
  expect(Math.abs(measured - cited) / cited, `${label}: measured ${measured}, cited ${cited}`).toBeLessThanOrEqual(0.01)
}
const generatedEntries = loadModelEntries().filter((e): e is ModelEntry & { source: { kind: 'generated' } } => e.source.kind === 'generated')

describe('AN-M65: measured dimensions within 1% of OP 1664 (O1, spec §7)', () => {
  const p = anM65Parts()
  it('body length, body diameter, overall length (fuze excluded, as OP 1664 measures it)', () => {
    within1pct(Math.max(...xs(p.body)) - Math.min(...xs(p.body)), AN_M65_CITED.bodyLengthM, 'body length')
    within1pct(2 * maxRadius(p.body, AN_M65_AXIS_Y), AN_M65_CITED.bodyDiameterM, 'body diameter')
    within1pct(Math.max(...xs(p.body)) - Math.min(...xs(p.tail)), AN_M65_CITED.overallLengthM, 'overall length')
  })
  it('tail length and the box tail width, both across (y) and side to side (z)', () => {
    within1pct(extent(xs(p.tail)), AN_M65_CITED.tailLengthM, 'tail length')
    within1pct(extent(ys(p.tail)), AN_M65_CITED.tailWidthM, 'tail width (y)')
    within1pct(extent(zs(p.tail)), AN_M65_CITED.tailWidthM, 'tail width (z)')
  })
  it('dual lugs 14 in apart on top, their tops at the origin plane; one lug underneath', () => {
    const tops: number[] = [], bottoms: number[] = []
    for (let i = 0; i < p.lugs.positions.length; i += 3) (p.lugs.positions[i + 1]! > AN_M65_AXIS_Y ? tops : bottoms).push(p.lugs.positions[i]!)
    const fore = tops.filter((x) => x > 0), aft = tops.filter((x) => x < 0)
    const center = (v: number[]): number => (Math.max(...v) + Math.min(...v)) / 2
    within1pct(center(fore) - center(aft), AN_M65_CITED.lugSpacingM, 'lug spacing')
    expect(Math.max(...ys(p.lugs))).toBeCloseTo(0, 12)
    expect(bottoms.length).toBeGreaterThan(0)
  })
  it('the yellow nose band starts 250 mm aft of the nose (AWM C285409) and is 1 in wide (OP 1664)', () => {
    const yellowX: number[] = []
    for (let i = 0; i < p.body.colors.length; i += 3) if (p.body.colors[i] === INSIGNIA_YELLOW[0] && p.body.colors[i + 1] === INSIGNIA_YELLOW[1]) yellowX.push(p.body.positions[i]!)
    const nose = yellowX.filter((x) => x > AN_M65_SEAT_X - 0.5)
    within1pct(AN_M65_SEAT_X - Math.max(...nose), AN_M65_CITED.noseBandFromSeatM, 'nose band station')
    within1pct(Math.max(...nose) - Math.min(...nose), AN_M65_CITED.bandWidthM, 'band width')
  })
  it('the lug tops are the highest point of body, fuze and lugs; the box tail rises above them, as the real one did', () => {
    for (const m of [p.body, p.fuze, p.lugs]) expect(Math.max(...ys(m))).toBeLessThanOrEqual(1e-12)
    // 25.4 in box vs 18.8 in body + lugs: the box top sits ~0.05 m above the lug tops. This is
    // why Task 5's mount fit drops the store clear of the wing instead of hanging it on the skin.
    expect(Math.max(...ys(p.tail))).toBeGreaterThan(0)
  })
})

describe('generated entries and the registry', () => {
  it('every generated entry names a registered generator whose file exists, and every generator has an entry', () => {
    for (const e of generatedEntries) {
      expect(GENERATORS[e.source.generator], e.id).toBeDefined()
      expect(existsSync(e.source.generator), e.source.generator).toBe(true)
    }
    expect(Object.keys(GENERATORS).sort()).toEqual(generatedEntries.map((e) => e.source.generator).sort())
  })
})

describe.skipIf(!paintCached())('generated outputs rebuild byte-identically (needs tools/textures/cache: run `npm run models:build -- an-m65` once)', () => {
  it.each(generatedEntries.map((e) => [e.id, e] as const))('%s: two builds agree, and equal the committed file', async (_id, entry) => {
    const run = async (): Promise<Uint8Array> => modelIO().writeBinary(await finishGenerated(await GENERATORS[entry.source.generator]!(), entry))
    const a = Buffer.from(await run()), b = Buffer.from(await run())
    expect(a.equals(b)).toBe(true)
    expect(a.equals(readFileSync(entry.output)), `${entry.output} differs from a fresh build`).toBe(true)
  })
})
