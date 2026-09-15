// tests/render/ocean/weather.test.ts
import { describe, expect, it } from 'vitest'
import { BEAUFORT_PARAM, DEFAULT_BEAUFORT, beaufortFromQuery, oceanTimeFromQuery } from '../../../src/render/ocean/weather.js'

describe('beaufortFromQuery', () => {
  it('defaults when the parameter is absent', () => {
    expect(beaufortFromQuery('')).toBe(DEFAULT_BEAUFORT)
  })

  it('reads an in-range force', () => {
    expect(beaufortFromQuery('?beaufort=6')).toBe(6)
  })

  it('throws rather than falling back, like spawn.ts', () => {
    // A silent fallback puts a force-4 sea on screen when the test asked for
    // force 8, and the test passes. Exactly spawn.ts's argument.
    expect(() => beaufortFromQuery('?beaufort=')).toThrow()
    expect(() => beaufortFromQuery('?beaufort=99')).toThrow()
    expect(() => beaufortFromQuery('?beaufort=calm')).toThrow()
  })

  it('names the parameter it parses', () => {
    expect(beaufortFromQuery(`?${BEAUFORT_PARAM}=3`)).toBe(3)
  })
})

it('freezes only an explicitly valid ocean phase time', () => {
  expect(oceanTimeFromQuery('')).toBeUndefined()
  expect(oceanTimeFromQuery('?oceanTime=0')).toBe(0)
  expect(oceanTimeFromQuery('?oceanTime=17.25')).toBe(17.25)
  for (const value of ['', '-1', 'NaN', 'Infinity', 'bad']) {
    expect(() => oceanTimeFromQuery(`?oceanTime=${value}`)).toThrow('ocean weather:')
  }
})
