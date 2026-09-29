import { describe, it, expect } from 'vitest'
import { pilotTick, type PilotTickContext } from '../../../src/sim/ai/pilotTick.js'
import { airborne } from '../../../src/sim/ai/airborne.js'
import { FLOOR_M, heightAboveGround } from '../../../src/sim/ai/safety.js'
import { TAKEOFF_DONE_M } from '../../../src/sim/ai/takeoff.js'
import { advance, aircraftById, type AircraftEntity, type World } from '../../../src/sim/loop.js'
import { DT } from '../../../src/sim/flight/model.js'
import { length, sub } from '../../../src/sim/math/vec3.js'
import { sidesOf } from '../../../src/sim/sides.js'
import { worldFromScenario } from '../../../src/sim/scenario.js'
import { decksOf } from '../../../src/sim/world/deck.js'
import { loadFixtureScenarioBundle } from '../../fixtures/scenarios.js'
import { settledAll, terrainOrSkip } from '../mission/fly.js'
import { withDestroyed } from './recoveryWorlds.js'

/*
 * 7h Task 3: the takeoff flown through the real pilot path (`advance` ->
 * `pilotTick` -> `takeoffControls`), on the real terrain at Dulag.
 * `takeoff-pair-fixture` is `takeoff-fixture` plus ai-2 100 m behind ai-1:
 * ai-1 at runway-local z +650, ai-2 at z +750, the runway on 000, so both
 * roll north with ai-1 ahead and the lower id.
 */
const terrain = terrainOrSkip()

const pair = (): World<undefined> => settledAll(worldFromScenario(loadFixtureScenarioBundle('takeoff-pair-fixture'), terrain))
const single = (): World<undefined> => settledAll(worldFromScenario(loadFixtureScenarioBundle('takeoff-fixture'), terrain))
const dist = (a: AircraftEntity, b: AircraftEntity): number => length(sub(a.state.position, b.state.position))
const modeOf = (w: World<undefined>, id: string) => aircraftById(w, id)!.pilot!.decision.mode
const phaseOf = (w: World<undefined>, id: string) => aircraftById(w, id)!.pilot!.decision.takeoff?.phase ?? null

/** A `PilotTickContext` for a start-of-tick world, as `advance` builds it. */
const tickCtx = (w: World<undefined>): PilotTickContext => ({
  nowS: w.tick * DT, terrain: w.terrain, decks: decksOf(w.ships), wind: w.wind, combat: w.combat,
  sides: sidesOf(w, w.aircraft), ships: w.ships,
})

describe('takeoff mode in the pilot tick (no terrain)', () => {
  it('holds on the brakes with no terrain (RF4)', () => {
    const w = worldFromScenario(loadFixtureScenarioBundle('takeoff-pair-fixture'), null)
    const a = aircraftById(w, 'ai-1')!
    const out = pilotTick(a, w.aircraft, tickCtx(w))
    expect(out.controls).toMatchObject({ throttle: 0, brake: 1 })
    expect(out.pilot!.decision.mode).toBe('takeoff')
    expect(out.pilot!.decision.takeoff!.phase).toBe('wait')
    expect(out.pilot!.decision.targetId).toBeNull()
  })
})

describe.skipIf(terrain === null)('takeoff mode in the pilot tick (Tier 1, real terrain)', () => {
  it('a pair takes off in id order and never closes inside 40 m on the ground (RF2)', () => {
    let w = pair()
    let minSep = Infinity
    const rollS: Record<string, number | null> = { 'ai-1': null, 'ai-2': null }
    for (let i = 0; i < 90 * 60; i++) {
      w = advance(w, DT).world
      const a = aircraftById(w, 'ai-1')!, b = aircraftById(w, 'ai-2')!
      expect(a.impact).toBeNull()
      expect(b.impact).toBeNull()
      for (const id of ['ai-1', 'ai-2']) if (rollS[id] === null && phaseOf(w, id) === 'roll') rollS[id] = w.tick * DT
      if (!airborne(a, terrain, []) || !airborne(b, terrain, [])) minSep = Math.min(minSep, dist(a, b))
    }
    expect(rollS['ai-1']).not.toBeNull()
    expect(rollS['ai-2']).not.toBeNull()
    expect(rollS['ai-1']!).toBeLessThan(rollS['ai-2']!)
    expect(minSep).toBeGreaterThan(40)
    expect(modeOf(w, 'ai-1')).not.toBe('takeoff')
    expect(modeOf(w, 'ai-2')).not.toBe('takeoff')
  }, 90000)

  it('a leader destroyed on the ground does not block the wingman (RF3)', () => {
    let w = withDestroyed(pair(), 'ai-1')
    for (let i = 0; i < 60 * 60; i++) w = advance(w, DT).world
    expect(modeOf(w, 'ai-2')).not.toBe('takeoff')
    expect(aircraftById(w, 'ai-2')!.impact).toBeNull()
  }, 60000)

  it('takes no target and never fires while taking off', () => {
    let w = pair()
    let takeoffTicks = 0
    for (let i = 0; i < 40 * 60; i++) {
      w = advance(w, DT).world
      for (const id of ['ai-1', 'ai-2']) {
        const a = aircraftById(w, id)!
        if (a.pilot!.decision.mode !== 'takeoff') continue
        takeoffTicks++
        expect(a.pilot!.decision.targetId).toBeNull()
        expect(a.controls.fire ?? false).toBe(false)
      }
    }
    expect(takeoffTicks).toBeGreaterThan(20 * 60)
  }, 40000)

  /*
   * The hand-off. Ended at the plan's 150 m, the floor (triggered below 400 m)
   * took the slow pilot at full stick and looped it into a spin: the Zero hit
   * the ground 70 s after the hand-off. TAKEOFF_DONE_M sits above the floor.
   */
  it('a Zero climbs out, becomes an ordinary pilot on the tick its takeoff ends, and flies on above the floor', () => {
    let w = single()
    let handoff: { readonly s: number; readonly heightM: number; readonly mode: string } | null = null
    for (let i = 0; i < 60 * 60 && handoff === null; i++) {
      const before = modeOf(w, 'ai-1')
      w = advance(w, DT).world
      const a = aircraftById(w, 'ai-1')!
      expect(a.impact).toBeNull()
      if (before === 'takeoff' && a.pilot!.decision.mode !== 'takeoff') {
        handoff = { s: w.tick * DT, heightM: heightAboveGround(a.state, w.terrain, decksOf(w.ships)), mode: a.pilot!.decision.mode }
        expect(a.pilot!.decision.takeoff).toBeUndefined()
      }
    }
    expect(handoff).not.toBeNull()
    expect(handoff!.s).toBeLessThan(60)
    expect(handoff!.heightM).toBeGreaterThanOrEqual(TAKEOFF_DONE_M)
    expect(['engage', 'loiter']).toContain(handoff!.mode)
    // 90 s more under the ordinary pilot: no impact, never back to takeoff,
    // never down to FLOOR_M (measured lowest 380 m, 2026-09-28).
    let minM = Infinity
    for (let i = 0; i < 90 * 60; i++) {
      w = advance(w, DT).world
      const a = aircraftById(w, 'ai-1')!
      expect(a.impact).toBeNull()
      expect(a.pilot!.decision.mode).not.toBe('takeoff')
      minM = Math.min(minM, heightAboveGround(a.state, w.terrain, decksOf(w.ships)))
    }
    expect(minM).toBeGreaterThan(FLOOR_M)
  }, 120000)
})
