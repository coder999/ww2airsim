import { describe, expect, it } from 'vitest'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { createState } from '../../src/sim/flight/state.js'
import { qIdentity } from '../../src/sim/math/quat.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { createCombat } from '../../src/sim/weapons/combat.js'
import { waterSurfaceAt, waterSurfaceContext } from '../../src/sim/waterSurface.js'
import { createWaterWake, wakeOffFromQuery, waterWakeSources } from '../../src/render/scene/waterWake.js'

describe('shared watercraft surface wake', () => {
  it('has a strict DEV differential-budget control', () => {
    expect(wakeOffFromQuery('')).toBe(false)
    expect(wakeOffFromQuery('?wake=on')).toBe(false)
    expect(wakeOffFromQuery('?wake=off')).toBe(true)
    expect(() => wakeOffFromQuery('?wake=maybe')).toThrow('not on or off')
  })

  it('derives ship and Catalina trails from the same contract', () => {
    const pbySpec = loadAircraftSpec('pby-5a-catalina')
    const operations = pbySpec.waterOperations!
    const water = waterSurfaceContext(5, v3(20, 0, 8))
    const sea = waterSurfaceAt(water, 0, 0)
    const speedMps = 24
    const planing = (speedMps - operations.planingSpeedMps) / (operations.takeoffSpeedMps - operations.planingSpeedMps)
    const draftM = operations.displacementDraftM + planing * (operations.planingDraftM - operations.displacementDraftM)
    const state = createState({
      position: v3(0, sea.heightM + operations.hullDepthM - draftM, 0),
      velocity: v3(speedMps, sea.verticalSpeedMps, 0),
      gearFraction: 0,
    })
    const aircraft = {
      id: 'pby', spec: pbySpec, state, previous: state, impact: null,
      controls: { pitch: 0, roll: 0, yaw: 0, throttle: 0 },
    }
    const combat = createCombat([aircraft], {}, [{ id: 'destroyer', hullHp: 100 }])
    const sources = waterWakeSources({
      combat,
      aircraft: [aircraft],
      poses: [{ position: state.position, attitude: qIdentity() }],
      ships: [{ id: 'destroyer', spec: { lengthM: 100, beamM: 12, maxSpeedMps: 20 }, state: { speedMps: 10 } }],
      shipPoses: [{ position: v3(100, 0, 200), headingRad: 0, pitchRad: 0, rollRad: 0 }],
      water,
    })
    expect(sources.map((source) => source.key)).toEqual(['aircraft:pby', 'ship:destroyer'])
    expect(sources[0]).toMatchObject({ lengthM: pbySpec.geometry.wingSpanM * 0.62, beamM: operations.hullBeamM, speedMps })
    expect(sources[0]!.planing).toBeGreaterThan(0)
    expect(sources[1]).toMatchObject({ lengthM: 100, beamM: 12, speedMps: 10, planing: 0 })
    expect(sources[1]!.stern.z).toBeCloseTo(248)
  })

  it('builds widening crest and churn geometry, then fades an absent trail', () => {
    const wake = createWaterWake('high')
    const water = waterSurfaceContext(0, v3(0, 0, 0))
    const source = {
      key: 'ship:test', stern: v3(0, 0, 0), aft: v3(0, 0, 1), right: v3(1, 0, 0),
      lengthM: 80, beamM: 10, speedMps: 10, maxSpeedMps: 20, planing: 0, strength: 0.8,
    }
    wake.update([source], water, 1 / 60)
    // Each move is below the 2.5 m sample spacing: distance has to accumulate
    // from a fixed committed anchor, as it does over normal render frames.
    for (let z = 0.5; z <= 90; z += 0.5) wake.update([{ ...source, stern: v3(0, 0, z) }], water, 0.05)
    const built = wake.stats()
    expect(built.tracks).toBe(1)
    expect(built.crestVertices).toBeGreaterThan(built.churnVertices)
    expect(built.churnVertices).toBeGreaterThan(0)
    for (let i = 0; i < 200; i++) wake.update([], water, 0.25)
    expect(wake.stats()).toEqual({ tracks: 0, samples: 0, maxAnchorDistanceM: 0, crestVertices: 0, churnVertices: 0 })
    wake.dispose()
  })

  it('honours the effects-off control without retaining hidden tracks', () => {
    const wake = createWaterWake('off')
    wake.update([{
      key: 'ship:test', stern: v3(0, 0, 0), aft: v3(0, 0, 1), right: v3(1, 0, 0),
      lengthM: 80, beamM: 10, speedMps: 10, maxSpeedMps: 20, planing: 0, strength: 0.8,
    }], undefined, 1)
    expect(wake.stats()).toEqual({ tracks: 0, samples: 0, maxAnchorDistanceM: 0, crestVertices: 0, churnVertices: 0 })
    wake.setTier('off')
    expect(wake.stats()).toEqual({ tracks: 0, samples: 0, maxAnchorDistanceM: 0, crestVertices: 0, churnVertices: 0 })
    wake.dispose()
  })
})
