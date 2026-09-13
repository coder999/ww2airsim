import { describe, it, expect } from 'vitest'
import { applyAssists, DEFAULT_ASSIST_SETTINGS, type AssistSettings } from '../../src/assists/index.js'
import { createState } from '../../src/sim/flight/state.js'
import { loadAircraftSpec } from '../../tools/content/load.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const state = createState({})
const raw = { pitch: 0.4, roll: -0.2, yaw: 0.1, throttle: 0.8 }

// Every combination of the three flags, so a stage that is wired up wrong
// (e.g. only checked when a DIFFERENT flag is on) has nowhere to hide.
const ALL_SETTINGS_COMBOS: AssistSettings[] = (() => {
  const combos: AssistSettings[] = []
  for (const stallLimiter of [true, false]) {
    for (const autoRudder of [true, false]) {
      for (const altitudeHold of [true, false]) {
        combos.push({ stallLimiter, autoRudder, altitudeHold })
      }
    }
  }
  return combos
})()

describe('AssistSettings', () => {
  it('defaults every assist on', () => {
    // Plan 3's design draft: an assist a pilot has to remember to enable is
    // one most never do, so the default has to be "on", not "off".
    expect(DEFAULT_ASSIST_SETTINGS).toEqual({
      stallLimiter: true,
      autoRudder: true,
      altitudeHold: true,
    })
  })
})

describe('applyAssists (Plan 3 Task 1: the seam, no assist behaviour yet)', () => {
  it('is the identity function for every combination of enabled flags', () => {
    // Proved to fail: giving any one of the three stub stages in
    // src/assists/index.ts a body that changes its input (e.g. `stallLimiter`
    // returning `{ ...controls, pitch: 0 }`) makes the combo with that flag
    // `true` fail this assertion, while combos with it `false` keep passing --
    // isolating exactly which stage broke identity.
    for (const enabled of ALL_SETTINGS_COMBOS) {
      const result = applyAssists(state, f6f, raw, 1 / 60, enabled)
      expect(result).toEqual(raw)
    }
  })

  it('does not mutate the raw command it is handed', () => {
    const before = JSON.stringify(raw)
    applyAssists(state, f6f, raw, 1 / 60, DEFAULT_ASSIST_SETTINGS)
    expect(JSON.stringify(raw)).toBe(before)
  })
})
