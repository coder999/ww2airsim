import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import { loadSite } from '../../tools/content/load.js'
import { airfieldFor, WINDOW_IDS } from '../../src/sim/world/sites.js'
import { CLUTTER_CEILING, CLUTTER_KINDS, clutterCounts, clutterInstances, clutterTotal } from '../../src/sim/world/clutter.js'
import { insideRect, type Airfield } from '../../src/sim/world/airfields.js'
import { createClutter } from '../../src/render/scene/clutter.js'
import { groundTruthTerrain } from '../../tools/sites/terrain.js'

/** F8A Task 7 (2026-10-16): clutter is procedural, so what must hold is that it is the same every time and bounded. */
const sites = readdirSync('content/sites').filter((f) => f.endsWith('.json')).map((f) => loadSite(f.replace(/\.json$/, '')))
const fields: { label: string; field: Airfield }[] = sites.flatMap((s) =>
  WINDOW_IDS.flatMap((w) => { const a = airfieldFor(s, w); return a === null ? [] : [{ label: `${s.id}/${w}`, field: a }] }))

describe('procedural clutter', () => {
  it('there is clutter to test: every built window of every site carries some', () => {
    expect(fields.length).toBe(13) // Tacloban 5, Dulag 5, Tanauan 3
    expect(fields.filter((f) => f.field.clutter !== undefined).length).toBe(13)
  })

  it.each(fields.map((f) => [f.label, f.field] as const))('%s: deterministic, in its areas, within the ceiling', (_label, field) => {
    const a = clutterInstances(field), b = clutterInstances(field)
    expect(a).toEqual(b)
    expect(a.length).toBe(clutterTotal(field.clutter!))
    expect(a.length).toBeGreaterThan(0)
    expect(a.length).toBeLessThanOrEqual(CLUTTER_CEILING)
    // every instance lies inside one of the airfield's own areas
    for (const i of a) {
      const inArea = field.clutter!.areas.some((area) => insideRect(field, area, i.x, i.z))
      expect(inArea, `${i.kind} at ${i.x.toFixed(0)},${i.z.toFixed(0)}`).toBe(true)
    }
  })

  it('the clutter is a function of the window: windows differ, and so does the seed', () => {
    const tac = sites.find((s) => s.id === 'tacloban')!
    const build = clutterInstances(airfieldFor(tac, 'buildup')!)
    const assault = clutterInstances(airfieldFor(tac, 'assault')!)
    expect(build).not.toEqual(assault)
    expect(airfieldFor(tac, 'buildup')!.clutter!.seed).not.toBe(airfieldFor(tac, 'endgame')!.clutter!.seed)
  })

  it('busiest state: Tacloban buildup has the most mats and tents of any F8A state', () => {
    const count = (f: Airfield, k: (typeof CLUTTER_KINDS)[number]): number => f.clutter!.areas.reduce((n, a) => n + clutterCounts(a)[k], 0)
    const busiest = [...fields].sort((x, y) => clutterTotal(y.field.clutter!) - clutterTotal(x.field.clutter!))[0]!
    expect(busiest.label).toBe('tacloban/buildup')
    expect(count(busiest.field, 'tent')).toBeGreaterThan(10)
  })

  it('a density key that is not a clutter kind is refused, and an over-ceiling field does not build', () => {
    const tac = sites.find((s) => s.id === 'tacloban')!
    const field = airfieldFor(tac, 'buildup')!
    const bad = { ...field.clutter!, areas: [{ ...field.clutter!.areas[0]!, density: { gnome: 1 } }] }
    expect(() => clutterTotal(bad)).toThrow(/gnome/)
    const dense = { ...tac, windows: { ...tac.windows, buildup: { ...tac.windows.buildup!, clutter: { 'north-apron': { tent: 400 } } } } }
    expect(() => airfieldFor(dense, 'buildup')).toThrow(/ceiling/)
  })
})

describe('clutter rendering', () => {
  const terrain = groundTruthTerrain()
  it('one instanced draw per kind present, with the instance counts the sim says', () => {
    const tac = sites.find((s) => s.id === 'tacloban')!
    const field = airfieldFor(tac, 'buildup')!
    const view = createClutter(terrain, field)
    const draws = view.object.children
    const kinds = CLUTTER_KINDS.filter((k) => view.counts[k] > 0)
    expect(draws).toHaveLength(kinds.length)
    expect(kinds.length).toBeLessThanOrEqual(8)
    const total = Object.values(view.counts).reduce((n, v) => n + v, 0)
    expect(total).toBe(clutterInstances(field).length)
    for (const d of draws) expect((d as unknown as { count: number }).count).toBe(view.counts[d.name.replace('clutter ', '') as (typeof CLUTTER_KINDS)[number]])
  })

  it('a base with no clutter draws none', () => {
    const view = createClutter(terrain, { ...airfieldFor(sites[0]!, 'buildup')!, clutter: undefined })
    expect(view.object.children).toHaveLength(0)
  })
})
