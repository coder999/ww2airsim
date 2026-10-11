import { describe, expect, it } from 'vitest'
import { DT, step, type Controls } from '../../../src/sim/flight/model.js'
import { createState } from '../../../src/sim/flight/state.js'
import { restPitchRad, wheelDepthM } from '../../../src/sim/gearContact.js'
import { qFromAxisAngle, qRotate } from '../../../src/sim/math/quat.js'
import { v3 } from '../../../src/sim/math/vec3.js'
import { flatField } from '../mission/fixture.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'

const base = loadAircraftSpec('g4m-betty')
const portDead = {
  ...base,
  asymmetricThrustYaw: { rateDegPerSec: base.rates.maxYawRateDegPerSec * 0.5, maxRateDegPerSec: base.rates.maxYawRateDegPerSec },
}
const airborne = createState({ position: v3(0, 2000, 0), velocity: v3(base.rates.rateRefSpeedMps, 0, 0) })
const controls = (yaw: number, throttle = 1): Controls => ({ roll: 0, pitch: 0, yaw, throttle })

describe('asymmetric thrust in the rate-command flight model', () => {
  it('yaws the nose toward the dead port engine', () => {
    let state = airborne
    for (let tick = 1; tick <= 60; tick++) state = step(portDead, state, controls(0), { dt: DT, tick })
    const forward = qRotate(state.attitude, v3(1, 0, 0))
    // Port is body -Z. Positive body +Y rotation turns the nose toward -Z.
    expect(forward.z).toBeLessThan(0)
  })

  it('is exactly countered by the corresponding opposite rudder at zero sideslip', () => {
    // Natural arm weighting makes one dead engine of a symmetric twin one
    // half of maximum yaw authority. Positive pilot yaw commands body -Y,
    // opposite the surviving starboard engine's body +Y moment.
    const after = step(portDead, airborne, controls(0.5), { dt: DT, tick: 1 })
    expect(after.bodyRates.y).toBeCloseTo(0, 12)
  })

  it('adds no asymmetric-thrust yaw at closed throttle', () => {
    const after = step(portDead, airborne, controls(0, 0), { dt: DT, tick: 1 })
    expect(after.bodyRates.y).toBeCloseTo(0, 12)
  })

  it('uses the healthy maximum as the combined cap after yaw-control damage', () => {
    const damaged = {
      ...portDead,
      rates: { ...portDead.rates, maxYawRateDegPerSec: base.rates.maxYawRateDegPerSec * 0.8 },
    }
    // Negative control yaw commands the same body +Y direction as this port
    // loss. The 0.8 rudder rate plus 0.5 engine-out rate caps at healthy 1.0.
    const after = step(damaged, airborne, controls(-1), { dt: DT, tick: 1 })
    expect(after.bodyRates.y).toBeCloseTo(base.rates.maxYawRateDegPerSec * Math.PI / 180, 12)
  })

  it('leaves healthy flight bit-identical when the transient field is absent', () => {
    const before = step(base, airborne, controls(0.2), { dt: DT, tick: 1 })
    const explicitZero = step({ ...base, asymmetricThrustYaw: { rateDegPerSec: 0, maxRateDegPerSec: base.rates.maxYawRateDegPerSec } }, airborne, controls(0.2), { dt: DT, tick: 1 })
    expect(explicitZero).toStrictEqual(before)
  })

  it('is suppressed by the existing ground-rate override', () => {
    const pitch = restPitchRad(base.gear)
    const attitude = qFromAxisAngle(v3(0, 0, 1), pitch)
    // Above sea level: `surfaceAt` classifies zero-height terrain as water,
    // where wheels deliberately have no ground regime.
    const groundM = 1
    const state = createState({
      position: v3(0, groundM + wheelDepthM(base.gear, pitch), 0),
      velocity: v3(20, 0, 0),
      attitude,
      gearFraction: 1,
    })
    const after = step(portDead, state, controls(0), { dt: DT, tick: 1, terrain: flatField(groundM) })
    expect(after.bodyRates.y).toBeCloseTo(0, 12)
  })
})
