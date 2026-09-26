import { describe, expect, it } from 'vitest'
import { fxQueryFrom } from '../../src/render/fx/query.js'

describe('?fx DEV knobs', () => {
  it('defaults to everything on and no forced tier', () => {
    expect(fxQueryFrom('')).toEqual({ tier: undefined, soft: true, cloudLimit: true })
  })
  it('parses each knob', () => {
    expect(fxQueryFrom('?fx=off&fxSoft=off&fxCloudLimit=off')).toEqual({ tier: 'off', soft: false, cloudLimit: false })
    expect(fxQueryFrom('?fx=low').tier).toBe('low')
  })
  it('throws on a typo rather than silently measuring the default', () => {
    expect(() => fxQueryFrom('?fx=hi')).toThrow(/fx/)
    expect(() => fxQueryFrom('?fxSoft=no')).toThrow(/fxSoft/)
  })
})
