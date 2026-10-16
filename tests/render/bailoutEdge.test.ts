import { describe, expect, it } from 'vitest'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { advance, createWorld, requestBailout, type World } from '../../src/sim/loop.js'
import { createState } from '../../src/sim/flight/state.js'
import { DT } from '../../src/sim/flight/model.js'
import { DEFAULT_RECOVERY_ENVIRONMENT } from '../../src/sim/bailout.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { createTerrainField } from '../../src/sim/world/terrain.js'
import { parseTerrainHeader } from '../../src/sim/world/schema.js'
import { groundUnder } from '../../src/sim/world/ground.js'
import { bailoutCue, predictedTouchdown, recoveryEnvironmentOf } from '../../src/render/bailoutEdge.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const header = parseTerrainHeader({ centreLatDeg: 10.8, centreLonDeg: 125.3, halfExtentM: 20_000, finestSamples: 3, levels: 1, encoding: 'int16-decimetres' })
const terrain = createTerrainField(header, 0, new Int16Array(9).fill(100))
const worldAt = (aglM: number, wind = v3(0, 0, 0)): World<undefined> => ({
  ...createWorld(f6f, createState({ position: v3(0, 10 + aglM, 0), velocity: v3(60, 0, 0) }), { pitch: 0, roll: 0, yaw: 0, throttle: 0 }),
  terrain, wind,
})
const groundAt = (w: World<undefined>) => (x: number, z: number) => groundUnder(w.terrain, [], x, z, undefined as never)

const DAY = recoveryEnvironmentOf({ sunElevationDeg: 50, cloudCoverages: [0], beaufort: 0 })
const NIGHT = recoveryEnvironmentOf({ sunElevationDeg: -30, cloudCoverages: [1], beaufort: 0 })

describe('the recovery environment is one function (F7A Task 7)', () => {
  it('full sun and clear sky is full daylight and visibility; deep night under cloud is neither', () => {
    expect(DAY).toMatchObject({ daylight: 1, visibility: 1, weather: 0 })
    expect(NIGHT).toMatchObject({ daylight: 0, weather: 1 })
    expect(NIGHT.visibility).toBeCloseTo(0.4, 9)
  })
})

describe('the touchdown prediction follows the model it summarizes', () => {
  it('lands within a tenth of the drift (and 60 m) of where the simulated canopy actually comes down, in wind', () => {
    for (const [agl, wind] of [[300, v3(10, 0, 0)], [600, v3(-8, 0, 6)], [200, v3(0, 0, 0)]] as const) {
      const w0 = worldAt(agl, wind)
      const a = w0.aircraft[0]!
      const predicted = predictedTouchdown(a.state.position, a.state.velocity, wind, agl)
      const r = requestBailout(w0, w0.player, undefined, 1)
      if (!r.ok) throw new Error(r.reason)
      let w = r.world
      for (let i = 0; i < 9_000 && w.parachutists![0]!.state.contact === null; i++) w = advance(w, DT).world
      const landed = w.parachutists![0]!.state.contact!.position
      const drift = Math.hypot(landed.x - a.state.position.x, landed.z - a.state.position.z)
      expect(Math.hypot(landed.x - predicted.x, landed.z - predicted.z), `agl ${agl}`).toBeLessThan(0.1 * drift + 60)
    }
  })
})

describe('the cue uses the live environment', () => {
  it('moves from RESCUE LIKELY by day to CAPTURE LIKELY at night over the same contested ground', () => {
    const w = worldAt(300)
    expect(bailoutCue(w, DAY, groundAt(w))!.cue).toBe('rescue-likely')
    expect(bailoutCue(w, NIGHT, groundAt(w))!.cue).toBe('capture-likely')
    // the fault this guards: the cue once ignored the environment and always used the default (clear day)
    expect(bailoutCue(w, DEFAULT_RECOVERY_ENVIRONMENT, groundAt(w))!.cue).toBe('contested')
  })

  it('names the height rule when the canopy may not open in time, and is silent below the refusal height', () => {
    const w = worldAt(60)
    expect(bailoutCue(w, DAY, groundAt(w))!.text).toContain('BELOW 246 FT')
    const tooLow = worldAt(10)
    expect(bailoutCue(tooLow, DAY, groundAt(tooLow))).toBeNull()
  })
})
