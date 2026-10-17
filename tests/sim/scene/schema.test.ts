import { describe, expect, it } from 'vitest'
import { parseScene } from '../../../src/sim/scene/schema.js'
import { markSceneSeen, validateCampaign } from '../../../src/campaign/index.js'
import { fresh, accept } from '../../campaign/helpers.js'

const kf = (t: number) => ({ t, position: [0, 100, 0], yawDeg: 0, pitchDeg: 0 })
const scene = (over: Record<string, unknown> = {}) => ({
  id: 'A1-opening', chapter: 'A1', kind: 'opening', durationS: 15,
  world: { source: 'mission', scenario: 'a1' }, camera: [kf(0), kf(10)], cues: [],
  handoff: { player: 'held' }, ...over,
})

describe('scene schema', () => {
  it('accepts a well-formed scene and defaults the easing', () => {
    expect(parseScene(scene()).camera[0]!.ease).toBe('inOut')
  })
  it('rejects malformed scenes', () => {
    expect(() => parseScene(scene({ camera: [] }))).toThrow()
    expect(() => parseScene(scene({ extra: 1 }))).toThrow()
    expect(() => parseScene(scene({ world: { source: 'fresh' } }))).toThrow()
    expect(() => parseScene(scene({ camera: [{ ...kf(0), rollDeg: 5 }] }))).toThrow()
    expect(() => parseScene(scene({ camera: [kf(0), kf(20)] }))).toThrow(/durationS/)
  })
  it('requires keyframes and cues sorted by t', () => {
    expect(() => parseScene(scene({ camera: [kf(5), kf(1)] }))).toThrow(/sorted/)
    const cue = (t: number) => ({ t, order: { kind: 'message', text: 'x' } })
    expect(() => parseScene(scene({ cues: [cue(5), cue(1)] }))).toThrow(/sorted/)
  })
  it('rejects unknown order kinds', () => {
    expect(() => parseScene(scene({ cues: [{ t: 1, order: { kind: 'explode' } }] }))).toThrow()
  })
})

describe('markSceneSeen', () => {
  it('is idempotent, bumps revision once, and touches nothing else', () => {
    const c = fresh()
    const a = accept({ ok: true, value: markSceneSeen(c, 'A1-opening') })
    expect(a.revision).toBe(c.revision + 1)
    expect(a.scenesSeen).toEqual(['A1-opening'])
    expect(markSceneSeen(a, 'A1-opening')).toBe(a)
    expect({ ...a, revision: c.revision, scenesSeen: [] }).toEqual(c)
    expect(a.schemaVersion).toBe(2)
    expect(validateCampaign(a).ok).toBe(true)
  })
})
