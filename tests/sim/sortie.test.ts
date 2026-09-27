import { describe, expect, it } from 'vitest'
import { loadAircraftSpec, loadScenario, loadScenarioBundle } from '../../tools/content/load.js'
import { worldFromScenario } from '../../src/sim/scenario.js'
import { ALL_LOADOUTS, DEV_STORES_SPEC_ID, DEV_STORES_SUFFIX, eligibleAircraft, eligibleLoadouts, isDevSortie, needsDevStores, sortieBundle, sortieRulesBroken, startKindOf, validateSortie, withPlayerSpec, type StartKind } from '../../src/sim/sortie.js'
import { readdirSync } from 'node:fs'
import { advance, withControls, type Stepper } from '../../src/sim/loop.js'
import { DT } from '../../src/sim/flight/model.js'

const hellcat = loadAircraftSpec('f6f-hellcat')
const wildcat = loadAircraftSpec('f4f-wildcat')
const zero = loadAircraftSpec('a6m2-zero')
const flyable = [hellcat, wildcat, zero]
const ids = (xs: readonly { id: string }[]) => xs.map((x) => x.id)
const scenarioIds = readdirSync('content/scenarios').filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5))

describe('startKindOf', () => {
  it.each([['deck-quals', 'carrier'], ['free-flight', 'airfield'], ['combat-air-patrol', 'airborne']] as const)('%s is %s', (id, kind) => {
    expect(startKindOf(loadScenario(id))).toBe(kind)
  })
})

describe('eligibleAircraft: every start kind x every flyable spec x dev', () => {
  for (const start of ['carrier', 'airfield', 'airborne'] as StartKind[]) {
    it(`${start}, dev off: allied only, carrier-capable on a carrier`, () => {
      expect(ids(eligibleAircraft(flyable, start, false))).toEqual(['f6f-hellcat', 'f4f-wildcat'])
    })
    it(`${start}, dev on: everything`, () => {
      expect(ids(eligibleAircraft(flyable, start, true))).toEqual(['f6f-hellcat', 'f4f-wildcat', 'a6m2-zero'])
    })
  }
  it('drops a non-carrier-capable allied spec from a carrier start only', () => {
    const landOnly = { ...wildcat, id: 'land-only', carrierCapable: false }
    expect(ids(eligibleAircraft([landOnly], 'carrier', false))).toEqual([])
    expect(ids(eligibleAircraft([landOnly], 'airfield', false))).toEqual(['land-only'])
  })
})

describe('eligibleLoadouts', () => {
  it('racks and rails: all four; no stores: clean only; dev: all four', () => {
    expect(eligibleLoadouts(hellcat, false)).toEqual(['clean', 'bombs', 'rockets', 'both'])
    expect(eligibleLoadouts(zero, false)).toEqual(['clean'])
    expect(eligibleLoadouts(zero, true)).toEqual(ALL_LOADOUTS)
  })
})

describe('sortieRulesBroken, isDevSortie, validateSortie', () => {
  const facts = { devScenario: false, start: 'carrier' as StartKind, spec: hellcat, loadout: 'both' as const }
  it('a legal sortie breaks nothing and is not Dev, even with Dev available (A5)', () => {
    expect(sortieRulesBroken(facts)).toEqual([])
    expect(isDevSortie({ ...facts, quickLaunch: false })).toBe(false)
    expect(() => validateSortie({ ...facts, dev: false })).not.toThrow()
  })
  it('names every rule broken, in a fixed order', () => {
    const f = { devScenario: true, start: 'carrier' as StartKind, spec: { ...zero, carrierCapable: false }, loadout: 'bombs' as const }
    expect(sortieRulesBroken(f)).toEqual(['dev-scenario', 'enemy-aircraft', 'not-carrier-capable', 'no-stations'])
    expect(() => validateSortie({ ...f, dev: false })).toThrow('sortie needs Dev: dev-scenario, enemy-aircraft, not-carrier-capable, no-stations')
    expect(() => validateSortie({ ...f, dev: true })).not.toThrow()
    expect(isDevSortie({ ...f, quickLaunch: false })).toBe(true)
  })
  it('each kind of needed-Dev choice alone is a Dev sortie; a quick launch always is', () => {
    expect(isDevSortie({ ...facts, devScenario: true, quickLaunch: false })).toBe(true)
    expect(isDevSortie({ ...facts, spec: zero, loadout: 'clean', quickLaunch: false })).toBe(true)
    expect(isDevSortie({ ...facts, start: 'airfield', spec: { ...hellcat, stores: undefined }, loadout: 'rockets', quickLaunch: false })).toBe(true)
    expect(isDevSortie({ ...facts, quickLaunch: true })).toBe(true)
  })
})

describe('the player-spec swap and the Dev stores layout', () => {
  it('withPlayerSpec changes only the player entry', () => {
    const s = loadScenario('combat-air-patrol')
    const swapped = withPlayerSpec(s, 'a6m2-zero')
    expect(swapped.aircraft.find((a) => a.id === s.player)!.spec).toBe('a6m2-zero')
    expect(swapped.heldGroups).toEqual(s.heldGroups)
    expect(swapped.aircraft.filter((a) => a.id !== s.player)).toEqual(s.aircraft.filter((a) => a.id !== s.player))
  })
  it('a default sortie is bit-identical to today for every shipped scenario (Global Constraint)', () => {
    for (const id of scenarioIds) {
      const bundle = loadScenarioBundle(id)
      for (const loadout of ALL_LOADOUTS) {
        expect(worldFromScenario(sortieBundle(bundle, loadout, hellcat.stores), null, loadout), `${id} ${loadout}`)
          .toEqual(worldFromScenario(bundle, null, loadout))
      }
    }
  })
  it('dev bombs on the Zero hang the Hellcat layout on the player only (SF-R2, SF-R3)', () => {
    const scenario = withPlayerSpec(loadScenario('combat-air-patrol'), 'a6m2-zero')
    const bundle = { ...loadScenarioBundle('combat-air-patrol'), scenario, aircraftSpecs: { ...loadScenarioBundle('combat-air-patrol').aircraftSpecs, 'a6m2-zero': zero } }
    expect(needsDevStores(zero, 'bombs')).toBe(true)
    const b = sortieBundle(bundle, 'bombs', loadAircraftSpec(DEV_STORES_SPEC_ID).stores)
    const key = `a6m2-zero${DEV_STORES_SUFFIX}`
    expect(b.scenario.aircraft.find((a) => a.id === b.scenario.player)!.spec).toBe(key)
    expect(b.aircraftSpecs[key]!.id).toBe('a6m2-zero')
    expect(b.aircraftSpecs[key]!.stores).toEqual(hellcat.stores)
    expect(b.aircraftSpecs['a6m2-zero']!.stores).toBeUndefined()
    const w = worldFromScenario(b, null, 'bombs')
    expect(w.combat.aircraft[w.player]!.stores).toEqual({ bombs: 2, rockets: 0 })
  })
})

describe('a Dev-stores Zero releases a real bomb (headless release proof)', () => {
  // The combat.test.ts harness: `still` holds the airframe, so only the release is under test.
  const still: Stepper = (_spec, state, _controls, ctx) => ({ ...state, tick: ctx.tick })
  it('one bomb leaves the Hellcat-layout racks on the first tick of dropBomb', () => {
    const zero = loadAircraftSpec('a6m2-zero')
    const base = loadScenarioBundle('combat-air-patrol')
    const bundle = { ...base, scenario: withPlayerSpec(base.scenario, 'a6m2-zero'), aircraftSpecs: { ...base.aircraftSpecs, 'a6m2-zero': zero } }
    const w = worldFromScenario(sortieBundle(bundle, 'bombs', loadAircraftSpec(DEV_STORES_SPEC_ID).stores), null, 'bombs')
    const held = withControls(w, w.player, { pitch: 0, roll: 0, yaw: 0, throttle: 0, fire: false, dropBomb: true })
    const after = advance(held, DT, still).world
    expect(after.combat.projectiles.filter((p) => p.kind === 'bomb')).toHaveLength(1)
    expect(after.combat.aircraft[after.player]!.stores).toEqual({ bombs: 1, rockets: 0 })
  })
})
