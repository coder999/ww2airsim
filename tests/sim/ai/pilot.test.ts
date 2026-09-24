import { describe, expect, it } from 'vitest'
import {
  breakDesiredVelocity,
  extendDesiredVelocity,
  GREEN_SKILL,
  SAFE_SEPARATION_M,
  VETERAN_SKILL,
} from '../../../src/sim/ai/pilot.js'
import { AI_GUN_RANGE_M } from '../../../src/sim/ai/pursuit.js'
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

describe('SAFE_SEPARATION_M', () => {
  it('is 2x AI_GUN_RANGE_M, mechanically checked rather than only asserted in a comment (finding 11)', () => {
    expect(SAFE_SEPARATION_M).toBe(2 * AI_GUN_RANGE_M)
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

  it('rejoins toward the threat on a climb once safely separated, instead of diving forever', () => {
    const self = entity({ position: v3(0, 3000, 0), velocity: v3(140, 0, 0) })
    const threat = entity({ position: v3(-1500, 3000, 0), velocity: v3(100, 0, 0) }) // beyond SAFE_SEPARATION_M (1100)
    const desired = extendDesiredVelocity(self, threat)
    const toward = sub(threat.state.position, self.state.position)
    expect(dot(desired, toward)).toBeGreaterThan(0)
    expect(desired.y).toBeGreaterThan(0)
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

  it('returns a well-formed, non-zero, finite vector in a head-on merge, where selfFwd and towardThreat are nearly antiparallel', () => {
    // Finding 1 (final whole-branch review): cross(selfFwd, towardThreat)
    // approaches the zero vector when self and the threat are flying
    // directly at each other, and normalize(ZERO) is ZERO -- exactly the
    // geometry the Break-angle fix now correctly triggers Break in. Self
    // flies +X, the threat is dead ahead flying -X straight at self: the
    // two velocities are exactly antiparallel and towardThreat is exactly
    // parallel to selfFwd, so the raw cross product is the zero vector.
    const self = entity({ position: v3(0, 3000, 0), velocity: v3(100, 0, 0) })
    const threat = entity({ position: v3(1000, 3000, 0), velocity: v3(-100, 0, 0) })
    const desired = breakDesiredVelocity(self, threat)
    expect(Number.isFinite(desired.x)).toBe(true)
    expect(Number.isFinite(desired.y)).toBe(true)
    expect(Number.isFinite(desired.z)).toBe(true)
    expect(length(desired)).toBeGreaterThan(1e-6)
    expect(Math.abs(dot(desired, self.state.velocity))).toBeLessThan(1e-6 * length(desired) * length(self.state.velocity) + 1)
  })
})
