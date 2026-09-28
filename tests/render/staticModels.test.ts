import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { STATIC_MODELS, staticModelUrlFor } from '../../src/render/scene/staticModels.js'
import { staticModelPath, staticModelUrl } from '../../src/render/content.js'
import { loadModelEntries } from '../../tools/models/manifest.js'

const entries = loadModelEntries()

describe('the static-model registry (model-roster spec §4.3)', () => {
  it('every registered id has its manifest entry, writing to its own folder, and its committed glb', () => {
    for (const kind of ['building', 'vehicle'] as const) {
      for (const [id, { url }] of Object.entries(STATIC_MODELS[kind])) {
        const entry = entries.find((e) => e.id === id)
        expect(entry?.output, `${kind} ${id}`).toBe(staticModelPath(kind, id))
        expect(existsSync(staticModelPath(kind, id)), staticModelPath(kind, id)).toBe(true)
        expect(url).toBe(staticModelUrl(kind, id))
      }
    }
  })

  it('registers the hangar', () => {
    expect(staticModelUrlFor('building', 'hangar')).toBe(staticModelUrl('building', 'hangar'))
    expect(staticModelPath('vehicle', 'willys-mb-jeep')).toBe('content/vehicles/willys-mb-jeep.glb')
  })

  it('an unregistered or prototype-named id throws, naming the kind and the registry', () => {
    expect(() => staticModelUrlFor('building', 'nope')).toThrow(/no building model "nope" \(registered: [a-z0-9, -]*\bhangar\b[a-z0-9, -]*\)/)
    expect(() => staticModelUrlFor('vehicle', 'constructor')).toThrow(/no vehicle model "constructor" \(registered: [a-z0-9, -]*\btype97-chi-ha\b[a-z0-9, -]*\)/)
  })
})
