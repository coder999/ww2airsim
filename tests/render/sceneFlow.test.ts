import { describe, expect, it } from 'vitest'
import { worldChecksum } from '../../src/flightRecorder/checksum.js'
import { markSceneSeen } from '../../src/campaign/index.js'
import { skipScene } from '../../src/sim/scene/preroll.js'
import { parseScene } from '../../src/sim/scene/schema.js'
import {
  beginPlayback, handoffWorld, loadScene, openingSceneId, playbackDone, sceneUnseen, sceneView, skipPlayback, stepPlayback, victorySceneId,
} from '../../src/render/sceneFlow.js'
import { fresh } from '../campaign/helpers.js'
import { REACH_FAR, missionWorld } from '../sim/mission/fixture.js'

const raw = {
  id: 'a1-opening', chapter: 'A1', kind: 'opening', durationS: 2, world: { source: 'mission', scenario: 'mission-fixture' },
  camera: [{ t: 0, position: [0, 3200, 0], yawDeg: 90, pitchDeg: -5 }, { t: 2, position: [100, 3200, 0], yawDeg: 90, pitchDeg: -5 }],
  cues: [{ t: 1, order: { kind: 'message', text: 'x' } }], handoff: { player: 'ai' },
}
const world = () => missionWorld({ objectives: [REACH_FAR] })

describe('scene flow', () => {
  it('names scenes by chapter and plays each once', () => {
    expect(openingSceneId('A1')).toBe('a1-opening')
    expect(victorySceneId('J6')).toBe('j6-victory')
    const c = fresh()
    expect(sceneUnseen(c, 'a1-opening')).toBe(true)
    expect(sceneUnseen(markSceneSeen(c, 'a1-opening'), 'a1-opening')).toBe(false)
  })

  it('a missing or invalid scene loads as null, so the flight proceeds', async () => {
    expect(await loadScene('nope', async () => { throw new Error('404') })).toBeNull()
    expect(await loadScene('bad', async () => '{"id":1}')).toBeNull()
    expect((await loadScene('a1-opening', async () => JSON.stringify(raw)))?.id).toBe('a1-opening')
  })

  it('live frames, skip mid-way and a straight skip all end at the same world', () => {
    const scene = parseScene(raw)
    let live = beginPlayback(world(), scene)
    while (!playbackDone(live)) live = stepPlayback(live, 1 / 30) // 30 fps against a 60 Hz sim
    let halfway = beginPlayback(world(), scene)
    for (let i = 0; i < 20; i++) halfway = stepPlayback(halfway, 1 / 30)
    halfway = skipPlayback(halfway)
    const headless = skipScene(world(), scene)
    expect(worldChecksum(handoffWorld(live))).toBe(worldChecksum(headless))
    expect(worldChecksum(handoffWorld(halfway))).toBe(worldChecksum(headless))
  })

  it('draws the scene eye, not the player', () => {
    const sp = beginPlayback(world(), parseScene(raw))
    const v = sceneView(stepPlayback(sp, 1), () => 0)
    expect(v.eye.position.x).toBeCloseTo(50)
    expect(v.poses).toHaveLength(v.world.aircraft.length)
  })
})
