import { describe, it, expect } from 'vitest'
import { setFlagsFromString } from 'node:v8'
import { runInNewContext } from 'node:vm'
import { initialFrameStateFor, nextFrameState } from '../../src/render/frame.js'
import { worldFromScenario } from '../../src/sim/scenario.js'
import { loadScenarioBundle } from '../../tools/content/load.js'
import { createRecorder, REPLAY_MIN_TICK_GAP } from '../../src/replay/recorder.js'

// Spec §9: 64 MB retained for a 10 s recording of the busiest shipped scenario.
setFlagsFromString('--expose_gc')
const gc = runInNewContext('gc') as () => void
const LIMIT_BYTES = 64 * 1024 * 1024

describe('replay recording memory (spec §9)', () => {
  it('a 10 s furball with guns firing retains under 64 MB', () => {
    let f = initialFrameStateFor(worldFromScenario(loadScenarioBundle('furball-range'), null))
    const firing = new Set(['Space', 'ArrowLeft'])
    for (let i = 0; i < 300; i++) f = nextFrameState(f, 1 / 60, firing) // warm up: projectiles in flight
    const rec = createRecorder({ minTickGap: REPLAY_MIN_TICK_GAP })
    for (let i = 0; i < 900; i++) {
      f = nextFrameState(f, 1 / 60, i % 120 < 60 ? firing : new Set(['Space']))
      rec.push(f.world)
    }
    gc(); gc()
    const withRecording = process.memoryUsage().heapUsed
    rec.clear()
    gc(); gc()
    const without = process.memoryUsage().heapUsed
    const retained = withRecording - without
    console.log(`replay memory: ${(retained / 1048576).toFixed(1)} MB retained for ${900} frames (minTickGap ${REPLAY_MIN_TICK_GAP})`)
    expect(f.world.tick).toBeGreaterThan(1100) // the flight really ran
    expect(retained).toBeLessThan(LIMIT_BYTES)
  }, 120_000)
})
