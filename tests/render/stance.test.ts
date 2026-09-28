import { describe, expect, it } from 'vitest'
import { drawnPose, MODEL_STANCE, stanceTiltRad, tailDownFraction, TAIL_SETTLED_FRACTION } from '../../src/render/scene/stance.js'
import { createState } from '../../src/sim/flight/state.js'
import { qFromAxisAngle, qMul, qRotate } from '../../src/sim/math/quat.js'
import { add, v3, ZERO } from '../../src/sim/math/vec3.js'
import type { GroundUnder } from '../../src/sim/world/ground.js'
import { loadAircraftSpec } from '../../tools/content/load.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const stance = MODEL_STANCE['f6f-hellcat']!
const land: GroundUnder = { heightM: 10, surface: 'land', velocity: ZERO, deck: null }
const north = qFromAxisAngle(v3(0, 1, 0), Math.PI / 2)
const parked = (over: Partial<Parameters<typeof createState>[0]> = {}) =>
  createState({ position: v3(0, land.heightM + f6f.gear.heightM, 0), velocity: ZERO, attitude: north, gearFraction: 1, ...over })

describe('tailDownFraction', () => {
  const up = f6f.gear.tailUpSpeedMps
  it('is 1 with the tail settled, 0 once the sim grants pitch, linear between', () => {
    expect(tailDownFraction(0, up)).toBe(1)
    expect(tailDownFraction(TAIL_SETTLED_FRACTION * up, up)).toBe(1)
    expect(tailDownFraction(up, up)).toBe(0)
    expect(tailDownFraction(2 * up, up)).toBe(0)
    expect(tailDownFraction((1 + TAIL_SETTLED_FRACTION) / 2 * up, up)).toBeCloseTo(0.5, 12)
  })
  it('reads a non-finite speed as tail down, as groundBodyRates does', () => {
    expect(tailDownFraction(Number.NaN, up)).toBe(1)
  })
})

describe('stanceTiltRad', () => {
  it('is the full stance pitch for an airplane parked level on land or a deck', () => {
    expect(stanceTiltRad(stance, f6f, parked(), land)).toBeCloseTo(stance.tailDownPitchRad, 12)
    const deck = { ...land, surface: 'deck' as const, velocity: v3(15, 0, 0) }
    // Moving with the deck is at rest on it.
    expect(stanceTiltRad(stance, f6f, parked({ velocity: v3(15, 0, 0) }), deck)).toBeCloseTo(stance.tailDownPitchRad, 12)
  })
  it('is 0 in the air, over water, gear up, with no ground yet, or for a model with no stance', () => {
    expect(stanceTiltRad(stance, f6f, parked({ position: v3(0, 500, 0) }), land)).toBe(0)
    expect(stanceTiltRad(stance, f6f, parked(), { ...land, surface: 'water' })).toBe(0)
    expect(stanceTiltRad(stance, f6f, parked({ gearFraction: 0 }), land)).toBe(0)
    expect(stanceTiltRad(stance, f6f, parked(), null)).toBe(0)
    expect(stanceTiltRad(undefined, f6f, parked(), land)).toBe(0)
  })
  it('is 0 at take-off speed, with the tail up', () => {
    expect(stanceTiltRad(stance, f6f, parked({ velocity: v3(0, 0, -f6f.gear.tailUpSpeedMps) }), land)).toBe(0)
  })
  it('never tilts an airplane already nose-high twice: only up to the stance pitch', () => {
    const noseUp = (deg: number) => qMul(north, qFromAxisAngle(v3(0, 0, 1), deg * Math.PI / 180))
    expect(stanceTiltRad(stance, f6f, parked({ attitude: noseUp(4) }), land)).toBeCloseTo(stance.tailDownPitchRad - 4 * Math.PI / 180, 9)
    expect(stanceTiltRad(stance, f6f, parked({ attitude: noseUp(12) }), land)).toBe(0)
  })
})

describe('drawnPose', () => {
  const pose = { position: v3(100, 12.42, -40), attitude: north }
  it('pitches the nose up about the main-wheel contact, which stays put', () => {
    const tilt = 0.2
    const d = drawnPose(pose, tilt, stance.mainWheelXM, f6f.gear.heightM)
    const contact = v3(stance.mainWheelXM, -f6f.gear.heightM, 0)
    const before = add(pose.position, qRotate(pose.attitude, contact))
    const after = add(d.position, qRotate(d.attitude, contact))
    for (const k of ['x', 'y', 'z'] as const) expect(after[k]).toBeCloseTo(before[k], 9)
    expect(qRotate(d.attitude, v3(1, 0, 0)).y).toBeCloseTo(Math.sin(tilt), 9)
  })
  it('returns the sim pose itself when there is nothing to tilt', () => {
    expect(drawnPose(pose, 0, stance.mainWheelXM, f6f.gear.heightM)).toBe(pose)
  })
})
