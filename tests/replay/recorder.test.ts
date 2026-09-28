import { describe, it, expect } from 'vitest'
import { createRecorder, recordingEndS, recordingStartS, REPLAY_SPAN_TICKS } from '../../src/replay/recorder.js'
import { DT } from '../../src/sim/flight/model.js'
import type { World } from '../../src/sim/loop.js'

// Only `tick` matters to the recorder; the cast keeps these tests independent of World's shape.
const w = (tick: number) => ({ tick }) as unknown as World<undefined>

describe('recorder (replay spec §3, plan R-1)', () => {
  it('is empty until something is pushed', () => {
    expect(createRecorder().snapshot()).toBeNull()
  })
  it('keeps the identical world objects, ascending', () => {
    const r = createRecorder()
    const a = w(1), b = w(2)
    r.push(a); r.push(b)
    expect(r.snapshot()!.worlds[0]).toBe(a)
    expect(r.snapshot()!.worlds[1]).toBe(b)
  })
  it('pushes nothing for a held frame (same tick)', () => {
    const r = createRecorder()
    const a = w(5)
    r.push(a); r.push(w(5)); r.push(w(5))
    expect(r.size()).toBe(1)
    expect(r.snapshot()!.worlds[0]).toBe(a)
  })
  it('spans the last 600 ticks and drops the oldest', () => {
    const r = createRecorder()
    for (let t = 1; t <= 2000; t++) r.push(w(t))
    const s = r.snapshot()!
    expect(s.worlds[0]!.tick).toBe(2000 - REPLAY_SPAN_TICKS)
    expect(s.worlds.at(-1)!.tick).toBe(2000)
  })
  it('spans ticks, not pushes: triple time records every 3rd tick over the same 10 s', () => {
    const r = createRecorder()
    for (let t = 3; t <= 3000; t += 3) r.push(w(t))
    const s = r.snapshot()!
    expect(s.worlds.at(-1)!.tick - s.worlds[0]!.tick).toBeLessThanOrEqual(REPLAY_SPAN_TICKS)
    expect(s.worlds.length).toBe(201)
  })
  it('a tick that goes backwards is a new flight: the buffer restarts', () => {
    const r = createRecorder()
    for (let t = 1; t <= 50; t++) r.push(w(t))
    r.push(w(0))
    expect(r.size()).toBe(1)
  })
  it('clear empties it; snapshot is a copy that later pushes do not change', () => {
    const r = createRecorder()
    r.push(w(1))
    const s = r.snapshot()!
    r.push(w(2))
    expect(s.worlds.length).toBe(1)
    r.clear()
    expect(r.snapshot()).toBeNull()
  })
  it('minTickGap 2 keeps every 2nd tick', () => {
    const r = createRecorder({ minTickGap: 2 })
    for (let t = 1; t <= 10; t++) r.push(w(t))
    expect(r.snapshot()!.worlds.map((x) => x.tick)).toEqual([1, 3, 5, 7, 9])
  })
  it('start and end are tick times', () => {
    const r = createRecorder()
    r.push(w(60)); r.push(w(120))
    expect(recordingStartS(r.snapshot()!)).toBeCloseTo(60 * DT, 12)
    expect(recordingEndS(r.snapshot()!)).toBeCloseTo(120 * DT, 12)
  })
})
