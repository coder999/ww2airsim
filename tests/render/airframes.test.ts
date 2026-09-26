// tests/render/airframes.test.ts
import { describe, expect, it } from 'vitest'
import { readdirSync } from 'node:fs'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { AIRFRAME_MODELS, airframeFor } from '../../src/render/scene/airframes.js'
import { propAngle, PROP_MAX_RAD_PER_SEC } from '../../src/render/scene/airframe.js'

const aircraftIds = readdirSync('content/aircraft').filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''))

describe('the airframe registry (A6M Zero spec §7.2)', () => {
  it('finds at least the two shipped aircraft files', () => {
    expect(aircraftIds).toEqual(expect.arrayContaining(['f6f-hellcat', 'f4f-wildcat']))
  })

  it.each(aircraftIds)('content/aircraft/%s.json names a registered view.model', (id) => {
    const model = loadAircraftSpec(id).view.model
    expect(Object.keys(AIRFRAME_MODELS), `${id}.json names "${model}"`).toContain(model)
  })

  it('an unregistered id throws naming the id and the registered ones, including prototype keys', () => {
    expect(() => airframeFor('a6m2-zero')).toThrow(/"a6m2-zero".*registered: wildcat/)
    expect(() => airframeFor('constructor')).toThrow(/"constructor"/)
  })
})

describe('propAngle', () => {
  it('advances by throttle * PROP_MAX_RAD_PER_SEC * frameS and wraps to [0, 2 pi)', () => {
    expect(propAngle(0, 0.5, 0.1)).toBeCloseTo(0.5 * PROP_MAX_RAD_PER_SEC * 0.1, 12)
    expect(propAngle(0, 0, 5)).toBe(0)
    const a = propAngle(6, 1, 0.1)
    expect(a).toBeGreaterThanOrEqual(0)
    expect(a).toBeLessThan(2 * Math.PI)
    expect(a).toBeCloseTo((6 + 4) % (2 * Math.PI), 12)
  })
})
