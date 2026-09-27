import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { loadModelEntries } from '../../../tools/models/manifest.js'
import { Group } from 'three'
import { modelSource, parseProvenance, provenanceForUrl, provenanceText } from '../../../src/render/hangar/provenance.js'

const entryFiles = (): Record<string, unknown> => Object.fromEntries(
  readdirSync('tools/models/entries').filter((f) => f.endsWith('.json'))
    .map((f) => [`/tools/models/entries/${f}`, JSON.parse(readFileSync(`tools/models/entries/${f}`, 'utf8')) as unknown]),
)

describe('parseProvenance (the Hangar card\'s Model row)', () => {
  it("has a row for every entry the build knows, and a download's author and URL are the build's own", () => {
    const table = parseProvenance(entryFiles())
    const entries = loadModelEntries()
    expect([...table.keys()].sort()).toEqual(entries.map((e) => e.output).sort())
    for (const e of entries) {
      const p = table.get(e.output)!
      if (e.source.kind === 'sketchfab') expect(p, e.output).toEqual({ kind: 'sketchfab', author: e.source.author, url: e.source.url, license: e.source.license })
      else expect(p, e.output).toEqual({ kind: e.source.kind, license: e.source.license })
    }
  })

  it('says which R3 aircraft are downloads and which are original Blender models', () => {
    const table = parseProvenance(entryFiles())
    const kind = (id: string): string => provenanceForUrl(table, `/content/aircraft/${id}.glb`)!.kind
    for (const id of ['a6m2-zero', 'f6f-hellcat', 'f4u-corsair', 'ki-43-oscar', 'd3a-val', 'g4m-betty', 'b-17-flying-fortress']) expect(kind(id), id).toBe('sketchfab')
    for (const id of ['ki-84-frank', 'ki-21-sally', 'b-29-superfortress', 'p-38-lightning']) expect(kind(id), id).toBe('blender')
  })

  it('reads as a person would say it', () => {
    const table = parseProvenance(entryFiles())
    expect(provenanceText(provenanceForUrl(table, 'content/aircraft/f4u-corsair.glb')!)).toBe('Sketchfab download by manilov.ap (CC BY 4.0)')
    expect(provenanceText(provenanceForUrl(table, 'content/aircraft/ki-84-frank.glb')!)).toBe('Original Blender model (AGPL-3.0-or-later)')
    expect(provenanceText(provenanceForUrl(table, 'content/ordnance/hvar.glb')!)).toBe('Original model generated in code (AGPL-3.0-or-later)')
    expect(provenanceText({ kind: 'sketchfab', author: 'a', url: 'https://sketchfab.com/3d-models/x', license: 'CC0-1.0' })).toBe('Sketchfab download by a (CC0)')
  })

  it("credits the airframe, not the stores hung on it; a model with no file is drawn in code", () => {
    const table = parseProvenance(entryFiles())
    const tagged = (url: string): Group => { const g = new Group(); g.userData.modelUrl = url; return g }
    const plane = new Group(); plane.add(tagged('/content/ordnance/hvar.glb'), tagged('/content/aircraft/wildcat.glb'))
    expect(modelSource(plane, table)).toMatchObject({ kind: 'sketchfab', author: 'rojatsu' })
    const store = new Group(); store.add(tagged('/content/ordnance/hvar.glb'))
    expect(modelSource(store, table)).toMatchObject({ kind: 'generated' })
    expect(modelSource(new Group(), table)).toBe('code')
  })

  it('finds nothing for an unknown URL, and names the file when an entry has no source', () => {
    expect(provenanceForUrl(parseProvenance(entryFiles()), '/content/aircraft/nope.glb')).toBeNull()
    expect(() => parseProvenance({ '/tools/models/entries/x.json': { output: 'content/ships/x.glb' } })).toThrow(/x\.json/)
  })
})
