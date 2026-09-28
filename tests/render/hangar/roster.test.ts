import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { buildCatalog, drawable } from '../../../src/render/hangar/catalog.js'
import type { ModelRef } from '../../../src/render/hangar/library.js'
import { AIRFRAME_MODELS } from '../../../src/render/scene/airframes.js'
import { SHIP_MODELS } from '../../../src/render/scene/shipModels.js'
import { STATIC_MODELS } from '../../../src/render/scene/staticModels.js'
import { loadModelEntries, type ModelEntry } from '../../../tools/models/manifest.js'
import { nodeHangarContent } from './content.js'

/**
 * Library entries the Hangar cannot draw yet (model-roster spec §1: "done is an assertion").
 * Each roster plan removes the entries it models and lowers CEILING to match; R4 took the
 * buildings off; R5 deletes both. The list may shrink, never grow.
 */
const NOT_YET_DRAWN = [
  'willys-mb-jeep',
]
const CEILING = 1

const FOLDER: Readonly<Record<ModelRef['kind'], string>> = {
  aircraft: 'content/aircraft/', ship: 'content/ships/', building: 'content/buildings/', vehicle: 'content/vehicles/',
}

/** Why `ref` does not resolve to a registered model with its manifest entry and committed glb; null if it does. */
function refProblem(ref: ModelRef, entries: readonly ModelEntry[]): string | null {
  const registered = ref.kind === 'aircraft' ? Object.hasOwn(AIRFRAME_MODELS, ref.id)
    : ref.kind === 'ship' ? Object.hasOwn(SHIP_MODELS, ref.id)
      : Object.hasOwn(STATIC_MODELS[ref.kind], ref.id)
  if (!registered) return `${ref.kind} model "${ref.id}" is not registered`
  const entry = entries.find((e) => e.id === ref.id)
  if (!entry) return `${ref.kind} model "${ref.id}" has no tools/models/entries/${ref.id}.json`
  if (!entry.output.startsWith(FOLDER[ref.kind])) return `${ref.kind} model "${ref.id}" writes ${entry.output}, not under ${FOLDER[ref.kind]}`
  if (!existsSync(entry.output)) return `${entry.output} is not committed`
  return null
}

const content = nodeHangarContent()
const catalog = buildCatalog(content)
const entries = loadModelEntries()

describe('the roster is done when this list is empty (model-roster spec §1)', () => {
  it('exactly the allowlisted entries are the ones the Hangar cannot draw', () => {
    expect(catalog.filter((e) => !drawable(e)).map((e) => e.library.id).sort()).toEqual([...NOT_YET_DRAWN].sort())
  })

  it('the allowlist never grows', () => {
    expect(NOT_YET_DRAWN.length).toBeLessThanOrEqual(CEILING)
  })

  it('no Library building is left on it (R4)', () => {
    const kind = new Map(content.library.map((e) => [e.id, e.kind]))
    expect(NOT_YET_DRAWN.filter((id) => kind.get(id) === 'building')).toEqual([])
  })
})

describe("every Library entry's own model resolves (spec §4.3)", () => {
  it.each(content.library.filter((e) => e.model !== undefined).map((e) => [e.id, e.model!] as const))('%s', (_id, ref) => {
    expect(refProblem(ref, entries)).toBeNull()
  })

  it('names what is wrong with a bad reference', () => {
    expect(refProblem({ kind: 'building', id: 'nope' }, entries)).toBe('building model "nope" is not registered')
    expect(refProblem({ kind: 'vehicle', id: 'hangar' }, entries)).toBe('vehicle model "hangar" is not registered')
    expect(refProblem({ kind: 'aircraft', id: 'constructor' }, entries)).toBe('aircraft model "constructor" is not registered')
  })

  it('every ship Library entry resolves through its authoritative ShipSpec', () => {
    for (const e of content.library.filter((entry) => entry.kind === 'ship')) {
      expect(e.spec, e.id).toBe(e.id)
      expect(drawable(catalog.find((entry) => entry.library.id === e.id)!)).toBe(true)
    }
  })
})
