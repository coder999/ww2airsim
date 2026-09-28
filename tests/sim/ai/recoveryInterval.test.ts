import { describe, expect, it } from 'vitest'
import { aircraftById, type World } from '../../../src/sim/loop.js'
import { DT } from '../../../src/sim/flight/model.js'
import { INTERVAL_S, RTB_IDLE_S } from '../../../src/sim/ai/recovery.js'
import { deckLocal, decksOf } from '../../../src/sim/world/deck.js'
import { terrainOrSkip } from '../mission/fly.js'
import { buildRecovery, crashed, fly, homed, onApproach, phaseOf, withDestroyed, withGunsEmpty } from './recoveryWorlds.js'

type W = World<undefined>

const terrain = terrainOrSkip()

/** Where the pair starts: this far short of the aim (4 km outside the IP), ... */
const START_ALONG_M = 12000
/** ...this far either side of the centerline, ... */
const START_ACROSS_M = 400
/** ...wheels this high above touchdown, at this airspeed, down the centerline. */
const START_WHEEL_M = 800
const START_AIRSPEED_MPS = 110

/** The wingman case starts further out, so its transit outlasts RTB_IDLE_S. */
const WING_START_ALONG_M = 20000

/** Seconds each is watched on its spot after the respot. */
const WATCH_AFTER_RESPOT_S = 5
const ON_SPOT_M = 0.5

type PairRun = {
  /** Sim seconds (tick x DT) of the first tick each id was in `join`. */
  readonly joinedS: Record<string, number>
  /** Sim seconds of the first tick each id was in mode `landed`. */
  readonly landedS: Record<string, number>
  readonly respotTick: Record<string, number>
  readonly worstOffSpotM: Record<string, number>
  readonly crashed: Record<string, boolean>
  readonly world: W
}

/**
 * `ids`, in that array order, homed to `home`, both out of ammunition, at
 * START_ALONG_M on the extended centerline mirrored about it: the same
 * distance to the IP. Flown until both are respotted and watched, or `maxS`.
 */
function flyPair(ids: readonly string[], home: { ship: string } | { airfield: string }, maxS: number): PairRun {
  const extra = 'airfield' in home ? { ships: [] } : {}
  let w = buildRecovery(ids.map((id) => homed(id, home, [0, 1000, 20000])), extra, 'airfield' in home ? terrain : null)
  for (const id of ids) {
    // ai-a to port, ai-b to starboard, whatever the array order.
    const across = id === 'ai-a' ? -START_ACROSS_M : START_ACROSS_M
    w = withGunsEmpty(onApproach(w, id, { alongM: START_ALONG_M, acrossM: across, wheelM: START_WHEEL_M, airspeedMps: START_AIRSPEED_MPS }), id)
  }
  const joinedS: Record<string, number> = {}
  const landedS: Record<string, number> = {}
  const respotTick: Record<string, number> = {}
  const worstOffSpotM: Record<string, number> = {}
  const didCrash: Record<string, boolean> = {}
  const world = fly(w, maxS, (x) => {
    for (const id of ids) {
      const a = aircraftById(x, id)!
      didCrash[id] ||= crashed(x, id)
      if (joinedS[id] === undefined && phaseOf(x, id) === 'join') joinedS[id] = x.tick * DT
      if (landedS[id] === undefined && a.pilot!.decision.mode === 'landed') landedS[id] = x.tick * DT
      if (respotTick[id] === undefined && a.pilot!.decision.recovery?.respotted === true) respotTick[id] = x.tick
      if (respotTick[id] !== undefined) {
        const h = a.pilot!.home!
        const off = h.kind === 'ship'
          ? (() => {
              const l = deckLocal(decksOf(x.ships).find((d) => d.shipId === h.id)!, a.state.position.x, a.state.position.z)
              return Math.hypot(l.x - h.parkSpot.x, l.z - h.parkSpot.z)
            })()
          : Math.hypot(a.state.position.x - h.parkWorld.x, a.state.position.z - h.parkWorld.z)
        worstOffSpotM[id] = Math.max(worstOffSpotM[id] ?? 0, off)
      }
    }
    return ids.every((id) => respotTick[id] !== undefined && x.tick - respotTick[id]! >= WATCH_AFTER_RESPOT_S / DT)
  })
  return { joinedS, landedS, respotTick, worstOffSpotM, crashed: didCrash, world }
}

/** Leader ai-1, homed to cv-1, WING_START_ALONG_M out on the centerline;
 *  `wing` (ai-2) on its slot-1 station, 80 m aft and 100 m right. */
function wingPair(wing: unknown): W {
  let w = buildRecovery([homed('ai-1', { ship: 'cv-1' }, [0, 1000, 20000]), wing])
  w = onApproach(w, 'ai-1', { alongM: WING_START_ALONG_M, wheelM: START_WHEEL_M, airspeedMps: START_AIRSPEED_MPS })
  return onApproach(w, 'ai-2', { alongM: WING_START_ALONG_M + 80, acrossM: 100, wheelM: START_WHEEL_M, airspeedMps: START_AIRSPEED_MPS, homeOf: 'ai-1' })
}

function expectIntervalHeld(run: PairRun): void {
  for (const id of ['ai-a', 'ai-b']) {
    expect(run.joinedS[id], `${id} never joined`).toBeDefined()
    expect(run.landedS[id], `${id} never landed`).toBeDefined()
    expect(run.respotTick[id], `${id} never respotted`).toBeDefined()
    expect(run.crashed[id], `${id} crashed`).toBe(false)
    expect(aircraftById(run.world, id)!.impact).toBeNull()
    expect(run.worstOffSpotM[id]!).toBeLessThan(ON_SPOT_M)
  }
  expect(run.joinedS['ai-a']!).toBeLessThan(run.joinedS['ai-b']!)
  // Both in seconds (tick x DT): the brief's `INTERVAL_S * 60` is the same
  // bound in 60 Hz ticks.
  expect(run.joinedS['ai-b']! - run.joinedS['ai-a']!).toBeGreaterThanOrEqual(INTERVAL_S)
  // The second is not on the approach until the first is down.
  expect(run.joinedS['ai-b']!).toBeGreaterThan(run.landedS['ai-a']!)
  const spot = (id: string) => aircraftById(run.world, id)!.pilot!.home!.parkSpot
  expect(spot('ai-a')).not.toEqual(spot('ai-b'))
}

describe('the landing interval (7c-7g §6, Review Focus 3)', () => {
  it('two AI homed to one carrier trigger together: the lower id approaches first, the other holds, 60 s apart; array order does not matter (Review Focus 3)', () => {
    const runs = [['ai-a', 'ai-b'], ['ai-b', 'ai-a']].map((order) => flyPair(order, { ship: 'cv-1' }, 1200))
    for (const run of runs) {
      expectIntervalHeld(run)
      const deck = decksOf(run.world.ships)[0]!
      for (const id of ['ai-a', 'ai-b']) {
        const a = aircraftById(run.world, id)!
        const h = a.pilot!.home!
        if (h.kind !== 'ship') throw new Error('expected a ship home')
        // At rest on its spot, forward of the trap zone (spec §3 acceptance).
        expect(h.parkSpot.z + deck.lengthM / 2).toBeGreaterThan(deck.trapToSternM)
        expect(a.pilot!.decision.mode).toBe('landed')
        expect(a.state.arrested).toBe(false)
      }
    }
    // The array order changes nothing: the same times, tick for tick.
    expect(runs[1]!.joinedS).toEqual(runs[0]!.joinedS)
    expect(runs[1]!.landedS).toEqual(runs[0]!.landedS)
  })

  it('a wingman flies formation home and peels off at the IP into its own recovery', () => {
    // Leader ai-1 homed to cv-1 and out of ammunition; wingman ai-2 in slot 1
    // (80 m aft, 100 m right), homed to cv-1 too, with its guns full. 12 km
    // outside the IP, so the transit outlasts RTB_IDLE_S: alone, the wingman
    // would go home by itself on the way.
    const wing = { ...homed('ai-2', { ship: 'cv-1' }, [0, 1000, 20000]), pilot: { skill: 'veteran', leader: 'ai-1', slot: 1, home: { ship: 'cv-1' } } }
    const w = withGunsEmpty(wingPair(wing), 'ai-1')
    let leaderTransitTicks = 0
    let wingFormationInLeaderTransit = 0
    let leaderPastTransitS: number | null = null
    let wingRtbS: number | null = null
    const landed: Record<string, boolean> = {}
    let didCrash = false
    fly(w, 1200, (x) => {
      const leader = aircraftById(x, 'ai-1')!.pilot!.decision
      const wingman = aircraftById(x, 'ai-2')!.pilot!.decision
      didCrash ||= crashed(x, 'ai-1') || crashed(x, 'ai-2')
      if (leader.mode === 'rtb' && leader.recovery?.phase === 'transit' && leaderPastTransitS === null) {
        leaderTransitTicks++
        if (wingman.mode === 'formation') wingFormationInLeaderTransit++
      }
      if (leaderPastTransitS === null && (phaseOf(x, 'ai-1') === 'hold' || phaseOf(x, 'ai-1') === 'join')) leaderPastTransitS = x.tick * DT
      if (wingRtbS === null && wingman.mode === 'rtb') wingRtbS = x.tick * DT
      for (const id of ['ai-1', 'ai-2']) landed[id] ||= aircraftById(x, id)!.pilot!.decision.recovery?.respotted === true
      return landed['ai-1'] === true && landed['ai-2'] === true
    })
    expect(didCrash).toBe(false)
    expect(leaderTransitTicks * DT).toBeGreaterThan(RTB_IDLE_S)
    // The first reaction time after the leader turns for home aside, the
    // wingman is on station for the whole transit.
    expect(wingFormationInLeaderTransit).toBeGreaterThan(leaderTransitTicks - 2 / DT)
    expect(leaderPastTransitS, 'the leader never reached its IP').not.toBeNull()
    expect(wingRtbS, 'the wingman never went into rtb').not.toBeNull()
    expect(wingRtbS!).toBeGreaterThanOrEqual(leaderPastTransitS!)
    expect(wingRtbS! - leaderPastTransitS!).toBeLessThanOrEqual(5)
    expect(landed['ai-1']).toBe(true)
    expect(landed['ai-2']).toBe(true)
  })

  it('a wingman without a home keeps station through the transit, then loiters when its leader peels off', () => {
    const wing = { ...homed('ai-2', { ship: 'cv-1' }, [0, 1000, 20000]), pilot: { skill: 'veteran', leader: 'ai-1', slot: 1 } }
    const w = withGunsEmpty(wingPair(wing), 'ai-1')
    const modes = new Set<string>()
    let leaderJoinedTick: number | null = null
    fly(w, 180, (x) => {
      const leader = aircraftById(x, 'ai-1')!.pilot!.decision
      const wingman = aircraftById(x, 'ai-2')!.pilot!.decision
      if (leader.recovery?.phase === 'transit' && x.tick * DT > 2) modes.add(`transit:${wingman.mode}`)
      if (leaderJoinedTick === null && phaseOf(x, 'ai-1') === 'join') leaderJoinedTick = x.tick
      // Measured from 5 s after the leader's join: one reaction time to see it.
      if (leaderJoinedTick !== null && x.tick - leaderJoinedTick > 5 / DT) modes.add(`after:${wingman.mode}`)
      return leaderJoinedTick !== null && x.tick - leaderJoinedTick > 30 / DT
    })
    expect([...modes].sort()).toEqual(['after:loiter', 'transit:formation'])
    expect(aircraftById(fly(w, 0), 'ai-2')!.pilot!.home).toBeUndefined()
  })

  it('a wingman whose leader goes down on the way home keeps its own home and goes home on its own triggers', () => {
    const wing = { ...homed('ai-2', { ship: 'cv-1' }, [0, 1000, 20000]), pilot: { skill: 'veteran', leader: 'ai-1', slot: 1, home: { ship: 'cv-1' } } }
    const w1 = fly(withGunsEmpty(wingPair(wing), 'ai-1'), 10)
    expect(phaseOf(w1, 'ai-1')).toBe('transit')
    expect(aircraftById(w1, 'ai-2')!.pilot!.decision.mode).toBe('formation')
    let rtbS: number | null = null
    fly(withDestroyed(w1, 'ai-1'), 60, (x) => {
      const p = aircraftById(x, 'ai-2')!.pilot!
      expect(p.home, 'the home was dropped with the leader').toBeDefined()
      if (p.decision.mode === 'rtb') rtbS = x.tick * DT
      return rtbS !== null
    })
    // Its own idle trigger: RTB_IDLE_S after its first rescore (ruling P10).
    expect(rtbS, 'the leaderless wingman never went home').not.toBeNull()
    expect(rtbS!).toBeLessThanOrEqual(RTB_IDLE_S + 2)
  })

  it.skipIf(terrain === null)('the same interval ashore (skips without tiles)', () => {
    const runs = [['ai-a', 'ai-b'], ['ai-b', 'ai-a']].map((order) => flyPair(order, { airfield: 'tacloban' }, 1200))
    for (const run of runs) {
      expectIntervalHeld(run)
      for (const id of ['ai-a', 'ai-b']) expect(aircraftById(run.world, id)!.pilot!.decision.mode).toBe('landed')
    }
    expect(runs[1]!.joinedS).toEqual(runs[0]!.joinedS)
    expect(runs[1]!.landedS).toEqual(runs[0]!.landedS)
  })
})
