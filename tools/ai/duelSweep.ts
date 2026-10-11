import { duelSweep } from '../../tests/sim/weapons/duelHarness.js'
import { MAIN_BATTERY } from '../../src/sim/weapons/mainBattery.js'

/**
 * The M4 duel sweep (docs/handoff/2026-10-10-m4-main-batteries.md): pairs of warships on parallel
 * courses, main batteries on, N seeds each. Run it on ryzen:
 *
 *   REMOTE_RUN_OVERFLOW=0 remote-run npx tsx tools/ai/duelSweep.ts <seeds> <a:b@rangeM,...> ['<json override>']
 *
 * The override merges into MAIN_BATTERY for this run only: how the numbers were found.
 */
const merge = (into: Record<string, unknown>, from: Record<string, unknown>): void => {
  for (const [k, v] of Object.entries(from)) {
    if (typeof v === 'object' && v !== null) merge(into[k] as Record<string, unknown>, v as Record<string, unknown>)
    else into[k] = v
  }
}
if (process.argv[4] !== undefined) merge(MAIN_BATTERY as unknown as Record<string, unknown>, JSON.parse(process.argv[4]) as Record<string, unknown>)

const seeds = Number(process.argv[2] ?? 8)
const pairs = (process.argv[3] ?? 'fletcher-dd:kagero-dd@8000').split(',')
for (const p of pairs) {
  const [ships, range] = p.split('@') as [string, string]
  const [a, b] = ships.split(':') as [string, string]
  const s = duelSweep(a, b, Number(range), seeds, 1800)
  console.log(`${a} vs ${b} @ ${(Number(range) / 1609.34).toFixed(1)} mi: ${a} won ${s.aWins}, ${b} won ${s.bWins}, neither ${s.draws} of ${s.runs}; median sink ${s.medianSinkS?.toFixed(0) ?? '-'} s; hits to sink ${s.meanHitsToSink?.toFixed(1) ?? '-'}; hits/salvo ${s.hitsPerSalvoA.toFixed(3)} / ${s.hitsPerSalvoB.toFixed(3)}; mounts out ${s.meanMountsOut.toFixed(1)}`)
}
