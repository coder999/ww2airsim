/**
 * Regenerates tests/sim/golden/f6f-rolling-descent.golden.json.
 *
 * Ruling R7: this is a committed script rather than an `npx tsx --eval "..."`
 * one-liner, because relative `.js` specifiers inside an `--eval` string are
 * fragile. Run with `npx tsx tools/golden/generate.ts`.
 *
 * Only run this deliberately, after eyeballing the new trajectory for
 * plausibility (see the sanity checks the task report records) -- committing
 * a regenerated golden without checking it locks in whatever the model just
 * did, sane or not.
 */
import { writeFileSync } from 'node:fs'
import { loadAircraftSpec } from '../content/load.js'
import { recordTrajectory } from './record.js'

const t = recordTrajectory(loadAircraftSpec('f6f-hellcat'))
const outPath = new URL('../../tests/sim/golden/f6f-rolling-descent.golden.json', import.meta.url)
writeFileSync(outPath, JSON.stringify(t, null, 2) + '\n')
console.log('checkpoints:', t.checkpoints.length, 'engine:', t.engine)
