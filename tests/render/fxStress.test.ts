import { describe, expect, it } from 'vitest'
import { FX_STRESS_NAMES, STRESS_RANGE_M, stressRounds, stressScene } from '../../src/render/fx/stress.js'
import { v3 } from '../../src/sim/math/vec3.js'

const eye = v3(1000, 40, 2000), look = v3(0.8, -0.1, 0.6), ground = (): number => 5

describe('fx stress scenes (spec §4.5)', () => {
  it('the budget scene is the spec list: 8 bombs, 32 rockets, a burning ship, a collapse, one air kill, gunfire at 20 Hz', () => {
    const s = stressScene('budget', eye, look, ground)
    const n = (prefix: string): number => s.triggers.filter((t) => t.recipe.startsWith(prefix)).length
    expect(n('bomb.')).toBe(8)
    expect(n('rocket.')).toBe(32)
    expect(s.triggers.filter((t) => t.recipe.startsWith('rocket.water')).length).toBe(16)
    expect(n('kill.air')).toBe(1)
    expect(n('structure.collapse')).toBe(1)
    expect(s.sustained.map((x) => x.recipe).sort()).toEqual(['kill.air', 'ship.fire', 'structure.collapse'])
    expect(s.roundsHz).toBe(20)
    const h = Math.hypot(s.center.x - eye.x, s.center.z - eye.z)
    expect(h).toBeCloseTo(STRESS_RANGE_M, 6)
    expect(s.center.y).toBe(5)
  })
  it('gunfire alternates land and water, deterministically', () => {
    expect(stressRounds(v3(0, 5, 0), 3)).toEqual(stressRounds(v3(0, 5, 0), 3))
    expect(stressRounds(v3(0, 5, 0), 3).map((t) => t.recipe)).toEqual(['round.land', 'round.water'])
  })
  it('every name builds; none is empty', () => {
    for (const name of FX_STRESS_NAMES) expect(() => stressScene(name, eye, look, ground)).not.toThrow()
    const none = stressScene('none', eye, look, ground)
    expect([none.triggers.length, none.sustained.length, none.roundsHz]).toEqual([0, 0, 0])
  })
})
