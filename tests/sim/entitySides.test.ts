import { describe, expect, it } from 'vitest'
import { airfieldSideOf, sideOf } from '../../src/sim/sides.js'
import { parseScenario, worldFromScenario } from '../../src/sim/scenario.js'
import { createWorldOf, type AircraftEntity } from '../../src/sim/loop.js'
import { createState } from '../../src/sim/flight/state.js'
import { v3 } from '../../src/sim/math/vec3.js'
import type { Airfield } from '../../src/sim/world/airfields.js'
import { bundleForScenario, loadAircraftSpec, loadAirfield, loadScenario, loadScenarioBundle } from '../../tools/content/load.js'

/**
 * Friendly fire (spec 2026-09-26-friendly-fire-design.md §2-§3): ships and
 * structures get a side, read through the same `sideOf` 7e gave aircraft.
 */

const TAC = loadAirfield('tacloban').runway.center

/** A minimal airborne-player scenario; `extra` is spread over it. */
const scenario = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'sides', player: 'f6f-1', airfields: ['tacloban', 'dulag'],
  aircraft: [{ id: 'f6f-1', spec: 'f6f-hellcat', airborneAt: { position: [TAC.x, 500, TAC.z], headingDeg: 0, speedMps: 90 } }],
  ships: [], weather: { windFromDeg: 0, windMps: 0 },
  ...extra,
})
const CV = { id: 'cv-1', spec: 'essex-cv', waypoints: [[-25629, -16479]], speedMps: 0 }
const build = (raw: Record<string, unknown>) => worldFromScenario(bundleForScenario(parseScenario(raw)), null)

describe('ship and structure sides (friendly-fire spec §2)', () => {
  it('a ship is axis without a side and takes its content side', () => {
    const w = { player: 'f6f-1' }
    expect(sideOf(w, { id: 'cv-1' })).toBe('axis')
    expect(sideOf(w, { id: 'cv-1', side: 'allied' })).toBe('allied')
    const world = build(scenario({ ships: [{ ...CV, side: 'allied' }, { ...CV, id: 'maru-1', spec: 'type-b-maru' }] }))
    expect(world.ships.map((s) => [s.id, sideOf(world, s)])).toEqual([['cv-1', 'allied'], ['maru-1', 'axis']])
    // Only when content says one, like 7e's aircraft (`sideFrom`).
    expect('side' in world.ships[1]!).toBe(false)
  })

  it('airfieldSideOf: the scenario override, then the base content, then axis', () => {
    const base = { id: 'x' }
    expect(airfieldSideOf(base)).toBe('axis')
    expect(airfieldSideOf({ ...base, side: 'allied' })).toBe('allied')
    expect(airfieldSideOf({ ...base, side: 'allied' }, { x: 'axis' })).toBe('axis')
    expect(airfieldSideOf(base, { y: 'allied' })).toBe('axis')
  })

  it('a structure takes its airfield side, override included', () => {
    const plain = build(scenario())
    const side = (w: typeof plain, id: string) => sideOf(w, w.structures.find((s) => s.id === id)!)
    expect(side(plain, 'tacloban-tower')).toBe('allied')
    expect(side(plain, 'dulag-hangar-1')).toBe('axis')
    const flipped = build(scenario({ airfieldSides: { dulag: 'allied', tacloban: 'axis' } }))
    expect(side(flipped, 'tacloban-tower')).toBe('axis')
    expect(side(flipped, 'dulag-hangar-1')).toBe('allied')
  })

  it('shipped content: the US task force allied, the maru axis, Tacloban allied, Dulag axis (spec §3, ruling FF-2)', () => {
    const want: Record<string, Record<string, string>> = {
      'free-flight': { 'cv-1': 'allied', 'dd-1': 'allied', 'dd-2': 'allied' },
      'deck-quals': { 'cv-1': 'allied', 'dd-1': 'allied', 'dd-2': 'allied' },
      'strike-range': { 'maru-1': 'axis' },
    }
    for (const [id, ships] of Object.entries(want)) {
      const world = worldFromScenario(loadScenarioBundle(id), null)
      expect(Object.fromEntries(world.ships.map((s) => [s.id, sideOf(world, s)])), id).toEqual(ships)
      for (const s of world.structures) {
        expect(sideOf(world, s), `${id}/${s.id}`).toBe(s.airfield === 'tacloban' ? 'allied' : 'axis')
      }
    }
    expect(worldFromScenario(loadScenarioBundle('free-flight'), null).structures.filter((s) => s.airfield === 'tacloban')).toHaveLength(5)
  })
})

describe('side validation at scenario load (spec §3)', () => {
  it('rejects an airfieldSides key that is not one of airfields (schema)', () => {
    expect(() => parseScenario(scenario({ airfieldSides: { henderson: 'allied' } })))
      .toThrow(/airfieldSides: every airfieldSides key must be one of airfields/)
  })

  it('rejects an enemy airfield on the player side, in createWorldOf', () => {
    expect(() => build(scenario({ enemyAirfields: ['tacloban'] })))
      .toThrow(/enemy airfield "tacloban" is on the player's own side \(allied\)/)
    expect(() => build(scenario({ enemyAirfields: ['dulag'] }))).not.toThrow()
    expect(() => build(scenario({ enemyAirfields: ['tacloban'], airfieldSides: { tacloban: 'axis' } }))).not.toThrow()
  })

  it('rejects an enemy airfield on the player side for a hand-built world too', () => {
    const spec = loadAircraftSpec('f6f-hellcat')
    const state = createState({ position: v3(0, 500, 0) })
    const player: AircraftEntity<undefined> = {
      id: 'p', spec, state, previous: state, controls: { pitch: 0, roll: 0, yaw: 0, throttle: 0 },
      assistMemory: undefined, impact: null, parked: false, pilot: null,
    }
    const field: Airfield = { ...loadAirfield('dulag'), id: 'home', side: 'allied' }
    expect(() => createWorldOf({ aircraft: [player], player: 'p', airfields: [field], enemyAirfields: ['home'] }))
      .toThrow(/enemy airfield "home" is on the player's own side/)
  })

  it('rejects the player parked on a ship of the other side', () => {
    const onDeck = { id: 'f6f-1', spec: 'f6f-hellcat', parkedAt: { ship: 'cv-1', spot: { x: 0, z: -110 } }, chocked: false }
    expect(() => build(scenario({ aircraft: [onDeck], ships: [CV] })))
      .toThrow(/player "f6f-1" is parked on "cv-1", which is on the other side \(axis\)/)
    expect(() => build(scenario({ aircraft: [onDeck], ships: [{ ...CV, side: 'allied' }] }))).not.toThrow()
  })

  it('rejects a land objective at a ship or airfield of the other side', () => {
    const land = (at: string) => ({ objectives: [{ id: 'home', label: 'Recover', priority: 'primary', kind: 'land', at }] })
    expect(() => build(scenario({ ...land('cv-1'), ships: [CV] })))
      .toThrow(/objective "home" lands at "cv-1", which is on the other side \(axis\)/)
    expect(() => build(scenario({ ...land('dulag') })))
      .toThrow(/objective "home" lands at "dulag", which is on the other side \(axis\)/)
    expect(() => build(scenario({ ...land('cv-1'), ships: [{ ...CV, side: 'allied' }] }))).not.toThrow()
    expect(() => build(scenario({ ...land('tacloban') }))).not.toThrow()
  })

  it('rejects an ingress destination ship on the raider side', () => {
    const raider = (side?: string) => ({
      id: 'raid-1', spec: 'f6f-hellcat', airborneAt: { position: [0, 3000, 0], headingDeg: 0, speedMps: 130 },
      ...(side === undefined ? {} : { side }),
      pilot: { ingress: { route: [{ x: 0, z: -5000, altitudeM: 3000, speedMps: 130 }], destination: { ship: 'cv-1' } } },
    })
    const base = scenario()
    const aircraft = (base.aircraft as unknown[])
    expect(() => build({ ...base, aircraft: [...aircraft, raider()], ships: [CV] }))
      .toThrow(/ingress destination "cv-1" of "raid-1" is on its own side \(axis\)/)
    expect(() => build({ ...base, aircraft: [...aircraft, raider()], ships: [{ ...CV, side: 'allied' }] })).not.toThrow()
  })
})

/**
 * Review finding, ruled by Mark 2026-09-26: the parked enemy gunnery target
 * `f6f-2` was 56 m in front of allied `tacloban-hangar-3`, so a strafing
 * pass's overshoots could discharge the player for shooting the target the
 * scenario offers. Mark: move it, and make it an enemy. Checked as lines of
 * fire: from every compass approach (16 of them), the 400 m of ground beyond
 * the target must not cross an own-side structure's footprint grown by 10 m
 * for dispersion.
 */
describe('f6f-2 stands clear of the player\'s own structures (Mark, 2026-09-26)', () => {
  const OVERSHOOT_M = 400
  const DISPERSION_M = 10

  it.each(['free-flight', 'deck-quals'])('%s: no overshoot line from any direction crosses an allied building', (id) => {
    const bundle = loadScenarioBundle(id)
    const w = worldFromScenario(bundle, null)
    const target = w.aircraft.find((a) => a.id === 'f6f-2')!
    expect(sideOf(w, target)).not.toBe(sideOf(w, w.aircraft.find((a) => a.id === w.player)!))
    const own = w.structures.filter((s) => s.side === 'allied')
    const base = bundle.airfields['tacloban']!
    const footprint = new Map(base.buildings.map((b) => [b.id, b]))
    for (let k = 0; k < 16; k++) {
      const ang = (k / 16) * 2 * Math.PI
      for (let d = 0; d <= OVERSHOOT_M; d += 2) {
        const x = target.state.position.x + Math.sin(ang) * d
        const z = target.state.position.z - Math.cos(ang) * d
        for (const s of own) {
          const b = footprint.get(s.id)!
          const inside = Math.abs(x - s.position.x) < b.widthM / 2 + DISPERSION_M && Math.abs(z - s.position.z) < b.lengthM / 2 + DISPERSION_M
          expect(inside, `${id}: an overshoot heading ${(k * 22.5).toFixed(1)} deg crosses ${s.id} ${d} m past f6f-2`).toBe(false)
        }
      }
    }
  })

  it('f6f-2 is declared axis in content, not left to the default', () => {
    for (const id of ['free-flight', 'deck-quals']) {
      const f6f2 = loadScenario(id).aircraft.find((a) => a.id === 'f6f-2')
      expect(f6f2?.side, id).toBe('axis')
    }
  })
})
