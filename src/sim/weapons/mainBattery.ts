import { createRng } from '../rng.js'
import { aimErrorDraw } from '../ai/noise.js'
import { idSeed } from '../damage/model.js'
import { v3, type Vec3 } from '../math/vec3.js'
import type { ShipArmament } from '../world/ships.js'
import { gunLayingPose, type GunLayingPose } from './gunLaying.js'
import type { AaOwner, AaState, AaSurfaceTarget } from './aaFire.js'

/**
 * Main batteries (Track M, M4; plan docs/superpowers/plans/2026-10-10-m4-main-batteries.md).
 *
 * A turret fires at the surface target M3 already chose for it (`aa.laying`), with a real shell: a
 * fitted drag, an elevation solved over the same integration `flyProjectile` runs, a lead on the
 * target's present velocity, and a fire-control error that settles as the turret ranges in. A shell
 * takes `hullHp` by its weight and can knock out a mount it bursts near.
 *
 * Pure and deterministic: every random number is a hash of (seed, mount, tick), as in M2. Only a world
 * whose combat state carries `mainBattery` (scenario `"mainBatteries": true`) fires at all.
 */

/** Every M4 tuning number. Calibrated 2026-10-10 with the duel tables in the M4 handoff
 *  (tests/sim/weapons/duel.test.ts pins them). Meters, seconds. */
export const MAIN_BATTERY = {
  /** Shell damage = damagePerKg06 * shellKg^0.6 (a 14-inch shell 110, a 5-inch 16). */
  damagePerKg06: 2.289,
  /** No fire control in the game reaches farther than this, whatever the gun's range. */
  fireControlMaxM: 25_000,
  /** A gun engages out to this share of its cited maximum range (no 45-degree lobs). */
  engageRangeFraction: 0.9,
  /** Seconds from first sight to the first salvo, plus up to one salvo interval by mount. */
  reactionS: 6,
  /** A turret will not fire within this angle of straight back over its own ship (ruling R5). */
  maxTrainingRad: (150 * Math.PI) / 180,
  /** Salvo aim error, standard deviation, as a share of range: along the line of fire, and across it. */
  rangeErrorFraction: 0.024,
  deflectionErrorFraction: 0.006,
  /** Ranging in: the error is (1 + extra) times wider on first sight, settling linearly over settleS. */
  settle: { extra: 3, settleS: 90 },
  /** Per-shell spread within a salvo, as a share of range. */
  shellSpreadRangeFraction: 0.004,
  shellSpreadDeflectionFraction: 0.001,
  /** Per-mount skill, uniform in [min, max], multiplying every error. */
  skillMin: 0.7,
  skillMax: 1.3,
  /** A ship is aimed at this height above its waterline. */
  shipAimHeightM: 3,
  /** A burst within a shell's knock-out radius of a mount knocks it out with this chance, falling to 0 at the radius. */
  knockOutChance: 0.6,
  /** A shell's blast (near misses, a battery's surroundings) peaks at its damage and reaches this many knock-out radii. */
  blastRadiusFactor: 1,
  /** Cap on main-battery shells in the air. */
  maxLiveShells: 400,
} as const

/** One gun, by kit. Figures are period ones (rounded), read 2026-10-10 from NavWeaps' gun pages
 *  (navweaps.com), ESTIMATE where noted; `knockOutM` is a game choice. */
export type ShellSpec = {
  readonly caliber: string
  readonly shellKg: number
  readonly muzzleMps: number
  /** Cited maximum range at the gun's best elevation. The drag is fitted so a 45-degree shot reaches it. */
  readonly maxRangeM: number
  readonly roundsPerMinutePerBarrel: number
  readonly knockOutM: number
}
export const SHELLS: Readonly<Record<string, ShellSpec>> = {
  'mount-5in38-single': { caliber: '5"/38', shellKg: 25, muzzleMps: 792, maxRangeM: 15_900, roundsPerMinutePerBarrel: 15, knockOutM: 6 },
  'mount-5in38-single-open': { caliber: '5"/38', shellKg: 25, muzzleMps: 792, maxRangeM: 15_900, roundsPerMinutePerBarrel: 15, knockOutM: 6 },
  'mount-127mm-twin-ijn': { caliber: '12.7 cm/40 Type 89', shellKg: 23, muzzleMps: 720, maxRangeM: 14_700, roundsPerMinutePerBarrel: 12, knockOutM: 6 },
  'turret-127mm-twin': { caliber: '12.7 cm/50 Type 3', shellKg: 23, muzzleMps: 910, maxRangeM: 18_400, roundsPerMinutePerBarrel: 10, knockOutM: 6 },
  'turret-140mm-single': { caliber: '14 cm/50 3rd Year Type', shellKg: 38, muzzleMps: 850, maxRangeM: 19_750, roundsPerMinutePerBarrel: 8, knockOutM: 7 },
  'turret-6in-triple': { caliber: '6"/47 Mk 16', shellKg: 54, muzzleMps: 762, maxRangeM: 23_900, roundsPerMinutePerBarrel: 8, knockOutM: 8 },
  'turret-155mm-triple': { caliber: '15.5 cm/60 3rd Year Type', shellKg: 56, muzzleMps: 920, maxRangeM: 27_400, roundsPerMinutePerBarrel: 6, knockOutM: 8 },
  'turret-8in-twin': { caliber: '20.3 cm/50 3rd Year Type No. 2', shellKg: 126, muzzleMps: 835, maxRangeM: 29_400, roundsPerMinutePerBarrel: 4, knockOutM: 10 },
  'turret-14in-triple': { caliber: '14"/45', shellKg: 635, muzzleMps: 792, maxRangeM: 31_000, roundsPerMinutePerBarrel: 1.75, knockOutM: 14 },
  'turret-18in-triple': { caliber: '46 cm/45 Type 94', shellKg: 1460, muzzleMps: 780, maxRangeM: 42_000, roundsPerMinutePerBarrel: 1.5, knockOutM: 16 },
}

export const shellDamage = (s: ShellSpec): number => MAIN_BATTERY.damagePerKg06 * Math.pow(s.shellKg, 0.6)

const G = 9.80665

/** The 2D flight `flyProjectile` integrates (no wind), from elevation `elev`, until the shell comes down
 *  through `dy` (meters relative to the muzzle). Returns horizontal range and time, or null if it never does. */
export function flyTo(elev: number, muzzleMps: number, dragPerM: number, dy: number, dt: number, maxS = 200): { readonly rangeM: number; readonly timeS: number } | null {
  let h = 0, y = 0, vh = muzzleMps * Math.cos(elev), vy = muzzleMps * Math.sin(elev), t = 0
  while (t < maxS) {
    const f = 1 / (1 + dragPerM * Math.hypot(vh, vy) * dt)
    const nvh = vh * f, nvy = vy * f - G * dt
    const nh = h + (vh + nvh) * dt / 2, ny = y + (vy + nvy) * dt / 2
    if (nvy < 0 && ny <= dy) {
      const k = y === ny ? 1 : Math.min(1, Math.max(0, (y - dy) / (y - ny)))
      return { rangeM: h + (nh - h) * k, timeS: t + k * dt }
    }
    h = nh; y = ny; vh = nvh; vy = nvy; t += dt
  }
  return null
}

const MAX_ELEV = Math.PI / 4
const MIN_ELEV = (-5 * Math.PI) / 180

const dragCache = new Map<string, number>()
/** The drag that makes a 45-degree shot land at the cited maximum range. Fitted once per kit and step. */
export function shellDragPerM(kit: string, dt: number): number {
  const key = `${kit}@${dt}`
  const hit = dragCache.get(key)
  if (hit !== undefined) return hit
  const s = SHELLS[kit]!
  let lo = Math.log(1e-7), hi = Math.log(1e-2)
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    const r = flyTo(MAX_ELEV, s.muzzleMps, Math.exp(mid), 0, dt)?.rangeM ?? 0
    if (r > s.maxRangeM) lo = mid
    else hi = mid
  }
  const k = Math.exp((lo + hi) / 2)
  dragCache.set(key, k)
  return k
}

/** The low-angle elevation that lands `rangeM` away at `dy` below (negative) or above the muzzle, or null beyond reach. */
export function solveElevation(rangeM: number, dy: number, muzzleMps: number, dragPerM: number, dt: number): { readonly elev: number; readonly timeS: number } | null {
  const top = flyTo(MAX_ELEV, muzzleMps, dragPerM, dy, dt)
  if (top === null || top.rangeM < rangeM) return null
  let lo = MIN_ELEV, hi = MAX_ELEV
  let best = top
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2
    const r = flyTo(mid, muzzleMps, dragPerM, dy, dt)
    if (r === null || r.rangeM < rangeM) lo = mid
    else { hi = mid; best = r }
  }
  return { elev: hi, timeS: best.timeS }
}

export type MainBatteryState = {
  /** Tick each turret (`<ship>#T<index>`) may fire next; absent until it has a target. */
  readonly nextFire: Readonly<Record<string, number>>
  /** The target each turret is ranging on, and since when (the settle clock). */
  readonly target: Readonly<Record<string, string>>
  readonly since: Readonly<Record<string, number>>
  /** The elevation of each turret's last solution, which its drawn guns hold between salvos. */
  readonly elevation: Readonly<Record<string, number>>
}
export const initialMainBattery = (): MainBatteryState => ({ nextFire: {}, target: {}, since: {}, elevation: {} })

/** A shell for `stepCombat` to fly; it adds the id. `shell` is the kit (`SHELLS`). */
export type ShellLaunch = {
  readonly owner: string; readonly position: Vec3; readonly previous: Vec3; readonly velocity: Vec3
  readonly lifeS: number; readonly tracer: false; readonly kind: 'round'; readonly ageS: 0; readonly shell: string
}
/** A salvo leaving a turret, for the impacts ring (audio and the muzzle effect). */
export type Salvo = { readonly ship: string; readonly mount: string; readonly point: Vec3; readonly shellKg: number }

const mixInt = (a: number, b: number): number => (Math.imul((a ^ Math.imul(b, 0x9e3779b1)) >>> 0, 0x85ebca6b) ^ (a >>> 15)) >>> 0
const hashes = new Map<string, number>()
const hashOf = (key: string): number => {
  let h = hashes.get(key)
  if (h === undefined) { h = idSeed(key); hashes.set(key, h) }
  return h
}

/** World position of a ship-frame point (+x bow, +y up, +z starboard), compass heading. */
export function shipPointWorld(position: Vec3, headingRad: number, x: number, y: number, z: number): Vec3 {
  const fx = Math.sin(headingRad), fz = -Math.cos(headingRad)
  const sx = Math.cos(headingRad), sz = Math.sin(headingRad)
  return v3(position.x + fx * x + sx * z, position.y + y, position.z + fz * x + sz * z)
}

/** Every named mount of an armament with its ship-frame point, in M2/M3's naming. */
export function namedMounts(a: ShipArmament): readonly { readonly name: string; readonly x: number; readonly y: number; readonly z: number }[] {
  return [
    ...a.turrets.map((m, i) => ({ name: `Turret${i + 1}`, x: m.x, y: m.y, z: m.z })),
    ...a.heavyAA.map((m, i) => ({ name: `HeavyAA${i + 1}`, x: m.x, y: m.y, z: m.z })),
    ...a.lightAA.map((m, i) => ({ name: `LightAA${i + 1}`, x: m.x, y: m.y, z: m.z })),
  ]
}

/**
 * The mounts a burst at `point` knocks out on a ship, beyond those already `out`. Each mount within
 * the shell's radius goes with a chance falling linearly to 0 at the radius, drawn from (seed, shell id, mount).
 */
export function knockOuts(
  armament: ShipArmament, position: Vec3, headingRad: number, point: Vec3, kit: string,
  out: readonly string[], seed: number, shellId: number,
): readonly string[] {
  const r = SHELLS[kit]!.knockOutM
  const hits: string[] = []
  namedMounts(armament).forEach((m, i) => {
    if (out.includes(m.name)) return
    const w = shipPointWorld(position, headingRad, m.x, m.y, m.z)
    const d = Math.hypot(w.x - point.x, w.y - point.y, w.z - point.z)
    if (d >= r) return
    const u = createRng(mixInt(mixInt(seed, shellId), i + 1))()
    if (u < MAIN_BATTERY.knockOutChance * (1 - d / r)) hits.push(m.name)
  })
  return hits
}

/** Where a turret should put a shell to meet `target`: its lead point and solution, iterating the time of flight. */
function leadSolution(origin: Vec3, target: AaSurfaceTarget, aimY: number, s: ShellSpec, drag: number, dt: number):
  { readonly point: Vec3; readonly rangeM: number; readonly elev: number; readonly timeS: number } | null {
  let t = 0
  let sol: { elev: number; timeS: number } | null = null
  let px = target.position.x, pz = target.position.z
  for (let i = 0; i < 3; i++) {
    px = target.position.x + target.velocity.x * t
    pz = target.position.z + target.velocity.z * t
    sol = solveElevation(Math.hypot(px - origin.x, pz - origin.z), aimY - origin.y, s.muzzleMps, drag, dt)
    if (sol === null) return null
    t = sol.timeS
  }
  return { point: v3(px, aimY, pz), rangeM: Math.hypot(px - origin.x, pz - origin.z), elev: sol!.elev, timeS: sol!.timeS }
}

/** A world direction from a horizontal bearing vector and an elevation. */
const directionOf = (hx: number, hz: number, elev: number): Vec3 => {
  const n = Math.hypot(hx, hz) || 1
  return v3((hx / n) * Math.cos(elev), Math.sin(elev), (hz / n) * Math.cos(elev))
}

export type MainBatteryStep = {
  readonly mainBattery: MainBatteryState
  /** This tick's poses with every firing turret's elevation replaced by its ballistic one. */
  readonly laying: AaState['laying']
  readonly shells: readonly ShellLaunch[]
  readonly salvos: readonly Salvo[]
}

/**
 * One tick of main-battery fire. `laying` is M3's pose map for this tick (already holding each
 * turret's chosen target), `previousLaying` last tick's (a knocked-out mount freezes in it), `out` the
 * mounts each ship has lost.
 */
export function stepMainBattery(
  mb: MainBatteryState, seed: number, owners: readonly AaOwner[], laying: AaState['laying'], previousLaying: AaState['laying'],
  targets: readonly AaSurfaceTarget[], out: (shipId: string) => readonly string[], tick: number, dt: number, liveShells: number,
): MainBatteryStep {
  const shells: ShellLaunch[] = []
  const salvos: Salvo[] = []
  let nextFire: Record<string, number> | null = null, target: Record<string, string> | null = null
  let since: Record<string, number> | null = null, elevation: Record<string, number> | null = null
  let nextLaying: Record<string, readonly GunLayingPose[]> | null = null
  const byId = new Map(targets.map((t) => [t.id, t]))
  let live = liveShells

  for (const o of owners) {
    const armament = o.armament
    if (armament === undefined) continue
    const lost = out(o.id)
    const poses = laying[o.id] ?? []
    let posesOut: GunLayingPose[] | null = null
    const replace = (pose: GunLayingPose): void => {
      posesOut ??= [...poses]
      const i = posesOut.findIndex((p) => p.name === pose.name)
      if (i >= 0) posesOut[i] = pose
      else posesOut.push(pose)
    }
    // A knocked-out mount freezes where it was.
    for (const name of lost) {
      const was = previousLaying[o.id]?.find((p) => p.name === name)
      if (was !== undefined) replace(was)
    }
    armament.turrets.forEach((turret, i) => {
      const name = `Turret${i + 1}`
      const kit = turret.kit
      const s = kit === null ? undefined : SHELLS[kit]
      if (s === undefined || kit === null || lost.includes(name)) return
      const pose = poses.find((p) => p.name === name)
      // No surface target, or a dual-purpose mount M2 has on an aircraft: nothing for M4 this tick.
      if (pose === undefined || pose.targetKind === 'aircraft') return
      const tgt = byId.get(pose.targetId)
      if (tgt === undefined) return
      const key = `${o.id}#T${i}`
      const mh = hashOf(key)
      const drag = shellDragPerM(kit, dt)
      const origin = shipPointWorld(o.position, o.headingRad, turret.x, turret.y + 2, turret.z)
      const aimY = tgt.kind === 'ship' ? tgt.position.y + MAIN_BATTERY.shipAimHeightM : tgt.position.y
      const reach = Math.min(MAIN_BATTERY.fireControlMaxM, s.maxRangeM * MAIN_BATTERY.engageRangeFraction)
      if (Math.hypot(tgt.position.x - origin.x, tgt.position.z - origin.z) > reach) return
      const restRad = (turret.bearingDeg * Math.PI) / 180
      const intervalTicks = Math.max(1, Math.round(60 / (s.roundsPerMinutePerBarrel * dt)))
      const due = (nextFire ?? mb.nextFire)[key]
      const newTarget = (target ?? mb.target)[key] !== tgt.id
      if (due === undefined || newTarget) {
        // First sight (or a new target): solve once for the pose, start the crew's reaction and the settle clock.
        const lead = leadSolution(origin, tgt, aimY, s, drag, dt)
        if (lead === null) return
        nextFire ??= { ...mb.nextFire }; target ??= { ...mb.target }; since ??= { ...mb.since }; elevation ??= { ...mb.elevation }
        nextFire[key] = Math.max(due ?? 0, tick + Math.round(MAIN_BATTERY.reactionS / dt) + (mh % intervalTicks))
        target[key] = tgt.id
        since[key] = tick
        elevation[key] = lead.elev
        const p = gunLayingPose(name, tgt, directionOf(lead.point.x - origin.x, lead.point.z - origin.z, lead.elev), o.headingRad, restRad)
        if (p !== null) replace(p)
        return
      }
      const held = (elevation ?? mb.elevation)[key]
      if (held !== undefined) replace({ ...pose, elevationRad: held })
      if (due > tick || live >= MAIN_BATTERY.maxLiveShells) return
      const lead = leadSolution(origin, tgt, aimY, s, drag, dt)
      if (lead === null) return
      const hx = lead.point.x - origin.x, hz = lead.point.z - origin.z
      const aimPose = gunLayingPose(name, tgt, directionOf(hx, hz, lead.elev), o.headingRad, restRad)
      if (aimPose === null) return
      nextFire ??= { ...mb.nextFire }
      nextFire[key] = tick + intervalTicks
      if (Math.abs(aimPose.trainingRad) > MAIN_BATTERY.maxTrainingRad) return // the ship is in the way (R5)
      // Fire control: the salvo's aim point is off in range and deflection, widest on first sight.
      const startedTick = (since ?? mb.since)[key] ?? tick
      const settle = 1 + MAIN_BATTERY.settle.extra * Math.max(0, 1 - ((tick - startedTick) * dt) / MAIN_BATTERY.settle.settleS)
      const skill = MAIN_BATTERY.skillMin + (MAIN_BATTERY.skillMax - MAIN_BATTERY.skillMin) * createRng(mixInt(seed, mh))()
      const k = settle * skill
      const e = aimErrorDraw(mixInt(mixInt(seed, mh), tick), 1)
      const ux = hx / lead.rangeM, uz = hz / lead.rangeM
      const aimRange = lead.rangeM + e.up * MAIN_BATTERY.rangeErrorFraction * lead.rangeM * k
      const aimSide = e.right * MAIN_BATTERY.deflectionErrorFraction * lead.rangeM * k
      const ax = ux * aimRange - uz * aimSide, az = uz * aimRange + ux * aimSide
      const aimed = solveElevation(Math.hypot(ax, az), lead.point.y - origin.y, s.muzzleMps, drag, dt)
      const further = solveElevation(Math.hypot(ax, az) + 50, lead.point.y - origin.y, s.muzzleMps, drag, dt)
      if (aimed === null) return
      const dElevPerM = further === null ? 0 : (further.elev - aimed.elev) / 50
      elevation ??= { ...mb.elevation }
      elevation[key] = aimed.elev
      replace({ ...aimPose, elevationRad: aimed.elev })
      const bearing = Math.atan2(az, ax)
      for (let b = 0; b < turret.barrels; b++) {
        const spread = aimErrorDraw(mixInt(mixInt(seed, mh), tick ^ Math.imul(b + 1, 0x2545f491)), 1)
        const elev = aimed.elev + spread.up * MAIN_BATTERY.shellSpreadRangeFraction * lead.rangeM * dElevPerM
        const az2 = bearing + (spread.right * MAIN_BATTERY.shellSpreadDeflectionFraction * lead.rangeM) / lead.rangeM
        const dir = directionOf(Math.cos(az2), Math.sin(az2), elev)
        shells.push({
          owner: o.id, position: origin, previous: origin, velocity: v3(dir.x * s.muzzleMps, dir.y * s.muzzleMps, dir.z * s.muzzleMps),
          lifeS: aimed.timeS * 1.5 + 5, tracer: false, kind: 'round', ageS: 0, shell: kit,
        })
        live++
      }
      salvos.push({ ship: o.id, mount: name, point: origin, shellKg: s.shellKg })
    })
    if (posesOut !== null) { nextLaying ??= { ...laying }; nextLaying[o.id] = posesOut }
  }
  const changed = nextFire !== null || target !== null || since !== null || elevation !== null
  return {
    mainBattery: changed ? { nextFire: nextFire ?? mb.nextFire, target: target ?? mb.target, since: since ?? mb.since, elevation: elevation ?? mb.elevation } : mb,
    laying: nextLaying ?? laying,
    shells, salvos,
  }
}
