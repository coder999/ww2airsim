import { performance } from 'node:perf_hooks'
import { loadScenarioBundle } from '../content/load.js'
import { canonicalStringify, sha256 } from '../../src/flightRecorder/canonical.js'
import { encodeFlightRecord } from '../../src/flightRecorder/codec.js'
import { createDevFlightRecorder, type FlightRecordHeader } from '../../src/flightRecorder/recorder.js'
import { verifyFlightRecord } from '../../src/flightRecorder/verify.js'
import { DT } from '../../src/sim/flight/model.js'
import { advance, type World } from '../../src/sim/loop.js'
import { worldFromScenario } from '../../src/sim/scenario.js'

const TICKS = 60 * 60
const CASES = [
  { id: 'free-flight', label: 'takeoff/free flight' },
  { id: 'furball-range', label: 'combat' },
  { id: 'airfield-strike', label: 'mission/debrief' },
] as const

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]!
}

const run = (initial: World<undefined>, observe?: Parameters<typeof advance<undefined>>[6]): { world: World<undefined>; ms: number; peakHeap: number } => {
  let world = initial
  let peakHeap = process.memoryUsage().heapUsed
  const started = performance.now()
  for (let i = 0; i < TICKS; i++) {
    world = advance(world, DT, undefined, undefined, false, undefined, observe).world
    if (i % 60 === 0) peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed)
  }
  return { world, ms: performance.now() - started, peakHeap }
}

const results = []
for (const entry of CASES) {
  const bundle = loadScenarioBundle(entry.id)
  const contentHash = await sha256(bundle)
  const initial = worldFromScenario(bundle, null, 'clean')
  run(initial) // one warm pass keeps import/JIT cost out of the comparison
  const header: FlightRecordHeader = {
    build: { id: 'measurement', dirty: true },
    content: { scenarioId: entry.id, sha256: contentHash },
    launch: {
      aircraftSpec: initial.aircraft.find((aircraft) => aircraft.id === initial.player)!.spec.id,
      loadout: 'clean', timeOfDay: 12, weather: bundle.scenario.weather,
      difficulty: 'veteran', assists: { stallLimiter: false, autoRudder: false },
      arcadeDamage: false, dev: { measurement: true },
    },
    environment: { browser: 'node', os: process.platform, gpu: 'headless', graphics: {} },
  }
  const baselineRuns = Array.from({ length: 5 }, () => run(initial).ms)
  const recordedRuns: number[] = []
  let record = createDevFlightRecorder(header, initial).finish(initial)
  let peakHeapDeltaBytes = 0
  for (let sample = 0; sample < 5; sample++) {
    const recorder = createDevFlightRecorder(header, initial)
    const heapStart = process.memoryUsage().heapUsed
    const recorded = run(initial, recorder.observe)
    recordedRuns.push(recorded.ms)
    peakHeapDeltaBytes = Math.max(peakHeapDeltaBytes, recorded.peakHeap - heapStart)
    record = recorder.finish(recorded.world, entry.label === 'mission/debrief' ? { headline: 'MEASUREMENT COMPLETE' } : null)
  }
  const baselineMs = median(baselineRuns)
  const recordedMs = median(recordedRuns)
  const exportStart = performance.now()
  const compressed = await encodeFlightRecord(record)
  const exportMs = performance.now() - exportStart
  const verifyStart = performance.now()
  const verification = verifyFlightRecord(record, initial, { buildId: 'measurement', contentSha256: contentHash })
  const verifyMs = performance.now() - verifyStart
  if (!verification.ok) throw new Error(`${entry.id}: ${verification.message}`)
  results.push({
    scenario: entry.id,
    role: entry.label,
    simulatedSeconds: TICKS * DT,
    packets: record.packets.length,
    compressedBytesPerMinute: compressed.byteLength,
    retainedJsonBytes: Buffer.byteLength(canonicalStringify(record)),
    peakHeapDeltaBytes: Math.max(0, peakHeapDeltaBytes),
    exportMs: Number(exportMs.toFixed(2)),
    verificationMs: Number(verifyMs.toFixed(2)),
    verificationRealtimeMultiple: Number(((TICKS * DT * 1000) / verifyMs).toFixed(1)),
    baselineSimMsMedian5: Number(baselineMs.toFixed(2)),
    recordedSimMsMedian5: Number(recordedMs.toFixed(2)),
    devOverheadMsPerSimMinute: Number((recordedMs - baselineMs).toFixed(2)),
    devOverheadPercent: Number((((recordedMs / baselineMs) - 1) * 100).toFixed(1)),
  })
}

console.log(JSON.stringify({ measuredAt: new Date().toISOString(), ticksPerCase: TICKS, results }, null, 2))
