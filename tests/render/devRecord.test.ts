import { describe, expect, it } from 'vitest'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { recordDevSortiesFromQuery, sortieIsDev } from '../../src/render/devRecord.js'
import { SCENARIO_OPTIONS } from '../../src/render/titleScreen.js'

const hellcat = loadAircraftSpec('f6f-hellcat')
const zero = loadAircraftSpec('a6m2-zero')
const option = (id: string) => SCENARIO_OPTIONS.find((o) => o.value === id)!

describe('?recordDevSorties (SF-R6)', () => {
  it('a DEV build honors it; production ignores it; absent is off', () => {
    expect(recordDevSortiesFromQuery('?recordDevSorties', true)).toBe(true)
    expect(recordDevSortiesFromQuery('?scenario=furball-range&recordDevSorties', true)).toBe(true)
    expect(recordDevSortiesFromQuery('?recordDevSorties', false)).toBe(false)
    expect(recordDevSortiesFromQuery('', true)).toBe(false)
  })
})

describe('sortieIsDev: a sortie is Dev only if it needed Dev (A5); a quick launch always is (A6)', () => {
  it('a legal sortie is recorded, whatever the box said', () => {
    expect(sortieIsDev(option('free-flight'), hellcat, 'both', false)).toBe(false)
    expect(sortieIsDev(option('deck-quals'), hellcat, 'clean', false)).toBe(false)
  })
  it('a Dev-only scenario, an enemy aircraft, a stationless loadout each make it Dev', () => {
    expect(sortieIsDev(option('furball-range'), hellcat, 'both', false)).toBe(true)
    expect(sortieIsDev(option('free-flight'), zero, 'clean', false)).toBe(true)
    expect(sortieIsDev(option('free-flight'), { ...hellcat, side: 'allied', stores: undefined }, 'bombs', false)).toBe(true)
  })
  it('a carrier start on a non-carrier-capable aircraft makes it Dev', () => {
    expect(sortieIsDev(option('deck-quals'), { ...hellcat, carrierCapable: false }, 'clean', false)).toBe(true)
  })
  it('a quick launch is always Dev', () => {
    expect(sortieIsDev(option('free-flight'), hellcat, 'both', true)).toBe(true)
  })
})
