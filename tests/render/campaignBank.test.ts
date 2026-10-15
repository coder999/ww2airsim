import { describe, expect, it } from 'vitest'
import { PILOT_TIER_POINTS, type StoragePort } from '../../src/campaign/index.js'
import { bankScored, type BankInput } from '../../src/render/campaignBank.js'
import { createSession } from '../../src/render/campaignSession.js'
import { TARGET_TYPES, type TargetType } from '../../src/sim/weapons/targetType.js'
import { NOW, mission } from '../campaign/helpers.js'

class MapPort implements StoragePort {
  readonly map = new Map<string, string>()
  failOn: ((key: string) => boolean) | null = null
  getItem(k: string): string | null { return this.map.get(k) ?? null }
  setItem(k: string, v: string): void { if (this.failOn?.(k)) throw new Error('QuotaExceededError'); this.map.set(k, v) }
  removeItem(k: string): void { this.map.delete(k) }
}
const credits = (over: Partial<Record<TargetType, number>> = {}): Record<TargetType, number> =>
  Object.fromEntries(TARGET_TYPES.map((t) => [t, over[t] ?? 0])) as Record<TargetType, number>

function setup(port: StoragePort = new MapPort(), slot = 0, m = mission({ authoredBonus: 0 })) {
  let n = 0
  const session = createSession({ port, now: () => NOW, newId: () => `c${++n}`, newSeed: () => 5 })
  session.create({ faction: 'us', playerName: 'Mark' })
  const c = session.current()!
  const launched = session.launch({ pilotId: c.roster.live[slot]!, mission: m, aircraft: { id: 'f6f-hellcat', advanced: false }, difficulty: 'normal', loadout: 'clean', unscored: null })
  expect(launched.ok).toBe(true)
  const input = (over: Partial<BankInput> = {}): BankInput => ({
    session, end: 'landed', success: true, badgeId: null, player: { tagCredits: credits({ fighter: 2 }), friendlyKills: 0, friendlyFire: false },
    flight: { flightSeconds: 600, maxAltitudeM: 3000, maxTrueAirspeedMps: 150, landing: 'field' }, authoredBonusOf: () => 0, ...over,
  })
  return { session, input, pilotId: c.roster.live[slot]! }
}
const view = (v: ReturnType<typeof bankScored>) => { if (v === null || 'refused' in v) throw new Error('not banked'); return v }

describe('banking a finished campaign sortie (plan F5B Task 10)', () => {
  it('banks once: the ledger lines come from the banked entry, and a second call banks nothing', () => {
    const { session, input, pilotId } = setup()
    const first = view(bankScored(input()))
    expect(first.bankedTotal).toBe(1500) // two fighters (1,000) plus the Veteran bonus (500)
    expect(first.campaign.rows.map((r) => r.label)).toEqual(expect.arrayContaining(['Destruction', 'Difficulty bonus', 'Completion bonus', 'Commander total', 'Adjusted score']))
    expect(first.campaign.rows.find((r) => r.label === 'Destruction')!.value).toBe('1,000')
    expect(first.campaign.rows.find((r) => r.label === 'Difficulty bonus')!.value).toBe('500')
    const after = session.current()!
    expect(after.pending).toBeNull()
    expect(bankScored(input())).toBeNull()
    expect(session.current()).toBe(after)
    expect(after.pilots[pilotId]!.points).toBe(1500)
    expect(after.human.ledger.banked).toBe(1)
  })

  it('a death archives the pilot, names the replacement, earns no promotion and never reports success', () => {
    const { session, input, pilotId } = setup()
    const v = view(bankScored(input({ end: 'killed', success: true })))
    const c = session.current()!
    expect(c.pilots[pilotId]!.status).toBe('kia')
    expect(c.roster.live).not.toContain(pilotId)
    expect(c.roster.live).toHaveLength(5)
    expect(v.campaign.notices.join(' ')).toMatch(/K\.I\.A\./)
    expect(v.promotedTo).toBeUndefined()
    expect(c.human.log.at(-1)!.success).toBe(false)
    expect(c.human.stats.losses.kia).toBe(1)
  })

  it('crossing a rank threshold promotes by tier, with the device keyed by faction and tier', () => {
    const m = mission({ authoredBonus: PILOT_TIER_POINTS[1] })
    const { input } = setup(new MapPort(), 0, m)
    const v = view(bankScored(input({ authoredBonusOf: () => PILOT_TIER_POINTS[1]! })))
    expect(v.promotedTo).toBe('Lieutenant (junior grade)')
    expect(v.promotedTier).toEqual({ faction: 'us', tier: 2 })
  })

  it('a friendly destruction is a discharge with a zero sortie, and says so', () => {
    const { session, input, pilotId } = setup()
    const v = view(bankScored(input({ player: { tagCredits: credits({ fighter: 3 }), friendlyKills: 1, friendlyFire: true } })))
    const c = session.current()!
    expect(c.pilots[pilotId]!.status).toBe('discharged')
    expect(c.pilots[pilotId]!.points).toBe(0)
    expect(v.campaign.notices.join(' ')).toMatch(/Friendly destroyed/)
    expect(v.campaign.notices.join(' ')).toMatch(/DISCHARGED/)
  })

  it('a failed save is carried to the debrief so the player is told', () => {
    const port = new MapPort()
    const { input } = setup(port)
    port.failOn = () => true
    const v = view(bankScored(input()))
    expect(v.saveError).toContain('Could not save')
  })

  it('with no pending sortie nothing is banked', () => {
    const { session, input } = setup()
    session.abandon()
    expect(bankScored(input())).toBeNull()
  })

  it('a mission with no badge still succeeds: success is the verdict, passed in, not badgeId !== null', () => {
    const { session, input, pilotId } = setup(new MapPort(), 0, mission({ authoredBonus: 250, badgeId: null }))
    view(bankScored(input({ success: true, badgeId: null, authoredBonusOf: () => 250 })))
    expect(session.current()!.pilots[pilotId]!.points).toBe(500 + 1000 + 250)
  })
})
