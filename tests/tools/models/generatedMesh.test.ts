import { describe, expect, it } from 'vitest'
import { box, corner, lathe, mergeMeshes, srgb, storeDocument, type MeshData, type ProfilePoint } from '../../../tools/models/generated/mesh.js'
import { PAINTED_METAL, PAINT_TEXTURE_SIZE, loadPaintTextures, paintCached } from '../../../tools/models/generated/paint.js'
import { modelIO } from '../../../tools/models/document.js'
import { measureDocument, webpSize } from '../../../tools/models/measure.js'

const OD = srgb(91, 88, 58), YEL = srgb(230, 176, 30)
const tri = (m: MeshData, t: number): number[][] => [0, 1, 2].map((k) => { const i = m.indices[3 * t + k]!; return [m.positions[3 * i]!, m.positions[3 * i + 1]!, m.positions[3 * i + 2]!] })
const cross = (a: number[], b: number[]): number[] => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!]
const sub = (a: number[], b: number[]): number[] => a.map((v, i) => v - b[i]!)
const dot = (a: number[], b: number[]): number => a.reduce((s, v, i) => s + v * b[i]!, 0)
/** Every triangle wound so its face normal agrees with its first vertex's normal, and none has zero area. */
function assertOutward(m: MeshData): void {
  for (let t = 0; t < m.indices.length / 3; t++) {
    const [a, b, c] = tri(m, t) as [number[], number[], number[]]
    const n = cross(sub(b, a), sub(c, a))
    expect(Math.hypot(...n), `triangle ${t} area`).toBeGreaterThan(1e-12)
    const i = m.indices[3 * t]!
    expect(dot(n, [m.normals[3 * i]!, m.normals[3 * i + 1]!, m.normals[3 * i + 2]!]), `triangle ${t} winding`).toBeGreaterThan(0)
  }
}

describe('lathe', () => {
  it('a cylinder: (points) x (segments + 1) vertices, 2 x segments triangles per span, radius exact, wound outward', () => {
    const m = lathe([{ x: 1, r: 0.5, color: OD }, { x: 0, r: 0.5, color: OD }], 8, -1, 2.5)
    expect(m.positions.length / 3).toBe(2 * 9)
    expect(m.indices.length / 3).toBe(16)
    for (let i = 0; i < m.positions.length; i += 3) expect(Math.hypot(m.positions[i + 1]! + 1, m.positions[i + 2]!)).toBeCloseTo(0.5, 12)
    assertOutward(m)
  })

  it('a pointed nose and a flat base make no zero-area triangles; a flat base faces aft', () => {
    const m = lathe([{ x: 1, r: 0, color: OD }, { x: 0.5, r: 0.3, color: OD }, ...corner(0, 0.3, OD), { x: 0, r: 0, color: OD }], 12, 0, 2.5)
    assertOutward(m)
    const last = m.positions.length / 3 - 1
    expect(m.normals[3 * last]).toBeCloseTo(-1, 12)
  })

  it('a paint band: two points at one station switch color with no triangles between them', () => {
    const profile: ProfilePoint[] = [{ x: 1, r: 0.5, color: OD }, { x: 0.6, r: 0.5, color: OD }, { x: 0.6, r: 0.5, color: YEL }, { x: 0.5, r: 0.5, color: YEL }, { x: 0.5, r: 0.5, color: OD }, { x: 0, r: 0.5, color: OD }]
    const m = lathe(profile, 8, 0, 2.5)
    expect(m.indices.length / 3).toBe(3 * 16) // three real spans, the two zero-length ones skipped
    assertOutward(m)
  })

  it('refuses a profile that runs tail to nose', () => {
    expect(() => lathe([{ x: 0, r: 1, color: OD }, { x: 1, r: 1, color: OD }], 8, 0, 2.5)).toThrow(/nose to tail/)
  })
})

describe('box', () => {
  it('24 vertices, 12 outward triangles; a quarter roll carries +Y extent onto +Z about the axis', () => {
    const flat = box([0, 0.1, -0.01], [0.4, 0.3, 0.01], 0, 0, OD, 2.5)
    expect(flat.positions.length / 3).toBe(24)
    expect(flat.indices.length / 3).toBe(12)
    assertOutward(flat)
    const rolled = box([0, 0.1, -0.01], [0.4, 0.3, 0.01], Math.PI / 2, 0, OD, 2.5)
    const zs = rolled.positions.filter((_, i) => i % 3 === 2)
    expect(Math.max(...zs)).toBeCloseTo(0.3, 12)
    expect(Math.min(...zs)).toBeCloseTo(0.1, 12)
    assertOutward(rolled)
  })
})

describe('mergeMeshes and storeDocument', () => {
  it('offsets indices, and writes one node, one mesh, one primitive, one material with COLOR_0', async () => {
    const a = box([0, 0, 0], [1, 1, 1], 0, 0, OD, 2.5), b = box([2, 0, 0], [3, 1, 1], 0, 0, YEL, 2.5)
    const m = mergeMeshes([a, b])
    expect(m.indices.length).toBe(72)
    expect(Math.max(...m.indices)).toBe(47)
    const doc = storeDocument('test', m, null)
    const again = await modelIO().readBinary(await modelIO().writeBinary(doc))
    const meas = measureDocument(again)
    expect(meas.drawCalls).toBe(1)
    expect(meas.triangles).toBe(24)
    const prim = again.getRoot().listMeshes()[0]!.listPrimitives()[0]!
    expect(prim.getAttribute('COLOR_0')?.getCount()).toBe(48)
    expect(again.getRoot().listNodes()).toHaveLength(1)
    expect(again.getRoot().listNodes()[0]!.getTranslation()).toEqual([0, 0, 0])
  })
})

describe.skipIf(!paintCached())('the pinned paint texture (needs tools/textures/cache: run `npm run models:build -- an-m65` once)', () => {
  it('three 512 px WebP images, byte-identical across two loads', async () => {
    const a = await loadPaintTextures(), b = await loadPaintTextures()
    for (const k of ['baseColor', 'normal', 'metallicRoughness'] as const) {
      expect(webpSize(a[k]), k).toEqual([PAINT_TEXTURE_SIZE, PAINT_TEXTURE_SIZE])
      expect(Buffer.from(a[k]).equals(Buffer.from(b[k])), k).toBe(true)
    }
  })
})

it('PAINTED_METAL is pinned: Poly Haven 1k JPEGs of blue_metal_plate with 32-hex MD5s', () => {
  for (const s of [PAINTED_METAL.diffuse, PAINTED_METAL.normal, PAINTED_METAL.rough]) {
    expect(s.url).toMatch(/^https:\/\/dl\.polyhaven\.org\/file\/ph-assets\/Textures\/jpg\/1k\/blue_metal_plate\/blue_metal_plate_[a-z_]+_1k\.jpg$/)
    expect(s.md5).toMatch(/^[0-9a-f]{32}$/)
  }
})
