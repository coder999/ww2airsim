// tests/render/hangar/benchFlag.test.ts
import { describe, expect, it } from 'vitest'
import { benchEnabled } from '../../../src/render/hangar/benchFlag.js'

describe('benchEnabled (Hangar spec §3): the one switch v1.0 flips', () => {
  it.each([
    [true, '', true],
    [true, '?bench', true],
    [false, '', false],
    [false, '?bench', true],
    [false, '?bench=1', true],
    [false, '?benchmark=1', false],
  ])('dev=%s search=%j -> %s', (dev, search, expected) => {
    expect(benchEnabled(dev, search)).toBe(expected)
  })
})
