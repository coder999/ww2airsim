import { describe, it, expect } from 'vitest'
import { initialFrameState, nextFrameState, surfaceHeightFor } from '../../src/render/frame.js'
import { createRecorder, recordingEndS, recordingStartS } from '../../src/replay/recorder.js'
import { replayPosesAt } from '../../src/replay/view.js'
import { playerAircraft } from '../../src/sim/loop.js'
import { DT } from '../../src/sim/flight/model.js'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { createState } from '../../src/sim/flight/state.js'
import { v3, length } from '../../src/sim/math/vec3.js'
import { SEA_LEVEL_M } from '../../src/sim/world/terrain.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const fly = (frames: number, elapsed = 1 / 60) => {
  let f = initialFrameState(f6f, createState({ position: v3(0, 2000, 0), velocity: v3(120, 0, 0) }))
  const rec = createRecorder()
  const lives = []
  for (let i = 0; i < frames; i++) {
    f = nextFrameState(f, elapsed, new Set(['ArrowLeft']))
    rec.push(f.world); lives.push(f)
  }
  return { rec: rec.snapshot()!, lives }
}

describe('replayPosesAt (spec §3, plan R-1)', () => {
  it('exactness: a recorded world is the identical object the live frame had', () => {
    const { rec, lives } = fly(120)
    const k = rec.worlds.length - 30
    expect(lives.some((l) => l.world === rec.worlds[k])).toBe(true)
  })
  it('at a recorded tick time, the player is exactly at that tick state', () => {
    const { rec } = fly(120)
    const w = rec.worlds[40]!
    const p = replayPosesAt(rec, w.tick * DT)
    expect(p.world).toBe(w)
    expect(p.render.position).toEqual(playerAircraft(w).state.position)
  })
  it('between two recorded worlds it lerps from the earlier state to the later', () => {
    const { rec } = fly(120)
    const a = rec.worlds[40]!, b = rec.worlds[41]!
    const mid = replayPosesAt(rec, ((a.tick + b.tick) / 2) * DT)
    const pa = playerAircraft(a).state.position, pb = playerAircraft(b).state.position
    expect(mid.render.position.x).toBeCloseTo((pa.x + pb.x) / 2, 9)
    expect(mid.world).toBe(b)
  })
  it('triple time: recorded worlds 3 ticks apart replay continuously (Review Focus 5)', () => {
    const { rec } = fly(120, 3 / 60)
    expect(rec.worlds[1]!.tick - rec.worlds[0]!.tick).toBe(3)
    let prevX = -Infinity
    for (let t = recordingStartS(rec); t <= recordingEndS(rec); t += DT / 2) {
      const x = replayPosesAt(rec, t).render.position.x
      expect(x).toBeGreaterThanOrEqual(prevX - 1e-9) // flying east: never jumps back
      prevX = x
    }
  })
  it('past the last tick the world is held at the last state; before the first, the first', () => {
    const { rec } = fly(60)
    const last = rec.worlds.at(-1)!
    const held = replayPosesAt(rec, recordingEndS(rec) + 1.5)
    expect(held.world).toBe(last)
    expect(held.render.position).toEqual(playerAircraft(last).state.position)
    expect(replayPosesAt(rec, recordingStartS(rec) - 1).world).toBe(rec.worlds[0])
  })
  it('reports the lerped player speed for the chase distance', () => {
    const { rec } = fly(60)
    const p = replayPosesAt(rec, rec.worlds[10]!.tick * DT)
    expect(p.speedMps).toBeCloseTo(length(playerAircraft(rec.worlds[10]!).state.velocity), 6)
  })
  it('a one-world recording poses without throwing (Review Focus 3)', () => {
    const one = { worlds: [fly(1).rec.worlds[0]!] }
    expect(() => replayPosesAt(one, 0)).not.toThrow()
  })
  it('surfaceHeightFor reads the sea when there is no terrain', () => {
    const { lives } = fly(1)
    expect(surfaceHeightFor(lives[0]!.world)(123, 456)).toBe(SEA_LEVEL_M)
  })
})
