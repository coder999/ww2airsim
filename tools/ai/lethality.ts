import { readFileSync } from 'node:fs'
import { parseScenario } from '../../src/sim/scenario.js'
import { VETERAN_SKILL } from '../../src/sim/ai/pilot.js'
import { bundleForScenario } from '../content/load.js'
import { LOADOUTS, passiveClose, replicaWorld } from './replica.js'

/**
 * The 128-run version of tests/render/aiLethality.test.ts item 1 (7c spec
 * §3.1): 4 loadouts x 32 noise cursors (k * 7919, k = 0..31), a passive
 * player on the frozen tail-chase fixture, each run ending at point-blank
 * range or the player's death. About 36 s, too slow for the suite.
 *
 *   npx tsx tools/ai/lethality.ts            # VETERAN_SKILL as shipped
 *   npx tsx tools/ai/lethality.ts 0.02       # override controlNoise
 */
const path = new URL('../../tests/fixtures/scenarios/pursuit-tail-chase.json', import.meta.url)
const bundle = bundleForScenario(parseScenario(JSON.parse(readFileSync(path, 'utf8')) as unknown))
const noise = process.argv[2] === undefined ? VETERAN_SKILL.controlNoise : Number(process.argv[2])
const skill = { ...VETERAN_SKILL, controlNoise: noise }
let killed = 0, runs = 0, hits = 0, maxHits = 0
for (const loadout of LOADOUTS) {
  for (let k = 0; k < 32; k++) {
    const r = passiveClose(replicaWorld(bundle, loadout, k * 7919, skill), 'pursuer-1')
    runs++; hits += r.pursuerHits; maxHits = Math.max(maxHits, r.pursuerHits)
    if (r.outcome === 'killed') killed++
  }
}
console.log(`controlNoise ${noise}: killed ${killed}/${runs}, mean hits ${(hits / runs).toFixed(2)}, max ${maxHits}`)
