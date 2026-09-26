import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { loadScenarioBundle } from '../../src/render/scenarioLoad.js'
import { loadScenarioBundle as loadViaNode } from '../../tools/content/load.js'

/** A fetch that serves the repo's content/ directory from disk. */
const diskFetch: typeof fetch = async (input) => {
  const url = String(input)
  const path = url.slice(url.indexOf('content/'))
  try {
    const body = readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
    return new Response(body, { status: 200 })
  } catch {
    return new Response('', { status: 404, statusText: 'Not Found' })
  }
}

/**
 * The browser loader and the Node loader are twins, and nothing but this
 * asserts they stay twins: `main.ts` boots through the first, every Tier 1
 * test reads the second, and a divergence would show up only in a browser --
 * as an airplane parked somewhere the suite never looks.
 */
describe('loadScenarioBundle (browser twin)', () => {
  it('loads the same bundle the Node loader does', async () => {
    for (const id of ['free-flight', 'pursuit-range']) {
      const viaFetch = await loadScenarioBundle(id, diskFetch)
      expect(viaFetch).toEqual(loadViaNode(id))
    }
  })

  it('fails loudly on a missing file, naming it', async () => {
    await expect(loadScenarioBundle('no-such-scenario', diskFetch)).rejects.toThrow(/no-such-scenario.*404/)
  })

  it('loads the specs a held group names (missions M1)', async () => {
    const heldScenario = {
      id: 'held-twin', player: 'f6f-1', airfields: ['tacloban'],
      aircraft: [{ id: 'f6f-1', spec: 'f6f-hellcat', airborneAt: { position: [0, 3000, 0], headingDeg: 90, speedMps: 120 } }],
      ships: [],
      weather: { windFromDeg: 0, windMps: 0 },
      objectives: [{ id: 'far', label: 'Far', priority: 'primary', kind: 'reach', point: { x: 90000, z: 90000 }, radiusM: 100 }],
      triggers: [{ id: 't', when: { at: 1 }, then: [{ spawn: 'escort' }] }],
      heldGroups: [{ id: 'escort', ships: [{ id: 'dd-9', spec: 'fletcher-dd', waypoints: [[-24000, -9000], [-23000, -9000]], speedMps: 7 }] }],
    }
    const withHeld: typeof fetch = async (input) =>
      String(input).endsWith('scenarios/held-twin.json') ? new Response(JSON.stringify(heldScenario), { status: 200 }) : diskFetch(input)
    const bundle = await loadScenarioBundle('held-twin', withHeld)
    expect(Object.keys(bundle.shipSpecs)).toEqual(['fletcher-dd'])
  })
})
