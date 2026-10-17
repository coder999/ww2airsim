import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import siteWindows from '../../../content/campaign/site-windows.json'
import { loadAircraftSpec, loadAirfield, loadSite, loadVehicleSpec } from '../../../tools/content/load.js'
import { buildStructures } from '../../../src/sim/weapons/structures.js'
import { localToWorld, type Airfield } from '../../../src/sim/world/airfields.js'
import { clutterTotal } from '../../../src/sim/world/clutter.js'
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
/** [site, window] pairs that are a field with nothing on it, by the sources. */
const UNOCCUPIED: readonly (readonly [string, string])[] = [['san-pablo', 'pre-invasion']]
const raw = (id: string): Record<string, unknown> => JSON.parse(readFileSync(`content/sites/${id}.json`, 'utf8')) as Record<string, unknown>

describe('site files: schema and loader', () => {
  it('enrolls exactly the nine sites: F8A, F8B and F8C (Ormoc, the landing beaches, the Jinamoc anchorage)', () => {
    expect(ids).toEqual(['bayug', 'buri', 'dulag', 'jinamoc', 'landing-beaches', 'ormoc', 'san-pablo', 'tacloban', 'tanauan'])
  })

  it('exactly the three F8C sites have no strip; the six flying fields do', () => {
    expect(ids.filter((i) => sites[i]!.noStrip === true)).toEqual(['jinamoc', 'landing-beaches', 'ormoc'])
    for (const i of ['bayug', 'buri', 'dulag', 'san-pablo', 'tacloban', 'tanauan']) expect(airfieldFor(sites[i]!, 'endgame')!.noStrip).toBeUndefined()
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

  // F8B: Bayug joins (its base is the runway Convoy Strike lands on). Its site keeps the base's runway and apron verbatim but ADDS a
  // clearing: the shipped base has none, and airfield buildings are not kept clear of trees (only the strip and `clearing` are,
  // `inAirfieldClearing`), so with none the 2026-10-17 captures showed the camp standing inside the forest.
  it('bayug runway and apron equal content/bases; its clearing is new, and every F8B building stands inside its field\'s clearing', () => {
    const base = loadAirfield('bayug')
    expect(sites.bayug!.base.runway).toEqual(base.runway)
    expect(sites.bayug!.base.apron).toEqual(base.apron)
    expect(base.clearing).toBeNull()
    for (const id of ['buri', 'bayug', 'san-pablo']) {
      const s = sites[id]!, c = s.base.clearing
      expect(c, `${id} has a clearing`).not.toBeNull()
      const out = [...s.base.buildings, ...Object.values(s.windows).flatMap((w) => w.added)]
        .filter((b) => Math.abs(b.x - c!.x) > c!.widthM / 2 - b.widthM / 2 || Math.abs(b.z - c!.z) > c!.lengthM / 2 - b.lengthM / 2).map((b) => b.id)
      expect(out, `${id}: buildings outside the clearing, where trees grow through them`).toEqual([])
    }
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
      // The one near-exemption (F8B): San Pablo before the invasion was "overgrown with weeds and had not been occupied by the
      // Japanese" (Army, Leyte, ch. VIII). The airfield schema needs one strike target, so that window holds exactly one grown-over
      // revetment and nothing else: the exemption cannot hide content.
      const unoccupied = UNOCCUPIED.some(([s, ww]) => s === id && ww === w)
      if (unoccupied) {
        expect(field!.buildings.map((b) => b.id), `${id} ${w} is declared unoccupied`).toEqual(['san-pablo-revetment-1'])
        expect(win.vehicles.length + win.parked.length + win.lights.length + win.added.length, `${id} ${w} is declared unoccupied`).toBe(0)
      } else if (win.built) expect(field!.buildings.length, `${id} ${w}`).toBeGreaterThan(0)
      if (!win.built) expect(field).toBeNull()
    }
  })
})

describe('site files: the layout stands on the real ground', () => {
  const terrain = groundTruthTerrain()
  const corners = (a: Airfield, p: { x: number; z: number; widthM: number; lengthM: number }): { x: number; z: number }[] =>
    [-1, 1].flatMap((sx) => [-1, 1].map((sz) => localToWorld(a, p.x + sx * p.widthM / 2, p.z + sz * p.lengthM / 2)))

  /** F8C: kinds built at the water's edge, seated at the sea surface (`seatM`): only their landward half has to stand on land. */
  const WATERFRONT = ['pier-and-warehouses', 'pontoon-pier-segment', 'jinamoc-seaplane-ramp', 'pby-mooring-buoy']
  it.each(ids)('%s: every building, vehicle and parked aircraft of every window is on land (a floating craft on water)', (id) => {
    const bad: string[] = []
    for (const w of WINDOW_IDS) {
      const a = airfieldFor(sites[id]!, w)
      if (a === null) continue
      const win = sites[id]!.windows[w]!
      for (const b of a.buildings) {
        // The pier is built into the water by design: only its landward half has to stand on land.
        if (WATERFRONT.includes(b.kind)) {
          // F8C sites seat these at the sea surface; Tacloban's F8A pier predates `seatM` and keeps the old rule.
          if (sites[id]!.noStrip === true) expect(b.seatM, `${id} ${b.id}: a waterfront building is seated at the sea surface`).toBeDefined()
          continue
        }
        for (const c of corners(a, b)) if (heightAt(terrain, c.x, c.z) < 1) bad.push(`${w} ${b.id} corner at ${heightAt(terrain, c.x, c.z).toFixed(1)} m`)
      }
      for (const v of win.vehicles) {
        const c = localToWorld(a, v.x, v.z), h = heightAt(terrain, c.x, c.z)
        if (loadVehicleSpec(v.spec).floats === true ? h >= 0.5 : h < 1) bad.push(`${w} ${v.id}`)
      }
      for (const p of win.parked) { const c = localToWorld(a, p.x, p.z); if (heightAt(terrain, c.x, c.z) < 1) bad.push(`${w} ${p.id}`) }
    }
    expect(bad).toEqual([])
  })

  // F8C: clutter is instanced on the ground at the terrain height, so an area whose corner lies in the sea would float pieces on the water.
  it.each(ids.filter((i) => sites[i]!.noStrip === true))('%s: every clutter area stands on land at its four corners', (id) => {
    const a = airfieldFor(sites[id]!, 'endgame')!
    const bad: string[] = []
    for (const area of sites[id]!.base.clutterAreas) for (const c of corners(a, area)) if (heightAt(terrain, c.x, c.z) < 0.5) bad.push(`${area.id} corner at ${heightAt(terrain, c.x, c.z).toFixed(1)} m`)
    expect(bad).toEqual([])
  })

  // [site, window, most relief allowed along the strip]: the shipped terrain's best near each field, measured 2026-10-17
  // (surveyStrip.ts): Buri about 6 m, San Pablo about 4 m, Bayug about 6 m over its full 1.5 km.
  const FITS: readonly (readonly [string, string, number])[] = [['tanauan', 'endgame', 5], ['buri', 'pre-invasion', 7], ['san-pablo', 'endgame', 7], ['bayug', 'pre-invasion', 8]]
  it.each(FITS)('%s strip is fitted to terrain: all land, under the stated relief over the full length and 3 sigma width', (id, window, relief) => {
    const a = airfieldFor(sites[id]!, window)!
    const hs: number[] = []
    for (let z = -a.runway.lengthM / 2; z <= a.runway.lengthM / 2; z += 25) for (const x of [-a.runway.widthM / 2, 0, a.runway.widthM / 2]) { const w = localToWorld(a, x, z); hs.push(heightAt(terrain, w.x, w.z)) }
    expect(Math.min(...hs), 'lowest strip sample').toBeGreaterThan(1.5)
    expect(Math.max(...hs) - Math.min(...hs), 'relief along the strip').toBeLessThan(relief)
  })
})

describe('site files: a placement is its glb at natural size', () => {
  // The renderer fits no model to a footprint (it only centers and rotates it), so a placement whose box disagrees with
  // its glb would draw a model that the hit box does not describe. Measured from the committed glbs, 2026-10-16.
  it('every placement footprint and height is within 15% of the glb of its kind', async () => {
    const bounds = new Map<string, { x: number; y: number; z: number }>()
    const natural = async (kind: string): Promise<{ x: number; y: number; z: number }> => {
      if (!bounds.has(kind)) {
        const doc = await modelIO().readBinary(new Uint8Array(readFileSync(kind === 'pby-mooring-buoy' ? `content/equipment/${kind}.glb` : `content/buildings/${kind}.glb`)))
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
    // F8B, F3 section 5: Buri "principal Japanese inland field", "captured after inland fighting", "dry-weather use, then construction
    // abandoned 25 Nov", "American-held, attacked and temporarily penetrated", "Japanese-controlled and serviceable enough for recovery".
    buri: { 'pre-invasion': ['axis', true, true], assault: ['allied', false, true], buildup: ['allied', true, true], endgame: ['allied', true, true], 'j6-alternate': ['axis', true, true] },
    // Bayug "Japanese dry-weather strip", "captured after inland fighting", "limited American dry-weather use continues", "American-held
    // finale objective", "Japanese-controlled and serviceable recovery field".
    bayug: { 'pre-invasion': ['axis', true, true], assault: ['allied', false, true], buildup: ['allied', true, true], endgame: ['allied', true, true], 'j6-alternate': ['axis', true, true] },
    // San Pablo "overgrown, unused by Japanese", "captured, still poor", "construction attempted then abandoned 25 Nov", "principal airborne
    // drop/lodgment area", "Japanese-controlled lodgment/field". `serviceable` for the last two is the F8 plan's ruling 3 (the F8B detail):
    // endgame true (A6 keeps three fields above their threshold), alternate false (J6 asks only that San Pablo stay Japanese-controlled).
    'san-pablo': { 'pre-invasion': ['axis', false, true], assault: ['allied', false, true], buildup: ['allied', false, true], endgame: ['allied', true, true], 'j6-alternate': ['axis', false, true] },
    // F8C, F3 section 5. `serviceable` for a site without a strip means usable for its job. Ormoc "Japanese port/logistics hub", "Japanese
    // reinforcement destination", "repeated convoy destination; accumulated port damage", "Japanese route under severe interdiction",
    // "Japanese-held, lifeline remains open": always Japanese and working.
    ormoc: { 'pre-invasion': ['axis', true, true], assault: ['axis', true, true], buildup: ['axis', true, true], endgame: ['axis', true, true], 'j6-alternate': ['axis', true, true] },
    // Landing beaches "Japanese shore defenses", "active assault and unloading", "dense American beachhead and supply dumps",
    // "established rear/support area", "damaged, evacuating American beachhead".
    'landing-beaches': { 'pre-invasion': ['axis', false, true], assault: ['allied', true, true], buildup: ['allied', true, true], endgame: ['allied', true, true], 'j6-alternate': ['allied', false, true] },
    // San Pedro Bay "Japanese-controlled waters/shore" (nothing built: no site yet), "American anchorage forming", "PBY anchorage, rescue
    // launch and support activity", "American support/transport area", "abandoned/contested anchorage" (read as the Americans gone: allied, unusable).
    jinamoc: { 'pre-invasion': ['axis', false, false], assault: ['allied', false, true], buildup: ['allied', true, true], endgame: ['allied', true, true], 'j6-alternate': ['allied', false, true] },
  }
  it('the hand-transcribed table covers every site, and every site has a j6-alternate result row (F3 section 5, last column)', () => {
    expect(Object.keys(TABLE).sort()).toEqual(ids)
    for (const id of ids) expect(Object.keys(TABLE[id]!).sort(), id).toEqual([...WINDOW_IDS].sort())
    expect(ids.map((id) => [id, sites[id]!.windows['j6-alternate'] !== undefined])).toEqual(ids.map((id) => [id, true]))
  })
  it.each(Object.keys(TABLE))('%s: every window says what F3 section 5 says', (id) => {
    for (const w of WINDOW_IDS) {
      const win = sites[id]!.windows[w]!
      expect([win.side, win.serviceable, win.built], `${id} ${w}`).toEqual(TABLE[id]![w])
    }
  })

  it('Buri and San Pablo are the Army history\'s strips: lengths 5,000 ft and 4,920 ft, San Pablo 164 ft wide, both near east-west', () => {
    const ft = (m: number): number => m / 0.3048
    expect(ft(sites.buri!.base.runway.lengthM)).toBeCloseTo(5000, -1)
    expect(ft(sites['san-pablo']!.base.runway.lengthM)).toBeCloseTo(4920, -1)
    expect(ft(sites['san-pablo']!.base.runway.widthM)).toBeCloseTo(164, -1)
    expect(ft(sites.bayug!.base.runway.lengthM)).toBeGreaterThan(4900) // the base's 1,500 m, "about 5,000 ft"
    for (const id of ['buri', 'san-pablo']) expect(Math.abs(sites[id]!.base.runway.headingDeg - 90), `${id} heading`).toBeLessThanOrEqual(15)
  })

  it('J1 names five critical groups at Buri; each exists as a tagged building (or revetment) in the pre-invasion field', () => {
    const tags = new Set(sites.buri!.base.buildings.flatMap((b) => b.tags ?? []))
    for (const t of ['buri-fuel', 'buri-radio', 'buri-north-hangar', 'buri-south-hangar', 'buri-dispersal']) expect(tags.has(t), t).toBe(true)
    // and the dispersal has aircraft in it for the J1 start, Japanese and parked
    const pre = sites.buri!.windows['pre-invasion']!
    expect(pre.parked.some((p) => p.spec === 'a6m2-zero')).toBe(true)
    expect(pre.parked.every((p) => (p.side ?? pre.side) === 'axis')).toBe(true)
  })

  it('San Pablo keeps open drop-zone ground: no hit box in the central 400 m of the clearing, in every window, and a clearing at least 600 m wide', () => {
    const s = sites['san-pablo']!
    expect(s.base.clearing!.widthM).toBeGreaterThanOrEqual(600)
    expect(s.base.clearing!.lengthM).toBeGreaterThanOrEqual(1500)
    for (const w of WINDOW_IDS) {
      const a = airfieldFor(s, w)!
      const inside = a.buildings.filter((b) => Math.abs(b.x) - b.widthM / 2 < 200 && Math.abs(b.z) - b.lengthM / 2 < a.runway.lengthM / 2 + 50).map((b) => b.id)
      expect(inside, `${w}: buildings in the open zone`).toEqual([])
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

describe('F8C sites: Ormoc, the landing beaches, the Jinamoc anchorage', () => {
  const kindsOf = (id: string, w: string): string[] => airfieldFor(sites[id]!, w)!.buildings.map((b) => b.kind)
  const ORDER = { intact: 0, damaged: 1, destroyed: 2, construction: 0 } as const

  it('Ormoc: damage carries between windows (a destroyed building stays destroyed, a damaged one never heals), and early windows are intact', () => {
    const s = sites.ormoc!
    let prev: Record<string, number> = {}
    for (const w of WINDOW_IDS) {
      const f = airfieldFor(s, w)!
      const now: Record<string, number> = {}
      for (const b of f.buildings) now[b.id] = ORDER[b.state ?? 'intact']
      for (const [bid, level] of Object.entries(prev)) if (now[bid] !== undefined) expect(now[bid], `${bid} in ${w}`).toBeGreaterThanOrEqual(level)
      prev = { ...prev, ...now }
    }
    expect(f(s, 'pre-invasion').every((b) => b.state === undefined)).toBe(true)
    expect(f(s, 'assault').every((b) => b.state === undefined)).toBe(true)
    expect(f(s, 'buildup').filter((b) => b.state === 'damaged' || b.state === 'destroyed').length).toBeGreaterThan(2)
    expect(f(s, 'endgame').filter((b) => b.state === 'destroyed').length).toBeGreaterThan(f(s, 'buildup').filter((b) => b.state === 'destroyed').length)
    function f(site: Site, w: string) { return airfieldFor(site, w)!.buildings }
  })

  it('Ormoc: the customs building has no light in any window and the port has no light at all (F3 section 8: no Ormoc beacon state is claimed)', () => {
    for (const w of WINDOW_IDS) expect(sites.ormoc!.windows[w]!.lights, w).toEqual([])
    for (const s of Object.values(sites)) for (const w of Object.values(s.windows)) for (const l of w.lights) {
      for (const b of s.base.buildings.filter((x) => x.kind === 'ormoc-customs-building')) expect(Math.hypot((l.at as { x: number }).x - b.x, (l.at as { z: number }).z - b.z)).toBeGreaterThan(30)
    }
  })

  it('Ormoc carries what the plan lists: pier and warehouses, the customs building, fuel and ammunition stores, a marshalling area, shore AAA, a coastal battery', () => {
    const k = kindsOf('ormoc', 'pre-invasion')
    for (const want of ['pier-and-warehouses', 'ormoc-customs-building', 'fuel-tank-farm', 'ammunition-bunker', 'aaa', 'coastal-gun-battery']) expect(k, want).toContain(want)
    expect(sites.ormoc!.base.clutterAreas.some((a) => a.id === 'marshal')).toBe(true)
    expect(sites.ormoc!.windows.buildup!.vehicles.length).toBeGreaterThanOrEqual(8)
    expect(sites.ormoc!.windows.buildup!.vehicles.every((v) => (v.side ?? 'axis') === 'axis')).toBe(true)
  })

  it('the landing beaches: American density rises after 20 Oct (assault < build-up), and is nil before; the pontoon pier appears at the assault', () => {
    const density = (w: string): number => {
      const win = sites['landing-beaches']!.windows[w]!
      if (win.side !== 'allied') return 0
      const f = airfieldFor(sites['landing-beaches']!, w)!
      return f.buildings.filter((b) => b.state !== 'destroyed').length + win.vehicles.length + clutterTotal(f.clutter!)
    }
    expect(density('pre-invasion')).toBe(0)
    expect(density('assault')).toBeGreaterThan(0)
    expect(density('buildup')).toBeGreaterThan(density('assault'))
    expect(density('endgame')).toBeLessThanOrEqual(density('buildup'))
    expect(kindsOf('landing-beaches', 'pre-invasion')).not.toContain('pontoon-pier-segment')
    expect(kindsOf('landing-beaches', 'assault')).toContain('pontoon-pier-segment')
    const lcvps = (w: string): number => sites['landing-beaches']!.windows[w]!.vehicles.filter((v) => v.spec === 'lcvp').length
    expect(lcvps('assault')).toBeGreaterThanOrEqual(4)
    expect(sites['landing-beaches']!.windows['pre-invasion']!.vehicles.every((v) => v.side === 'axis')).toBe(true)
  })

  it('the Jinamoc anchorage: no field before the invasion; then ramp, Quonsets, moorings, launch, pier, ops hut, fuel and a warehouse ashore; no tender and no maintenance barge (F3 section 9)', () => {
    const s = sites.jinamoc!
    expect(s.windows['pre-invasion']!.built).toBe(false)
    const k = kindsOf('jinamoc', 'buildup')
    for (const want of ['jinamoc-seaplane-ramp', 'quonset-hut-20x48', 'pby-mooring-buoy', 'pontoon-pier-segment', 'radio-radar-station', 'fuel-tank-farm', 'barracks-and-huts']) expect(k, want).toContain(want)
    expect(s.windows.buildup!.vehicles.some((v) => v.spec === 'usaaf-63ft-rescue-boat')).toBe(true)
    expect(s.windows.buildup!.lights.length, 'anchorage lamps for A4').toBeGreaterThanOrEqual(4)
    expect(s.windows['j6-alternate']!.lights).toEqual([])
    const named = [...s.base.buildings, ...Object.values(s.windows).flatMap((w) => [...w.added, ...w.vehicles, ...w.parked])].flatMap((p) => [p.id, 'kind' in p ? p.kind : p.spec]).join(' ').toLowerCase()
    expect(named).not.toMatch(/tender|barge|pt-boat|coastal-patrol/)
  })

  it('every F8C placement states its basis; the F8C sites carry no `sourced` claim the ledger does not hold', () => {
    for (const id of ['ormoc', 'landing-beaches', 'jinamoc']) {
      const st = sites[id]!
      for (const p of [...st.base.buildings, ...Object.values(st.windows).flatMap((w) => [...w.added, ...w.vehicles, ...w.parked])]) {
        expect(['sourced', 'inferred', 'invented']).toContain(p.basis)
        if (p.basis === 'sourced') expect(Object.keys(st.sources)).toContain(p.cite)
      }
    }
  })
})
