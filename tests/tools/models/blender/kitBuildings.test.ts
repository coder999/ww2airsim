// tests/tools/models/blender/kitBuildings.test.ts
import { beforeAll, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getBounds } from '@gltf-transform/functions'
import type { Document } from '@gltf-transform/core'
import { HAVE_BLENDER, runBlenderScript } from '../../../../tools/models/blender/run.js'
import { findNode, modelIO, onlyScene } from '../../../../tools/models/document.js'
import { measureDocument } from '../../../../tools/models/measure.js'
import { centroid, cross, dot, sub, unitNormal, worldTriangles, type Vec3 } from '../buildingGeometry.js'

const PROBE = 'tests/tools/models/blender/fixtures/kit_building_probe.py'
const BAD = 'tests/tools/models/blender/fixtures/kit_bad_building.py'
const sha = (p: string): string => createHash('sha256').update(readFileSync(p)).digest('hex')
const rad = (deg: number): number => (deg * Math.PI) / 180

/** Every face of a convex part points away from a point inside it. */
function expectOutward(doc: Document, node: string, inside: Vec3): void {
  for (const t of worldTriangles(findNode(doc, node))) {
    const n = unitNormal(t)
    if (n === null) continue
    expect(dot(n, sub(centroid(t), inside)), `${node} face at ${centroid(t).map((v) => v.toFixed(2)).join(', ')}`).toBeGreaterThan(0)
  }
}

/** Every vertex's distance along the axis from `a` (unit `d`), and its distance from the axis. */
function alongAxis(doc: Document, node: string, a: Vec3, d: Vec3): { along: number[]; off: number[] } {
  const vs = worldTriangles(findNode(doc, node)).flat()
  const along = vs.map((v) => dot(sub(v, a), d))
  const off = vs.map((v) => { const c = cross(sub(v, a), d); return Math.hypot(c[0], c[1], c[2]) })
  return { along, off }
}

// Builds run in beforeAll, never in the describe body: vitest runs a skipped suite's body to
// collect it, so a build there would error on ryzen instead of skipping by name.
describe.skipIf(!HAVE_BLENDER)("the kit's building parts (model-roster spec §4.2, R4)", () => {
  const dir = mkdtempSync(join(tmpdir(), 'r4-kit-'))
  const a = join(dir, 'a.glb'), b = join(dir, 'b.glb')
  let doc: Document
  beforeAll(async () => {
    runBlenderScript(PROBE, a)
    runBlenderScript(PROBE, b)
    doc = await modelIO().readBinary(new Uint8Array(readFileSync(a)))
  }, 120_000)

  it('rebuilds byte-identically', () => {
    expect(sha(b)).toBe(sha(a))
  })

  it('one node per part, sorted, one draw each, flat materials by role including earth', () => {
    expect(onlyScene(doc).listChildren()[0]!.listChildren().map((n) => n.getName())).toEqual([
      'bprobe_barrel', 'bprobe_disc', 'bprobe_frustum', 'bprobe_mast', 'bprobe_ring', 'bprobe_roof', 'bprobe_strut', 'bprobe_tank',
    ])
    expect(measureDocument(doc).drawCalls).toBe(8)
    expect(doc.getRoot().listMaterials().map((m) => m.getName()).sort()).toEqual(['concrete', 'dark', 'earth', 'steel'])
    for (const m of doc.getRoot().listMaterials()) expect(m.getMetallicFactor()).toBe(0)
  })

  it.each([
    ['bprobe_frustum', [-3, 0, -2], [3, 2, 2]],
    ['bprobe_roof', [7.5, 3, -3.5], [12.5, 4.5, 3.5]],
    ['bprobe_tank', [18, 0, -2], [22, 3.5, 2]],
    ['bprobe_disc', [28, 0, -2], [32, 0.5, 2]],
    ['bprobe_ring', [37.2, 0, -2.8], [42.8, 1.2, 2.8]],
  ] as const)('%s spans exactly what it was asked for', (node, min, max) => {
    const bb = getBounds(findNode(doc, node))
    min.forEach((v, i) => expect(bb.min[i], `${node} min[${i}]`).toBeCloseTo(v, 4))
    max.forEach((v, i) => expect(bb.max[i], `${node} max[${i}]`).toBeCloseTo(v, 4))
  })

  it('convex parts are wound outward', () => {
    expectOutward(doc, 'bprobe_frustum', [0, 1, 0])
    expectOutward(doc, 'bprobe_roof', [10, 3.5, 0])
    expectOutward(doc, 'bprobe_tank', [20, 1.5, 0])
    expectOutward(doc, 'bprobe_disc', [30, 0.25, 0])
    expectOutward(doc, 'bprobe_strut', [51, 1.5, 0])
    const d: Vec3 = [Math.cos(rad(20)) * Math.cos(rad(30)), Math.sin(rad(20)), -Math.cos(rad(20)) * Math.sin(rad(30))]
    expectOutward(doc, 'bprobe_barrel', [60 + 2 * d[0], 1 + 2 * d[1], 2 * d[2]])
  })

  it('the ring: outer face away from the axis, inner face toward it, top up, foot down', () => {
    for (const t of worldTriangles(findNode(doc, 'bprobe_ring'))) {
      const n = unitNormal(t)
      if (n === null) continue
      const c = centroid(t)
      const r = Math.hypot(c[0] - 40, c[2])
      if (Math.abs(n[1]) > 0.99) expect(Math.sign(n[1]), `ring cap at y=${c[1].toFixed(2)}`).toBe(c[1] > 0.6 ? 1 : -1)
      else {
        const radial = (n[0] * (c[0] - 40) + n[2] * c[2]) / r
        expect(radial * (r < 2.05 ? -1 : 1), `ring wall at r=${r.toFixed(2)}`).toBeGreaterThan(0)
      }
    }
  })

  it('a strut runs from p0 to p1 with its two radii; a barrel from its breech along azimuth and elevation', () => {
    const strutD: Vec3 = [2 / Math.sqrt(29), 3 / Math.sqrt(29), 4 / Math.sqrt(29)]
    const s = alongAxis(doc, 'bprobe_strut', [50, 0, -2], strutD)
    expect(Math.min(...s.along)).toBeCloseTo(0, 4)
    expect(Math.max(...s.along)).toBeCloseTo(Math.sqrt(29), 4)
    expect(Math.max(...s.off)).toBeCloseTo(0.2, 4)
    // Azimuth 30 turns from +x toward -z; elevation 20 lifts it.
    const d: Vec3 = [Math.cos(rad(20)) * Math.cos(rad(30)), Math.sin(rad(20)), -Math.cos(rad(20)) * Math.sin(rad(30))]
    const g = alongAxis(doc, 'bprobe_barrel', [60, 1, 0], d)
    expect(Math.min(...g.along)).toBeCloseTo(0, 4)
    expect(Math.max(...g.along)).toBeCloseTo(4, 4)
    expect(Math.max(...g.off)).toBeCloseTo(0.1, 4)
  })

  it('the mast: 4 legs, 5 rings of 4, an X on each face of 4 panels, 12 triangles per member, 12 m tall', () => {
    expect(worldTriangles(findNode(doc, 'bprobe_mast'))).toHaveLength(12 * (4 + 4 * 5 + 8 * 4))
    const bb = getBounds(findNode(doc, 'bprobe_mast'))
    expect(bb.max[1]).toBeGreaterThan(12)
    expect(bb.max[1]).toBeLessThan(12.1) // a member's half-diagonal above the top ring
    expect(bb.min[1]).toBeGreaterThan(-0.1)
    expect(bb.max[0] - bb.min[0]).toBeGreaterThan(3)
    expect(bb.max[0] - bb.min[0]).toBeLessThan(3.3)
  })

  it.each([
    ['frustum-upper', /frustum: upper .* must not exceed lower/],
    ['roof-rise', /gable_roof: width, length and rise must be > 0/],
    ['tank-segments', /tank: segments must be an integer >= 3/],
    ['ring-batter', /sandbag_ring: batter 0.5 must be >= 0 and < thickness 0.5/],
    ['strut-zero', /strut: p0 and p1 must differ/],
    ['barrel-elevation', /gun_barrel: elevation must be in \[-5, 85\] degrees, got 90/],
    ['mast-top', /lattice_mast: top_width must be > 0 and <= base_width/],
  ])('refuses %s by name', (c, message) => {
    expect(() => runBlenderScript(BAD, join(dir, `bad-${c}.glb`), ['--case', c])).toThrow(message)
  })
})
