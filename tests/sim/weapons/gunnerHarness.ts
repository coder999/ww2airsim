import { bundleForScenario } from '../../../tools/content/load.js'
import { parseScenario, worldFromScenario } from '../../../src/sim/scenario.js'
import { advance, playerAircraft, withControls, type World } from '../../../src/sim/loop.js'
import { DT } from '../../../src/sim/flight/model.js'
import { controlsForDesiredVelocity } from '../../../src/sim/ai/controller.js'
import { add, length, normalize, scale, sub, v3, type Vec3 } from '../../../src/sim/math/vec3.js'
import { initialAa } from '../../../src/sim/weapons/aaFire.js'

/**
 * The gunner calibration bed (E3 plan task 5): a Hellcat flown by a scripted velocity-following pilot
 * (`controlsForDesiredVelocity`, the AI's own controller, as M2's `aaHarness.ts`) makes one firing pass on
 * a B-17 flying straight and level at 8,200 ft, alone or leading a four-ship formation. The Hellcat never
 * fires: this measures only what the gunners do to it. Terrain is null (a flat sea), far from any airfield.
 *
 *   astern     the sloppy attack: from 1,000 yd dead astern, closing at a slow 67 mph to 130 yd, then a dive away
 *   high-side  from 3,000 ft above and 1,300 yd abeam, a curving diving pass on the lead point to 130 yd
 *   head-on    from 2,700 yd ahead, straight in to 220 yd, then pushed under
 *
 * A seed moves the start a little and is the gunners' luck (the combat seed their hash draws mix in).
 */
export type Geometry = 'astern' | 'high-side' | 'head-on'
export const GEOMETRIES: readonly Geometry[] = ['astern', 'high-side', 'head-on']
export type GunnerSkill = 'green' | 'veteran'

export const ALTITUDE_M = 2500
export const BOMBER_MPS = 90
const START = { x: -30000, z: -16000 }
/** After the break the Hellcat flies on this long before the pass is scored. */
const BREAK_S = 6
const MAX_S = 70

export function gunnerWorld(geometry: Geometry, skill: GunnerSkill, seed: number, formation = false): World<undefined> {
  const jitter = ((seed * 0.61803398875) % 1) - 0.5 // -0.5 .. 0.5
  const lead = { x: START.x, y: ALTITUDE_M, z: START.z }
  const off = geometry === 'astern' ? v3(-900, 0, jitter * 60)
    : geometry === 'high-side' ? v3(500 + jitter * 200, 900, -1200)
    : v3(2500, 40, jitter * 60)
  const heading = geometry === 'head-on' ? 270 : 90
  const speed = geometry === 'astern' ? BOMBER_MPS + 30 : 130
  const route = [{ x: START.x + 80000, z: START.z, altitudeM: ALTITUDE_M, speedMps: BOMBER_MPS }]
  const bomber = (id: string, x: number, z: number, pilot: Record<string, unknown>): Record<string, unknown> => ({
    id, spec: 'b-17-flying-fortress', side: 'axis',
    airborneAt: { position: [x, ALTITUDE_M, z], headingDeg: 90, speedMps: BOMBER_MPS, throttle: 0.7 },
    pilot: { skill, ...pilot },
  })
  const wingmen = formation
    ? [bomber('b17-2', lead.x - 80, lead.z + 100, { leader: 'b17-1', slot: 1 }), bomber('b17-3', lead.x - 80, lead.z - 100, { leader: 'b17-1', slot: 2 }), bomber('b17-4', lead.x - 160, lead.z - 200, { leader: 'b17-1', slot: 3 })]
    : []
  const scenario = parseScenario({
    id: 'gunner-bed', player: 'f6f-1', airfields: ['tacloban'],
    aircraft: [
      { id: 'f6f-1', spec: 'f6f-hellcat', airborneAt: { position: [lead.x + off.x, lead.y + off.y, lead.z + off.z], headingDeg: heading, speedMps: speed } },
      bomber('b17-1', lead.x, lead.z, { ingress: { route } }),
      ...wingmen,
    ],
    ships: [], weather: { windFromDeg: 0, windMps: 0, timeOfDay: 12 },
  })
  const w = worldFromScenario(bundleForScenario(scenario), null)
  return { ...w, combat: { ...w.combat, aa: initialAa(seed + 1) } }
}

/** The velocity the scripted Hellcat wants this tick, and whether it has broken off. */
function wanted(geometry: Geometry, me: { position: Vec3; velocity: Vec3 }, target: { position: Vec3; velocity: Vec3 }, broke: boolean): Vec3 {
  const rel = sub(target.position, me.position)
  const range = length(rel)
  if (broke) {
    // Away and down, the way it was going.
    const v = me.velocity, h = Math.hypot(v.x, v.z) || 1
    return v3((v.x / h) * 140, -60, (v.z / h) * 140 + (geometry === 'astern' ? 40 : 0))
  }
  if (geometry === 'astern') {
    const climb = Math.max(-10, Math.min(10, rel.y * 0.5))
    const flat = normalize(v3(rel.x, 0, rel.z))
    return v3(flat.x * (BOMBER_MPS + 30), climb, flat.z * (BOMBER_MPS + 30))
  }
  if (geometry === 'head-on') return scale(normalize(rel), 140)
  // High side: lead pursuit, the lead point a round's flight time ahead.
  const aim = add(target.position, scale(target.velocity, range / 400))
  return scale(normalize(sub(aim, me.position)), 160)
}

export const BREAK_RANGE_M: Readonly<Record<Geometry, number>> = { astern: 120, 'high-side': 120, 'head-on': 200 }

export type GunnerRun = {
  /** .50-hit equivalents taken: structure lost, in units of the Hellcat's `damagePerHit`. */
  readonly hits: number
  /** Gunner salvos that struck the Hellcat. */
  readonly strikes: number
  /** On fire, destroyed or down by the end of the pass. */
  readonly lost: boolean
  /** Seconds the Hellcat spent inside 700 m of the lead bomber. */
  readonly exposedS: number
  /** Salvos the bombers fired. */
  readonly salvos: number
}

export function runPass(geometry: Geometry, skill: GunnerSkill, seed: number, formation = false): GunnerRun {
  let w = gunnerWorld(geometry, skill, seed, formation)
  const id = w.player
  let broke = false, brokeAt = 0, exposedS = 0, strikes = 0, seen = 0
  for (let i = 0; i < Math.round(MAX_S / DT); i++) {
    const me = playerAircraft(w)
    const lead = w.aircraft.find((a) => a.id === 'b17-1')!
    const range = length(sub(lead.state.position, me.state.position))
    if (range <= 700) exposedS += DT
    if (!broke && range <= BREAK_RANGE_M[geometry]) { broke = true; brokeAt = i }
    if (broke && i - brokeAt > BREAK_S / DT) break
    w = withControls(w, id, controlsForDesiredVelocity(me.state, me.spec, wanted(geometry, me.state, lead.state, broke)))
    w = advance(w, DT).world
    for (const h of w.combat.impacts) if (h.tick > seen && h.cause === 'round' && h.surface === 'aircraft') strikes++
    seen = w.tick
    const d = w.combat.aircraft[id]!.damage
    if (d.burningSince !== null || d.destroyedAt !== null || playerAircraft(w).impact !== null) break
  }
  const d = w.combat.aircraft[id]!.damage
  const spec = playerAircraft(w).spec.combat!
  const salvos = w.aircraft.filter((a) => a.id !== id).reduce((s, a) => s + w.combat.aircraft[a.id]!.shots, 0)
  return {
    hits: ((1 - d.structure) * spec.structureHp) / spec.damagePerHit, strikes,
    lost: d.burningSince !== null || d.destroyedAt !== null || playerAircraft(w).impact !== null,
    exposedS, salvos,
  }
}

export type GunnerSweep = { readonly runs: number; readonly meanHits: number; readonly medianHits: number; readonly lost: number; readonly meanExposedS: number; readonly meanSalvos: number }
export function sweepPasses(geometry: Geometry, skill: GunnerSkill, seeds: number, formation = false): GunnerSweep {
  const runs: GunnerRun[] = []
  for (let k = 0; k < seeds; k++) runs.push(runPass(geometry, skill, k, formation))
  const hits = runs.map((r) => r.hits).sort((a, b) => a - b)
  return {
    runs: seeds,
    meanHits: hits.reduce((a, h) => a + h, 0) / seeds,
    medianHits: hits[Math.floor(seeds / 2)]!,
    lost: runs.filter((r) => r.lost).length,
    meanExposedS: runs.reduce((a, r) => a + r.exposedS, 0) / seeds,
    meanSalvos: runs.reduce((a, r) => a + r.salvos, 0) / seeds,
  }
}
