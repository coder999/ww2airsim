import { describe, expect, it } from 'vitest'
import {
  FLOOR_BUFFER_M, FLOOR_M, G_BUDGET, OVERSPEED_THROTTLE_CUT, PURSUIT_FLOOR_M, finishControls, floorTriggerM, heightAboveGround,
  limitLoadFactor, needsFloorRecovery, safetyOverride,
} from '../../../src/sim/ai/safety.js'
import { pilotTick } from '../../../src/sim/ai/pilotTick.js'
import { VETERAN_SKILL, initialDecision, type PilotManeuver } from '../../../src/sim/ai/pilot.js'
import { createWorldOf } from '../../../src/sim/loop.js'
import { deckOf } from '../../../src/sim/world/deck.js'
import { createShipState } from '../../../src/sim/world/ships.js'
import { SEA_LEVEL_M, type TerrainField } from '../../../src/sim/world/terrain.js'
import type { Deck } from '../../../src/sim/world/deck.js'
import type { Vec3 } from '../../../src/sim/math/vec3.js'
import { pitchPerUnitCommand } from '../../../src/sim/ai/liftVector.js'
import { createState } from '../../../src/sim/flight/state.js'
import { createTerrainField } from '../../../src/sim/world/terrain.js'
import { parseTerrainHeader } from '../../../src/sim/world/schema.js'
import { qRotate } from '../../../src/sim/math/quat.js'
import { length, v3 } from '../../../src/sim/math/vec3.js'
import type { AircraftEntity } from '../../../src/sim/loop.js'
import { loadAircraftSpec, loadShipSpec } from '../../../tools/content/load.js'

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

describe('the pursuit floor (Mark, 2026-09-26: "ai chases you unless under 50 *feet*")', () => {
  // One pilotTick with the intent held (no rescore until far in the future),
  // perceiving the target at `seen`: the safety mode it flew.
  const safetyOf = (
    intent: PilotManeuver, selfAt: Vec3, seen: Vec3, terrain: TerrainField | null = null, decks: readonly Deck[] = [], vy = 0,
  ): string => {
    const decision = { ...initialDecision(), maneuver: intent, nextRescoreS: 1e9, observedTargetPosition: seen, observedTargetVelocity: v3(110, 0, 0) }
    const self = { ...entity(f6f, createState({ position: selfAt, velocity: v3(120, vy, 0) })), id: 'p', pilot: { target: 't', skill: VETERAN_SKILL, decision } }
    const target = { ...entity(f6f, createState({ position: seen, velocity: v3(110, 0, 0) })), id: 't' }
    const w = createWorldOf({ aircraft: [self, target], player: 't' })
    return pilotTick(self, w.aircraft, { nowS: 1 / 60, terrain, decks, wind: null, combat: w.combat }).pilot!.decision.safety
  }

  it('is 50 ft, Mark\'s value, not a tuning value', () => {
    expect(PURSUIT_FLOOR_M).toBeCloseTo(50 * 0.3048, 9)
  })

  it('without a pursued target, the trigger is today\'s FLOOR_M + FLOOR_BUFFER_M', () => {
    expect(floorTriggerM(null)).toBe(FLOOR_M + FLOOR_BUFFER_M)
  })

  it('follows a low target down, but never below 50 ft, and never above today\'s trigger', () => {
    expect(floorTriggerM(100)).toBeLessThanOrEqual(100)
    expect(floorTriggerM(100)).toBeGreaterThanOrEqual(PURSUIT_FLOOR_M)
    expect(floorTriggerM(10)).toBe(PURSUIT_FLOOR_M)
    expect(floorTriggerM(-5000)).toBe(PURSUIT_FLOOR_M)
    expect(floorTriggerM(5000)).toBe(FLOOR_M + FLOOR_BUFFER_M)
    // Monotonic: a lower target never raises the floor.
    for (let h = 0; h < 1000; h += 10) expect(floorTriggerM(h)).toBeLessThanOrEqual(floorTriggerM(h + 10))
  })

  it('a Pursue pilot at 200 m chasing a target at 100 m does not recover; at 12 m it does (over the sea, no terrain)', () => {
    expect(safetyOf('pursue', v3(0, 200, 0), v3(1000, 100, 0))).toBe('none')
    expect(safetyOf('pursue', v3(0, 12, 0), v3(1000, 100, 0))).toBe('recover')
  })

  it('rejecting side: the same pilot at 200 m chasing a target at 1,000 m keeps today\'s floor', () => {
    expect(safetyOf('pursue', v3(0, 200, 0), v3(1000, 1000, 0))).toBe('recover')
  })

  it('Extend and Break at 200 m keep today\'s floor, whatever the target\'s height', () => {
    expect(safetyOf('extend', v3(0, 200, 0), v3(1000, 100, 0))).toBe('recover')
    expect(safetyOf('break', v3(0, 200, 0), v3(1000, 100, 0))).toBe('recover')
    // Rejecting side: well above today's trigger, they fly on.
    expect(safetyOf('extend', v3(0, 500, 0), v3(1000, 100, 0))).toBe('none')
    expect(safetyOf('break', v3(0, 500, 0), v3(1000, 100, 0))).toBe('none')
  })

  it('a target below 50 ft is not chased lower: the pilot holds at its 50 ft floor', () => {
    expect(safetyOf('pursue', v3(0, 14, 0), v3(1000, 10, 0))).toBe('recover')
    expect(safetyOf('pursue', v3(0, 20, 0), v3(1000, 10, 0))).toBe('none')
  })

  it('the projected-impact check still applies at 50 ft (FLOOR_TIME_S at the current sink rate)', () => {
    // (60 - 15.24) / 15 = 2.98 s, inside 4 s; (60 - 15.24) / 5 = 8.95 s, outside.
    expect(safetyOf('pursue', v3(0, 60, 0), v3(1000, 20, 0), null, [], -15)).toBe('recover')
    expect(safetyOf('pursue', v3(0, 60, 0), v3(1000, 20, 0), null, [], -5)).toBe('none')
    expect(needsFloorRecovery(createState({ position: v3(0, 60, 0), velocity: v3(120, -15, 0) }), null, [], PURSUIT_FLOOR_M)).toBe(true)
    expect(needsFloorRecovery(createState({ position: v3(0, 60, 0), velocity: v3(120, -5, 0) }), null, [], PURSUIT_FLOOR_M)).toBe(false)
  })

  it('below today\'s trigger it also projects the downward acceleration; rejecting sides', () => {
    // 7c Task 15's soak case: 139 m, level, pulling about 3 g inverted
    // (-39 m/s² vertically). 139 - ½·39·16 = -173 m after 4 s.
    const apex = createState({ position: v3(0, 139, 0), velocity: v3(90, 0, 0) })
    expect(needsFloorRecovery(apex, null, [], PURSUIT_FLOOR_M, -39)).toBe(true)
    // Rejecting sides: a gentle -10 m/s² stays above (139 - 80 = 59 m); no
    // acceleration, or climbing acceleration, is the sink-rate check alone.
    expect(needsFloorRecovery(apex, null, [], PURSUIT_FLOOR_M, -10)).toBe(false)
    expect(needsFloorRecovery(apex, null, [], PURSUIT_FLOOR_M, 0)).toBe(false)
    expect(needsFloorRecovery(apex, null, [], PURSUIT_FLOOR_M, 20)).toBe(false)
    // Rejecting side: today's floor is unchanged. 700 m, -39 m/s² projects
    // to 388 m, under 400, but the term applies only below today's trigger.
    const high = createState({ position: v3(0, 700, 0), velocity: v3(90, 0, 0) })
    expect(needsFloorRecovery(high, null, [], floorTriggerM(null), -39)).toBe(false)
    expect(needsFloorRecovery(high, null, [], floorTriggerM(null))).toBe(false)
  })

  it('safetyOverride reads the acceleration from the previous tick, and none on a first tick', () => {
    const now = createState({ position: v3(0, 139, 0), velocity: v3(90, -39 / 60, 0), tick: 5 })
    const before = createState({ position: v3(0, 139, 0), velocity: v3(90, 0, 0), tick: 4 })
    const pulling = { ...entity(f6f, now), previous: before }
    expect(safetyOverride(pulling, null, [], null, PURSUIT_FLOOR_M)?.mode).toBe('recover')
    // Rejecting sides: the same state as its own previous (a first tick), or
    // a previous that is not the tick before, reads no acceleration.
    expect(safetyOverride({ ...entity(f6f, now), previous: now }, null, [], null, PURSUIT_FLOOR_M)).toBeNull()
    expect(safetyOverride({ ...pulling, previous: { ...before, tick: 2 } }, null, [], null, PURSUIT_FLOOR_M)).toBeNull()
  })

  it('over high ground, both heights are measured from the ground (the 1,000 m plateau)', () => {
    expect(safetyOf('pursue', v3(0, 1200, 0), v3(1000, 1100, 0), plateau)).toBe('none')
    expect(safetyOf('pursue', v3(0, 1012, 0), v3(1000, 1100, 0), plateau)).toBe('recover')
    expect(safetyOf('extend', v3(0, 1200, 0), v3(1000, 1100, 0), plateau)).toBe('recover')
    // Measured from sea level, the target at 1,100 m would put the floor at
    // today's 400 m, and the pilot at 200 m above the plateau would recover.
    expect(safetyOf('pursue', v3(0, 1200, 0), v3(1000, 1500, 0), plateau)).toBe('recover')
    // Rejecting side: over the sea the same altitudes are 1,012 and 1,200 m up.
    expect(safetyOf('pursue', v3(0, 1012, 0), v3(1000, 1100, 0), null)).toBe('none')
    expect(safetyOf('extend', v3(0, 1200, 0), v3(1000, 1100, 0), null)).toBe('none')
  })

  it('over a carrier deck, height is measured from the deck', () => {
    const cv = loadShipSpec('essex-cv')
    const state = createShipState({ position: v3(0, SEA_LEVEL_M, 0), headingRad: 0, speedMps: 0 })
    const deck = deckOf({ id: 'cv-1', spec: cv, state, previous: state, orders: { waypoints: [{ x: 0, z: 0 }, { x: 0, z: -1 }], speedMps: 0 } })!
    const deckY = deck.center.y
    expect(deckY).toBeGreaterThan(5)
    // A target below 50 ft, so the floor is exactly PURSUIT_FLOOR_M.
    expect(safetyOf('pursue', v3(deck.center.x, deckY + 12, deck.center.z), v3(3000, 10, 0), null, [deck])).toBe('recover')
    expect(safetyOf('pursue', v3(deck.center.x, deckY + 18, deck.center.z), v3(3000, 10, 0), null, [deck])).toBe('none')
    // Rejecting side: the same altitude off the deck is over the sea, 29 m up.
    expect(safetyOf('pursue', v3(3000, deckY + 12, 3000), v3(3000, 10, 0), null, [deck])).toBe('none')
  })
})
