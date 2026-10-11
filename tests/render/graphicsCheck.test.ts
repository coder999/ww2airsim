import { beforeEach, describe, expect, it } from 'vitest'
import {
  GRAPHICS_PROFILES,
  browserMajorFromUserAgent,
  candidatePasses,
  clearGraphicsCheckRecord,
  createGraphicsCheckSession,
  graphicsCheckIsCurrent,
  loadGraphicsCheckRecord,
  loadGraphicsMode,
  saveGraphicsCheckRecord,
  saveGraphicsMode,
  type GraphicsCheckEnvironment,
  type GraphicsCheckRecord,
} from '../../src/render/graphicsCheck.js'

function fakeLocalStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size },
  } as Storage
}

const ENVIRONMENT: GraphicsCheckEnvironment = {
  adapter: { vendor: 'amd', architecture: 'rdna2', device: '', description: '' },
  pixelWidth: 2560,
  pixelHeight: 1440,
  browserMajor: 154,
}

const RECORD: GraphicsCheckRecord = {
  version: 1,
  environment: ENVIRONMENT,
  recommended: GRAPHICS_PROFILES[0]!,
  measurements: [{
    profile: GRAPHICS_PROFILES[0]!, completedFrames: 90, framesPerSecond: 104, latencyP95Ms: 18,
  }],
  checkedAt: '2026-10-11T12:00:00.000Z',
}

beforeEach(() => {
  ;(globalThis as { window?: { localStorage: Storage } }).window = { localStorage: fakeLocalStorage() }
})

describe('graphics-check persistence and freshness', () => {
  it('keeps recommendation and automatic/custom intent in independent keys', () => {
    expect(loadGraphicsCheckRecord()).toBeNull()
    expect(loadGraphicsMode()).toBeNull()
    saveGraphicsCheckRecord(RECORD)
    saveGraphicsMode('automatic')
    expect(loadGraphicsCheckRecord()).toEqual(RECORD)
    expect(loadGraphicsMode()).toBe('automatic')
    saveGraphicsMode('custom')
    expect(loadGraphicsMode()).toBe('custom')
    expect(loadGraphicsCheckRecord()).toEqual(RECORD)
    clearGraphicsCheckRecord()
    expect(loadGraphicsCheckRecord()).toBeNull()
    expect(loadGraphicsMode()).toBe('custom')
  })

  it('rejects malformed records without throwing', () => {
    window.localStorage.setItem('ww2airsim.graphicsCheck.v1', JSON.stringify({ version: 1, recommended: 'high' }))
    expect(() => loadGraphicsCheckRecord()).not.toThrow()
    expect(loadGraphicsCheckRecord()).toBeNull()
  })

  it('reuses only the same coarse adapter, browser major and a nearby pixel count', () => {
    expect(graphicsCheckIsCurrent(RECORD, ENVIRONMENT)).toBe(true)
    expect(graphicsCheckIsCurrent(RECORD, { ...ENVIRONMENT, pixelWidth: 2304, pixelHeight: 1296 })).toBe(true)
    expect(graphicsCheckIsCurrent(RECORD, { ...ENVIRONMENT, pixelWidth: 3840, pixelHeight: 2160 })).toBe(false)
    expect(graphicsCheckIsCurrent(RECORD, { ...ENVIRONMENT, browserMajor: 155 })).toBe(false)
    expect(graphicsCheckIsCurrent(RECORD, {
      ...ENVIRONMENT, adapter: { ...ENVIRONMENT.adapter, architecture: 'rdna3' },
    })).toBe(false)
  })

  it('reads current Chromium-family browser majors without inventing one for another UA', () => {
    expect(browserMajorFromUserAgent('Mozilla/5.0 Chrome/154.0.8037.98 Safari/537.36')).toBe(154)
    expect(browserMajorFromUserAgent('Mozilla/5.0 Chrome/154.0.0.0 Edg/154.0.0.0')).toBe(154)
    expect(browserMajorFromUserAgent('ExampleBrowser/9')).toBeNull()
  })
})

describe('graphics-check profile policy', () => {
  it('tries the approved feature-first order and keeps Low/50% as the floor', () => {
    expect(GRAPHICS_PROFILES).toEqual([
      { quality: 'high', renderScale: 1 },
      { quality: 'high', renderScale: 0.75 },
      { quality: 'medium', renderScale: 1 },
      { quality: 'medium', renderScale: 0.75 },
      { quality: 'low', renderScale: 0.75 },
      { quality: 'low', renderScale: 0.5 },
    ])
  })

  it('requires both sustained throughput and bounded completion latency', () => {
    const base = { profile: GRAPHICS_PROFILES[0]!, completedFrames: 90 }
    expect(candidatePasses({ ...base, framesPerSecond: 50, latencyP95Ms: 150 })).toBe(true)
    expect(candidatePasses({ ...base, framesPerSecond: 49.9, latencyP95Ms: 20 })).toBe(false)
    expect(candidatePasses({ ...base, framesPerSecond: 60, latencyP95Ms: 150.1 })).toBe(false)
  })
})

describe('graphics-check queue state machine', () => {
  it('warms and drains before measuring the real submitted-frame completions', async () => {
    let now = 0
    const pending: (() => void)[] = []
    const applied: string[] = []
    const completed: string[] = []
    const session = createGraphicsCheckSession({
      now: () => now,
      queueDone: () => new Promise<void>((resolve) => pending.push(resolve)),
      applyProfile: (p) => applied.push(`${p.quality}/${p.renderScale}`),
      profileReady: () => true,
      onComplete: (p) => completed.push(`${p.quality}/${p.renderScale}`),
      onFailure: (message) => { throw new Error(message) },
      warmupFrames: 2,
      warmupMs: 10,
      sampleFrames: 4,
      sampleMs: 1000,
      minimumSamples: 3,
    })
    session.start()
    session.frame(true) // applying -> warming
    now = 10
    session.frame(true)
    now = 20
    session.frame(true) // warming -> draining
    expect(session.snapshot().phase).toBe('draining')
    pending.shift()!()
    await Promise.resolve()
    expect(session.snapshot().phase).toBe('measuring')

    for (let i = 0; i < 4; i++) {
      session.frame(true)
      now += 20
      pending.shift()!()
      await Promise.resolve()
    }
    expect(applied).toEqual(['high/1'])
    expect(completed).toEqual(['high/1'])
    expect(session.snapshot()).toMatchObject({ phase: 'complete', submittedFrames: 4, completedFrames: 4 })
    expect(session.snapshot().measurements[0]?.framesPerSecond).toBeCloseTo(50)
    expect(session.snapshot().measurements[0]?.latencyP95Ms).toBe(20)
  })

  it('steps down after a failed candidate and accepts the first passing profile', async () => {
    let now = 0
    const pending: (() => void)[] = []
    const applied: string[] = []
    const completed: string[] = []
    const session = createGraphicsCheckSession({
      now: () => now,
      queueDone: () => new Promise<void>((resolve) => pending.push(resolve)),
      applyProfile: (p) => applied.push(`${p.quality}/${p.renderScale}`),
      profileReady: () => true,
      onComplete: (p) => completed.push(`${p.quality}/${p.renderScale}`),
      onFailure: (message) => { throw new Error(message) },
      warmupFrames: 1,
      warmupMs: 0,
      sampleFrames: 3,
      sampleMs: 1000,
      minimumSamples: 3,
    })
    session.start()

    const runCandidate = async (completionIntervalMs: number): Promise<void> => {
      session.frame(true)
      session.frame(true)
      pending.shift()!()
      await Promise.resolve()
      for (let i = 0; i < 3; i++) {
        session.frame(true)
        now += completionIntervalMs
        pending.shift()!()
        await Promise.resolve()
      }
    }

    await runCandidate(40) // 25 fps: High/100 fails.
    expect(session.snapshot().phase).toBe('applying')
    await runCandidate(20) // 50 fps: High/75 passes.
    expect(applied).toEqual(['high/1', 'high/0.75'])
    expect(completed).toEqual(['high/0.75'])
    expect(session.snapshot().measurements).toHaveLength(2)
  })

  it('cancels pending queue work without applying another candidate or emitting a verdict', async () => {
    let now = 0
    const pending: (() => void)[] = []
    const applied: string[] = []
    const completed: string[] = []
    const failed: string[] = []
    const session = createGraphicsCheckSession({
      now: () => now,
      queueDone: () => new Promise<void>((resolve) => pending.push(resolve)),
      applyProfile: (p) => applied.push(`${p.quality}/${p.renderScale}`),
      profileReady: () => true,
      onComplete: (p) => completed.push(`${p.quality}/${p.renderScale}`),
      onFailure: (message) => failed.push(message),
      warmupFrames: 1,
      warmupMs: 0,
      sampleFrames: 3,
      minimumSamples: 3,
    })
    session.start()
    session.frame(true)
    session.frame(true)
    expect(session.snapshot().phase).toBe('draining')

    session.cancel()
    pending.shift()!()
    await Promise.resolve()
    now = 100
    session.frame(true)

    expect(session.snapshot().phase).toBe('cancelled')
    expect(applied).toEqual(['high/1'])
    expect(completed).toEqual([])
    expect(failed).toEqual([])
  })
})
