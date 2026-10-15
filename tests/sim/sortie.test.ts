import { describe, expect, it } from 'vitest'
import { bundleForScenario, loadAircraftSpec, loadScenario, loadScenarioBundle } from '../../tools/content/load.js'
import { worldFromScenario } from '../../src/sim/scenario.js'
import { ALL_LOADOUTS, DEV_STORES_SPEC_ID, DEV_STORES_SUFFIX, eligibleAircraft, eligibleLoadouts, isDevSortie, needsDevStores, sortieBundle, sortieRulesBroken, startKindOf, validateSortie, withPlayerSpec, type StartKind } from '../../src/sim/sortie.js'
import { readdirSync } from 'node:fs'
import { advance, withControls, type Stepper } from '../../src/sim/loop.js'
import { DT } from '../../src/sim/flight/model.js'
import { waterSurfaceAt, waterSurfaceContext } from '../../src/sim/waterSurface.js'

const hellcat = loadAircraftSpec('f6f-hellcat')
const wildcat = loadAircraftSpec('f4f-wildcat')
const zero = loadAircraftSpec('a6m2-zero')
const catalina = loadAircraftSpec('pby-5a-catalina')
const flyable = [hellcat, wildcat, zero]
// A flyable airplane with no stores block, for the rules that only bite on one (the Zero had none until 2026-09-29).
const bare = { ...zero, stores: undefined }
const alternateTorpedoes = {
  ...wildcat,
  id: 'amphibian-test',
  stores: {
    ...wildcat.stores!,
    torpedoRacks: [
      { id: 'torpedo-left', offset: [0, -1, -2] as [number, number, number], store: 'mk13' },
      { id: 'torpedo-right', offset: [0, -1, 2] as [number, number, number], store: 'mk13' },
    ],
    types: {
      ...wildcat.stores!.types,
      mk13: {
        kind: 'torpedo' as const, massKg: 1005, dragAreaM2: 0.132, fillerKg: 274,
        damage: 136, blastRadiusM: 31, lifetimeS: 60, dragPerM: 1.32e-5,
        maxDropSpeedMps: 210.9, maxDropHeightM: 730, runSpeedMps: 17.23,
        runRangeM: 3660, runDepthM: 3, armRunM: 180,
      },
    },
  },
}
const ids = (xs: readonly { id: string }[]) => xs.map((x) => x.id)
const scenarioIds = readdirSync('content/scenarios').filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5))

describe('startKindOf', () => {
  it.each([['deck-quals', 'carrier'], ['free-flight', 'airfield'], ['water-quals', 'water'], ['combat-air-patrol', 'airborne']] as const)('%s is %s', (id, kind) => {
    expect(startKindOf(loadScenario(id))).toBe(kind)
  })
  it('builds the Catalina afloat at its hull waterline with wheels up and floats down', () => {
    const world = worldFromScenario(loadScenarioBundle('water-quals'), null, 'clean')
    const player = world.aircraft.find((a) => a.id === world.player)!
    const water = waterSurfaceAt(waterSurfaceContext(0, world.wind), -13000, -36000)
    expect(player.state.position).toEqual({
      x: -13000,
      y: water.heightM + catalina.waterOperations!.hullDepthM - catalina.waterOperations!.displacementDraftM,
      z: -36000,
    })
    expect(player.state.velocity).toEqual({ x: 0, y: water.verticalSpeedMps, z: 0 })
    expect(player.state.gearFraction).toBe(0)
    expect(player.state.flapFraction).toBe(1)
    expect(player.controls).toMatchObject({ gearDown: false, flapDown: true, throttle: 0 })
    expect(player.parked).toBe(true)
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
  it('F5A: the airplane a scenario authors for its player is offered with Dev off, whatever its nation; no other enemy airplane is', () => {
    expect(ids(eligibleAircraft(flyable, 'airborne', false, 'a6m2-zero'))).toEqual(['f6f-hellcat', 'f4f-wildcat', 'a6m2-zero'])
    expect(ids(eligibleAircraft(flyable, 'airborne', false, 'f6f-hellcat'))).toEqual(['f6f-hellcat', 'f4f-wildcat'])
    expect(ids(eligibleAircraft(flyable, 'airborne', false, 'no-such-aircraft'))).toEqual(['f6f-hellcat', 'f4f-wildcat'])
  })
  it('drops a non-carrier-capable allied spec from a carrier start only', () => {
    const landOnly = { ...wildcat, id: 'land-only', carrierCapable: false }
    expect(ids(eligibleAircraft([landOnly], 'carrier', false))).toEqual([])
    expect(ids(eligibleAircraft([landOnly], 'airfield', false))).toEqual(['land-only'])
  })
  it('offers only water-capable allied aircraft for a water start', () => {
    expect(ids(eligibleAircraft([...flyable, catalina], 'water', false))).toEqual(['pby-5a-catalina'])
  })
})

describe('eligibleLoadouts', () => {
  it('racks and rails: the original four; no stores: clean only; dev lends the original four', () => {
    expect(eligibleLoadouts(hellcat, false)).toEqual(['clean', 'bombs', 'rockets', 'both'])
    expect(eligibleLoadouts(zero, false)).toEqual(['clean', 'bombs', 'rockets', 'both'])
    expect(eligibleLoadouts(bare, false)).toEqual(['clean'])
    expect(eligibleLoadouts(bare, true)).toEqual(['clean', 'bombs', 'rockets', 'both'])
  })
  it('offers a distinct torpedoes choice only when alternate torpedo racks exist', () => {
    expect(ALL_LOADOUTS).toContain('torpedoes')
    expect(eligibleLoadouts(alternateTorpedoes, false)).toEqual(['clean', 'bombs', 'torpedoes'])
  })
  it('racks only, no rails: clean and bombs, not rockets or both (W1: the F4F-4 carries no rockets)', () => {
    expect(eligibleLoadouts(wildcat, false)).toEqual(['clean', 'bombs'])
  })
})

describe('sortieRulesBroken, isDevSortie, validateSortie', () => {
  const facts = { devScenario: false, start: 'carrier' as StartKind, spec: hellcat, loadout: 'both' as const }
  it('F5A: an enemy airplane breaks the rule unless it is the scenario\'s own authored player airplane', () => {
    const own = { ...facts, start: 'airborne' as StartKind, spec: zero, loadout: 'clean' as const }
    expect(sortieRulesBroken(own)).toEqual(['enemy-aircraft'])
    expect(sortieRulesBroken({ ...own, authored: true })).toEqual([])
    expect(isDevSortie({ ...own, authored: true, quickLaunch: false })).toBe(false)
    expect(isDevSortie({ ...own, authored: true, quickLaunch: true })).toBe(true)
    expect(() => validateSortie({ ...own, authored: true, dev: false })).not.toThrow()
    expect(() => validateSortie({ ...own, dev: false })).toThrow(/enemy-aircraft/)
  })
  it('a legal sortie breaks nothing and is not Dev, even with Dev available (A5)', () => {
    expect(sortieRulesBroken(facts)).toEqual([])
    expect(isDevSortie({ ...facts, quickLaunch: false })).toBe(false)
    expect(() => validateSortie({ ...facts, dev: false })).not.toThrow()
  })
  it('names every rule broken, in a fixed order', () => {
    const f = { devScenario: true, start: 'carrier' as StartKind, spec: { ...bare, carrierCapable: false }, loadout: 'bombs' as const }
    expect(sortieRulesBroken(f)).toEqual(['dev-scenario', 'enemy-aircraft', 'not-carrier-capable', 'no-stations'])
    expect(() => validateSortie({ ...f, dev: false })).toThrow('sortie needs Dev: dev-scenario, enemy-aircraft, not-carrier-capable, no-stations')
    expect(() => validateSortie({ ...f, dev: true })).not.toThrow()
    expect(isDevSortie({ ...f, quickLaunch: false })).toBe(true)
  })
  it('requires a water-capable aircraft for a water start', () => {
    expect(sortieRulesBroken({ ...facts, start: 'water', spec: hellcat })).toContain('not-water-capable')
    expect(sortieRulesBroken({ ...facts, start: 'water', spec: catalina })).not.toContain('not-water-capable')
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
      const playerSpecId = bundle.scenario.aircraft.find((a) => a.id === bundle.scenario.player)!.spec
      const playerSpec = bundle.aircraftSpecs[playerSpecId]!
      // Alternate torpedo stations intentionally rewrite the player's spec;
      // every loadout that uses the authored primary racks remains identical.
      for (const loadout of eligibleLoadouts(playerSpec, false).filter((choice) => choice !== 'torpedoes')) {
        expect(worldFromScenario(sortieBundle(bundle, loadout, hellcat.stores), null, loadout), `${id} ${loadout}`)
          .toEqual(worldFromScenario(bundle, null, loadout))
      }
    }
  })
  it('dev bombs on a stores-less Zero hang the Hellcat layout on the player only (SF-R2, SF-R3)', () => {
    const scenario = withPlayerSpec(loadScenario('combat-air-patrol'), 'a6m2-zero')
    const bundle = { ...loadScenarioBundle('combat-air-patrol'), scenario, aircraftSpecs: { ...loadScenarioBundle('combat-air-patrol').aircraftSpecs, 'a6m2-zero': bare } }
    expect(needsDevStores(bare, 'bombs')).toBe(true)
    const b = sortieBundle(bundle, 'bombs', loadAircraftSpec(DEV_STORES_SPEC_ID).stores)
    const key = `a6m2-zero${DEV_STORES_SUFFIX}`
    expect(b.scenario.aircraft.find((a) => a.id === b.scenario.player)!.spec).toBe(key)
    expect(b.aircraftSpecs[key]!.id).toBe('a6m2-zero')
    expect(b.aircraftSpecs[key]!.stores).toEqual(hellcat.stores)
    expect(b.aircraftSpecs['a6m2-zero']!.stores).toBeUndefined()
    const w = worldFromScenario(b, null, 'bombs')
    expect(w.combat.aircraft[w.player]!.stores).toEqual({ bombs: 2, rockets: 0 })
  })
  it('an alternate torpedo sortie swaps only the player to its torpedo racks', () => {
    const base = loadScenarioBundle('combat-air-patrol')
    const scenario = withPlayerSpec(base.scenario, alternateTorpedoes.id)
    const bundle = { ...base, scenario, aircraftSpecs: { ...base.aircraftSpecs, [alternateTorpedoes.id]: alternateTorpedoes } }
    const b = sortieBundle(bundle, 'torpedoes', hellcat.stores)
    const key = `${alternateTorpedoes.id}~torpedoes`
    expect(b.scenario.aircraft.find((a) => a.id === b.scenario.player)!.spec).toBe(key)
    expect(b.aircraftSpecs[key]!.stores!.racks).toEqual(alternateTorpedoes.stores.torpedoRacks)
    expect(b.aircraftSpecs[alternateTorpedoes.id]!.stores!.racks).toEqual(wildcat.stores!.racks)
    expect(worldFromScenario(b, null, 'torpedoes').combat.aircraft[b.scenario.player]!.stores).toEqual({ bombs: 2, rockets: 0 })
  })
  it('the Catalina water qualification launches with its two real Mk 13 stations', () => {
    const bundle = loadScenarioBundle('water-quals')
    const selected = sortieBundle(bundle, 'torpedoes', hellcat.stores)
    const playerSpec = selected.aircraftSpecs['pby-5a-catalina~torpedoes']!
    expect(playerSpec.stores!.racks.map((rack) => [rack.id, rack.store])).toEqual([
      ['torpedo-left', 'mk13'],
      ['torpedo-right', 'mk13'],
    ])
    expect(worldFromScenario(selected, null, 'torpedoes').combat.aircraft['catalina-1']!.stores).toEqual({ bombs: 2, rockets: 0 })
  })
})

describe('a Dev-stores Zero releases a real bomb (headless release proof)', () => {
  // The combat.test.ts harness: `still` holds the airframe, so only the release is under test.
  const still: Stepper = (_spec, state, _controls, ctx) => ({ ...state, tick: ctx.tick })
  it('one bomb leaves the Hellcat-layout racks on the first tick of dropBomb', () => {
    const zero = { ...loadAircraftSpec('a6m2-zero'), stores: undefined }
    const base = loadScenarioBundle('combat-air-patrol')
    const bundle = { ...base, scenario: withPlayerSpec(base.scenario, 'a6m2-zero'), aircraftSpecs: { ...base.aircraftSpecs, 'a6m2-zero': zero } }
    const w = worldFromScenario(sortieBundle(bundle, 'bombs', loadAircraftSpec(DEV_STORES_SPEC_ID).stores), null, 'bombs')
    const held = withControls(w, w.player, { pitch: 0, roll: 0, yaw: 0, throttle: 0, fire: false, dropBomb: true })
    const after = advance(held, DT, still).world
    expect(after.combat.projectiles.filter((p) => p.kind === 'bomb')).toHaveLength(1)
    expect(after.combat.aircraft[after.player]!.stores).toEqual({ bombs: 1, rockets: 0 })
  })
})

describe('the swap end to end (Task 3)', () => {
  it('deck-quals flown in the Wildcat with both: the player flies the Wildcat, carrying 2 bombs and 6 rockets', () => {
    const bundle = bundleForScenario(withPlayerSpec(loadScenario('deck-quals'), 'f4f-wildcat'))
    const w = worldFromScenario(sortieBundle(bundle, 'both', loadAircraftSpec(DEV_STORES_SPEC_ID).stores), null, 'both')
    const player = w.aircraft.find((a) => a.id === w.player)!
    expect(player.spec.id).toBe('f4f-wildcat')
    expect(w.combat.aircraft[w.player]!.stores).toEqual({ bombs: 2, rockets: 6 })
  })
})
