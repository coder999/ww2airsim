import { parseScenario, worldFromScenario } from '../../src/sim/scenario.js'
import { advance, playerAircraft, withControls, type AircraftEntity, type World } from '../../src/sim/loop.js'
import { DT } from '../../src/sim/flight/model.js'
import { autoPursuit } from '../../src/sim/ai/autoPursuit.js'
import { hasGunSolution, muzzleLeadDirection } from '../../src/sim/ai/pursuit.js'
import { qRotate } from '../../src/sim/math/quat.js'
import { dot, v3 } from '../../src/sim/math/vec3.js'
import { bundleForScenario, loadAircraftSpec, loadScenarioBundle } from '../content/load.js'
import { readdirSync } from 'node:fs'

/**
 * B3's instrument: the player's pursuit autopilot (Shift) flown headless
 * through production `advance` under the Realistic damage model, steering
 * every 1/60 s tick the way `frame.ts` does at 60 Hz.
 *
 *   npx tsx tools/autopilot/pursuitProbe.ts          # all three tables
 *
 * 1. Overload: per airframe with fixed guns, the player at `SPEED_FRACTIONS`
 *    of its dive speed with an enemy 800 m behind; 20 s of Shift. Peak load,
 *    ticks over the spec's `gLimit`, structure left.
 * 2. Evader: the player's F6F on Shift against an AI Zero that fights back
 *    (E1's duel geometries), 90 s. Peak load, over-limit ticks, structure.
 * 3. Gun solution: the Damage Range (three straight-flying Zeros) on Shift,
 *    a 0.25 s tap of the trigger whenever the gun solution has held 0.1 s,
 *    at most one tap per second (the damage stages round 2 handoff's
 *    "0.25 s tap": 11-18 hits on a Zero). Time to first solution, hits per
 *    tap, taps to set each Zero alight, nose error to the solution in range.
 */

type Stress = { peakG: number; overTicks: number; structure: number; destroyed: boolean }

/** One tick of Shift (and an optional trigger) through `advance`. */
function shiftTick<M>(w: World<M>, fire: boolean): World<M> {
  const ap = autoPursuit(w)
  const p = playerAircraft(w)
  const c = ap === null ? p.controls : { ...p.controls, roll: ap.roll, pitch: ap.pitch, yaw: ap.yaw }
  return advance(withControls(w, w.player, { ...c, fire }), DT).world
}

function stressOf<M>(w: World<M>, peakG: number, overTicks: number): Stress {
  const c = w.combat.aircraft[w.player]!
  return { peakG, overTicks, structure: c.damage.structure, destroyed: c.damage.destroyedAt !== null }
}

/** Every airframe a player could fly into a gunfight: one with fixed guns. */
export const GUN_AIRFRAMES: readonly string[] = readdirSync(new URL('../../content/aircraft/', import.meta.url))
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.slice(0, -5))
  .filter((id) => (loadAircraftSpec(id).combat?.guns.length ?? 0) > 0)
  .sort()

export const SPEED_FRACTIONS = [0.6, 0.8, 0.95] as const

/** Table 1's world: `spec` at `fraction` of its dive speed heading east at
 *  3,000 m, a same-type enemy 800 m behind heading east at 110 m/s. */
export function overloadWorld(spec: string, fraction: number): World<undefined> {
  const s = loadAircraftSpec(spec)
  const scenario = parseScenario({
    id: `b3-overload-${spec}`, player: 'p', airfields: ['tacloban'],
    aircraft: [
      { id: 'p', spec, airborneAt: { position: [0, 3000, 0], headingDeg: 90, speedMps: fraction * s.limits.diveSpeedMps, throttle: 1 } },
      { id: 'e', spec, side: 'axis', airborneAt: { position: [-800, 3200, 150], headingDeg: 90, speedMps: 110, throttle: 0.6 } },
    ],
    ships: [], weather: { windFromDeg: 0, windMps: 0, timeOfDay: 12 },
  })
  return worldFromScenario(bundleForScenario(scenario), null)
}

export function runOverload(spec: string, fraction: number, seconds = 20): Stress {
  let w = overloadWorld(spec, fraction)
  let peakG = 0, over = 0
  const limit = playerAircraft(w).spec.limits.gLimit
  for (let i = 0; i < seconds / DT; i++) {
    w = shiftTick(w, false)
    const g = w.combat.aircraft[w.player]!.stress.loadFactorG
    peakG = Math.max(peakG, g)
    if (g > limit) over++
    if (playerAircraft(w).impact !== null) break
  }
  return stressOf(w, peakG, over)
}

export type Geometry = 'head-on' | 'tail' | 'crossing'
const at = (x: number, z: number, headingDeg: number, y = 3500) => ({ position: [x, y, z], headingDeg, speedMps: 125 })
const START: Record<Geometry, readonly [ReturnType<typeof at>, ReturnType<typeof at>]> = {
  'head-on': [at(0, 0, 90), at(3000, 40, 270, 3520)],
  tail: [at(0, 0, 90), at(600, 30, 90, 3520)],
  crossing: [at(0, 0, 90), at(1500, -1500, 0, 3520)],
}

export function evaderWorld(g: Geometry, skill: 'veteran' | 'green', cursor: number): World<undefined> {
  const [sp, se] = START[g]
  const scenario = parseScenario({
    id: `b3-evader-${g}`, player: 'p', airfields: ['tacloban'],
    aircraft: [
      { id: 'p', spec: 'f6f-hellcat', airborneAt: { ...sp, throttle: 1 } },
      { id: 'z', spec: 'a6m2-zero', side: 'axis', airborneAt: se, pilot: { skill, target: 'p' } },
    ],
    ships: [], weather: { windFromDeg: 0, windMps: 0, timeOfDay: 12 },
  })
  const w = worldFromScenario(bundleForScenario(scenario), null)
  return { ...w, aircraft: w.aircraft.map((x) => x.pilot == null ? x : { ...x, pilot: { ...x.pilot, decision: { ...x.pilot.decision, noiseCursor: (x.pilot.decision.noiseCursor + cursor) >>> 0 } } }) }
}

export type EvaderReport = Stress & { readonly firstSolutionS: number | null; readonly solutionS: number }

/** Also the gun solution against a target that maneuvers: when Shift first
 *  holds it, and for how many seconds in all. Nobody fires. */
export function runEvader(g: Geometry, skill: 'veteran' | 'green', cursor: number, seconds = 90): EvaderReport {
  let w = evaderWorld(g, skill, cursor)
  let peakG = 0, over = 0, firstSolutionS: number | null = null, solution = 0
  const limit = playerAircraft(w).spec.limits.gLimit
  for (let i = 0; i < seconds / DT; i++) {
    const z = w.aircraft.find((a) => a.id === 'z')!
    if (z.impact === null && hasGunSolution(playerAircraft(w), z)) {
      solution++
      firstSolutionS ??= i * DT
    }
    w = shiftTick(w, false)
    const g = w.combat.aircraft[w.player]!.stress.loadFactorG
    peakG = Math.max(peakG, g)
    if (g > limit) over++
    if (playerAircraft(w).impact !== null) break
  }
  return { ...stressOf(w, peakG, over), firstSolutionS, solutionS: solution * DT }
}

export type GunReport = {
  readonly firstSolutionS: number | null
  readonly taps: readonly number[]
  readonly tapsToBurn: Readonly<Record<string, number | null>>
  readonly meanErrorDeg: number
  readonly inSolutionFraction: number
  readonly peakG: number
}

const TAP_TICKS = Math.round(0.25 / DT)
const SETTLE_TICKS = Math.round(0.1 / DT)
const TAP_GAP_TICKS = Math.round(1 / DT)

export function runDamageRange(seconds = 120): GunReport {
  let w = worldFromScenario(loadScenarioBundle('damage-range'), null)
  const zeros = ['zero-1', 'zero-2', 'zero-3']
  let firstSolutionS: number | null = null
  let settled = 0, tapLeft = 0, sinceTap = TAP_GAP_TICKS, hitsAtTap = 0, tapped = false
  const taps: number[] = []
  const tapCount: Record<string, number> = {}
  const tapsToBurn: Record<string, number | null> = Object.fromEntries(zeros.map((z) => [z, null]))
  let errSum = 0, errN = 0, inSol = 0, peakG = 0
  for (let i = 0; i < seconds / DT; i++) {
    const ap = autoPursuit(w)
    const self = playerAircraft(w)
    const target = ap?.target == null ? undefined : w.aircraft.find((a) => a.id === ap.target) as AircraftEntity<undefined> | undefined
    const solution = target !== undefined && hasGunSolution(self, target)
    const aim = target === undefined ? null : muzzleLeadDirection(self, target)
    if (aim !== null) {
      const nose = qRotate(self.state.attitude, v3(1, 0, 0))
      errSum += Math.acos(Math.min(1, dot(nose, aim))) * 180 / Math.PI
      errN++
      if (solution) inSol++
    }
    if (solution && firstSolutionS === null) firstSolutionS = i * DT
    settled = solution ? settled + 1 : 0
    sinceTap++
    if (tapLeft === 0 && settled >= SETTLE_TICKS && sinceTap >= TAP_GAP_TICKS && target !== undefined) {
      if (tapped) taps.push(w.combat.aircraft[w.player]!.hits - hitsAtTap)
      tapped = true
      hitsAtTap = w.combat.aircraft[w.player]!.hits
      tapLeft = TAP_TICKS
      sinceTap = 0
      tapCount[target.id] = (tapCount[target.id] ?? 0) + 1
    }
    const fire = tapLeft > 0
    if (tapLeft > 0) tapLeft--
    w = shiftTick(w, fire)
    peakG = Math.max(peakG, w.combat.aircraft[w.player]!.stress.loadFactorG)
    for (const z of zeros) {
      const d = w.combat.aircraft[z]!.damage
      if (tapsToBurn[z] === null && (d.burningSince !== null || d.destroyedAt !== null)) tapsToBurn[z] = tapCount[z] ?? 0
    }
    if (zeros.every((z) => tapsToBurn[z] !== null) && tapLeft === 0 && sinceTap > TAP_GAP_TICKS) break
  }
  // The last tap's hits, counted once its rounds have had a second to land.
  if (tapped) taps.push(w.combat.aircraft[w.player]!.hits - hitsAtTap)
  return { firstSolutionS, taps, tapsToBurn, meanErrorDeg: errN ? errSum / errN : NaN, inSolutionFraction: errN ? inSol / errN : 0, peakG }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const which = process.argv[2] ?? 'all'
  if (which === 'all' || which === 'overload') {
    console.log('## Overload: enemy 800 m behind, 20 s of Shift')
    for (const spec of GUN_AIRFRAMES) {
      const limit = loadAircraftSpec(spec).limits.gLimit
      for (const f of SPEED_FRACTIONS) {
        const r = runOverload(spec, f)
        console.log(`${spec.padEnd(22)} limit ${limit.toFixed(1)} g  ${f.toFixed(2)} Vd: peak ${r.peakG.toFixed(2)} g, over ${r.overTicks} ticks, structure ${r.structure.toFixed(3)}${r.destroyed ? ' DESTROYED' : ''}`)
      }
    }
  }
  if (which === 'all' || which === 'evader') {
    console.log('## Evader: F6F on Shift v an AI Zero, 90 s')
    for (const g of ['head-on', 'tail', 'crossing'] as const) {
      for (const skill of ['veteran', 'green'] as const) {
        const rs = [0, 1, 2, 3].map((k) => runEvader(g, skill, k * 7919))
        console.log(`${g.padEnd(8)} ${skill.padEnd(7)}: peak ${Math.max(...rs.map((r) => r.peakG)).toFixed(2)} g, over ${rs.map((r) => r.overTicks).join('/')} ticks, structure ${rs.map((r) => r.structure.toFixed(3)).join('/')}, first solution ${rs.map((r) => r.firstSolutionS?.toFixed(1) ?? '-').join('/')} s, in solution ${rs.map((r) => r.solutionS.toFixed(1)).join('/')} s`)
      }
    }
  }
  if (which === 'all' || which === 'gun') {
    const r = runDamageRange()
    console.log('## Damage Range: Shift and 0.25 s taps')
    console.log(`first solution ${r.firstSolutionS?.toFixed(2)} s; hits per tap ${r.taps.join(', ')}; taps to burn ${JSON.stringify(r.tapsToBurn)}; mean nose error in range ${r.meanErrorDeg.toFixed(2)} deg; in solution ${(100 * r.inSolutionFraction).toFixed(0)}% of in-range ticks; peak ${r.peakG.toFixed(2)} g`)
  }
}
