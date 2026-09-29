import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FX_CATALOG, type RecipeId } from '../../src/render/fx/catalog.js'
import type { BakeReport } from '../../tools/fx/bake.js'

const e1 = JSON.parse(readFileSync('tests/render/fxVisibleExtent.e1.json', 'utf8')) as Record<string, ([number, number] | null)[]>
const report = JSON.parse(readFileSync('tools/fx/bake-report.json', 'utf8')) as BakeReport

describe('baked sheets keep each effect its E1 visible size (plan E2 Ruling R9)', () => {
  for (const [id, sizes] of Object.entries(e1)) {
    it(id, () => {
      FX_CATALOG[id as RecipeId].emitters.forEach((e, i) => {
        const want = sizes[i]
        if (e.sheet === 'streak' || want === null || want === undefined) return
        const fill = report.sheets[e.sheet].metrics.fill
        // 2 significant figures of rounding is at most 5%; 6% leaves the float slack.
        expect(Math.abs(e.sizeM[0] * fill - want[0]) / want[0], `${id} emitter ${i} start`).toBeLessThanOrEqual(0.06)
        expect(Math.abs(e.sizeM[1] * fill - want[1]) / want[1], `${id} emitter ${i} end`).toBeLessThanOrEqual(0.06)
      })
    })
  }
})
