import { describe, expect, it } from 'vitest'
import { worldChecksum } from '../../../src/flightRecorder/checksum.js'
import { beginPreroll, handoffPreroll, skipScene, stepPreroll } from '../../../src/sim/scene/preroll.js'
import { parseScene } from '../../../src/sim/scene/schema.js'
import { REACH_FAR, missionWorld, steps } from '../mission/fixture.js'

const scene = (durationS: number, player: 'held' | 'ai' = 'ai') => parseScene({
  id: 't', chapter: 'A1', kind: 'opening', durationS, world: { source: 'mission', scenario: 'mission-fixture' },
  camera: [{ t: 0, position: [0, 100, 0], yawDeg: 0, pitchDeg: 0 }], cues: [], handoff: { player },
})
const world = () => missionWorld({ objectives: [REACH_FAR], triggers: [{ id: 'one', when: { at: 1 }, then: [{ message: 'one second' }] }] })

describe('scene pre-roll', () => {
  it('leaves the mission clock inert, then rebases it at handoff', () => {
    const w0 = world()
    const w = skipScene(w0, scene(3))
    expect(w.tick).toBe(w0.tick + 180)
    // 3 s passed; a 1 s trigger would have fired if the mission had run.
    expect(w.mission!.fired).toEqual([])
    expect(w.mission!.log).toEqual([])
    expect(w.mission!.clockOriginTick).toBe(w.tick)
    expect(steps(w, 59).mission!.fired).toEqual([])
    expect(steps(w, 60).mission!.fired).toEqual(['one'])
  })

  it('skip and a tick-by-tick live pass end at the same world checksum', () => {
    let p = beginPreroll(world(), scene(2))
    while (p.left > 0) p = stepPreroll(p)
    expect(worldChecksum(handoffPreroll(p))).toBe(worldChecksum(skipScene(world(), scene(2))))
  })

  it('the AI-flown player holds altitude through the pre-roll', () => {
    const w = skipScene(world(), scene(5))
    expect(Math.abs(w.aircraft.find((a) => a.id === w.player)!.state.position.y - 3000)).toBeLessThan(60)
  })

  it('a world that never plays a scene carries no clock origin', () => {
    expect('clockOriginTick' in steps(world(), 5).mission!).toBe(false)
  })
})
