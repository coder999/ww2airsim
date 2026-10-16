import { describe, expect, it } from 'vitest'
import { Group, Object3D } from 'three'
import { LAUNCH_MODEL_ID, RAFT_MODEL_ID, RESCUE_VISUAL, loadRescueView, rescueScene } from '../../src/render/scene/rescue.js'
import { staticModelPath } from '../../src/render/content.js'
import type { ModelInstance } from '../../src/render/models/modelCache.js'
import { DEFAULT_RECOVERY_ENVIRONMENT, type ParachutistEntity } from '../../src/sim/bailout.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { existsSync } from 'node:fs'

const here = { x: 1000, z: -2000 }
const dist = (s: ReturnType<typeof rescueScene>) => Math.hypot(s.launch!.x - here.x, s.launch!.z - here.z)
const v = RESCUE_VISUAL
const arriveS = (v.standoffM - v.alongsideM) / v.speedMps
const leaveS = arriveS + v.pickupS

describe('rescueScene is a pure, view-only function of touchdown, seed and time (F7B)', () => {
  it('shows nothing before touchdown and the raft where he landed from the first second', () => {
    expect(rescueScene(here, 7, -1)).toEqual({ raft: null, launch: null })
    expect(rescueScene(here, 7, 0).raft).toEqual(here)
  })

  it('brings the launch in from the standoff, holds it alongside for the pickup, then sends it off and clears', () => {
    expect(dist(rescueScene(here, 7, 0))).toBeCloseTo(v.standoffM, 6)
    expect(dist(rescueScene(here, 7, arriveS / 2))).toBeLessThan(dist(rescueScene(here, 7, 1)))
    expect(dist(rescueScene(here, 7, arriveS + 1))).toBeCloseTo(v.alongsideM, 6)
    expect(rescueScene(here, 7, leaveS - 0.1).raft).not.toBeNull()
    expect(rescueScene(here, 7, leaveS + 0.1).raft).toBeNull() // he is aboard
    expect(dist(rescueScene(here, 7, leaveS + 5))).toBeGreaterThan(v.alongsideM)
    expect(rescueScene(here, 7, leaveS + v.departS + 0.1)).toEqual({ raft: null, launch: null })
  })

  it('points the bow at the raft on the way in, away from it on the way out', () => {
    const s = rescueScene(here, 7, 3)
    const heading = { x: Math.cos(s.launch!.yawRad), z: -Math.sin(s.launch!.yawRad) } // bow is +x, yaw = atan2(-dz, dx)
    const towardRaft = { x: here.x - s.launch!.x, z: here.z - s.launch!.z }
    expect(heading.x * towardRaft.x + heading.z * towardRaft.z).toBeGreaterThan(0)
    const o = rescueScene(here, 7, leaveS + 5)
    const out = { x: Math.cos(o.launch!.yawRad), z: -Math.sin(o.launch!.yawRad) }
    expect(out.x * (o.launch!.x - here.x) + out.z * (o.launch!.z - here.z)).toBeGreaterThan(0)
  })

  it('repeats exactly, and the recorded seed picks the bearing', () => {
    expect(rescueScene(here, 7, 3)).toEqual(rescueScene(here, 7, 3))
    expect(rescueScene(here, 7, 3).launch).not.toEqual(rescueScene(here, 8, 3).launch)
  })
})

describe('the approved assets are on disk', () => {
  it.each([['equipment', RAFT_MODEL_ID], ['vehicle', LAUNCH_MODEL_ID]] as const)('%s %s', (kind, id) => {
    expect(existsSync(staticModelPath(kind, id))).toBe(true)
  })
})

describe('the rescue view', () => {
  const fake = async (url: string): Promise<ModelInstance> => {
    const root = new Group()
    root.name = url
    return { root, node: () => new Object3D(), release: () => undefined }
  }
  const pilot = (surface: 'water' | 'land', outcome: 'rescued' | 'captured' | null): ParachutistEntity => {
    const state = {
      tick: 100, position: v3(1000, 3, -2000), velocity: v3(0, 0, 0), phase: 'down' as const, phaseStartedTick: 100, lowAltitude: false,
      contact: { tick: 100, position: v3(1000, 3, -2000), surface, verticalSpeedMps: -5 }, outcome,
    }
    return { id: 'p', sourceAircraft: 'a', side: 'allied', recoverySeed: 7, recoveryEnvironment: DEFAULT_RECOVERY_ENVIRONMENT, recovery: null, state, previous: state }
  }

  it('draws only for a pilot down on the water with a result; a captured one keeps his raft and gets no launch', async () => {
    const view = await loadRescueView(fake)
    view.sync(pilot('water', 'rescued'), 50)
    expect(view.root.visible).toBe(true)
    view.sync(pilot('water', 'captured'), 50 + 1_000)
    expect(view.root.visible).toBe(true)
    expect(view.root.children.filter((c) => c.visible).map((c) => c.name)).toEqual([expect.stringContaining(RAFT_MODEL_ID)])
    for (const other of [pilot('land', 'rescued'), pilot('land', 'captured'), pilot('water', null), null]) {
      view.sync(other, 50)
      expect(view.root.visible).toBe(false)
    }
  })

  it('plays on its own clock from the first rescued frame, and is gone once the launch has left', async () => {
    const view = await loadRescueView(fake)
    view.sync(pilot('water', 'rescued'), 50)
    view.sync(pilot('water', 'rescued'), 50 + leaveS + v.departS - 1)
    expect(view.root.visible).toBe(true)
    view.sync(pilot('water', 'rescued'), 50 + leaveS + v.departS + 1)
    expect(view.root.visible).toBe(false)
  })
})
