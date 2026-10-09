import { describe, expect, it } from 'vitest'
import { v3 } from '../../../src/sim/math/vec3.js'
import { steeringCueFor, steeringCueLabel } from '../../../src/render/mission/steeringCue.js'
import { destroyAircraft, missionWorld, moveAircraft, putPlayer } from '../../sim/mission/fixture.js'

const EAST_ONE_MILE = { x: 1609.344, z: 0 }

describe('steeringCueFor', () => {
  it('is absent without a chart selection or mission objective', () => {
    expect(steeringCueFor(missionWorld({}), null)).toBeNull()
  })

  it('points from the aircraft nose to the first active primary objective', () => {
    const world = missionWorld({ objectives: [{
      id: 'rally', label: 'Rally', priority: 'primary', kind: 'reach',
      point: EAST_ONE_MILE, radiusM: 100, altitudeM: [4000, 4100],
    }] })
    const cue = steeringCueFor(world, null)!
    expect(cue.label).toBe('Rally')
    expect(cue.source).toBe('objective')
    expect(cue.rangeMi).toBeCloseTo(1, 9)
    expect(cue.target).toEqual({ x: 1609.344, y: 4000, z: 0 })
  })

  it('a chart selection overrides the automatic objective and uses the live entity altitude', () => {
    let world = missionWorld({ objectives: [
      { id: 'rally', label: 'Rally', priority: 'primary', kind: 'reach', point: EAST_ONE_MILE, radiusM: 100 },
      { id: 'raid', label: 'Raid', priority: 'secondary', kind: 'destroy', targets: ['raid'] },
    ] })
    world = moveAircraft(world, 'bandit-1', v3(0, 4500, -1609.344))
    const cue = steeringCueFor(world, 'aircraft:bandit-1')!
    expect(cue.source).toBe('chart')
    expect(cue.label).toBe('bandit-1')
    expect(cue.target).toEqual({ x: 0, y: 4500, z: -1609.344 })
  })

  it('a destroy objective chooses its nearest live resolved target', () => {
    const world = missionWorld({
      aircraft: [
        { id: 'f6f-1', spec: 'f6f-hellcat', airborneAt: { position: [0, 3000, 0], headingDeg: 90, speedMps: 120 } },
        { id: 'far', spec: 'f6f-hellcat', tags: ['raid'], airborneAt: { position: [8000, 3000, 0], headingDeg: 90, speedMps: 120 } },
        { id: 'near', spec: 'f6f-hellcat', tags: ['raid'], airborneAt: { position: [2000, 3000, 0], headingDeg: 90, speedMps: 120 } },
      ],
      objectives: [{ id: 'raid', label: 'Raid', priority: 'primary', kind: 'destroy', targets: ['raid'] }],
    })
    expect(steeringCueFor(world, null)!.rangeMi).toBeCloseTo(2000 / 1609.344, 9)
  })

  it('a stale destroyed chart selection falls back to the remaining objective target', () => {
    let world = missionWorld({ objectives: [
      { id: 'rally', label: 'Rally', priority: 'primary', kind: 'reach', point: EAST_ONE_MILE, radiusM: 100 },
      { id: 'raid', label: 'Raid', priority: 'secondary', kind: 'destroy', targets: ['raid'] },
    ] })
    world = destroyAircraft(world, 'bandit-1')
    expect(steeringCueFor(world, 'aircraft:bandit-1')).toMatchObject({ label: 'Rally', source: 'objective' })
  })

  it('standing orders do not mask a simultaneous recovery objective', () => {
    const world = missionWorld({ objectives: [
      { id: 'screen', label: 'Screen', priority: 'primary', kind: 'deny', hostiles: ['raid'], around: 'cv-1', radiusM: 5000 },
      { id: 'home', label: 'Recover', priority: 'primary', kind: 'land', at: 'cv-1' },
    ] })
    const cue = steeringCueFor(world, null)!
    expect(cue.label).toBe('Recover')
    expect(cue.source).toBe('objective')
  })

  it('reads level inside a station altitude band instead of chasing its midpoint', () => {
    let world = missionWorld({ objectives: [{
      id: 'rally', label: 'Rally', priority: 'primary', kind: 'hold', point: EAST_ONE_MILE,
      radiusM: 100, altitudeM: [2000, 4000], seconds: 60,
    }] })
    world = putPlayer(world, v3(0, 3000, 0), 120, 0)
    expect(steeringCueFor(world, null)!.target.y).toBe(3000)
  })
})

describe('steeringCueLabel', () => {
  it('names the destination and its range in statute miles, with no altitude', () => {
    expect(steeringCueLabel({ label: 'CAP station', rangeMi: 6.74 })).toBe('CAP STATION · 6.7 MI')
    expect(steeringCueLabel({ label: 'Target', rangeMi: 0.04 })).toBe('TARGET · 0.0 MI')
  })
})
