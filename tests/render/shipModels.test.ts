// tests/render/shipModels.test.ts
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { loadShipSpec } from '../../tools/content/load.js'
import { SHIP_MODELS, shipModelUrlFor } from '../../src/render/scene/shipModels.js'
import { shipModelUrl } from '../../src/render/content.js'

const shipIds = readdirSync('content/ships').filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort()
const libraryShipModels = readdirSync('content/library').filter((f) => f.endsWith('.json')).flatMap((f) => {
  const e = JSON.parse(readFileSync(`content/library/${f}`, 'utf8')) as { model?: { kind: string; id: string } }
  return e.model?.kind === 'ship' ? [e.model.id] : []
})
const registeredIds = [...new Set([...shipIds, ...libraryShipModels])].sort()

describe('the ship model registry (ship-models spec §3.1)', () => {
  it('every content/ships JSON that names a model names a registered one', () => {
    for (const id of shipIds) {
      const model = loadShipSpec(id).view?.model
      if (model !== undefined) expect(Object.hasOwn(SHIP_MODELS, model), `${id} names "${model}"`).toBe(true)
    }
  })

  it('every registered id is a ship spec or a Library comparison model, at its own content/ships URL', () => {
    for (const [id, { url }] of Object.entries(SHIP_MODELS)) {
      expect(registeredIds, id).toContain(id)
      expect(url).toBe(shipModelUrl(id))
    }
  })

  it('the complete ship roster plus its explicit comparison models names exactly the complete registry (R2)', () => {
    expect(registeredIds).toEqual(Object.keys(SHIP_MODELS).sort())
    expect(shipIds.map((id) => loadShipSpec(id).view?.model)).toEqual(shipIds)
  })

  it('an unregistered or prototype-named id throws, naming the registry', () => {
    expect(() => shipModelUrlFor('nope')).toThrow(new RegExp(`no ship model "nope" \\(registered: ${Object.keys(SHIP_MODELS).join(', ')}\\)`))
    expect(() => shipModelUrlFor('constructor')).toThrow(/no ship model "constructor"/)
  })
})
