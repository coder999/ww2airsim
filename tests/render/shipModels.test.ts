// tests/render/shipModels.test.ts
import { describe, expect, it } from 'vitest'
import { readdirSync } from 'node:fs'
import { loadShipSpec } from '../../tools/content/load.js'
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

  it('every registered id is its own spec id, at its own content/ships URL (spec §3.2)', () => {
    for (const [id, { url }] of Object.entries(SHIP_MODELS)) {
      expect(shipIds, id).toContain(id)
      expect(url).toBe(shipModelUrl(id))
    }
  })

  it('the three shipped specs name their models (S1)', () => {
    expect(['essex-cv', 'fletcher-dd', 'type-b-maru'].map((id) => loadShipSpec(id).view?.model)).toEqual(['essex-cv', 'fletcher-dd', 'type-b-maru'])
  })

  it('an unregistered or prototype-named id throws, naming the registry', () => {
    expect(() => shipModelUrlFor('nope')).toThrow(/no ship model "nope" \(registered: essex-cv, fletcher-dd, type-b-maru\)/)
    expect(() => shipModelUrlFor('constructor')).toThrow(/no ship model "constructor"/)
  })
})
