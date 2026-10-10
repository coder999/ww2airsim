import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { parseLibraryEntry } from '../../src/render/hangar/library.js'
import { flyableAircraft } from '../../src/render/sortie/flyable.js'
import { SCENARIO_OPTIONS } from '../../src/render/titleScreen.js'
import {
  aircraftFor, defaultLoadout, devLayoutNote, initialDraft, loadoutsFor, reconcile, visibleScenarios, withAircraft, withScenario, type FlowContext,
} from '../../src/render/sortieFlow.js'

const library = readdirSync('content/library').map((f) => parseLibraryEntry(JSON.parse(readFileSync(`content/library/${f}`, 'utf8'))))
const specs = readdirSync('content/aircraft').filter((f) => f.endsWith('.json')).map((f) => loadAircraftSpec(f.slice(0, -5)))
const flyable = flyableAircraft(specs, library)
const ctx = (dev: boolean): FlowContext => ({ options: SCENARIO_OPTIONS, flyable, dev })
// The Zero now has dev-fitted stores of its own; a stores-less airplane is what these tests need.
const bareFlyable = flyable.map((f) => (f.spec.id === 'a6m2-zero' ? { ...f, spec: { ...f.spec, stores: undefined } } : f))
const bare = (dev: boolean): FlowContext => ({ options: SCENARIO_OPTIONS, flyable: bareFlyable, dev })
const ids = (xs: readonly { spec: { id: string } }[]) => xs.map((x) => x.spec.id).sort()

describe('the sortie form model (sortie spec, Navigation, A3)', () => {
  it('Dev off hides exactly the Dev rows', () => {
    const hidden = SCENARIO_OPTIONS.filter((o) => !visibleScenarios(ctx(false)).includes(o)).map((o) => o.value).sort()
    expect(hidden).toEqual(['damage-range', 'dev-mission-circuit', 'dev-mission-ui', 'friendly-fire-field', 'friendly-fire-range', 'furball-range', 'recovery-range', 'takeoff-range'])
    expect(visibleScenarios(ctx(true))).toEqual(SCENARIO_OPTIONS)
  })
  it('a carrier start offers the Hellcat, Wildcat and Corsair; Dev adds the Zero', () => {
    expect(ids(aircraftFor(ctx(false), 'deck-quals'))).toEqual(['f4f-wildcat', 'f4u-corsair', 'f6f-hellcat'])
    expect(ids(aircraftFor(ctx(true), 'deck-quals'))).toEqual(['a6m2-zero', 'b-17-flying-fortress', 'b-29-superfortress', 'd3a-val', 'f4f-wildcat', 'f4u-corsair', 'f6f-hellcat', 'g4m-betty', 'ki-21-sally', 'ki-43-oscar', 'ki-84-frank', 'p-38-lightning'])
    // Dev lists every spec, so the land-based B-17, B-29, G4M and P-38 (carrierCapable false) show here and only here.
  })
  it('a mission starts on its own aircraft and recommended loadout', () => {
    expect(initialDraft(ctx(false), 'combat-air-patrol')).toEqual({ scenarioId: 'combat-air-patrol', aircraftSpec: 'f6f-hellcat', loadout: 'clean' })
  })
  it('a range with no recommendation starts on both (SF-R4)', () => {
    expect(initialDraft(ctx(false), 'free-flight').loadout).toBe('both')
  })
  it('A3, mission change: resets the aircraft (SF-R5) and the loadout to the recommendation', () => {
    expect(withScenario(ctx(false), 'combat-air-patrol')).toEqual({ scenarioId: 'combat-air-patrol', aircraftSpec: 'f6f-hellcat', loadout: 'clean' })
  })
  it('A3, aircraft change keeps an allowed pick', () => {
    const d = { scenarioId: 'airfield-strike', aircraftSpec: 'f6f-hellcat', loadout: 'bombs' as const }
    expect(withAircraft(ctx(false), d, 'f4f-wildcat').loadout).toBe('bombs')
  })
  it('A3, aircraft change to a racks-only airplane falls back off a loadout it has no stations for (W1: the F4F-4 carries no rockets)', () => {
    const d = { scenarioId: 'airfield-strike', aircraftSpec: 'f6f-hellcat', loadout: 'rockets' as const }
    expect(withAircraft(ctx(false), d, 'f4f-wildcat').loadout).toBe(defaultLoadout(ctx(false), d.scenarioId, 'f4f-wildcat'))
    expect(withAircraft(ctx(false), d, 'f4f-wildcat').loadout).not.toBe('rockets')
  })
  it('A3, aircraft change: Dev allows every loadout on the Zero; without Dev it has only clean', () => {
    const d = { scenarioId: 'free-flight', aircraftSpec: 'f6f-hellcat', loadout: 'rockets' as const }
    expect(withAircraft(bare(true), d, 'a6m2-zero').loadout).toBe('rockets')
    expect(loadoutsFor(bare(false), 'a6m2-zero')).toEqual(['clean'])
    expect(withAircraft(bare(false), d, 'a6m2-zero').loadout).toBe('clean')
  })
  it('the P-38, with racks and rails like the Hellcat, offers the Hellcat\'s loadouts (P-38L onboarding)', () => {
    expect(loadoutsFor(ctx(true), 'p-38-lightning')).toEqual(loadoutsFor(ctx(true), 'f6f-hellcat'))
    expect(loadoutsFor(ctx(true), 'p-38-lightning')).toContain('rockets')
  })
  it('the Ki-43, with racks and no rails, offers Clean and Bombs (Ki-43-II onboarding)', () => {
    expect(loadoutsFor(ctx(true), 'ki-43-oscar')).toEqual(['clean', 'bombs'])
  })
  it('the Val, with one belly rack and no rails, offers Clean and Bombs (D3A onboarding)', () => {
    expect(loadoutsFor(ctx(true), 'd3a-val')).toEqual(['clean', 'bombs'])
  })
  it('the Ki-84, with racks and no rails, offers Clean and Bombs (Ki-84-Ia onboarding)', () => {
    expect(loadoutsFor(ctx(true), 'ki-84-frank')).toEqual(['clean', 'bombs'])
  })
  it('a bomber with racks and no rails offers Clean and Bombs, in Dev too', () => {
    expect(loadoutsFor(ctx(true), 'b-17-flying-fortress')).toEqual(['clean', 'bombs'])
    expect(loadoutsFor(ctx(true), 'b-29-superfortress')).toEqual(['clean', 'bombs'])
  })
  describe('reconcile after Dev is unchecked', () => {
    it('a Dev-only scenario falls back to the fallback id, with its defaults', () => {
      const d = { scenarioId: 'furball-range', aircraftSpec: 'a6m2-zero', loadout: 'rockets' as const }
      expect(reconcile(ctx(false), d, 'free-flight')).toEqual(initialDraft(ctx(false), 'free-flight'))
    })
    it('an enemy aircraft falls back to the scenario\'s own; the loadout is kept if allowed', () => {
      const d = { scenarioId: 'free-flight', aircraftSpec: 'a6m2-zero', loadout: 'rockets' as const }
      expect(reconcile(ctx(false), d, 'free-flight')).toEqual({ scenarioId: 'free-flight', aircraftSpec: 'f6f-hellcat', loadout: 'rockets' })
    })
    it('a saved Rockets draft on the Wildcat falls back to its default loadout (W1: no rockets)', () => {
      const d = { scenarioId: 'airfield-strike', aircraftSpec: 'f4f-wildcat', loadout: 'rockets' as const }
      const r = reconcile(ctx(false), d, 'free-flight')
      expect(r.loadout).not.toBe('rockets')
      expect(r.loadout).toBe(defaultLoadout(ctx(false), d.scenarioId, 'f4f-wildcat'))
    })
    it('a legal draft comes back as the same object', () => {
      const d = { scenarioId: 'airfield-strike', aircraftSpec: 'f4f-wildcat', loadout: 'bombs' as const }
      expect(reconcile(ctx(false), d, 'free-flight')).toBe(d)
    })
  })
  it('marks a Dev loadout the aircraft has no stations for, and nothing else', () => {
    expect(devLayoutNote(bare(true), 'a6m2-zero', 'bombs')).toBe('dev layout: Hellcat stations')
    expect(devLayoutNote(bare(true), 'f6f-hellcat', 'bombs')).toBeNull()
    expect(devLayoutNote(bare(true), 'a6m2-zero', 'clean')).toBeNull()
  })
})
