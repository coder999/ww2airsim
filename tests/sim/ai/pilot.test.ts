import { describe, expect, it } from 'vitest'
import {
  breakDesiredVelocity,
  extendDesiredVelocity,
  GREEN_SKILL,
  VETERAN_SKILL,
} from '../../../src/sim/ai/pilot.js'
import { createState } from '../../../src/sim/flight/state.js'
import { dot, length, sub, v3 } from '../../../src/sim/math/vec3.js'
import type { AircraftEntity } from '../../../src/sim/loop.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const entity = (
  overrides: { position?: ReturnType<typeof v3>; velocity?: ReturnType<typeof v3> } = {},
): AircraftEntity<undefined> => {
  const state = createState({
    position: overrides.position ?? v3(0, 2000, 0),
    velocity: overrides.velocity ?? v3(100, 0, 0),
  })
  return {
    id: 'entity', spec: f6f, state, previous: state,
    controls: { pitch: 0, roll: 0, yaw: 0, throttle: 0.7 },
    assistMemory: undefined, impact: null, parked: false,
  }
}

describe('pilot skill presets', () => {
  it('veteran reacts faster and holds the attack longer than green', () => {
    expect(VETERAN_SKILL.reactionS).toBeLessThan(GREEN_SKILL.reactionS)
    expect(VETERAN_SKILL.energyDiscipline).toBeGreaterThan(GREEN_SKILL.energyDiscipline)
  })

  it('green reproduces today\'s exact gun cone (gunneryAccuracy 1.0)', () => {
    expect(GREEN_SKILL.gunneryAccuracy).toBe(1.0)
  })

  it('both presets are plain, structured-clone-safe data', () => {
    expect(structuredClone(VETERAN_SKILL)).toEqual(VETERAN_SKILL)
    expect(structuredClone(GREEN_SKILL)).toEqual(GREEN_SKILL)
  })
})

describe('extendDesiredVelocity', () => {
  it('points away from the threat with a negative vertical component', () => {
    const self = entity({ position: v3(0, 3000, 0), velocity: v3(100, 0, 0) })
    const threat = entity({ position: v3(-500, 3000, 0), velocity: v3(100, 0, 0) })
    const desired = extendDesiredVelocity(self, threat)
    const away = sub(self.state.position, threat.state.position)
    expect(dot(desired, away)).toBeGreaterThan(0)
    expect(desired.y).toBeLessThan(0)
  })
})

describe('breakDesiredVelocity', () => {
  it('is perpendicular to self\'s current velocity, not toward or away from the threat', () => {
    const self = entity({ position: v3(0, 3000, 0), velocity: v3(100, 0, 0) })
    const threat = entity({ position: v3(-500, 3000, 50), velocity: v3(-100, 0, 0) })
    const desired = breakDesiredVelocity(self, threat)
    expect(Math.abs(dot(desired, self.state.velocity))).toBeLessThan(1e-6 * length(desired) * length(self.state.velocity) + 1)
    const towardThreat = sub(threat.state.position, self.state.position)
    const away = sub(self.state.position, threat.state.position)
    expect(Math.abs(dot(desired, towardThreat))).not.toBeCloseTo(length(desired) * length(towardThreat), 3)
    expect(Math.abs(dot(desired, away))).not.toBeCloseTo(length(desired) * length(away), 3)
  })
})
