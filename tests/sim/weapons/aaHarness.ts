import { readFileSync } from 'node:fs'
import { bundleForScenario } from '../../../tools/content/load.js'
import { parseScenario } from '../../../src/sim/scenario.js'
import { worldFromScenario } from '../../../src/sim/scenario.js'
import { advance, playerAircraft, withControls, type World } from '../../../src/sim/loop.js'
import { DT } from '../../../src/sim/flight/model.js'
import { controlsForDesiredVelocity } from '../../../src/sim/ai/controller.js'
import { v3, type Vec3 } from '../../../src/sim/math/vec3.js'
import { flakBlastHp, initialAa } from '../../../src/sim/weapons/aaFire.js'

/**
 * The AA calibration bed (M2 plan task 5): a Hellcat flown by a scripted
 * velocity-following pilot (`controlsForDesiredVelocity`, the AI's own
 * controller) over an anchored Fletcher-class destroyer, at about 300 ft. Two
 * profiles, each over many seeds (a seed is the AA's luck and the start phase):
 *
 *   orbit  circles the ship at LINGER_RADIUS_M and LINGER_MPS ("lingering low over a destroyer")
 *   pass   a straight run directly over the ship at PASS_MPS, in from and out to the heavy guns' reach
 *
 * It reads the shipped `aa-range` scenario and keeps only the Fletcher: the ground battery is
 * made friendly so the numbers are the destroyer's alone. Terrain is null (a flat sea).
 */
export const HEIGHT_M = 91.4 // 300 ft
export const LINGER_RADIUS_M = 500
export const LINGER_MPS = 100 // about 195 knots
export const PASS_MPS = 150 // about 290 knots
export const PASS_REACH_M = 5500
/** The `high` profile: circling 6,000 ft up at 2,000 m, where the destroyer's heavy guns have the airplane to themselves. */
export const HIGH = { heightM: 1829, radiusM: 2000, mps: 130 } as const
export const RUN_S = { orbit: 90, pass: (2 * PASS_REACH_M) / PASS_MPS + 5, high: 120 } as const

export type Profile = 'orbit' | 'pass' | 'high'
const heightOf = (p: Profile): number => (p === 'high' ? HIGH.heightM : HEIGHT_M)
const radiusOf = (p: Profile): number => (p === 'high' ? HIGH.radiusM : LINGER_RADIUS_M)
const speedOf = (p: Profile): number => (p === 'pass' ? PASS_MPS : p === 'high' ? HIGH.mps : LINGER_MPS)
export type AaRun = {
  /** Seconds until the Hellcat caught fire or was destroyed, or null if it came through. */
  readonly lostS: number | null
  /** Structure left at the end (0..1). */
  readonly structure: number
  readonly seconds: number
  /** Light rounds that hit, flak bursts that went off, and how many of those were inside the lethal radius. */
  readonly lightHits: number
  readonly bursts: number
  readonly burstsInRadius: number
  /** The world when the run ended. */
  readonly world: World<undefined>
}

const base = JSON.parse(readFileSync(new URL('../../../content/scenarios/aa-range.json', import.meta.url), 'utf8')) as Record<string, unknown>
const SHIP = { x: -27916, z: -48605 }

export function worldFor(profile: Profile, seed: number, ship = 'fletcher-dd', shipSide: 'axis' | 'allied' = 'axis'): World<undefined> {
  const phase = (seed * 0.61803398875) % 1
  const orbit = profile !== 'pass'
  // Orbit: start on the ring, heading counter-clockwise tangent. Pass: start west of the ship, heading east.
  const a = phase * Math.PI * 2
  const position: [number, number, number] = orbit
    ? [SHIP.x + Math.cos(a) * radiusOf(profile), heightOf(profile), SHIP.z + Math.sin(a) * radiusOf(profile)]
    : [SHIP.x - PASS_REACH_M, heightOf(profile), SHIP.z + (phase - 0.5) * 60]
  // Compass heading 0 north (-z), 90 east (+x). CCW from above: velocity at angle a is (-sin a, cos a) in (x, z).
  const vx = orbit ? -Math.sin(a) : 1, vz = orbit ? Math.cos(a) : 0
  const headingDeg = ((Math.atan2(vx, -vz) * 180) / Math.PI + 360) % 360
  const scenario = parseScenario({
    ...base,
    airfieldSides: { tacloban: 'allied' },
    aircraft: [{ id: 'f6f-1', spec: 'f6f-hellcat', airborneAt: { position, headingDeg, speedMps: speedOf(profile) } }],
    ships: [{ id: 'dd-1', spec: ship, side: shipSide, waypoints: [[SHIP.x, SHIP.z]], speedMps: 0 }],
  })
  const w = worldFromScenario(bundleForScenario(scenario), null)
  return { ...w, combat: { ...w.combat, aa: initialAa(seed + 1) } }
}

/** The velocity the scripted pilot wants this tick. */
export function wanted(profile: Profile, p: Vec3): Vec3 {
  const climb = Math.max(-8, Math.min(8, (heightOf(profile) - p.y) * 0.4))
  if (profile === 'pass') return v3(PASS_MPS, climb, 0)
  const dx = p.x - SHIP.x, dz = p.z - SHIP.z
  const r = Math.hypot(dx, dz) || 1
  const tx = -dz / r, tz = dx / r // counter-clockwise tangent
  const radial = Math.max(-30, Math.min(30, (radiusOf(profile) - r) * 0.1))
  return v3(tx * speedOf(profile) + (dx / r) * radial, climb, tz * speedOf(profile) + (dz / r) * radial)
}

export function runAa(profile: Profile, seed: number, ship = 'fletcher-dd', seconds: number = RUN_S[profile]): AaRun {
  let w = worldFor(profile, seed, ship)
  const id = w.player
  let lightHits = 0, bursts = 0, burstsInRadius = 0, seen = 0
  const tally = (): void => {
    for (const h of w.combat.impacts) {
      if (h.tick <= seen) continue
      if (h.cause === 'round' && h.surface === 'aircraft') lightHits++
      if (h.cause === 'flak') {
        bursts++
        const me = playerAircraft(w).state.position
        if (flakBlastHp(Math.hypot(h.point.x - me.x, h.point.y - me.y, h.point.z - me.z)) !== null) burstsInRadius++
      }
    }
    seen = w.tick
  }
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const me = playerAircraft(w)
    w = withControls(w, id, controlsForDesiredVelocity(me.state, me.spec, wanted(profile, me.state.position)))
    w = advance(w, DT).world
    tally()
    const d = w.combat.aircraft[id]!.damage
    if (d.burningSince !== null || d.destroyedAt !== null || playerAircraft(w).impact !== null) {
      return { lostS: (i + 1) * DT, structure: d.structure, seconds: (i + 1) * DT, lightHits, bursts, burstsInRadius, world: w }
    }
  }
  return { lostS: null, structure: w.combat.aircraft[id]!.damage.structure, seconds, lightHits, bursts, burstsInRadius, world: w }
}

export type Sweep = { readonly runs: number; readonly meanLightHits: number; readonly meanBursts: number; readonly meanBurstsInRadius: number; readonly lost: number; readonly lostTimes: readonly number[]; readonly medianLostS: number | null; readonly meanStructure: number }
export function sweep(profile: Profile, seeds: number, ship = 'fletcher-dd'): Sweep {
  const results: AaRun[] = []
  for (let k = 0; k < seeds; k++) results.push(runAa(profile, k, ship))
  const times = results.flatMap((r) => (r.lostS === null ? [] : [r.lostS])).sort((a, b) => a - b)
  return {
    runs: seeds,
    meanLightHits: results.reduce((a, r) => a + r.lightHits, 0) / seeds,
    meanBursts: results.reduce((a, r) => a + r.bursts, 0) / seeds,
    meanBurstsInRadius: results.reduce((a, r) => a + r.burstsInRadius, 0) / seeds,
    lost: times.length, lostTimes: times,
    medianLostS: times.length === 0 ? null : times[Math.floor(times.length / 2)]!,
    meanStructure: results.reduce((s, r) => s + r.structure, 0) / seeds,
  }
}

/**
 * The cost bed: the Range Test with EVERY warship armed and hostile (the Japanese six from `range-test`
 * and the Allied five from `range-test-axis`, all flagged axis, plus both cargo ships, which have no guns),
 * and the Hellcat circling in the middle of them at 300 ft. Terrain null.
 */
export function crowdedWorld(): World<undefined> {
  const read = (id: string): Record<string, unknown> => JSON.parse(readFileSync(new URL(`../../../content/scenarios/${id}.json`, import.meta.url), 'utf8')) as Record<string, unknown>
  const a = read('range-test') as { ships: { id: string }[] }, b = read('range-test-axis') as { ships: { id: string }[] }
  const centre = { x: -27916, z: -48105 }
  const ships = [...a.ships, ...b.ships.map((s) => ({ ...s, id: `${s.id}-b` }))].map((s, k) => ({
    ...s, side: 'axis', waypoints: [[centre.x + ((k % 4) - 1.5) * 300, centre.z + (Math.floor(k / 4) - 1) * 300]], speedMps: 0,
  }))
  const scenario = parseScenario({
    id: 'aa-crowded', player: 'f6f-1', airfields: ['tacloban'], airfieldSides: { tacloban: 'allied' },
    aircraft: [{ id: 'f6f-1', spec: 'f6f-hellcat', airborneAt: { position: [centre.x + 400, HEIGHT_M, centre.z], headingDeg: 0, speedMps: LINGER_MPS } }],
    ships, weather: { windFromDeg: 0, windMps: 0, timeOfDay: 12 },
  })
  return worldFromScenario(bundleForScenario(scenario), null)
}
