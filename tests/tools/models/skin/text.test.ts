// tests/tools/models/skin/text.test.ts
import { describe, expect, it } from 'vitest'
import { coverage } from '../../../../tools/models/skin/layers.js'
import { parseSidecar, type Marking } from '../../../../tools/models/skin/sidecar.js'
import { GLYPHS, strokeDistance, strokeLength } from '../../../../tools/models/skin/strokeFont.js'
import { fixtureSidecar } from './fixture.js'

type V3 = [number, number, number]
const text = (over: Record<string, unknown>): Marking =>
  fixtureSidecar({ markings: [{ kind: 'text', tags: ['wing'], origin: [0, 0, 0], axis: [0, 0, 1], uDir: [1, 0, 0], text: '2', heightM: 1, strokeM: 0.1, color: 'insigniaWhite', ...over }] }).markings[0]!

describe('the stroke font (DP2)', () => {
  it('has every digit, a dash and a space, each stroke inside its 0.5 x 1 box', () => {
    expect(Object.keys(GLYPHS).sort().join('')).toBe(' -0123456789')
    for (const [c, lines] of Object.entries(GLYPHS)) for (const l of lines) for (const [x, y] of l) {
      expect(x >= 0 && x <= 0.5 && y >= 0 && y <= 1, `${c}: (${x}, ${y})`).toBe(true)
    }
  })
  it('measures distance in heights, with the second glyph one advance along', () => {
    expect(strokeDistance('2', 0.5, 0.75)).toBeCloseTo(0, 9)   // on 2's upper-right stroke
    expect(strokeDistance('2', 0, 0.75)).toBeCloseTo(0.25, 9)  // 2 has no upper-left stroke
    expect(strokeDistance(' 2', 0.7 + 0.5, 0.75)).toBeCloseTo(0, 9)
    expect(strokeDistance('   ', 0.2, 0.5)).toBe(Infinity)
    expect(strokeLength('7')).toBeCloseTo(0.5 + Math.hypot(0.3, 1), 9)
  })
})

describe('a text marking (DP2, Review Focus 4)', () => {
  it("reads the right way on starboard: '2' has its upper stroke on the reader's right, not the left (a mirrored 2 is a 5)", () => {
    const mk = text({})
    const n: V3 = [0, 0, 1]
    expect(coverage(mk, [0.5, 0.75, 0], n)).toBe(1)
    expect(coverage(mk, [0, 0.75, 0], n)).toBe(0)
    expect(coverage(mk, [0, 0.25, 0], n)).toBe(1)
    expect(coverage(mk, [0.5, 0.25, 0], n)).toBe(0)
  })
  it("reads the right way on port, where the reader's right is -x", () => {
    const mk = text({ axis: [0, 0, -1], uDir: [-1, 0, 0] })
    const n: V3 = [0, 0, -1]
    expect(coverage(mk, [-0.5, 0.75, 0], n)).toBe(1)
    expect(coverage(mk, [0, 0.75, 0], n)).toBe(0)
  })
  it("paints nothing on a face turned away (the bow's far side), nor farther than one height off its plane", () => {
    const mk = text({})
    expect(coverage(mk, [0.5, 0.75, 0], [0, 0, -1])).toBe(0)
    expect(coverage(mk, [0.5, 0.75, 1.01], [0, 0, 1])).toBe(0)
    expect(coverage(mk, [0.5, 0.75, 0.99], [0, 0, 1])).toBe(1)
  })
  it('is refused mirrored or upside down on a vertical face, with an unknown character, or with a stroke wider than half its height', () => {
    const bad = (over: Record<string, unknown>) => () => text(over)
    expect(bad({ axis: [0, 0, -1], uDir: [1, 0, 0] })).toThrow(/upright/)
    expect(bad({ text: 'CV' })).toThrow(/character/)
    expect(bad({ strokeM: 0.6 })).toThrow(/strokeM/)
    expect(bad({ uDir: [0, 0, 1] })).toThrow(/parallel/)
  })
  it('on a horizontal face (a flight deck) any reading direction is allowed', () => {
    expect(() => text({ axis: [0, 1, 0], uDir: [0, 0, -1] })).not.toThrow()
  })
  it('the sidecar round-trips a text marking from the kit', () => {
    const s = parseSidecar(JSON.stringify({ ...fixtureSidecar(), markings: [{ kind: 'text', tags: ['wing'], origin: [0, 0, 0], axis: [0, 0, 1], uDir: [1, 0, 0], text: '73', heightM: 2, strokeM: 0.3, color: 'insigniaWhite' }] }))
    expect(s.markings[0]).toMatchObject({ kind: 'text', text: '73', effect: 'paint', opacity: 1, featherM: 0 })
  })
})
