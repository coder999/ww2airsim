import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  INDEX_KEY, LEGACY_ROSTER_KEY, PROFILE_KEY, campaignKey, deleteCampaign, digestOf, exportCampaign, exportFileName, importCampaign,
  bankSortie, launchSortie, listCampaigns, loadCampaign, loadProfile, saveCampaign, saveProfile, validateCampaign, zeroCounts,
  SCHEMA_VERSION, type Campaign, type SortieReport, type StoragePort,
} from '../../src/campaign/index.js'
import { canonicalStringify } from '../../src/flightRecorder/canonical.js'
import { plannedCatalog } from '../fixtures/catalog.js'
import { startWalk, walkRng, walkStep } from '../fixtures/walk.js'
import { NOW, fly, fresh, launch, mission } from './helpers.js'

class MapPort implements StoragePort {
  readonly map = new Map<string, string>()
  failOn: ((key: string) => boolean) | null = null
  getItem(k: string): string | null { return this.map.get(k) ?? null }
  setItem(k: string, v: string): void { if (this.failOn?.(k)) throw new Error('QuotaExceededError'); this.map.set(k, v) }
  removeItem(k: string): void { this.map.delete(k) }
}

const walked = (seed: number, steps: number): Campaign => {
  const catalog = plannedCatalog()
  const rng = walkRng(seed)
  let c = startWalk(seed % 2 === 0 ? 'us' : 'ja', seed)
  for (let i = 0; i < steps; i++) c = walkStep(c, rng, catalog)
  return c
}

describe('save / load round trip: a property over 200 seeded campaigns', () => {
  it('every walked campaign saves, loads equal, validates, and survives export -> import -> export byte for byte', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const c = walked(seed, 5 + (seed % 40))
      const port = new MapPort()
      expect(saveCampaign(port, c), `seed ${seed}`).toEqual({ ok: true })
      const back = loadCampaign(port, c.id, NOW)
      expect(back, `seed ${seed}`).toEqual({ ok: true, campaign: c })
      const text = exportCampaign(c)
      const imported = importCampaign(text)
      expect(imported.ok, `seed ${seed}`).toBe(true)
      if (!imported.ok) continue
      expect(imported.campaign, `seed ${seed}`).toEqual(c)
      expect(exportCampaign(imported.campaign), `seed ${seed}`).toBe(text)
      expect(validateCampaign(JSON.parse(text).campaign).ok).toBe(true)
    }
  })
})

describe('save and load', () => {
  it('stores one key per career and an index; two careers do not touch each other', () => {
    const port = new MapPort()
    const us = fresh('us', 'us1'), ja = fresh('ja', 'ja1')
    saveCampaign(port, us); saveCampaign(port, ja)
    expect([...port.map.keys()].sort()).toEqual([INDEX_KEY, campaignKey('ja1'), campaignKey('us1')].sort())
    const listed = listCampaigns(port)
    expect(listed.ok && listed.entries.map((e) => [e.id, e.faction, e.revision, e.points])).toEqual([['us1', 'us', 0, 0], ['ja1', 'ja', 0, 0]])
    // overwriting updates the entry, never duplicates it
    saveCampaign(port, fly(us, 0, mission(), { counts: { ...zeroCounts(), fighter: 1 } }))
    const again = listCampaigns(port)
    expect(again.ok && again.entries.map((e) => [e.id, e.revision, e.points])).toEqual([['ja1', 0, 0], ['us1', 2, 500]])
  })

  it('one corrupt career does not affect another, and the corrupt record is left untouched in storage', () => {
    const port = new MapPort()
    saveCampaign(port, fresh('us', 'good')); saveCampaign(port, fresh('ja', 'bad'))
    const damaged = port.map.get(campaignKey('bad'))!.replace('"faction":"ja"', '"faction":"zz"')
    port.map.set(campaignKey('bad'), damaged)
    const before = port.map.get(campaignKey('bad'))
    const bad = loadCampaign(port, 'bad', NOW)
    expect(bad.ok).toBe(false)
    expect(!bad.ok && bad.issues.join(' ')).toMatch(/faction/)
    expect(loadCampaign(port, 'good', NOW).ok).toBe(true)
    expect(port.map.get(campaignKey('bad'))).toBe(before)
  })

  it.each([
    ['not JSON', 'garbage{{{'],
    ['empty object', '{}'],
    ['an array (the old roster shape)', '[]'],
    ['a partial campaign', '{"format":"ww2airsim-campaign","schemaVersion":1,"id":"x"}'],
  ])('a %s blob returns ok:false and leaves storage untouched', (_n, blob) => {
    const port = new MapPort()
    port.map.set(campaignKey('x'), blob)
    const r = loadCampaign(port, 'x', NOW)
    expect(r.ok).toBe(false)
    expect(port.map.get(campaignKey('x'))).toBe(blob)
  })

  it('a schemaVersion newer than this build is refused with a message, not downgraded', () => {
    const port = new MapPort()
    const c = fresh('us', 'x')
    port.map.set(campaignKey('x'), JSON.stringify({ ...c, schemaVersion: SCHEMA_VERSION + 1 }))
    const r = loadCampaign(port, 'x', NOW)
    expect(!r.ok && r.issues[0]).toMatch(/newer version/)
    expect(JSON.parse(port.map.get(campaignKey('x'))!).schemaVersion).toBe(SCHEMA_VERSION + 1)
  })

  it('F5C D12: a version-1 campaign is refused with a message, left in storage, and listed (the index format did not change)', () => {
    const port = new MapPort()
    const c = fresh('us', 'old')
    saveCampaign(port, c)
    const v1 = JSON.stringify({ ...c, schemaVersion: 1 })
    port.map.set(campaignKey('old'), v1)
    const r = loadCampaign(port, 'old', NOW)
    expect(!r.ok && r.issues[0]).toMatch(/older version/)
    expect(port.map.get(campaignKey('old'))).toBe(v1)
    expect(listCampaigns(port)).toMatchObject({ ok: true, entries: [{ id: 'old' }] })
  })

  it('a record stored under the wrong key is refused (it would otherwise be loaded as someone else)', () => {
    const port = new MapPort()
    port.map.set(campaignKey('other'), canonicalStringify(fresh('us', 'x')))
    const r = loadCampaign(port, 'other', NOW)
    expect(!r.ok && r.issues[0]).toMatch(/belongs to campaign "x"/)
  })

  it('a quota failure surfaces as ok:false, naming the cause, and never throws', () => {
    const port = new MapPort()
    port.failOn = () => true
    const r = saveCampaign(port, fresh())
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toMatch(/storage full or blocked.*QuotaExceededError/)
    // the index fails but the campaign write succeeded: also reported
    const p2 = new MapPort(); p2.failOn = (k) => k === INDEX_KEY
    const r2 = saveCampaign(p2, fresh())
    expect(!r2.ok && r2.error).toMatch(/list could not be updated/)
  })

  it('a damaged index is reported and never overwritten by a one-entry list', () => {
    const port = new MapPort()
    saveCampaign(port, fresh('us', 'a'))
    port.map.set(INDEX_KEY, 'not json')
    const r = saveCampaign(port, fresh('ja', 'b'))
    expect(r.ok).toBe(false)
    expect(port.map.get(INDEX_KEY)).toBe('not json')
    expect(port.map.has(campaignKey('b'))).toBe(false)
  })

  it('a sortie left pending resolves as an abandonment at load (D7), and the stored bytes are not rewritten', () => {
    const port = new MapPort()
    const pending = launch(fresh('us', 'p'), 0, mission())
    saveCampaign(port, pending)
    const stored = port.map.get(campaignKey('p'))
    const r = loadCampaign(port, 'p', NOW)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.campaign.pending).toBeNull()
    expect(r.campaign.human.stats.abandoned).toBe(1)
    expect(r.campaign.human.ledger.sorties).toBe(1) // the denominator ticked at launch and stays
    expect(port.map.get(campaignKey('p'))).toBe(stored)
  })

  it('delete removes the key and the entry', () => {
    const port = new MapPort()
    saveCampaign(port, fresh('us', 'a')); saveCampaign(port, fresh('ja', 'b'))
    expect(deleteCampaign(port, 'a')).toEqual({ ok: true })
    const l = listCampaigns(port)
    expect(l.ok && l.entries.map((e) => e.id)).toEqual(['b'])
    expect(port.map.has(campaignKey('a'))).toBe(false)
  })

  it('the profile holds a remembered name and nothing else; bad data falls back, never throws', () => {
    const port = new MapPort()
    expect(loadProfile(port)).toEqual({ schemaVersion: 1 })
    expect(saveProfile(port, { schemaVersion: 1, lastPlayerName: 'Mark' })).toEqual({ ok: true })
    expect(loadProfile(port)).toEqual({ schemaVersion: 1, lastPlayerName: 'Mark' })
    port.map.set(PROFILE_KEY, '{"schemaVersion":1,"score":9}')
    expect(loadProfile(port)).toEqual({ schemaVersion: 1 })
  })

  it('never reads or writes the discarded roster key (D1): nothing under that key survives a full workout', () => {
    const port = new MapPort()
    port.map.set(LEGACY_ROSTER_KEY, '[{"id":"old"}]')
    const c = fly(fresh('us', 'z'), 0, mission(), {})
    saveCampaign(port, c); loadCampaign(port, 'z', NOW); listCampaigns(port); deleteCampaign(port, 'z'); loadProfile(port)
    expect(port.map.get(LEGACY_ROSTER_KEY)).toBe('[{"id":"old"}]')
    expect(listCampaigns(port)).toEqual({ ok: true, entries: [] })
    const source = readFileSync(new URL('../../src/campaign/storage.ts', import.meta.url), 'utf8')
    expect(source.match(/LEGACY_ROSTER_KEY/g)).toHaveLength(1) // declared, documented, never used
  })
})

describe('export / import', () => {
  it('exports sorted-key canonical JSON with a digest and no clock; the file name carries the date', () => {
    const c = fresh('us', 'e1')
    const body = JSON.parse(exportCampaign(c))
    expect(Object.keys(body)).toEqual(['campaign', 'digest', 'format', 'schemaVersion', 'scoringRulesVersion'])
    expect(body.digest).toBe(digestOf(c))
    expect(exportCampaign(c)).not.toMatch(/\d{4}-\d{2}-\d{2}T/)
    expect(exportFileName(c, '2026-10-14')).toBe('ww2airsim-american-e1-r0-2026-10-14.json')
    expect(exportCampaign(c)).toBe(exportCampaign(JSON.parse(JSON.stringify(c))))
  })

  it('a bare roster.v1 array is rejected with a message (D1): it is not a campaign', () => {
    const r = importCampaign('[{"id":"abc","name":"Old Pilot","rank":{"abbrev":"ENS"},"cumulativeScore":0}]')
    expect(r.ok).toBe(false)
    expect(!r.ok && r.issues[0]).toMatch(/pre-campaign pilot roster \(ww2airsim\.roster\.v1\)/)
  })

  it.each([
    ['not JSON', 'nope', /not valid JSON/],
    ['a JSON number', '4', /not a campaign export/],
    ['another format', '{"format":"other"}', /not a ww2airsim campaign export/],
    ['no version', '{"format":"ww2airsim-campaign"}', /no schemaVersion/],
    ['a newer schema', '{"format":"ww2airsim-campaign","schemaVersion":9}', /newer version/],
    ['an older schema (F5C: no migration)', '{"format":"ww2airsim-campaign","schemaVersion":1}', /older version/],
  ])('rejects %s with an actionable message', (_n, text, pattern) => {
    const r = importCampaign(text)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.issues.join(' ')).toMatch(pattern)
  })

  it('a damaged export is refused: a changed point, and a changed digest', () => {
    const c = fresh('us', 'e2')
    const body = JSON.parse(exportCampaign(c))
    body.campaign.human.ledger.points = 5
    const r = importCampaign(JSON.stringify(body))
    expect(!r.ok && r.issues.join(' ')).toMatch(/digest does not match/)
    const body2 = JSON.parse(exportCampaign(c)); body2.digest = '0'.repeat(16)
    expect(importCampaign(JSON.stringify(body2)).ok).toBe(false)
  })

  it('lists EVERY issue of an invalid campaign, not just the first', () => {
    const c = fresh('us', 'e3')
    const body = JSON.parse(exportCampaign(c))
    body.campaign.roster.live[1] = body.campaign.roster.live[0]
    body.campaign.pilots[body.campaign.roster.live[2]].status = 'kia'
    body.campaign.pilots[body.campaign.roster.live[2]].closure = { sortieId: 's', at: 'x', reason: 'kia', missionId: null }
    const r = importCampaign(JSON.stringify(body))
    expect(r.ok).toBe(false)
    const text = !r.ok ? r.issues.join('\n') : ''
    expect(text).toMatch(/live-unique/)
    expect(text).toMatch(/live-active/)
  })

  it('D4: import adds a career; the same id returns both revisions and does not decide', () => {
    const c = fresh('us', 'dup')
    const text = exportCampaign(fly(c, 0, mission(), {}))
    const added = importCampaign(text)
    expect(added).toMatchObject({ ok: true, conflict: null })
    const clash = importCampaign(text, { dup: 0, other: 7 })
    expect(clash).toMatchObject({ ok: true, conflict: { existingRevision: 0, incomingRevision: 2 } })
    // equal revisions are still reported: the shell decides
    expect(importCampaign(text, { dup: 2 })).toMatchObject({ ok: true, conflict: { existingRevision: 2, incomingRevision: 2 } })
  })
})

describe('save size (localStorage is about 5 MiB per origin, shared by every career and setting)', () => {
  const FAT_COUNTS = Object.fromEntries(Object.keys(zeroCounts()).map((k) => [k, 12])) as ReturnType<typeof zeroCounts>
  const TYPICAL_COUNTS = { ...zeroCounts(), fighter: 2, building: 3 }

  /** One launch + bank through the real reducers. */
  function flyOne(c: Campaign, slot: number, m: ReturnType<typeof mission>, over: Partial<SortieReport>, counts: SortieReport['counts']): Campaign {
    const l = launchSortie(c, { pilotId: c.roster.live[slot]!, mission: m, aircraft: { id: m.aircraftIds[0]!, advanced: false }, difficulty: 'hard', loadout: 'bombs-and-rockets', now: NOW })
    if (!l.ok) throw new Error(l.error.message)
    const r: SortieReport = {
      sortieId: l.value.pending!.sortieId, end: 'landed', success: true, counts, friendlyDestroyed: false, warnings: 1, authoredBonus: 2500,
      flight: { flightSeconds: 3600, maxAltitudeM: 9000, maxTrueAirspeedMps: 190, landing: 'field' }, badgeId: m.badgeId, ...over,
    }
    const b = bankSortie(l.value, r, NOW)
    if (!b.ok) throw new Error(b.error.message)
    return b.value
  }

  /** Every cap reached through the real reducers: `deaths` closed dossiers of a full 50-entry log, five live pilots at 200, the human at 500. */
  function career(faction: 'us' | 'ja', deaths: number, counts: SortieReport['counts'], longIds: boolean): Campaign {
    const m = mission({
      id: longIds ? 'convoy-strike-with-a-long-mission-identifier' : 'scramble', faction, aircraftIds: [faction === 'us' ? 'f6f-hellcat' : 'a6m2-zero'],
      authoredBonus: 2500, badgeId: longIds ? 'a-long-badge-identifier-for-a-mission' : 'scramble',
    })
    let c = startWalk(faction, 99)
    for (let d = 0; d < deaths; d++) {
      for (let s = 0; s < 49; s++) c = flyOne(c, 0, m, {}, counts)
      c = flyOne(c, 0, m, { end: 'killed', success: false, flight: { flightSeconds: 3600, maxAltitudeM: 9000, maxTrueAirspeedMps: 190, landing: null } }, counts)
    }
    for (let s = 0; s < 205; s++) for (let slot = 0; slot < 5; slot++) c = flyOne(c, slot, m, {}, counts)
    return c
  }

  const measure = (c: Campaign) => {
    const text = canonicalStringify(c)
    return { chars: text.length, bytes: new TextEncoder().encode(text).length, pilots: Object.keys(c.pilots).length }
  }

  it('the capped worst case (5 live x 200, 100 archived x 50, human 500; every class counted, long ids) fits one origin quota; typical and long careers are far smaller', () => {
    const rows: Record<string, ReturnType<typeof measure>> = {}
    for (const f of ['us', 'ja'] as const) {
      const worst = career(f, 100, FAT_COUNTS, true)
      expect(validateCampaign(worst).ok).toBe(true)
      expect(Math.min(...worst.roster.live.map((id) => worst.pilots[id]!.log.length))).toBe(200)
      expect(Math.max(...Object.values(worst.pilots).filter((p) => !worst.roster.live.includes(p.id)).map((p) => p.log.length))).toBe(50)
      expect(worst.human.log).toHaveLength(500)
      rows[`${f} worst case (100 deaths)`] = measure(worst)
      rows[`${f} long career (20 deaths, typical sorties)`] = measure(career(f, 20, TYPICAL_COUNTS, false))
      rows[`${f} new career (5 pilots, nothing flown)`] = measure(startWalk(f, 1))
    }
    for (const [name, m] of Object.entries(rows)) {
      if (name.includes('worst')) { expect(m.chars, name).toBeLessThan(4_000_000); expect(m.bytes, name).toBeLessThan(4_500_000) }
      if (name.includes('long career')) expect(m.chars, name).toBeLessThan(1_500_000)
      if (name.includes('new career')) expect(m.chars, name).toBeLessThan(10_000)
    }
    console.log('SAVE_SIZES', JSON.stringify(rows))
  })
})
