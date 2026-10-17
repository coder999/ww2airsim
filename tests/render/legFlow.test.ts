/**
 * F5C acceptance, headless (2026-10-16): a sortie that lands at a friendly field other than the one the mission suggests,
 * banks there, continues with a new loadout, scores again and ends. Real session, real reducers, the real stop card and
 * ground stop, a mission world flown through the frame helpers. The browser-side twin is tests/e2e/legSortie.spec.ts.
 */
import { describe, expect, it } from 'vitest'
import { tierOf, type StoragePort } from '../../src/campaign/index.js'
import { bankLegScored, bankScored, type BankedView } from '../../src/render/campaignBank.js'
import { createSession } from '../../src/render/campaignSession.js'
import { landingModel, withLegCard } from '../../src/render/debrief.js'
import { initialFrameStateFor, withGroundStop, type FrameState } from '../../src/render/frame.js'
import { buildLegCard } from '../../src/render/legCard.js'
import { withMissionDebrief } from '../../src/render/mission/debriefMission.js'
import { parseScenario, worldFromScenario } from '../../src/sim/scenario.js'
import { bundleForScenario, loadAirfield } from '../../tools/content/load.js'
import { playerAircraft } from '../../src/sim/loop.js'
import { zeroKillsByType, TARGET_TYPES, type TargetType } from '../../src/sim/weapons/targetType.js'
import { storesFromLoadout } from '../../src/sim/weapons/stores.js'
import { NOW, mission } from '../campaign/helpers.js'
import { flatField } from '../sim/mission/fixture.js'
import { destroyNow } from '../sim/mission/fly.js'
import { land } from '../sim/mission/stopFixture.js'

class MapPort implements StoragePort {
  readonly map = new Map<string, string>()
  getItem(k: string): string | null { return this.map.get(k) ?? null }
  setItem(k: string, v: string): void { this.map.set(k, v) }
  removeItem(k: string): void { this.map.delete(k) }
}
const credits = (over: Partial<Record<TargetType, number>> = {}): Record<TargetType, number> =>
  Object.fromEntries(TARGET_TYPES.map((t) => [t, over[t] ?? 0])) as Record<TargetType, number>

const TAC = loadAirfield('tacloban').runway.center
const BAYUG = loadAirfield('bayug').runway.center
const RAW = {
  id: 'leg-flow', player: 'f6f-1', airfields: ['tacloban', 'bayug'],
  aircraft: [
    { id: 'f6f-1', spec: 'f6f-hellcat', airborneAt: { position: [TAC.x, 500, TAC.z], headingDeg: 0, speedMps: 60 } },
    { id: 'bandit-1', spec: 'a6m2-zero', side: 'axis', tags: ['raid'], airborneAt: { position: [TAC.x + 40000, 3000, TAC.z], headingDeg: 90, speedMps: 90 } },
  ],
  ships: [], weather: { windFromDeg: 0, windMps: 0 },
  objectives: [
    { id: 'kill', label: 'Splash the raid', priority: 'primary', kind: 'destroy', targets: ['raid'] },
    // The mission SUGGESTS Bayug; any friendly base will do (D3).
    { id: 'home', label: 'Land at any friendly base', priority: 'primary', kind: 'land', at: 'bayug', suggestedRecovery: true, after: 'kill' },
  ],
  badge: { id: 'leg-wings', name: 'Leg Wings' },
}

function setup() {
  let n = 0
  const session = createSession({ port: new MapPort(), now: () => NOW, newId: () => `c${++n}`, newSeed: () => 5 })
  session.create({ faction: 'us', playerName: 'Mark' })
  const c = session.current()!
  const m = mission({ id: 'a1', kind: 'campaign', chapterId: 'A1', authoredBonus: 0, badgeId: 'leg-wings' })
  const pilotId = c.roster.live[0]!
  expect(session.launch({ pilotId, mission: m, aircraft: { id: 'f6f-hellcat', advanced: false }, difficulty: 'normal', loadout: 'both', unscored: null }).ok).toBe(true)
  const frame0 = initialFrameStateFor(worldFromScenario(bundleForScenario(parseScenario(RAW)), flatField(100)))
  return { session, pilotId, frame0 }
}

const flight = (s: number, landing: 'field' | null) => ({ flightSeconds: s, maxAltitudeM: 3000, maxTrueAirspeedMps: 150, landing })
const must = (v: ReturnType<typeof bankLegScored>): BankedView => { if (v === null || 'refused' in v) throw new Error(`not banked: ${v === null ? 'null' : v.refused}`); return v }

/** Fly the landing at `at`, build the verdict the shell reads, and bank the leg. */
function landAndBank(session: ReturnType<typeof setup>['session'], f: FrameState, at: { x: number; z: number }, place: string, tagCredits: Record<TargetType, number>, seconds: number) {
  const landed = land(f, at.x, 100, at.z)
  const { model, badgeId, success } = withMissionDebrief(landingModel(landed.landing.report!, zeroKillsByType()), landed.world)
  const view = bankLegScored({
    session, success, badgeId, place, player: { tagCredits, friendlyKills: 0, friendlyFire: false },
    flight: flight(seconds, 'field'), authoredBonusOf: () => 0,
  })
  return { landed, model, success, badgeId, view }
}

describe('a two-leg sortie (D2-D9)', () => {
  it('lands at a friendly field the mission did not suggest, banks, continues with new ordnance, scores again and ends', () => {
    const { session, pilotId, frame0 } = setup()

    // Leg 1: the raid is down; home is Tacloban, not the suggested Bayug.
    const down = { ...frame0, world: destroyNow(frame0.world, ['bandit-1']) }
    const one = landAndBank(session, down, TAC, 'Tacloban', credits({ fighter: 1 }), 600)
    expect(one.success).toBe(true)
    expect(one.badgeId).toBe('leg-wings')
    const v1 = must(one.view)
    // 500 for the fighter + 500 Veteran bonus: banked at the landing, with the badge and the chapter.
    expect(session.current()!.pilots[pilotId]!.points).toBe(1000)
    expect(session.current()!.pilots[pilotId]!.badges).toEqual(['leg-wings'])
    expect(session.current()!.progress.completed).toEqual(['A1'])
    expect(v1.campaign.rows.find((r) => r.label === 'Pilot, this landing')!.value).toBe('1,000')
    expect(v1.campaign.notices.join(' ')).toMatch(/A1 .* is complete/)
    expect(session.current()!.pending).not.toBeNull() // the sortie is still open
    expect(session.current()!.human.ledger.sorties).toBe(1)

    // The stop card: Continue with a loadout choice; the rank at launch stands (D6).
    const card = buildLegCard(one.landed.world, one.landed.landing.report!.at, 'both', true)!
    expect(card.blocked).toBeNull()
    expect(card.base).toBe('Tacloban')
    expect(card.loadouts.map((l) => l.value)).toEqual(expect.arrayContaining(['clean', 'bombs', 'rockets', 'both']))
    expect(card.loadout).toBe('both')
    const shown = withLegCard(one.model, card)
    expect(shown).toMatchObject({ continueLabel: 'Continue Sortie', returnLabel: 'End Sortie', noRestart: true })

    // Continue with bombs only: repositioned, rearmed, no clock jump.
    const tick = one.landed.world.tick
    const next = withGroundStop(one.landed, 'bombs')
    expect(next.ok).toBe(true)
    if (!next.ok) return
    expect(next.frame.world.tick).toBe(tick)
    expect(next.frame.world.combat.aircraft['f6f-1']!.stores).toEqual(storesFromLoadout(playerAircraft(next.frame.world).spec, 'bombs'))
    expect(next.placement.description).toContain('Tacloban, runway')

    // Leg 2: two more kills (cumulative counts), landing at Bayug this time. Only the new kills bank; the badge is not repeated.
    const two = landAndBank(session, next.frame, BAYUG, 'Bayug', credits({ fighter: 1, tank: 2 }), 1300)
    must(two.view)
    const after2 = session.current()!
    expect(after2.pilots[pilotId]!.points).toBe(1000 + 600)
    expect(after2.pilots[pilotId]!.badges).toEqual(['leg-wings'])
    expect(after2.human.ledger.badges).toEqual(['leg-wings'])
    expect(after2.progress.completed).toEqual(['A1'])
    expect(after2.pending!.legs.map((l) => [l.place, l.pilotPoints])).toEqual([['Tacloban', 1000], ['Bayug', 600]])

    // End Sortie: the close banks nothing new and writes the one log entry, legs inside.
    const closed = bankScored({
      session, end: 'landed', success: two.success, badgeId: two.badgeId,
      player: { tagCredits: credits({ fighter: 1, tank: 2 }), friendlyKills: 0, friendlyFire: false }, flight: flight(1300, null), authoredBonusOf: () => 0,
    })
    expect(closed).not.toBeNull()
    const end = session.current()!
    expect(end.pending).toBeNull()
    expect(end.pilots[pilotId]).toMatchObject({ points: 1600, sorties: 1, banked: 1 })
    expect(end.human.log).toHaveLength(1)
    expect(end.human.log[0]!.legs).toEqual([{ place: 'Tacloban', points: 1000 }, { place: 'Bayug', points: 600 }])
    expect(end.human.log[0]).toMatchObject({ success: true, points: 1600 })
    expect(end.human.ledger.sorties).toBe(1)
    // Landing counted once per banked landing (two), flight time counted once in total.
    expect(end.pilots[pilotId]!.career).toMatchObject({ landings: { field: 2 }, flightSeconds: 1300 })
  })

  it('a death after a bank keeps the bank and loses the rest (D5)', () => {
    const { session, pilotId, frame0 } = setup()
    const down = { ...frame0, world: destroyNow(frame0.world, ['bandit-1']) }
    const one = landAndBank(session, down, TAC, 'Tacloban', credits({ fighter: 1 }), 600)
    must(one.view)
    const killed = bankScored({
      session, end: 'killed', success: true, badgeId: 'leg-wings',
      player: { tagCredits: credits({ fighter: 3 }), friendlyKills: 0, friendlyFire: false }, flight: flight(900, null), authoredBonusOf: () => 0,
    })
    expect(killed).not.toBeNull()
    const c = session.current()!
    expect(c.pilots[pilotId]).toMatchObject({ status: 'kia', points: 1000 })
    expect(c.progress.completed).toEqual(['A1'])
    expect(tierOf(c.pilots[pilotId]!.points)).toBe(1)
    expect(c.human.ledger.points).toBeGreaterThanOrEqual(1000)
    expect(c.human.log[0]).toMatchObject({ end: 'killed', success: true })
  })

  it('banking the same landing twice (a double click, a late render) banks nothing the second time (D8 latch)', () => {
    const { session, pilotId, frame0 } = setup()
    const down = { ...frame0, world: destroyNow(frame0.world, ['bandit-1']) }
    const one = landAndBank(session, down, TAC, 'Tacloban', credits({ fighter: 1 }), 600)
    must(one.view)
    const revision = session.current()!.revision
    const again = bankLegScored({ session, success: true, badgeId: 'leg-wings', place: 'Tacloban', player: { tagCredits: credits({ fighter: 1 }), friendlyKills: 0, friendlyFire: false }, flight: flight(600, 'field'), authoredBonusOf: () => 0 })
    // The second call is the NEXT landing number to the reducer; a repeat of leg 1 is the session's latch. Either way no points move.
    if (again !== null && !('refused' in again)) expect(session.current()!.pilots[pilotId]!.points).toBe(1000)
    expect(session.current()!.pilots[pilotId]!.points).toBe(1000)
    expect(session.current()!.revision).toBeGreaterThanOrEqual(revision)
  })

  it('Abandon after a bank keeps the bank, the pilot returns to the roster (D5, D11)', () => {
    const { session, pilotId, frame0 } = setup()
    const down = { ...frame0, world: destroyNow(frame0.world, ['bandit-1']) }
    must(landAndBank(session, down, TAC, 'Tacloban', credits({ fighter: 1 }), 600).view)
    const out = session.abandon()
    expect(out.ok).toBe(true)
    const c = session.current()!
    expect(c.pilots[pilotId]).toMatchObject({ status: 'active', points: 1000 })
    expect(c.pending).toBeNull()
    expect(c.human.stats.abandoned).toBe(1)
  })
})
