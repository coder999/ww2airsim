import { localToWorld, type Airfield } from '../../src/sim/world/airfields.js'
import { buildStructures } from '../../src/sim/weapons/structures.js'
import { segmentBox } from '../../src/sim/weapons/geometry.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { windowsForChapter } from '../../src/campaign/worldStates.js'
import { airfieldFor, type Site } from '../../src/sim/world/sites.js'

/**
 * Mission-fit arithmetic (F8A Task 10, extended by F8B): how long from a start to a mission's first action, at 1x, over
 * the real layout of a site, then home to a legal recovery field. Pure; the table it reads is
 * content/campaign/mission-fit.json and the test is tests/sim/missionFit.test.ts. Every constant in a row is an ESTIMATE
 * labeled in that file.
 *
 * F8B additions: an airborne start (J3, J5); a recovery leg (the nearest LEGAL named field, plus a landing allowance, under
 * F3's recovery budget); a legality check (every named recovery field is held by the player's side and serviceable in the
 * window `windowsForChapter` plays that chapter in, because F3 section 2 allows only named fields "while allied/controlled
 * and serviceable"); and `withinM`, F3's stated range where it gives one.
 */
export type Start =
  | { readonly kind: 'parked'; readonly site: string; readonly window: string; readonly parked: string }
  | { readonly kind: 'airborne'; readonly site: string; readonly x: number; readonly z: number; readonly basis: 'invented'; readonly note: string }

export type FilledRow = {
  readonly id: string
  readonly status: 'filled'
  readonly aircraft: string
  /** The player's side: whose fields are legal to recover to. */
  readonly side: 'allied' | 'axis'
  readonly start: Start
  readonly firstAction: { readonly site: string; readonly x: number; readonly z: number; readonly basis: 'invented'; readonly note: string }
  /** F3's own range from the start to the first action, in meters, where F3 gives one (J1: "attackers inside 6 mi"). */
  readonly withinM?: number
  readonly takeoffS?: number
  readonly taxiMps?: number
  readonly cruiseMps: number
  /** Pattern and landing, added to the flight home. ESTIMATE. */
  readonly landingS?: number
  readonly recovery?: { readonly sites: readonly string[]; readonly budgetS: number }
  /** A reported finding: the row fails this check on purpose and the test asserts that it still does. */
  readonly expectFail?: { readonly check: 'ceiling' | 'range' | 'taxi' | 'recovery' | 'legality'; readonly why: string }
}

export type Fit = {
  readonly taxiM: number; readonly taxiS: number; readonly takeoffS: number; readonly flightM: number; readonly flightS: number
  readonly totalS: number
  /** A building hit box on the straight taxi line from the spot to the strip, or null. */
  readonly taxiBlockedBy: string | null
  /** Meters from the start to the first action. */
  readonly rangeM: number
  /** The legal named field nearest the first action and the time home (flight plus landing), or null with no legal field. */
  readonly recovery: { readonly site: string; readonly flightM: number; readonly totalS: number } | null
  /** One line per named recovery field that is not legal in the chapter's window. */
  readonly illegal: readonly string[]
}

/** The runway frame of a site: it never changes between windows, so any built window gives it. */
function frameOf(site: Site): Airfield {
  for (const w of ['endgame', 'buildup', 'pre-invasion', 'assault', 'j6-alternate']) {
    const f = airfieldFor(site, w)
    if (f !== null) return f
  }
  throw new Error(`site ${site.id} has no built window`)
}

/** Where the airplane starts, where it enters the strip, and where the first action is, from the site files. */
export function fitOf(row: FilledRow, sites: Readonly<Record<string, Site>>): Fit {
  const startSite = sites[row.start.site]
  const targetSite = sites[row.firstAction.site]
  if (startSite === undefined || targetSite === undefined) throw new Error(`${row.id}: site not loaded`)
  const target = localToWorld(frameOf(targetSite), row.firstAction.x, row.firstAction.z)
  let from: { x: number; z: number }
  let taxiM = 0
  let blockedBy: string | null = null
  let entry: { x: number; z: number }
  if (row.start.kind === 'parked') {
    const field = airfieldFor(startSite, row.start.window)
    if (field === null) throw new Error(`${row.id}: ${row.start.site} has no field in ${row.start.window}`)
    const spot = startSite.windows[row.start.window]!.parked.find((p) => p.id === (row.start as { parked: string }).parked)
    if (spot === undefined) throw new Error(`${row.id}: no parked aircraft "${row.start.parked}" at ${row.start.site} in ${row.start.window}`)
    from = localToWorld(field, spot.x, spot.z)
    // Entry: the strip's near edge level with the spot.
    const edge = Math.sign(spot.x) * field.runway.widthM / 2
    entry = localToWorld(field, edge, spot.z)
    taxiM = Math.hypot(entry.x - from.x, entry.z - from.z)
    const solid = buildStructures([field], null)
    blockedBy = solid.find((s) => {
      const c = Math.cos(s.headingRad), sn = Math.sin(s.headingRad)
      const loc = (p: { x: number; z: number }) => v3((p.x - s.position.x) * c + (p.z - s.position.z) * sn, 3, -(p.x - s.position.x) * sn + (p.z - s.position.z) * c)
      return segmentBox(loc(from), loc(entry), v3(0, 0, 0), v3(s.halfSize.x, s.halfSize.y, s.halfSize.z)) !== null
    })?.id ?? null
  } else {
    from = localToWorld(frameOf(startSite), row.start.x, row.start.z)
    entry = from
  }
  const flightM = Math.hypot(target.x - entry.x, target.z - entry.z)
  const taxiS = row.start.kind === 'parked' ? taxiM / (row.taxiMps ?? 8) : 0
  const takeoffS = row.start.kind === 'parked' ? row.takeoffS ?? 30 : 0
  const flightS = flightM / row.cruiseMps

  // The recovery leg: the nearest legal named field, judged in the window the chapter is played in.
  const windows = windowsForChapter(row.id)
  const illegal: string[] = []
  let recovery: Fit['recovery'] = null
  for (const siteId of row.recovery?.sites ?? []) {
    const site = sites[siteId]
    if (site === undefined) throw new Error(`${row.id}: recovery site "${siteId}" not loaded`)
    const window = windows[siteId]
    if (window === undefined) { illegal.push(`${siteId} has no window for ${row.id}`); continue }
    const field = airfieldFor(site, window)
    if (field === null) { illegal.push(`${siteId} has no field in ${window}`); continue }
    if ((field.side ?? 'axis') !== row.side) { illegal.push(`${siteId} is ${field.side ?? 'axis'}-held in ${window}, the player is ${row.side}`); continue }
    if (field.serviceable === false) { illegal.push(`${siteId} is not serviceable in ${window}`); continue }
    const d = Math.hypot(field.runway.center.x - target.x, field.runway.center.z - target.z)
    if (recovery === null || d < recovery.flightM) recovery = { site: siteId, flightM: d, totalS: d / row.cruiseMps + (row.landingS ?? 60) }
  }
  return {
    taxiM, taxiS, takeoffS, flightM, flightS, totalS: taxiS + takeoffS + flightS, taxiBlockedBy: blockedBy,
    rangeM: Math.hypot(target.x - from.x, target.z - from.z), recovery, illegal,
  }
}

/**
 * Everything a row fails, as strings that each begin with the name of the check (`ceiling`, `range`, `taxi`, `recovery`,
 * `legality`). An empty list is a pass. A named recovery field that is illegal is reported even if another named field is
 * legal: F3's list is exact, and an author should know which entries of it are dead in that chapter.
 */
export function problemsOf(row: FilledRow, fit: Fit, ceilingS: number): string[] {
  const out: string[] = []
  if (fit.totalS > ceilingS) out.push(`ceiling: ${fit.totalS.toFixed(0)} s to first action, over ${ceilingS}`)
  if (row.withinM !== undefined && fit.rangeM > row.withinM) out.push(`range: first action ${Math.round(fit.rangeM)} m away, F3 says inside ${Math.round(row.withinM)} m`)
  if (fit.taxiBlockedBy !== null) out.push(`taxi: ${fit.taxiBlockedBy} stands between the start spot and the strip`)
  for (const i of fit.illegal) out.push(`legality: ${i}`)
  if (row.recovery !== undefined) {
    if (fit.recovery === null) out.push('legality: no named recovery field is legal')
    else if (fit.recovery.totalS > row.recovery.budgetS) out.push(`recovery: ${fit.recovery.totalS.toFixed(0)} s home to ${fit.recovery.site}, over ${row.recovery.budgetS}`)
  }
  return out
}

export type { Airfield }
