import { describe, it, expect } from 'vitest'
import {
  AI_ENGINE_SUM_MAX, ENGINE_AUDIBLE_M, MAX_ENGINE_SOURCES, NO_SPATIAL_MEMORY, airCutoffHz, dopplerRate, nextSpatial,
  type SpatialAircraft, type SpatialInputs, type SpatialMemory,
} from '../../src/audio/spatial.js'

const ZERO = { x: 0, y: 0, z: 0 }
// North is -z, east +x, up +y; the camera looks north.
const LISTENER = { position: { x: 0, y: 1000, z: 0 }, forward: { x: 0, y: 0, z: -1 }, up: { x: 0, y: 1, z: 0 }, velocity: ZERO }
const plane = (id: string, x: number, y: number, z: number, extra: Partial<SpatialAircraft> = {}): SpatialAircraft =>
  ({ id, family: 'radial', position: { x, y, z }, velocity: ZERO, shots: 0, engineHealth: 1, ...extra })
const inputs = (o: Partial<SpatialInputs> = {}): SpatialInputs =>
  ({ tick: 100, listener: LISTENER, aircraft: [], decks: [], blasts: [], ...o })

describe('nextSpatial engines', () => {
  it('pans a source on the pilot\'s right to the right, ahead to -z, above to +y', () => {
    const { loops } = nextSpatial(NO_SPATIAL_MEMORY, inputs({ aircraft: [plane('r', 300, 1000, 0), plane('a', 0, 1000, -300), plane('u', 0, 1300, 0)] }))
    const at = (k: string) => loops.find((l) => l.key === `ai:${k}`)!.at
    expect(at('r').x).toBeCloseTo(300, 6)
    expect(at('a').z).toBeCloseTo(-300, 6)
    expect(at('u').y).toBeCloseTo(300, 6)
  })

  it('follows a banked and turned camera: facing east, a source to the south is on the right', () => {
    const east = { ...LISTENER, forward: { x: 1, y: 0, z: 0 } }
    const { loops } = nextSpatial(NO_SPATIAL_MEMORY, inputs({ listener: east, aircraft: [plane('s', 0, 1000, 300)] }))
    expect(loops[0]!.at.x).toBeCloseTo(300, 6)
  })

  it('keeps only the nearest six, and skips those out of earshot', () => {
    const fleet = Array.from({ length: 9 }, (_, i) => plane(`p${i}`, 200 + i * 100, 1000, 0))
    const far = plane('far', ENGINE_AUDIBLE_M + 500, 1000, 0)
    const { loops } = nextSpatial(NO_SPATIAL_MEMORY, inputs({ aircraft: [far, ...fleet] }))
    expect(loops.map((l) => l.key)).toEqual(['p0', 'p1', 'p2', 'p3', 'p4', 'p5'].map((k) => `ai:${k}`))
    expect(loops.length).toBe(MAX_ENGINE_SOURCES)
  })

  it('never lets six close engines sum past the cap', () => {
    const fleet = Array.from({ length: 6 }, (_, i) => plane(`p${i}`, 50 + i, 1000, 0))
    const sum = nextSpatial(NO_SPATIAL_MEMORY, inputs({ aircraft: fleet })).loops.reduce((s, l) => s + l.gain, 0)
    expect(sum).toBeLessThanOrEqual(AI_ENGINE_SUM_MAX + 1e-9)
  })

  it('is quieter and duller with distance, and silent at the edge', () => {
    const [n, f, edge] = [400, 1600, ENGINE_AUDIBLE_M].map((d) =>
      nextSpatial(NO_SPATIAL_MEMORY, inputs({ aircraft: [plane('x', d, 1000, 0)] })).loops[0]!)
    expect(f!.gain).toBeLessThan(n!.gain)
    expect(f!.cutoffHz).toBeLessThan(n!.cutoffHz)
    expect(edge!.gain).toBe(0)
  })

  it('shifts pitch up when approaching and down when receding', () => {
    const towards = nextSpatial(NO_SPATIAL_MEMORY, inputs({ aircraft: [plane('t', 500, 1000, 0, { velocity: { x: -150, y: 0, z: 0 } })] })).loops[0]!
    const away = nextSpatial(NO_SPATIAL_MEMORY, inputs({ aircraft: [plane('a', 500, 1000, 0, { velocity: { x: 150, y: 0, z: 0 } })] })).loops[0]!
    const still = nextSpatial(NO_SPATIAL_MEMORY, inputs({ aircraft: [plane('s', 500, 1000, 0)] })).loops[0]!
    expect(towards.rate).toBeGreaterThan(still.rate)
    expect(away.rate).toBeLessThan(still.rate)
    expect(dopplerRate(0)).toBe(1)
  })

  it('makes no loop for a silent engine, and survives a non-finite position', () => {
    const { loops } = nextSpatial(NO_SPATIAL_MEMORY, inputs({ aircraft: [plane('dead', 300, 1000, 0, { engineHealth: 0 }), plane('nan', Number.NaN, 0, 0)] }))
    expect(loops.every((l) => Number.isFinite(l.gain) && l.gain >= 0 && Number.isFinite(l.at.x))).toBe(true)
    expect(loops.find((l) => l.key === 'ai:dead')?.gain ?? 0).toBe(0)
    expect(loops.find((l) => l.key === 'ai:nan')).toBeUndefined()
  })

  it('returns nothing for a degenerate listener rather than NaN', () => {
    const bad = { ...LISTENER, forward: { x: 0, y: 1, z: 0 } }
    expect(nextSpatial(NO_SPATIAL_MEMORY, inputs({ listener: bad, aircraft: [plane('x', 300, 1000, 0)] })).loops).toEqual([])
  })
})

describe('nextSpatial one-shots', () => {
  const blast = (tick: number, x: number, surface = 'land') => ({ tick, surface, position: { x, y: 0, z: 0 } })

  it('delays a detonation by distance / 343 m/s and lowpasses it', () => {
    const d = 1715 // 5 s
    let m: SpatialMemory = NO_SPATIAL_MEMORY
    const first = nextSpatial(m, inputs({ tick: 100, blasts: [blast(100, d)] }))
    m = first.memory
    expect(first.shots).toEqual([])
    const due = 100 + Math.round((Math.hypot(d, 1000) / 343) * 60)
    const before = nextSpatial(m, inputs({ tick: due - 1 }))
    expect(before.shots).toEqual([])
    const at = nextSpatial(before.memory, inputs({ tick: due }))
    expect(at.shots.length).toBe(1)
    expect(at.shots[0]!.clip).toBe('explosion')
    expect(at.shots[0]!.cutoffHz).toBeLessThan(airCutoffHz(0))
    expect(at.shots[0]!.level).toBeLessThan(1)
    expect(at.shots[0]!.at.x).toBeCloseTo(d, 3)
  })

  it('plays the distant thump for far detonations and the water crash for a near splash', () => {
    const far = nextSpatial(NO_SPATIAL_MEMORY, inputs({ blasts: [blast(100, 5000)] })).memory.pending[0]!
    const splash = nextSpatial(NO_SPATIAL_MEMORY, inputs({ blasts: [blast(100, 400, 'water')] })).memory.pending[0]!
    expect(far.clip).toBe('flak_distant')
    expect(splash.clip).toBe('water_crash')
  })

  it('does not replay a detonation it has already seen, nor hear one beyond earshot', () => {
    const b = blast(100, 500)
    const a = nextSpatial(NO_SPATIAL_MEMORY, inputs({ blasts: [b] }))
    const again = nextSpatial(a.memory, inputs({ tick: 101, blasts: [b] }))
    expect(a.memory.pending.length + a.shots.length).toBe(1)
    expect(again.memory.pending.length + again.shots.length).toBe(a.memory.pending.length)
    expect(nextSpatial(NO_SPATIAL_MEMORY, inputs({ blasts: [blast(100, 20_000)] })).memory.pending).toEqual([])
  })

  it('queues at most four of a same-tick salvo, nearest first', () => {
    const salvo = Array.from({ length: 30 }, (_, i) => blast(100, 300 + i * 10))
    const r = nextSpatial(NO_SPATIAL_MEMORY, inputs({ blasts: salvo }))
    expect(r.memory.pending.length).toBe(4)
  })

  it('bursts an AI gun once per interval while its shot count rises, never on first sight', () => {
    let m = nextSpatial(NO_SPATIAL_MEMORY, inputs({ tick: 1, aircraft: [plane('w', 300, 1000, 0, { shots: 0 })] })).memory
    expect(m.pending).toEqual([])
    m = nextSpatial(m, inputs({ tick: 2, aircraft: [plane('w', 300, 1000, 0, { shots: 5 })] })).memory
    expect(m.pending.map((p) => p.clip)).toEqual(['machinegun'])
    m = nextSpatial(m, inputs({ tick: 3, aircraft: [plane('w', 300, 1000, 0, { shots: 10 })] })).memory
    expect(m.pending.length).toBe(1)
  })

  it('resets when the tick goes backwards, dropping stale pending sounds', () => {
    const a = nextSpatial(NO_SPATIAL_MEMORY, inputs({ tick: 500, blasts: [blast(500, 2000)] }))
    expect(a.memory.pending.length).toBe(1)
    const back = nextSpatial(a.memory, inputs({ tick: 10 }))
    expect(back.memory.pending).toEqual([])
    expect(back.memory.blastTick).toBeNull()
  })
})

describe('nextSpatial carrier deck', () => {
  const deck = (x: number, z: number) => ({ id: 'cv', center: { x, y: 0, z }, lengthM: 250 })

  it('sits at the ship, off to its side', () => {
    const l = nextSpatial(NO_SPATIAL_MEMORY, inputs({ decks: [deck(300, 0)] })).loops.find((s) => s.key === 'deck')!
    expect(l.at.x).toBeGreaterThan(0)
    expect(l.gain).toBeGreaterThan(0)
  })

  it('is centred and full over the hull, and absent when far away', () => {
    const over = nextSpatial(NO_SPATIAL_MEMORY, inputs({ decks: [deck(0, 0)] })).loops.find((s) => s.key === 'deck')!
    expect(over.at.x).toBeCloseTo(0, 6)
    expect(Number.isFinite(over.at.z)).toBe(true)
    expect(nextSpatial(NO_SPATIAL_MEMORY, inputs({ decks: [deck(5000, 0)] })).loops).toEqual([])
  })
})
