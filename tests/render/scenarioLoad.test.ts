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
    const viaFetch = await loadScenarioBundle('free-flight', diskFetch)
    expect(viaFetch).toEqual(loadViaNode('free-flight'))
  })

  it('fails loudly on a missing file, naming it', async () => {
    await expect(loadScenarioBundle('no-such-scenario', diskFetch)).rejects.toThrow(/no-such-scenario.*404/)
  })
})
