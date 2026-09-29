import { describe, expect, it } from 'vitest'
import { QUIET_DAMAGE } from '../../audio/inputs.js'
import { nextAudio, NO_AUDIO_MEMORY, type AudioMemory } from '../../../src/audio/cues.js'
import { DT, type AircraftState } from '../../../src/sim/flight/model.js'
import { wheelDepthOf } from '../../../src/sim/gearContact.js'
import { onGround } from '../../../src/sim/ground.js'
import { RUNWAY_HEIGHT_M } from '../../../tools/testcards/measure.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { run } from './run.js'

const f6f = loadAircraftSpec('f6f-hellcat')

/** Every onGround transition along a trace, as 'T' (true -> false) and 'F' (false -> true). */
const transitions = (trace: readonly AircraftState[]): string => {
  let out = ''
  for (let i = 1; i < trace.length; i++) {
    const a = onGround(f6f, trace[i - 1]!, RUNWAY_HEIGHT_M)
    const b = onGround(f6f, trace[i]!, RUNWAY_HEIGHT_M)
    if (a && !b) out += 'T'
    else if (!a && b) out += 'F'
  }
  return out
}

/** The squeaks the real audio reducer fires over a trace, fed the values
 *  `audioInputsFrom` (src/render/audio.ts) computes from a state. */
const squeaks = (trace: readonly AircraftState[]): number => {
  let m: AudioMemory = NO_AUDIO_MEMORY
  let n = 0
  trace.forEach((s, i) => {
    const f = nextAudio(m, {
      throttle: 1, engineRunning: true, impact: null, groundSurface: 'land', tick: i + 1, shots: 0, bombsDropped: 0, rocketsFired: 0, ...QUIET_DAMAGE,
      onGround: onGround(f6f, s, RUNWAY_HEIGHT_M),
      heightM: s.position.y - wheelDepthOf(f6f, s) - RUNWAY_HEIGHT_M,
      sinkMps: -s.velocity.y,
    })
    m = f.memory
    n += f.cues.filter((c) => c === 'landing_squeak').length
  })
  return n
}

describe('a full-pull take-off does not chatter through the contact band (T1 hysteresis, 2026-09-28)', () => {
  // From 40 m/s: the roll, the rotation and the whole climb-out to its apex.
  it.each([[false], [true]])('flaps down = %s: at most one true -> false, no false -> true, no squeak', (flapDown) => {
    const full = run(f6f, { pitch: 1, roll: 0, yaw: 0, throttle: 1, gearDown: true, flapDown }, 16, { speedMps: 40 }).trace
    // Up to the top of the zoom climb: what follows is a stall and a fall back
    // onto the runway, which is a legitimate re-contact and not what this pins.
    let apex = 0
    full.forEach((s, i) => { if (s.position.y > full[apex]!.position.y) apex = i })
    const trace = full.slice(0, apex + 1)
    expect(trace[apex]!.position.y - RUNWAY_HEIGHT_M, 'it took off and climbed').toBeGreaterThan(10)
    const t = transitions(trace)
    expect(t.split('T').length - 1, `transitions ${t}`).toBeLessThanOrEqual(1)
    expect(t.split('F').length - 1, `transitions ${t}`).toBe(0)
    expect(squeaks(trace)).toBe(0)
  })

  it('a real descent back onto the runway still re-contacts and squeaks exactly once', () => {
    // 3 m of air, descending at ~1.5 m/s under a throttled glide: a legitimate
    // touchdown through the same real step.
    const seconds = 10
    const { trace } = run(f6f, { pitch: 0, roll: 0, yaw: 0, throttle: 0, gearDown: true }, seconds, { dropM: 30, speedMps: 45 })
    const t = transitions(trace)
    expect(t, `transitions ${t}`).toContain('F')
    expect(squeaks(trace)).toBe(1)
    expect(DT).toBeGreaterThan(0)
  })
})
