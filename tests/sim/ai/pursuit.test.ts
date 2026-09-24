import { describe, expect, it } from 'vitest'
import {
  AI_GUN_CONE_RAD,
  AI_GUN_RANGE_M,
  hasGunSolution,
  leadPursuitVelocity,
  pursuitControls,
  pursuitDesiredVelocity,
} from '../../../src/sim/ai/pursuit.js'
import { createState } from '../../../src/sim/flight/state.js'
import { qFromAxisAngle } from '../../../src/sim/math/quat.js'
import { add, dot, normalize, scale, sub, v3 } from '../../../src/sim/math/vec3.js'
import type { AircraftEntity } from '../../../src/sim/loop.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { GREEN_SKILL, VETERAN_SKILL } from '../../../src/sim/ai/pilot.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const entity = (
  id: string,
  position = v3(0, 2000, 0),
  velocity = v3(100, 0, 0),
  pilot?: AircraftEntity<undefined>['pilot'],
): AircraftEntity<undefined> => {
  const state = createState({ position, velocity })
  return {
    id, spec: f6f, state, previous: state,
    controls: { pitch: 0, roll: 0, yaw: 0, throttle: 0.7 },
    assistMemory: undefined, impact: null, parked: false,
    ...(pilot !== undefined ? { pilot } : {}),
  }
}

describe('lead pursuit', () => {
  it('aims ahead of a crossing target and bounds the requested closure speed', () => {
    const self = entity('self')
    const target = entity('target', v3(1000, 2000, 0), v3(100, 0, 80))
    const desired = leadPursuitVelocity(self, target)
    expect(desired.z).toBeGreaterThan(0)
    expect(Math.hypot(desired.x, desired.y, desired.z)).toBeLessThanOrEqual(
      Math.hypot(100, 80) + 35 + 1e-9,
    )
  })

  it('falls back to the aircraft nose for a coincident stationary target', () => {
    const self = entity('self')
    const target = entity('target', self.state.position, v3(0, 0, 0))
    expect(leadPursuitVelocity(self, target)).toEqual(v3(80, 0, 0))
  })
})

describe('AI gun solution', () => {
  it('fires only inside the range and muzzle-lead cone', () => {
    const self = entity('self')
    const ahead = entity('target', v3(400, 2000, 0), v3(100, 0, 0))
    expect(hasGunSolution(self, ahead)).toBe(true)
    expect(pursuitControls(self, ahead).fire).toBe(true)

    const far = entity('target', v3(AI_GUN_RANGE_M + 1, 2000, 0), v3(100, 0, 0))
    expect(hasGunSolution(self, far)).toBe(false)
    expect(pursuitControls(self, far).fire).toBeUndefined()

    const outsideCone = entity('target', v3(400, 2000, 40), v3(100, 0, 0))
    expect(hasGunSolution(self, outsideCone)).toBe(false)
  })

  it('uses the actual nose, not the velocity vector, for the firing gate', () => {
    const base = entity('self')
    const state = createState({
      ...base.state,
      attitude: qFromAxisAngle(v3(0, 1, 0), -Math.PI / 2),
    })
    const turned = { ...base, state, previous: state }
    const target = entity('target', v3(400, 2000, 0))
    expect(hasGunSolution(turned, target)).toBe(false)
  })
})

describe('pursuit steers at the point it can actually hit', () => {
  it('once in gun range, flies at the same muzzle-lead point the gate itself checks -- not a different, longer maneuver lead', () => {
    const self = entity('self')
    // Crossing fast enough that the maneuver lead (capped at 3 s) and the
    // muzzle lead (well under 1 s at this range) land in very different
    // places: this is exactly the geometry where the gate previously opened
    // only by coincidence, at the cone's edge, biased toward over-lead.
    const target = entity('target', v3(300, 2000, 0), v3(0, 0, 120))
    const muzzleVelocityMps = f6f.combat!.muzzleVelocityMps
    const range = 300
    const flightS = range / muzzleVelocityMps
    const muzzleLead = normalize(
      sub(add(target.state.position, scale(target.state.velocity, flightS)), self.state.position),
    )
    const maneuverLead = normalize(leadPursuitVelocity(self, target))
    // Sanity: the two lead points really do diverge for this geometry, or the
    // test would not distinguish anything.
    expect(dot(muzzleLead, maneuverLead)).toBeLessThan(0.98)

    const steered = normalize(pursuitDesiredVelocity(self, target))
    expect(dot(steered, muzzleLead)).toBeGreaterThan(0.999)
  })

  it('flies the longer maneuver lead outside gun range, where there is nothing to gate yet', () => {
    const self = entity('self')
    const target = entity('target', v3(AI_GUN_RANGE_M + 200, 2000, 0), v3(0, 0, 80))
    const maneuverLead = normalize(leadPursuitVelocity(self, target))
    const steered = normalize(pursuitDesiredVelocity(self, target))
    expect(dot(steered, maneuverLead)).toBeGreaterThan(0.999)
  })
})

describe('gunneryAccuracy scales the gun cone', () => {
  const PURSUE_NOW = { maneuver: 'pursue' as const, nextRescoreS: 0 }

  it('a shot inside the green pilot\'s (wider) cone but outside the veteran\'s (tighter) cone lands only for green', () => {
    // VETERAN_SKILL.gunneryAccuracy (0.6) is LOWER than GREEN_SKILL's (1.0)
    // -- lower scales the cone's half-angle down, so the veteran's cone is
    // the NARROWER one (a veteran only takes a tighter, more precise shot),
    // and green's cone is the wider, today-unchanged one. Position the
    // target strictly between the two half-angles: outside the veteran's
    // narrower cone, inside green's wider one, within AI_GUN_RANGE_M.
    const angle = AI_GUN_CONE_RAD * ((VETERAN_SKILL.gunneryAccuracy + GREEN_SKILL.gunneryAccuracy) / 2)
    const range = 400
    const target = entity('target', v3(range * Math.cos(angle), 3000, range * Math.sin(angle)), v3(0, 0, 0))
    const veteran = entity('self', v3(0, 3000, 0), v3(100, 0, 0), {
      target: 'target', skill: VETERAN_SKILL, decision: PURSUE_NOW,
    })
    const green = entity('self', v3(0, 3000, 0), v3(100, 0, 0), {
      target: 'target', skill: GREEN_SKILL, decision: PURSUE_NOW,
    })
    expect(hasGunSolution(veteran, target)).toBe(false)
    expect(hasGunSolution(green, target)).toBe(true)
  })

  it('a shooter with no pilot (e.g. the player) gets the full, unscaled cone', () => {
    const self = entity('self', v3(0, 3000, 0), v3(100, 0, 0))
    const angle = AI_GUN_CONE_RAD * 0.9
    const target = entity('target', v3(400 * Math.cos(angle), 3000, 400 * Math.sin(angle)), v3(0, 0, 0))
    expect(hasGunSolution(self, target)).toBe(true)
  })
})
