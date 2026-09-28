// tests/tools/models/skin/sidecar.test.ts
import { describe, expect, it } from 'vitest'
import { parseSidecar } from '../../../../tools/models/skin/sidecar.js'
import { linearToSrgb8, MARKING_COLORS, SRGB8_TO_LINEAR } from '../../../../tools/models/skin/colors.js'
import { ROLE_SURFACE, surfaceFor } from '../../../../tools/models/skin/surfaces.js'

const base = {
  version: 1, model: 'sp', atlasPx: 512, paddingPx: 4, metersPerPx: 0.05,
  roles: { ijaGreen: [0.29, 0.33, 0.21] },
  patches: [{ id: 0, tag: 'wing', rect: [4, 4, 100, 50], originM: [0, 0] }, { id: 1, tag: 'fuselage', rect: [112, 4, 60, 60], originM: [-1, 0] }],
  lines: [{ patch: 0, axis: 'v', atM: 0.4, fromM: 0, toM: 5, kind: 'panel' }],
  markings: [{ kind: 'disc', tags: ['wing'], center: [0, 1, 2], axis: [0, 1, 0], radiusM: 0.4, color: 'hinomaruRed' }],
}
const text = (o: unknown): string => JSON.stringify(o)

describe('parseSidecar (DP0)', () => {
  it('accepts a well-formed sidecar and fills marking defaults', () => {
    const s = parseSidecar(text(base))
    expect(s.markings[0]).toMatchObject({ effect: 'paint', opacity: 1, featherM: 0 })
  })
  it.each([
    ['an unknown marking color', { ...base, markings: [{ ...base.markings[0], color: 'pink' }] }, /color/],
    ['a marking tag no patch has', { ...base, markings: [{ ...base.markings[0], tags: ['wnig'] }] }, /tag "wnig"/],
    ['a line on a missing patch', { ...base, lines: [{ ...base.lines[0], patch: 9 }] }, /patch 9/],
    ['a patch outside the atlas', { ...base, patches: [{ id: 0, tag: 'wing', rect: [500, 4, 100, 50], originM: [0, 0] }] }, /outside/],
    ['two patches with one id', { ...base, patches: [base.patches[0], { ...base.patches[1], id: 0 }] }, /id 0 twice/],
    ['a zero axis', { ...base, markings: [{ ...base.markings[0], axis: [0, 0, 0] }] }, /axis/],
    ['a slab with from >= to', { ...base, markings: [{ kind: 'slab', tags: ['wing'], axis: 'x', fromM: 2, toM: 1, color: 'idYellow' }] }, /fromM/],
    ['a grid with no spacing', { ...base, markings: [{ kind: 'grid', tags: ['wing'], spacingM: [null, null, null], widthM: 0.01, depth: 0.5 }] }, /spacing/],
    ['an unknown key', { ...base, extra: 1 }, /extra/],
  ])('refuses %s', (_label, raw, message) => {
    expect(() => parseSidecar(text(raw))).toThrow(message)
  })
})

describe('colors and surfaces (DP0)', () => {
  it('sRGB tables round-trip every byte', () => {
    for (let i = 0; i < 256; i++) expect(linearToSrgb8(SRGB8_TO_LINEAR[i]!)).toBe(i)
  })
  it('every marking color is an sRGB byte triple', () => {
    for (const c of Object.values(MARKING_COLORS)) for (const v of c) expect(Number.isInteger(v) && v >= 0 && v <= 255).toBe(true)
  })
  it('every pilot role has a surface, and an unknown role is refused by name', () => {
    for (const r of ['ijaGreen', 'underside', 'dark', 'glazing', 'naturalMetal', 'steel', 'concrete']) expect(ROLE_SURFACE[r], r).toBeDefined()
    expect(() => surfaceFor('timber')).toThrow(/timber/)
  })
})
