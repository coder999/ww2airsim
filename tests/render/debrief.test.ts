import { describe, it, expect } from 'vitest'
import { debriefModel, destructionModel, killsSince, landingModel, missionScore } from '../../src/render/debrief.js'
import { createState } from '../../src/sim/flight/state.js'
import { v3 } from '../../src/sim/math/vec3.js'
import type { Impact } from '../../src/sim/loop.js'
import { zeroKillsByType } from '../../src/sim/weapons/targetType.js'
import { applyMissionResultToRoster, createPilot, type PilotRecord } from '../../src/render/roster.js'

const impact = (over: Partial<Impact> = {}): Impact => ({
  tick: 1200,
  position: v3(0, 0, 0),
  verticalSpeedMps: -2,
  groundHeightM: 0,
  surface: 'water',
  kind: 'ditched',
  ...over,
})

describe('the debrief', () => {
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
    const labels = m.figures.map((f) => f.label)
    expect(labels).toContain('Impact speed')
    expect(labels).toContain('Sink rate')
    expect(labels).toContain('Bank')
  })

  it('explains unattributed structural failure and combat destruction', () => {
    const state = createState({ position: v3(0, 1500, 0), velocity: v3(220, -20, 0) })
    const overload = destructionModel(state, null, zeroKillsByType())
    expect(overload.headline).toBe('KILLED')
    expect(overload.detail).toContain('structural overload')
    expect(overload.figures).toContainEqual({ label: 'Altitude', value: '1500 m' })

    const combat = destructionModel(state, 'bandit-1', zeroKillsByType())
    expect(combat.detail).toContain('combat')
  })

  it('shows sink rate as a positive number, not the signed velocity it comes from', () => {
    // `verticalSpeedMps` is `velocity.y`, negative while descending (same
    // convention `contact.ts`'s `sinkingGently` gate uses) -- a 40 m/s dive
    // must read "40 m/s", not "-40 m/s" next to the positive Impact speed
    // and Bank figures.
    const m = debriefModel(
      impact({ verticalSpeedMps: -40 }),
      createState({ velocity: v3(150, -40, 0) }),
      zeroKillsByType(),
    )
    const sinkRate = m.figures.find((f) => f.label === 'Sink rate')
    expect(sinkRate?.value).toBe('40 m/s')
  })

  it('names the airfield a landing was at', () => {
    const m = landingModel(
      { touchdownSinkMps: 1, touchdownSpeedMps: 40, rollOutM: 300, tick: 1, at: { kind: 'airfield', id: 'tacloban', name: 'Tacloban' } },
      zeroKillsByType(),
    )
    expect(m.figures).toContainEqual({ label: 'Landed at', value: 'Tacloban' })
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

  it('banks a ditching\'s kills at the half (0.5x) recovery multiplier', () => {
    const kills = { ...zeroKillsByType(), bomber: 2 }
    const m = debriefModel(impact(), createState({ velocity: v3(40, -2, 0) }), kills)
    expect(m.score).toEqual(missionScore(kills, 'ditched'))
  })

  it('banks nothing when the pilot was killed (0x recovery multiplier)', () => {
    const kills = { ...zeroKillsByType(), carrier: 1 }
    const m = destructionModel(createState({ velocity: v3(150, -40, 0) }), 'bandit-1', kills)
    expect(m.score).toEqual(missionScore(kills, 'killed'))
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
    const ditched = missionScore(kills, 'ditched')
    expect(ditched.total).toBe(Math.round((2 * 500 + 1 * 5000) * 0.5))
    const killed = missionScore(kills, 'killed')
    expect(killed.total).toBe(0)
  })

  it('every row is present even at zero, in master spec §8\'s eight categories', () => {
    const score = missionScore(zeroKillsByType(), 'landed')
    expect(score.rows).toHaveLength(8)
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

describe('the land -> continue -> one more kill -> land again sequence (Plan 9 Task 6 Review Focus)', () => {
  // `main.ts` keeps a `scoredThroughKillsByType` baseline it updates to the
  // aircraft's current cumulative `killsByType` at every bank (landing,
  // ditching or death) and never on Continue -- so a second landing after
  // Continue must bank only the kills earned since the FIRST landing, not
  // the flight's whole cumulative total a second time. This drives exactly
  // that sequence through the same pure functions `main.ts`'s debrief call
  // sites use (`killsSince`, `landingModel`, `applyMissionResultToRoster`),
  // without a DOM or `main.ts`'s own boot() closure.
  it('banks only the second landing\'s own kill, not the cumulative total again', () => {
    const report = { touchdownSinkMps: 1, touchdownSpeedMps: 40, rollOutM: 300, tick: 1, at: null } as const
    const pilot = createPilot('Boyington')
    let roster: readonly PilotRecord[] = [pilot]
    let scoredThroughKillsByType = zeroKillsByType()

    // One fighter kill, then a first landing: banks that one kill at the
    // 1.0x landed multiplier (500 points).
    const afterFirstFlight = { ...zeroKillsByType(), fighter: 1 }
    const firstDelta = killsSince(afterFirstFlight, scoredThroughKillsByType)
    expect(firstDelta.fighter).toBe(1)
    const firstModel = landingModel(report, firstDelta)
    expect(firstModel.score.total).toBe(500)
    scoredThroughKillsByType = afterFirstFlight
    roster = applyMissionResultToRoster(roster, pilot.id, firstModel.score.total, 'landed', firstDelta)
    expect(roster[0]!.cumulativeScore).toBe(500)
    // I-2: the career killsByType banked the delta, not the raw cumulative.
    expect(roster[0]!.killsByType.fighter).toBe(1)

    // Continue (no bank, baseline untouched), fly on, get exactly ONE more
    // kill -- the aircraft's `killsByType` is now cumulative since boot, not
    // since the first landing, so it reads 2 fighters, not 1.
    const afterContinuing = { ...zeroKillsByType(), fighter: 2 }
    const secondDelta = killsSince(afterContinuing, scoredThroughKillsByType)
    // The whole point of the baseline: this must be 1 (one new kill), never
    // 2 (the raw cumulative total) -- the double-banking bug this plan's
    // Review Focus names.
    expect(secondDelta.fighter).toBe(1)
    const secondModel = landingModel(report, secondDelta)
    expect(secondModel.score.total).toBe(500) // one more fighter kill, not two
    scoredThroughKillsByType = afterContinuing
    roster = applyMissionResultToRoster(roster, pilot.id, secondModel.score.total, 'landed', secondDelta)

    // 500 (first landing) + 500 (second landing's one new kill) = 1000, NOT
    // 500 + 1000 (re-banking both cumulative fighter kills the second time).
    expect(roster[0]!.cumulativeScore).toBe(1000)
    expect(roster[0]!.missionsFlown).toBe(2)
    // I-2: killsByType accumulated by DELTA across both bankings (1 + 1 = 2),
    // not re-banked from the aircraft's raw cumulative (which would read 2
    // the first time and 2 again the second, i.e. never wrongly doubled, but
    // also never wrongly stuck at 1).
    expect(roster[0]!.killsByType.fighter).toBe(2)
  })
})
