/**
 * The no-deadlock proof (F5A Task 10, the F5 acceptance gate): a campaign with five replacement Ensigns
 * can always reach an entry-rank non-campaign mission. Three layers, cheapest first. Each fails with a
 * message that names the state, and `mutation checks` below proves the proof can fail.
 */
import { describe, expect, it } from 'vitest'
import {
  bankSortie, checkInvariants, exportCampaign, importCampaign, launchSortie, lifeline, loadCampaign, missionLock,
  saveCampaign, zeroCounts, DEFAULT_POOLS, offers,
  type Campaign, type Faction, type MissionDescriptor, type SortieEndKind, type SortieReport,
} from '../../src/campaign/index.js'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { plannedCatalog, shippedCatalog } from '../fixtures/catalog.js'
import { makeCampaign, tierMultisets } from '../fixtures/campaign.js'
import { startWalk, walkRng, walkStep } from '../fixtures/walk.js'
import { NOW } from './helpers.js'

const FACTIONS: Faction[] = ['us', 'ja']
type Bank = typeof bankSortie

// ---- layer 1: the static catalog invariant ------------------------------------------------------

/** An entry-rank lifeline row: non-campaign, Ensign, day, uncoordinated, every airplane non-advanced and single-engine, own faction. */
const entryRank = (catalog: readonly MissionDescriptor[], f: Faction) => catalog.filter((m) =>
  m.faction === f && m.kind === 'noncampaign' && m.minTier === 1 && !m.night && !m.coordinated
  && m.aircraftIds.every((a) => loadAircraftSpec(a).engine.count === 1 && !(['p-38-lightning', 'b-17-flying-fortress', 'b-29-superfortress', 'g4m-betty', 'ki-21-sally', 'ki-57-ii-topsy'].includes(a))))

describe('layer 1: each faction ships an entry-rank non-campaign mission', () => {
  const catalog = shippedCatalog()
  const PINNED: Record<Faction, string[]> = {
    us: ['airfield-strike', 'combat-air-patrol', 'convoy-strike', 'scramble', 'single-combat', 'surigao-strait', 'tank-buster'],
    ja: ['field-patrol'],
  }
  it.each(FACTIONS)('%s: the entry-rank rows are exactly the pinned list, so an empty or widened filter fails', (f) => {
    expect(entryRank(catalog, f).map((m) => m.id).sort()).toEqual(PINNED[f])
  })
})

// ---- layer 2: the exhaustive abstract model check -------------------------------------------------

const multisets = tierMultisets

/** Every terminal outcome: SortieEndKind x success x difficulty x friendly destruction, without the combinations that are the same sortie (difficulty only matters on a success that is not forfeit). */
const OUTCOMES: { name: string; over: Partial<SortieReport>; difficulty: 'easy' | 'normal' | 'hard' }[] = (() => {
  const out: { name: string; over: Partial<SortieReport>; difficulty: 'easy' | 'normal' | 'hard' }[] = []
  const ends: SortieEndKind[] = ['landed', 'ditched', 'killed', 'rescued', 'captured', 'abandoned']
  for (const end of ends) for (const friendly of [false, true]) {
    out.push({ name: `${end}${friendly ? '+friendly' : ''} fail`, over: { end, success: false, friendlyDestroyed: friendly }, difficulty: 'easy' })
    if (end === 'landed' || end === 'ditched' || end === 'rescued') {
      for (const difficulty of friendly ? (['easy'] as const) : (['easy', 'normal', 'hard'] as const)) {
        out.push({ name: `${end}${friendly ? '+friendly' : ''} success ${difficulty}`, over: { end, success: true, friendlyDestroyed: friendly, authoredBonus: 100 }, difficulty })
      }
    }
  }
  return out
})()

type Proof = { states: number; outcomes: number; massLosses: number; failures: string[] }

function healthy(c: Campaign, catalog: readonly MissionDescriptor[], where: string, failures: string[]): void {
  const issues = checkInvariants(c)
  if (issues.length > 0) { failures.push(`${where}: invariants broken: ${issues.map((i) => i.name).join(', ')}`); return }
  const l = lifeline(c, catalog)
  if (l === null) { failures.push(`${where}: lifeline is null (no entry-rank non-campaign mission reachable)`); return }
  if (!missionLock(c, l.mission).open) { failures.push(`${where}: lifeline ${l.mission.id} is locked`); return }
  const r = launchSortie(c, { pilotId: l.pilotId, mission: l.mission, aircraft: { id: l.aircraftId, advanced: false }, difficulty: 'easy', loadout: 'clean', now: NOW })
  if (!r.ok) failures.push(`${where}: launching the lifeline ${l.mission.id} was refused: ${r.error.code}`)
}

/** The proof, parameterized so the mutation checks can feed it a broken catalog, pool or reducer. */
function proveNoDeadlock(catalog: readonly MissionDescriptor[], bank: Bank = bankSortie): Proof {
  const proof: Proof = { states: 0, outcomes: 0, massLosses: 0, failures: [] }
  const fail = (m: string) => { if (proof.failures.length < 25) proof.failures.push(m) }
  const local: string[] = []
  for (const faction of FACTIONS) for (let chapter = 0; chapter <= 6; chapter++) for (const tiers of multisets()) {
    const where = `${faction} chapter ${chapter} tiers [${tiers}]`
    proof.states++
    let c: Campaign
    try { c = makeCampaign({ faction, tiers, chapter }) } catch (e) { fail(`${where}: could not build the state: ${(e as Error).message}`); continue }
    local.length = 0
    healthy(c, catalog, where, local)
    for (const m of local) fail(m)
    if (local.length > 0) continue

    // every outcome for every distinct pilot tier on every mission class this pilot can launch
    const seenTier = new Set<number>()
    for (let slot = 0; slot < 5; slot++) {
      const pilot = c.pilots[c.roster.live[slot]!]!
      const tier = tiers[slot]!
      if (seenTier.has(tier)) continue
      seenTier.add(tier)
      const open = offers(c, catalog).filter((o) => o.pilots[slot]!.eligible).map((o) => o.mission)
      const classes = [open.find((m) => m.kind === 'noncampaign'), open.find((m) => m.kind === 'campaign')].filter((m): m is MissionDescriptor => m !== undefined)
      for (const mission of classes) {
        for (const o of OUTCOMES) {
          proof.outcomes++
          const label = `${where}, slot ${slot} (tier ${tier}) flies ${mission.id}: ${o.name}`
          try {
            const launched = launchSortie(c, { pilotId: pilot.id, mission, aircraft: { id: mission.aircraftIds[0]!, advanced: false }, difficulty: o.difficulty, loadout: 'clean', now: NOW })
            if (!launched.ok) { fail(`${label}: launch refused: ${launched.error.code}`); continue }
            const report: SortieReport = {
              sortieId: launched.value.pending!.sortieId, end: 'landed', success: false, counts: zeroCounts(), friendlyDestroyed: false, warnings: 0, authoredBonus: 0,
              flight: { flightSeconds: 60, maxAltitudeM: 100, maxTrueAirspeedMps: 50, landing: null }, badgeId: null, ...o.over,
            }
            const banked = bank(launched.value, report, NOW)
            if (!banked.ok) { fail(`${label}: bank refused: ${banked.error.code}`); continue }
            local.length = 0
            healthy(banked.value, catalog, label, local)
            for (const m of local) fail(m)
          } catch (e) { fail(`${label}: threw ${(e as Error).message}`) }
        }
      }
    }

    // mass loss: all five original pilots closed in consecutive sorties
    proof.massLosses++
    try {
      let m = c
      const originals = [...c.roster.live]
      for (const id of originals) {
        const slot = m.roster.live.indexOf(id)
        const mission = offers(m, catalog).find((o) => o.pilots[slot]!.eligible)?.mission
        if (mission === undefined) { fail(`${where}: mass loss: pilot ${id} can fly nothing`); break }
        const launched = launchSortie(m, { pilotId: id, mission, aircraft: { id: mission.aircraftIds[0]!, advanced: false }, difficulty: 'easy', loadout: 'clean', now: NOW })
        if (!launched.ok) { fail(`${where}: mass loss launch refused ${launched.error.code}`); break }
        const banked = bank(launched.value, {
          sortieId: launched.value.pending!.sortieId, end: 'killed', success: false, counts: zeroCounts(), friendlyDestroyed: false, warnings: 0, authoredBonus: 0,
          flight: { flightSeconds: 1, maxAltitudeM: 1, maxTrueAirspeedMps: 1, landing: null }, badgeId: null,
        }, NOW)
        if (!banked.ok) { fail(`${where}: mass loss bank refused ${banked.error.code}`); break }
        m = banked.value
      }
      local.length = 0
      healthy(m, catalog, `${where} after losing all five`, local)
      for (const x of local) fail(x)
      if (local.length === 0 && m.roster.live.some((id) => originals.includes(id))) fail(`${where}: an original pilot survived the mass loss`)
    } catch (e) { fail(`${where}: mass loss threw ${(e as Error).message}`) }
  }
  return proof
}

describe('layer 2: exhaustive over (faction, chapter 0..6, multiset of five tiers) = 3,528 states per catalog', () => {
  it('the state space is exactly 2 x 7 x 252', () => {
    expect(multisets()).toHaveLength(252)
    expect(FACTIONS.length * 7 * multisets().length).toBe(3528)
    expect(OUTCOMES.length).toBe(6 * 2 + 3 * (3 + 1))
  })

  const reports: Record<string, Proof> = {}
  it.each([['shipped', shippedCatalog], ['planned (shipped + GAMEPLAY.md\'s twelve chapters)', plannedCatalog]] as const)(
    '%s catalog: every outcome of every launchable pilot class, then a mass loss, keeps a lifeline',
    (name, build) => {
      const proof = proveNoDeadlock(build())
      reports[name] = proof
      console.log(`NO_DEADLOCK ${name}: ${proof.states} states, ${proof.outcomes} outcomes banked through the real bankSortie, ${proof.massLosses} mass losses, ${proof.failures.length} failures`)
      expect(proof.failures).toEqual([])
      expect(proof.states).toBe(3528)
      expect(proof.outcomes).toBeGreaterThan(100_000)
      expect(proof.massLosses).toBe(3528)
    },
    240_000,
  )

  // ---- the proof must be able to fail ----
  describe('mutation checks: each breakage turns the proof red with a named message', () => {
    it('removing the Japanese entry-rank mission from the catalog', () => {
      const proof = proveNoDeadlock(plannedCatalog().filter((m) => m.id !== 'field-patrol'))
      expect(proof.failures.length).toBeGreaterThan(0)
      expect(proof.failures[0]).toMatch(/^ja chapter \d tiers \[.*\]: lifeline is null/)
    }, 240_000)

    it('removing every American entry-rank mission from the catalog', () => {
      const keep = plannedCatalog().filter((m) => m.faction !== 'us' || m.minTier > 1 || m.kind === 'campaign' || m.night || m.coordinated || m.aircraftIds.includes('pby-5a-catalina'))
      const proof = proveNoDeadlock(keep)
      expect(proof.failures[0]).toMatch(/^us chapter \d tiers \[.*\]: lifeline is null/)
    }, 240_000)

    it('emptying the name pool', () => {
      const pool = DEFAULT_POOLS.ja
      const saved = [...pool.given]
      ;(pool.given as unknown as unknown[]).length = 0
      try {
        const proof = proveNoDeadlock(plannedCatalog())
        expect(proof.failures.length).toBeGreaterThan(0)
        expect(proof.failures.join('\n')).toMatch(/threw|could not build the state/)
      } finally {
        ;(pool.given as unknown as unknown[]).push(...saved)
      }
      expect(DEFAULT_POOLS.ja.given).toHaveLength(saved.length)
    }, 240_000)

    it('letting a closure skip the refill', () => {
      const skipRefill: Bank = (c, r, now) => {
        const out = bankSortie(c, r, now)
        if (!out.ok || r.end !== 'killed') return out
        const slot = out.value.roster.live.findIndex((id) => !c.roster.live.includes(id))
        const live = [...out.value.roster.live] as Campaign['roster']['live']
        live[slot] = c.pending!.pilotId // the dead pilot keeps the slot
        return { ok: true, value: { ...out.value, roster: { live } } }
      }
      const proof = proveNoDeadlock(plannedCatalog(), skipRefill)
      expect(proof.failures.length).toBeGreaterThan(0)
      expect(proof.failures.join('\n')).toMatch(/invariants broken: .*live-active/)
    }, 240_000)
  })
})

// ---- layer 3: seeded random walks on real campaigns -------------------------------------------------

describe('layer 3: 200 seeds x 400 steps of random play', () => {
  it('every step keeps the schema invariants and a lifeline; save/load and export/import in the middle change nothing', () => {
    const catalog = plannedCatalog()
    let steps = 0, closures = 0
    for (let seed = 1; seed <= 200; seed++) {
      const rng = walkRng(seed)
      let c = startWalk(seed % 2 === 0 ? 'us' : 'ja', seed)
      const port = new Map<string, string>()
      const io = { getItem: (k: string) => port.get(k) ?? null, setItem: (k: string, v: string) => void port.set(k, v), removeItem: (k: string) => void port.delete(k) }
      for (let step = 1; step <= 400; step++) {
        const before = Object.values(c.pilots).filter((p) => p.status !== 'active').length
        c = walkStep(c, rng, catalog)
        steps++
        closures += Object.values(c.pilots).filter((p) => p.status !== 'active').length - before
        const where = `seed ${seed} step ${step}`
        const issues = checkInvariants(c)
        if (issues.length > 0) expect.fail(`${where}: invariants: ${issues.map((i) => `${i.name}: ${i.message}`).join('; ')}`)
        if (lifeline(c, catalog) === null) expect.fail(`${where}: no lifeline (${c.faction}, chapter ${c.progress.completed.length})`)
        if (step % 61 === 0) {
          expect(saveCampaign(io, c), where).toEqual({ ok: true })
          const loaded = loadCampaign(io, c.id, NOW)
          expect(loaded.ok && loaded.campaign, where).toEqual(c)
          const text = exportCampaign(c)
          const imported = importCampaign(text)
          expect(imported.ok && imported.campaign, where).toEqual(c)
          expect(imported.ok && exportCampaign(imported.campaign), where).toBe(text)
          // continue from the imported copy: a round trip is not allowed to change play
          if (imported.ok) c = imported.campaign
        }
      }
    }
    console.log(`WALKS: ${steps} steps, ${closures} pilots lost`)
    expect(steps).toBe(80_000)
    expect(closures).toBeGreaterThan(5_000)
  }, 240_000)
})

