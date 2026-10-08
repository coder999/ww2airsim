import { createRng } from '../../sim/rng.js'
import { SEA_LEVEL_M } from '../../sim/world/terrain.js'
import type { Vec3 } from '../../sim/math/vec3.js'
import type { FxCatalog, FxEmitter, RecipeId } from './catalog.js'
import type { FxSustained } from './events.js'
import type { FxSheetLayout } from './sheetManifest.js'
import { FX_MAX_CAPACITY } from './tiers.js'

/**
 * The effects particle pool (ordnance-and-effects design §3.4): fixed
 * capacity from the tier, simulated on the CPU with a seeded generator so
 * Deterministic tests it without a GPU, one sorted instance buffer per frame.
 * Positions are raw world metres (float64 here, float32 on upload); the fx
 * scene's position supplies the camera-relative shift (plan E1 Ruling R10).
 */
export type FxInstanceArrays = { readonly posSize: Float32Array; readonly anim: Float32Array; readonly tint: Float32Array; readonly vel: Float32Array }
export const createInstanceArrays = (capacity: number): FxInstanceArrays => ({
  posSize: new Float32Array(capacity * 4), anim: new Float32Array(capacity * 4),
  tint: new Float32Array(capacity * 4), vel: new Float32Array(capacity * 4),
})

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
/** Fade in over the first 10% of life, out over the last 40%. */
export const lifeAlpha = (t: number, peak: number): number => peak * Math.min(1, clamp01(t) / 0.1) * Math.min(1, (1 - clamp01(t)) / 0.4)
/** Grows fast, then settles: size(t) = s0 + (s1 - s0)(1 - (1 - t)^2). */
export const lifeSize = (t: number, s0: number, s1: number): number => { const u = 1 - clamp01(t); return s0 + (s1 - s0) * (1 - u * u) }
/** Continuous flipbook frame: one pass over life, or a loop at `fps`. */
export const flipbookFrame = (age: number, life: number, frames: number, fps?: number): number =>
  fps === undefined ? Math.min(age / life, 1) * (frames - 1) : (age * fps) % frames
/** R14: paused freezes, time scale scales, a stalled tab steps at most 0.1 s. */
export const fxDtSeconds = (frameS: number, paused: boolean, timeScale: number): number =>
  paused ? 0 : Math.min(Math.max(frameS, 0), 0.1) * timeScale

export function sampleDirection(kind: FxEmitter['direction'], spreadDeg: number, r1: number, r2: number): Vec3 {
  const phi = 2 * Math.PI * r2
  if (kind === 'sphere') { const y = 1 - 2 * r1, s = Math.sqrt(Math.max(0, 1 - y * y)); return { x: s * Math.cos(phi), y, z: s * Math.sin(phi) } }
  const spread = (spreadDeg * Math.PI) / 180
  if (kind === 'ring') { const e = r1 * spread; return { x: Math.cos(e) * Math.cos(phi), y: Math.sin(e), z: Math.cos(e) * Math.sin(phi) } }
  const cosT = 1 - r1 * (1 - Math.cos(spread)), sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT))
  return { x: sinT * Math.cos(phi), y: cosT, z: sinT * Math.sin(phi) }
}

export type FxSystem = {
  capacity(): number
  trigger(recipe: RecipeId, position: Vec3, velocity: Vec3): void
  setSustained(list: readonly FxSustained[]): void
  step(dtS: number): void
  live(): number
  clear(): void
  /** Instant replay R-3: reseed for a deterministic re-run, whatever the
   *  system did before -- clears state and resets the RNG and serial
   *  counter, so a re-run from the same seed replays identically. */
  reset(seed: number): void
  setCapacity(capacity: number): void
  /** Back-to-front from `eye` (Ruling R17). Returns the instance count. */
  writeInstances(eye: Vec3, out: FxInstanceArrays): number
  /** Spawn serials of the live particles, ascending (tests). */
  liveSerials(): number[]
}

const F64 = ['px', 'py', 'pz', 'vx', 'vy', 'vz', 'serial'] as const
const F32 = ['age', 'life', 's0', 's1', 'rot', 'spin', 'alpha', 'tr', 'tg', 'tb', 'emissive', 'drag', 'accelY', 'fps', 'streakS', 'cell', 'seaKill'] as const

export function createFxSystem(o: { readonly capacity: number; readonly seed: number; readonly catalog: FxCatalog; readonly layout: FxSheetLayout }): FxSystem {
  const N = FX_MAX_CAPACITY
  const checkCap = (c: number): number => { if (!Number.isInteger(c) || c < 1 || c > N) throw new Error(`fx capacity ${c} outside 1..${N}`); return c }
  let cap = checkCap(o.capacity)
  const d = Object.fromEntries(F64.map((k) => [k, new Float64Array(N)])) as Record<(typeof F64)[number], Float64Array>
  const f = Object.fromEntries(F32.map((k) => [k, new Float32Array(N)])) as Record<(typeof F32)[number], Float32Array>
  const gen = new Uint32Array(N), alive = new Uint8Array(N)
  const free = new Int32Array(N)
  const FIFO = 2 * N, fifoSlot = new Int32Array(FIFO), fifoGen = new Uint32Array(FIFO)
  let freeTop = 0, head = 0, count = 0, liveCount = 0, nextSerial = 0
  let rng = createRng(o.seed)
  type Timed = { readonly e: FxEmitter; readonly p: Vec3; readonly v: Vec3; t: number; carry: number }
  let timed: Timed[] = []
  const sustainedState = new Map<string, { carry: number[]; last: Vec3 | null }>()
  let sustainedNow: readonly FxSustained[] = []
  const dist2 = new Float64Array(N)
  const order: number[] = []

  const resetSlots = (): void => {
    alive.fill(0); freeTop = 0; head = 0; count = 0; liveCount = 0
    for (let s = cap - 1; s >= 0; s--) free[freeTop++] = s
  }
  resetSlots()

  const compactFifo = (): void => {
    let k = 0
    for (let j = 0; j < count; j++) {
      const i = (head + j) % FIFO, s = fifoSlot[i]!
      if (alive[s] === 1 && gen[s] === fifoGen[i]) { fifoSlot[k] = s; fifoGen[k] = fifoGen[i]!; k++ }
    }
    head = 0; count = k
  }
  const fifoPush = (s: number): void => {
    if (count === FIFO) compactFifo()
    const at = (head + count) % FIFO
    fifoSlot[at] = s; fifoGen[at] = gen[s]!; count++
  }
  const kill = (s: number): void => { alive[s] = 0; free[freeTop++] = s; liveCount-- }
  const allocate = (): number => {
    let s = -1
    if (freeTop > 0) s = free[--freeTop]!
    else {
      // Full: the first valid FIFO entry is the oldest live particle (spec §3.4).
      while (s < 0) {
        const i = head; head = (head + 1) % FIFO; count--
        const c = fifoSlot[i]!
        if (alive[c] === 1 && gen[c] === fifoGen[i]) s = c
      }
      liveCount--
    }
    gen[s]!++; alive[s] = 1; liveCount++; d.serial[s] = nextSerial++
    fifoPush(s)
    return s
  }
  const lerp = (r: readonly [number, number], t: number): number => r[0] + (r[1] - r[0]) * t

  const spawn = (e: FxEmitter, x: number, y: number, z: number, v: Vec3): void => {
    const s = allocate()
    // Exactly nine draws per particle, in this order, so a seed replays.
    const dir = sampleDirection(e.direction, e.spreadDeg, rng(), rng())
    const speed = lerp(e.speedMps, rng())
    const off = sampleDirection('sphere', 180, rng(), rng())
    const rr = e.radiusM * Math.cbrt(rng())
    d.px[s] = x + off.x * rr; d.py[s] = y + off.y * rr; d.pz[s] = z + off.z * rr
    d.vx[s] = dir.x * speed + v.x * e.inheritVelocity; d.vy[s] = dir.y * speed + v.y * e.inheritVelocity; d.vz[s] = dir.z * speed + v.z * e.inheritVelocity
    f.age[s] = 0; f.life[s] = lerp(e.lifeS, rng())
    f.rot[s] = rng() * 2 * Math.PI; f.spin[s] = (rng() * 2 - 1) * e.spinRadPerS
    f.s0[s] = e.sizeM[0]; f.s1[s] = e.sizeM[1]; f.alpha[s] = e.alpha
    f.tr[s] = e.tint[0]; f.tg[s] = e.tint[1]; f.tb[s] = e.tint[2]; f.emissive[s] = e.emissive
    f.drag[s] = e.dragPerS; f.accelY[s] = e.accelYMps2; f.fps[s] = e.frameRateHz ?? 0; f.streakS[s] = e.streakS ?? 0
    f.cell[s] = e.sheet === 'streak' ? -1 : o.layout.cellOf[e.sheet]; f.seaKill[s] = e.seaKill ? 1 : 0
  }

  const emit = (e: FxEmitter, n: number, from: Vec3, to: Vec3, v: Vec3): void => {
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n // spread along the frame's travel, so a fast emitter leaves no gaps
      spawn(e, from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, from.z + (to.z - from.z) * t, v)
    }
  }

  const system: FxSystem = {
    capacity: () => cap,
    live: () => liveCount,
    trigger(recipe, p, v) {
      for (const e of o.catalog[recipe].emitters) {
        if (e.mode === 'burst') emit(e, e.count!, p, p, v)
        else if (e.durationS !== undefined) timed.push({ e, p, v, t: 0, carry: 0 })
      }
    },
    setSustained(list) {
      sustainedNow = list
      const keys = new Set(list.map((s) => s.key))
      for (const k of [...sustainedState.keys()]) if (!keys.has(k)) sustainedState.delete(k)
      for (const s of list) if (!sustainedState.has(s.key)) sustainedState.set(s.key, { carry: o.catalog[s.recipe].emitters.map(() => 0), last: null })
    },
    step(dt) {
      if (!(dt > 0)) return
      for (let s = 0; s < cap; s++) {
        if (alive[s] !== 1) continue
        const age = f.age[s]! + dt
        if (age >= f.life[s]!) { kill(s); continue }
        f.age[s] = age
        const k = Math.exp(-f.drag[s]! * dt)
        d.vx[s]! *= k; d.vy[s] = d.vy[s]! * k + f.accelY[s]! * dt; d.vz[s]! *= k
        d.px[s]! += d.vx[s]! * dt; d.py[s]! += d.vy[s]! * dt; d.pz[s]! += d.vz[s]! * dt
        f.rot[s]! += f.spin[s]! * dt
        if (f.seaKill[s] === 1 && d.py[s]! < SEA_LEVEL_M) kill(s)
      }
      timed = timed.filter((ts) => {
        const e = ts.e, start = e.delayS, end = e.delayS + e.durationS!
        const active = Math.max(0, Math.min(ts.t + dt, end) - Math.max(ts.t, start))
        ts.t += dt
        if (active > 0) {
          const n = ts.carry + e.ratePerS! * active, whole = Math.floor(n)
          ts.carry = n - whole
          emit(e, whole, ts.p, ts.p, ts.v)
        }
        return ts.t < end
      })
      for (const em of sustainedNow) {
        const st = sustainedState.get(em.key)!
        const from = st.last ?? em.position
        o.catalog[em.recipe].emitters.forEach((e, i) => {
          if (e.mode !== 'stream' || e.durationS !== undefined) return
          const n = st.carry[i]! + e.ratePerS! * em.intensity * dt, whole = Math.floor(n)
          st.carry[i] = n - whole
          emit(e, whole, from, em.position, em.velocity)
        })
        st.last = em.position
      }
    },
    clear() { resetSlots(); timed = []; sustainedState.clear(); sustainedNow = [] },
    reset(seed) { system.clear(); rng = createRng(seed); nextSerial = 0 },
    setCapacity(next) {
      checkCap(next)
      if (next === cap) return
      // Rare (a Settings pick), so a sort is fine: keep the newest `next`, in spawn order.
      const keep = [...Array(cap).keys()].filter((s) => alive[s] === 1).sort((a, b) => d.serial[a]! - d.serial[b]!).slice(-next)
      const snapD = Object.fromEntries(F64.map((k) => [k, d[k].slice()])) as typeof d
      const snapF = Object.fromEntries(F32.map((k) => [k, f[k].slice()])) as typeof f
      cap = next
      resetSlots()
      freeTop = 0 // refilled below with only the slots the kept particles do not occupy
      for (let s = cap - 1; s >= keep.length; s--) free[freeTop++] = s
      keep.forEach((from, to) => {
        for (const k of F64) d[k][to] = snapD[k][from]!
        for (const k of F32) f[k][to] = snapF[k][from]!
        alive[to] = 1; gen[to]!++; liveCount++
        fifoPush(to)
      })
    },
    writeInstances(eye, out) {
      order.length = 0
      for (let s = 0; s < cap; s++) {
        if (alive[s] !== 1) continue
        const dx = d.px[s]! - eye.x, dy = d.py[s]! - eye.y, dz = d.pz[s]! - eye.z
        dist2[s] = dx * dx + dy * dy + dz * dz
        order.push(s)
      }
      order.sort((a, b) => dist2[b]! - dist2[a]!)
      order.forEach((s, i) => {
        const t = f.age[s]! / f.life[s]!, j = i * 4
        out.posSize[j] = d.px[s]!; out.posSize[j + 1] = d.py[s]!; out.posSize[j + 2] = d.pz[s]!; out.posSize[j + 3] = lifeSize(t, f.s0[s]!, f.s1[s]!)
        out.anim[j] = f.rot[s]!
        out.anim[j + 1] = flipbookFrame(f.age[s]!, f.life[s]!, o.layout.frames, f.fps[s]! > 0 ? f.fps[s]! : undefined)
        out.anim[j + 2] = lifeAlpha(t, f.alpha[s]!); out.anim[j + 3] = f.cell[s]!
        out.tint[j] = f.tr[s]!; out.tint[j + 1] = f.tg[s]!; out.tint[j + 2] = f.tb[s]!; out.tint[j + 3] = f.emissive[s]!
        out.vel[j] = d.vx[s]!; out.vel[j + 1] = d.vy[s]!; out.vel[j + 2] = d.vz[s]!
        out.vel[j + 3] = f.cell[s]! < 0 ? Math.hypot(d.vx[s]!, d.vy[s]!, d.vz[s]!) * f.streakS[s]! : 0
      })
      return order.length
    },
    liveSerials() {
      const out: number[] = []
      for (let s = 0; s < cap; s++) if (alive[s] === 1) out.push(d.serial[s]!)
      return out.sort((a, b) => a - b)
    },
  }
  return system
}
