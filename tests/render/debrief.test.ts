import { describe, it, expect } from 'vitest'
import { debriefModel, missionScore } from '../../src/render/debrief.js'
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
