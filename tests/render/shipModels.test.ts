// tests/render/shipModels.test.ts
import { describe, expect, it } from 'vitest'
import { readdirSync } from 'node:fs'
import { loadShipSpec } from '../../tools/content/load.js'
import { loadModelEntries } from '../../tools/models/manifest.js'
import { SHIP_MODELS, shipModelUrlFor } from '../../src/render/scene/shipModels.js'
import { shipModelUrl } from '../../src/render/content.js'

const shipIds = readdirSync('content/ships').filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort()
const displayOnlyIds = ['zuikaku-cv-blender']

describe('the ship model registry (ship-models spec §3.1)', () => {
  it('every content/ships JSON that names a model names a registered one', () => {
    for (const id of shipIds) {
      const model = loadShipSpec(id).view?.model
      if (model !== undefined) expect(Object.hasOwn(SHIP_MODELS, model), `${id} names "${model}"`).toBe(true)
    }
  })

  it('every registered id has its own model entry and content/ships URL', () => {
    const entryIds = loadModelEntries().map((e) => e.id)
    for (const [id, { url }] of Object.entries(SHIP_MODELS)) {
      expect(entryIds, id).toContain(id)
      expect(url).toBe(shipModelUrl(id))
    }
  })

  it('the complete ship roster names its registry models, beside the pinned Hangar-only duplicate', () => {
    expect(Object.keys(SHIP_MODELS).sort()).toEqual([...shipIds, ...displayOnlyIds].sort())
    expect(shipIds.map((id) => loadShipSpec(id).view?.model)).toEqual(shipIds)
  })

  it('an unregistered or prototype-named id throws, naming the registry', () => {
    expect(() => shipModelUrlFor('nope')).toThrow(new RegExp(`no ship model "nope" \\(registered: ${Object.keys(SHIP_MODELS).join(', ')}\\)`))
    expect(() => shipModelUrlFor('constructor')).toThrow(/no ship model "constructor"/)
  })
})
