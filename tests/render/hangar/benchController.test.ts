import { describe, expect, it } from 'vitest'
import { createBenchController, REST } from '../../../src/render/hangar/benchController.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'

const f4f = loadAircraftSpec('f4f-wildcat')
const run = (c: ReturnType<typeof createBenchController>, seconds: number, hz = 60): void => {
  for (let i = 0; i < Math.round(seconds * hz); i++) c.advance(1 / hz)
}

describe('createBenchController', () => {
  it('starts at rest: gear down, flaps up, stores on, nothing cycling', () => {
    expect(createBenchController(f4f).state()).toEqual(REST)
    expect(REST).toEqual({ gearFraction: 1, flapFraction: 0, throttle: 0, bombs: true, rockets: true, cycling: null })
  })

  it("Cycle runs the gear up over the spec's own travelSeconds, as the sim's gearAfter does", () => {
    const c = createBenchController(f4f)
    c.startCycle('gear')
    run(c, f4f.gear.travelSeconds - 0.1)
    expect(c.state().gearFraction).toBeGreaterThan(0)
    expect(c.state().cycling).toBe('gear')
    run(c, 0.2)
    expect(c.state()).toMatchObject({ gearFraction: 0, cycling: null })
    expect(c.advance(1 / 60)).toBeNull()
  })

  it('a second press mid-cycle reverses it; the flaps come back up', () => {
    const c = createBenchController(f4f)
    c.startCycle('flaps')
    run(c, 1)
    const mid = c.state().flapFraction
    c.startCycle('flaps')
    run(c, 0.5)
    expect(c.state().flapFraction).toBeLessThan(mid)
    run(c, f4f.flap.travelSeconds)
    expect(c.state()).toMatchObject({ flapFraction: 0, cycling: null })
  })

  it('moving the slider cancels that part cycle instead of fighting it', () => {
    const c = createBenchController(f4f)
    c.startCycle('gear')
    run(c, 1)
    expect(c.set({ gearFraction: 0.8 })).toEqual({ gearFraction: 0.8 })
    expect(c.state()).toMatchObject({ gearFraction: 0.8, cycling: null })
    expect(c.advance(1 / 60)).toBeNull()
  })

  it('advance hands the model the moving part only', () => {
    const c = createBenchController(f4f)
    c.startCycle('gear')
    const p = c.advance(1 / 60)!
    expect(Object.keys(p)).toEqual(['gearFraction'])
    expect(p.gearFraction).toBeCloseTo(1 - 1 / 60 / f4f.gear.travelSeconds, 12)
  })

  it('stores toggles are state, and a fresh controller (a new model) has them back on', () => {
    const c = createBenchController(f4f)
    expect(c.set({ bombs: false })).toEqual({ bombs: false })
    expect(c.state().bombs).toBe(false)
    expect(createBenchController(f4f).state().bombs).toBe(true)
  })

  it('with no spec (a ship or a building) Cycle does nothing', () => {
    const c = createBenchController(null)
    c.startCycle('gear')
    expect(c.state().cycling).toBeNull()
    expect(c.advance(1)).toBeNull()
  })
})
