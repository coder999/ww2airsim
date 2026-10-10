import { describe, it, expect } from 'vitest'
import { PerspectiveCamera } from 'three'
import { initialFrameState, nextFrameState, type FrameState } from '../../src/render/frame.js'
import { BINDINGS } from '../../src/input/bindings.js'
import { createImpactMarker, createImpactPredictor, impactLabel, impactMarkerShown, milesOf } from '../../src/render/scene/impactMarker.js'
import { createState } from '../../src/sim/flight/state.js'
import { qFromAxisAngle } from '../../src/sim/math/quat.js'
import { playerAircraft } from '../../src/sim/loop.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { predictImpact } from '../../src/sim/weapons/impactPrediction.js'
import { loadAircraftSpec } from '../../tools/content/load.js'

/** B2, the render and input half. The prediction itself is held to the real sim in
 *  tests/sim/weapons/impactPrediction.test.ts; these pin the Assist's wiring. */
const spec = loadAircraftSpec('f6f-hellcat')
const dive = qFromAxisAngle(v3(0, 0, 1), -0.3)
const start = (): FrameState =>
  initialFrameState(spec, createState({ position: v3(0, 1500, 0), velocity: v3(120, -36, 0), attitude: dive }))
const keys = (...k: string[]) => new Set(k)
const fly = (from: FrameState, seconds: number, held: ReadonlySet<string>): FrameState => {
  let f = from
  for (let i = 0; i < Math.round(seconds * 60); i++) f = nextFrameState(f, 1 / 60, held)
  return f
}
const tap = (from: FrameState, code: string): FrameState => fly(fly(from, 0.2, keys(code)), 0.2, keys())
const U = BINDINGS.toggleImpactMarker[0]

describe('the impact marker Assist toggle', () => {
  it('is off by default, flips on a press, flips once however long the key is held, and flips back', () => {
    const f0 = start()
    expect(f0.impactMarker).toBe(false)
    const held = fly(f0, 2, keys(U))
    expect(held.impactMarker).toBe(true) // 120 frames down, one edge
    expect(tap(fly(held, 0.1, keys()), U).impactMarker).toBe(false) // released, then a fresh edge
  })

  it('never changes the flight: the same inputs fly the same trajectory with the marker on or off', () => {
    const run = (on: boolean) => {
      let f = on ? tap(start(), U) : fly(start(), 0.4, keys())
      f = fly(f, 6, keys('Equal', 'ArrowRight'))
      return JSON.stringify([playerAircraft(f.world).state, f.world.combat.projectiles])
    }
    // Both arms spent 0.4 s before the 6 s; the toggle consumed no sim input of its own.
    expect(run(true)).toBe(run(false))
  })

  it('is in the controls legend and does not collide with another key', () => {
    const all = Object.entries(BINDINGS).flatMap(([name, codes]) => codes.map((c) => [c, name] as const))
    expect(all.filter(([c]) => c === U).map(([, n]) => n)).toEqual(['toggleImpactMarker'])
  })
})

describe('when the marker is drawn', () => {
  const state = playerAircraft(start().world).state
  const hit = predictImpact(spec, state, { bombs: 2, rockets: 6 }, null, null)!

  it('needs the Assist, a live flight, and a prediction', () => {
    expect(impactMarkerShown(true, true, hit)).toBe(true)
    expect(impactMarkerShown(false, true, hit)).toBe(false) // Assist off
    expect(impactMarkerShown(true, false, hit)).toBe(false) // replay, title, debrief, wreck
    expect(impactMarkerShown(true, true, null)).toBe(false) // no store, shut bay, on the ground, no impact in range
  })

  it('the memoized predictor never calls the sim with the Assist off, and not again for the same tick', () => {
    const predict = createImpactPredictor()
    const stores = { bombs: 2, rockets: 6 }
    expect(predict(false, spec, state, stores, null, null, [])).toBeNull()
    const a = predict(true, spec, state, stores, null, null, [])
    expect(a).toEqual(hit)
    expect(predict(true, spec, state, stores, null, null, [])).toBe(a) // same object: not recomputed
    expect(predict(true, spec, { ...state }, stores, null, null, [])).not.toBe(a) // a new tick is
  })

  it('reads in statute miles, the store, and whether it will arm', () => {
    expect(impactLabel(false, hit, state.position)).toBeNull()
    expect(impactLabel(true, null, state.position)).toBe('IMPACT MARKER')
    const label = impactLabel(true, hit, state.position)!
    expect(label).toMatch(/^IMPACT BOMB \d+\.\d MI$/)
    expect(impactLabel(true, { ...hit, kind: 'rocket', armed: false }, state.position)).toMatch(/ROCKET .* MI · UNARMED$/)
    expect(milesOf(1609.344)).toBeCloseTo(1, 12)
  })
})

describe('the marker mesh', () => {
  const camera = new PerspectiveCamera(60, 16 / 9, 0.1, 1e5)
  const OFFSET = v3(0, 0, 0)

  it('is hidden when told not to show, and posed at the point when shown', () => {
    const m = createImpactMarker()
    expect(m.root.visible).toBe(false)
    camera.position.set(0, 0, 0); camera.lookAt(0, 0, -1000); camera.updateMatrixWorld()
    expect(m.update(v3(0, 0, -1000), true, camera, OFFSET, false)).toBe(false)
    expect(m.root.visible).toBe(false)
    expect(m.update(null, true, camera, OFFSET, true)).toBe(false)
    expect(m.update(v3(0, 0, -1000), true, camera, OFFSET, true)).toBe(true)
    expect(m.root.visible).toBe(true)
    expect(m.root.children[0]!.position.z).toBe(-1000)
  })

  it('keeps a constant angular size: twice as far, twice as big', () => {
    const m = createImpactMarker()
    camera.position.set(0, 0, 0); camera.lookAt(0, 0, -1); camera.updateMatrixWorld()
    m.update(v3(0, 0, -1000), true, camera, OFFSET, true)
    const near = m.root.children[0]!.scale.x
    m.update(v3(0, 0, -2000), true, camera, OFFSET, true)
    expect(m.root.children[0]!.scale.x / near).toBeCloseTo(2, 9)
  })
})
