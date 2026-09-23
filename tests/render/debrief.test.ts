import { describe, it, expect } from 'vitest'
import { debriefModel, destructionModel, landingModel, missionScore } from '../../src/render/debrief.js'
import { createState } from '../../src/sim/flight/state.js'
import { v3 } from '../../src/sim/math/vec3.js'
import type { Impact } from '../../src/sim/loop.js'

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
    const m = debriefModel(impact(), createState({ velocity: v3(40, -2, 0) }))
    expect(m.headline).toBe('DITCHED')
    expect(m.detail).toContain('survived')
  })

  it('says the pilot was killed by a wreck on land', () => {
    const m = debriefModel(
      impact({ surface: 'land', kind: 'destroyed', groundHeightM: 340 }),
      createState({ velocity: v3(150, -40, 0) }),
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
    )
    expect(m.headline).toBe('KILLED')
    expect(m.detail).toContain('deck')
    expect(m.detail).not.toContain('Leyte')
  })

  it('says the pilot was killed going into the sea', () => {
    const m = debriefModel(
      impact({ kind: 'destroyed' }),
      createState({ velocity: v3(150, -40, 0) }),
    )
    expect(m.headline).toBe('KILLED')
    expect(m.detail).toContain('sea')
  })

  it('reports the figures that explain the outcome', () => {
    const m = debriefModel(impact(), createState({ velocity: v3(40, -2, 0) }))
    const labels = m.figures.map((f) => f.label)
    expect(labels).toContain('Impact speed')
    expect(labels).toContain('Sink rate')
    expect(labels).toContain('Bank')
  })

  it('explains unattributed structural failure and combat destruction', () => {
    const state = createState({ position: v3(0, 1500, 0), velocity: v3(220, -20, 0) })
    const overload = destructionModel(state, null)
    expect(overload.headline).toBe('KILLED')
    expect(overload.detail).toContain('structural overload')
    expect(overload.figures).toContainEqual({ label: 'Altitude', value: '1500 m' })

    const combat = destructionModel(state, 'bandit-1')
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
    )
    const sinkRate = m.figures.find((f) => f.label === 'Sink rate')
    expect(sinkRate?.value).toBe('40 m/s')
  })

  it('names the airfield a landing was at', () => {
    const m = landingModel({ touchdownSinkMps: 1, touchdownSpeedMps: 40, rollOutM: 300, tick: 1, at: { kind: 'airfield', name: 'Tacloban' } })
    expect(m.figures).toContainEqual({ label: 'Landed at', value: 'Tacloban' })
  })

  it('reports an off-field landing when the touchdown was outside any runway', () => {
    const m = landingModel({ touchdownSinkMps: 1, touchdownSpeedMps: 40, rollOutM: 300, tick: 1, at: null })
    expect(m.figures).toContainEqual({ label: 'Landed at', value: 'off-field' })
  })

  it('names the carrier a trap was aboard, by the ship class name when it is known', () => {
    const m = landingModel({ touchdownSinkMps: 2.1, touchdownSpeedMps: 36, rollOutM: 34, tick: 1, at: { kind: 'carrier', name: 'cv-1' } }, { 'cv-1': 'Essex-class fleet carrier' })
    // Class name then hull id, with no "(carrier)" suffix: the class name
    // already says what it is, and "Essex-class fleet carrier (carrier)" read
    // as a placeholder (Plan 8 review, item 9).
    expect(m.figures.find((f) => f.label === 'Landed at')!.value).toBe('Essex-class fleet carrier cv-1')
  })

  it('falls back to the ship id alone when no class name was passed', () => {
    const m = landingModel({ touchdownSinkMps: 2.1, touchdownSpeedMps: 36, rollOutM: 34, tick: 1, at: { kind: 'carrier', name: 'cv-1' } })
    expect(m.figures.find((f) => f.label === 'Landed at')!.value).toBe('cv-1')
  })

  it('scores nothing, because nothing can be destroyed yet', () => {
    // Plan 9 owns scoring (master spec §8). This stub is the single place it
    // replaces; the categories below are §8's own, so the table's shape is
    // already right when real numbers arrive.
    const score = missionScore()
    expect(score.total).toBe(0)
    expect(score.rows.every((r) => r.destroyed === 0 && r.score === 0)).toBe(true)
    expect(score.rows.map((r) => r.target)).toContain('Carrier')
  })
})
