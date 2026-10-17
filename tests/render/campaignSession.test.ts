import { describe, expect, it } from 'vitest'
import { INDEX_KEY, LEGACY_ROSTER_KEY, campaignKey, lifeline, validateCampaign, zeroCounts, type Campaign, type StoragePort } from '../../src/campaign/index.js'
import {
  SORTIE_END_OF, UNSCORED_LABEL, abandonReport, buildReport, buildShellCatalog, createDevCampaign, createSession, purgeLegacyRoster,
  unscoredReason, type PickerSection, type UnscoredInput,
} from '../../src/render/campaignSession.js'
import { SCENARIO_OPTIONS } from '../../src/render/titleScreen.js'
import { loadAircraftSpec, loadScenario } from '../../tools/content/load.js'
import { scenarioFacts, shippedCatalog } from '../fixtures/catalog.js'
import { NOW, fresh, mission } from '../campaign/helpers.js'
import { TARGET_TYPES, type TargetType } from '../../src/sim/weapons/targetType.js'

class MapPort implements StoragePort {
  readonly map = new Map<string, string>()
  failOn: ((key: string) => boolean) | null = null
  getItem(k: string): string | null { return this.map.get(k) ?? null }
  setItem(k: string, v: string): void { if (this.failOn?.(k)) throw new Error('QuotaExceededError'); this.map.set(k, v) }
  removeItem(k: string): void { this.map.delete(k) }
}

const clean: UnscoredInput = { section: 'noncampaign', devScenario: false, devRules: false, pilotIneligible: false, devTakeoff: false, god: false }
const sectionOf = (pool: string): PickerSection => (pool === 'training' ? 'training' : pool === 'single' ? 'single' : 'noncampaign')

describe('unscoredReason: when is a sortie not banked (plan F5B Task 2, A4)', () => {
  it('a clean campaign or non-campaign sortie is scored, even with Dev checked but unused', () => {
    expect(unscoredReason(clean)).toBeNull()
    expect(unscoredReason({ ...clean, section: 'campaign' })).toBeNull()
  })

  it.each([
    ['devScenario', 'dev-scenario'], ['devRules', 'dev-rules'], ['pilotIneligible', 'ineligible-pilot'],
    ['devTakeoff', 'dev-takeoff'], ['god', 'god-mode'],
  ] as const)('the single override %s flips it to %s', (key, reason) => {
    expect(unscoredReason({ ...clean, [key]: true })).toBe(reason)
  })

  it('Training and Single rows are always unscored, whatever else is true', () => {
    expect(unscoredReason({ ...clean, section: 'training' })).toBe('training')
    expect(unscoredReason({ ...clean, section: 'single', god: true })).toBe('single')
  })

  it('every scenario row has a defined outcome: the pool decides the section, only pooled non-dev rows are scored', () => {
    const scored = SCENARIO_OPTIONS.filter((o) => unscoredReason({ ...clean, section: sectionOf(o.pool), devScenario: o.dev }) === null)
    expect(scored.length).toBeGreaterThan(0) // an empty filter must not pass vacuously
    expect(scored.every((o) => o.pool === 'noncampaign' && !o.dev)).toBe(true)
    expect(scored.map((o) => o.value)).toEqual(SCENARIO_OPTIONS.filter((o) => o.pool === 'noncampaign' && !o.dev).map((o) => o.value))
  })

  it('every reason has player-facing text', () => {
    for (const reason of ['training', 'single', 'dev-scenario', 'dev-rules', 'ineligible-pilot', 'dev-takeoff', 'god-mode'] as const) {
      expect(UNSCORED_LABEL[reason].length).toBeGreaterThan(5)
    }
  })

  it('a dev campaign validates and is deterministic for equal inputs', () => {
    const a = createDevCampaign('us', { id: 'dev1', seed: 5 }, NOW)
    const b = createDevCampaign('us', { id: 'dev1', seed: 5 }, NOW)
    expect(a).toEqual(b)
    expect(validateCampaign(a).ok).toBe(true)
    expect(a.human.playerName).toBe('Dev')
  })
})

describe('the shell catalog (Task 3a)', () => {
  const loader = async (id: string) => loadScenario(id)
  const nationOf = (spec: string) => loadAircraftSpec(spec).side

  it('built from the scenario files equals the fixture catalog for every pooled row (pinned list)', async () => {
    const shell = await buildShellCatalog(SCENARIO_OPTIONS, loader, nationOf)
    expect(shell.map((m) => m.id)).toEqual([
      'water-quals', 'airfield-strike', 'convoy-strike', 'tank-buster', 'combat-air-patrol', 'scramble', 'single-combat',
      'flattop-hunt', 'escort', 'surigao-strait', 'field-patrol',
    ])
    expect(shell).toEqual(shippedCatalog())
    expect(scenarioFacts('field-patrol').nation).toBe('japanese')
  })

  it('and a Japanese campaign always has its lifeline, which is red without Field Patrol (the test can fail)', async () => {
    const shell = await buildShellCatalog(SCENARIO_OPTIONS, loader, nationOf)
    const ja = fresh('ja')
    expect(lifeline(ja, shell)?.mission.id).toBe('field-patrol')
    expect(lifeline(ja, shell.filter((m) => m.id !== 'field-patrol'))).toBeNull()
  })
})

describe('buildReport and the end mapping (Task 3b)', () => {
  const tag = (over: Partial<Record<TargetType, number>>): Record<TargetType, number> =>
    Object.fromEntries(TARGET_TYPES.map((t) => [t, over[t] ?? 0])) as Record<TargetType, number>
  const flight = { flightSeconds: 600, maxAltitudeM: 3000, maxTrueAirspeedMps: 150, landing: 'field' as const }
  const base = { sortieId: 'c:s1', end: 'landed' as const, success: true, tagCredits: tag({ fighter: 2, carrier: 1 }), friendlyKills: 0, friendlyFire: false, authoredBonus: 0, flight, badgeId: 'b' }

  it('counts come from the tag credits, one per score class', () => {
    const r = buildReport(base)
    expect(r.counts.fighter).toBe(2)
    expect(r.counts.carrier).toBe(1)
    expect(Object.keys(r.counts).length).toBe(13)
  })

  it('a friendly destruction is reported as destroyed; a damage warning alone is one warning', () => {
    expect(buildReport({ ...base, friendlyKills: 1, friendlyFire: true })).toMatchObject({ friendlyDestroyed: true, warnings: 0 })
    expect(buildReport({ ...base, friendlyFire: true })).toMatchObject({ friendlyDestroyed: false, warnings: 1 })
    expect(buildReport(base)).toMatchObject({ friendlyDestroyed: false, warnings: 0 })
  })

  it('every recovery outcome maps to a campaign end kind, and abandon reports nothing earned', () => {
    expect(SORTIE_END_OF).toEqual({ landed: 'landed', ditched: 'ditched', killed: 'killed', rescued: 'rescued', captured: 'captured' })
    expect(abandonReport('c:s1')).toMatchObject({ end: 'abandoned', success: false, counts: zeroCounts(), badgeId: null })
  })
})

describe('the session (Task 3c)', () => {
  const make = (port: StoragePort = new MapPort(), now = () => NOW) => {
    let n = 0
    return createSession({ port, now, newId: () => `camp${++n}`, newSeed: () => 7 })
  }
  const m = mission({ faction: 'us', authoredBonus: 0 })
  const launchArgs = (c: Campaign) => ({ pilotId: c.roster.live[0]!, mission: m, aircraft: { id: 'f6f-hellcat', advanced: false }, difficulty: 'normal' as const, loadout: 'clean', unscored: null })
  const landed = (id: string) => buildReport({ sortieId: id, end: 'landed', success: true, tagCredits: Object.fromEntries(TARGET_TYPES.map((t) => [t, t === 'fighter' ? 1 : 0])) as Record<TargetType, number>, friendlyKills: 0, friendlyFire: false, authoredBonus: 0, flight: { flightSeconds: 100, maxAltitudeM: 0, maxTrueAirspeedMps: 0, landing: 'field' }, badgeId: null })

  it('create saves through, lists, and survives a reopen', () => {
    const port = new MapPort()
    const s = make(port)
    const made = s.create({ faction: 'us', playerName: 'Mark' })
    expect(made.ok).toBe(true)
    expect(s.lastSave()).toEqual({ ok: true })
    expect(s.list()).toMatchObject({ ok: true, entries: [{ id: 'camp1', faction: 'us', playerName: 'Mark' }] })
    expect(s.lastPlayerName()).toBe('Mark')
    const again = make(port)
    expect(again.open('camp1').ok).toBe(true)
  })

  it('banks exactly once: a second bank of the same sortie changes nothing', () => {
    const s = make()
    s.create({ faction: 'us', playerName: 'Mark' })
    const c = s.current()!
    const launched = s.launch(launchArgs(c))
    expect(launched.ok).toBe(true)
    const id = s.current()!.pending!.sortieId
    const first = s.bank(landed(id))
    expect(first.ok).toBe(true)
    const after = s.current()!
    const second = s.bank(landed(id))
    expect(second.ok).toBe(false)
    expect(s.current()).toBe(after)
    expect(after.pending).toBeNull()
    expect(after.human.ledger.banked).toBe(1)
    expect(after.pilots[c.roster.live[0]!]!.points).toBe(1000) // 500 destruction + 500 Veteran bonus
  })

  // F5C D4/D5/D8/D11: one bank per landing, one close per sortie.
  describe('legs: two latches (a bank per landing, a close per sortie)', () => {
    const credits = (n: number) => Object.fromEntries(TARGET_TYPES.map((t) => [t, t === 'fighter' ? n : 0])) as Record<TargetType, number>
    const leg = (id: string, n: number, fighters: number) => ({
      ...buildReport({ sortieId: id, end: 'landed', success: false, tagCredits: credits(fighters), friendlyKills: 0, friendlyFire: false, authoredBonus: 0, flight: { flightSeconds: 100 * n, maxAltitudeM: 0, maxTrueAirspeedMps: 0, landing: 'field' }, badgeId: null }),
      leg: n, place: `Base ${n}`,
    })
    const open = (port: StoragePort = new MapPort()) => {
      const s = make(port)
      s.create({ faction: 'us', playerName: 'Mark' })
      s.launch(launchArgs(s.current()!))
      return { s, port, id: s.current()!.pending!.sortieId, pilotId: s.current()!.roster.live[0]! }
    }

    it('a double click on one landing banks it once; the next landing banks the next', () => {
      const { s, id, pilotId } = open()
      expect(s.bankLeg(leg(id, 1, 1)).ok).toBe(true)
      const after = s.current()!
      const second = s.bankLeg(leg(id, 1, 1))
      expect(second.ok).toBe(false)
      expect(s.current()).toBe(after) // not even a revision bump
      expect(after.pilots[pilotId]!.points).toBe(500)
      expect(s.bankLeg(leg(id, 2, 3)).ok).toBe(true)
      expect(s.current()!.pilots[pilotId]!.points).toBe(1500)
      expect(s.current()!.pending!.legs).toHaveLength(2)
    })

    it('a late render after the close banks nothing: the sortie is closed, the landing latch holds', () => {
      const { s, id, pilotId } = open()
      s.bankLeg(leg(id, 1, 1))
      expect(s.bank(buildReport({ sortieId: id, end: 'landed', success: false, tagCredits: credits(1), friendlyKills: 0, friendlyFire: false, authoredBonus: 0, flight: { flightSeconds: 100, maxAltitudeM: 0, maxTrueAirspeedMps: 0, landing: null }, badgeId: null })).ok).toBe(true)
      const closed = s.current()!
      expect(closed.pending).toBeNull()
      expect(s.bankLeg(leg(id, 2, 2)).ok).toBe(false)
      expect(s.bank(landed(id)).ok).toBe(false)
      expect(s.current()).toBe(closed)
      expect(closed.pilots[pilotId]).toMatchObject({ points: 500, sorties: 1, banked: 1 })
    })

    it('Abandon after a bank keeps the bank (D5)', () => {
      const { s, id, pilotId } = open()
      s.bankLeg(leg(id, 1, 2))
      expect(s.abandon().ok).toBe(true)
      expect(s.current()!.pilots[pilotId]).toMatchObject({ status: 'active', points: 1000 })
    })

    it('a tab closed after a bank is an abandonment on the next load: the bank stays, the pilot is not killed (D11)', () => {
      const { s, port, id, pilotId } = open()
      s.bankLeg(leg(id, 1, 2))
      const saved = make(port)
      expect(saved.open('camp1').ok).toBe(true)
      const c = saved.current()!
      expect(c.pending).toBeNull()
      expect(c.pilots[pilotId]).toMatchObject({ status: 'active', points: 1000, sorties: 1, banked: 1 })
      expect(c.human.log[0]!.legs).toEqual([{ place: 'Base 1', points: 1000 }])
      expect(c.human.stats.abandoned).toBe(1)
      // and not applied twice
      const again = make(port)
      again.open('camp1')
      expect(again.current()!.human.ledger.banked).toBe(1)
    })
  })

  it('abandon banks zero, the denominator ticked once at launch, the pilot lives', () => {
    const s = make()
    s.create({ faction: 'us', playerName: 'Mark' })
    const c = s.current()!
    s.launch(launchArgs(c))
    const r = s.abandon()
    expect(r.ok).toBe(true)
    const a = s.current()!
    expect(a.human.ledger).toMatchObject({ points: 0, sorties: 1, banked: 1 })
    expect(a.human.stats.abandoned).toBe(1)
    expect(a.roster.live).toEqual(c.roster.live)
  })

  it('refuses to launch a sortie that is not recorded (R12)', () => {
    const s = make()
    s.create({ faction: 'us', playerName: 'Mark' })
    const r = s.launch({ ...launchArgs(s.current()!), unscored: 'god-mode' })
    expect(r.ok).toBe(false)
    expect(s.current()!.pending).toBeNull()
  })

  it('a tab closed mid-sortie is one abandoned sortie, saved, and not applied again on the next load', () => {
    const port = new MapPort()
    const a = make(port)
    a.create({ faction: 'us', playerName: 'Mark' })
    a.launch(launchArgs(a.current()!))
    const b = make(port)
    const opened = b.open('camp1')
    expect(opened.ok).toBe(true)
    expect(b.current()!.human.stats.abandoned).toBe(1)
    const savedRevision = JSON.parse(port.map.get(campaignKey('camp1'))!).revision
    expect(savedRevision).toBe(b.current()!.revision)
    const c = make(port)
    c.open('camp1')
    expect(c.current()!.human.stats.abandoned).toBe(1)
    expect(c.current()!.human.ledger.banked).toBe(1)
  })

  it('a save that fails is reported and play continues in memory; nothing half-written', () => {
    const port = new MapPort()
    const s = make(port)
    s.create({ faction: 'us', playerName: 'Mark' })
    port.failOn = (k) => k === campaignKey('camp1')
    const r = s.launch(launchArgs(s.current()!))
    expect(r.ok).toBe(true)
    expect(s.lastSave()).toMatchObject({ ok: false })
    expect(s.current()!.pending).not.toBeNull()
  })

  it('the stale-revision guard refuses an older writer and says so', () => {
    const port = new MapPort()
    const a = make(port)
    a.create({ faction: 'us', playerName: 'Mark' })
    const b = make(port)
    b.open('camp1')
    // tab A moves on
    a.launch(launchArgs(a.current()!))
    a.abandon()
    // tab B (older) tries to write
    const stale = b.launch(launchArgs(b.current()!))
    expect(stale.ok).toBe(true)
    expect(b.lastSave()).toMatchObject({ ok: false })
    expect((b.lastSave() as { error: string }).error).toContain('another tab')
    const stored = JSON.parse(port.map.get(INDEX_KEY)!).campaigns[0]
    expect(stored.revision).toBe(a.current()!.revision)
  })

  it('import reports a clash and commitImport replaces; delete removes; the old roster key is purged once', () => {
    const port = new MapPort()
    const s = make(port)
    s.create({ faction: 'us', playerName: 'Mark' })
    const text = s.exportText()!
    const clash = s.importText(text)
    expect(clash).toMatchObject({ ok: true, conflict: { existingRevision: 0, incomingRevision: 0 } })
    const empty = make(new MapPort())
    expect(empty.importText(text)).toMatchObject({ ok: true, conflict: null })
    expect(s.remove('camp1')).toEqual({ ok: true })
    expect(s.list()).toEqual({ ok: true, entries: [] })
    port.map.set(LEGACY_ROSTER_KEY, '[]')
    purgeLegacyRoster(port)
    expect(port.map.has(LEGACY_ROSTER_KEY)).toBe(false)
  })
})
