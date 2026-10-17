import { describe, expect, it } from 'vitest'
import { deleteKey, dropKey, recordPath } from '../../../src/sim/scene/keyframes.js'
import { parseScene, type Keyframe } from '../../../src/sim/scene/schema.js'

const key = (t: number, over: Partial<Keyframe> = {}): Keyframe => ({
  t, position: [0, 100, 0], yawDeg: 0, pitchDeg: 0, ease: 'inOut', ...over,
})

function roundTrip(camera: Keyframe[]): Keyframe[] {
  return parseScene(JSON.parse(JSON.stringify({
    id: 'A1-opening', chapter: 'A1', kind: 'opening', durationS: 15,
    world: { source: 'mission', scenario: 'a1' }, camera, cues: [],
    handoff: { player: 'held' },
  }))).camera
}

describe('director keyframes', () => {
  it('inserts keys in time order and replaces keys within 1 ms', () => {
    const keys = [key(0), key(2)]
    expect(dropKey(keys, key(1))).toEqual([key(0), key(1), key(2)])
    const replacement = key(2.0005, { yawDeg: 45 })
    expect(dropKey(keys, replacement)).toEqual([key(0), replacement])
    expect(dropKey(keys, key(2))).toEqual(keys)
    expect(dropKey([key(0)], key(0.001))).toEqual([key(0.001)])
    expect(dropKey(keys, key(2.002))).toHaveLength(3)
    expect(dropKey([], key(0))).toEqual([key(0)])
  })

  it('deletes the supplied index before sorting; invalid indices leave all keys', () => {
    const keys = [key(2), key(0), key(1)]
    expect(deleteKey(keys, 0)).toEqual([key(0), key(1)])
    for (const index of [-1, 3, 0.5, NaN]) {
      expect(deleteKey(keys, index)).toEqual([key(0), key(1), key(2)])
    }
    expect(deleteKey([key(0)], 0)).toEqual([])
    expect(deleteKey([], 0)).toEqual([])
  })

  it('thins a dense path relative to the last retained sample and keeps endpoints', () => {
    const samples = Array.from({ length: 12 }, (_, i) => key(i / 4, { position: [i, 100, 0] }))
    const result = recordPath(samples, 0.5, 3, 10)
    expect(result).toEqual([samples[0], samples[3], samples[6], samples[9], samples[11]])
    expect(roundTrip(result)).toEqual(result)
  })

  it('requires the time interval even for large moves and keeps the short final interval', () => {
    const samples = [key(0), key(0.1, { position: [100, 100, 0] }),
      key(0.5, { position: [200, 100, 0] }), key(0.6)]
    expect(recordPath(samples, 0.5, 10, 10)).toEqual([samples[0], samples[2], samples[3]])
  })

  it('retains turns without translation, including pitch and wrapped yaw', () => {
    const samples = [key(0, { yawDeg: 359 }), key(1, { yawDeg: 1 }),
      key(2, { yawDeg: 9 }), key(3, { yawDeg: 9, pitchDeg: 10 }), key(4)]
    expect(recordPath(samples, 1, 10, 10)).toEqual([samples[0], samples[2], samples[3], samples[4]])
    const negative = [key(0, { yawDeg: -179 }), key(1, { yawDeg: 179 }), key(2)]
    expect(recordPath(negative, 1, 10, 10)).toEqual([negative[0], negative[2]])
  })

  it('measures movement in all three dimensions', () => {
    const samples = [key(0), key(1, { position: [0, 103, 4] }), key(2)]
    expect(recordPath(samples, 1, 5, 10)).toEqual(samples)
  })

  it('handles empty, single and stationary paths and defaults omitted easing', () => {
    expect(recordPath([], 1, 1, 1)).toEqual([])
    expect(recordPath([key(0)], 1, 1, 1)).toEqual([key(0)])
    expect(recordPath([key(0), key(1), key(2)], 1, 1, 1)).toEqual([key(0), key(2)])
    expect(recordPath([key(0), key(1), key(2)], 0, 0, 0)).toEqual([key(0), key(1), key(2)])
    const sample = { t: 0, position: [0, 100, 0] as const, yawDeg: 0, pitchDeg: 0 }
    expect(recordPath([sample], 1, 1, 1)).toEqual([key(0)])
  })

  it.each(['drop', 'delete', 'record'] as const)('%s is immutable, sorted and round-trips through the scene schema', (op) => {
    const keys = [key(3), key(0), key(2), key(1)]
    const before = structuredClone(keys)
    keys.forEach((k) => { Object.freeze(k.position); Object.freeze(k) })
    Object.freeze(keys)
    const added = key(1.0005, { ease: 'linear' })
    Object.freeze(added.position)
    Object.freeze(added)
    const result = op === 'drop' ? dropKey(keys, added)
      : op === 'delete' ? deleteKey(keys, 2) : recordPath(keys, 1, 0, 0)
    expect(result.length).toBeGreaterThan(0)
    expect(result.map((k) => k.t)).toEqual(result.map((k) => k.t).sort((a, b) => a - b))
    expect(roundTrip(result)).toEqual(result)
    expect(keys).toEqual(before)
    result[0]!.position[0] = 999
    expect(keys).toEqual(before)
    expect(added).toEqual(key(1.0005, { ease: 'linear' }))
  })

  it('rejects invalid thinning thresholds', () => {
    for (const value of [-1, NaN, Infinity]) {
      expect(() => recordPath([], value, 1, 1)).toThrow(RangeError)
      expect(() => recordPath([], 1, value, 1)).toThrow(RangeError)
      expect(() => recordPath([], 1, 1, value)).toThrow(RangeError)
    }
  })
})
