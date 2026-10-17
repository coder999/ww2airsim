/**
 * F5C Task 7 (2026-10-16): the stop card and the leg-aware ledger. `buildLegCard` is what the debrief draws,
 * `bankLegScored` what its Campaign Ledger says, `logRow` (via the dossier model) what the mission log shows.
 */
import { describe, expect, it } from 'vitest'
import { PILOT_TIER_POINTS, type StoragePort } from '../../src/campaign/index.js'
import { bankLegScored } from '../../src/render/campaignBank.js'
import { createSession } from '../../src/render/campaignSession.js'
import { landingModel, withLegCard } from '../../src/render/debrief.js'
import { commanderDossierModel, pilotDossierModel } from '../../src/render/hq/model.js'
import { buildLegCard } from '../../src/render/legCard.js'
import { parseScenario, worldFromScenario } from '../../src/sim/scenario.js'
import { bundleForScenario, loadScenarioBundle } from '../../tools/content/load.js'
import { zeroKillsByType, TARGET_TYPES, type TargetType } from '../../src/sim/weapons/targetType.js'
import { zeroCounts } from '../../src/campaign/index.js'
import { NOW, mission } from '../campaign/helpers.js'
import { shippedCatalog } from '../fixtures/catalog.js'
import { flatField } from '../sim/mission/fixture.js'

class MapPort implements StoragePort {
  readonly map = new Map<string, string>()
  getItem(k: string): string | null { return this.map.get(k) ?? null }
  setItem(k: string, v: string): void { this.map.set(k, v) }
  removeItem(k: string): void { this.map.delete(k) }
}
const credits = (over: Partial<Record<TargetType, number>> = {}): Record<TargetType, number> =>
  Object.fromEntries(TARGET_TYPES.map((t) => [t, over[t] ?? 0])) as Record<TargetType, number>

describe('buildLegCard', () => {
  const bay = (): ReturnType<typeof worldFromScenario> => worldFromScenario(loadScenarioBundle('water-quals'), flatField(0))
  const open = { kind: 'water', id: 'open-water', name: 'Open water' } as const

  it('a Catalina at San Pedro Bay: Continue is offered with the loadouts the aircraft allows, the flown one preselected', () => {
    const card = buildLegCard(bay(), open, 'clean', false)!
    expect(card).toMatchObject({ base: 'San Pedro Bay', blocked: null, loadout: 'clean', placement: 'San Pedro Bay, on the water' })
    expect(card.loadouts.map((l) => l.value)).toContain('clean')
    expect(card.loadouts.length).toBeGreaterThan(0)
  })

  it('a torpedo airplane\'s racks are called Torpedo, not Bombs (D3 T1)', () => {
    const w = worldFromScenario(loadScenarioBundle('flattop-hunt'), flatField(0))
    const player = w.aircraft.find((a) => a.id === w.player)!
    expect(player.spec.id).toBe('tbm-3-avenger')
    const deck = w.ships.find((s) => s.id === 'cv-1')!
    const card = buildLegCard({ ...w, aircraft: w.aircraft.map((a) => (a.id === w.player ? { ...a, state: { ...a.state, position: { x: deck.state.position.x, y: 19, z: deck.state.position.z } } } : a)) },
      { kind: 'carrier', id: 'cv-1', name: 'cv-1' }, 'bombs', false)
    expect(card?.loadouts.find((l) => l.value === 'bombs')?.label).toBe('Torpedo')
  })

  it('a stop away from every friendly base has no card (the sortie ends as before)', () => {
    const w = worldFromScenario(loadScenarioBundle('aa-range'), null)
    expect(buildLegCard(w, { kind: 'airfield', id: 'tacloban', name: 'Tacloban' }, 'both', false)).toBeNull()
    expect(buildLegCard(w, null, 'both', false)).toBeNull()
  })

  it('an unsafe water spot is a card with End Sortie only, and the reason', () => {
    const w = bay()
    const p = w.aircraft.find((a) => a.id === w.player)!.state.position
    const raw = { ...loadScenarioBundle('water-quals').scenario, ships: [{ id: 'cv-1', spec: 'essex-cv', side: 'allied', waypoints: [[p.x + 100, p.z]], speedMps: 0 }] }
    const withShip = worldFromScenario(bundleForScenario(parseScenario(JSON.parse(JSON.stringify(raw)))), flatField(0))
    const card = buildLegCard(withShip, open, 'clean', false)!
    expect(card.blocked).toMatch(/Too close to/)
    expect(card.placement).toBeNull()
    const model = withLegCard(landingModel({ touchdownSinkMps: 1, touchdownSpeedMps: 30, rollOutM: 300, tick: 1, at: open }, zeroKillsByType()), card)
    expect(model.continueLabel).toBeUndefined()
    expect(model.returnLabel).toBe('End Sortie')
    expect(model.detail).toMatch(/End the sortie here/)
  })
})

describe('withLegCard', () => {
  it('turns the landing into a stop card: Continue Sortie and End Sortie, no Restart', () => {
    const base = landingModel({ touchdownSinkMps: 1, touchdownSpeedMps: 30, rollOutM: 300, tick: 1, at: { kind: 'airfield', id: 'tacloban', name: 'Tacloban' } }, zeroKillsByType())
    expect(base.continueLabel).toBe('Continue')
    const card = { base: 'Tacloban', placement: 'Tacloban, runway 36', blocked: null, loadouts: [{ value: 'clean', label: 'Clean' }], loadout: 'clean' }
    const shown = withLegCard(base, card)
    expect(shown).toMatchObject({ continueLabel: 'Continue Sortie', returnLabel: 'End Sortie', noRestart: true, leg: card })
    expect(shown.detail).toMatch(/Tacloban/)
    expect(shown.outcome).toBe('landed')
  })
})

describe('the Campaign Ledger at a landing (D4, D6)', () => {
  function bankedLeg(points: number, m = mission({ id: 'a1', kind: 'campaign', chapterId: 'A1', authoredBonus: points, badgeId: 'b' })) {
    let n = 0
    const session = createSession({ port: new MapPort(), now: () => NOW, newId: () => `c${++n}`, newSeed: () => 5 })
    session.create({ faction: 'us', playerName: 'Mark' })
    const pilotId = session.current()!.roster.live[0]!
    session.launch({ pilotId, mission: m, aircraft: { id: 'f6f-hellcat', advanced: false }, difficulty: 'easy', loadout: 'both', unscored: null })
    const view = bankLegScored({
      session, success: true, badgeId: 'b', place: 'Tacloban', player: { tagCredits: credits({ fighter: 1 }), friendlyKills: 0, friendlyFire: false },
      flight: { flightSeconds: 600, maxAltitudeM: 3000, maxTrueAirspeedMps: 150, landing: 'field' }, authoredBonusOf: () => points,
    })
    if (view === null || 'refused' in view) throw new Error('no leg banked')
    return { session, pilotId, view }
  }

  it('shows this landing\'s bank, the sortie so far, the chapter, and says the banked points stay', () => {
    const { view } = bankedLeg(0)
    const labels = view.campaign.rows.map((r) => r.label)
    expect(labels).toEqual(expect.arrayContaining(['This landing (first)', 'Pilot, this landing', 'Pilot, sortie so far', 'Commander total', 'Adjusted score']))
    expect(view.campaign.rows.find((r) => r.label === 'Destruction')!.value).toBe('500')
    expect(view.campaign.chapterLine).toBe('A1 Over the Beaches')
    expect(view.campaign.notices.join(' ')).toMatch(/banked and stay banked/)
    expect(view.campaign.notices.join(' ')).toMatch(/A1 Over the Beaches is complete/)
    expect(view.promotedTo).toBeUndefined()
  })

  it('a promotion is announced at the landing, but the rank stays the launch rank until the next sortie (D6)', () => {
    const { view, pilotId, session } = bankedLeg(PILOT_TIER_POINTS[1]!)
    expect(view.promotedTo).toBe('Lieutenant (junior grade)')
    expect(view.promotedTier).toEqual({ faction: 'us', tier: 2 })
    expect(view.campaign.pilotLine).toContain('Ensign') // flown, and still shown, as an Ensign
    expect(view.campaign.notices.join(' ')).toMatch(/takes effect from the next sortie/)
    // The sortie\'s launch facts do not change when the pilot is promoted mid-sortie.
    expect(session.current()!.pending!.facts).toMatchObject({ aircraft: 'f6f-hellcat', loadout: 'both' })
    expect(session.current()!.pending!.pilotId).toBe(pilotId)
  })
})

describe('the mission log shows the legs inside one entry (D10)', () => {
  it('a closed sortie\'s dossier row lists its landings, the commander\'s too', () => {
    let n = 0
    const session = createSession({ port: new MapPort(), now: () => NOW, newId: () => `c${++n}`, newSeed: () => 5 })
    session.create({ faction: 'us', playerName: 'Mark' })
    const c0 = session.current()!
    const pilotId = c0.roster.live[0]!
    session.launch({ pilotId, mission: mission(), aircraft: { id: 'f6f-hellcat', advanced: false }, difficulty: 'easy', loadout: 'both', unscored: null })
    const flight = { flightSeconds: 600, maxAltitudeM: 3000, maxTrueAirspeedMps: 150, landing: 'field' as const }
    for (const [leg, place, fighters] of [[1, 'Tacloban', 1], [2, 'Essex', 2]] as const) {
      const s = session.current()!.pending!.sortieId
      const r = session.bankLeg({ sortieId: s, leg, place, end: 'landed', success: false, counts: { ...zeroCounts(), fighter: fighters }, friendlyDestroyed: false, warnings: 0, authoredBonus: 0, flight, badgeId: null })
      expect(r.ok).toBe(true)
    }
    session.abandon()
    const c = session.current()!
    const label = (id: string) => id
    const pilot = pilotDossierModel(c, c.pilots[pilotId]!, label, label)
    expect(pilot.log).toHaveLength(1)
    expect(pilot.log[0]!.legs).toBe('Tacloban +500 · Essex +500')
    const human = commanderDossierModel(c, shippedCatalog(), label, label)
    expect(human.log).toHaveLength(1) // one entry per sortie, not per landing
    expect(human.log[0]!.legs).toBe('Tacloban +500 · Essex +500')
    expect(human.record.find(([k]) => k === 'Sorties launched')![1]).toBe('1')
  })
})
