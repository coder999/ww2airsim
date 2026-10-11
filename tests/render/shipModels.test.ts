// tests/render/shipModels.test.ts
import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync } from 'node:fs'
import { loadShipSpec } from '../../tools/content/load.js'
import { loadModelEntries } from '../../tools/models/manifest.js'
import { SHIP_MODELS, shipModelUrlFor } from '../../src/render/scene/shipModels.js'
import { shipModelUrl } from '../../src/render/content.js'

const shipIds = readdirSync('content/ships').filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort()

describe('the ship model registry (ship-models spec §3.1)', () => {
  it('every content/ships JSON that names a model names a registered one', () => {
    for (const id of shipIds) {
      const model = loadShipSpec(id).view?.model
      if (model !== undefined) expect(Object.hasOwn(SHIP_MODELS, model), `${id} names "${model}"`).toBe(true)
    }
  })

  it('every registered id has its own model entry and committed content/ships glb', () => {
    const entries = loadModelEntries()
    for (const [id, { url }] of Object.entries(SHIP_MODELS)) {
      expect(url).toBe(shipModelUrl(id))
      expect(entries.some((e) => e.id === id && e.output === `content/ships/${id}.glb`), id).toBe(true)
      expect(existsSync(`content/ships/${id}.glb`), id).toBe(true)
    }
  })

  it('the complete simulation ship roster names its like-named registered models (R2)', () => {
    expect(shipIds.map((id) => loadShipSpec(id).view?.model)).toEqual(shipIds)
    expect(shipIds.every((id) => Object.hasOwn(SHIP_MODELS, id))).toBe(true)
  })

  it('an unregistered or prototype-named id throws, naming the registry', () => {
    expect(() => shipModelUrlFor('nope')).toThrow(new RegExp(`no ship model "nope" \\(registered: ${Object.keys(SHIP_MODELS).join(', ')}\\)`))
    expect(() => shipModelUrlFor('constructor')).toThrow(/no ship model "constructor"/)
  })
})
