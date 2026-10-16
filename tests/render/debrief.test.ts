import { describe, it, expect } from 'vitest'
import { DEV_SORTIE_STAMP, bailoutModel, debriefModel, destructionModel, killsSince, landingModel, missionScore, watchReplayAction, withNotRecorded } from '../../src/render/debrief.js'
import { withMissionDebrief } from '../../src/render/mission/debriefMission.js'
import { createState } from '../../src/sim/flight/state.js'
import { v3 } from '../../src/sim/math/vec3.js'
import type { Impact } from '../../src/sim/loop.js'
import { zeroKillsByType } from '../../src/sim/weapons/targetType.js'
import { deckOf, deckWorld } from '../../src/sim/world/deck.js'
import { landOnce, missionWorld } from '../sim/mission/fixture.js'
import type { BailoutOutcome, ParachutistEntity } from '../../src/sim/bailout.js'

const impact = (over: Partial<Impact> = {}): Impact => ({
  tick: 1200,
  position: v3(0, 0, 0),
  verticalSpeedMps: -2,
  groundHeightM: 0,
  surface: 'water',
  kind: 'ditched',
  ...over,
})

const parachutist = (outcome: BailoutOutcome, surface: 'land' | 'water' = 'land'): ParachutistEntity => {
  const state = {
    tick: 900,
    position: v3(10, 0, 20),
    velocity: v3(0, 0, 0),
    phase: outcome === 'killed' ? 'dead' as const : 'down' as const,
    phaseStartedTick: 900,
    lowAltitude: outcome === 'killed',
    contact: { tick: 900, position: v3(10, 0, 20), surface, verticalSpeedMps: -5.5 },
    outcome,
  }
  return {
    id: 'parachutist:player', sourceAircraft: 'player', side: 'allied', recoverySeed: 7,
    recoveryEnvironment: { daylight: 1, visibility: 0.8, weather: 0.1, seaState: 0.2 },
    recovery: outcome === 'killed' ? null : {
      facts: {
        seed: 7, surface, control: outcome === 'rescued' ? 'friendly' : 'enemy',
        friendlySupportM: 1_000, enemySupportM: 20_000,
        friendlyRescuePresent: outcome === 'rescued', enemyPresence: outcome === 'captured',
        daylight: 1, visibility: 0.8, weather: 0.1, seaState: 0.2,
      },
      cue: outcome === 'rescued' ? 'rescue-likely' : 'capture-likely',
      rescueProbability: outcome === 'rescued' ? 1 : 0,
      factors: [outcome === 'rescued' ? 'friendly-controlled area' : 'enemy-controlled area', surface, 'friendly support 0.6 mi'],
      roll: null,
    },
    state,
    previous: state,
  }
}

describe('the debrief', () => {
  it('offers Watch replay only with a handler, and invoking it calls that handler', () => {
    expect(watchReplayAction()).toBeNull()
    let watched = 0
    const action = watchReplayAction(() => { watched += 1 })
    expect(action?.label).toBe('Watch replay')
    action?.run()
    expect(watched).toBe(1)
  })

  it('says the pilot survived a ditching', () => {
    const m = debriefModel(impact(), createState({ velocity: v3(40, -2, 0) }), zeroKillsByType())
    expect(m.headline).toBe('DITCHED')
    expect(m.detail).toContain('survived')
  })

  it('says the pilot was killed by a wreck on land', () => {
    const m = debriefModel(
      impact({ surface: 'land', kind: 'destroyed', groundHeightM: 340 }),
      createState({ velocity: v3(150, -40, 0) }),
      zeroKillsByType(),
    )
    expect(m.headline).toBe('KILLED')
    expect(m.detail).toContain('Leyte')
  })

  it('says the pilot went into the DECK, not into Leyte (Plan 8 review)', () => {
    // `Impact.surface` has carried 'deck' since Plan 8's Task 2, and the
    // headline arm for it fell through to the land sentence -- a pilot who
    // flew into the round-down was told he had hit an island 60 km away.
    const m = debriefModel(
      impact({ surface: 'deck', kind: 'destroyed', groundHeightM: 17 }),
      createState({ velocity: v3(60, -12, 0) }),
      zeroKillsByType(),
    )
    expect(m.headline).toBe('KILLED')
    expect(m.detail).toContain('deck')
    expect(m.detail).not.toContain('Leyte')
  })

  it('says the pilot was killed going into the sea', () => {
    const m = debriefModel(
      impact({ kind: 'destroyed' }),
      createState({ velocity: v3(150, -40, 0) }),
      zeroKillsByType(),
    )
    expect(m.headline).toBe('KILLED')
    expect(m.detail).toContain('sea')
  })

  it('reports the figures that explain the outcome', () => {
    const m = debriefModel(impact(), createState({ velocity: v3(40, -2, 0) }), zeroKillsByType())
    expect(m.figures).toEqual([
      { label: 'Impact speed', value: '90 mph' },
      { label: 'Sink rate', value: '4 mph' },
      { label: 'Bank', value: '0°' },
    ])
  })

  it('explains unattributed structural failure and combat destruction', () => {
    const state = createState({ position: v3(0, 1500, 0), velocity: v3(220, -20, 0) })
    const overload = destructionModel(state, null, zeroKillsByType())
    expect(overload.headline).toBe('KILLED')
    expect(overload.detail).toContain('structural overload')
    expect(overload.figures).toContainEqual({ label: 'Final speed', value: '494 mph' })
    expect(overload.figures).toContainEqual({ label: 'Altitude', value: '4921 ft' })

    const combat = destructionModel(state, 'bandit-1', zeroKillsByType())
    expect(combat.detail).toContain('combat')
    // M2: a ship's or battery's id is not an airplane's, and the debrief says so.
    expect(destructionModel(state, 'dd-1', zeroKillsByType(), true).detail).toContain('antiaircraft')
    const rammed = destructionModel(state, 'collision:dd-1', zeroKillsByType(), false, 'USS Fletcher')
    expect(rammed.detail).toBe('The aircraft collided with USS Fletcher.')
    expect(rammed.outcome).toBe('killed')
  })

  it('shows sink rate as a positive number, not the signed velocity it comes from', () => {
    // `verticalSpeedMps` is `velocity.y`, negative while descending (same
    // convention `contact.ts`'s `sinkingGently` gate uses) -- a 40 m/s dive
    // must read "89 mph", not "-89 mph" next to the positive Impact speed
    // and Bank figures.
    const m = debriefModel(
      impact({ verticalSpeedMps: -40 }),
      createState({ velocity: v3(150, -40, 0) }),
      zeroKillsByType(),
    )
    const sinkRate = m.figures.find((f) => f.label === 'Sink rate')
    expect(sinkRate?.value).toBe('89 mph')
  })

  it('names the airfield a landing was at', () => {
    const m = landingModel(
      { touchdownSinkMps: 1, touchdownSpeedMps: 40, rollOutM: 300, tick: 1, at: { kind: 'airfield', id: 'tacloban', name: 'Tacloban' } },
      zeroKillsByType(),
    )
    expect(m.figures).toContainEqual({ label: 'Landed at', value: 'Tacloban' })
  })

  it('uses imperial units for every landing figure', () => {
    const m = landingModel(
      { touchdownSinkMps: 1.35, touchdownSpeedMps: 37.7, rollOutM: 583, tick: 1, at: null },
      zeroKillsByType(),
    )
    expect(m.figures).toEqual([
      { label: 'Landed at', value: 'off-field' },
      { label: 'Touchdown sink', value: '3 mph' },
      { label: 'Touchdown speed', value: '84 mph' },
      { label: 'Roll-out', value: '1913 ft' },
    ])
  })

  it('reports an off-field landing when the touchdown was outside any runway', () => {
    const m = landingModel(
      { touchdownSinkMps: 1, touchdownSpeedMps: 40, rollOutM: 300, tick: 1, at: null },
      zeroKillsByType(),
    )
    expect(m.figures).toContainEqual({ label: 'Landed at', value: 'off-field' })
  })

  it('names the carrier a trap was aboard, by the ship class name when it is known', () => {
    const m = landingModel(
      { touchdownSinkMps: 2.1, touchdownSpeedMps: 36, rollOutM: 34, tick: 1, at: { kind: 'carrier', id: 'cv-1', name: 'cv-1' } },
      zeroKillsByType(),
      { 'cv-1': 'Essex-class fleet carrier' },
    )
    // Class name then hull id, with no "(carrier)" suffix: the class name
    // already says what it is, and "Essex-class fleet carrier (carrier)" read
    // as a placeholder (Plan 8 review, item 9).
    expect(m.figures.find((f) => f.label === 'Landed at')!.value).toBe('Essex-class fleet carrier cv-1')
  })

  it('falls back to the ship id alone when no class name was passed', () => {
    const m = landingModel(
      { touchdownSinkMps: 2.1, touchdownSpeedMps: 36, rollOutM: 34, tick: 1, at: { kind: 'carrier', id: 'cv-1', name: 'cv-1' } },
      zeroKillsByType(),
    )
    expect(m.figures.find((f) => f.label === 'Landed at')!.value).toBe('cv-1')
  })

  it('banks a landing\'s kills at the full (1.0x) recovery multiplier', () => {
    const kills = { ...zeroKillsByType(), fighter: 1 }
    const m = landingModel(
      { touchdownSinkMps: 1, touchdownSpeedMps: 40, rollOutM: 300, tick: 1, at: null },
      kills,
    )
    expect(m.score).toEqual(missionScore(kills, 'landed'))
  })

  it('banks a ditching\'s kills in full (Mark, 2026-09-27)', () => {
    const kills = { ...zeroKillsByType(), bomber: 2 }
    const m = debriefModel(impact(), createState({ velocity: v3(40, -2, 0) }), kills)
    expect(m.score).toEqual(missionScore(kills, 'ditched'))
  })

  it('banks a killed pilot\'s kills in full: death costs the badge, not the points', () => {
    const kills = { ...zeroKillsByType(), carrier: 1 }
    const m = destructionModel(createState({ velocity: v3(150, -40, 0) }), 'bandit-1', kills)
    expect(m.score).toEqual(missionScore(kills, 'killed'))
    expect(m.score.total).toBe(5000)
  })

  it('reports bailout recovery evidence and banks rescued or captured kills in full', () => {
    const kills = { ...zeroKillsByType(), fighter: 1 }
    const rescued = bailoutModel(parachutist('rescued', 'water'), kills)
    expect(rescued).toMatchObject({ headline: 'RESCUED', outcome: 'rescued' })
    expect(rescued.detail).toContain('at sea')
    expect(rescued.detail).toContain('Mission not credited')
    expect(rescued.figures).toContainEqual({ label: 'Contact descent', value: '18 ft/s' })
    expect(rescued.figures).toContainEqual({ label: 'Recovery assessment', value: 'RESCUE LIKELY' })
    expect(rescued.score).toEqual(missionScore(kills, 'rescued'))

    const captured = bailoutModel(parachutist('captured'), kills)
    expect(captured).toMatchObject({ headline: 'CAPTURED', outcome: 'captured' })
    expect(captured.detail).toContain('prisoner')
    expect(captured.detail).toContain('new pilot')
    for (const m of [rescued, captured, bailoutModel(parachutist('killed'), kills)]) {
      expect(JSON.stringify(m.figures) + m.detail, 'no metric units in the player-facing debrief').not.toMatch(/\bkm\b|\bm\/s\b|\d m\b/)
    }
    expect(bailoutModel(parachutist('killed'), kills).detail).toContain('height')
    expect(captured.score).toEqual(missionScore(kills, 'captured'))
  })

  // Whole-branch review I-3: `outcome` is what `createDebrief`'s renderer
  // needs to label the "Recovery: ..." line -- `score.multiplier` alone is
  // the NUMBER, not which of the three outcomes produced it.
  it('carries the outcome each model builder actually scored against', () => {
    expect(landingModel({ touchdownSinkMps: 1, touchdownSpeedMps: 40, rollOutM: 300, tick: 1, at: null }, zeroKillsByType()).outcome).toBe('landed')
    expect(debriefModel(impact({ kind: 'ditched' }), createState({ velocity: v3(40, -2, 0) }), zeroKillsByType()).outcome).toBe('ditched')
    expect(debriefModel(impact({ kind: 'destroyed' }), createState({ velocity: v3(150, -40, 0) }), zeroKillsByType()).outcome).toBe('killed')
    expect(destructionModel(createState({ velocity: v3(150, -40, 0) }), null, zeroKillsByType()).outcome).toBe('killed')
  })
})

describe('missionScore', () => {
  it('applies master spec §8\'s point table and the recovery multiplier', () => {
    const kills = { ...zeroKillsByType(), fighter: 2, carrier: 1 }
    const landed = missionScore(kills, 'landed')
    expect(landed.total).toBe(2 * 500 + 1 * 5000)
    // Mark, 2026-09-27: every recovery banks in full; death and ditching
    // cost only the badge.
    const ditched = missionScore(kills, 'ditched')
    expect(ditched.total).toBe(2 * 500 + 1 * 5000)
    const killed = missionScore(kills, 'killed')
    expect(killed.total).toBe(2 * 500 + 1 * 5000)
  })

  // F5A (2026-10-14, ruling D14): one table for all play, so transport is 500 (was 400) and destroyer 1,000 (was 750).
  it('scores a sunk transport at 500 and a destroyer at 1,000', () => {
    expect(missionScore({ ...zeroKillsByType(), transport: 2, destroyer: 1 }, 'landed').total).toBe(2 * 500 + 1000)
  })

  it('scores the two campaign rows: a light vehicle at 100 and a landing craft at 250', () => {
    expect(missionScore({ ...zeroKillsByType(), 'light-vehicle': 3, 'landing-craft': 2 }, 'landed').total).toBe(3 * 100 + 2 * 250)
  })

  it('scores a destroyed tank at 300', () => {
    expect(missionScore({ ...zeroKillsByType(), tank: 2 }, 'landed').total).toBe(600)
  })

  it('every row is present even at zero, including tanks', () => {
    const score = missionScore(zeroKillsByType(), 'landed')
    expect(score.rows).toHaveLength(13)
    expect(score.rows.find((row) => row.target === 'Tank')).toEqual({ target: 'Tank', destroyed: 0, score: 0 })
    expect(score.total).toBe(0)
  })
})

describe('killsSince', () => {
  it('is the per-type difference, not the raw current total', () => {
    const baseline = { ...zeroKillsByType(), fighter: 3 }
    const current = { ...zeroKillsByType(), fighter: 5, carrier: 1 }
    const delta = killsSince(current, baseline)
    expect(delta.fighter).toBe(2)
    expect(delta.carrier).toBe(1)
  })
})

describe('the land -> continue -> one more kill -> land again sequence (an unscored sortie keeps Continue)', () => {
  // `main.ts` keeps a `scoredThroughKillsByType` baseline it moves to the player's `tagCredits` (F5B: one scoring
  // table, destruction credit by damage tag) at every debrief and never on Continue -- so a second landing after
  // Continue shows only the credit earned since the FIRST landing. A banked campaign sortie has no Continue at all;
  // this sequence is what a Training or Single Missions sortie still does.
  it('shows only the second landing\'s own credit, not the cumulative total again', () => {
    const report = { touchdownSinkMps: 1, touchdownSpeedMps: 40, rollOutM: 300, tick: 1, at: null } as const
    let scoredThrough = zeroKillsByType()

    const afterFirstFlight = { ...zeroKillsByType(), fighter: 1 }
    const firstDelta = killsSince(afterFirstFlight, scoredThrough)
    expect(firstDelta.fighter).toBe(1)
    const firstModel = landingModel(report, firstDelta)
    expect(firstModel.score.total).toBe(500)
    scoredThrough = afterFirstFlight

    // Continue (baseline untouched), fly on, one more credit: the cumulative reads 2, the delta must read 1.
    const afterContinuing = { ...zeroKillsByType(), fighter: 2 }
    const secondDelta = killsSince(afterContinuing, scoredThrough)
    expect(secondDelta.fighter).toBe(1)
    expect(landingModel(report, secondDelta).score.total).toBe(500)
  })
})

describe('withMissionDebrief', () => {
  const RECOVER = { id: 'home', label: 'Recover', priority: 'primary', kind: 'land', at: 'cv-1' }

  it('sets mission and a badge id on a mission world where the badge was earned', () => {
    let w = missionWorld({ objectives: [RECOVER], badge: { id: 'cq', name: 'Carrier Qualified' } })
    const deck = deckOf(w.ships.find((s) => s.id === 'cv-1')!)!
    const p = deckWorld(deck, 0, 0)
    w = landOnce(w, p.x, deck.center.y, p.z)
    const model = landingModel(
      { touchdownSinkMps: 1, touchdownSpeedMps: 40, rollOutM: 300, tick: 1, at: { kind: 'carrier', id: 'cv-1', name: 'cv-1' } },
      zeroKillsByType(),
    )
    const { model: withMission, badgeId } = withMissionDebrief(model, w)
    expect(withMission.mission).toBeDefined()
    expect(withMission.mission!.verdict).toBe('BADGE AWARDED: Carrier Qualified')
    expect(badgeId).toBe('cq')
  })

  it('returns the SAME model object and a null badge id for a mission-less world', () => {
    const w = missionWorld({})
    const model = landingModel(
      { touchdownSinkMps: 1, touchdownSpeedMps: 40, rollOutM: 300, tick: 1, at: null },
      zeroKillsByType(),
    )
    const result = withMissionDebrief(model, w)
    expect(result.model).toBe(model)
    expect(result.badgeId).toBeNull()
  })
})

describe('the Dev sortie stamp (sortie spec A5)', () => {
  const m = debriefModel(impact(), createState({ velocity: v3(40, -2, 0) }), zeroKillsByType())
  it('marks a Dev sortie not recorded, and leaves any other model as it was', () => {
    expect(withNotRecorded(m, true).notRecorded).toBe(true)
    expect(withNotRecorded(m, true).headline).toBe(m.headline)
    expect(withNotRecorded(m, false)).toBe(m)
    expect(DEV_SORTIE_STAMP).toBe('Dev sortie: not recorded')
  })
})
