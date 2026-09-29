import { describe, it, expect } from 'vitest'
import { pilotTick, type PilotTickContext } from '../../../src/sim/ai/pilotTick.js'
import { airborne } from '../../../src/sim/ai/airborne.js'
import { FLOOR_M, heightAboveGround } from '../../../src/sim/ai/safety.js'
import { TAKEOFF_DONE_M } from '../../../src/sim/ai/takeoff.js'
import { advance, aircraftById, withAircraftState, type AircraftEntity, type World } from '../../../src/sim/loop.js'
import { DETECTION_RANGE_M } from '../../../src/sim/ai/targeting.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { DT } from '../../../src/sim/flight/model.js'
import { length, sub } from '../../../src/sim/math/vec3.js'
import { sidesOf } from '../../../src/sim/sides.js'
import { worldFromScenario } from '../../../src/sim/scenario.js'
import { decksOf } from '../../../src/sim/world/deck.js'
import { loadFixtureScenarioBundle } from '../../fixtures/scenarios.js'
import { levelAt, settledAll, terrainOrSkip } from '../mission/fly.js'
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
  it.each(['a6m2-zero', 'f6f-hellcat'])('a %s climbs out, becomes an ordinary pilot on the tick its takeoff ends, and flies on above the floor', (specId) => {
    const spec = loadAircraftSpec(specId)
    const w0 = worldFromScenario(loadFixtureScenarioBundle('takeoff-fixture'), terrain)
    const r = handoffRun(settledAll({ ...w0, aircraft: w0.aircraft.map((a) => a.id === 'ai-1' ? { ...a, spec } : a) }))
    expect(['engage', 'loiter']).toContain(r.handoff.mode)
    expect(r.minM).toBeGreaterThan(FLOOR_M)
  }, 120000)

  /*
   * The hand-off into a fight: the player (pinned, so it only flies on) is
   * level at 450 m, 5 km north of the runway's end, crossing east at 110 m/s;
   * at the hand-off it is well inside DETECTION_RANGE_M, so the rescore on
   * that tick picks it and the pilot engages from ~64 m/s at 450 m.
   * Measured 2026-09-28: hand-off at 49.95 s, 450 m, the player 4.48 km off;
   * engaged on it to the end, lowest 450.5 m. At TAKEOFF_DONE_M 150 it fails.
   */
  it('a Zero that hands off with the player in range engages it and does not fly into the ground', () => {
    const pin = (w: World<undefined>): World<undefined> =>
      withAircraftState(w, w.player, { ...levelAt({ x: -34629 + 110 * w.tick * DT, z: -22229 }, 450, 110, 90), tick: w.tick })
    const r = handoffRun(settledAll(worldFromScenario(loadFixtureScenarioBundle('takeoff-engage-fixture'), terrain)), pin)
    expect(r.handoff.rangeM).toBeLessThan(DETECTION_RANGE_M)
    expect(r.engagedPlayer).toBe(true)
    expect(r.minM).toBeGreaterThan(FLOOR_M)
  }, 120000)
})

/**
 * ai-1 from brakes off to the hand-off (under 60 s), then 90 s more: no
 * impact, never back to `takeoff`. `pin` restages the world before each tick.
 */
function handoffRun(start: World<undefined>, pin: (w: World<undefined>) => World<undefined> = (w) => w) {
  let w = start
  const heightOf = (a: AircraftEntity): number => heightAboveGround(a.state, w.terrain, decksOf(w.ships))
  let handoff: { readonly s: number; readonly heightM: number; readonly mode: string; readonly rangeM: number } | null = null
  for (let i = 0; i < 60 * 60 && handoff === null; i++) {
    const before = modeOf(w, 'ai-1')
    w = advance(pin(w), DT).world
    const a = aircraftById(w, 'ai-1')!
    expect(a.impact).toBeNull()
    if (before === 'takeoff' && a.pilot!.decision.mode !== 'takeoff') {
      handoff = { s: w.tick * DT, heightM: heightOf(a), mode: a.pilot!.decision.mode, rangeM: dist(a, aircraftById(w, w.player)!) }
      expect(a.pilot!.decision.takeoff).toBeUndefined()
    }
  }
  expect(handoff).not.toBeNull()
  expect(handoff!.s).toBeLessThan(60)
  expect(handoff!.heightM).toBeGreaterThanOrEqual(TAKEOFF_DONE_M)
  let minM = Infinity
  let engagedPlayer = false
  for (let i = 0; i < 90 * 60; i++) {
    w = advance(pin(w), DT).world
    const a = aircraftById(w, 'ai-1')!
    expect(a.impact).toBeNull()
    expect(a.pilot!.decision.mode).not.toBe('takeoff')
    if (a.pilot!.decision.mode === 'engage' && a.pilot!.decision.targetId === w.player) engagedPlayer = true
    minM = Math.min(minM, heightOf(a))
  }
  return { handoff: handoff!, minM, engagedPlayer }
}
