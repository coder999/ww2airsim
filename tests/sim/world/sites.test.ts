import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import siteWindows from '../../../content/campaign/site-windows.json'
import { loadAircraftSpec, loadAirfield, loadSite, loadVehicleSpec } from '../../../tools/content/load.js'
import { buildStructures } from '../../../src/sim/weapons/structures.js'
import { localToWorld, type Airfield } from '../../../src/sim/world/airfields.js'
import { airfieldFor, parseSite, PARKED_CAP, VEHICLE_CAP, WINDOW_IDS, windowOf, type Site } from '../../../src/sim/world/sites.js'
import { getBounds } from '@gltf-transform/functions'
import { modelIO, onlyScene } from '../../../tools/models/document.js'
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

describe('site files: a placement is its glb at natural size', () => {
  // The renderer fits no model to a footprint (it only centers and rotates it), so a placement whose box disagrees with
  // its glb would draw a model that the hit box does not describe. Measured from the committed glbs, 2026-10-16.
  it('every placement footprint and height is within 15% of the glb of its kind', async () => {
    const bounds = new Map<string, { x: number; y: number; z: number }>()
    const natural = async (kind: string): Promise<{ x: number; y: number; z: number }> => {
      if (!bounds.has(kind)) {
        const doc = await modelIO().readBinary(new Uint8Array(readFileSync(`content/buildings/${kind}.glb`)))
        const b = getBounds(onlyScene(doc))
        bounds.set(kind, { x: b.max[0] - b.min[0], y: b.max[1], z: b.max[2] - b.min[2] })
      }
      return bounds.get(kind)!
    }
    const off: string[] = []
    for (const s of Object.values(sites)) {
      for (const p of [...s.base.buildings, ...Object.values(s.windows).flatMap((w) => w.added)]) {
        const n = await natural(p.kind)
        const err = (got: number, want: number): number => Math.abs(got - want) / want
        const rotated = Math.abs(((p.headingDeg ?? 0) % 180)) === 90
        const [w, l] = rotated ? [p.lengthM, p.widthM] : [p.widthM, p.lengthM]
        if (err(w, n.x) > 0.15 || err(l, n.z) > 0.15 || (p.heightM !== undefined && err(p.heightM, n.y) > 0.15)) off.push(`${s.id}/${p.id} ${p.kind}: placed ${w}x${l}x${p.heightM}, glb ${n.x.toFixed(1)}x${n.z.toFixed(1)}x${n.y.toFixed(1)}`)
      }
    }
    expect(off).toEqual([])
  })
})

describe('site files: F3 section 5 (hand-transcribed) and a layout that works', () => {
  // [side, serviceable, built] per window, from the F3 section 5 table: Tacloban "Japanese operational", "captured 20 Oct;
  // emergency reconstruction", "principal American operational field", "American operational", "bomb-damaged and unusable";
  // Dulag "rough/unserviceable", "still unserviceable", "muddy construction/support field; limited later use", "American
  // support site", "bomb-damaged and unusable"; Tanauan "no field", "no field", work after 28 Nov, "visibly under
  // construction, not yet operational", "interrupted construction site".
  const TABLE: Record<string, Record<string, [string, boolean, boolean]>> = {
    tacloban: { 'pre-invasion': ['axis', true, true], assault: ['allied', false, true], buildup: ['allied', true, true], endgame: ['allied', true, true], 'j6-alternate': ['allied', false, true] },
    dulag: { 'pre-invasion': ['axis', false, true], assault: ['allied', false, true], buildup: ['allied', true, true], endgame: ['allied', true, true], 'j6-alternate': ['allied', false, true] },
    tanauan: { 'pre-invasion': ['allied', false, false], assault: ['allied', false, false], buildup: ['allied', false, true], endgame: ['allied', false, true], 'j6-alternate': ['allied', false, true] },
  }
  it.each(Object.keys(TABLE))('%s: every window says what F3 section 5 says', (id) => {
    for (const w of WINDOW_IDS) {
      const win = sites[id]!.windows[w]!
      expect([win.side, win.serviceable, win.built], `${id} ${w}`).toEqual(TABLE[id]![w])
    }
  })

  it('Tanauan is never serviceable in any window: it does not become operational before 7 Dec (the Army history dates it to 16 Dec)', () => {
    expect(Object.values(sites.tanauan!.windows).every((w) => !w.serviceable)).toBe(true)
  })

  const boxes = (a: Airfield) => buildStructures([a], null)
  const insideBox = (s: ReturnType<typeof buildStructures>[number], x: number, z: number, margin: number): boolean => {
    const c = Math.cos(s.headingRad), sn = Math.sin(s.headingRad)
    const dx = x - s.position.x, dz = z - s.position.z
    return Math.abs(dx * c + dz * sn) <= s.halfSize.x + margin && Math.abs(-dx * sn + dz * c) <= s.halfSize.z + margin
  }

  it.each(ids)('%s: vehicles stand clear of every building, parked aircraft clear of buildings, the strip and each other', (id) => {
    const bad: string[] = []
    for (const w of WINDOW_IDS) {
      const a = airfieldFor(sites[id]!, w)
      if (a === null) continue
      const win = sites[id]!.windows[w]!
      const solid = boxes(a)
      for (const v of win.vehicles) {
        const p = localToWorld(a, v.x, v.z)
        const hit = solid.find((s) => insideBox(s, p.x, p.z, 2))
        if (hit) bad.push(`${w} vehicle ${v.id} inside ${hit.id}`)
        // Equipment grading a strip under construction belongs on it; a serviceable strip is kept clear.
        if (win.serviceable && Math.abs(v.x) < a.runway.widthM / 2 + 3 && Math.abs(v.z) < a.runway.lengthM / 2) bad.push(`${w} vehicle ${v.id} on the strip`)
      }
      for (const p of win.parked) {
        const q = localToWorld(a, p.x, p.z)
        const hit = solid.find((s) => insideBox(s, q.x, q.z, 9))
        if (hit) bad.push(`${w} aircraft ${p.id} within a wingspan of ${hit.id}`)
        if (Math.abs(p.x) < a.runway.widthM / 2 + 9) bad.push(`${w} aircraft ${p.id} within a wingspan of the strip`)
        for (const o of win.parked) if (o.id < p.id && Math.hypot(o.x - p.x, o.z - p.z) < 16) bad.push(`${w} aircraft ${p.id} and ${o.id} overlap`)
      }
      for (const v of win.vehicles) for (const o of win.vehicles) if (o.id < v.id && Math.hypot(o.x - v.x, o.z - v.z) < 4) bad.push(`${w} vehicles ${v.id} and ${o.id} overlap`)
    }
    expect(bad).toEqual([])
  })

  it('every vehicle and parked-aircraft spec a window names exists, and a parked aircraft is on its field side', () => {
    for (const s of Object.values(sites)) for (const [w, win] of Object.entries(s.windows)) {
      for (const v of win.vehicles) expect(() => loadVehicleSpec(v.spec), `${s.id} ${w} ${v.id}`).not.toThrow()
      for (const p of win.parked) {
        const spec = loadAircraftSpec(p.spec)
        expect(spec.id).toBe(p.spec)
        expect(p.side ?? win.side).toBe(win.side)
      }
    }
  })

  it('every window with parked aircraft or vehicles is built', () => {
    for (const s of Object.values(sites)) for (const [w, win] of Object.entries(s.windows)) {
      if (!win.built) expect(win.vehicles.length + win.parked.length + win.added.length + win.lights.length, `${s.id} ${w}`).toBe(0)
    }
  })

  it('every site names a source for each claim it cites and each source is used', () => {
    for (const s of Object.values(sites)) {
      const cited = new Set([...s.base.buildings, ...Object.values(s.windows).flatMap((w) => [...w.added, ...w.vehicles, ...w.parked])].filter((p) => p.basis === 'sourced').map((p) => p.cite))
      for (const k of cited) expect(Object.keys(s.sources), `${s.id} cites ${k}`).toContain(k)
    }
  })
})
