import { describe, it, expect } from 'vitest'
import { replayBarModel } from '../../src/render/replayBar.js'
import { applyReplayCommand, autoWindow, manualWindow, startReplay, stepReplay } from '../../src/replay/player.js'
import { ORBIT_ZERO } from '../../src/input/orbit.js'
import type { ReplayCameraState } from '../../src/replay/cameras.js'
import type { World } from '../../src/sim/loop.js'
import { v3 } from '../../src/sim/math/vec3.js'

const w = (tick: number) => ({ tick }) as unknown as World<undefined>
const R = { worlds: [w(600), w(1200)] } // 10 s .. 20 s
const camera = (o: Partial<ReplayCameraState> = {}): ReplayCameraState => ({
  selected: 'orbit', auto: 'flyby', orbit: ORBIT_ZERO, spin: true, flybyPoint: v3(0, 0, 0), targetId: 'z1',
  manual: { position: v3(0, 0, 0), yawRad: 0, pitchRad: 0, lock: false, speedMps: 30 },
  ...o,
})

describe('replay bar model (spec §6; plan R-5)', () => {
  it('is labelled REPLAY and shows progress from 0 at the start to 1 at the end', () => {
    let p = startReplay(R, manualWindow(R), 'hold')
    expect(replayBarModel(p, camera()).label).toBe('REPLAY')
    expect(replayBarModel(p, camera()).progress).toBe(0)
    p = stepReplay(p, 5000)
    expect(replayBarModel(p, camera()).progress).toBeCloseTo(0.5, 12)
    p = stepReplay(p, 60_000)
    expect(replayBarModel(p, camera()).progress).toBe(1)
  })
  it('an empty window reads as complete, not NaN', () => {
    const one = { worlds: [w(600)] }
    expect(replayBarModel(startReplay(one, manualWindow(one), 'hold'), camera()).progress).toBe(1)
  })
  it('marks the event (the last recorded tick): 8 / 9.5 of an automatic window, the end of a manual one', () => {
    expect(replayBarModel(startReplay(R, autoWindow(R), 'finish'), camera()).eventMarker).toBeCloseTo(8 / 9.5, 12)
    expect(replayBarModel(startReplay(R, manualWindow(R), 'hold'), camera()).eventMarker).toBe(1)
  })
  it('has no event marker when the event is outside the window', () => {
    const p = startReplay(R, { startS: 10, endS: 15 }, 'hold')
    expect(replayBarModel(p, camera()).eventMarker).toBeNull()
  })
  it('carries speed and play state', () => {
    let p = startReplay(R, manualWindow(R), 'hold')
    expect(replayBarModel(p, camera())).toMatchObject({ speed: 1, playing: true })
    p = applyReplayCommand(applyReplayCommand(p, { kind: 'speed', speed: 3 }), { kind: 'togglePlay' })
    expect(replayBarModel(p, camera())).toMatchObject({ speed: 3, playing: false })
  })
  it('lists the six cameras with their keys, the chosen one selected -- Auto included', () => {
    const p = startReplay(R, manualWindow(R), 'hold')
    const cams = replayBarModel(p, camera({ selected: 'auto' })).cameras
    expect(cams.map((c) => [c.id, c.label, c.key])).toEqual([
      ['auto', 'Auto', '4'], ['orbit', 'Orbit', '5'], ['flyby', 'Flyby', '6'],
      ['target', 'Target', '7'], ['cockpit', 'Cockpit', '8'], ['manual', 'Manual', '9'],
    ])
    expect(cams.filter((c) => c.selected).map((c) => c.id)).toEqual(['auto'])
  })
  it('greys out Target when there is no target (R-6), and nothing else', () => {
    const p = startReplay(R, manualWindow(R), 'hold')
    expect(replayBarModel(p, camera({ targetId: null })).cameras.filter((c) => c.disabled).map((c) => c.id)).toEqual(['target'])
    expect(replayBarModel(p, camera()).cameras.some((c) => c.disabled)).toBe(false)
  })
  it('shows Spin for an effective Orbit only, and Lock for Manual only', () => {
    const p = startReplay(R, manualWindow(R), 'hold')
    expect(replayBarModel(p, camera({ selected: 'orbit', spin: true }))).toMatchObject({ showSpin: true, spinOn: true, showLock: false })
    expect(replayBarModel(p, camera({ selected: 'orbit', spin: false }))).toMatchObject({ showSpin: true, spinOn: false })
    // Auto resolved to orbit is an orbit.
    expect(replayBarModel(p, camera({ selected: 'auto', auto: 'orbit' }))).toMatchObject({ showSpin: true, showLock: false })
    expect(replayBarModel(p, camera({ selected: 'auto', auto: 'flyby' }))).toMatchObject({ showSpin: false, showLock: false })
    const locked = camera({ selected: 'manual', manual: { position: v3(0, 0, 0), yawRad: 0, pitchRad: 0, lock: true, speedMps: 30 } })
    expect(replayBarModel(p, locked)).toMatchObject({ showSpin: false, showLock: true, lockOn: true })
    expect(replayBarModel(p, camera({ selected: 'cockpit' }))).toMatchObject({ showSpin: false, showLock: false })
  })
})
