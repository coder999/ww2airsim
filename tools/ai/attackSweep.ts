import { runAttack, type AttackOptions } from '../../tests/sim/ai/attackHarness.js'
import type { AttackKind } from '../../src/sim/ai/pilot.js'

/**
 * The E2 calibration sweep (docs/handoff/2026-10-10-e2-attack-ai.md): one raider per seed attacks an
 * anchored ship on a flat sea, AA stripped. Run it on ryzen:
 *
 *   REMOTE_RUN_OVERFLOW=0 remote-run npx tsx tools/ai/attackSweep.ts dive-bomb d3a-val 16
 *   args: kind spec seeds [target] [shipSpeed] [altitude] [speed] [aa]
 */
const [kind, spec, seedsArg, target, shipSpeed, alt, speed, aa] = process.argv.slice(2)
const seeds = Number(seedsArg ?? 8)
for (const skill of ['veteran', 'green'] as const) {
  const runs = Array.from({ length: seeds }, (_, seed) => {
    const o: AttackOptions = {
      kind: kind as AttackKind, spec: spec!, skill, seed: seed + 1,
      ...(target !== undefined && target !== '-' ? { target } : {}),
      ...(shipSpeed !== undefined ? { shipSpeedMps: Number(shipSpeed) } : {}),
      ...(alt !== undefined ? { altitudeM: Number(alt) } : {}),
      ...(speed !== undefined ? { speedMps: Number(speed) } : {}),
      ...(aa === 'aa' ? { aa: true } : {}),
    }
    return runAttack(o)
  })
  const hits = runs.filter((r) => r.hit).length
  const med = (xs: number[]): number => (xs.length === 0 ? NaN : [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!)
  const rel = runs.flatMap((r) => r.releases)
  console.log(`${spec} ${kind} ${skill}: hit ${hits}/${runs.length} (direct ${runs.filter((r) => r.direct > 0).length}), released ${rel.length}, median miss ${med(runs.flatMap((r) => [...r.impactMissM])).toFixed(0)} m, release height ${med(rel.map((r) => r.heightM)).toFixed(0)} m, speed ${med(rel.map((r) => r.speedMps)).toFixed(0)} m/s, min height ${Math.min(...runs.map((r) => r.minHeightM)).toFixed(0)} m, lost ${runs.filter((r) => r.lostS !== null).length}, end ${[...new Set(runs.map((r) => r.endPhase))].join('/')}`)
  console.log('  misses', runs.map((r) => r.impactMissM.map((m) => m.toFixed(0)).join('+') || '-').join(' '))
  console.log('  minH  ', runs.map((r) => r.minHeightM.toFixed(0)).join(' '))
}
