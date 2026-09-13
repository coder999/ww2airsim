import { describe, it, expect } from 'vitest'
import { lookOffsetFromKeys, LOOK_CENTRE, LOOK_LIMIT_RAD } from '../../src/input/lookAround.js'

const DT = 1 / 60
const keys = (...k: string[]) => new Set(k)
const hold = (held: string[], seconds: number) => {
  let o = LOOK_CENTRE
  for (let t = 0; t < seconds; t += DT) o = lookOffsetFromKeys(keys(...held), DT, o)
  return o
}

describe('lookOffsetFromKeys', () => {
  it('starts centred', () => {
    expect(LOOK_CENTRE).toEqual({ yawRad: 0, pitchRad: 0 })
  })

  it('snaps to a preset immediately, like a hat switch', () => {
    // A hat is not an analogue stick: looking left is instant, not a pan.
    const left = lookOffsetFromKeys(keys('Numpad4'), DT, LOOK_CENTRE)
    expect(left.yawRad).toBeCloseTo(Math.PI / 2, 6)
  })

  it('looks back over either shoulder at 180 degrees', () => {
    expect(Math.abs(lookOffsetFromKeys(keys('Numpad0'), DT, LOOK_CENTRE).yawRad))
      .toBeCloseTo(Math.PI, 6)
  })

  it('springs back to centre on release', () => {
    const looked = hold(['Numpad4'], 0.5)
    expect(looked.yawRad).not.toBe(0)
    expect(lookOffsetFromKeys(keys(), DT, looked)).toEqual(LOOK_CENTRE)
  })

  it('combines diagonals', () => {
    const o = lookOffsetFromKeys(keys('Numpad4', 'Numpad8'), DT, LOOK_CENTRE)
    expect(o.yawRad).toBeGreaterThan(0)
    expect(o.pitchRad).toBeGreaterThan(0)
  })

  it('clamps pitch so the view cannot invert through the vertical', () => {
    const o = hold(['Numpad8'], 2)
    expect(Math.abs(o.pitchRad)).toBeLessThanOrEqual(LOOK_LIMIT_RAD + 1e-9)
  })
})
