import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { staticModelPath } from '../../src/render/content.js'
import { Group, Object3D } from 'three'
import { BUNDLE_MODEL_ID, CANOPY_NODES, MAX_MEN, canopySway, loadParachutistView, type ParachutistView } from '../../src/render/scene/parachutist.js'
import type { ModelInstance } from '../../src/render/models/modelCache.js'
import { DEFAULT_RECOVERY_ENVIRONMENT, type ParachutistEntity } from '../../src/sim/bailout.js'
import { v3 } from '../../src/sim/math/vec3.js'

/** The node names the view needs, read out of the committed glb itself (a rig rename must fail here, not at runtime). */
function glbNodeNames(path: string): string[] {
  const buf = readFileSync(path)
  expect(buf.toString('ascii', 0, 4)).toBe('glTF')
  const jsonLength = buf.readUInt32LE(12)
  expect(buf.toString('ascii', 16, 20)).toBe('JSON')
  const json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLength)) as { nodes: { name?: string }[] }
  return json.nodes.flatMap((n) => (n.name === undefined ? [] : [n.name]))
}

describe('the parachuting-person rig against the view (F7A Task 9)', () => {
  it('has every node the view drives', () => {
    for (const id of ['parachuting-person-rig', BUNDLE_MODEL_ID]) {
      const names = glbNodeNames(staticModelPath('equipment', id))
      for (const node of CANOPY_NODES) expect(names, `${id} ${node}`).toContain(node)
    }
  })
})

describe('canopy sway is view-only, deterministic and bounded (Mark, 2026-10-15)', () => {
  const sway = (tick: number, wind: number, phase: Parameters<typeof canopySway>[3] = 'canopy') => canopySway(tick, wind, 5.5, phase)

  it('is a pure function of its inputs: the same inputs give the same sway, with no random call and no clock', () => {
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Math.random in the sway') })
    const now = vi.spyOn(performance, 'now').mockImplementation(() => { throw new Error('clock in the sway') })
    try {
      expect(sway(1234, 8)).toEqual(sway(1234, 8))
      expect(sway(1234, 8)).not.toEqual(sway(1300, 8))
    } finally { random.mockRestore(); now.mockRestore() }
  })

  it('swings more in more wind, never more than 9 degrees, and keeps swinging in calm air', () => {
    const peak = (wind: number) => Math.max(...Array.from({ length: 600 }, (_, i) => Math.abs(sway(i, wind).rollRad)))
    expect(peak(0)).toBeGreaterThan(0)
    expect(peak(12)).toBeGreaterThan(peak(2))
    expect(peak(60)).toBeLessThanOrEqual((9 * Math.PI) / 180 + 1e-9)
  })

  it('is still while the pilot is packed, clearing the airframe, or on the ground', () => {
    for (const phase of ['separating', 'down', 'dead'] as const) expect(sway(400, 12, phase)).toEqual({ rollRad: 0, pitchRad: 0 })
  })
})

describe('the pooled view (F7B)', () => {
  const fakeAcquire = async (url: string): Promise<ModelInstance> => {
    const root = new Group()
    const nodes = Object.fromEntries(['CanopyOpen', 'CanopyRibs', 'CanopyClosed'].map((n) => [n, new Object3D()]))
    root.name = url
    return { root, node: (name: string) => nodes[name]!, release: () => undefined }
  }
  const entity = (id: string, kind: 'trooper' | 'bundle' | undefined, phase: ParachutistEntity['state']['phase'] = 'canopy'): ParachutistEntity => {
    const state = { tick: 100, position: v3(1, 50, 2), velocity: v3(0, -5, 0), phase, phaseStartedTick: 0, lowAltitude: false, contact: null, outcome: null }
    return { id, sourceAircraft: 'a', side: 'allied', recoverySeed: 1, recoveryEnvironment: DEFAULT_RECOVERY_ENVIRONMENT, recovery: null, state, previous: state, ...(kind === undefined ? {} : { kind }) }
  }
  const drawn = (view: ParachutistView) => (view.root as Group).children.filter((c) => c.visible)

  it('draws exactly the active entities, men and bundles from their own rigs, and hides the rest', async () => {
    const view = await loadParachutistView(fakeAcquire)
    expect(view.root.visible).toBe(false)
    const world = [entity('p', undefined), ...Array.from({ length: 18 }, (_, i) => entity(`t${i}`, 'trooper')), ...Array.from({ length: 6 }, (_, i) => entity(`b${i}`, 'bundle'))]
    view.sync(world, null)
    expect(view.root.visible).toBe(true)
    expect(drawn(view)).toHaveLength(25)
    expect(drawn(view).filter((c) => c.name.includes(BUNDLE_MODEL_ID))).toHaveLength(6)
    view.sync([], null)
    expect(drawn(view)).toHaveLength(0)
    expect(view.root.visible).toBe(false)
  })

  it('leaves a pilot who is down on the water to the rescue view, and still draws one down on land', async () => {
    const view = await loadParachutistView(fakeAcquire)
    const down = (surface: 'water' | 'land'): ParachutistEntity => {
      const e = entity('p', undefined, 'down')
      return { ...e, state: { ...e.state, contact: { tick: 1, position: v3(0, 0, 0), surface, verticalSpeedMps: -5 } } }
    }
    view.sync([down('water')], null)
    expect(drawn(view)).toHaveLength(0)
    view.sync([down('land')], null)
    expect(drawn(view)).toHaveLength(1)
    // a dropped trooper on water is not a pilot jump: he is still drawn
    const trooper = down('water')
    view.sync([{ ...trooper, kind: 'trooper' }], null)
    expect(drawn(view)).toHaveLength(1)
  })

  it('does not draw past the pool and does not throw', async () => {
    const view = await loadParachutistView(fakeAcquire)
    view.sync(Array.from({ length: MAX_MEN + 5 }, (_, i) => entity(`t${i}`, 'trooper')), null)
    expect(drawn(view)).toHaveLength(MAX_MEN)
  })
})
