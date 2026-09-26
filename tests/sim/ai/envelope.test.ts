import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { airframeEnvelope, relativeEnvelope } from '../../../src/sim/ai/envelope.js'
import { createState } from '../../../src/sim/flight/state.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const zero = loadAircraftSpec('a6m2-zero')
const at = (fuelKg: number) => createState({ fuelKg })

describe('airframeEnvelope (7c spec §3.3), derived from fields every spec carries', () => {
  it('F6F at the scenario fuel of 400 kg', () => {
    const e = airframeEnvelope(f6f, at(400))
    expect(e.wingLoadingNPerM2).toBeCloseTo(1450.6131, 3)
    expect(e.powerLoadingWPerN).toBeCloseTo(24.8431, 3)
    expect(e.cornerSpeedMps).toBeCloseTo(119.9786, 3) // 43.81 * sqrt(7.5)
    expect(e.diveSpeedMps).toBe(216)
    expect(e.gLimit).toBe(7.5)
  })

  it('F6F at testMassKg reproduces the spec table\'s 1,780 N/m^2', () => {
    const e = airframeEnvelope(f6f, at(f6f.reference.testMassKg - f6f.mass.emptyKg))
    expect(e.wingLoadingNPerM2).toBeCloseTo(1780.4, 0)
  })

  it('A6M2 at 400 kg', () => {
    const e = airframeEnvelope(zero, at(400))
    expect(e.wingLoadingNPerM2).toBeCloseTo(908.9943, 3)
    expect(e.powerLoadingWPerN).toBeCloseTo(23.3692, 3)
    expect(e.cornerSpeedMps).toBeCloseTo(92.2573, 3) // 34.87 * sqrt(7.0)
  })

  it('burning fuel lowers the wing loading', () => {
    expect(airframeEnvelope(f6f, at(100)).wingLoadingNPerM2).toBeLessThan(airframeEnvelope(f6f, at(600)).wingLoadingNPerM2)
  })
})

describe('relativeEnvelope', () => {
  const hellcat = airframeEnvelope(f6f, at(400))
  const a6m = airframeEnvelope(zero, at(400))

  it('a Hellcat against a Hellcat is neutral', () => {
    const r = relativeEnvelope(hellcat, hellcat)
    expect(r.turnAdvantage).toBe(1)
    expect(r.pairing).toBe('neutral')
  })

  it('a Hellcat against the Zero reads boom-and-zoom, the Zero against a Hellcat turnfight', () => {
    const h = relativeEnvelope(hellcat, a6m)
    expect(h.turnAdvantage).toBeCloseTo(0.6266, 4)
    expect(h.pairing).toBe('boom-and-zoom')
    expect(h.climbAdvantage).toBeCloseTo(24.8431 / 23.3692, 3)
    expect(h.diveAdvantage).toBeCloseTo(216 / 166.67, 3)
    const z = relativeEnvelope(a6m, hellcat)
    expect(z.turnAdvantage).toBeCloseTo(1.5958, 4)
    expect(z.pairing).toBe('turnfight')
  })
})

describe('no AI code names an airframe (7c spec §7)', () => {
  it('no file under src/sim/ai contains a content aircraft id', () => {
    const dir = new URL('../../../src/sim/ai/', import.meta.url)
    const ids = readdirSync(new URL('../../../content/aircraft/', import.meta.url))
      .filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''))
    expect(ids.length).toBeGreaterThanOrEqual(3)
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
      const text = readFileSync(new URL(file, dir), 'utf8')
      for (const id of ids) expect(text.includes(id), `${file} names ${id}`).toBe(false)
    }
  })
})
