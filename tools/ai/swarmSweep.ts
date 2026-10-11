import { Session } from 'node:inspector/promises'
import { swarmWorld, timeTicks } from '../../tests/sim/swarmHarness.js'
import { groundTruthTerrain } from '../../tests/pilot/rangePass.js'
import { stepChecked } from '../../src/sim/invariants.js'
import { step } from '../../src/sim/flight/model.js'
import type { Swarm, SwarmLayout } from '../../src/sim/swarm.js'

/**
 * Sim cost per tick against entity count, headless (entity-scaling plan 2026-10-10; results in
 * docs/handoff/2026-10-10-entity-scaling.md). Builds the capture's world (`swarmWorld`) over the real
 * terrain and times single `advance` ticks. Run it on ryzen:
 *
 *   REMOTE_RUN_OVERFLOW=0 remote-run npx tsx tools/ai/swarmSweep.ts [seconds=30] [reps=3] [--checked] [--profile]
 *
 * Each point is the median over `reps` interleaved repeats (the world is deterministic, so repeats differ
 * only by the machine). `--checked` times the DEV stepper (`stepChecked`) instead of production's `step`.
 * `--profile` adds a CPU profile of the 60-aircraft, 20-ship points, self time summed by function.
 */
const args = process.argv.slice(2)
const flags = new Set(args.filter((a) => a.startsWith('--')))
const [seconds = 30, reps = 3] = args.filter((a) => !a.startsWith('--')).map(Number)
const stepper = flags.has('--checked') ? stepChecked : step
const ticks = Math.round(seconds * 60)
const terrain = groundTruthTerrain()

const POINTS: readonly (readonly [number, number])[] = [
  [0, 0], [5, 0], [10, 0], [20, 0], [30, 0], [45, 0], [60, 0],
  [0, 2], [0, 5], [0, 10], [0, 15], [0, 20],
  [30, 10], [60, 20],
]
const LAYOUTS: readonly SwarmLayout[] = ['tight', 'mission']
const median = (xs: readonly number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!
const pct = (xs: readonly number[], p: number): number => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))]!

type Row = { mean: number; p50: number; p95: number; max: number; down: number; rounds: number }
function measure(swarm: Swarm): Row {
  const { world, god } = swarmWorld(swarm, terrain)
  const warm = timeTicks(world, god, 120, stepper).world
  const { msPerTick, world: end } = timeTicks(warm, god, ticks, stepper)
  const rounds = end.combat.projectiles.length
  const down = Object.values(end.combat.aircraft).filter((r) => r.damage.destroyedAt !== null).length
  return { mean: msPerTick.reduce((s, x) => s + x, 0) / msPerTick.length, p50: pct(msPerTick, 0.5), p95: pct(msPerTick, 0.95), max: Math.max(...msPerTick), down, rounds }
}

measure({ aircraft: 30, ships: 10, layout: 'tight' }) // JIT warm-up, discarded
const results = new Map<string, Row[]>()
for (let r = 0; r < reps; r++) {
  for (const layout of LAYOUTS) for (const [aircraft, ships] of POINTS) {
    const key = `${layout} ${aircraft} ${ships}`
    results.set(key, [...(results.get(key) ?? []), measure({ aircraft, ships, layout })])
  }
}
console.log(`swarmSweep: ${seconds} s of sim per point after 2 s warm-up, median of ${reps}, stepper=${flags.has('--checked') ? 'stepChecked' : 'step'}, node ${process.version}`)
console.log('| Layout | Aircraft | Ships | ms/tick mean | p50 | p95 | max | 3x ms per 120 Hz frame | 3x ms per 60 Hz frame | down at end | rounds in flight |')
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')
for (const [key, rows] of results) {
  const [layout, aircraft, ships] = key.split(' ')
  const m = (f: (r: Row) => number): number => median(rows.map(f))
  const mean = m((r) => r.mean)
  console.log(`| ${layout} | ${aircraft} | ${ships} | ${mean.toFixed(3)} | ${m((r) => r.p50).toFixed(3)} | ${m((r) => r.p95).toFixed(3)} | ${m((r) => r.max).toFixed(2)} | ${(1.5 * mean).toFixed(2)} | ${(3 * mean).toFixed(2)} | ${m((r) => r.down)} | ${m((r) => r.rounds)} |`)
}

if (flags.has('--profile')) {
  type Node = { id: number; callFrame: { functionName: string; url: string; lineNumber: number }; children?: number[] }
  const session = new Session()
  session.connect()
  for (const layout of LAYOUTS) {
    await session.post('Profiler.enable')
    await session.post('Profiler.start')
    measure({ aircraft: 60, ships: 20, layout })
    const { profile } = await session.post('Profiler.stop') as unknown as { profile: { nodes: Node[]; samples: number[] } }
    const byId = new Map(profile.nodes.map((n) => [n.id, n]))
    const self = new Map<string, number>()
    for (const id of profile.samples) {
      const f = byId.get(id)!.callFrame
      // tsx strips line numbers (every frame reads line 1), so a function is its name and file.
      const name = `${f.functionName || '(anonymous)'}\t${f.url === '' ? '(native)' : f.url.replace(/^.*\/(src|node_modules)\//, '$1/')}`
      self.set(name, (self.get(name) ?? 0) + 1)
    }
    const total = profile.samples.length
    const byFile = new Map<string, number>()
    for (const [name, n] of self) { const file = name.split('\t')[1]!; byFile.set(file, (byFile.get(file) ?? 0) + n) }
    console.log(`\nprofile ${layout} 60+20: ${total} samples; self time by file, then by function (top 25)`)
    for (const [file, n] of [...byFile].sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`  ${(100 * n / total).toFixed(1).padStart(5)}%  ${file}`)
    for (const [name, n] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${(100 * n / total).toFixed(1).padStart(5)}%  ${name.replace('\t', '  ')}`)
  }
  session.disconnect()
}
