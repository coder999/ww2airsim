import { parseScenario, worldFromScenario } from '../../src/sim/scenario.js'
import { advance, type World } from '../../src/sim/loop.js'
import { DT } from '../../src/sim/flight/model.js'
import { bundleForScenario } from '../content/load.js'

/**
 * E1's instrument: AI-vs-AI 1v1 duels through production `advance`, no
 * terrain. Two F6Fs, `a` allied and `b` axis, each targeting the other; the
 * player parks 30 km away, out of everyone's way. A duel ends at the first
 * kill or `maxS`.
 *
 *   npx tsx tools/ai/duel.ts            # every geometry x skill pair, 8 cursors
 */
export type Skill = 'veteran' | 'green'
export type Geometry = 'head-on' | 'tail' | 'crossing'
export const GEOMETRIES: readonly Geometry[] = ['head-on', 'tail', 'crossing']

const at = (x: number, z: number, headingDeg: number, y = 3500) =>
  ({ position: [x, y, z], headingDeg, speedMps: 125 })
const START: Record<Geometry, readonly [ReturnType<typeof at>, ReturnType<typeof at>]> = {
  'head-on': [at(0, 0, 90), at(3000, 40, 270, 3520)],
  tail: [at(0, 0, 90), at(600, 30, 90, 3520)],
  crossing: [at(0, 0, 90), at(1500, -1500, 0, 3520)],
}

export function duelWorld(g: Geometry, a: Skill, b: Skill, cursor: number): World<undefined> {
  const [sa, sb] = START[g]
  const scenario = parseScenario({
    id: `duel-${g}`, player: 'p', airfields: ['tacloban'],
    aircraft: [
      { id: 'p', spec: 'f6f-hellcat', airborneAt: { position: [0, 6000, 30000], headingDeg: 0, speedMps: 125 } },
      { id: 'a', spec: 'f6f-hellcat', side: 'allied', airborneAt: sa, pilot: { skill: a, target: 'b' } },
      { id: 'b', spec: 'f6f-hellcat', side: 'axis', airborneAt: sb, pilot: { skill: b, target: 'a' } },
    ],
    ships: [], weather: { windFromDeg: 0, windMps: 0, timeOfDay: 12 },
  })
  const w = worldFromScenario(bundleForScenario(scenario), null)
  return { ...w, aircraft: w.aircraft.map((x) => x.pilot == null ? x : { ...x, pilot: { ...x.pilot, decision: { ...x.pilot.decision, noiseCursor: (x.pilot.decision.noiseCursor + cursor) >>> 0 } } }) }
}

export type DuelResult = { readonly killer: 'a' | 'b' | null; readonly killS: number | null; readonly hitsA: number; readonly hitsB: number; readonly roundsA: number; readonly roundsB: number }

export function duel(g: Geometry, a: Skill, b: Skill, cursor: number, maxS = 180): DuelResult {
  let w = duelWorld(g, a, b, cursor)
  for (let i = 1; i <= maxS / DT; i++) {
    w = advance(w, DT).world
    const da = w.combat.aircraft['a']!.damage.destroyedAt !== null, db = w.combat.aircraft['b']!.damage.destroyedAt !== null
    if (da || db) return result(w, db ? 'a' : 'b', i * DT)
  }
  return result(w, null, null)
}

function result(w: World<undefined>, killer: 'a' | 'b' | null, killS: number | null): DuelResult {
  const ca = w.combat.aircraft['a']!, cb = w.combat.aircraft['b']!
  return { killer, killS, hitsA: ca.hits, hitsB: cb.hits, roundsA: ca.shots, roundsB: cb.shots }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cursors = Number(process.argv[2] ?? 8)
  for (const g of GEOMETRIES) {
    for (const [a, b] of [['veteran', 'green'], ['veteran', 'veteran'], ['green', 'green']] as const) {
      let kills = 0, killA = 0, sumS = 0, hits = 0, rounds = 0
      for (let k = 0; k < cursors; k++) {
        const r = duel(g, a, b, k * 7919)
        if (r.killer !== null) { kills++; sumS += r.killS!; if (r.killer === 'a') killA++ }
        hits += r.hitsA + r.hitsB; rounds += r.roundsA + r.roundsB
      }
      console.log(`${g.padEnd(8)} ${a}(a) v ${b}(b): kills ${kills}/${cursors} (a ${killA}), mean ${kills ? (sumS / kills).toFixed(1) : '-'} s, hits ${hits}/${rounds} rounds`)
    }
  }
}
