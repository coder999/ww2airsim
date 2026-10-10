import { GEOMETRIES, sweepPasses, type Geometry, type GunnerSkill } from '../../tests/sim/weapons/gunnerHarness.js'
import { GUNNER_TUNING } from '../../src/sim/weapons/gunners.js'

/** argv[3], e.g. '{"aimErrorScale":1.5}', merges into GUNNER_TUNING for this run only: how the numbers were found. */
const merge = (into: Record<string, unknown>, from: Record<string, unknown>): void => {
  for (const [k, v] of Object.entries(from)) {
    if (typeof v === 'object' && v !== null) merge(into[k] as Record<string, unknown>, v as Record<string, unknown>)
    else into[k] = v
  }
}
if (process.argv[3] !== undefined && process.argv[3] !== '') merge(GUNNER_TUNING as unknown as Record<string, unknown>, JSON.parse(process.argv[3]) as Record<string, unknown>)

/**
 * The E3 calibration sweep (docs/handoff/2026-10-10-e3-bombers-gunners.md): a scripted Hellcat's pass on a
 * B-17 (alone, then leading four), per geometry and gunner skill, N seeds each. Run it on ryzen:
 *
 *   REMOTE_RUN_OVERFLOW=0 remote-run npx tsx tools/ai/gunnerSweep.ts 16 '' astern,high-side,head-on
 */
const seeds = Number(process.argv[2] ?? 16)
const geometries = (process.argv[4]?.split(',') ?? GEOMETRIES) as Geometry[]
const setups = process.argv[5]?.split(',') ?? ['single', 'formation']
console.log('| Target | Geometry | Gunners | Hits taken, mean (median) | Lost | In range, s | Salvos |')
console.log('| --- | --- | --- | --- | --- | --- | --- |')
for (const setup of setups) {
  for (const g of geometries) {
    for (const skill of ['green', 'veteran'] as GunnerSkill[]) {
      const s = sweepPasses(g, skill, seeds, setup === 'formation')
      console.log(`| ${setup === 'formation' ? 'four B-17s' : 'one B-17'} | ${g} | ${skill} | ${s.meanHits.toFixed(1)} (${s.medianHits.toFixed(1)}) | ${s.lost}/${s.runs} | ${s.meanExposedS.toFixed(1)} | ${s.meanSalvos.toFixed(0)} |`)
    }
  }
}
