import { describe, it, expect } from 'vitest'
import { surfaceAt } from '../../src/sim/contact.js'
import { SEA_LEVEL_M } from '../../src/sim/world/terrain.js'

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
