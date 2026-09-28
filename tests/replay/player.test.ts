import { describe, it, expect } from 'vitest'
import {
  applyReplayCommand, autoWindow, manualReplayAvailable, manualWindow, startReplay, stepReplay,
} from '../../src/replay/player.js'
import { DT } from '../../src/sim/flight/model.js'
import type { World } from '../../src/sim/loop.js'

const w = (tick: number) => ({ tick }) as unknown as World<undefined>
const rec = (first: number, last: number) => ({ worlds: [w(first), w(last)] })
const R = rec(600, 1200) // 10 s .. 20 s

describe('replay player (spec §4, §6; plan R-8)', () => {
  it('auto window: 8 s before the last tick to 1.5 s after, clamped to the recording start', () => {
    expect(autoWindow(R)).toEqual({ startS: 12, endS: 21.5 })
    expect(autoWindow(rec(600, 660)).startS).toBeCloseTo(10, 12) // Review Focus 3
  })
  it('manual window: the whole recording', () => {
    expect(manualWindow(R)).toEqual({ startS: 10, endS: 20 })
  })
  it('manual replay needs 3 s recorded', () => {
    expect(manualReplayAvailable(null)).toBe(false)
    expect(manualReplayAvailable(rec(600, 600 + 2.9 / DT))).toBe(false)
    expect(manualReplayAvailable(rec(600, 600 + 3 / DT))).toBe(true)
  })
  it('plays at speed x real time', () => {
    let p = startReplay(R, autoWindow(R), 'finish')
    p = stepReplay(p, 1000)
    expect(p.tS).toBeCloseTo(13, 9)
    p = stepReplay(applyReplayCommand(p, { kind: 'speed', speed: 3 }), 1000)
    expect(p.tS).toBeCloseTo(16, 9)
    p = stepReplay(applyReplayCommand(p, { kind: 'speed', speed: 0.5 }), 1000)
    expect(p.tS).toBeCloseTo(16.5, 9)
  })
  it('paused does not move', () => {
    let p = applyReplayCommand(startReplay(R, autoWindow(R), 'finish'), { kind: 'togglePlay' })
    p = stepReplay(p, 1000)
    expect(p.tS).toBe(12)
    expect(p.playing).toBe(false)
  })
  it('finish: reaching the end is done', () => {
    const p = stepReplay(startReplay(R, autoWindow(R), 'finish'), 60_000)
    expect(p.tS).toBe(21.5)
    expect(p.done).toBe(true)
  })
  it('a 30 s hidden-tab frame clamps to the end rather than overshooting (Review Focus 2)', () => {
    const p = stepReplay(startReplay(R, manualWindow(R), 'hold'), 30_000)
    expect(p.tS).toBe(20)
  })
  it('hold: reaching the end pauses on the last frame; play restarts from the start (R-8)', () => {
    let p = stepReplay(startReplay(R, manualWindow(R), 'hold'), 60_000)
    expect(p.done).toBe(false)
    expect(p.playing).toBe(false)
    p = applyReplayCommand(p, { kind: 'togglePlay' })
    expect(p.tS).toBe(10)
    expect(p.playing).toBe(true)
    expect(p.jumped).toBe(true)
  })
  it('step moves by the given seconds, clamps, pauses, and marks a jump', () => {
    let p = stepReplay(startReplay(R, autoWindow(R), 'finish'), 2000) // t = 14
    p = applyReplayCommand(p, { kind: 'step', seconds: -1 })
    expect(p.tS).toBeCloseTo(13, 9)
    expect(p.playing).toBe(false)
    expect(p.jumped).toBe(true)
    p = applyReplayCommand(p, { kind: 'step', seconds: -100 })
    expect(p.tS).toBe(12)
  })
  it('jumped lasts one frame', () => {
    let p = applyReplayCommand(startReplay(R, autoWindow(R), 'finish'), { kind: 'seek', tS: 15 })
    expect(p.jumped).toBe(true)
    p = stepReplay(p, 16)
    expect(p.jumped).toBe(false)
  })
  it('skip is done at once; commands after done change nothing', () => {
    const p = applyReplayCommand(startReplay(R, autoWindow(R), 'finish'), { kind: 'skip' })
    expect(p.done).toBe(true)
    expect(applyReplayCommand(p, { kind: 'seek', tS: 15 })).toBe(p)
  })
  it('a one-world recording plays and finishes (Review Focus 3)', () => {
    const one = { worlds: [w(600)] }
    const p = stepReplay(startReplay(one, autoWindow(one), 'finish'), 5000)
    expect(p.done).toBe(true)
  })
})
