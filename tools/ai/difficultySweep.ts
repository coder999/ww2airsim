import { readFileSync } from 'node:fs'
import { parseScenario } from '../../src/sim/scenario.js'
import { GREEN_SKILL, VETERAN_SKILL } from '../../src/sim/ai/pilot.js'
import { DIFFICULTIES, DIFFICULTY_SCALES, applyDifficulty, type Difficulty } from '../../src/sim/difficulty.js'
import { bundleForScenario } from '../content/load.js'
import { CURSORS_4, LOADOUTS, passiveClose, replicaWorld } from './replica.js'
import { sweep, type Profile } from '../../tests/sim/weapons/aaHarness.js'

/**
 * M5's measurement (docs/handoff/2026-10-10-m5-difficulty.md): at each difficulty,
 *   - E1's passive player (tests/render/aiLethality.test.ts item 1): the frozen tail chase, a veteran and
 *     a green pursuer, 4 loadouts x 4 noise cursors, each run ending at the kill or point-blank range;
 *   - M2's AA lethality (tests/sim/weapons/aaLethality.test.ts): orbit, pass and high over a Fletcher.
 *
 *   REMOTE_RUN_OVERFLOW=0 remote-run npx tsx tools/ai/difficultySweep.ts [seeds] [levels] ['<json scales>']
 *
 * argv[4] and after, e.g. '{"easy":{"aiAimError":2}}', each merge into DIFFICULTY_SCALES for one pass of the
 * sweep, in turn: how the shipped scales were found.
 */
const seeds = Number(process.argv[2] ?? 32)
const levels = (process.argv[3]?.split(',') ?? DIFFICULTIES) as Difficulty[]
const path = new URL('../../tests/fixtures/scenarios/pursuit-tail-chase.json', import.meta.url)
const tailChase = bundleForScenario(parseScenario(JSON.parse(readFileSync(path, 'utf8')) as unknown))

const median = (xs: readonly number[]): number | null => xs.length === 0 ? null : [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!
const s1 = (x: number | null): string => x === null ? '-' : x.toFixed(1)

for (const json of process.argv.length > 4 ? process.argv.slice(4) : ['{}']) {
for (const [d, v] of Object.entries(JSON.parse(json) as Record<string, object>)) Object.assign((DIFFICULTY_SCALES as Record<string, object>)[d]!, v)
for (const d of levels) {
  console.log(`== ${d} ${JSON.stringify(DIFFICULTY_SCALES[d])}`)
  for (const [name, skill] of [['veteran', VETERAN_SKILL], ['green', GREEN_SKILL]] as const) {
    const times: number[] = []
    let runs = 0, structure = 0
    for (const loadout of LOADOUTS) {
      for (const cursor of CURSORS_4) {
        runs++
        const r = passiveClose(applyDifficulty(replicaWorld(tailChase, loadout, cursor, skill), d), 'pursuer-1')
        structure += r.playerStructure
        if (r.outcome === 'killed') times.push(r.tick / 60)
      }
    }
    console.log(`passive v ${name}: killed ${times.length}/${runs}, median ${s1(median(times))} s, structure left ${(structure / runs).toFixed(2)} [${times.map((t) => t.toFixed(1)).join(' ')}]`)
  }
  for (const profile of ['orbit', 'pass', 'high'] as Profile[]) {
    const s = sweep(profile, seeds, 'fletcher-dd', d)
    console.log(`aa ${profile}: lost ${s.lost}/${s.runs}, median ${s1(s.medianLostS)} s, structure left ${s.meanStructure.toFixed(2)}`)
  }
}
}
