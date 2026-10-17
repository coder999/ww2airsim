import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import siteWindows from '../../../content/campaign/site-windows.json'
import { loadAirfield, loadSite } from '../../../tools/content/load.js'
import { localToWorld, type Airfield } from '../../../src/sim/world/airfields.js'
import { airfieldFor, parseSite, PARKED_CAP, VEHICLE_CAP, WINDOW_IDS, windowOf, type Site } from '../../../src/sim/world/sites.js'
import { heightAt } from '../../../src/sim/world/terrain.js'
import { groundTruthTerrain } from '../../../tools/sites/terrain.js'

/**
 * F8A Task 1 (2026-10-16): the site files are content, so the schema is the contract. Every file under
 * content/sites is enrolled by reading the directory, and the enrolled list is pinned (a filter that matched nothing
 * would pass empty).
 */
const ids = readdirSync('content/sites').filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort()
const sites: Readonly<Record<string, Site>> = Object.fromEntries(ids.map((i) => [i, loadSite(i)]))
const raw = (id: string): Record<string, unknown> => JSON.parse(readFileSync(`content/sites/${id}.json`, 'utf8')) as Record<string, unknown>

describe('site files: schema and loader', () => {
  it('enrolls exactly the F8A sites (F8B and F8C add theirs)', () => {
    expect(ids).toEqual(['dulag', 'tacloban', 'tanauan'])
  })

  it('window ids come from the one list in content/campaign/site-windows.json, in campaign order', () => {
    expect(WINDOW_IDS).toEqual(siteWindows.windows.map((w) => w.id))
    expect(WINDOW_IDS).toEqual(['pre-invasion', 'assault', 'buildup', 'endgame', 'j6-alternate'])
  })

  it.each(ids)('%s has all five windows and nothing else', (id) => {
    expect(Object.keys(sites[id]!.windows).sort()).toEqual([...WINDOW_IDS].sort())
  })

  it('a malformed site file fails with the path of the fault', () => {
    const good = raw('tacloban')
    expect(() => parseSite({ ...good, extra: 1 })).toThrow(/extra/)
    const windows = { ...(good.windows as Record<string, unknown>) }
    delete windows.endgame
    expect(() => parseSite({ ...good, windows })).toThrow(/endgame/)
    expect(() => parseSite({ ...good, windows: { ...windows, endgame: {}, 'made-up': {} } })).toThrow()
    const base = good.base as { buildings: Record<string, unknown>[] }
    expect(() => parseSite({ ...good, base: { ...base, buildings: [{ ...base.buildings[0], kind: 'castle' }] } })).toThrow(/kind/)
    expect(() => parseSite({ ...good, base: { ...base, buildings: [{ ...base.buildings[0], basis: undefined }] } })).toThrow(/basis/)
  })

  it('an unknown window id is refused by windowOf, and an unset site is pre-invasion', () => {
    expect(windowOf({}, 'tacloban')).toBe('pre-invasion')
    expect(windowOf({ tacloban: 'assault' }, 'tacloban')).toBe('assault')
    expect(() => windowOf({ tacloban: 'mid-war' }, 'tacloban')).toThrow(/mid-war/)
  })

  it('a vehicle list over the cap does not load', () => {
    const good = raw('tacloban')
    const w = (good.windows as Record<string, { vehicles: unknown[] }>).buildup!
    const over = Array.from({ length: VEHICLE_CAP + 1 }, (_, i) => ({ ...(w.vehicles[0] as object), id: `v${i}` }))
    expect(() => parseSite({ ...good, windows: { ...(good.windows as object), buildup: { ...w, vehicles: over } } })).toThrow(/vehicles/)
    const planes = Array.from({ length: PARKED_CAP + 1 }, (_, i) => ({ id: `a${i}`, spec: 'p-38-lightning', x: -58, z: i, basis: 'invented', cite: 'x' }))
    expect(() => parseSite({ ...good, windows: { ...(good.windows as object), buildup: { ...w, parked: planes } } })).toThrow(/parked/)
  })
})

describe('site files: runway agrees with the base content it replaces', () => {
  it.each(['tacloban', 'dulag'])('%s runway, apron and clearing equal content/bases', (id) => {
    const base = loadAirfield(id)
    const s = sites[id]!
    expect(s.base.runway).toEqual(base.runway)
    expect(s.base.apron).toEqual(base.apron)
    expect(s.base.clearing).toEqual(base.clearing)
  })
})

describe('site files: placements are labeled and persist', () => {
  it.each(ids)('%s: every placement states its basis, and a sourced one cites a ledger key of its own file', (id) => {
    const s = sites[id]!
    const all = [
      ...s.base.buildings,
      ...Object.values(s.windows).flatMap((w) => [...w.added, ...w.vehicles, ...w.parked]),
    ]
    expect(all.length).toBeGreaterThan(0)
    const missing = all.filter((p) => p.basis === 'sourced' && s.sources[p.cite] === undefined).map((p) => p.id)
    expect(missing, 'sourced placements citing a key that is not in `sources`').toEqual([])
    const unlabeled = all.filter((p) => p.cite.trim().length < 3).map((p) => p.id)
    expect(unlabeled).toEqual([])
  })

  it.each(ids)('%s: a building keeps its position and shape in every window it appears in', (id) => {
    const s = sites[id]!
    const seen = new Map<string, string>()
    for (const [w, win] of Object.entries(s.windows)) {
      for (const p of [...s.base.buildings, ...win.added]) {
        const sig = JSON.stringify([p.kind, p.x, p.z, p.widthM, p.lengthM, p.headingDeg ?? 0])
        const was = seen.get(p.id)
        if (was !== undefined) expect(sig, `${p.id} moved in ${w}`).toBe(was)
        seen.set(p.id, sig)
      }
    }
    // ids are unique within one window's building set
    for (const [w, win] of Object.entries(s.windows)) {
      const names = [...s.base.buildings, ...win.added].map((p) => p.id)
      expect(new Set(names).size, `${id} ${w} has a duplicate building id`).toBe(names.length)
    }
  })

  it.each(ids)('%s: no window exceeds the vehicle or parked-aircraft cap, and every built window has a building', (id) => {
    for (const [w, win] of Object.entries(sites[id]!.windows)) {
      expect(win.vehicles.length, `${id} ${w}`).toBeLessThanOrEqual(VEHICLE_CAP)
      expect(win.parked.length, `${id} ${w}`).toBeLessThanOrEqual(PARKED_CAP)
      const field = airfieldFor(sites[id]!, w)
      if (win.built) expect(field!.buildings.length, `${id} ${w}`).toBeGreaterThan(0)
      else expect(field).toBeNull()
    }
  })
})

describe('site files: the layout stands on the real ground', () => {
  const terrain = groundTruthTerrain()
  const corners = (a: Airfield, p: { x: number; z: number; widthM: number; lengthM: number }): { x: number; z: number }[] =>
    [-1, 1].flatMap((sx) => [-1, 1].map((sz) => localToWorld(a, p.x + sx * p.widthM / 2, p.z + sz * p.lengthM / 2)))

  it.each(ids)('%s: every building, vehicle and parked aircraft of every window is on land', (id) => {
    const bad: string[] = []
    for (const w of WINDOW_IDS) {
      const a = airfieldFor(sites[id]!, w)
      if (a === null) continue
      const win = sites[id]!.windows[w]!
      for (const b of a.buildings) {
        // The pier is built into the water by design: only its landward half has to stand on land.
        if (b.kind === 'pier-and-warehouses') continue
        for (const c of corners(a, b)) if (heightAt(terrain, c.x, c.z) < 1) bad.push(`${w} ${b.id} corner at ${heightAt(terrain, c.x, c.z).toFixed(1)} m`)
      }
      for (const v of win.vehicles) { const c = localToWorld(a, v.x, v.z); if (heightAt(terrain, c.x, c.z) < 1) bad.push(`${w} ${v.id}`) }
      for (const p of win.parked) { const c = localToWorld(a, p.x, p.z); if (heightAt(terrain, c.x, c.z) < 1) bad.push(`${w} ${p.id}`) }
    }
    expect(bad).toEqual([])
  })

  it('Tanauan strip is fitted to terrain: all land, under 5 m of relief over the full length and 3 sigma width', () => {
    const a = airfieldFor(sites.tanauan!, 'endgame')!
    const hs: number[] = []
    for (let z = -750; z <= 750; z += 25) for (const x of [-22.5, 0, 22.5]) { const w = localToWorld(a, x, z); hs.push(heightAt(terrain, w.x, w.z)) }
    expect(Math.min(...hs), 'lowest strip sample').toBeGreaterThan(1.5)
    expect(Math.max(...hs) - Math.min(...hs), 'relief along the strip').toBeLessThan(5)
  })
})
