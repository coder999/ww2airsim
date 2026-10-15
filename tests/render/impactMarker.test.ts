import { describe, it, expect } from 'vitest'
import { PerspectiveCamera } from 'three'
import { initialFrameState, nextFrameState, type FrameState } from '../../src/render/frame.js'
import { BINDINGS } from '../../src/input/bindings.js'
import { SIGHT_COLORS, createAnnouncer, createImpactMarker, createImpactPredictor, createTorpedoPredictor, impactLabel, impactMarkerShown, milesOf, torpedoLabel, torpedoVerdict } from '../../src/render/scene/impactMarker.js'
import { createState } from '../../src/sim/flight/state.js'
import { qFromAxisAngle } from '../../src/sim/math/quat.js'
import { playerAircraft } from '../../src/sim/loop.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { projectToScreen } from '../../src/render/sightLabels.js'
import { predictImpact, predictTorpedoDrop, type TorpedoPrediction } from '../../src/sim/weapons/impactPrediction.js'
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
    expect(label).toMatch(/^BOMBSIGHT \d+\.\d MI$/)
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


/** F6B: the torpedosight. Pure text and verdict first, then the marker's look. */
describe('the torpedosight', () => {
  const tbm = loadAircraftSpec('tbm-3-avenger')
  const base: TorpedoPrediction = {
    entry: v3(1000, 0, 0), timeS: 8, valid: true, reasons: [], speedMps: 80, maxSpeedMps: 210.9, heightM: 60, maxHeightM: 730,
    runRangeM: 3660, runDir: v3(1, 0, 0),
  }
  const from = v3(0, 60, 0)
  it('says the verdict in words, imperial, with the entry and the arming distance', () => {
    expect(torpedoLabel(false, base, from)).toBeNull()
    expect(torpedoLabel(true, null, from)).toBe('IMPACT MARKER')
    expect(torpedoLabel(true, base, from)).toBe('TORPEDOSIGHT DROP OK · ENTRY 0.6 MI')
  })
  it('names every reason with the numbers that broke it', () => {
    const bad = { ...base, valid: false, speedMps: 95, maxSpeedMps: 91.7, heightM: 800, maxHeightM: 730, reasons: ['too-fast', 'too-high', 'not-over-sea', 'doors-shut'] as const }
    const t = torpedoLabel(true, bad, from)!
    expect(t).toContain('TORPEDOSIGHT NO DROP: TOO FAST 213 MPH (MAX 205) / TOO HIGH 2625 FT (MAX 2395) / NOT OVER OPEN SEA / BAY DOORS SHUT')
    for (const unit of ['M/S', 'KM', ' KG']) expect(t).not.toContain(unit)
  })
  it('the screen-reader verdict does not change with the miles, only with the reasons, and is spoken at most once a second', () => {
    const v = (p: TorpedoPrediction) => torpedoVerdict(p)
    expect(v({ ...base, entry: v3(5000, 0, 0) })!.key).toBe(v(base)!.key)
    const bad = { ...base, valid: false, reasons: ['too-fast'] as const }
    expect(v(bad)!.text).toBe('Torpedo, no drop: too fast')
    const say = createAnnouncer(1000)
    expect(say(v(base), 0)).toBe('Torpedo drop OK')
    expect(say(v(base), 5000)).toBeNull() // unchanged
    expect(say(v(bad), 5100)).toBe('Torpedo, no drop: too fast')
    expect(say(v({ ...bad, reasons: ['too-high'] }), 5400)).toBeNull() // changed, but inside a second of the last words
    expect(say(v({ ...bad, reasons: ['too-high'] }), 6200)).toBe('Torpedo, no drop: too high')
    expect(say(null, 7000)).toBeNull()
  })
  it('the predictor is never called with the sight off and runs once per sim tick', () => {
    const state = createState({ position: v3(0, 200, 0), velocity: v3(70, 0, 0), bayDoorFraction: 1 })
    const stores = { bombs: 1, rockets: 0 }
    const predict = createTorpedoPredictor()
    expect(predict(false, tbm, state, stores, null, null, [])).toBeNull()
    const a = predict(true, tbm, state, stores, null, null, [])
    expect(a).toEqual(predictTorpedoDrop(tbm, state, stores, null, null))
    expect(predict(true, tbm, state, stores, null, null, [])).toBe(a)
    expect(predict(true, tbm, { ...state }, stores, null, null, [])).not.toBe(a)
  })
  describe('the marker mesh', () => {
    const camera = new PerspectiveCamera(60, 16 / 9, 0.1, 1e5)
    camera.position.set(0, 0, 0); camera.lookAt(0, 0, -1000); camera.updateMatrixWorld()
    const OFF = v3(0, 0, 0)
    const parts = (m: ReturnType<typeof createImpactMarker>) => {
      const marker = m.root.children[0] as unknown as { children: { material?: { color: { getHex(): number } } }[] }
      const ring = marker.children[0]!, cross = (m.root.children[0] as unknown as { children: { visible: boolean }[] }).children[2]!
      return { color: ring.material!.color.getHex(), cross: cross.visible, line: m.root.children[1] as unknown as { visible: boolean; geometry: { getAttribute(n: string): { getX(i: number): number; getZ(i: number): number } } } }
    }
    it('valid is green with no cross; invalid is red WITH a cross (shape and color); a bomb marker is neither', () => {
      const m = createImpactMarker(), at = v3(0, 0, -1000)
      m.update(at, true, camera, OFF, true, { valid: true })
      expect(parts(m)).toMatchObject({ color: SIGHT_COLORS.valid, cross: false })
      m.update(at, true, camera, OFF, true, { valid: false })
      expect(parts(m)).toMatchObject({ color: SIGHT_COLORS.invalid, cross: true })
      m.update(at, true, camera, OFF, true)
      expect(parts(m)).toMatchObject({ color: SIGHT_COLORS.plain, cross: false })
    })
    it('the green and red differ in luminance by at least 3:1 so they stay apart without color vision (WCAG ratio, linear)', () => {
      const lum = (hex: number): number => {
        const c = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 })
        return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!
      }
      const a = lum(SIGHT_COLORS.valid), b = lum(SIGHT_COLORS.invalid)
      expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThan(3)
    })
    it('the run line starts at the entry point and runs along the heading (no arming mark: torpedoes arm on water entry)', () => {
      const m = createImpactMarker(), at = v3(10, 0, -1000)
      m.update(at, true, camera, OFF, true, { valid: true, run: { dir: v3(0, 0, -1), lengthM: 900 } })
      const { line } = parts(m)
      const p = line.geometry.getAttribute('position')
      expect(line.visible).toBe(true)
      expect([p.getX(0), p.getZ(0)]).toEqual([10, -1000])
      expect([p.getX(1), p.getZ(1)]).toEqual([10, -1900])
      expect((p as unknown as { count: number }).count, 'one segment, nothing across it').toBe(2)
      m.update(at, true, camera, OFF, true, { valid: true, run: null })
      expect(parts(m).line.visible).toBe(false)
    })
  })
})

describe('the torpedosight ENTRY label', () => {
  it('projects a world point to CSS pixels (centre of the view is the centre of the screen) and hides what is behind the eye', () => {
    const cam = new PerspectiveCamera(60, 16 / 9, 0.1, 1e5)
    cam.position.set(0, 0, 0); cam.lookAt(0, 0, -1000); cam.updateMatrixWorld()
    const c = projectToScreen(v3(0, 0, -1000), cam, v3(0, 0, 0), 1920, 1080)!
    expect(c.x).toBeCloseTo(960, 3); expect(c.y).toBeCloseTo(540, 3)
    expect(projectToScreen(v3(0, 0, 1000), cam, v3(0, 0, 0), 1920, 1080)).toBeNull()
  })
})
