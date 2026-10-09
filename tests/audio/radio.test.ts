import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  MESSAGE_STALE_S, NO_RADIO_MEMORY, PADDLES_GAP_S, PADDLES_LINES, RADIO_LINES, SQUELCH_LEAD_S, SQUELCH_TAIL_S, VOICE_STEMS,
  nextRadio, voiceId, type PaddlesCall, type RadioInputs, type RadioMemory,
} from '../../src/audio/radio.js'
import { WAVE_OFF_MESSAGE } from '../../src/sim/mission/passes.js'
import { RESPOT_MESSAGE } from '../../src/sim/mission/respot.js'
import { FRIENDLY_FIRE_RADIO } from '../../src/render/discharge.js'

const repoPath = (rel: string): string => fileURLToPath(new URL(`../../${rel}`, import.meta.url))

/** Every `"message"` string in every scenario, wherever its trigger nests it. */
function scenarioMessages(): string[] {
  const found: string[] = []
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(walk)
    else if (v !== null && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        if (k === 'message' && typeof x === 'string') found.push(x)
        else walk(x)
      }
    }
  }
  for (const f of readdirSync(repoPath('content/scenarios')).filter((n) => n.endsWith('.json'))) {
    walk(JSON.parse(readFileSync(repoPath(`content/scenarios/${f}`), 'utf8')))
  }
  return [...new Set(found)]
}

describe('which line voices which message (I2)', () => {
  it('has an entry, voiced or deliberately silent, for every scenario message', () => {
    // Enrolled from content: an edited message (the Dulag line went from kilometers to miles)
    // fails here rather than going quiet in flight. Pinned so a walk that finds nothing fails.
    const messages = scenarioMessages()
    expect(messages.length).toBeGreaterThanOrEqual(14)
    for (const m of messages) expect(Object.keys(RADIO_LINES), m).toContain(m)
  })

  it('keys the runtime messages by the text the sim actually writes', () => {
    for (const m of [WAVE_OFF_MESSAGE, RESPOT_MESSAGE, FRIENDLY_FIRE_RADIO]) expect(RADIO_LINES[m], m).toBeTypeOf('string')
  })

  it('has a recorded file, in both languages, for every line it can play, and plays all 34', () => {
    expect(VOICE_STEMS).toHaveLength(34)
    for (const stem of VOICE_STEMS) {
      for (const lang of ['us', 'ja'] as const) {
        expect(existsSync(repoPath(`content/audio/voice/${voiceId(stem, lang)}.wav`)), `${stem} ${lang}`).toBe(true)
      }
    }
  })
})

const LINE_S = 1.5
const decoded: RadioInputs['durationS'] = () => LINE_S
const frame = (nowS: number, over: Partial<RadioInputs> = {}): RadioInputs =>
  ({ nowS, message: null, paddles: null, durationS: decoded, ...over })

/** Runs frames in order, returning every transmission started and the final memory. */
function run(frames: readonly RadioInputs[], from: RadioMemory = NO_RADIO_MEMORY): { started: { at: number; stem: string; preempt: boolean }[]; memory: RadioMemory } {
  let memory = from
  const started: { at: number; stem: string; preempt: boolean }[] = []
  for (const f of frames) {
    const out = nextRadio(memory, f)
    memory = out.memory
    if (out.start !== null) started.push({ at: f.nowS, stem: out.start.stem, preempt: out.start.preempt })
  }
  return { started, memory }
}

const CAP = 'Essex CIC: Hold CAP over the task group, angels ten. Raid expected from the northwest.'
const BOGEYS = 'Essex CIC: Bogeys bearing three-three-eight, twenty miles, angels eleven, closing.'
const TX_S = SQUELCH_LEAD_S + LINE_S + SQUELCH_TAIL_S

describe('nextRadio (I2)', () => {
  it('speaks each new HUD message once, however many frames show it', () => {
    const { started } = run([frame(0, { message: CAP }), frame(0.02, { message: CAP }), frame(3, { message: CAP })])
    expect(started).toEqual([{ at: 0, stem: 'radio_tower_cap_station', preempt: false }])
  })

  it('queues a mission line behind the transmission on the air, then plays it', () => {
    const { started } = run([
      frame(0, { message: CAP }), frame(0.5, { message: BOGEYS }), frame(TX_S - 0.01, { message: BOGEYS }), frame(TX_S, { message: BOGEYS }),
    ])
    expect(started.map((s) => [s.at, s.stem])).toEqual([[0, 'radio_tower_cap_station'], [TX_S, 'radio_tower_raid_bogeys_338']])
  })

  it('holds a line whose file has not decoded, and drops it once stale', () => {
    let ready = false
    const durationS: RadioInputs['durationS'] = () => (ready ? LINE_S : null)
    const waits = run([frame(0, { message: CAP, durationS }), frame(1, { message: CAP, durationS })])
    expect(waits.started).toEqual([])
    ready = true
    expect(run([frame(2, { message: CAP, durationS })], waits.memory).started).toHaveLength(1)
    expect(run([frame(MESSAGE_STALE_S + 0.1, { message: CAP, durationS })], waits.memory).started).toEqual([])
  })

  it('drops a Paddles correction while the radio is busy or too soon after the last, and rotates the takes', () => {
    const calls = (seq: readonly [number, PaddlesCall | null][]): string[] =>
      run(seq.map(([t, p]) => frame(t, { paddles: p }))).started.map((s) => s.stem)
    // high at 0; low at 1 is inside the transmission, dropped; high again after the gap takes the second take.
    expect(calls([[0, 'high'], [1, 'low'], [1.2, null], [PADDLES_GAP_S + TX_S, 'high']]))
      .toEqual(['radio_paddles_high_1', 'radio_paddles_high_2'])
  })

  it('lets cut and wave-off cut in over anything', () => {
    const { started } = run([frame(0, { message: CAP }), frame(0.5, { paddles: 'cut' }), frame(0.6, { paddles: 'wave-off' })])
    expect(started.map((s) => [s.stem, s.preempt])).toEqual([
      ['radio_tower_cap_station', false], ['radio_paddles_cut_1', true], ['radio_paddles_waveoff_1', true],
    ])
  })

  it("keeps the mission's wave-off message silent right after the LSO's own wave-off", () => {
    const after = run([frame(0, { paddles: 'wave-off' }), frame(TX_S, { message: WAVE_OFF_MESSAGE })])
    expect(after.started.map((s) => s.stem)).toEqual(['radio_paddles_waveoff_1'])
    // Without the LSO's call, the message is voiced.
    expect(run([frame(0, { message: WAVE_OFF_MESSAGE })]).started.map((s) => s.stem)).toEqual(['radio_paddles_waveoff_1'])
  })

  it('stays silent for a message with no line, voiced or not', () => {
    expect(run([frame(0, { message: 'No wave-offs: failed' }), frame(0.1, { message: 'Raid 1 of 2' })]).started).toEqual([])
  })

  it('every PaddlesCall has at least one take', () => {
    for (const [call, lines] of Object.entries(PADDLES_LINES)) expect(lines.length, call).toBeGreaterThan(0)
  })
})
