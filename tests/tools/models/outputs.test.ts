// tests/tools/models/outputs.test.ts
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { checkOutput } from '../../../tools/models/build.js'
import { loadModelEntries } from '../../../tools/models/manifest.js'
import { modelIO } from '../../../tools/models/document.js'
import { measureDocument } from '../../../tools/models/measure.js'

const LICENSE_LABEL = { 'CC-BY-4.0': 'CC-BY 4.0', 'CC0-1.0': 'CC0 1.0' } as const
const entries = loadModelEntries()
const assets = readFileSync('ASSETS.md', 'utf8')

describe.each(entries.map((e) => [e.id, e] as const))('committed output %s', (_id, entry) => {
  it('exists, and meets its entry: budget, parts, extensions, materials, texture size, nose', async () => {
    expect(existsSync(entry.output), `${entry.output} is not committed`).toBe(true)
    const doc = await modelIO().readBinary(new Uint8Array(readFileSync(entry.output)))
    expect(checkOutput(doc, statSync(entry.output).size, entry)).toEqual([])
  })

  it('carries its provenance inside the file', async () => {
    const doc = await modelIO().readBinary(new Uint8Array(readFileSync(entry.output)))
    const extras = doc.getRoot().getAsset().extras as Record<string, unknown>
    if (entry.source.kind === 'generated' || entry.source.kind === 'blender') {
      expect(extras).toMatchObject({ source: entry.source.kind, license: 'AGPL-3.0-or-later' })
      if (entry.source.kind === 'generated') {
        expect(extras).toMatchObject({ generator: entry.source.generator })
      } else {
        expect(extras).toMatchObject({ script: entry.source.script })
      }
    } else {
      expect(extras['source']).toBe(entry.source.url)
      expect(String(extras['license'])).toMatch(new RegExp(`^${entry.source.license}`))
    }
  })

  it('has an ASSETS.md 3D-models row naming the same source and license', () => {
    const row = assets.split('\n').find((l) => l.startsWith(`| \`${entry.output}\` |`))
    expect(row, `no ASSETS.md row for ${entry.output}`).toBeDefined()
    if (entry.source.kind === 'generated') {
      expect(row).toContain(entry.source.generator)
      expect(row).toContain('AGPL-3.0-or-later')
    } else if (entry.source.kind === 'blender') {
      expect(row).toContain(entry.source.script)
      expect(row).toContain('AGPL-3.0-or-later')
    } else {
      expect(row).toContain(entry.source.url)
      expect(row).toContain(LICENSE_LABEL[entry.source.license])
    }
  })
})

describe('the Wildcat specifically', () => {
  it('keeps its one baked clip, which wildcat.ts reads gear poses from', async () => {
    const doc = await modelIO().readBinary(new Uint8Array(readFileSync('content/aircraft/wildcat.glb')))
    expect(measureDocument(doc).animations).toBe(1)
  })
})
