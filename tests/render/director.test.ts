import { describe, expect, it } from 'vitest'
import {
  directorEye, directorModel, reduceDirector, serializeDirector, type DirectorState,
} from '../../src/render/director.js'
import type { SceneEye } from '../../src/sim/scene/camera.js'
import { parseScene, type Keyframe, type Scene } from '../../src/sim/scene/schema.js'

const eye = (x = 0): SceneEye => ({ position: [x, 100, 0], yawDeg: x, pitchDeg: 0 })
const key = (t: number): Keyframe => ({ ...eye(t * 10), position: [t * 10, 100, 0], t, ease: 'linear' })
const scene = (): Scene => ({
  id: 'A1-opening', chapter: 'A1', kind: 'opening', durationS: 10,
  world: { source: 'mission', scenario: 'a1' }, camera: [key(0), key(10)],
  cues: [{ t: 3, order: { kind: 'message', text: 'Hold formation.' } }], handoff: { player: 'held' },
})

function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}

function roundTrip(state: DirectorState): Scene {
  const result = serializeDirector(state)
  if (!result.ok) throw new Error(result.error)
  expect(result.json).toContain('\n  "id": "A1-opening"')
  return parseScene(JSON.parse(result.json))
}

describe('director model', () => {
  it('owns its scene and drops the flown eye at the scrub time without changing prior state', () => {
    const source = scene()
    const initial = directorModel(source)
    source.camera[0]!.position[0] = 999
    expect(initial.scene.camera[0]!.position[0]).toBe(0)
    const before = freeze(reduceDirector(initial, { kind: 'scrub', tSeconds: 4 }))
    const flown = freeze(eye(55))
    const dropped = reduceDirector(before, { kind: 'drop', eye: flown })
    expect(dropped.scene.camera.map((k) => k.t)).toEqual([0, 4, 10])
    expect(dropped.selected).toBe(1)
    expect(directorEye(dropped)).toEqual(flown)
    expect(before.scene.camera).toHaveLength(2)
    expect(dropped.scene.camera[1]!.position).not.toBe(flown.position)
    expect(roundTrip(dropped)).toEqual(dropped.scene)
    expect(dropped.scene.cues).toEqual(before.scene.cues)
    expect(dropped.scene.world).toEqual(before.scene.world)
  })

  it('selects the replacement key after a nearby drop and deletes only the selected key', () => {
    let state = directorModel(scene())
    state = reduceDirector(state, { kind: 'scrub', tSeconds: 0.0005 })
    state = reduceDirector(state, { kind: 'drop', eye: eye(25) })
    expect(state.scene.camera.map((k) => k.t)).toEqual([0.0005, 10])
    expect(state.selected).toBe(0)
    const before = freeze(state)
    state = reduceDirector(state, { kind: 'delete' })
    expect(state.scene.camera).toEqual([key(10)])
    expect(state.selected).toBeNull()
    expect(before.scene.camera).toHaveLength(2)
    expect(reduceDirector(state, { kind: 'delete' })).toBe(state)
    expect(roundTrip(state).camera).toEqual([key(10)])
  })

  it('scrubs through interpolated eyes, clamps to the duration and pauses preview', () => {
    const initial = freeze(directorModel(scene()))
    const playing = reduceDirector(initial, { kind: 'play' })
    const middle = reduceDirector(playing, { kind: 'scrub', tSeconds: 2.5 })
    expect(middle.playing).toBe(false)
    expect(directorEye(middle)).toEqual(eye(25))
    expect(directorEye(reduceDirector(middle, { kind: 'scrub', tSeconds: -10 }))).toEqual(eye(0))
    const end = reduceDirector(middle, { kind: 'scrub', tSeconds: 99 })
    expect(end.tSeconds).toBe(10)
    expect(end.selected).toBe(1)
    expect(directorEye(end)).toEqual(eye(100))
    expect(reduceDirector(middle, { kind: 'scrub', tSeconds: NaN })).toBe(middle)
    expect(initial.tSeconds).toBe(0)
  })

  it('toggles only the selected key easing, affecting the incoming segment', () => {
    let state = directorModel(scene())
    expect(reduceDirector(state, { kind: 'ease' })).toBe(state)
    expect(reduceDirector(state, { kind: 'select', index: 99 })).toBe(state)
    state = freeze(reduceDirector(state, { kind: 'select', index: 1 }))
    expect(state.tSeconds).toBe(10)
    const eased = reduceDirector(state, { kind: 'ease' })
    expect(eased.scene.camera.map((k) => k.ease)).toEqual(['linear', 'inOut'])
    expect(directorEye(reduceDirector(eased, { kind: 'scrub', tSeconds: 2.5 }))?.position[0]).toBe(15.625)
    expect(reduceDirector(eased, { kind: 'ease' }).scene).toEqual(state.scene)
    expect(roundTrip(eased)).toEqual(eased.scene)
  })

  it('advances preview in seconds, stops at the end, and restarts from zero', () => {
    const initial = freeze(directorModel(scene()))
    expect(reduceDirector(initial, { kind: 'advance', dtS: 1 })).toBe(initial)
    let state = reduceDirector(initial, { kind: 'play' })
    state = reduceDirector(state, { kind: 'advance', dtS: 2.5 })
    expect(state.tSeconds).toBe(2.5)
    expect(directorEye(state)).toEqual(eye(25))
    for (const dtS of [-1, NaN, Infinity]) {
      expect(reduceDirector(state, { kind: 'advance', dtS })).toBe(state)
    }
    state = reduceDirector(state, { kind: 'advance', dtS: 100 })
    expect(state).toMatchObject({ tSeconds: 10, playing: false })
    state = reduceDirector(state, { kind: 'play' })
    expect(state).toMatchObject({ tSeconds: 0, playing: true })
    expect(reduceDirector(state, { kind: 'stop' }).playing).toBe(false)
  })

  it('records a thinned path and replaces only keys inside its inclusive time span', () => {
    const source = { ...scene(), camera: [0, 2, 3, 4, 6, 10].map(key) }
    let state = reduceDirector(directorModel(source), { kind: 'scrub', tSeconds: 2 })
    state = reduceDirector(state, { kind: 'record', eye: eye(20) })
    expect(state.playing).toBe(false)
    expect(serializeDirector(state).ok).toBe(false)
    expect(reduceDirector(state, { kind: 'scrub', tSeconds: 9 })).toBe(state)
    expect(reduceDirector(state, { kind: 'play' })).toBe(state)
    for (const [dtS, x] of [[0.125, 20.1], [0.375, 22], [0.5, 22.1], [1, 24]] as const) {
      state = reduceDirector(freeze(state), { kind: 'advance', dtS, eye: freeze(eye(x)) })
    }
    expect(state.samples).toHaveLength(5)
    expect(state.scene.camera).toEqual(source.camera)
    const recording = freeze(state)
    state = reduceDirector(recording, { kind: 'stop' })
    expect(state.samples).toBeNull()
    expect(state.scene.camera.map((k) => k.t)).toEqual([0, 2, 2.5, 4, 6, 10])
    expect(state.scene.camera.map((k) => k.position[0])).toEqual([0, 20, 22, 24, 60, 100])
    expect(state.selected).toBe(3)
    expect(recording.samples).toHaveLength(5)
    expect(roundTrip(state)).toEqual(state.scene)
    expect(source.camera).toEqual([0, 2, 3, 4, 6, 10].map(key))
  })

  it('keeps a single-sample take and commits a final sample at the duration', () => {
    let state = reduceDirector(directorModel(scene()), { kind: 'record', eye: eye(5) })
    state = reduceDirector(state, { kind: 'advance', dtS: 0, eye: eye(7) })
    expect(state.samples).toHaveLength(1)
    const single = reduceDirector(state, { kind: 'stop' })
    expect(single.scene.camera.map((k) => k.position[0])).toEqual([7, 100])
    state = reduceDirector(freeze(state), { kind: 'advance', dtS: 100, eye: eye(50) })
    expect(state).toMatchObject({ tSeconds: 10, samples: null, playing: false })
    expect(state.scene.camera.map((k) => [k.t, k.position[0]])).toEqual([[0, 7], [10, 50]])
    expect(roundTrip(state)).toEqual(state.scene)
    expect(reduceDirector(state, { kind: 'record', eye: eye() })).toBe(state)
  })

  it('reports invalid scenes at Save and lets an empty camera recover with Drop key', () => {
    let state = directorModel({ ...scene(), camera: [key(0)] })
    state = reduceDirector(state, { kind: 'select', index: 0 })
    state = reduceDirector(state, { kind: 'delete' })
    expect(directorEye(state)).toBeNull()
    expect(reduceDirector(state, { kind: 'play' })).toBe(state)
    const invalid = serializeDirector(state)
    expect(invalid.ok).toBe(false)
    if (!invalid.ok) expect(invalid.error).toContain('camera')
    state = reduceDirector(state, { kind: 'drop', eye: eye() })
    expect(roundTrip(state).camera).toHaveLength(1)
    const nonfinite = reduceDirector(state, { kind: 'drop', eye: eye(NaN) })
    expect(serializeDirector(nonfinite).ok).toBe(false)
    const extraChannel = { ...state, scene: { ...state.scene, camera: [{ ...key(0), fovDeg: 60 }] } }
    expect(serializeDirector(extraChannel).ok).toBe(false)
  })
})
