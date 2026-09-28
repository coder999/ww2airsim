// tests/tools/models/blender/hangar.test.ts
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getBounds } from '@gltf-transform/functions'
import type { Document } from '@gltf-transform/core'
import { HAVE_BLENDER, runBlenderScript, skinSidecarPath } from '../../../../tools/models/blender/run.js'
import { blenderScriptFor, candidateOutput } from '../../../../tools/models/blender/cli.js'
import { modelIO, findNode } from '../../../../tools/models/document.js'
import { measureDocument } from '../../../../tools/models/measure.js'
import { coplanarOverlaps, worldTriangles } from '../buildingGeometry.js'

/** hangar.py's EAVE_OUT_M (DP0): the steel's footprint is the walls' plus an eave each side. */
const EAVE_OUT_M = 0.35

const sha = (p: string): string => createHash('sha256').update(readFileSync(p)).digest('hex')
const tacloban = JSON.parse(readFileSync('content/bases/tacloban.json', 'utf8')) as { buildings: { id: string; widthM: number; lengthM: number }[] }
const cited = tacloban.buildings.find((b) => b.id === 'tacloban-hangar-1')!
const within1pct = (got: number, want: number, label: string): void => {
  expect(Math.abs(got - want) / want, `${label}: measured ${got}, cited ${want}`).toBeLessThanOrEqual(0.01)
}

describe('cli paths', () => {
  it('maps an id to its script and its gitignored candidate output, and refuses reserved or bad ids', () => {
    expect(blenderScriptFor('hangar')).toBe('tools/models/blender/hangar.py')
    expect(candidateOutput('hangar')).toBe('content/models/candidates/hangar.glb')
    expect(() => blenderScriptFor('kit')).toThrow(/reserved/)
    expect(() => blenderScriptFor('preview')).toThrow(/reserved/)
    expect(() => blenderScriptFor('../x')).toThrow(/id/)
  })
})

// Builds in beforeAll, not the describe body (see kit.test.ts).
describe.skipIf(!HAVE_BLENDER)('the hangar proof model (model-roster spec §4.2, M0)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'm0-hangar-'))
  const a = join(dir, 'a.glb'), b = join(dir, 'b.glb')
  let doc: Document
  beforeAll(async () => {
    runBlenderScript(blenderScriptFor('hangar'), a)
    runBlenderScript(blenderScriptFor('hangar'), b)
    doc = await modelIO().readBinary(new Uint8Array(readFileSync(a)))
  }, 120_000)

  it('rebuilds byte-identically', () => {
    expect(sha(b)).toBe(sha(a))
  })

  it('the steel structure fits the sim footprint and stands on y = 0', () => {
    const bb = getBounds(findNode(doc, 'hangar_steel'))
    within1pct(bb.max[0] - bb.min[0], cited.widthM + 2 * EAVE_OUT_M, 'width (x), eaves included')
    within1pct(bb.max[2] - bb.min[2], cited.lengthM, 'length (z)')
    within1pct(bb.max[1], 5.5 + cited.widthM * 0.25, 'height: wall + rise')
    expect(bb.min[1]).toBeCloseTo(0, 5)
  })

  it('the slab top is the ground plane, one meter wider and longer than the footprint', () => {
    const bb = getBounds(findNode(doc, 'hangar_concrete'))
    expect(bb.max[1]).toBeCloseTo(0, 5)
    within1pct(bb.max[0] - bb.min[0], cited.widthM + 1, 'slab width')
    within1pct(bb.max[2] - bb.min[2], cited.lengthM + 1, 'slab length')
  })

  it('the door leaves stand at the open +z end only', () => {
    const doors = getBounds(findNode(doc, 'hangar_dark'))
    expect(doors.min[2]).toBeGreaterThan(cited.lengthM / 2 - 1)
  })

  it('the raw export: at most 5k triangles in its 4 role nodes, UVs on every primitive, and its skin sidecar (DP0)', () => {
    const m = measureDocument(doc)
    expect(m.triangles).toBeLessThanOrEqual(5000)
    expect(m.drawCalls).toBeLessThanOrEqual(4)
    expect(findNode(doc, 'hangar_glazing').getMesh(), 'the windows\' glass').not.toBeNull()
    expect(m.textures).toBe(0) // the kit writes UVs; the build's skin stage adds the textures
    for (const p of doc.getRoot().listMeshes().flatMap((x) => x.listPrimitives())) expect(p.getAttribute('TEXCOORD_0')).not.toBeNull()
    const side = JSON.parse(readFileSync(skinSidecarPath(a), 'utf8')) as { atlasPx: number; markings: { kind: string }[] }
    expect(side.atlasPx).toBe(512)
    expect(side.markings.filter((k) => k.kind === 'grid')).toHaveLength(3)
  })

  it('centroid z-fight heuristic: no same-facing coplanar pair where one triangle\'s centroid lies inside the other (partial overlaps are not caught) (DP0)', () => {
    const tris = doc.getRoot().listNodes().filter((n) => n.getMesh()).flatMap((n) => worldTriangles(n).map((tri, i) => ({ label: `${n.getName()}#${i}`, where: n.getName(), tri })))
    expect(coplanarOverlaps(tris)).toEqual([])
  }, 60_000)

  it('every rib sits on the roof: its inner face 0.02 m into the shell, its outer face 0.06 m proud, at every angle (DP0, ray-cast)', () => {
    // Slice hangar_steel at z = 0 (between ribs: the roof alone) and at z = 1.5 m (a rib's center), and
    // cast rays from the springing center (0, 5.5). The crossings the rib slice adds over the roof slice
    // are the rib's inner and outer faces. A rib faceted unlike the roof floats clear of it or sinks deep
    // between facets; the embed rule needs embed >= 0.015 m (EMBED_M 0.02 less roundoff) everywhere.
    const tris = worldTriangles(findNode(doc, 'hangar_steel'))
    const slice = (z0: number): [number, number, number, number][] => {
      const out: [number, number, number, number][] = []
      for (const t of tris) {
        const pts: [number, number][] = []
        for (let k = 0; k < 3; k++) {
          const a = t[k]!, b = t[(k + 1) % 3]!
          if ((a[2] - z0) * (b[2] - z0) < 0) { const f = (z0 - a[2]) / (b[2] - a[2]); pts.push([a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1])]) }
        }
        if (pts.length === 2) out.push([pts[0]![0], pts[0]![1], pts[1]![0], pts[1]![1]])
      }
      return out
    }
    const hits = (segs: [number, number, number, number][], th: number): number[] => {
      const dx = Math.cos(th), dy = Math.sin(th), out: number[] = []
      for (const [x1, y1, x2, y2] of segs) {
        const ex = x2 - x1, ey = y2 - y1, den = dx * ey - dy * ex
        if (Math.abs(den) < 1e-12) continue
        const qx = x1, qy = y1 - 5.5
        const t = (qx * ey - qy * ex) / den, s = (qx * dy - qy * dx) / den
        if (t > 0 && s >= 0 && s <= 1) out.push(t)
      }
      return [...new Set(out.map((t) => Math.round(t * 1e5) / 1e5))].sort((a, b) => a - b)
    }
    const roof = slice(0), rib = slice(1.5)
    let minEmbed = Infinity, maxEmbed = -Infinity, minProud = Infinity, maxProud = -Infinity
    for (let i = 0; i <= 352; i++) {
      const th = ((2 + i * (176 / 352)) * Math.PI) / 180
      const r = hits(roof, th), all = hits(rib, th)
      const outer = r[r.length - 1]!
      const extra = all.filter((t) => !r.some((u) => Math.abs(u - t) < 1e-4))
      expect(extra, `angle ${(th * 180 / Math.PI).toFixed(2)}: the rib adds an inner and an outer face`).toHaveLength(2)
      const embed = outer - extra[0]!, proud = extra[1]! - outer
      minEmbed = Math.min(minEmbed, embed); maxEmbed = Math.max(maxEmbed, embed)
      minProud = Math.min(minProud, proud); maxProud = Math.max(maxProud, proud)
    }
    expect(minEmbed, 'rib inner face below the roof surface, least').toBeGreaterThanOrEqual(0.015)
    expect(maxEmbed, 'rib inner face below the roof surface, most').toBeLessThanOrEqual(0.035)
    expect(minProud, 'rib outer face above the roof, least').toBeGreaterThanOrEqual(0.045)
    expect(maxProud, 'rib outer face above the roof, most').toBeLessThanOrEqual(0.075)
  })

  it('takes the Dulag footprint by argument', async () => {
    const out = join(dir, 'dulag.glb')
    runBlenderScript(blenderScriptFor('hangar'), out, ['--width', '22', '--length', '28'])
    const bb = getBounds(findNode(await modelIO().readBinary(new Uint8Array(readFileSync(out))), 'hangar_steel'))
    within1pct(bb.max[0] - bb.min[0], 22 + 2 * EAVE_OUT_M, 'Dulag width, eaves included')
    within1pct(bb.max[2] - bb.min[2], 28, 'Dulag length')
  })

  it('refuses bad arguments by name', () => {
    expect(() => runBlenderScript(blenderScriptFor('hangar'), join(dir, 'bad1.glb'), ['--width', '-5'])).toThrow(/--width must be > 0/)
    expect(() => runBlenderScript(blenderScriptFor('hangar'), join(dir, 'bad2.glb'), ['--length', 'abc'])).toThrow(/--length must be a number/)
    // Positive but too small: the shell would turn inside out and the doors cross.
    expect(() => runBlenderScript(blenderScriptFor('hangar'), join(dir, 'bad3.glb'), ['--width', '1'])).toThrow(/--width must be at least 4/)
    // A typo must not build the default model.
    expect(() => runBlenderScript(blenderScriptFor('hangar'), join(dir, 'bad4.glb'), ['--widht', '22'])).toThrow(/unknown argument --widht/)
    expect(() => runBlenderScript(blenderScriptFor('hangar'), join(dir, 'bad5.glb'), ['--width', '22', '--width', '30'])).toThrow(/--width given twice/)
  })

  it('the rear gable closes the back between the walls, below the vault', () => {
    const node = findNode(doc, 'hangar_steel')
    const m = node.getWorldMatrix()
    const halfL = cited.lengthM / 2, inner = cited.widthM / 2 - 0.35
    let area = 0
    for (const prim of node.getMesh()!.listPrimitives()) {
      const pos = prim.getAttribute('POSITION')!, idx = prim.getIndices()!
      for (let i = 0; i < idx.getCount(); i += 3) {
        const v = [0, 1, 2].map((k) => {
          const [x, y, z] = pos.getElement(idx.getScalar(i + k), [0, 0, 0]) as number[]
          return [m[0]! * x! + m[4]! * y! + m[8]! * z! + m[12]!, m[1]! * x! + m[5]! * y! + m[9]! * z! + m[13]!, m[2]! * x! + m[6]! * y! + m[10]! * z! + m[14]!]
        })
        // Faces facing +-z, within 0.5 m of the rear end: the gable's two broad faces.
        if (!v.every((p) => p[2]! < -halfL + 0.5 && Math.abs(v[0]![2]! - p[2]!) < 1e-6)) continue
        const [a, b, c] = v as [number[], number[], number[]]
        const cx = (a[0]! + b[0]! + c[0]!) / 3, cy = (a[1]! + b[1]! + c[1]!) / 3
        if (Math.abs(cx) < inner && cy < 5.5) area += Math.abs((b[0]! - a[0]!) * (c[1]! - a[1]!) - (c[0]! - a[0]!) * (b[1]! - a[1]!)) / 2
      }
    }
    // Two broad faces, each covering the wall-high rectangle between the walls.
    expect(area).toBeGreaterThan(2 * 0.9 * (2 * inner) * 5.5)
  })

  it('no coplanar overlap at the rear: in the end plane, above the walls, only the vault rim ring', () => {
    // A gable face flush with the rim draws a dark seam (seen in the M0 Cycles capture) and
    // z-fights in the game. The rim is a half-elliptic ring between the outer (w/2, rise) and
    // inner (w/2 - t, rise - t) curves; any other face in that plane adds area beyond it.
    const node = findNode(doc, 'hangar_steel')
    const m = node.getWorldMatrix()
    const halfL = cited.lengthM / 2
    let area = 0
    for (const prim of node.getMesh()!.listPrimitives()) {
      const pos = prim.getAttribute('POSITION')!, idx = prim.getIndices()!
      for (let i = 0; i < idx.getCount(); i += 3) {
        const v = [0, 1, 2].map((k) => {
          const [x, y, z] = pos.getElement(idx.getScalar(i + k), [0, 0, 0]) as number[]
          return [m[0]! * x! + m[4]! * y! + m[8]! * z! + m[12]!, m[1]! * x! + m[5]! * y! + m[9]! * z! + m[13]!, m[2]! * x! + m[6]! * y! + m[10]! * z! + m[14]!]
        })
        if (!v.every((p) => Math.abs(p[2]! + halfL) < 1e-4 && p[1]! >= 5.5 - 1e-4)) continue
        const [a, b, c] = v as [number[], number[], number[]]
        area += Math.abs((b[0]! - a[0]!) * (c[1]! - a[1]!) - (c[0]! - a[0]!) * (b[1]! - a[1]!)) / 2
      }
    }
    const w2 = cited.widthM / 2, rise = cited.widthM * 0.25, t = 0.3
    const ring = (Math.PI / 2) * (w2 * rise - (w2 - t) * (rise - t))
    expect(area, 'end-plane area above the walls').toBeLessThanOrEqual(ring * 1.001)
    expect(area).toBeGreaterThan(ring * 0.95)
  })

  it('renders a 1280x800 preview PNG of the built glb', () => {
    const png = join(dir, 'front.png')
    runBlenderScript('tools/models/blender/preview.py', png, ['--glb', a, '--view', 'front'])
    const bytes = readFileSync(png)
    expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG')
    expect(bytes.readUInt32BE(16)).toBe(1280)
    expect(bytes.readUInt32BE(20)).toBe(800)
  }, 60_000)
})
