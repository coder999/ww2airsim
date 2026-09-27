import { describe, expect, it } from 'vitest'
import { FX_CATALOG, fxCatalogSchema, RECIPE_IDS, SUSTAINED_RECIPES, type FxCatalog } from '../../src/render/fx/catalog.js'
import { FX_SHEETS } from '../../src/render/fx/sheetManifest.js'

describe('fx catalog (effects design §3.3)', () => {
  it('validates, and defines every recipe id', () => {
    expect(() => fxCatalogSchema.parse(FX_CATALOG)).not.toThrow()
    expect(Object.keys(FX_CATALOG).sort()).toEqual([...RECIPE_IDS].sort())
  })

  it('every emitter names an existing sheet, or the code-drawn streak', () => {
    for (const id of RECIPE_IDS) for (const e of FX_CATALOG[id].emitters) {
      expect([...FX_SHEETS, 'streak'], `${id}`).toContain(e.sheet)
    }
  })

  it('every recipe cites a source or says it is an estimate', () => {
    for (const id of RECIPE_IDS) expect(FX_CATALOG[id].source, id).toMatch(/\S/)
  })

  it('a sustained recipe has a sustained stream; a trigger-only recipe has none that could never run', () => {
    for (const id of RECIPE_IDS) {
      const sustained = FX_CATALOG[id].emitters.filter((e) => e.mode === 'stream' && e.durationS === undefined)
      if ((SUSTAINED_RECIPES as readonly string[]).includes(id)) expect(sustained.length, id).toBeGreaterThan(0)
      else expect(sustained, id).toEqual([])
    }
  })

  it('rejects the shapes a typo produces', () => {
    const bad = (patch: object): FxCatalog => ({ ...FX_CATALOG, 'round.land': { ...FX_CATALOG['round.land'], emitters: [{ ...FX_CATALOG['round.land'].emitters[0]!, ...patch }] } })
    expect(() => fxCatalogSchema.parse(bad({ mode: 'burst', count: undefined }))).toThrow()
    expect(() => fxCatalogSchema.parse(bad({ sheet: 'fire' }))).toThrow()
    expect(() => fxCatalogSchema.parse(bad({ lifeS: [2, 1] }))).toThrow()
    expect(() => fxCatalogSchema.parse(bad({ sheet: 'streak', streakS: undefined }))).toThrow()
    const missing = Object.fromEntries(Object.entries(FX_CATALOG).filter(([id]) => id !== 'kill.air'))
    expect(() => fxCatalogSchema.parse(missing)).toThrow()
  })

  it('a rocket effect is a smaller version of the bomb one (spec §3.3)', () => {
    const peak = (id: 'bomb.land' | 'rocket.land' | 'bomb.water' | 'rocket.water'): number => Math.max(...FX_CATALOG[id].emitters.map((e) => e.sizeM[1]))
    expect(peak('rocket.land')).toBeLessThan(peak('bomb.land'))
    expect(peak('rocket.water')).toBeLessThan(peak('bomb.water'))
  })
})
