// tests/render/airframeUpdate.test.ts
import { describe, expect, it } from 'vitest'
import { airframeUpdateFor } from '../../src/render/airframeUpdate.js'
import { createState } from '../../src/sim/flight/state.js'
import { v3 } from '../../src/sim/math/vec3.js'
import type { AircraftEntity } from '../../src/sim/loop.js'

const aiControls = { pitch: 0.1, roll: -0.2, yaw: 0.3, throttle: 0.6 }
const alive = { state: createState({ gearFraction: 0.25, flapFraction: 0.5 }), controls: aiControls, impact: null }
const wreck = { ...alive, impact: {} as NonNullable<AircraftEntity['impact']> }
const origin = v3(0, 0, 0)

describe('airframeUpdateFor', () => {
  it("an AI aircraft reads its own entity's controls, gear and flaps", () => {
    const u = airframeUpdateFor(alive, null, v3(3, 4, 12), origin, 0.016)
    expect(u).toEqual({ gearFraction: 0.25, flapFraction: 0.5, throttle: 0.6, controls: { roll: -0.2, pitch: 0.1, yaw: 0.3 }, frameS: 0.016, cameraDistanceM: 13 })
  })

  it("the player's aircraft reads the frame's raw controls instead", () => {
    const player = { pitch: 0, roll: 0, yaw: 0, throttle: 1 }
    expect(airframeUpdateFor(alive, player, origin, origin, 0.016).throttle).toBe(1)
  })

  it('a wreck, player or AI, gets throttle 0 so its propeller stops', () => {
    expect(airframeUpdateFor(wreck, null, origin, origin, 0.016).throttle).toBe(0)
    expect(airframeUpdateFor(wreck, { pitch: 0, roll: 0, yaw: 0, throttle: 1 }, origin, origin, 0.016).throttle).toBe(0)
  })
})
