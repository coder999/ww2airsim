import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { AircraftSpecSchema } from '../../src/sim/flight/schema.js'

describe('aircraft content schema validation', () => {
  it('content/aircraft/f6f-hellcat.json validates against AircraftSpecSchema', () => {
    const raw = JSON.parse(readFileSync('content/aircraft/f6f-hellcat.json', 'utf8'))
    expect(() => AircraftSpecSchema.parse(raw)).not.toThrow()
  })

  it('content/aircraft/f4f-wildcat.json validates against AircraftSpecSchema', () => {
    const raw = JSON.parse(readFileSync('content/aircraft/f4f-wildcat.json', 'utf8'))
    expect(() => AircraftSpecSchema.parse(raw)).not.toThrow()
  })
})
