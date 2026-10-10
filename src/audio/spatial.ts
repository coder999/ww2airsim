import type { ClipId } from './assets.js'
import { ENGINE_LAYER_FOR } from './layers.js'
import { deckGainFor, type EngineFamily } from './mix.js'

/**
 * Where the AI's sounds are, relative to the camera. Pure: no Web Audio, no
 * sim import. Distance attenuation, Doppler, air absorption and the speed-of-
 * sound delay all live HERE, so the fake backend can assert them; the panner
 * downstream only pans (rolloffFactor 0). Design §5.4.
 *
 * Every constant below is a reasoned guess, never heard.
 */
export type Vec = { readonly x: number; readonly y: number; readonly z: number }

export const SPEED_OF_SOUND_MPS = 343
const TICKS_PER_S = 60

export const MAX_ENGINE_SOURCES = 6
export const ENGINE_AUDIBLE_M = 3000
export const ENGINE_FADE_START_M = 2400
export const ENGINE_REF_M = 150
export const AI_ENGINE_GAIN = 0.30
/** Sum of all AI engine loop gains; above it every source scales down together. */
export const AI_ENGINE_SUM_MAX = 0.60
export const AI_ENGINE_RATE = 0.95
export const DOPPLER_MIN = 0.7
export const DOPPLER_MAX = 1.4

export const GUN_AUDIBLE_M = 2500
export const GUN_REF_M = 100
export const GUN_BURST_INTERVAL_TICKS = 72

export const BLAST_HEARD_M = 8000
export const BLAST_REF_M = 200
/** Detonations farther than this play the distant thump instead of the close blast. */
export const FLAK_SWITCH_M = 3000
export const MAX_BLASTS_PER_UPDATE = 4

/** Light AA (M2): a gun firing is the `aa_gun` loop at its position, the nearest few, in earshot. A reasoned guess, never heard. */
export const MAX_AA_GUN_SOURCES = 3
export const AA_GUN_AUDIBLE_M = 2500
export const AA_GUN_REF_M = 150
export const AA_GUN_GAIN = 0.5
/** Sum of all AA loop gains; above it every source scales down together. */
export const AA_GUN_SUM_MAX = 0.7
export const MAX_PENDING = 64

export type SpatialAircraft = {
  readonly id: string
  readonly family: EngineFamily
  readonly position: Vec
  readonly velocity: Vec
  readonly shots: number
  readonly engineHealth: number
}
export type SpatialInputs = {
  readonly tick: number
  readonly listener: { readonly position: Vec; readonly forward: Vec; readonly up: Vec; readonly velocity: Vec }
  readonly aircraft: readonly SpatialAircraft[]
  readonly decks: readonly { readonly id: string; readonly center: Vec; readonly lengthM: number }[]
  /** Detonations, plus a torpedo's water entry (D3 T2): `torpedo` marks a torpedo event, `'splash'`
   *  at entry or a break-up on the water, `'hit'` at a hull. */
  readonly blasts: readonly { readonly tick: number; readonly surface: string; readonly position: Vec; readonly torpedo?: 'splash' | 'hit'; readonly flak?: true }[]
  /** Ships and batteries whose light guns fired lately (M2), at the gun that fired. Absent reads as none. */
  readonly aaGuns?: readonly { readonly id: string; readonly position: Vec }[]
}
/** `at` is listener-relative in Web Audio axes: x right, y up, -z ahead. */
export type SpatialLoop = {
  readonly key: string
  readonly layer: string
  readonly at: Vec
  readonly gain: number
  readonly rate: number
  readonly cutoffHz: number
}
export type SpatialShot = { readonly clip: ClipId; readonly at: Vec; readonly level: number; readonly cutoffHz: number }
export type Pending = { readonly dueTick: number; readonly clip: ClipId; readonly world: Vec; readonly level: number; readonly cutoffHz: number }
export type SpatialMemory = {
  readonly tick: number | null
  readonly blastTick: number | null
  readonly guns: Readonly<Record<string, { readonly shots: number; readonly nextTick: number }>>
  readonly pending: readonly Pending[]
}
export const NO_SPATIAL_MEMORY: SpatialMemory = { tick: null, blastTick: null, guns: {}, pending: [] }

const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: Vec, b: Vec): Vec => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })
const len = (a: Vec): number => Math.hypot(a.x, a.y, a.z)
const unit = (a: Vec): Vec | null => {
  const n = len(a)
  return n > 1e-9 && Number.isFinite(n) ? { x: a.x / n, y: a.y / n, z: a.z / n } : null
}
const finiteVec = (a: Vec): boolean => Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.z)
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x))

/** Inverse-distance level: 1 inside `refM`, `refM / d` beyond. */
export function inverseLevel(distanceM: number, refM: number): number {
  return refM / Math.max(distanceM, refM)
}

/** Air absorption: the high end goes first. 10 kHz at 100 m, 4 kHz at 1 km, 0.7 kHz at 8 km. */
export function airCutoffHz(distanceM: number): number {
  return Math.max(500, 12_000 / (1 + distanceM / 500))
}

export function dopplerRate(radialMps: number): number {
  return clamp(SPEED_OF_SOUND_MPS / (SPEED_OF_SOUND_MPS + radialMps), DOPPLER_MIN, DOPPLER_MAX)
}

type Basis = { readonly right: Vec; readonly up: Vec; readonly forward: Vec }

function basisOf(l: SpatialInputs['listener']): Basis | null {
  const forward = unit(l.forward)
  if (forward === null) return null
  const right = unit(cross(forward, l.up))
  if (right === null) return null
  const up = cross(right, forward)
  return { right, up, forward }
}

const toListener = (b: Basis, rel: Vec): Vec => ({ x: dot(rel, b.right), y: dot(rel, b.up), z: -dot(rel, b.forward) })

export function nextSpatial(
  prior: SpatialMemory,
  inputs: SpatialInputs,
): { memory: SpatialMemory; loops: SpatialLoop[]; shots: SpatialShot[] } {
  // A tick that went backwards is a new flight or a replay scrub.
  const m = prior.tick !== null && inputs.tick < prior.tick ? NO_SPATIAL_MEMORY : prior
  const basis = finiteVec(inputs.listener.position) ? basisOf(inputs.listener) : null
  if (basis === null) return { memory: { ...m, tick: inputs.tick }, loops: [], shots: [] }
  const listenerAt = inputs.listener.position

  // ---- engine loops: the nearest few, alive, in earshot ----
  type Cand = { a: SpatialAircraft; rel: Vec; d: number }
  const cands: Cand[] = []
  for (const a of inputs.aircraft) {
    if (!finiteVec(a.position) || !finiteVec(a.velocity)) continue
    const rel = sub(a.position, listenerAt)
    const d = len(rel)
    if (d <= ENGINE_AUDIBLE_M) cands.push({ a, rel, d })
  }
  cands.sort((p, q) => p.d - q.d || (p.a.id < q.a.id ? -1 : 1))
  const near = cands.slice(0, MAX_ENGINE_SOURCES)
  const raw = near.map(({ a, d }) => {
    const fade = d <= ENGINE_FADE_START_M ? 1 : clamp((ENGINE_AUDIBLE_M - d) / (ENGINE_AUDIBLE_M - ENGINE_FADE_START_M), 0, 1)
    return AI_ENGINE_GAIN * inverseLevel(d, ENGINE_REF_M) * fade * clamp(a.engineHealth, 0, 1)
  })
  const sum = raw.reduce((s, g) => s + g, 0)
  const scale = sum > AI_ENGINE_SUM_MAX ? AI_ENGINE_SUM_MAX / sum : 1
  const loops: SpatialLoop[] = near.map(({ a, rel, d }, i) => {
    const dir = unit(rel)
    const radial = dir === null ? 0 : dot(sub(a.velocity, inputs.listener.velocity), dir)
    return {
      key: `ai:${a.id}`,
      layer: ENGINE_LAYER_FOR[a.family],
      at: toListener(basis, rel),
      gain: raw[i]! * scale,
      rate: AI_ENGINE_RATE * dopplerRate(radial),
      cutoffHz: airCutoffHz(d),
    }
  })

  // ---- light AA: one gunfire loop per firing ship or battery, the nearest few ----
  const gunCands = (inputs.aaGuns ?? [])
    .filter((g) => finiteVec(g.position))
    .map((g) => ({ g, rel: sub(g.position, listenerAt), d: len(sub(g.position, listenerAt)) }))
    .filter((c) => c.d <= AA_GUN_AUDIBLE_M)
    .sort((p, q) => p.d - q.d || (p.g.id < q.g.id ? -1 : 1))
    .slice(0, MAX_AA_GUN_SOURCES)
  const gunRaw = gunCands.map(({ d }) => AA_GUN_GAIN * inverseLevel(d, AA_GUN_REF_M))
  const gunSum = gunRaw.reduce((a, g) => a + g, 0)
  const gunScale = gunSum > AA_GUN_SUM_MAX ? AA_GUN_SUM_MAX / gunSum : 1
  gunCands.forEach(({ g, rel, d }, i) => {
    loops.push({ key: `aa:${g.id}`, layer: 'aa_gun', at: toListener(basis, rel), gain: gunRaw[i]! * gunScale, rate: 1, cutoffHz: airCutoffHz(d) })
  })

  // ---- carrier deck rumble: the nearest deck, at the ship ----
  let bestDeck: { rel: Vec; edgeM: number; half: number } | null = null
  for (const deck of inputs.decks) {
    if (!finiteVec(deck.center)) continue
    const rel = sub(deck.center, listenerAt)
    const half = deck.lengthM / 2
    const edgeM = Math.max(0, Math.hypot(rel.x, rel.z) - half)
    if (bestDeck === null || edgeM < bestDeck.edgeM) bestDeck = { rel, edgeM, half }
  }
  if (bestDeck !== null) {
    const gain = deckGainFor(bestDeck.edgeM)
    if (gain > 0) {
      const d = len(bestDeck.rel)
      const dir = toListener(basis, bestDeck.rel)
      // Over the hull the direction is meaningless and swings with every metre:
      // blend to straight ahead across one half-length beyond the edge.
      const t = clamp((d - bestDeck.half) / Math.max(bestDeck.half, 1), 0, 1)
      const front = { x: 0, y: 0, z: -1 }
      const dn = unit(dir) ?? front
      const blended = unit({ x: front.x + (dn.x - front.x) * t, y: front.y + (dn.y - front.y) * t, z: front.z + (dn.z - front.z) * t }) ?? front
      const dist = Math.max(1, bestDeck.edgeM)
      loops.push({ key: 'deck', layer: 'deck', at: { x: blended.x * dist, y: blended.y * dist, z: blended.z * dist }, gain, rate: 1, cutoffHz: 20_000 })
    }
  }

  // ---- new events -> pending one-shots ----
  const pending: Pending[] = [...m.pending]
  const enqueue = (clip: ClipId, world: Vec, d: number, ref: number): void => {
    const delayTicks = Math.round((d / SPEED_OF_SOUND_MPS) * TICKS_PER_S)
    pending.push({ dueTick: inputs.tick + delayTicks, clip, world, level: inverseLevel(d, ref), cutoffHz: airCutoffHz(d) })
  }

  let blastTick = m.blastTick
  const fresh = inputs.blasts
    .filter((b) => (blastTick === null || b.tick > blastTick) && finiteVec(b.position))
    .map((b) => ({ b, d: len(sub(b.position, listenerAt)) }))
  for (const { b } of fresh) blastTick = blastTick === null ? b.tick : Math.max(blastTick, b.tick)
  fresh.filter((f) => f.d <= BLAST_HEARD_M).sort((p, q) => p.d - q.d).slice(0, MAX_BLASTS_PER_UPDATE).forEach(({ b, d }) => {
    // A torpedo has its own takes at any range (D3 T2, Track I's I3); distance still dulls them.
    // A flak burst (M2) is always flak: the close take within FLAK_SWITCH_M, the far one beyond.
    const clip: ClipId = b.torpedo === 'splash' ? 'torpedo_splash' : b.torpedo === 'hit' ? 'torpedo_hit'
      : d > FLAK_SWITCH_M ? 'flak_distant' : b.flak === true ? 'flak_burst' : b.surface === 'water' ? 'water_crash' : 'explosion'
    enqueue(clip, b.position, d, BLAST_REF_M)
  })

  const guns: Record<string, { shots: number; nextTick: number }> = {}
  for (const a of inputs.aircraft) {
    const before = m.guns[a.id]
    let nextTick = before?.nextTick ?? 0
    if (before !== undefined && a.shots > before.shots && inputs.tick >= before.nextTick && finiteVec(a.position)) {
      const d = len(sub(a.position, listenerAt))
      if (d <= GUN_AUDIBLE_M) {
        enqueue('machinegun', a.position, d, GUN_REF_M)
        nextTick = inputs.tick + GUN_BURST_INTERVAL_TICKS
      }
    }
    guns[a.id] = { shots: a.shots, nextTick }
  }

  // ---- due one-shots, panned against the CURRENT listener ----
  const shots: SpatialShot[] = []
  const stillPending: Pending[] = []
  for (const p of pending) {
    if (p.dueTick > inputs.tick) stillPending.push(p)
    else shots.push({ clip: p.clip, at: toListener(basis, sub(p.world, listenerAt)), level: p.level, cutoffHz: p.cutoffHz })
  }

  return {
    memory: { tick: inputs.tick, blastTick, guns, pending: stillPending.slice(-MAX_PENDING) },
    loops,
    shots,
  }
}
