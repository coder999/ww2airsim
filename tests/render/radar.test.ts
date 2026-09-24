import { describe, expect, it } from 'vitest'
import {
  MAX_RADAR_CONTACTS,
  RADAR_FADE_FLOOR,
  RADAR_RANGES_MI,
  RADAR_SWEEP_PERIOD_S,
  cycleRadarRange,
  radarBrightness,
  radarContacts,
  radarSweepAngle,
  type RadarRangeMi,
} from '../../src/render/radar.js'
import { createState } from '../../src/sim/flight/state.js'
import { qFromAxisAngle } from '../../src/sim/math/quat.js'
import { v3 } from '../../src/sim/math/vec3.js'
import type { AircraftEntity } from '../../src/sim/loop.js'
import { loadAircraftSpec } from '../../tools/content/load.js'

const f6f = loadAircraftSpec('f6f-hellcat')

const entity = (
  id: string,
  position = v3(0, 2000, 0),
  headingRad = 0,
  parked = false,
): AircraftEntity<undefined> => {
  const state = createState({ position, attitude: qFromAxisAngle(v3(0, 1, 0), Math.PI / 2 - headingRad) })
  return {
    id, spec: f6f, state, previous: state,
    controls: { pitch: 0, roll: 0, yaw: 0, throttle: 0.7 },
    assistMemory: undefined, impact: null, parked,
  }
}

describe('radarContacts: bearing and range', () => {
  it('reads ahead, right, behind and left as 0, +pi/2, +/-pi and -pi/2', () => {
    const player = entity('player')
    const ahead = radarContacts(player, [entity('a', v3(0, 2000, -1000))], 15)[0]!
    const right = radarContacts(player, [entity('a', v3(1000, 2000, 0))], 15)[0]!
    const behind = radarContacts(player, [entity('a', v3(0, 2000, 1000))], 15)[0]!
    const left = radarContacts(player, [entity('a', v3(-1000, 2000, 0))], 15)[0]!
    expect(ahead.bearingRad).toBeCloseTo(0, 9)
    expect(right.bearingRad).toBeCloseTo(Math.PI / 2, 9)
    expect(Math.abs(behind.bearingRad)).toBeCloseTo(Math.PI, 9)
    expect(left.bearingRad).toBeCloseTo(-Math.PI / 2, 9)
  })

  it('reports a dead-astern contact unclamped, not collapsed to zero', () => {
    // Plan 7a's whole-branch review found an epsilon floor on the forward
    // component silently zeroing a behind-the-nose error (controller.ts's
    // `ahead`). Bearing math must not repeat it: a contact directly behind
    // must read PI, not 0.
    const player = entity('player')
    const behind = radarContacts(player, [entity('a', v3(0, 2000, 1000))], 15)[0]!
    expect(Math.abs(behind.bearingRad)).toBeCloseTo(Math.PI, 9)
    expect(behind.bearingRad).not.toBe(0)
  })

  it('converts metres to statute miles', () => {
    const player = entity('player')
    const contact = radarContacts(player, [entity('a', v3(0, 2000, -1609.344 * 3))], 15)[0]!
    expect(contact.rangeMi).toBeCloseTo(3, 6)
  })

  it('falls back to bearing 0, range 0 for a coincident target', () => {
    const player = entity('player')
    const contact = radarContacts(player, [entity('a', player.state.position)], 15)[0]!
    expect(contact.bearingRad).toBe(0)
    expect(contact.rangeMi).toBe(0)
  })
})

describe('radarContacts: filtering', () => {
  it('excludes parked aircraft (Plan 17 design doc: no IFF, airborne-only)', () => {
    const player = entity('player')
    const parked = entity('parked', v3(0, 2000, -1000), 0, true)
    expect(radarContacts(player, [parked], 15)).toEqual([])
  })

  it('excludes the player itself even if passed in `others`', () => {
    const player = entity('player')
    expect(radarContacts(player, [player], 15)).toEqual([])
  })

  it('includes a contact exactly AT the selected range boundary', () => {
    const player = entity('player')
    const onTheRing = entity('a', v3(0, 2000, -15 * 1609.344))
    expect(radarContacts(player, [onTheRing], 15).map((c) => c.id)).toEqual(['a'])
  })

  it('excludes a contact just outside the selected range', () => {
    const player = entity('player')
    const justOutside = entity('a', v3(0, 2000, -(15 * 1609.344 + 1)))
    expect(radarContacts(player, [justOutside], 15)).toEqual([])
  })

  it('a contact present at 15 mi disappears when the range shrinks to 1 mi', () => {
    const player = entity('player')
    const twoMilesOut = entity('a', v3(0, 2000, -2 * 1609.344))
    expect(radarContacts(player, [twoMilesOut], 15).map((c) => c.id)).toEqual(['a'])
    expect(radarContacts(player, [twoMilesOut], 1)).toEqual([])
  })

  it('caps at MAX_RADAR_CONTACTS, keeping the nearest ones', () => {
    const player = entity('player')
    const others = Array.from({ length: MAX_RADAR_CONTACTS + 4 }, (_, i) =>
      entity(`a${i}`, v3(0, 2000, -(i + 1) * 100)),
    )
    const kept = radarContacts(player, others, 15)
    expect(kept).toHaveLength(MAX_RADAR_CONTACTS)
    expect(kept.map((c) => c.id)).toEqual(
      Array.from({ length: MAX_RADAR_CONTACTS }, (_, i) => `a${i}`),
    )
  })
})

describe('radarSweepAngle and radarBrightness', () => {
  it('completes one revolution every RADAR_SWEEP_PERIOD_S', () => {
    expect(radarSweepAngle(0)).toBeCloseTo(0, 9)
    expect(radarSweepAngle(RADAR_SWEEP_PERIOD_S / 2)).toBeCloseTo(Math.PI, 9)
    expect(radarSweepAngle(RADAR_SWEEP_PERIOD_S)).toBeCloseTo(0, 9)
    expect(radarSweepAngle(RADAR_SWEEP_PERIOD_S * 2.25)).toBeCloseTo(Math.PI / 2, 9)
  })

  it('is brightest exactly where the sweep is now', () => {
    expect(radarBrightness(1.2, 1.2)).toBeCloseTo(1, 9)
  })

  it('decays monotonically with angular lag behind the sweep', () => {
    const atZero = radarBrightness(0, 0)
    const aQuarterBehind = radarBrightness(0, Math.PI / 2)
    const halfBehind = radarBrightness(0, Math.PI)
    expect(atZero).toBeGreaterThan(aQuarterBehind)
    expect(aQuarterBehind).toBeGreaterThan(halfBehind)
  })

  it('never drops below RADAR_FADE_FLOOR, even a full revolution behind', () => {
    expect(radarBrightness(0, 2 * Math.PI - 1e-6)).toBeCloseTo(RADAR_FADE_FLOOR, 3)
    expect(radarBrightness(0, 2 * Math.PI - 1e-6)).toBeGreaterThanOrEqual(RADAR_FADE_FLOOR)
  })

  it('wraps correctly across the 0/2pi boundary: periodic in both bearing and sweep', () => {
    // A contact just BEHIND the sweep (freshly illuminated) is meant to be
    // near-maximum brightness, and one just AHEAD of it (next in line, after
    // almost a full revolution's wait) near the floor -- that IS the sweep's
    // leading edge, not a bug (a real rotating-radar afterglow has exactly
    // this cliff). What "wraps correctly" actually means is periodicity: the
    // function must give the identical answer for any angle and that angle
    // shifted by a whole number of revolutions.
    const bearing = 0.7
    const sweep = 2.1
    const baseline = radarBrightness(bearing, sweep)
    expect(radarBrightness(bearing + 2 * Math.PI, sweep)).toBeCloseTo(baseline, 9)
    expect(radarBrightness(bearing, sweep + 2 * Math.PI)).toBeCloseTo(baseline, 9)
    expect(radarBrightness(bearing - 2 * Math.PI, sweep - 2 * Math.PI)).toBeCloseTo(baseline, 9)
  })
})

describe('cycleRadarRange', () => {
  it('cycles 15 -> 5 -> 1 -> wraps to 15', () => {
    let r: RadarRangeMi = 15
    r = cycleRadarRange(r)
    expect(r).toBe(5)
    r = cycleRadarRange(r)
    expect(r).toBe(1)
    r = cycleRadarRange(r)
    expect(r).toBe(15)
  })

  it('RADAR_RANGES_MI is the exact cycle order', () => {
    expect(RADAR_RANGES_MI).toEqual([15, 5, 1])
  })
})
