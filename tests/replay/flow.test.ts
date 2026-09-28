import { describe, expect, it } from 'vitest'
import { DEBRIEF_DELAY_MS, stepFlow, type ReplayFlow, type ReplayFlowEvent } from '../../src/replay/flow.js'

const run = (flow: ReplayFlow, ...events: readonly ReplayFlowEvent[]) => {
  let state: ReturnType<typeof stepFlow> = { flow, effects: [] }
  for (const event of events) state = stepFlow(state.flow, event)
  return state
}

describe('instant replay flow', () => {
  it('holds a crash for three seconds, replays it, and shows the debrief exactly once', () => {
    const banked = stepFlow({ kind: 'live' }, { kind: 'crashBanked' })
    expect(banked).toEqual({ flow: { kind: 'hold', remainingMs: DEBRIEF_DELAY_MS }, effects: [] })

    const replay = stepFlow(banked.flow, {
      kind: 'frame', frameMs: DEBRIEF_DELAY_MS, paused: false, recordingAvailable: true,
    })
    expect(replay).toEqual({
      flow: { kind: 'replay', returnTo: 'debrief', firstShow: true }, effects: ['startAutoReplay'],
    })

    const done = stepFlow(replay.flow, { kind: 'replayDone' })
    expect(done).toEqual({ flow: { kind: 'debrief' }, effects: ['showDebrief'] })
    expect(stepFlow(done.flow, { kind: 'replayDone' }).effects).toEqual([])
  })

  it('the skip completion path also shows the crash debrief exactly once', () => {
    const replay: ReplayFlow = { kind: 'replay', returnTo: 'debrief', firstShow: true }
    const skipped = stepFlow(replay, { kind: 'replayDone' })
    expect(skipped.effects.filter((effect) => effect === 'showDebrief')).toHaveLength(1)
    expect(stepFlow(skipped.flow, { kind: 'replayDone' }).effects).toEqual([])
  })

  it('shows the debrief after the hold when no recording is available', () => {
    expect(stepFlow(
      { kind: 'hold', remainingMs: 10 },
      { kind: 'frame', frameMs: 10, paused: false, recordingAvailable: false },
    )).toEqual({ flow: { kind: 'debrief' }, effects: ['showDebrief'] })
  })

  it('does not count the crash hold down while paused', () => {
    expect(stepFlow(
      { kind: 'hold', remainingMs: 1200 },
      { kind: 'frame', frameMs: 500, paused: true, recordingAvailable: true },
    )).toEqual({ flow: { kind: 'hold', remainingMs: 1200 }, effects: [] })
  })

  it('Watch replay returns to the existing debrief without showing it a second time', () => {
    const watch = stepFlow({ kind: 'debrief' }, { kind: 'watch' })
    expect(watch).toEqual({
      flow: { kind: 'replay', returnTo: 'debrief', firstShow: false }, effects: ['startAutoReplay'],
    })
    expect(stepFlow(watch.flow, { kind: 'replayDone' })).toEqual({
      flow: { kind: 'debrief' }, effects: [],
    })
  })

  it('manual replay returns to live', () => {
    const manual = stepFlow({ kind: 'live' }, { kind: 'manual' })
    expect(manual.effects).toEqual(['startManualReplay'])
    expect(stepFlow(manual.flow, { kind: 'replayDone' })).toEqual({ flow: { kind: 'live' }, effects: [] })
  })

  it('reset returns every state to live', () => {
    const states: readonly ReplayFlow[] = [
      { kind: 'live' },
      { kind: 'hold', remainingMs: 1 },
      { kind: 'replay', returnTo: 'live', firstShow: false },
      { kind: 'debrief' },
    ]
    for (const state of states) {
      expect(stepFlow(state, { kind: 'reset' })).toEqual({ flow: { kind: 'live' }, effects: [] })
    }
  })

  it('events that do not apply are no-ops', () => {
    expect(stepFlow({ kind: 'live' }, { kind: 'watch' })).toEqual({ flow: { kind: 'live' }, effects: [] })
    const hold: ReplayFlow = { kind: 'hold', remainingMs: 100 }
    expect(stepFlow(hold, { kind: 'manual' })).toEqual({ flow: hold, effects: [] })
  })

  it('landing and closing its debrief move between live and debrief without effects', () => {
    expect(run(
      { kind: 'live' },
      { kind: 'landingDebrief' },
      { kind: 'debriefClosed' },
    )).toEqual({ flow: { kind: 'live' }, effects: [] })
  })
})
