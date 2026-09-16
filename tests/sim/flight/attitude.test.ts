import { describe, it, expect } from 'vitest'
import { attitudeAngles } from '../../../src/sim/flight/attitude.js'
import { createState } from '../../../src/sim/flight/state.js'
import { v3 } from '../../../src/sim/math/vec3.js'
import { qFromAxisAngle } from '../../../src/sim/math/quat.js'

const deg = (rad: number): number => (rad * 180) / Math.PI

describe('attitudeAngles, in sim/ so the contact judgment can reach it', () => {
  it('reads a wings-level airplane as zero bank', () => {
    expect(deg(attitudeAngles(createState()).rollRad)).toBeCloseTo(0, 9)
  })

  it('reads a 30 degree right roll as 30 degrees of bank', () => {
    const q = qFromAxisAngle(v3(1, 0, 0), Math.PI / 6)
    expect(deg(attitudeAngles(createState({ attitude: q })).rollRad)).toBeCloseTo(30, 9)
  })
})
