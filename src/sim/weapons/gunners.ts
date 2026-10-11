import { qRotate, type Quat } from '../math/quat.js'
import { add, dot, length, scale, sub, type Vec3 } from '../math/vec3.js'
import { solveMuzzleLead, aimWithError } from '../ai/pursuit.js'
import { aimErrorDraw } from '../ai/noise.js'
import { GREEN_SKILL, type PilotSkill } from '../ai/pilot.js'
import { idSeed } from '../damage/model.js'
import type { AircraftSpec } from '../flight/schema.js'
import type { Side } from '../sides.js'
import { gunBallistics } from './gunTypes.js'

/**
 * Defensive gunners (E3, 2026-10-10): every turret and flexible gun a bomber's combat block lists in
 * `gunners` shoots at the nearest hostile airplane inside its range and arc. Mark's default is
 * "noticeable, not deadly": a sloppy attack from dead astern takes hits, a good high-side or head-on
 * pass mostly does not (the measured table: docs/handoff/2026-10-10-e3-bombers-gunners.md).
 *
 * The gunner is the same kind of shooter as M2's light AA (`aaFire.ts`) and borrows its shape: E1's lead
 * (`solveMuzzleLead`), an aim error drawn from hashes rather than a PRNG cursor (so a world with no gunner
 * replays bit for bit), an error that grows with the line-of-sight rate (a fast crossing outruns him) and
 * a ranging-in that settles while he holds one target. A salvo is one round carrying the hit scale of
 * every round it stands for; it flies in `stepCombat`'s AA branch, which hits only hostile airplanes.
 *
 * Skill is the bomber pilot's `PilotSkill`, E1's mechanism, so whatever scales it (M5) scales the gunners:
 * the aim error is `aimErrorScale x aimErrorRad`, and both the first-sight delay and the ranging-in time
 * follow `reactionS`. A bomber with no pilot has green gunners.
 */
export const GUNNER_TUNING = {
  /** A gunner opens fire inside this range, meters (about 765 yd). ESTIMATE. */
  rangeM: 700,
  /** Salvos per second per mount; a salvo's weight is the rounds its guns fire in that time. */
  salvosPerS: 6,
  /** A round lives this long past the time it takes to reach `rangeM`. */
  lifeMargin: 1.25,
  /** A target slower than this is parked, not flying: never shot at. */
  airborneMps: 20,
  /** Aim error (radians, standard deviation per axis) = (aimErrorScale x PilotSkill.aimErrorRad
   *  + trackLagS x the line-of-sight rate above slewFreeRadPerS) x the ranging factor. */
  aimErrorScale: 2.5,
  trackLagS: 0.2,
  slewFreeRadPerS: 0.05,
  /** Per-salvo scatter, radians. */
  dispersionRad: 0.004,
  /** The aim error is redrawn this often, seconds. */
  errorWindowS: 0.5,
  /** Ranging in: the error is multiplied by 1 + extra, falling to 1 over `sPerReactionS x reactionS`
   *  seconds on one target (a veteran's 0.3 s reaction settles faster than a green's 1.0 s). A new target,
   *  or a gap of `forgetS` without a salvo, starts over. */
  settle: { extra: 6, sPerReactionS: 18, forgetS: 3 },
  /** Hold fire while a friendly airplane is within this angle of the line of fire, no farther than the
   *  target plus `holdFireBeyondM` (7e's rule for AI pilots, `holdFire.ts`). */
  holdFireConeRad: 0.1,
  holdFireBeyondM: 100,
  /** Every Nth salvo is a tracer. */
  tracerEvery: 2,
  /** Cost bound: no gunner fires while this many gunner rounds are in the air. */
  maxLiveRounds: 400,
}

export type GunnerState = {
  /** The tick each mount (`<aircraft>#<index>`) may fire next; absent until it first has a target. */
  readonly nextFire: Readonly<Record<string, number>>
  /** The tick each mount's current engagement began, and on whom. */
  readonly engagedSince: Readonly<Record<string, number>>
  readonly engagedOn: Readonly<Record<string, string>>
}
const EMPTY: GunnerState = { nextFire: {}, engagedSince: {}, engagedOn: {} }

/** What `stepGunners` reads of each airplane: the combat record's view plus the pilot, whose skill the gunners share. */
export type GunnerAircraft = {
  readonly id: string; readonly spec: AircraftSpec; readonly impact: unknown | null
  readonly state: { readonly position: Vec3; readonly velocity: Vec3; readonly attitude: Quat }
  readonly pilot?: { readonly skill: PilotSkill } | null | undefined
}

/** A salvo for `stepCombat` to fly (it adds the id). `aa` is its hit scale, `gunner` routes its drag. */
export type GunnerRound = {
  readonly owner: string; readonly position: Vec3; readonly previous: Vec3; readonly velocity: Vec3
  readonly lifeS: number; readonly tracer: boolean; readonly kind: 'round'; readonly ageS: 0
  readonly aa: number; readonly gunner: true; readonly gunType?: string
}

export type GunnerStep = {
  readonly gunners: GunnerState | undefined
  readonly rounds: readonly GunnerRound[]
  /** Salvos fired this tick, by airplane: what its `shots` (and so its gun sound) follows. */
  readonly salvos: Readonly<Record<string, number>>
}

const hashes = new Map<string, number>()
const hashOf = (key: string): number => {
  let h = hashes.get(key)
  if (h === undefined) { h = idSeed(key); hashes.set(key, h) }
  return h
}
// aaFire.ts's mixer, so a gunner's draws are as well spread as a mount's.
const mixInt = (a: number, b: number): number => (Math.imul((a ^ Math.imul(b, 0x9e3779b1)) >>> 0, 0x85ebca6b) ^ (a >>> 15)) >>> 0

const conj = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w })
const DEG = Math.PI / 180

/** Whether a body-frame direction is inside a gunner's arc. */
export function inArc(body: Vec3, g: NonNullable<NonNullable<AircraftSpec['combat']>['gunners']>[number]): boolean {
  const el = Math.atan2(body.y, Math.hypot(body.x, body.z)) / DEG
  if (el < g.elevationDeg[0] || el > g.elevationDeg[1]) return false
  if (g.traverseDeg === null) return true
  const az = Math.atan2(body.z, body.x) / DEG - g.restHeadingDeg
  return Math.abs(((az + 540) % 360) - 180) <= g.traverseDeg
}

/** Line-of-sight rate, radians per second, of a target at `rel` moving at `relVel` relative to the gun. */
function losRate(rel: Vec3, relVel: Vec3): number {
  const range = length(rel)
  if (range < 1) return 0
  const dir = scale(rel, 1 / range)
  return length(sub(relVel, scale(dir, dot(relVel, dir)))) / range
}

/** A same-side airplane within `holdFireConeRad` of `dir` from `origin`, no farther than `limitM`. */
function friendlyNearLine(
  flying: readonly GunnerAircraft[], self: string, side: Side, sides: Readonly<Record<string, Side>>, origin: Vec3, dir: Vec3, limitM: number,
): boolean {
  const cos = Math.cos(GUNNER_TUNING.holdFireConeRad)
  for (const f of flying) {
    if (f.id === self || sides[f.id] !== side) continue
    const to = sub(f.state.position, origin), r = length(to)
    if (r > 1e-6 && r <= limitM && dot(dir, to) / r >= cos) return true
  }
  return false
}

/**
 * One tick of every gunner. `doomed(id)`: burning, destroyed or gone (neither fires nor is fired at).
 * `liveRounds` is how many gunner rounds are in the air. Returns `gunners` unchanged (possibly undefined)
 * when nothing happened, so a world with no gunner, or no target, carries no new state.
 */
export function stepGunners(
  gunners: GunnerState | undefined, aircraft: readonly GunnerAircraft[], sides: Readonly<Record<string, Side>>,
  doomed: (id: string) => boolean, seed: number, tick: number, dt: number, liveRounds: number,
): GunnerStep {
  const T = GUNNER_TUNING
  const before = gunners ?? EMPTY
  const rounds: GunnerRound[] = []
  const salvos: Record<string, number> = {}
  let nextFire: Record<string, number> | null = null
  let engagedSince: Record<string, number> | null = null
  let engagedOn: Record<string, string> | null = null
  let live = liveRounds
  const airborne = (a: GunnerAircraft): boolean => {
    const v = a.state.velocity
    return a.impact === null && !doomed(a.id) && v.x * v.x + v.y * v.y + v.z * v.z >= T.airborneMps * T.airborneMps
  }
  const flying = aircraft.filter(airborne)

  for (const a of flying) {
    const list = a.spec.combat?.gunners
    const side = sides[a.id]
    if (list === undefined || list.length === 0 || side === undefined) continue
    const hostile = flying.filter((t) => sides[t.id] !== undefined && sides[t.id] !== side && t.spec.combat !== undefined
      && length(sub(t.state.position, a.state.position)) <= T.rangeM + 30)
    if (hostile.length === 0) continue
    const skill = a.pilot?.skill ?? GREEN_SKILL
    const inv = conj(a.state.attitude)
    const own = a.state.velocity
    for (let i = 0; i < list.length; i++) {
      const g = list[i]!
      const key = `${a.id}#${i}`
      const mh = hashOf(key)
      const origin = add(a.state.position, qRotate(a.state.attitude, { x: g.position[0], y: g.position[1], z: g.position[2] }))
      // The nearest hostile in range and inside this gun's arc.
      let best: GunnerAircraft | null = null
      let bestD = T.rangeM
      for (const t of hostile) {
        const rel = sub(t.state.position, origin)
        const d = length(rel)
        if (d > bestD || d < 1 || !inArc(qRotate(inv, scale(rel, 1 / d)), g)) continue
        best = t; bestD = d
      }
      if (best === null) continue
      const ballistic = gunBallistics(a.spec.combat!, g.type)
      const intervalTicks = Math.max(1, Math.round(1 / (T.salvosPerS * dt)))
      const due = (nextFire ?? before.nextFire)[key]
      const on = (engagedOn ?? before.engagedOn)[key]
      if (due === undefined || on !== best.id) {
        // First sight of this target: the gunner's reaction, a little different for every gun.
        nextFire ??= { ...before.nextFire }
        engagedSince ??= { ...before.engagedSince }
        engagedOn ??= { ...before.engagedOn }
        nextFire[key] = tick + Math.max(1, Math.round(skill.reactionS / dt)) + (mh % intervalTicks)
        engagedSince[key] = tick
        engagedOn[key] = best.id
        continue
      }
      if (due > tick || live >= T.maxLiveRounds) continue
      const rel = sub(best.state.position, origin)
      const lifeS = (T.rangeM / ballistic.muzzleVelocityMps) * T.lifeMargin
      const solved = solveMuzzleLead(rel, own, best.state.velocity, ballistic.muzzleVelocityMps, ballistic.dragPerM, lifeS)
      if (solved === null || !inArc(qRotate(inv, solved), g)) continue
      // Hold fire with a friendly near the line (never through a wingman).
      if (friendlyNearLine(flying, a.id, side, sides, origin, solved, bestD + T.holdFireBeyondM)) continue
      let since = (engagedSince ?? before.engagedSince)[key] ?? tick
      if ((tick - (due - intervalTicks)) * dt > Math.max(T.settle.forgetS, 2 * intervalTicks * dt)) {
        engagedSince ??= { ...before.engagedSince }
        engagedSince[key] = since = tick
      }
      const settleS = Math.max(dt, T.settle.sPerReactionS * skill.reactionS)
      const ranging = 1 + T.settle.extra * Math.max(0, 1 - ((tick - since) * dt) / settleS)
      const rate = losRate(rel, sub(best.state.velocity, own))
      const sigma = (T.aimErrorScale * skill.aimErrorRad + T.trackLagS * Math.max(0, rate - T.slewFreeRadPerS)) * ranging
      const windowTicks = Math.max(1, Math.round(T.errorWindowS / dt))
      const error = aimErrorDraw(mixInt(mixInt(seed, mh), Math.floor(tick / windowTicks)), sigma)
      const scatter = aimErrorDraw(mixInt(mixInt(seed, mh), tick ^ 0x2545), T.dispersionRad)
      const dir = aimWithError(solved, { right: error.right + scatter.right, up: error.up + scatter.up })
      const weight = (ballistic.hitScale * g.barrels * ballistic.roundsPerMinute) / 60 / T.salvosPerS
      rounds.push({
        owner: a.id, position: origin, previous: origin, velocity: add(own, scale(dir, ballistic.muzzleVelocityMps)),
        lifeS, tracer: (Math.floor(tick / intervalTicks) + mh) % T.tracerEvery === 0, kind: 'round', ageS: 0,
        aa: weight, gunner: true, ...(g.type === undefined ? {} : { gunType: g.type }),
      })
      live++
      salvos[a.id] = (salvos[a.id] ?? 0) + 1
      nextFire ??= { ...before.nextFire }
      nextFire[key] = tick + intervalTicks
    }
  }
  if (nextFire === null && engagedSince === null && engagedOn === null) return { gunners, rounds, salvos }
  return {
    gunners: { nextFire: nextFire ?? before.nextFire, engagedSince: engagedSince ?? before.engagedSince, engagedOn: engagedOn ?? before.engagedOn },
    rounds, salvos,
  }
}
