import { describe, it, expect } from 'vitest'
import { surfaceAt, contactOutcome, DITCH_MAX_SPEED_STALL_MULTIPLE } from '../../src/sim/contact.js'
import { SEA_LEVEL_M } from '../../src/sim/world/terrain.js'
import { createState } from '../../src/sim/flight/state.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { qFromAxisAngle } from '../../src/sim/math/quat.js'
import { loadAircraftSpec } from '../../tools/content/load.js'

const f6f = loadAircraftSpec('f6f-hellcat')
/** Wings level, nose a little up, slow, sinking gently: a good ditching. */
const goodDitch = () =>
  createState({
    position: v3(0, 0, 0),
    velocity: v3(40, -1.5, 0),
    attitude: qFromAxisAngle(v3(0, 0, 1), (6 * Math.PI) / 180),
  })

describe('surfaceAt', () => {
  it('reads ground above sea level as land', () => {
    expect(surfaceAt(120)).toBe('land')
  })

  it('reads ground below sea level as water', () => {
    expect(surfaceAt(-5)).toBe('water')
  })

  it('reads exactly sea level as water, because the DEM zero IS the sea', () => {
    // heightAt returns SEA_LEVEL_M for open ocean and for every query outside
    // the world box, so this is the common case, not the edge case.
    expect(surfaceAt(SEA_LEVEL_M)).toBe('water')
  })
})

describe('contactOutcome', () => {
  it('lets a wings-level, slow, gently sinking airplane ditch', () => {
    expect(contactOutcome(f6f, goodDitch(), 'water')).toBe('ditched')
  })

  it('destroys the same airplane on land, because it has no gear to land with', () => {
    expect(contactOutcome(f6f, goodDitch(), 'land')).toBe('destroyed')
  })

  it('destroys a ditching with a wing down, which cartwheels', () => {
    const banked = { ...goodDitch(), attitude: qFromAxisAngle(v3(1, 0, 0), (25 * Math.PI) / 180) }
    expect(contactOutcome(f6f, banked, 'water')).toBe('destroyed')
  })

  it('destroys a ditching that arrives sinking too fast', () => {
    const diving = { ...goodDitch(), velocity: v3(40, -12, 0) }
    expect(contactOutcome(f6f, diving, 'water')).toBe('destroyed')
  })

  it('destroys a ditching that arrives nose down', () => {
    const noseDown = { ...goodDitch(), attitude: qFromAxisAngle(v3(0, 0, 1), (-15 * Math.PI) / 180) }
    expect(contactOutcome(f6f, noseDown, 'water')).toBe('destroyed')
  })

  it('destroys a ditching that arrives too fast', () => {
    const fast = {
      ...goodDitch(),
      velocity: v3(f6f.reference.stallSpeedMps * DITCH_MAX_SPEED_STALL_MULTIPLE + 10, -1.5, 0),
    }
    expect(contactOutcome(f6f, fast, 'water')).toBe('destroyed')
  })

  it('destroys a contact whose state is not finite, rather than passing it', () => {
    // Every gate is written as a positive comparison precisely so NaN fails
    // it. A gate written as its negation (`if (Math.abs(roll) > limit) return
    // 'destroyed'`) would let a NaN state through as a successful ditching,
    // which is the wrong way for this to fail.
    const broken = { ...goodDitch(), velocity: v3(Number.NaN, Number.NaN, Number.NaN) }
    expect(contactOutcome(f6f, broken, 'water')).toBe('destroyed')
  })
})
