import { describe, expect, it } from 'vitest'
import { cloudTargetSize } from '../../src/render/scene/cloudPass.js'

describe('cloud pass (photoreal Task 3)', () => {
  it('sizes the reduced-resolution target by ceiling, never below one texel', () => {
    expect(cloudTargetSize(2560, 1440, 0.5)).toEqual({ width: 1280, height: 720 })
    expect(cloudTargetSize(3840, 2160, 0.25)).toEqual({ width: 960, height: 540 })
    expect(cloudTargetSize(1, 1, 0.25)).toEqual({ width: 1, height: 1 })
    expect(cloudTargetSize(1001, 3, 0.5)).toEqual({ width: 501, height: 2 })
  })
})
