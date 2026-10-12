import { describe, expect, it } from 'vitest'
import { v3 } from '../../src/sim/math/vec3.js'
import {
  WRECK_AFTERMATH_S,
  WRECK_FIRE_S,
  wreckAftermathEmitter,
  wreckAftermathPhase,
} from '../../src/render/fx/wreckAftermath.js'

describe('solid-crash wreck aftermath', () => {
  it('burns for five minutes, smokes for five more, then goes out', () => {
    expect(wreckAftermathPhase(0)).toBe('fire')
    expect(wreckAftermathPhase(WRECK_FIRE_S - 0.001)).toBe('fire')
    expect(wreckAftermathPhase(WRECK_FIRE_S)).toBe('smoke')
    expect(wreckAftermathPhase(WRECK_AFTERMATH_S - 0.001)).toBe('smoke')
    expect(wreckAftermathPhase(WRECK_AFTERMATH_S)).toBe('out')
  })

  it('places the sustained source at the moving rendered fuselage', () => {
    const first = v3(10, 3, -8)
    const resting = v3(42, 1, -11)
    expect(wreckAftermathEmitter('player', 20, first)?.position).toBe(first)
    expect(wreckAftermathEmitter('player', 40, resting)?.position).toBe(resting)
    expect(wreckAftermathEmitter('player', WRECK_FIRE_S, resting)?.recipe).toBe('wreck.smoke')
    expect(wreckAftermathEmitter('player', 40, resting, true)).toBeNull()
    expect(wreckAftermathEmitter('player', WRECK_AFTERMATH_S, resting)).toBeNull()
  })
})
