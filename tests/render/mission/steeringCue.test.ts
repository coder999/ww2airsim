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
    expect(cue.bearingRad).toBeCloseTo(0, 9)
    expect(cue.rangeMi).toBeCloseTo(1, 9)
    expect(cue.relativeAltitudeFt).toBeCloseTo((4000 - 3000) / 0.3048, 6)
  })

  it('reports right, behind and left relative to the nose', () => {
    const objective = (x: number, z: number) => [{ id: 'rally', label: 'Rally', priority: 'primary', kind: 'reach', point: { x, z }, radiusM: 100 }]
    expect(steeringCueFor(missionWorld({ objectives: objective(0, 1609.344) }), null)!.bearingRad).toBeCloseTo(Math.PI / 2, 9)
    expect(Math.abs(steeringCueFor(missionWorld({ objectives: objective(-1609.344, 0) }), null)!.bearingRad)).toBeCloseTo(Math.PI, 9)
    expect(steeringCueFor(missionWorld({ objectives: objective(0, -1609.344) }), null)!.bearingRad).toBeCloseTo(-Math.PI / 2, 9)
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
    expect(cue.relativeAltitudeFt).toBeCloseTo((4500 - 3000) / 0.3048, 6)
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
    expect(steeringCueFor(world, null)!.relativeAltitudeFt).toBe(0)
  })
})

describe('steeringCueLabel', () => {
  it('formats statute miles and signed feet with stable cockpit rounding', () => {
    expect(steeringCueLabel({ label: 'CAP station', bearingRad: 0, rangeMi: 6.74, relativeAltitudeFt: 2349, source: 'objective' }))
      .toBe('CAP STATION · 6.7 MI · ALT +2,300 FT')
    expect(steeringCueLabel({ label: 'Target', bearingRad: 0, rangeMi: 0.04, relativeAltitudeFt: -151, source: 'chart' }))
      .toBe('TARGET · 0.0 MI · ALT −200 FT')
  })
})
