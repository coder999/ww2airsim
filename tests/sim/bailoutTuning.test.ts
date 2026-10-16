import { describe, expect, it } from 'vitest'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { advance, createWorld, playerAircraft, requestBailout, type World } from '../../src/sim/loop.js'
import { createState } from '../../src/sim/flight/state.js'
import { DT } from '../../src/sim/flight/model.js'
import { qFromAxisAngle } from '../../src/sim/math/quat.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { createTerrainField } from '../../src/sim/world/terrain.js'
import { parseTerrainHeader } from '../../src/sim/world/schema.js'
import type { GroundUnder } from '../../src/sim/world/ground.js'
import { bailoutEligibility, createParachutist, stepParachutist } from '../../src/sim/bailout.js'
import { BAILOUT_TUNING, openingSeconds } from '../../src/sim/bailoutTuning.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const GROUND_M = 10
const FLAT: GroundUnder = { heightM: GROUND_M, surface: 'land', velocity: v3(0, 0, 0), deck: null, water: null, landClass: 'unclassified' } as unknown as GroundUnder
const groundAt = (): GroundUnder => FLAT
const header = parseTerrainHeader({ centreLatDeg: 10.8, centreLonDeg: 125.3, halfExtentM: 1000, finestSamples: 3, levels: 1, encoding: 'int16-decimetres' })

/** The airplane the pilot leaves: `aglM` above the ground, flying `forwardMps` ahead and sinking `sinkMps`. */
function aircraftAt(aglM: number, forwardMps: number, sinkMps: number) {
  const w = createWorld(f6f, createState({ position: v3(0, GROUND_M + aglM, 0), velocity: v3(forwardMps, -sinkMps, 0) }), { pitch: 0, roll: 0, yaw: 0, throttle: 0 })
  return playerAircraft(w)
}

/** Fly one exit through the model alone, with the height rule given by `tuning`, and say whether the pilot lives. */
function survives(aglM: number, forwardMps: number, sinkMps: number, tuning: typeof BAILOUT_TUNING = BAILOUT_TUNING): boolean {
  const a = aircraftAt(aglM, forwardMps, sinkMps)
  const e = bailoutEligibility(a, [], FLAT, false, tuning)
  if (!e.ok) return false
  let p = createParachutist(a, 'allied', e, 1, undefined, tuning)
  for (let tick = a.state.tick + 1; tick < 12_000 && p.state.contact === null; tick++) p = stepParachutist(p, tick, DT, null, groundAt, tuning)
  return p.state.phase === 'down'
}

/** The lowest level exit (1 m steps) the MODEL lets live, with the safe-descent rule switched off. */
const lowestSurvivableLevelExitM = (forwardMps: number, tuning = BAILOUT_TUNING): number => {
  const modelOnly = { ...tuning, safeOpenAglM: 0 }
  for (let agl = Math.ceil(tuning.minExitAglM); agl <= 400; agl++) if (survives(agl, forwardMps, 0, modelOnly)) return agl
  return Infinity
}
const ruleAtLeastAsStrictAsModel = (tuning = BAILOUT_TUNING): boolean =>
  [45, 100, 200].every((speed) => lowestSurvivableLevelExitM(speed, tuning) <= tuning.safeOpenAglM)

describe('the bailout tuning and the physics model agree (F7A Task 2)', () => {
  it('the deployment phases add up to the deployment time', () => {
    expect(BAILOUT_TUNING.separationSeconds + openingSeconds()).toBeCloseTo(BAILOUT_TUNING.deploySeconds, 9)
  })

  it('the safe-descent rule is never laxer than the model: nobody the rule calls safe dies for want of height', () => {
    expect(ruleAtLeastAsStrictAsModel()).toBe(true)
  })

  it('and the check can fail: a rule set far below the model, or a canopy too fast to survive, is caught', () => {
    expect(ruleAtLeastAsStrictAsModel({ ...BAILOUT_TUNING, safeOpenAglM: 5 })).toBe(false)
    expect(ruleAtLeastAsStrictAsModel({ ...BAILOUT_TUNING, sinkMps: 12 })).toBe(false)
  })

  it('records what the model alone says (2026-10-15): about 80 ft in level flight, well under the 246 ft rule, whatever the speed', () => {
    const lowest = [45, 100, 200].map((speed) => lowestSurvivableLevelExitM(speed))
    expect(Math.max(...lowest)).toBeGreaterThan(BAILOUT_TUNING.minExitAglM)
    expect(Math.max(...lowest)).toBeLessThan(BAILOUT_TUNING.safeOpenAglM)
  })

  it('a diving exit above the rule height still dies: the model, not the rule, kills it', () => {
    const a = aircraftAt(150, 100, 60)
    const e = bailoutEligibility(a, [], FLAT, false)
    expect(e).toMatchObject({ ok: true, lowAltitude: false })
    expect(survives(150, 100, 60)).toBe(false)
    expect(survives(300, 100, 60)).toBe(true)
  })
})

describe('only a too-low jump is refused (Mark, 2026-10-15: arcade rules for the rest)', () => {
  const terrain = createTerrainField(header, 0, new Int16Array(9).fill(100))
  const world = (speed: number, attitudeRollRad = 0, sink = 0): World<undefined> => ({
    ...createWorld(f6f, createState({ position: v3(0, 400, 0), velocity: v3(speed, -sink, 0), attitude: qFromAxisAngle(v3(1, 0, 0), attitudeRollRad) }), { pitch: 0, roll: 0, yaw: 0, throttle: 0 }),
    terrain,
  })

  it('allows a jump at any speed, inverted, or nearly stalled', () => {
    for (const speed of [0, 15, 45, 150, 200, 300]) expect(requestBailout(world(speed)).ok, `speed ${speed}`).toBe(true)
    expect(requestBailout(world(100, Math.PI)).ok).toBe(true)
    expect(requestBailout(world(18, 0, 15)).ok).toBe(true)
  })

  it('refuses only below the minimum height, and says "too-low"', () => {
    const low = requestBailout({ ...world(100), aircraft: [{ ...playerAircraft(world(100)), state: { ...playerAircraft(world(100)).state, position: v3(0, 10 + BAILOUT_TUNING.minExitAglM - 1, 0) } }] })
    expect(low).toMatchObject({ ok: false, reason: 'too-low' })
  })

  it('runs a fast inverted jump to a normal outcome without any speed-based kill', () => {
    let w = requestBailout(world(200, Math.PI)).ok ? (requestBailout(world(200, Math.PI)) as { world: World<undefined> }).world : world(0)
    for (let i = 0; i < 6_000 && w.parachutists![0]!.state.contact === null; i++) w = advance(w, DT).world
    expect(w.parachutists![0]!.state.phase).toBe('down')
  })
})
