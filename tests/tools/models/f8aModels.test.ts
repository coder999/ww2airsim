// tests/tools/models/f8aModels.test.ts
/**
 * F8A Task 0 (2026-10-16): the four new buildings are registered, provenanced and light-free. Bounds, ground
 * origin, budget and z-fighting are buildingModels.test.ts's; the byte-identical rebuild of these and of every
 * pre-existing model (none was touched) is blenderEntries.test.ts's.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadModelEntries } from '../../../tools/models/manifest.js'
import { STATIC_MODELS } from '../../../src/render/scene/staticModels.js'
import { nodeHangarContent } from '../../render/hangar/content.js'

const IDS = ['quonset-hut-20x48', 'pontoon-pier-segment', 'jinamoc-seaplane-ramp', 'ormoc-customs-building']
const entries = loadModelEntries()
const assets = readFileSync('ASSETS.md', 'utf8')

describe.each(IDS.map((id) => [id]))('F8A model %s', (id) => {
  it('is a registered building with a Library entry, an ASSETS.md row and an ESTIMATE-labeled provenance', () => {
    expect(Object.keys(STATIC_MODELS.building)).toContain(id)
    const e = entries.find((x) => x.id === id)!
    expect(e.output).toBe(`content/buildings/${id}.glb`)
    expect(e.source.kind === 'blender' && e.source.dimensions).toMatch(/ESTIMATE/)
    expect(assets).toContain(`\`content/buildings/${id}.glb\``)
    const lib = nodeHangarContent().library.find((x) => x.id === id)!
    expect(lib.kind).toBe('building')
    expect(lib.sources.length).toBeGreaterThan(0)
  })
})

it('the customs building has no light: no lamp roles in its script or glb', () => {
  const src = readFileSync('tools/models/blender/ormoc-customs-building.py', 'utf8')
  expect(src).not.toMatch(/warmLight|signalRed/)
  expect(readFileSync('content/buildings/ormoc-customs-building.glb').includes('warmLight')).toBe(false)
})
