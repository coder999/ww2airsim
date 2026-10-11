import { bundleForScenario } from '../../../tools/content/load.js'
import { parseScenario, worldFromScenario } from '../../../src/sim/scenario.js'
import { advance, type World } from '../../../src/sim/loop.js'
import { DT } from '../../../src/sim/flight/model.js'
import { initialAa } from '../../../src/sim/weapons/aaFire.js'

/**
 * The M4 duel bed: two warships on parallel courses `rangeM` apart, both steaming east at
 * `speedMps`, main batteries on, terrain null (an open sea). A seed is the fire control's luck. The
 * player's Hellcat is parked 30 miles off at altitude, out of every gun's reach; nothing aims at it.
 *
 * What a run returns is what the M4 handoff's duel tables report: who sank, when, and how many shell
 * hits each side landed. A ship counts as sunk when its hull points reach zero (it then takes 90 s to
 * reach the bottom, spec §3.6, not counted here).
 */
export type DuelResult = {
  readonly a: string; readonly b: string; readonly rangeM: number; readonly seed: number
  /** Seconds until each ship's hull points reached zero, or null if it was still afloat at the end. */
  readonly aSunkS: number | null
  readonly bSunkS: number | null
  /** Shell bursts on each hull (the nearest hull to a `ship` detonation). */
  readonly hitsOnA: number
  readonly hitsOnB: number
  readonly shotsByA: number
  readonly shotsByB: number
  readonly mountsOutA: number
  readonly mountsOutB: number
  readonly seconds: number
  readonly world: World<undefined>
}

export function duelWorld(a: string, b: string, rangeM: number, seed: number, speedMps = 7.7): World<undefined> {
  const scenario = parseScenario({
    id: 'duel', player: 'f6f-1', airfields: ['tacloban'], airfieldSides: { tacloban: 'allied' }, mainBatteries: true,
    aircraft: [{ id: 'f6f-1', spec: 'f6f-hellcat', airborneAt: { position: [0, 3000, -50_000], headingDeg: 0, speedMps: 120 } }],
    ships: [
      { id: 'a', spec: a, side: 'allied', waypoints: [[0, 0], [200_000, 0]], speedMps },
      { id: 'b', spec: b, side: 'axis', waypoints: [[0, rangeM], [200_000, rangeM]], speedMps },
    ],
    weather: { windFromDeg: 0, windMps: 0, timeOfDay: 12 },
  })
  const w = worldFromScenario(bundleForScenario(scenario), null)
  return { ...w, combat: { ...w.combat, aa: initialAa(seed + 1) } }
}

export function runDuel(a: string, b: string, rangeM: number, seed: number, maxS = 900, speedMps = 7.7): DuelResult {
  let w = duelWorld(a, b, rangeM, seed, speedMps)
  let aSunkS: number | null = null, bSunkS: number | null = null
  let hitsOnA = 0, hitsOnB = 0, shotsByA = 0, shotsByB = 0, seen = 0
  let i = 0
  for (; i < Math.round(maxS / DT); i++) {
    w = advance(w, DT).world
    for (const h of w.combat.impacts) {
      if (h.tick <= seen || h.cause !== 'shell') continue
      if (h.outcome === 'fired') {
        if (h.mount?.ship === 'a') shotsByA++
        else shotsByB++
      } else if (h.surface === 'ship') {
        const [sa, sb] = [w.ships.find((s) => s.id === 'a')!, w.ships.find((s) => s.id === 'b')!]
        const da = Math.hypot(sa.state.position.x - h.point.x, sa.state.position.z - h.point.z)
        const db = Math.hypot(sb.state.position.x - h.point.x, sb.state.position.z - h.point.z)
        if (da < db) hitsOnA++
        else hitsOnB++
      }
    }
    seen = w.tick
    if (aSunkS === null && w.combat.ships['a']!.destroyedTick !== null) aSunkS = (i + 1) * DT
    if (bSunkS === null && w.combat.ships['b']!.destroyedTick !== null) bSunkS = (i + 1) * DT
    if (aSunkS !== null || bSunkS !== null) break
  }
  return {
    a, b, rangeM, seed, aSunkS, bSunkS, hitsOnA, hitsOnB, shotsByA, shotsByB,
    mountsOutA: w.combat.ships['a']!.mountsOut?.length ?? 0, mountsOutB: w.combat.ships['b']!.mountsOut?.length ?? 0,
    seconds: (i + 1) * DT, world: w,
  }
}

export type DuelSummary = {
  readonly a: string; readonly b: string; readonly rangeM: number; readonly runs: number
  /** Runs won by each side (the other sank first), and runs where neither sank by the end. */
  readonly aWins: number; readonly bWins: number; readonly draws: number
  /** Median seconds to the first sinking, over the runs that had one. */
  readonly medianSinkS: number | null
  /** Mean shell hits it took to sink the loser, over the runs with a loser. */
  readonly meanHitsToSink: number | null
  /** Shell hits per turret salvo fired, by each side (a salvo is every barrel of one turret). */
  readonly hitsPerSalvoA: number
  readonly hitsPerSalvoB: number
  readonly meanMountsOut: number
}

export function duelSweep(a: string, b: string, rangeM: number, seeds: number, maxS = 900): DuelSummary {
  const rs = Array.from({ length: seeds }, (_, k) => runDuel(a, b, rangeM, k, maxS))
  const sinks = rs.flatMap((r) => (r.aSunkS ?? r.bSunkS) === null ? [] : [Math.min(r.aSunkS ?? Infinity, r.bSunkS ?? Infinity)]).sort((x, y) => x - y)
  const losers = rs.filter((r) => r.aSunkS !== null || r.bSunkS !== null)
  const sum = (f: (r: DuelResult) => number): number => rs.reduce((s, r) => s + f(r), 0)
  return {
    a, b, rangeM, runs: seeds,
    aWins: rs.filter((r) => r.bSunkS !== null && r.aSunkS === null).length,
    bWins: rs.filter((r) => r.aSunkS !== null && r.bSunkS === null).length,
    draws: rs.filter((r) => r.aSunkS === null && r.bSunkS === null).length,
    medianSinkS: sinks.length === 0 ? null : sinks[Math.floor(sinks.length / 2)]!,
    meanHitsToSink: losers.length === 0 ? null : losers.reduce((s, r) => s + (r.bSunkS !== null ? r.hitsOnB : r.hitsOnA), 0) / losers.length,
    hitsPerSalvoA: sum((r) => r.hitsOnB) / Math.max(1, sum((r) => r.shotsByA)),
    hitsPerSalvoB: sum((r) => r.hitsOnA) / Math.max(1, sum((r) => r.shotsByB)),
    meanMountsOut: sum((r) => r.mountsOutA + r.mountsOutB) / seeds,
  }
}
