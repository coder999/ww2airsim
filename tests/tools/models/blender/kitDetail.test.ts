// tests/tools/models/blender/kitDetail.test.ts
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Document } from '@gltf-transform/core'
import { HAVE_BLENDER, runBlenderScript, skinSidecarPath } from '../../../../tools/models/blender/run.js'
import { findNode, modelIO } from '../../../../tools/models/document.js'
import { worldTriangles } from '../buildingGeometry.js'

const PROBE = 'tests/tools/models/blender/fixtures/kit_detail_probe.py'
const sha = (p: string): string => createHash('sha256').update(readFileSync(p)).digest('hex')
/** Signed volume by the divergence theorem: positive iff the closed shells are wound outward. */
const volume = (doc: Document, name: string): number => worldTriangles(findNode(doc, name)).reduce((s, [a, b, c]) =>
  s + (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6, 0)
const verts = (doc: Document, name: string): number[][] => worldTriangles(findNode(doc, name)).flat()

describe.skipIf(!HAVE_BLENDER)('the kit aircraft detail parts (DP0 Task 9)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dp0-detail-'))
  const a = join(dir, 'a.glb'), b = join(dir, 'b.glb')
  let doc: Document
  beforeAll(async () => {
    runBlenderScript(PROBE, a)
    runBlenderScript(PROBE, b)
    doc = await modelIO().readBinary(new Uint8Array(readFileSync(a)))
  }, 180_000)

  it('rebuilds byte-identically', () => { expect(sha(b)).toBe(sha(a)) })

  // A node split by role (df_wing / df_wing_lower) is an open shell on its own, whose signed volume depends on
  // where the origin is; only the closed union is meaningful (as in kitAircraft.test.ts's fuse + fuse_lower).
  it.each([['df_fuse'], ['df_wing', 'df_wing_lower'], ['df_fin'], ['Prop'], ['df_canopy'], ['df_frames']])('%s is wound outward (positive signed volume)', (...ns: string[]) => {
    expect(ns.reduce((s, n) => s + volume(doc, n), 0)).toBeGreaterThan(0)
  })

  it('fuselage subdivide: 3 spans x 4 = 13 rings, lines only at the 2 interior authored stations', () => {
    const xs = new Set(verts(doc, 'df_fuse').map((v) => v[0]!.toFixed(4)))
    expect(xs.size).toBe(13)
    const side = JSON.parse(readFileSync(skinSidecarPath(a), 'utf8')) as { patches: { id: number; tag: string; rect: number[] }[]; lines: { patch: number; axis: string }[] }
    const fus = side.patches.filter((p) => p.tag === 'fuselage').sort((p, q) => q.rect[2]! * q.rect[3]! - p.rect[2]! * p.rect[3]!)[0]!
    expect(side.lines.filter((l) => l.patch === fus.id && l.axis === 'u')).toHaveLength(2)
  })

  it('an aileron is its own piece: at z = 3.75 there is a chordwise gap of at least 11 mm at the hinge', () => {
    const at = verts(doc, 'df_wing').concat(verts(doc, 'df_wing_lower')).filter((v) => Math.abs(v[2]! - 3.75) < 1e-4).map((v) => v[0]!)
    // The largest gap between any two stations is 0.1 chord (125 mm here), so a max-gap check proves nothing;
    // look at the hinge itself. Chord at z = 3.75 is 2 - 0.75 = 1.25 m, the leading edge at x = 0.5 (no sweep).
    const hinge = 0.5 - 0.75 * 1.25
    // The aileron starts at the hinge; the wing's cut end stands 11-30 mm ahead of it (the nearest station
    // forward, 0.7 chord, is 62.5 mm away), and nothing lies in between.
    expect(at.some((x) => Math.abs(x - hinge) < 1e-4)).toBe(true)
    expect(at.some((x) => x - hinge >= 0.011 && x - hinge < 0.03)).toBe(true)
    expect(at.filter((x) => x - hinge > 1e-4 && x - hinge < 0.011)).toEqual([])
  })

  it('twisted blades: the chord pitches 45 deg at the root and 18 at the tip, within 4 deg', () => {
    const pitchAt = (r: number): number => {
      const ring = verts(doc, 'Prop').filter((v) => Math.abs(v[1]! - r) < 1e-4 && Math.abs(v[2]!) < 0.4)
      const xs = ring.map((v) => v[0]!), zs = ring.map((v) => v[2]!)
      return (Math.atan2(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) * 180) / Math.PI
    }
    expect(Math.abs(pitchAt(0.15) - 45)).toBeLessThanOrEqual(4)
    expect(Math.abs(pitchAt(1.425) - 18)).toBeLessThanOrEqual(4)
  })

  it('the canopy: three frame hoops, each bar-wide, at the given stations', () => {
    const xs = verts(doc, 'df_frames').map((v) => v[0]!)
    for (const x of [-0.5, 0, 0.5]) expect(xs.some((v) => Math.abs(v - x) <= 0.0101), `hoop at ${x}`).toBe(true)
    expect(xs.every((v) => [-0.5, 0, 0.5].some((x) => Math.abs(v - x) <= 0.0101))).toBe(true)
  })
})
