import { createRng } from '../rng.js'
import { add, length, normalize, scale, sub, v3, type Vec3 } from '../math/vec3.js'
import { solveMuzzleLead, aimWithError } from '../ai/pursuit.js'
import { aimErrorDraw } from '../ai/noise.js'
import { idSeed } from '../damage/model.js'
import type { Side } from '../sides.js'
import type { ShipArmament } from '../world/ships.js'

/**
 * Anti-aircraft fire (Track M, M2). Ships' `armament` and ground `aaa`
 * structures share this one system. Heavy mounts throw timed flak bursts;
 * light mounts fire tracer rounds through `stepCombat`'s ballistics.
 *
 * Pure: no PRNG cursor and no clock. Every random number is a hash of
 * (seed, mount, time window), so a world replays identically and a world with
 * no AA mount (or no target in range) draws nothing and returns its state
 * unchanged. The director below ("nearest valid enemy in range, E1's lead,
 * aim error from a per-mount skill") is the seam M3, gun-laying AI, replaces:
 * `stepAa` is the only thing `stepCombat` calls.
 */

/**
 * EVERY tuning number for AA lives here, so M5 (global difficulty) can scale
 * lethality in one place. Calibrated 2026-10-10 against the Moderate target
 * (tests/sim/weapons/aaLethality.test.ts): lingering at about 300 ft over an
 * anchored Fletcher costs a Hellcat in roughly 20 s; a fast straight pass at
 * that height usually survives. Ranges are metres, rates per second.
 */
export const AA_TUNING = {
  /** A target moving slower than this is parked, not airborne: never shot at. */
  airborneMps: 20,
  /** An unrecognizable kit (or none) fires as this caliber. */
  defaultCaliber: '20mm' as const,
  light: {
    /** Per caliber: effective range, muzzle velocity, salvos per second per mount, and the
     *  `hitScale` one round does to an airplane (`damageFromHit`: 1 is one .50-cal hit, 10 HP). */
    '20mm': { rangeM: 900, muzzleMps: 840, salvosPerS: 4, hitScale: 3 },
    '25mm': { rangeM: 1100, muzzleMps: 900, salvosPerS: 4, hitScale: 4 },
    '40mm': { rangeM: 1500, muzzleMps: 880, salvosPerS: 2.5, hitScale: 8 },
    /** A round stands for the whole mount's salvo: its hit scale is multiplied by the barrel count up to this. */
    maxBarrelWeight: 1,
    dragPerM: 0.0004,
    /** A round lives this long past the time it takes to reach its range. */
    lifeMargin: 1.25,
    /** Aim error (radians, standard deviation per axis) = base + trackLagS * (line-of-sight rate above what the mount
     *  tracks cleanly, rad/s), times the mount's skill and the ranging factor. Fast crossings outrun the gun. */
    aimErrorRad: 0.011,
    slewFreeRadPerS: 0.3,
    trackLagS: 0.3,
    /** Per-round scatter, radians. */
    dispersionRad: 0.004,
    /** The aim error is redrawn this often. */
    errorWindowS: 1,
    /** Every Nth salvo is a tracer. */
    tracerEvery: 2,
  },
  heavy: {
    /** A fuse-timed shell. It is not flown: the burst point is fixed when it leaves. */
    shellSpeedMps: 600,
    minRangeM: 500,
    maxRangeM: 5500,
    /** Against a target below `lowAltitudeM` (clutter, a short horizon) the heavy guns reach only this far. */
    lowAltitudeM: 300,
    maxRangeLowM: 2500,
    maxAltitudeM: 8000,
    /** Rounds per minute per barrel (the 5"/38 fires 15 to 20). */
    roundsPerMinutePerBarrel: 15,
    maxBarrels: 2,
    /** The director leads a turning target by its present acceleration (capped), not only its velocity. */
    maxTurnAccelMps2: 30,
    aimErrorRad: 0.014,
    slewFreeRadPerS: 0.2,
    trackLagS: 0.1,
    /** Fuse-time error, standard deviation, seconds (times skill). */
    fuseErrorS: 0.06,
    errorWindowS: 2,
    /** A burst damages every hostile airplane within this radius, by peak * (1 - d / radius) HP of structure
     *  (blast damage, like a bomb's; a Hellcat has 480). */
    burstRadiusM: 40,
    burstPeakHp: 110,
  },
  /** Ranging in. A mount that has just found a target shoots wide: its error is multiplied by 1 + extra, falling
   *  linearly to 1 after `lightS` / `heavyS` seconds of engagement (a gap of `forgetS` seconds (or two salvo intervals, if longer) without a salvo
   *  starts over, as does a line-of-sight rate above `loseTrackRadPerS`: an airplane flown over a gun outruns its
   *  traverse and the crew must find it again). This is what separates a lingering airplane, which the gunners settle on, from a fast pass,
   *  which is over before they do. */
  settle: { extra: 6, lightS: 15, heavyS: 40, forgetS: 3, loseTrackRadPerS: 0.8 },
  /** Per-mount skill: each mount's error scale is drawn once, uniform in [skillMin, skillMax]. */
  skillMin: 0.6,
  skillMax: 1.4,
  /** Cost bounds. */
  maxLiveRounds: 600,
  maxPendingBursts: 192,
  /** A light gun counts as "firing" for the audio this long after its last salvo. */
  firingHoldTicks: 30,
} as const

export type Caliber = '20mm' | '25mm' | '40mm'
const CALIBERS: readonly Caliber[] = ['20mm', '25mm', '40mm']

export type AaMount = {
  readonly tier: 'heavy' | 'light'
  readonly caliber: Caliber
  /** Ship frame, metres: +x bow, +y up from the waterline, +z starboard. */
  readonly x: number; readonly y: number; readonly z: number
  readonly barrels: number
}
export type AaMounts = { readonly mounts: readonly AaMount[]; readonly reachM: number }

const caliberOf = (kit: string | null): Caliber => {
  const m = kit === null ? null : /(\d+)mm/.exec(kit)
  const c = m === null ? undefined : CALIBERS.find((k) => k === `${m[1]}mm`)
  return c ?? AA_TUNING.defaultCaliber
}

const cache = new WeakMap<ShipArmament, AaMounts>()
/** A warship's armament as AA mounts: `turrets` marked `aa: 'heavy'` and `heavyAA` are heavy, `lightAA` is light. */
export function mountsOf(armament: ShipArmament): AaMounts {
  const hit = cache.get(armament)
  if (hit !== undefined) return hit
  const mounts: AaMount[] = []
  for (const t of armament.turrets) if (t.aa === 'heavy') mounts.push({ tier: 'heavy', caliber: '20mm', x: t.x, y: t.y, z: t.z, barrels: t.barrels })
  for (const m of armament.heavyAA) mounts.push({ tier: 'heavy', caliber: '20mm', x: m.x, y: m.y, z: m.z, barrels: m.barrels })
  for (const m of armament.lightAA) mounts.push({ tier: 'light', caliber: caliberOf(m.kit), x: m.x, y: m.y, z: m.z, barrels: m.barrels })
  const out = { mounts, reachM: reachOf(mounts) }
  cache.set(armament, out)
  return out
}

const reachOf = (mounts: readonly AaMount[]): number =>
  mounts.reduce((r, m) => Math.max(r, m.tier === 'heavy' ? AA_TUNING.heavy.maxRangeM : AA_TUNING.light[m.caliber].rangeM), 0)

/** A ground battery: one heavy gun and one light twin on the structure. */
const BATTERY_MOUNTS: AaMounts = (() => {
  const mounts: AaMount[] = [
    { tier: 'heavy', caliber: '20mm', x: 0, y: 0, z: 0, barrels: 1 },
    { tier: 'light', caliber: '40mm', x: 3, y: 0, z: 0, barrels: 2 },
  ]
  return { mounts, reachM: reachOf(mounts) }
})()

/** One burst in flight: where it goes off, and when (the tick). */
export type FlakBurst = { readonly owner: string; readonly side: Side; readonly point: Vec3; readonly tick: number }
export type AaFiring = { readonly id: string; readonly at: Vec3; readonly tick: number }
export type AaState = {
  /** Mixed into every draw, so a sweep over seeds is a sweep over luck. */
  readonly seed: number
  /** The tick each mount (`<owner>#<index>`) may fire next; absent until it first has a target. */
  readonly nextFire: Readonly<Record<string, number>>
  /** The tick each mount's current engagement began (see `AA_TUNING.settle`). */
  readonly engagedSince: Readonly<Record<string, number>>
  readonly bursts: readonly FlakBurst[]
  /** Light guns that fired lately, for the audio (one entry per owner). */
  readonly firing: readonly AaFiring[]
}
export const initialAa = (seed = 1944): AaState => ({ seed: seed >>> 0, nextFire: {}, engagedSince: {}, bursts: [], firing: [] })

/** What `stepCombat` hands the director: an armed, live ship or battery. */
export type AaOwner = {
  readonly id: string; readonly side: Side; readonly mounts: AaMounts
  readonly position: Vec3; readonly previous: Vec3; readonly headingRad: number
}
/** A live airborne airplane. */
export type AaTarget = { readonly id: string; readonly side: Side; readonly position: Vec3; readonly velocity: Vec3; readonly accel: Vec3 }

/** A round for `stepCombat` to fly: it adds the id. `aa` is the hit scale. */
export type AaRound = {
  readonly owner: string; readonly position: Vec3; readonly previous: Vec3; readonly velocity: Vec3
  readonly lifeS: number; readonly tracer: boolean; readonly kind: 'round'; readonly ageS: 0; readonly aa: number
}

type ShipLike = {
  readonly id: string; readonly spec: { readonly armament?: ShipArmament | undefined }
  readonly state: { readonly position: Vec3; readonly headingRad: number }; readonly previous: { readonly position: Vec3 }
}
type StructureLike = { readonly id: string; readonly kind: string; readonly position: Vec3 }

/** Every armed ship afloat and every standing battery, with its side. A ship or battery with no side entry
 *  (`targetSides` missing it) is skipped: no side, no hostile. */
export function aaOwnersOf(
  ships: readonly ShipLike[], structures: readonly StructureLike[],
  shipSides: Readonly<Record<string, Side>> | undefined, structureSides: Readonly<Record<string, Side>> | undefined,
  shipDown: (id: string) => boolean, structureDown: (id: string) => boolean,
): AaOwner[] {
  const out: AaOwner[] = []
  for (const s of ships) {
    const side = shipSides?.[s.id]
    if (side === undefined || s.spec.armament === undefined || shipDown(s.id)) continue
    out.push({ id: s.id, side, mounts: mountsOf(s.spec.armament), position: s.state.position, previous: s.previous.position, headingRad: s.state.headingRad })
  }
  for (const s of structures) {
    const side = structureSides?.[s.id]
    if (side === undefined || s.kind !== 'aaa' || structureDown(s.id)) continue
    out.push({ id: s.id, side, mounts: BATTERY_MOUNTS, position: s.position, previous: s.position, headingRad: 0 })
  }
  return out
}

/** Every airplane that can be shot at: airborne (fast enough), not burning, down or crashed. */
export function aaTargetsOf(
  aircraft: readonly {
    readonly id: string; readonly impact: unknown
    readonly state: { readonly position: Vec3; readonly velocity: Vec3 }; readonly previous: { readonly velocity: Vec3 }
  }[],
  dt: number,
  sides: Readonly<Record<string, Side>>,
  doomed: (id: string) => boolean,
): AaTarget[] {
  const out: AaTarget[] = []
  const floor2 = AA_TUNING.airborneMps * AA_TUNING.airborneMps
  for (const a of aircraft) {
    const side = sides[a.id]
    if (side === undefined || a.impact !== null || doomed(a.id)) continue
    const v = a.state.velocity
    if (v.x * v.x + v.y * v.y + v.z * v.z < floor2) continue
    // The heavy director's turn estimate: the change in velocity over the last tick, capped (3 g).
    const acc = scale(sub(v, a.previous.velocity), 1 / dt)
    const accLen = length(acc)
    out.push({ id: a.id, side, position: a.state.position, velocity: v, accel: accLen > AA_TUNING.heavy.maxTurnAccelMps2 ? scale(acc, AA_TUNING.heavy.maxTurnAccelMps2 / accLen) : acc })
  }
  return out
}

/** The blast a burst does at `distanceM` from its point, in structure HP, or `null` out of range. */
export function flakBlastHp(distanceM: number): number | null {
  const h = AA_TUNING.heavy
  return distanceM < h.burstRadiusM ? h.burstPeakHp * (1 - distanceM / h.burstRadiusM) : null
}

const hashes = new Map<string, number>()
const hashOf = (key: string): number => {
  let h = hashes.get(key)
  if (h === undefined) { h = idSeed(key); hashes.set(key, h) }
  return h
}
const mixInt = (a: number, b: number): number => (Math.imul((a ^ Math.imul(b, 0x9e3779b1)) >>> 0, 0x85ebca6b) ^ (a >>> 15)) >>> 0

/** The mount's skill scale, drawn once per (seed, mount). */
const skillOf = (seed: number, mountHash: number): number =>
  AA_TUNING.skillMin + (AA_TUNING.skillMax - AA_TUNING.skillMin) * createRng(mixInt(seed, mountHash))()

/** World position of a ship-frame point. */
function mountWorld(o: AaOwner, m: AaMount): Vec3 {
  const h = o.headingRad
  const fx = Math.sin(h), fz = -Math.cos(h)
  const sx = Math.cos(h), sz = Math.sin(h)
  return v3(o.position.x + fx * m.x + sx * m.z, o.position.y + m.y, o.position.z + fz * m.x + sz * m.z)
}

const horizontal = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.z - b.z)

/** Line-of-sight rate, radians per second, of `target` seen from `origin` moving at `own`. */
function losRate(origin: Vec3, own: Vec3, target: AaTarget): number {
  const rel = sub(target.position, origin)
  const range = length(rel)
  if (range < 1) return 0
  const dir = scale(rel, 1 / range)
  const vr = sub(target.velocity, own)
  const along = vr.x * dir.x + vr.y * dir.y + vr.z * dir.z
  return length(sub(vr, scale(dir, along))) / range
}

export type AaStep = {
  readonly aa: AaState
  /** Light rounds to fly this tick, in a stable order. */
  readonly rounds: readonly AaRound[]
}

/**
 * One tick of AA fire. `liveRounds` is how many AA rounds are already in the air (the cap).
 * Returns the same `aa` object when nothing changed.
 */
export function stepAa(aa: AaState, owners: readonly AaOwner[], targets: readonly AaTarget[], tick: number, dt: number, liveRounds: number): AaStep {
  const NONE: AaStep = { aa, rounds: [] }
  const L = AA_TUNING.light, H = AA_TUNING.heavy
  const rounds: AaRound[] = []
  let nextFire: Record<string, number> | null = null
  let engagedSince: Record<string, number> | null = null
  let bursts: FlakBurst[] | null = null
  const firing = new Map<string, AaFiring>()
  let live = liveRounds

  if (targets.length > 0) {
    for (const o of owners) {
      // Ship-level early-out: no hostile inside the owner's longest reach, no mount is touched.
      const hostile: AaTarget[] = []
      for (const t of targets) if (t.side !== o.side && horizontal(o.position, t.position) <= o.mounts.reachM + 50) hostile.push(t)
      if (hostile.length === 0) continue
      const ownVel = scale(sub(o.position, o.previous), 1 / dt)
      for (let i = 0; i < o.mounts.mounts.length; i++) {
        const m = o.mounts.mounts[i]!
        const key = `${o.id}#${i}`
        const mh = hashOf(key)
        const origin = mountWorld(o, m)
        const heavy = m.tier === 'heavy'
        const rangeCap = heavy ? H.maxRangeM : L[m.caliber].rangeM
        // The nearest hostile in this mount's envelope.
        let best: AaTarget | null = null
        let bestD = Infinity
        for (const t of hostile) {
          const d = length(sub(t.position, origin))
          if (d > rangeCap || d >= bestD) continue
          if (heavy && (d < H.minRangeM || t.position.y - origin.y > H.maxAltitudeM || (t.position.y < H.lowAltitudeM && d > H.maxRangeLowM))) continue
          best = t; bestD = d
        }
        if (best === null) continue
        const salvosPerS = heavy ? (H.roundsPerMinutePerBarrel * Math.min(m.barrels, H.maxBarrels)) / 60 : L[m.caliber].salvosPerS
        const intervalTicks = Math.max(1, Math.round(1 / (salvosPerS * dt)))
        const due = (nextFire ?? aa.nextFire)[key]
        if (due === undefined) {
          // First sight of a target: a reaction delay, different for every mount.
          nextFire ??= { ...aa.nextFire }
          nextFire[key] = tick + 1 + (mh % intervalTicks)
          engagedSince ??= { ...aa.engagedSince }
          engagedSince[key] = tick
          continue
        }
        if (due > tick) continue
        const rate = losRate(origin, ownVel, best)
        let since = (engagedSince ?? aa.engagedSince)[key] ?? tick
        if ((tick - (due - intervalTicks)) * dt > Math.max(AA_TUNING.settle.forgetS, 2 * intervalTicks * dt) || rate > AA_TUNING.settle.loseTrackRadPerS) {
          engagedSince ??= { ...aa.engagedSince }
          engagedSince[key] = since = tick
        }
        const ranging = 1 + AA_TUNING.settle.extra * Math.max(0, 1 - ((tick - since) * dt) / (heavy ? AA_TUNING.settle.heavyS : AA_TUNING.settle.lightS))
        const skill = skillOf(aa.seed, mh) * ranging
        const windowTicks = Math.round((heavy ? H.errorWindowS : L.errorWindowS) / dt)
        const window = Math.floor(tick / windowTicks)
        const sigma = ((heavy ? H.aimErrorRad : L.aimErrorRad) + (heavy ? H.trackLagS : L.trackLagS) * Math.max(0, rate - (heavy ? H.slewFreeRadPerS : L.slewFreeRadPerS))) * skill
        const error = aimErrorDraw(mixInt(mixInt(aa.seed, mh), window), sigma)
        if (heavy) {
          if (bursts === null) bursts = [...aa.bursts]
          if (bursts.length >= AA_TUNING.maxPendingBursts) continue
          // Constant-speed shell against the target flown on at its present velocity and turn.
          let t = bestD / H.shellSpeedMps
          let aim = sub(best.position, origin)
          for (let k = 0; k < 3; k++) {
            aim = sub(add(add(best.position, scale(best.velocity, t)), scale(best.accel, 0.5 * t * t)), origin)
            t = length(aim) / H.shellSpeedMps
          }
          const fuseS = Math.max(0.2, t + aimErrorDraw(mixInt(mixInt(aa.seed, mh), window ^ 0x5bd1), H.fuseErrorS * skill).right)
          const dir = aimWithError(normalize(aim), error)
          const point = add(origin, scale(dir, fuseS * H.shellSpeedMps))
          bursts.push({ owner: o.id, side: o.side, point, tick: tick + Math.max(1, Math.round(fuseS / dt)) })
        } else {
          if (live >= AA_TUNING.maxLiveRounds) continue
          const c = L[m.caliber]
          const solved = solveMuzzleLead(sub(best.position, origin), ownVel, best.velocity, c.muzzleMps, L.dragPerM, (c.rangeM / c.muzzleMps) * L.lifeMargin)
          if (solved === null) continue
          const scatter = aimErrorDraw(mixInt(mixInt(aa.seed, mh), tick ^ 0x2545), L.dispersionRad)
          const dir = aimWithError(solved, { right: error.right + scatter.right, up: error.up + scatter.up })
          const volley = Math.floor(tick / intervalTicks) + mh
          rounds.push({
            owner: o.id, position: origin, previous: origin, velocity: add(ownVel, scale(dir, c.muzzleMps)),
            lifeS: (c.rangeM / c.muzzleMps) * L.lifeMargin, tracer: volley % L.tracerEvery === 0, kind: 'round', ageS: 0,
            aa: c.hitScale * Math.min(m.barrels, L.maxBarrelWeight),
          })
          live++
          if (!firing.has(o.id)) firing.set(o.id, { id: o.id, at: origin, tick })
        }
        nextFire ??= { ...aa.nextFire }
        nextFire[key] = tick + intervalTicks
      }
    }
  }

  // The audio's list: this tick's firing guns, plus the earlier ones still inside the hold.
  let firingList: readonly AaFiring[] = aa.firing
  if (firing.size > 0 || aa.firing.length > 0) {
    const kept = aa.firing.filter((f) => !firing.has(f.id) && tick - f.tick <= AA_TUNING.firingHoldTicks)
    const next = [...kept, ...firing.values()]
    if (next.length !== aa.firing.length || firing.size > 0) firingList = next
  }
  if (nextFire === null && bursts === null && rounds.length === 0 && firingList === aa.firing) return NONE
  return { aa: { ...aa, nextFire: nextFire ?? aa.nextFire, engagedSince: engagedSince ?? aa.engagedSince, bursts: bursts ?? aa.bursts, firing: firingList }, rounds }
}

/** The bursts that go off this tick (or are overdue), and the state without them. */
export function takeDueBursts(aa: AaState, tick: number): { readonly aa: AaState; readonly due: readonly FlakBurst[] } {
  if (aa.bursts.length === 0) return { aa, due: [] }
  const due = aa.bursts.filter((b) => b.tick <= tick)
  return due.length === 0 ? { aa, due } : { aa: { ...aa, bursts: aa.bursts.filter((b) => b.tick > tick) }, due }
}
