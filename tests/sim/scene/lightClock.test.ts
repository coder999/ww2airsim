import { describe, expect, it } from 'vitest'
import { DT } from '../../../src/sim/flight/model.js'
import { perceptionAt, type NightFacts } from '../../../src/sim/lights/perception.js'
import type { LightSpec } from '../../../src/sim/lights/lights.js'
import { advance, type World } from '../../../src/sim/loop.js'
import { beginPreroll, handoffPreroll, skipScene, stepPreroll } from '../../../src/sim/scene/preroll.js'
import { parseScene } from '../../../src/sim/scene/schema.js'
import { missionWorld, steps, REACH_FAR } from '../mission/fixture.js'

/**
 * F10D D.3: a scheduled light follows the MISSION clock, not the world's. An opening scene runs the world for its duration with the mission set aside
 * and then rebases the mission clock (`clockOriginTick`), so a light scheduled on the world's own tick would burn N seconds out of step with the
 * mission windows that are meant to coincide with it (J4's flare IS its attack window). The scene's end tick is known when the pre-roll begins, so the
 * night fact carries it from the start, and a light with a negative `onAtS` ignites during the opening and is already burning at mission time 0.
 * Flown without a scene, the same light is burning from tick 0 (the origin is 0): one authoring, both paths.
 */
const FLARE: LightSpec = {
  id: 'flare', kind: 'flare', at: { x: 0, z: 0, altitudeM: 300 }, color: 'white', state: 'on', fixed: true,
  schedule: { onAtS: -3, burnS: 10 }, source: 'gameplay', sourceNote: 'test',
}
const NIGHT: NightFacts = { hour0: 22, latDeg: 11.24, cloudCover: 0, lights: [FLARE] }
const scene = (durationS: number) => parseScene({
  id: 't', chapter: 'J4', kind: 'opening', durationS, world: { source: 'mission', scenario: 'mission-fixture' },
  camera: [{ t: 0, position: [0, 100, 0], yawDeg: 0, pitchDeg: 0 }], cues: [], handoff: { player: 'ai' },
})
const start = (): World<undefined> => ({ ...missionWorld({ objectives: [REACH_FAR] }), night: NIGHT })
/** The player is the aircraft under the flare in these worlds (the fixture starts it at the origin, 3,000 m up: far above the 300 m flare, so the test moves nothing). */
const lit = (w: World<undefined>): boolean => {
  const p = perceptionAt(w, DT)!
  const floor = perceptionAt({ ...w, night: { ...NIGHT, lights: [] } }, DT)!
  return p.rangeM[w.player]! > floor.rangeM[w.player]!
}
const at = (w: World<undefined>, tick: number): World<undefined> => ({ ...w, tick })

describe('scheduled lights follow the mission clock', () => {
  it('the scene fixes the origin up front: the night fact carries the handoff tick from the first pre-roll tick', () => {
    const p = beginPreroll(start(), scene(10))
    expect(p.world.night!.clockOriginTick).toBe(600)
    expect(handoffPreroll(skipPre(p)).night!.clockOriginTick).toBe(600)
    expect(handoffPreroll(skipPre(p)).mission!.clockOriginTick).toBe(600)
  })
  it('a light scheduled at -3 s ignites 3 s before the handoff, and is burning at mission time 0', () => {
    const w0 = start()
    expect(lit(at(beginPreroll(w0, scene(10)).world, 419))).toBe(false) // 6.98 s in
    expect(lit(at(beginPreroll(w0, scene(10)).world, 421))).toBe(true) // 7.02 s in: -2.98 mission seconds
    const w = skipScene(w0, scene(10))
    expect(w.tick).toBe(600)
    expect(lit(w)).toBe(true)
  })
  it('it burns out burnS after it ignited, on the mission clock: 7 s into the flight', () => {
    const w = skipScene(start(), scene(10))
    expect(lit(at(w, 600 + 419))).toBe(true) // 6.98 s
    expect(lit(at(w, 600 + 421))).toBe(false) // 7.02 s
  })
  it('flown with no scene the same light is burning from tick 0 and goes out at 7 s (origin 0)', () => {
    const w = start()
    expect(w.night!.clockOriginTick).toBeUndefined()
    expect(lit(at(w, 0))).toBe(true)
    expect(lit(at(w, 419))).toBe(true)
    expect(lit(at(w, 421))).toBe(false)
  })
  it('a day world is untouched by the scene: no night fact appears', () => {
    const w0 = missionWorld({ objectives: [REACH_FAR] })
    expect(w0.night).toBeUndefined()
    expect(skipScene(w0, scene(2)).night).toBeUndefined()
    void steps; void advance
  })
})

function skipPre(p: ReturnType<typeof beginPreroll<undefined>>): ReturnType<typeof beginPreroll<undefined>> {
  let q = p
  while (q.left > 0) q = stepPreroll(q)
  return q
}
