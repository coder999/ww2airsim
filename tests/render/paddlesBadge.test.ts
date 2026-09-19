import { describe, it, expect } from 'vitest'
import { paddlesLabel } from '../../src/render/paddlesBadge.js'

describe('paddlesLabel', () => {
  it('is null with no cue and the signal in capitals otherwise', () => {
    expect(paddlesLabel(null)).toBeNull()
    expect(paddlesLabel('roger')).toBe('PADDLES: ROGER')
    expect(paddlesLabel('wave-off')).toBe('PADDLES: WAVE OFF')
    expect(paddlesLabel('cut')).toBe('PADDLES: CUT')
  })
})
