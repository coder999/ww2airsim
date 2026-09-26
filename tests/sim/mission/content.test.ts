import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import { worldFromScenario } from '../../../src/sim/scenario.js'
import { loadScenarioBundle } from '../../../tools/content/load.js'

const IDS = readdirSync(new URL('../../../content/scenarios/', import.meta.url))
  .filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort()

/** Spec 2026-09-25 §5: "Every scenario file parses; every tag and objective
 *  reference resolves." Resolution happens at world build (plan ruling R4),
 *  so this builds every shipped scenario, missions included once M3 adds
 *  them, on every run. */
describe('every shipped scenario', () => {
  it('is found (six before M3)', () => {
    expect(IDS.length).toBeGreaterThanOrEqual(6)
  })

  it.each(IDS)('%s builds, and has a mission exactly when it declares objectives', (id) => {
    const bundle = loadScenarioBundle(id)
    const world = worldFromScenario(bundle, null)
    expect(world.mission === null).toBe(bundle.scenario.objectives === undefined)
  })
})
