import { describe, it, expect } from 'vitest'
import { bundleForScenario, loadScenario, loadScenarioBundle } from '../../tools/content/load.js'
import { parseScenario, worldFromScenario } from '../../src/sim/scenario.js'
import { expandScenario } from '../../src/sim/world/sites.js'
import { friendlyBaseAt, friendlySites, nearestFriendlySite } from '../../src/sim/friendly.js'
import { buildStructures } from '../../src/sim/weapons/structures.js'
import { BASE, flatField } from './mission/fixture.js'

/**
 * F8A Task 6 (2026-10-16): a site's chosen window is merged into the scenario BEFORE the world is built
 * (`expandScenario`), so what the window says -- side, serviceable, buildings with their states, vehicles, parked
 * aircraft, lights -- is ordinary world content from then on. A scenario with no `sites` never touches any of it.
 */
const withSites = (sites: string[], patch: Record<string, unknown> = {}): Record<string, unknown> => ({
  ...BASE, id: 'site-fixture', airfields: ['tacloban'], sites, ...patch,
})
const worldOf = (raw: Record<string, unknown>, windows: Record<string, string>) =>
  worldFromScenario(bundleForScenario(parseScenario(raw), windows), flatField(0))

describe('site overlay at world build', () => {
  it('Tacloban buildup: allied and serviceable, 12 vehicles (the cap), 8 parked aircraft, lights merged, the destroyed hangar is rubble', () => {
    const w = worldOf(withSites(['tacloban']), { tacloban: 'buildup' })
    const field = w.airfields.find((a) => a.id === 'tacloban')!
    expect(field.side).toBe('allied')
    expect(field.serviceable).toBe(true)
    expect(w.vehicles.filter((v) => v.id.startsWith('tacloban-bu-'))).toHaveLength(12)
    expect(w.aircraft.filter((a) => a.id.startsWith('tacloban-bu-air-'))).toHaveLength(8)
    expect(w.aircraft.filter((a) => a.id.startsWith('tacloban-bu-air-')).every((a) => a.parked && a.side === 'allied')).toBe(true)
    // rubble has a record but no hit box
    expect(field.buildings.find((b) => b.id === 'tacloban-hangar-2')!.state).toBe('destroyed')
    expect(w.structures.some((s) => s.id === 'tacloban-hangar-2')).toBe(false)
    expect(w.structures.some((s) => s.id === 'tacloban-quonset-1' && s.kind === 'quonset-hut-20x48')).toBe(true)
    expect(w.structures.every((s) => s.side === 'allied')).toBe(true)
  })

  it('a damaged building keeps its box at half the hit points; construction keeps its box too', () => {
    const assault = worldOf(withSites(['tacloban']), { tacloban: 'assault' })
    const tower = assault.structures.find((s) => s.id === 'tacloban-tower')!
    expect(tower.hp).toBe(20) // 40 hp, damaged
    const tan = worldOf(withSites(['tanauan'], { airfields: ['tacloban'] }), { tanauan: 'endgame' })
    expect(tan.structures.find((s) => s.id === 'tanauan-barracks-1')).toBeDefined()
  })

  it('lights are merged into the scenario at world coordinates; a window with none adds none', () => {
    const bundle = bundleForScenario(parseScenario(withSites(['tacloban'])), { tacloban: 'buildup' })
    const lights = bundle.scenario.lights ?? []
    expect(lights.length).toBe(7) // six flare pots and the harbor light
    const runway = bundle.airfields.tacloban!.runway.center
    expect(lights.every((l) => 'x' in l.at && Math.hypot(l.at.x - runway.x, l.at.z - runway.z) < 1000)).toBe(true)
    expect(bundleForScenario(parseScenario(withSites(['tacloban'])), { tacloban: 'assault' }).scenario.lights).toBeUndefined()
  })

  it('is deterministic: the same scenario and windows build the same world', () => {
    const a = JSON.stringify(worldOf(withSites(['tacloban', 'dulag']), { tacloban: 'endgame', dulag: 'endgame' }))
    const b = JSON.stringify(worldOf(withSites(['tacloban', 'dulag']), { tacloban: 'endgame', dulag: 'endgame' }))
    expect(a).toBe(b)
  })

  it('a site with no field yet is absent from the world, and a scenario that needs it fails', () => {
    const w = worldOf(withSites(['tanauan'], { airfields: ['tacloban', 'tanauan'] }), { tanauan: 'assault' })
    expect(w.airfields.map((a) => a.id)).toEqual(['tacloban'])
    expect(() => worldOf(withSites(['tanauan'], { airfields: ['tanauan'] }), { tanauan: 'assault' })).toThrow(/none of its sites/)
  })

  it('a scenario that names a site nobody loaded, or a window nobody defined, fails with the name', () => {
    expect(() => expandScenario(parseScenario(withSites(['tacloban'])), {}, {})).toThrow(/tacloban/)
    expect(() => bundleForScenario(parseScenario(withSites(['tacloban'])), { tacloban: 'mid-war' })).toThrow(/mid-war/)
  })
})

describe('a field its window leaves unserviceable is not a recovery field', () => {
  const near = (id: string) => ({ x: id === 'dulag' ? -31629 : -29666, z: id === 'dulag' ? -16479 : -47605 })
  const player = (w: ReturnType<typeof worldOf>) => ({ ...w, player: 'f6f-1' })

  it('Dulag in the assault: allied but unserviceable, so no friendly base and no steering target', () => {
    const w = player(worldOf(withSites(['tacloban', 'dulag'], { airfields: ['tacloban', 'dulag'], aircraft: [{ id: 'f6f-1', spec: 'f6f-hellcat', side: 'allied', airborneAt: { position: [0, 3000, 0], headingDeg: 90, speedMps: 120 } }] }), { tacloban: 'buildup', dulag: 'assault' }))
    const dulag = w.airfields.find((a) => a.id === 'dulag')!
    expect(dulag.side).toBe('allied')
    expect(dulag.serviceable).toBe(false)
    expect(friendlyBaseAt(w, { kind: 'airfield', id: 'dulag' } as never, near('dulag'))).toBeNull()
    expect(friendlySites(w).filter((s) => s.kind === 'airfield').map((s) => s.id)).toEqual(['tacloban'])
    expect(nearestFriendlySite(w, near('dulag'), (s) => s.kind === 'airfield')!.id).toBe('tacloban')
  })

  it('the same Dulag in the buildup is serviceable and legal', () => {
    const w = player(worldOf(withSites(['tacloban', 'dulag'], { airfields: ['tacloban', 'dulag'], aircraft: [{ id: 'f6f-1', spec: 'f6f-hellcat', side: 'allied', airborneAt: { position: [0, 3000, 0], headingDeg: 90, speedMps: 120 } }] }), { tacloban: 'buildup', dulag: 'buildup' }))
    expect(friendlyBaseAt(w, { kind: 'airfield', id: 'dulag' } as never, near('dulag'))).toEqual({ kind: 'airfield', id: 'dulag', name: 'Dulag' })
    expect(friendlySites(w).filter((s) => s.kind === 'airfield').map((s) => s.id).sort()).toEqual(['dulag', 'tacloban'])
  })

  it('a land objective at an unserviceable field does not load; at a serviceable one it does', () => {
    const land = { id: 'home', label: 'Land', priority: 'primary', kind: 'land', at: 'dulag' }
    const raw = () => withSites(['dulag'], { airfields: ['dulag'], aircraft: [{ id: 'f6f-1', spec: 'f6f-hellcat', side: 'allied', airborneAt: { position: [0, 3000, 0], headingDeg: 90, speedMps: 120 } }], objectives: [land] })
    expect(() => worldOf(raw(), { dulag: 'assault' })).toThrow(/not serviceable/)
    expect(() => worldOf(raw(), { dulag: 'buildup' })).not.toThrow()
  })

  it('an AI whose home is an unserviceable field does not load', () => {
    const raw = withSites(['dulag'], { airfields: ['dulag'], aircraft: [
      { id: 'f6f-1', spec: 'f6f-hellcat', side: 'allied', airborneAt: { position: [0, 3000, 0], headingDeg: 90, speedMps: 120 } },
      { id: 'wing', spec: 'f6f-hellcat', side: 'allied', airborneAt: { position: [100, 3000, 0], headingDeg: 90, speedMps: 120 }, pilot: { home: { airfield: 'dulag' } } },
    ] })
    expect(() => worldOf(raw, { dulag: 'assault' })).toThrow(/not serviceable/)
    expect(() => worldOf(raw, { dulag: 'buildup' })).not.toThrow()
  })
})

describe('a site without a strip (F8C): Ormoc, the beaches, Jinamoc', () => {
  const player = { id: 'f6f-1', spec: 'f6f-hellcat', side: 'allied', airborneAt: { position: [0, 3000, 0], headingDeg: 90, speedMps: 120 } }
  const land = { id: 'home', label: 'Land', priority: 'primary', kind: 'land', at: 'jinamoc' }

  it('expands to an airfield record with noStrip, its buildings as hit boxes, vehicles and lights; no strip and no recovery', () => {
    const w = { ...worldOf(withSites(['jinamoc'], { airfields: ['tacloban'], aircraft: [player] }), { jinamoc: 'buildup' }), player: 'f6f-1' }
    const field = w.airfields.find((a) => a.id === 'jinamoc')!
    expect(field.noStrip).toBe(true)
    expect(field.side).toBe('allied')
    expect(field.serviceable).toBe(true)
    expect(w.structures.filter((x) => x.airfield === 'jinamoc').length).toBeGreaterThan(10)
    expect(w.vehicles.some((v) => v.spec.id === 'usaaf-63ft-rescue-boat')).toBe(true)
    expect(w.aircraft.some((a) => a.spec.id === 'pby-5a-catalina' && a.parked)).toBe(true)
    // allied, serviceable and held by the player's side, yet not a friendly base, steering target or landing
    expect(friendlyBaseAt(w, { kind: 'airfield', id: 'jinamoc' } as never, field.runway.center)).toBeNull()
    expect(friendlySites(w).map((s) => s.id)).not.toContain('jinamoc')
  })

  it('a land objective at it and an AI whose home it is do not load, in any window', () => {
    const raw = () => withSites(['jinamoc'], { airfields: ['jinamoc'], aircraft: [player], objectives: [land] })
    expect(() => worldOf(raw(), { jinamoc: 'buildup' })).toThrow(/no strip/)
    const homed = withSites(['jinamoc'], { airfields: ['jinamoc'], aircraft: [player, { id: 'wing', spec: 'f6f-hellcat', side: 'allied', airborneAt: { position: [100, 3000, 0], headingDeg: 90, speedMps: 120 }, pilot: { home: { airfield: 'jinamoc' } } }] })
    expect(() => worldOf(homed, { jinamoc: 'buildup' })).toThrow(/no strip/)
  })

  it('the three F8C sites each expand in all five windows (Jinamoc has no field before the invasion)', () => {
    for (const site of ['ormoc', 'landing-beaches', 'jinamoc']) for (const win of ['pre-invasion', 'assault', 'buildup', 'endgame', 'j6-alternate']) {
      const expect_built = !(site === 'jinamoc' && win === 'pre-invasion')
      const b = bundleForScenario(parseScenario(withSites([site], { airfields: ['tacloban'] })), { [site]: win })
      expect(b.airfields[site] !== undefined, `${site} ${win}`).toBe(expect_built)
    }
  })
})

describe('a world with no `sites` is untouched (the golden recordings guard the byte level)', () => {
  it('expandScenario returns the very scenario it was given, with no airfields', () => {
    const s = loadScenario('free-flight')
    const out = expandScenario(s, {}, {})
    expect(out.scenario).toBe(s)
    expect(out.airfields).toEqual({})
  })

  it('every shipped scenario loads to the bundle it always did: no site airfields, no `sites` key', () => {
    const b = loadScenarioBundle('free-flight')
    expect(b.scenario.sites).toBeUndefined()
    expect(Object.keys(b.airfields).sort()).toEqual(['dulag', 'tacloban'])
    expect(b.airfields.tacloban!.clutter).toBeUndefined()
    expect(buildStructures([b.airfields.tacloban!], null).map((s) => s.id)).toEqual(['tacloban-hangar-1', 'tacloban-hangar-2', 'tacloban-hangar-3', 'tacloban-tower', 'tacloban-aaa-1'])
  })
})
