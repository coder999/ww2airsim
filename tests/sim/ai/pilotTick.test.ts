import { describe, expect, it } from 'vitest'
import { pilotTick, type PilotTickContext } from '../../../src/sim/ai/pilotTick.js'
import { deriveFacts, decideManeuver, maneuverControls } from '../../../src/sim/ai/decision.js'
import { GREEN_SKILL } from '../../../src/sim/ai/pilot.js'
import { createWorldOf, type AircraftEntity } from '../../../src/sim/loop.js'
import { createState } from '../../../src/sim/flight/state.js'
import { v3, ZERO } from '../../../src/sim/math/vec3.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const entity = (id: string, x: number, pilot: AircraftEntity<undefined>['pilot'] = null): AircraftEntity<undefined> => {
  const state = createState({ position: v3(x, 2000, 0), velocity: v3(120, 0, 0) })
  return { id, spec: f6f, state, previous: state, controls: { roll: 0, pitch: 0, yaw: 0, throttle: 0.7 }, assistMemory: undefined, impact: null, parked: false, pilot }
}
const decision = { maneuver: 'pursue' as const, nextRescoreS: 0, observedTargetPosition: ZERO, observedTargetVelocity: ZERO, noiseCursor: 0 }
const pilotEntity = entity('p', 0, { target: 't', skill: GREEN_SKILL, decision })
const target = entity('t', 400)
const world = createWorldOf({ aircraft: [pilotEntity, target], player: 't' })
const ctx = (nowS: number): PilotTickContext => ({ nowS, terrain: null, decks: [], wind: null, combat: world.combat })

describe('pilotTick', () => {
  it('returns the same object for an aircraft with no pilot', () => {
    expect(pilotTick(target, world.aircraft, ctx(1 / 60))).toBe(target)
  })

  it('returns the same object when the target is missing from the snapshot', () => {
    expect(pilotTick(pilotEntity, [pilotEntity], ctx(1 / 60))).toBe(pilotEntity)
  })

  it('returns the same object for a destroyed or impacted pilot', () => {
    const dead = { ...world.combat, aircraft: { ...world.combat.aircraft, p: { ...world.combat.aircraft['p']!, damage: { ...world.combat.aircraft['p']!.damage, destroyedAt: 3 } } } }
    expect(pilotTick(pilotEntity, world.aircraft, { ...ctx(1 / 60), combat: dead })).toBe(pilotEntity)
    const impacted = { ...pilotEntity, impact: { tick: 1, position: ZERO, velocity: ZERO } as unknown as AircraftEntity<undefined>['impact'] }
    expect(pilotTick(impacted, world.aircraft, ctx(1 / 60))).toBe(impacted)
  })

  it('on a rescore tick, decides from live facts, snapshots the target, and flies maneuverControls', () => {
    const nowS = 1 / 60
    const facts = deriveFacts(pilotEntity, target, 0, pilotEntity.state.fuelKg / f6f.mass.fuelCapacityKg)
    const rescored = {
      ...decision, maneuver: decideManeuver(facts, GREEN_SKILL), nextRescoreS: nowS + GREEN_SKILL.reactionS,
      observedTargetPosition: target.state.position, observedTargetVelocity: target.state.velocity,
    }
    const expected = maneuverControls(pilotEntity, target, rescored, GREEN_SKILL)
    const out = pilotTick(pilotEntity, world.aircraft, ctx(nowS))
    expect(out.controls).toEqual(expected.controls)
    expect(out.pilot!.decision).toEqual(expected.decision)
  })
})
