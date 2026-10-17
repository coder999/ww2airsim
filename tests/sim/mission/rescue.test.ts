/**
 * F10B (A4's primitives, Decision 12): `near` (a plane-state field), `landedNear` and `pickup`, and the rescue vehicle they work on.
 * Unit level, on the mission fixture over a flat sea: the player is the Catalina afloat, the raft is a floating `survivors: 3` vehicle 600 m east.
 * Each claim was shown red against its fault (mutations listed in the F10B handoff).
 *
 * Distances are metric here (content keys are SI); the briefing's units are 150 yd = 137.16 m, 100 ft = 30.48 m, 2 kt = 1.029 m/s.
 */
import { describe, expect, it } from 'vitest'
import { parseScenario } from '../../../src/sim/scenario.js'
import { advance, playerAircraft, withAircraftState, type World } from '../../../src/sim/loop.js'
import { DT } from '../../../src/sim/flight/model.js'
import { ticksFor } from '../../../src/sim/mission/state.js'
import { worldChecksum } from '../../../src/flightRecorder/checksum.js'
import { destroyNow } from './fly.js'
import { flatField, missionWorld, progressOf, scenario, steps } from './fixture.js'
import { restAt, restState, stagedTouchdown } from './waterFly.js'

const RAFT = { x: 600, z: 0 }
const YD = 0.9144
const FT = 0.3048
const KT = 0.514444
const vehicles = [
  { id: 'raft-1', spec: 'type-a3-life-raft-survivors', tags: ['raft'], waypoints: [[RAFT.x, RAFT.z]], speedMps: 0, survivors: 3, side: 'allied' },
  { id: 'raft-2', spec: 'type-a3-life-raft-survivors', tags: ['raft'], waypoints: [[RAFT.x, RAFT.z + 2000]], speedMps: 0, survivors: 1, side: 'allied' },
]
const obj = (extra: Record<string, unknown>) => ({ id: 'o', label: 'O', priority: 'primary', ...extra })
const world = (objectives: unknown[], extra: Record<string, unknown> = {}): World<undefined> => missionWorld({
  player: 'pby-1',
  aircraft: [{ id: 'pby-1', spec: 'pby-5a-catalina', afloatAt: { position: [0, 0], headingDeg: 90 } }],
  vehicles, objectives, ...extra,
}, flatField(0))

/** The player pinned afloat at (x, z), moving `speed` m/s east, for `ticks` ticks (a staged position; `advance` still steps everything else). */
function pin(w: World<undefined>, x: number, z: number, speed: number, ticks: number): World<undefined> {
  let world = w
  for (let i = 0; i < ticks; i++) {
    world = withAircraftState(world, world.player, restState(world, x, z, 90, speed))
    world = advance(world, DT).world
  }
  return world
}

describe('the rescue vehicle', () => {
  it('a raft placed with survivors floats on the sea, carries the count, and is a floating vehicle with no rig (its model is equipment)', () => {
    const w = world([obj({ kind: 'reach', point: { x: 90000, z: 90000 }, radiusM: 100 })])
    const raft = w.vehicles.find((v) => v.id === 'raft-1')!
    expect(raft.survivors).toBe(3)
    expect(raft.spec.floats).toBe(true)
    expect(raft.spec.view).toEqual({ model: 'type-a3-life-raft-survivors', kind: 'equipment' })
    expect(raft.state.position.y).toBe(0)
    // every other vehicle carries no count at all, so a world with none is byte-identical to before
    expect(w.vehicles.some((v) => v.id !== 'raft-1' && v.id !== 'raft-2' && 'survivors' in v)).toBe(false)
  })
})

describe('near (a plane-state field)', () => {
  const near = (radiusM: number, entity = 'raft-1') => world([obj({ kind: 'state', near: { entity, radiusM } })])
  it('holds inside the radius and not outside it, measured horizontally', () => {
    expect(progressOf(pin(near(500), 0, 0, 0, 2), 'o').status).toBe('active') // 600 m from the raft
    expect(progressOf(pin(near(500), 200, 0, 0, 2), 'o').status).toBe('complete') // 400 m
    expect(progressOf(pin(near(500), 600, 400, 0, 2), 'o').status).toBe('complete') // 400 m abeam
    expect(progressOf(pin(near(500), 600, 600, 0, 2), 'o').status).toBe('active')
  })
  it('a tag means its nearest living member, and a destroyed raft is never near', () => {
    expect(progressOf(pin(near(500, 'raft'), 600, 2000, 0, 2), 'o').status).toBe('complete') // raft-2 is right here
    const dead = destroyNow(near(500), ['raft-1'])
    expect(progressOf(pin(dead, 600, 0, 0, 2), 'o').status).toBe('active')
  })
  it('names a missing entity at build time, and an empty plane-state test is still empty', () => {
    expect(() => near(500, 'nobody')).toThrow(/matches no entity id or tag/)
    expect(() => parseScenario(scenario({ objectives: [obj({ kind: 'state' })] }))).toThrow(/needs at least one of/)
  })
  it('works as a trigger condition too', () => {
    const w = world([obj({ kind: 'reach', point: { x: 90000, z: 90000 }, radiusM: 100 })], {
      triggers: [{ id: 'see', when: { state: { near: { entity: 'raft-1', radiusM: 500 } } }, then: [{ message: 'Flare in sight' }] }],
    })
    expect(pin(w, 0, 0, 0, 2).mission!.fired).toEqual([])
    expect(pin(w, 600, 0, 0, 2).mission!.fired).toEqual(['see'])
  })
})

describe('landedNear (a supported water landing within a radius)', () => {
  const landedNear = (extra: Record<string, unknown> = { entity: 'raft-1', radiusM: 150 * YD }) => world([obj({ kind: 'landedNear', ...extra })])
  /** A real touchdown at (x, 0), then the airplane at rest a little farther on: the report fires at rest, the TOUCHDOWN is what is measured. */
  const landAt = (w: World<undefined>, x: number, restX = x + 300) => restAt(stagedTouchdown(w, x, 0), restX, 0)

  it('a touchdown 100 yd from the raft completes it; the roll-out that follows is not measured', () => {
    const w = landAt(landedNear(), RAFT.x - 100 * YD)
    expect(w.mission!.log.filter((e) => e.kind === 'landing')).toHaveLength(1)
    expect(progressOf(w, 'o').status).toBe('complete')
  })
  it('a touchdown 200 yd off does not satisfy it, and the landing is still an intermediate one (no debrief), so the pilot may try again', () => {
    const w = landAt(landedNear(), RAFT.x - 200 * YD)
    expect(progressOf(w, 'o').status).toBe('active')
    const landing = w.mission!.log.find((e) => e.kind === 'landing')
    expect(landing).toMatchObject({ advanced: 'o', intermediate: true })
  })
  it('a completed landedNear is intermediate too, so the sortie goes on to the pickup', () => {
    const w = landAt(landedNear(), RAFT.x - 50 * YD)
    expect(w.mission!.log.find((e) => e.kind === 'landing')).toMatchObject({ advanced: 'o', intermediate: true })
  })
  it('the point variant measures against a world point, and a tag measures against its nearest member', () => {
    expect(progressOf(landAt(landedNear({ point: { x: 1000, z: 0 }, radiusM: 150 * YD }), 1000 - 100 * YD), 'o').status).toBe('complete')
    expect(progressOf(landAt(landedNear({ point: { x: 1000, z: 0 }, radiusM: 150 * YD }), 1000 - 200 * YD), 'o').status).toBe('active')
    expect(progressOf(landAt(landedNear({ entity: 'raft', radiusM: 150 * YD }), RAFT.x - 100 * YD), 'o').status).toBe('complete')
  })
  it('needs exactly one of entity and point', () => {
    expect(() => landedNear({ radiusM: 100 })).toThrow(/exactly one of entity and point/)
    expect(() => landedNear({ entity: 'raft-1', point: { x: 0, z: 0 }, radiusM: 100 })).toThrow(/exactly one of entity and point/)
  })
  it('a landing before it is waiting does nothing to it (an `after` objective is inactive)', () => {
    const w = world([
      obj({ id: 'first', kind: 'reach', point: { x: 90000, z: 90000 }, radiusM: 100 }),
      obj({ id: 'o', kind: 'landedNear', entity: 'raft-1', radiusM: 150 * YD, after: 'first' }),
    ])
    const landed = landAt(w, RAFT.x)
    expect(progressOf(landed, 'o').status).toBe('inactive')
    expect(landed.mission!.log.find((e) => e.kind === 'landing')).toMatchObject({ advanced: null, intermediate: false })
  })
})

describe('pickup (stay near, slow, for a dwell; the survivors come aboard)', () => {
  const pickup = (extra: Record<string, unknown> = {}) => world([obj({ kind: 'pickup', raft: 'raft-1', survivors: 3, withinM: 100 * FT, groundSpeedMps: 2 * KT, dwellS: 20, ...extra })])
  const DWELL = ticksFor(20)

  it('a pass at 8 kt does not pick up a stationary raft, however many times it passes', () => {
    const w = pin(pickup(), RAFT.x - 20, RAFT.z, 8 * KT, DWELL + 60)
    expect(progressOf(w, 'o')).toMatchObject({ status: 'active', count: 0, heldTicks: 0 })
  })
  it('20 s unbroken within 100 ft below 2 kt takes three aboard, and not a tick sooner', () => {
    let w = pin(pickup(), RAFT.x - 20, RAFT.z, 1 * KT, DWELL - 2)
    expect(progressOf(w, 'o').status).toBe('active')
    w = pin(w, RAFT.x - 20, RAFT.z, 1 * KT, 3)
    expect(progressOf(w, 'o')).toMatchObject({ status: 'complete', count: 3 })
  })
  it('the dwell resets when the speed rises, or the airplane drifts out, and must then run its full 20 s again', () => {
    let w = pin(pickup(), RAFT.x - 20, RAFT.z, 1 * KT, DWELL - 30)
    expect(progressOf(w, 'o').heldTicks).toBeGreaterThan(0)
    w = pin(w, RAFT.x - 20, RAFT.z, 3 * KT, 1)
    expect(progressOf(w, 'o').heldTicks).toBe(0)
    w = pin(w, RAFT.x - 20, RAFT.z, 1 * KT, DWELL - 30)
    expect(progressOf(w, 'o').status).toBe('active')
    w = pin(w, RAFT.x - 120 * FT, RAFT.z, 1 * KT, 1) // 120 ft out
    expect(progressOf(w, 'o').heldTicks).toBe(0)
    w = pin(w, RAFT.x - 20, RAFT.z, 1 * KT, DWELL + 2)
    expect(progressOf(w, 'o')).toMatchObject({ status: 'complete', count: 3 })
  })
  it('a raft that is destroyed takes its survivors with it: the objective fails, it is not picked up', () => {
    const w = pin(destroyNow(pickup(), ['raft-1']), RAFT.x - 20, RAFT.z, 1 * KT, 5)
    expect(progressOf(w, 'o').status).toBe('failed')
  })
  it('asks no more survivors than the craft carries, names a vehicle, and a second raft is its own pickup', () => {
    expect(() => pickup({ survivors: 4 })).toThrow(/asks for 4 survivors from "raft-1", which carries 3/)
    expect(() => pickup({ raft: 'raft', survivors: 1 })).toThrow(/must be exactly one vehicle/)
    expect(() => pickup({ raft: 'pby-1' })).toThrow(/not a vehicle/)
    const w = pin(pickup({ raft: 'raft-2', survivors: 1 }), RAFT.x, RAFT.z + 2000 - 10, 0, DWELL + 2)
    expect(progressOf(w, 'o')).toMatchObject({ status: 'complete', count: 1 })
  })
  it('the aboard count is mission state: it survives a structured clone, a JSON round trip and a Continue (the latched script), with an identical checksum', () => {
    const done = pin(pickup(), RAFT.x - 20, RAFT.z, 0, DWELL + 2)
    expect(progressOf(done, 'o')).toMatchObject({ status: 'complete', count: 3 })
    const cloned = structuredClone(done)
    const parsed = JSON.parse(JSON.stringify(done)) as World<undefined>
    expect(worldChecksum(cloned)).toBe(worldChecksum(done))
    expect(progressOf(parsed, 'o')).toMatchObject({ status: 'complete', count: 3 })
    // Continue: more ticks (and a latched script) never take them off again.
    const later = steps(pin(done, RAFT.x + 3000, 0, 40, 5), 120)
    expect(progressOf(later, 'o')).toMatchObject({ status: 'complete', count: 3 })
  })
  it('the player alone is measured: an AI aircraft at the raft is not a pickup', () => {
    const w = pin(pickup(), 5000, 5000, 0, 5)
    expect(playerAircraft(w).state.position.x).toBe(5000)
    expect(progressOf(w, 'o').heldTicks).toBe(0)
  })
})
