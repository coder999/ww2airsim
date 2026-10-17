import { describe, expect, it } from 'vitest'
import { worldChecksum } from '../../../src/flightRecorder/checksum.js'
import { beginPreroll, skipScene, stepPreroll } from '../../../src/sim/scene/preroll.js'
import { parseScene } from '../../../src/sim/scene/schema.js'
import { sceneAt } from '../../../src/sim/scene/camera.js'
import { REACH_FAR, missionWorld } from '../mission/fixture.js'

const RAID = { id: 'raid-2', spec: 'f6f-hellcat', airborneAt: { position: [-20000, 3000, -16479], headingDeg: 90, speedMps: 130 } }
const world = () => missionWorld({
  objectives: [REACH_FAR],
  triggers: [{ id: 'later', when: { at: 100000 }, then: [{ spawn: 'wave' }] }],
  heldGroups: [{ id: 'wave', aircraft: [RAID] }],
})
const kf = (t: number, x = 0) => ({ t, position: [x, 100, 0], yawDeg: 0, pitchDeg: 0 })
const scene = (cues: unknown[], durationS = 3) => parseScene({
  id: 't', chapter: 'A1', kind: 'opening', durationS, world: { source: 'mission', scenario: 'mission-fixture' },
  camera: [kf(0)], cues, handoff: { player: 'ai' },
})
const msg = { t: 1, order: { kind: 'message', text: 'Strike lead: Zeros over the convoy!' } }
const course = { t: 1, order: { kind: 'order', entity: 'cv-1', order: { course: { waypoints: [{ x: 0, z: 0 }, { x: 100, z: 0 }], speedMps: 5 } } } }

describe('scene cues', () => {
  it('spawns a held group, applies a ship course, and hands the renderer the message', () => {
    const w = skipScene(world(), scene([msg, course, { t: 2, order: { kind: 'spawn', group: 'wave' } }]))
    expect(w.aircraft.some((a) => a.id === 'raid-2')).toBe(true)
    expect(w.ships.find((s) => s.id === 'cv-1')!.orders.speedMps).toBe(5)
    expect(w.mission!.spawned).toEqual(['wave'])
    let p = beginPreroll(world(), scene([msg]))
    while (p.left > 0) p = stepPreroll(p)
    expect(p.emitted).toEqual([{ kind: 'message', text: msg.order.text, t: 1 }])
  })

  it('is deterministic across two runs', () => {
    const s = scene([course, { t: 2, order: { kind: 'spawn', group: 'wave' } }])
    expect(worldChecksum(skipScene(world(), s))).toBe(worldChecksum(skipScene(world(), s)))
  })

  it('an order naming a missing entity fails the load, not the flight', () => {
    const bad = scene([{ t: 1, order: { kind: 'order', entity: 'nope', order: { attack: null } } }])
    expect(() => beginPreroll(world(), bad)).toThrow(/missing entity "nope"/)
    expect(() => beginPreroll(world(), scene([{ t: 1, order: { kind: 'spawn', group: 'nope' } }]))).toThrow(/missing held group/)
  })
})

describe('sceneAt', () => {
  const s = { camera: parseScene({ id: 't', chapter: 'A1', kind: 'opening', durationS: 10, world: { source: 'mission', scenario: 'x' }, camera: [{ ...kf(0), yawDeg: 350, ease: 'linear' }, { ...kf(10, 100), yawDeg: 10, ease: 'linear' }], cues: [], handoff: { player: 'held' } }).camera }
  it('hits the endpoints, clamps outside them, and turns the short way', () => {
    expect(sceneAt(s, -5).position[0]).toBe(0)
    expect(sceneAt(s, 99).position[0]).toBe(100)
    const mid = sceneAt(s, 5)
    expect(mid.position[0]).toBeCloseTo(50)
    expect(((mid.yawDeg % 360) + 360) % 360).toBeCloseTo(0)
  })
  it('eases in and out (slower than linear near an end)', () => {
    const e = { camera: [{ ...s.camera[0]!, ease: 'inOut' as const }, { ...s.camera[1]!, ease: 'inOut' as const }] }
    expect(sceneAt(e, 1).position[0]).toBeLessThan(10)
    expect(sceneAt(e, 5).position[0]).toBeCloseTo(50)
  })
})
