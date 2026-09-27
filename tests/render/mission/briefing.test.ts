import { describe, expect, it } from 'vitest'
import { loadScenarioBundle } from '../../../tools/content/load.js'
import { briefingModel, briefingRequest, conditionsFor } from '../../../src/render/mission/briefing.js'
import type { Scenario } from '../../../src/sim/scenario.js'

type CloudLayer = NonNullable<Scenario['weather']['clouds']>[number]
const layer = (kind: CloudLayer['kind'], baseM: number, coverage: number): CloudLayer => ({ kind, baseM, thicknessM: 200, coverage })
const cloud = (clouds: readonly CloudLayer[]): string =>
  conditionsFor({ windFromDeg: 0, windMps: 0, clouds: [...clouds] }).find((c) => c.label === 'Cloud')!.value

describe('conditionsFor', () => {
  it('time, wind and cloud as a pilot reads them', () => {
    expect(conditionsFor({ windFromDeg: 90, windMps: 6, timeOfDay: 14 })).toEqual([
      { label: 'Time', value: '1400 local' }, { label: 'Wind', value: 'From 090° at 12 kt' }, { label: 'Cloud', value: 'Clear' },
    ])
  })
  it('calm, the default noon, and 0645', () => {
    expect(conditionsFor({ windFromDeg: 270, windMps: 0 })).toEqual([
      { label: 'Time', value: '1200 local' }, { label: 'Wind', value: 'Calm' }, { label: 'Cloud', value: 'Clear' },
    ])
    expect(conditionsFor({ windFromDeg: 5, windMps: 12, timeOfDay: 6.75 }).slice(0, 2)).toEqual([
      { label: 'Time', value: '0645 local' }, { label: 'Wind', value: 'From 005° at 23 kt' },
    ])
    const time = (h: number): string => conditionsFor({ windFromDeg: 0, windMps: 0, timeOfDay: h })[0]!.value
    expect(time(17.5)).toBe('1730 local')
    expect(time(23.99)).toBe('2359 local')
  })
  it('layers in oktas, base to the nearest 100 ft', () => {
    expect(cloud([layer('cumulus', 600, 0.35)])).toBe('Scattered cumulus, base 2,000 ft')
    expect(cloud([layer('cirrus', 1200, 1)])).toBe('Overcast cirrus, base 3,900 ft')
    expect(cloud([layer('cumulus', 450, 0.05)])).toBe('Few cumulus, base 1,500 ft')
    expect(cloud([layer('cumulus', 450, 0.3)])).toBe('Few cumulus, base 1,500 ft')
    expect(cloud([layer('cumulus', 450, 0.5)])).toBe('Scattered cumulus, base 1,500 ft')
    expect(cloud([layer('cumulus', 450, 0.6)])).toBe('Broken cumulus, base 1,500 ft')
    expect(cloud([layer('cumulus', 450, 0.9)])).toBe('Broken cumulus, base 1,500 ft')
    // Base order, whatever order the file lists them in.
    expect(cloud([layer('cirrus', 1200, 1), layer('cumulus', 600, 0.35)]))
      .toBe('Scattered cumulus, base 2,000 ft; Overcast cirrus, base 3,900 ft')
  })
  it('reads no-coverage layers and an empty list as Clear', () => {
    expect(cloud([])).toBe('Clear')
    expect(cloud([layer('cumulus', 600, 0)])).toBe('Clear')
  })
})

describe('briefingModel', () => {
  it('reads a fixture mission', () => {
    const s = loadScenarioBundle('dev-mission-ui').scenario
    const m = briefingModel(s, [])
    expect(m.situation).toBe(s.briefing!.situation)
    expect(m.history).toBeNull()
    expect(m.objectives).toEqual([
      { label: 'Take off', priority: 'PRIMARY' }, { label: 'Recover', priority: 'PRIMARY' }, { label: 'Target', priority: 'SECONDARY' },
    ])
    expect(m.conditions).toEqual(conditionsFor(s.weather))
    expect(m.loadout).toBe('clean')
    expect(m.badge).toEqual({ name: 'UI Fixture Wings (dev)', held: false })
  })
  it('marks a held badge', () => {
    const s = loadScenarioBundle('dev-mission-ui').scenario
    expect(briefingModel(s, ['other', 'dev-ui-wings']).badge).toEqual({ name: 'UI Fixture Wings (dev)', held: true })
    expect(briefingModel(s, ['dev-circuit-wings']).badge!.held).toBe(false)
  })
  it('situation and loadout are null without a briefing', () => {
    const s = loadScenarioBundle('gunnery-range').scenario
    const m = briefingModel(s, [])
    expect(m.situation).toBeNull()
    expect(m.loadout).toBeNull()
    expect(m.history).toBeNull()
    expect(m.objectives).toEqual([])
    expect(m.badge).toBeNull()
  })
  it('carries history text and sources when the file has them', () => {
    const s = loadScenarioBundle('dev-mission-ui').scenario
    const history = { text: 'Context.', sources: ['A source.'] }
    expect(briefingModel({ ...s, history }, []).history).toEqual(history)
  })
})

describe('briefingRequest (Review Focus 5)', () => {
  type Deferred = { resolve: (s: Scenario) => void; reject: (e: Error) => void }
  const setup = (): { request: ReturnType<typeof briefingRequest>; pending: Map<string, Deferred>; calls: string[] } => {
    const pending = new Map<string, Deferred>()
    const calls: string[] = []
    const request = briefingRequest((id) => new Promise<Scenario>((resolve, reject) => { pending.set(id, { resolve, reject }) }))
    return { request, pending, calls }
  }
  const scenario = (id: string): Scenario => ({ ...loadScenarioBundle('dev-mission-ui').scenario, id })
  const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

  it('applies only the latest id', async () => {
    const { request, pending, calls } = setup()
    request('a', (s) => calls.push(`apply ${s.id}`), () => calls.push('fail'))
    request('b', (s) => calls.push(`apply ${s.id}`), () => calls.push('fail'))
    // B's fetch lands first, then A's stale one: only B may reach the screen.
    pending.get('b')!.resolve(scenario('b'))
    await flush()
    pending.get('a')!.resolve(scenario('a'))
    await flush()
    expect(calls).toEqual(['apply b'])
  })
  it('applies the latest even when a stale request resolves first', async () => {
    const { request, pending, calls } = setup()
    request('a', (s) => calls.push(`apply ${s.id}`), () => calls.push('fail'))
    request('b', (s) => calls.push(`apply ${s.id}`), () => calls.push('fail'))
    pending.get('a')!.resolve(scenario('a'))
    await flush()
    expect(calls).toEqual([])
    pending.get('b')!.resolve(scenario('b'))
    await flush()
    expect(calls).toEqual(['apply b'])
  })
  it('a stale failure is ignored; the latest failure calls fail', async () => {
    const { request, pending, calls } = setup()
    request('a', (s) => calls.push(`apply ${s.id}`), () => calls.push('fail a'))
    request('b', (s) => calls.push(`apply ${s.id}`), () => calls.push('fail b'))
    pending.get('a')!.reject(new Error('404'))
    await flush()
    expect(calls).toEqual([])
    pending.get('b')!.reject(new Error('404'))
    await flush()
    expect(calls).toEqual(['fail b'])
  })
})
