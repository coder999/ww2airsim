// tests/tools/models/blender/hangar.test.ts
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getBounds } from '@gltf-transform/functions'
import type { Document } from '@gltf-transform/core'
import { HAVE_BLENDER, runBlenderScript } from '../../../../tools/models/blender/run.js'
import { blenderScriptFor, candidateOutput } from '../../../../tools/models/blender/cli.js'
import { modelIO, findNode } from '../../../../tools/models/document.js'
import { measureDocument } from '../../../../tools/models/measure.js'

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
    within1pct(bb.max[0] - bb.min[0], cited.widthM, 'width (x)')
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

  it('is open at +z and closed at -z: the door leaves stand at the +z end only', () => {
    const doors = getBounds(findNode(doc, 'hangar_dark'))
    expect(doors.min[2]).toBeGreaterThan(cited.lengthM / 2 - 1)
  })

  it('is inside the spec §4.4 building budget: 5k triangles, 4 draw calls, 0.5 MB, no textures', () => {
    const m = measureDocument(doc)
    expect(m.triangles).toBeLessThanOrEqual(5000)
    expect(m.drawCalls).toBeLessThanOrEqual(4)
    expect(m.textures).toBe(0)
    expect(readFileSync(a).byteLength).toBeLessThanOrEqual(500_000)
  })

  it('takes the Dulag footprint by argument', async () => {
    const out = join(dir, 'dulag.glb')
    runBlenderScript(blenderScriptFor('hangar'), out, ['--width', '22', '--length', '28'])
    const bb = getBounds(findNode(await modelIO().readBinary(new Uint8Array(readFileSync(out))), 'hangar_steel'))
    within1pct(bb.max[0] - bb.min[0], 22, 'Dulag width')
    within1pct(bb.max[2] - bb.min[2], 28, 'Dulag length')
  })

  it('refuses bad arguments by name', () => {
    expect(() => runBlenderScript(blenderScriptFor('hangar'), join(dir, 'bad1.glb'), ['--width', '-5'])).toThrow(/--width must be > 0/)
    expect(() => runBlenderScript(blenderScriptFor('hangar'), join(dir, 'bad2.glb'), ['--length', 'abc'])).toThrow(/--length must be a number/)
  })
})
