import type { QualityTierName } from './quality.js'

/** A5's player-facing render scales. Kept here because a graphics profile is
 * the one place tier and scale are an indivisible recommendation. */
export type RenderScale = 0.5 | 0.75 | 1

export type GraphicsProfile = {
  readonly quality: QualityTierName
  readonly renderScale: RenderScale
}

/** Ordered by the visual preference approved for the preflight check: retain
 * the full scene before giving up a modest amount of 3D sharpness. */
export const GRAPHICS_PROFILES: readonly GraphicsProfile[] = [
  { quality: 'high', renderScale: 1 },
  { quality: 'high', renderScale: 0.75 },
  { quality: 'medium', renderScale: 1 },
  { quality: 'medium', renderScale: 0.75 },
  { quality: 'low', renderScale: 0.75 },
  { quality: 'low', renderScale: 0.5 },
]

export type GraphicsMode = 'automatic' | 'custom'

export type GraphicsAdapterIdentity = {
  readonly vendor: string
  readonly architecture: string
  readonly device: string
  readonly description: string
}

export type GraphicsCheckEnvironment = {
  readonly adapter: GraphicsAdapterIdentity
  readonly pixelWidth: number
  readonly pixelHeight: number
  readonly browserMajor: number | null
}

export type GraphicsCandidateMeasurement = {
  readonly profile: GraphicsProfile
  readonly completedFrames: number
  readonly framesPerSecond: number
  readonly latencyP95Ms: number
}

export type GraphicsCheckRecord = {
  readonly version: 1
  readonly environment: GraphicsCheckEnvironment
  readonly recommended: GraphicsProfile
  readonly measurements: readonly GraphicsCandidateMeasurement[]
  readonly checkedAt: string
}

const RECORD_KEY = 'ww2airsim.graphicsCheck.v1'
const MODE_KEY = 'ww2airsim.graphicsMode.v1'

const isTier = (v: unknown): v is QualityTierName => v === 'high' || v === 'medium' || v === 'low'
const isScale = (v: unknown): v is RenderScale => v === 0.5 || v === 0.75 || v === 1
const isProfile = (v: unknown): v is GraphicsProfile => {
  if (v === null || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return isTier(o.quality) && isScale(o.renderScale)
}

function isEnvironment(v: unknown): v is GraphicsCheckEnvironment {
  if (v === null || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  if (o.adapter === null || typeof o.adapter !== 'object') return false
  const a = o.adapter as Record<string, unknown>
  return ['vendor', 'architecture', 'device', 'description'].every((k) => typeof a[k] === 'string') &&
    typeof o.pixelWidth === 'number' && Number.isFinite(o.pixelWidth) && o.pixelWidth > 0 &&
    typeof o.pixelHeight === 'number' && Number.isFinite(o.pixelHeight) && o.pixelHeight > 0 &&
    (o.browserMajor === null || (typeof o.browserMajor === 'number' && Number.isInteger(o.browserMajor)))
}

function isMeasurement(v: unknown): v is GraphicsCandidateMeasurement {
  if (v === null || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return isProfile(o.profile) &&
    typeof o.completedFrames === 'number' && Number.isInteger(o.completedFrames) && o.completedFrames > 0 &&
    typeof o.framesPerSecond === 'number' && Number.isFinite(o.framesPerSecond) && o.framesPerSecond > 0 &&
    typeof o.latencyP95Ms === 'number' && Number.isFinite(o.latencyP95Ms) && o.latencyP95Ms >= 0
}

function parseRecord(v: unknown): GraphicsCheckRecord | null {
  if (v === null || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (o.version !== 1 || !isEnvironment(o.environment) || !isProfile(o.recommended) ||
      !Array.isArray(o.measurements) || !o.measurements.every(isMeasurement) || typeof o.checkedAt !== 'string') return null
  return {
    version: 1,
    environment: o.environment,
    recommended: o.recommended,
    measurements: o.measurements,
    checkedAt: o.checkedAt,
  }
}

export function loadGraphicsCheckRecord(): GraphicsCheckRecord | null {
  try {
    const raw = window.localStorage.getItem(RECORD_KEY)
    if (raw === null) return null
    const parsed = parseRecord(JSON.parse(raw))
    if (parsed === null) console.warn('graphics check in localStorage has an unexpected shape; ignoring')
    return parsed
  } catch (err) {
    console.warn('graphics check in localStorage is corrupt or unreadable; ignoring:', err)
    return null
  }
}

export function saveGraphicsCheckRecord(record: GraphicsCheckRecord): void {
  try {
    window.localStorage.setItem(RECORD_KEY, JSON.stringify(record))
  } catch (err) {
    console.warn('graphics check could not be saved to localStorage:', err)
  }
}

export function clearGraphicsCheckRecord(): void {
  try {
    window.localStorage.removeItem(RECORD_KEY)
  } catch (err) {
    console.warn('graphics check could not be cleared from localStorage:', err)
  }
}

export function loadGraphicsMode(): GraphicsMode | null {
  try {
    const raw = window.localStorage.getItem(MODE_KEY)
    return raw === 'automatic' || raw === 'custom' ? raw : null
  } catch {
    return null
  }
}

export function saveGraphicsMode(mode: GraphicsMode): void {
  try {
    window.localStorage.setItem(MODE_KEY, mode)
  } catch (err) {
    console.warn('graphics mode could not be saved to localStorage:', err)
  }
}

const adapterKey = (a: GraphicsAdapterIdentity): string =>
  `${a.vendor}\u0000${a.architecture}\u0000${a.device}\u0000${a.description}`

/** A check is reusable only on the same coarse adapter/browser and within a
 * 25% pixel-count band. The browser cannot disclose an exact GPU model; this
 * deliberately does not pretend otherwise. */
export function graphicsCheckIsCurrent(record: GraphicsCheckRecord, environment: GraphicsCheckEnvironment): boolean {
  if (adapterKey(record.environment.adapter) !== adapterKey(environment.adapter)) return false
  if (record.environment.browserMajor !== environment.browserMajor) return false
  const before = record.environment.pixelWidth * record.environment.pixelHeight
  const now = environment.pixelWidth * environment.pixelHeight
  return now / before >= 0.75 && now / before <= 1.25
}

export function browserMajorFromUserAgent(userAgent: string): number | null {
  const match = /(?:Edg|Chrome)\/(\d+)/.exec(userAgent)
  return match === null ? null : Number(match[1])
}

export const GRAPHICS_TARGET_FPS = 50
// Chromium normally keeps several WebGPU frames in flight. At 50-60 fps the
// p95 submission-to-completion time can therefore be around 100-130 ms even
// with smooth sustained throughput (Nexus Radeon 680M, 2026-10-11). This cap
// catches a badly backed-up queue without mistaking normal buffering for a
// slow adapter.
export const GRAPHICS_MAX_P95_LATENCY_MS = 150

export function candidatePasses(measurement: GraphicsCandidateMeasurement): boolean {
  return measurement.framesPerSecond >= GRAPHICS_TARGET_FPS &&
    measurement.latencyP95Ms <= GRAPHICS_MAX_P95_LATENCY_MS
}

export type GraphicsCheckPhase = 'idle' | 'applying' | 'warming' | 'draining' | 'measuring' | 'settling' | 'complete' | 'failed' | 'cancelled'

export type GraphicsCheckSnapshot = {
  readonly phase: GraphicsCheckPhase
  readonly candidateIndex: number
  readonly profile: GraphicsProfile
  readonly warmupFrames: number
  readonly submittedFrames: number
  readonly completedFrames: number
  readonly measurements: readonly GraphicsCandidateMeasurement[]
  readonly result: GraphicsProfile | null
  readonly error: string | null
}

export type GraphicsCheckSession = {
  start(): void
  /** Stops the check without a recommendation. Used when the player makes a
   * custom choice while preflight is still running. */
  cancel(): void
  frame(rendered: boolean): void
  snapshot(): GraphicsCheckSnapshot
}

export type GraphicsCheckSessionOptions = {
  readonly now: () => number
  readonly queueDone: () => Promise<void>
  readonly applyProfile: (profile: GraphicsProfile) => void
  readonly profileReady: (profile: GraphicsProfile) => boolean
  readonly onChange?: (snapshot: GraphicsCheckSnapshot) => void
  readonly onComplete: (profile: GraphicsProfile, measurements: readonly GraphicsCandidateMeasurement[]) => void
  readonly onFailure: (message: string) => void
  readonly warmupFrames?: number
  readonly warmupMs?: number
  readonly sampleFrames?: number
  readonly sampleMs?: number
  readonly minimumSamples?: number
}

const percentile95 = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? 0
}

/** State machine around the browser queue. The render loop owns frame
 * submission; this object only observes those real frames and completion of
 * the work already submitted for them. */
export function createGraphicsCheckSession(options: GraphicsCheckSessionOptions): GraphicsCheckSession {
  const warmupTargetFrames = options.warmupFrames ?? 60
  const warmupTargetMs = options.warmupMs ?? 750
  const sampleTargetFrames = options.sampleFrames ?? 90
  const sampleTargetMs = options.sampleMs ?? 2500
  const minimumSamples = options.minimumSamples ?? 30

  let phase: GraphicsCheckPhase = 'idle'
  let candidateIndex = 0
  let profile = GRAPHICS_PROFILES[0]!
  let warmupFrames = 0
  let warmupStarted = 0
  let measurementStarted = 0
  let submittedFrames = 0
  let completedFrames = 0
  let acceptingFrames = false
  let result: GraphicsProfile | null = null
  let error: string | null = null
  let generation = 0
  const submissions: { readonly at: number; completedAt?: number }[] = []
  const measurements: GraphicsCandidateMeasurement[] = []

  const snapshot = (): GraphicsCheckSnapshot => ({
    phase, candidateIndex, profile, warmupFrames, submittedFrames, completedFrames,
    measurements: measurements.slice(), result, error,
  })
  const changed = (): void => options.onChange?.(snapshot())

  const fail = (reason: unknown): void => {
    if (phase === 'cancelled') return
    phase = 'failed'
    error = reason instanceof Error ? reason.message : String(reason)
    acceptingFrames = false
    changed()
    options.onFailure(error)
  }

  const beginCandidate = (): void => {
    profile = GRAPHICS_PROFILES[candidateIndex] ?? GRAPHICS_PROFILES.at(-1)!
    phase = 'applying'
    warmupFrames = 0
    submittedFrames = 0
    completedFrames = 0
    acceptingFrames = false
    submissions.length = 0
    generation++
    options.applyProfile(profile)
    changed()
  }

  const finishCandidate = (): void => {
    const completed = submissions.filter((s): s is { readonly at: number; completedAt: number } => s.completedAt !== undefined)
    if (completed.length < minimumSamples) {
      fail(`graphics check produced only ${completed.length} completed frames`)
      return
    }
    const first = completed[0]!.completedAt
    const last = completed.at(-1)!.completedAt
    const elapsed = Math.max(last - first, 0.001)
    const measurement: GraphicsCandidateMeasurement = {
      profile,
      completedFrames: completed.length,
      framesPerSecond: Math.max(0.001, completed.length - 1) * 1000 / elapsed,
      latencyP95Ms: percentile95(completed.map((s) => s.completedAt - s.at)),
    }
    measurements.push(measurement)
    if (candidatePasses(measurement) || candidateIndex >= GRAPHICS_PROFILES.length - 1) {
      phase = 'complete'
      result = profile
      changed()
      options.onComplete(profile, measurements.slice())
      return
    }
    candidateIndex++
    beginCandidate()
  }

  const stopAccepting = (): void => {
    if (!acceptingFrames) return
    acceptingFrames = false
    phase = 'settling'
    changed()
    if (completedFrames === submittedFrames) finishCandidate()
  }

  const beginMeasurement = (): void => {
    phase = 'measuring'
    measurementStarted = options.now()
    acceptingFrames = true
    changed()
  }

  return {
    start(): void {
      if (phase !== 'idle' && phase !== 'failed' && phase !== 'complete') return
      candidateIndex = 0
      measurements.length = 0
      result = null
      error = null
      beginCandidate()
    },
    cancel(): void {
      if (phase === 'idle' || phase === 'complete' || phase === 'failed' || phase === 'cancelled') return
      generation++
      acceptingFrames = false
      phase = 'cancelled'
      changed()
    },
    frame(rendered: boolean): void {
      if (!rendered || phase === 'idle' || phase === 'complete' || phase === 'failed' || phase === 'cancelled') return
      if (phase === 'applying') {
        if (!options.profileReady(profile)) return
        phase = 'warming'
        warmupStarted = options.now()
        warmupFrames = 0
        changed()
        return
      }
      if (phase === 'warming') {
        warmupFrames++
        if (warmupFrames < warmupTargetFrames || options.now() - warmupStarted < warmupTargetMs) return
        phase = 'draining'
        const expectedGeneration = generation
        changed()
        void options.queueDone().then(() => {
          if (phase === 'draining' && generation === expectedGeneration) beginMeasurement()
        }).catch((reason) => {
          if (generation === expectedGeneration) fail(reason)
        })
        return
      }
      if (phase !== 'measuring' || !acceptingFrames) return
      const index = submissions.length
      submissions.push({ at: options.now() })
      submittedFrames++
      const expectedGeneration = generation
      void options.queueDone().then(() => {
        if (generation !== expectedGeneration || (phase !== 'measuring' && phase !== 'settling')) return
        submissions[index] = { ...submissions[index]!, completedAt: options.now() }
        completedFrames++
        changed()
        if (phase === 'settling' && completedFrames === submittedFrames) finishCandidate()
      }).catch((reason) => {
        if (generation === expectedGeneration) fail(reason)
      })
      if (submittedFrames >= sampleTargetFrames || options.now() - measurementStarted >= sampleTargetMs) stopAccepting()
    },
    snapshot,
  }
}
