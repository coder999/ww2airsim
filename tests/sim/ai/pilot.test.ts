import { describe, expect, it } from 'vitest'
import {
  breakDesiredVelocity,
  extendDesiredVelocity,
  GREEN_SKILL,
  REJOIN_OVERTAKE_MPS,
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

  it('green jitters materially more than veteran (higher is always worse)', () => {
    expect(GREEN_SKILL.controlNoise).toBeGreaterThan(VETERAN_SKILL.controlNoise)
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

  it('rejoins at no less than the threat\'s speed plus REJOIN_OVERTAKE_MPS, so the throttle goes up (7c R8)', () => {
    const self = entity({ position: v3(0, 3000, 0), velocity: v3(90, 0, 0) })
    const threat = entity({ position: v3(-1500, 3000, 0), velocity: v3(115, 0, 0) })
    expect(length(extendDesiredVelocity(self, threat))).toBeCloseTo(115 + REJOIN_OVERTAKE_MPS, 9)
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

describe('repertoire is skill data (7c spec §3.5; Mark 2026-09-25: green gets the basic set)', () => {
  it('both presets carry the three intent defaults', () => {
    for (const skill of [GREEN_SKILL, VETERAN_SKILL]) {
      for (const n of ['lead-pursuit', 'defensive-break', 'extend'] as const) expect(skill.repertoire).toContain(n)
    }
  })
})

describe('the finished repertoires (7c; Mark 2026-09-25 and 2026-09-26)', () => {
  it('green flies exactly the three intent defaults: lead pursuit, the defensive break and the extend (7b\'s behavior)', () => {
    expect([...GREEN_SKILL.repertoire].sort()).toEqual(['defensive-break', 'extend', 'lead-pursuit'])
  })

  // Mark's ruling, 2026-09-26: "remove lag pursuit from green pilots. green
  // pilots should be beaten easily." It reverses his 2026-09-25 grant of lag
  // pursuit to green: with it, green selected lag at 6.0 s and the 7d bar's
  // scripted evasion never got behind it at noise cursors 7919 and 23757 (final
  // review, 2026-09-26). His 2026-09-25 ruling "green never goes vertical"
  // still stands, so neither yo-yo, the attack run, the split-S nor the
  // Immelmann.
  it('green has no lag pursuit and no vertical maneuver (Mark, 2026-09-26: green pilots should be beaten easily)', () => {
    for (const n of ['lag-pursuit', 'high-yo-yo', 'low-yo-yo', 'attack-run', 'split-s', 'immelmann'] as const) {
      expect(GREEN_SKILL.repertoire).not.toContain(n)
    }
  })

  it('veteran flies the whole library', () => {
    expect([...VETERAN_SKILL.repertoire].sort()).toEqual([
      'attack-run', 'defensive-break', 'extend', 'high-yo-yo', 'immelmann', 'lag-pursuit', 'lead-pursuit', 'low-yo-yo', 'scissors', 'split-s',
    ])
  })
})
