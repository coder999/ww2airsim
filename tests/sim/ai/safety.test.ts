import { describe, expect, it } from 'vitest'
import {
  FLOOR_M, G_BUDGET, OVERSPEED_THROTTLE_CUT, finishControls, heightAboveGround, limitLoadFactor, needsFloorRecovery, safetyOverride,
} from '../../../src/sim/ai/safety.js'
import { pitchPerUnitCommand } from '../../../src/sim/ai/liftVector.js'
import { createState } from '../../../src/sim/flight/state.js'
import { createTerrainField } from '../../../src/sim/world/terrain.js'
import { parseTerrainHeader } from '../../../src/sim/world/schema.js'
import { qRotate } from '../../../src/sim/math/quat.js'
import { length, v3 } from '../../../src/sim/math/vec3.js'
import type { AircraftEntity } from '../../../src/sim/loop.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const zero = loadAircraftSpec('a6m2-zero')
const G = 9.80665
const loadOf = (s: ReturnType<typeof createState>, spec: typeof f6f, pitch: number) =>
  length(s.velocity) * pitch * pitchPerUnitCommand(s, spec) / G + qRotate(s.attitude, v3(0, 1, 0)).y
const plateau = createTerrainField(parseTerrainHeader({
  centreLatDeg: 10.8, centreLonDeg: 125.3, halfExtentM: 100000,
  finestSamples: 8193, levels: 13, encoding: 'int16-decimetres',
}), 12, new Int16Array(9).fill(10000)) // 1,000 m everywhere
const entity = (spec: typeof f6f, state: ReturnType<typeof createState>): AircraftEntity<undefined> =>
  ({ id: 'a', spec, state, previous: state, controls: { roll: 0, pitch: 0, yaw: 0, throttle: 0.7 }, assistMemory: undefined, impact: null, parked: false })

describe('limitLoadFactor (7c spec §3.2)', () => {
  const fast = createState({ position: v3(0, 3000, 0), velocity: v3(150, 0, 0) })

  it('cuts a full pull to G_BUDGET x gLimit', () => {
    const c = limitLoadFactor(fast, f6f, { roll: 0, pitch: 1, yaw: 0, throttle: 1 })
    expect(c.pitch).toBeLessThan(1)
    expect(loadOf(fast, f6f, c.pitch)).toBeCloseTo(G_BUDGET * f6f.limits.gLimit, 9)
  })

  it('floors a full push at -G_BUDGET x gLimit for an engine that runs under negative g (ruling R5)', () => {
    const c = limitLoadFactor(fast, f6f, { roll: 0, pitch: -1, yaw: 0, throttle: 1 })
    expect(loadOf(fast, f6f, c.pitch)).toBeCloseTo(-G_BUDGET * f6f.limits.gLimit, 9)
  })

  it('floors it at 0 g for an engine with negativeGCutout, so an AI Zero never starves its own engine', () => {
    const c = limitLoadFactor(fast, zero, { roll: 0, pitch: -1, yaw: 0, throttle: 1 })
    expect(loadOf(fast, zero, c.pitch)).toBeCloseTo(0, 9)
  })

  it('leaves a gentle command exactly alone', () => {
    const gentle = { roll: 0.3, pitch: 0.1, yaw: 0, throttle: 0.7 }
    expect(limitLoadFactor(fast, f6f, gentle)).toEqual(gentle)
  })
})

describe('the ground floor', () => {
  it('uses sea level when there is no terrain', () => {
    expect(heightAboveGround(createState({ position: v3(0, 1300, 0) }), null, [])).toBe(1300)
  })

  it('an AI over high ground measures height above that ground (Review Focus 2)', () => {
    const s = createState({ position: v3(0, 1300, 0), velocity: v3(120, 0, 0) })
    expect(heightAboveGround(s, plateau, [])).toBeCloseTo(300, 6)
    expect(needsFloorRecovery(s, plateau, [])).toBe(true)
    expect(needsFloorRecovery(s, null, [])).toBe(false)
  })

  it('acts below FLOOR_M + FLOOR_BUFFER_M, or within FLOOR_TIME_S of reaching it', () => {
    expect(needsFloorRecovery(createState({ position: v3(0, 390, 0), velocity: v3(120, 0, 0) }), null, [])).toBe(true)
    expect(needsFloorRecovery(createState({ position: v3(0, 3000, 0), velocity: v3(120, 0, 0) }), null, [])).toBe(false)
    // (1000 - 400) / 160 = 3.75 s < 4 s; (1000 - 400) / 100 = 6 s.
    expect(needsFloorRecovery(createState({ position: v3(0, 1000, 0), velocity: v3(100, -160, 0) }), null, [])).toBe(true)
    expect(needsFloorRecovery(createState({ position: v3(0, 1000, 0), velocity: v3(100, -100, 0) }), null, [])).toBe(false)
    expect(FLOOR_M).toBe(300)
  })
})

describe('safetyOverride and finishControls', () => {
  it('recovers wings-level and pulls, at full throttle, when the floor is close', () => {
    const o = safetyOverride(entity(f6f, createState({ position: v3(0, 350, 0), velocity: v3(120, -20, 0) })), null, [], null)
    expect(o?.mode).toBe('recover')
    expect(o!.controls.pitch).toBeGreaterThan(0)
    expect(o!.controls.throttle).toBe(1)
    expect(o!.controls.fire).toBeUndefined()
  })

  it('pulls out, throttle closed, at 0.95 x the dive limit and descending (ruling R7)', () => {
    const o = safetyOverride(entity(f6f, createState({ position: v3(0, 3000, 0), velocity: v3(200, -80, 0) })), null, [], null)
    expect(o?.mode).toBe('overspeed')
    expect(o!.controls.throttle).toBe(0)
  })

  it('does nothing in ordinary flight', () => {
    expect(safetyOverride(entity(f6f, createState({ position: v3(0, 3000, 0), velocity: v3(150, 0, 0) })), null, [], null)).toBeNull()
  })

  it('closes the throttle from 0.9 x the dive limit, whatever the maneuver asked', () => {
    const v = OVERSPEED_THROTTLE_CUT * f6f.limits.diveSpeedMps + 1
    const a = entity(f6f, createState({ position: v3(0, 3000, 0), velocity: v3(v, 0, 0) }))
    expect(finishControls(a, { roll: 0, pitch: 0, yaw: 0, throttle: 1 }, 0, 0, null).controls.throttle).toBe(0)
  })
})
