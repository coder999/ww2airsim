/**
 * Banks a finished campaign sortie and describes it for the debrief (plan F5B Task 10). Pure: it takes the
 * session and the player's combat record, so the Node suite drives it without a world or a DOM. `main.ts` calls
 * it from the three end sites (impact, destruction, landing) and from Abandon; the session's latch and the
 * reducer's own `no-pending` rejection make a second call bank nothing.
 */
import { adjustedScore, formatName, tierOf, type Campaign, type SortieEndKind } from '../campaign/index.js'
import type { CampaignDebrief } from './debrief.js'
import { buildReport, type Session } from './campaignSession.js'
import { formatAdjusted, formatPoints } from './hq/format.js'
import { FATE_LABEL, rankName } from './hq/model.js'
import type { TargetType } from '../sim/weapons/targetType.js'

export type PlayerCombat = {
  readonly tagCredits: Readonly<Record<TargetType, number>>
  readonly friendlyKills: number
  readonly friendlyFire: boolean
}

export type BankedView = {
  readonly bankedTotal: number
  readonly promotedTo?: string
  readonly promotedTier?: { readonly faction: 'us' | 'ja'; readonly tier: 1 | 2 | 3 | 4 | 5 | 6 }
  readonly campaign: CampaignDebrief
  readonly saveError?: string
}

export type BankInput = {
  readonly session: Session
  readonly end: SortieEndKind
  /** The mission verdict. Forced false for any end that cannot succeed (a death, a capture). */
  readonly success: boolean
  readonly badgeId: string | null
  readonly player: PlayerCombat
  readonly flight: { flightSeconds: number; maxAltitudeM: number; maxTrueAirspeedMps: number; landing: 'trap' | 'field' | 'ditched' | 'water' | null }
  readonly authoredBonusOf: (missionId: string) => number
}

/** Bank the pending sortie. `null` if there is none (nothing to bank), or the reducer refused (the error is in `saveError`). */
export function bankScored(i: BankInput): BankedView | { readonly refused: string } | null {
  const before = i.session.current()
  const pending = before?.pending ?? null
  if (before === null || pending === null) return null
  const pilotBefore = before.pilots[pending.pilotId]!
  const survives = i.end === 'landed' || i.end === 'ditched' || i.end === 'rescued'
  const report = buildReport({
    sortieId: pending.sortieId, end: i.end, success: i.success && (i.end === 'landed' || i.end === 'rescued'), tagCredits: i.player.tagCredits,
    friendlyKills: i.player.friendlyKills, friendlyFire: i.player.friendlyFire, authoredBonus: i.authoredBonusOf(pending.missionId),
    flight: i.flight, badgeId: i.badgeId,
  })
  const r = i.session.bank(report)
  if (!r.ok) return { refused: r.error.message }
  const after = r.value.campaign
  const save = i.session.lastSave()
  return describe(before, after, pending.pilotId, pilotBefore.points, survives, save !== null && !save.ok ? save.error : undefined)
}

function describe(before: Campaign, after: Campaign, pilotId: string, pointsBefore: number, survives: boolean, saveError: string | undefined): BankedView {
  const pilot = after.pilots[pilotId]!
  const entry = pilot.log.at(-1)
  const human = after.human.log.at(-1)
  const f = after.faction
  const rows: { label: string; value: string }[] = []
  if (entry !== undefined) {
    rows.push({ label: 'Destruction', value: formatPoints(entry.destruction) })
    rows.push({ label: 'Difficulty bonus', value: formatPoints(entry.bonuses.difficulty) })
    rows.push({ label: 'Completion bonus', value: formatPoints(entry.bonuses.completion) })
    rows.push({ label: 'Pilot, this sortie', value: formatPoints(entry.points) })
  }
  if (human !== undefined) {
    rows.push({ label: 'Roster bonus (Commander)', value: formatPoints(human.bonuses.roster) })
    rows.push({ label: 'Commander, this sortie', value: formatPoints(human.points) })
  }
  rows.push({ label: 'Commander total', value: formatPoints(after.human.ledger.points) })
  rows.push({ label: 'Adjusted score', value: `${formatAdjusted(adjustedScore(after.human))} per sortie` })

  const notices: string[] = []
  if (entry?.flags.includes('forfeit-friendly-destroyed') === true) notices.push('Friendly destroyed: this sortie scores nothing.')
  if (entry?.flags.includes('forfeit-abandoned') === true) notices.push('Sortie abandoned: nothing scored.')
  else if (entry?.flags.includes('warned') === true) notices.push('Friendly fire warning: damaging your own side is a warning; destroying it is a dishonorable discharge.')
  if (pilot.status !== 'active') {
    const fate = FATE_LABEL[pilot.status]
    const replacement = after.roster.live.find((id) => !before.roster.live.includes(id))
    notices.push(`${formatName(pilot.name, f)} is gone from the squadron (${fate}). ${replacement === undefined ? 'An' : `${formatName(after.pilots[replacement]!.name, f)}, an`} entry-rank pilot takes the slot; the file is in the archive.`)
  }
  const tierBefore = tierOf(pointsBefore)
  const tierAfter = tierOf(pilot.points)
  const promoted = survives && pilot.status === 'active' && tierAfter > tierBefore
  return {
    bankedTotal: pilot.points,
    ...(promoted ? { promotedTo: rankName(f, tierAfter), promotedTier: { faction: f, tier: tierAfter } } : {}),
    campaign: { pilotLine: `${formatName(pilot.name, f)}, ${rankName(f, tierAfter)}`, rows, notices },
    ...(saveError === undefined ? {} : { saveError }),
  }
}
