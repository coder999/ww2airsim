import { sweep, type Profile } from '../../tests/sim/weapons/aaHarness.js'
import { AA_TUNING } from '../../src/sim/weapons/aaFire.js'

/** argv[4], e.g. '{"heavy":{"fuseErrorS":0.1}}', merges into AA_TUNING for this run only: how the numbers were found. */
const merge = (into: Record<string, unknown>, from: Record<string, unknown>): void => {
  for (const [k, v] of Object.entries(from)) {
    if (typeof v === 'object' && v !== null) merge(into[k] as Record<string, unknown>, v as Record<string, unknown>)
    else into[k] = v
  }
}
if (process.argv[4] !== undefined) merge(AA_TUNING as unknown as Record<string, unknown>, JSON.parse(process.argv[4]) as Record<string, unknown>)


/**
 * The M2 calibration sweep (docs/handoff/2026-10-10-m2-aa-fire.md): a scripted
 * Hellcat at 300 ft over an anchored Fletcher, orbit and straight pass, N seeds
 * each. Run it on ryzen:
 *
 *   REMOTE_RUN_OVERFLOW=0 remote-run npx tsx tools/ai/aaSweep.ts 16
 */
const seeds = Number(process.argv[2] ?? 16)
const ship = process.argv[3] ?? 'fletcher-dd'
for (const profile of (process.argv[5]?.split(',') ?? ['orbit', 'pass']) as Profile[]) {
  const s = sweep(profile, seeds, ship)
  const times = s.lostTimes.map((t) => t.toFixed(1)).join(' ')
  console.log(`${ship} ${profile}: lost ${s.lost}/${s.runs}, median ${s.medianLostS?.toFixed(1) ?? '-'} s, mean structure left ${s.meanStructure.toFixed(2)}, light hits ${s.meanLightHits.toFixed(1)}, bursts ${s.meanBursts.toFixed(1)} (${s.meanBurstsInRadius.toFixed(1)} in radius) [${times}]`)
}
