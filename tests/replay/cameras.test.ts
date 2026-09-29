import { describe, it, expect } from 'vitest'
import { initialFrameStateFor, nextFrameState } from '../../src/render/frame.js'
import { createRecorder, type Recording } from '../../src/replay/recorder.js'
import { replayPosesAt } from '../../src/replay/view.js'
import {
  effectiveCamera, initialCameraState, lookAt, orbitFromEye, replayEye, selectCamera, stepCameraState, toggleLock,
} from '../../src/replay/cameras.js'
import { cameraTransformFor } from '../../src/render/camera.js'
import { NO_MOUSE } from '../../src/input/orbit.js'
import { NEUTRAL } from '../../src/input/keyboard.js'
import { LOOK_CENTRE } from '../../src/input/lookAround.js'
import { createWorldOf, playerAircraft, type World } from '../../src/sim/loop.js'
import { createState } from '../../src/sim/flight/state.js'
import { DT } from '../../src/sim/flight/model.js'
import { qRotate } from '../../src/sim/math/quat.js'
import { v3, sub, length, normalize, dot, type Vec3 } from '../../src/sim/math/vec3.js'
import { loadAircraftSpec } from '../../tools/content/load.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const sea = () => 0
const plane = (id: string, p: Vec3) => {
  const s = createState({ position: p, velocity: v3(120, 0, 0) })
  return { id, spec: f6f, state: s, previous: s, controls: NEUTRAL, assistMemory: undefined, impact: null, parked: false }
}
/** 4 s of level flight, player at 2000 m, a second airplane `otherAt` away. */
const record = (otherAt: Vec3 = v3(400, 2000, 300)): Recording => {
  let f = initialFrameStateFor(createWorldOf<undefined>({ aircraft: [plane('player', v3(0, 2000, 0)), plane('z1', otherAt)], player: 'player' }))
  const r = createRecorder()
  for (let i = 0; i < 240; i++) { f = nextFrameState(f, 1 / 60, new Set()); r.push(f.world) }
  return r.snapshot()!
}
const replaceLast = (rec: Recording, last: World<undefined>): Recording => ({ worlds: [...rec.worlds.slice(0, -1), last] })
const withImpact = (w: World<undefined>): World<undefined> => ({
  ...w,
  aircraft: w.aircraft.map((a) => a.id !== w.player ? a : {
    ...a, impact: { tick: w.tick, position: a.state.position, verticalSpeedMps: -30, groundHeightM: 0, surface: 'water' as const, kind: 'ditched' as const },
  }),
})
const withDestroyedBy = (w: World<undefined>, attacker: string): World<undefined> => {
  const mine = w.combat.aircraft[w.player]!
  return { ...w, combat: { ...w.combat, aircraft: { ...w.combat.aircraft, [w.player]: { ...mine, damage: { ...mine.damage, destroyedAt: w.tick, attacker } } } } }
}
const endPose = (rec: Recording) => replayPosesAt(rec, rec.worlds.at(-1)!.tick * DT)

describe('replay cameras (spec §5; plan R-6, R-7, R-10, R-11, R-13)', () => {
  it('orbitFromEye inverts the orbit placement (round trip)', () => {
    const pose = endPose(record())
    for (const o of [{ yawRad: 0.7, pitchRad: 0.3, zoom: 2 }, { yawRad: -2, pitchRad: -0.5, zoom: 0.6 }]) {
      const eye = cameraTransformFor('chase', f6f, pose.render, LOOK_CENTRE, pose.speedMps, o)
      const back = orbitFromEye(eye.position, pose.render, pose.speedMps, f6f)
      expect(back.yawRad).toBeCloseTo(o.yawRad, 6)
      expect(back.pitchRad).toBeCloseTo(o.pitchRad, 6)
      expect(back.zoom).toBeCloseTo(o.zoom, 6)
    }
  })

  it('lookAt points the eye +X at the target', () => {
    for (const to of [v3(100, 0, 0), v3(-30, 40, 80), v3(5, -60, -20)]) {
      const f = qRotate(lookAt(v3(0, 0, 0), to), v3(1, 0, 0))
      expect(dot(f, normalize(to))).toBeCloseTo(1, 9)
    }
  })

  it('auto: impact -> flyby; destroyed by a present attacker -> target; otherwise orbit', () => {
    const rec = record()
    const last = rec.worlds.at(-1)!
    expect(initialCameraState(rec, sea, 'auto').auto).toBe('orbit')
    expect(initialCameraState(replaceLast(rec, withImpact(last)), sea, 'auto').auto).toBe('flyby')
    expect(initialCameraState(replaceLast(rec, withDestroyedBy(last, 'z1')), sea, 'auto').auto).toBe('target')
    // Shot down, then into the sea: the attacker wins (checked first).
    expect(initialCameraState(replaceLast(rec, withImpact(withDestroyedBy(last, 'z1'))), sea, 'auto').auto).toBe('target')
    // A manual replay starts on Orbit with spin on.
    const manual = initialCameraState(rec, sea, 'orbit')
    expect(effectiveCamera(manual)).toBe('orbit')
    expect(manual.spin).toBe(true)
  })

  it('target: the nearest airplane within 3 km, else greyed out, and selecting it is then a no-op (R-6)', () => {
    expect(initialCameraState(record(), sea, 'auto').targetId).toBe('z1')
    const far = record(v3(5000, 2000, 0))
    const s = initialCameraState(far, sea, 'orbit')
    expect(s.targetId).toBeNull()
    const pose = endPose(far)
    expect(selectCamera(s, 'target', replayEye(s, pose, sea), pose)).toBe(s)
  })

  it('flyby is beside the path: the player passes within 40 m of the point (R-11)', () => {
    const rec = replaceLast(record(), withImpact(record().worlds.at(-1)!))
    const s = initialCameraState(rec, sea, 'auto')
    const closest = Math.min(...rec.worlds.map((w) => length(sub(playerAircraft(w).state.position, s.flybyPoint))))
    expect(closest).toBeLessThan(40)
  })

  it('manual starts exactly at the previous eye; W moves it speed x dt; lock looks at the player', () => {
    const rec = record()
    const pose = endPose(rec)
    const s0 = initialCameraState(rec, sea, 'orbit')
    const eye0 = replayEye(s0, pose, sea)
    const s1 = selectCamera(s0, 'manual', eye0, pose)
    const e1 = replayEye(s1, pose, sea)
    expect(length(sub(e1.position, eye0.position))).toBeLessThan(1e-9)
    const s2 = stepCameraState(s1, { mouse: NO_MOUSE, held: new Set(['KeyW']), realDtS: 1 }, e1, pose)
    const moved = sub(replayEye(s2, pose, sea).position, e1.position)
    expect(Math.hypot(moved.x, moved.z)).toBeCloseTo(s1.manual.speedMps, 6)
    const locked = replayEye(toggleLock(s2), pose, sea)
    const f = qRotate(locked.attitude, v3(1, 0, 0))
    expect(dot(f, normalize(sub(pose.render.position, locked.position)))).toBeCloseTo(1, 6)
  })

  it('no camera goes below the surface + 2 m', () => {
    const rec = replaceLast(record(), withImpact(withDestroyedBy(record().worlds.at(-1)!, 'z1')))
    const pose = endPose(rec)
    const floor = () => 1995 // 5 m under the airplane
    const s = initialCameraState(rec, floor, 'auto')
    for (const id of ['flyby', 'target'] as const) {
      expect(replayEye(selectCamera(s, id, replayEye(s, pose, floor), pose), pose, floor).position.y).toBeGreaterThanOrEqual(1997 - 1e-9)
    }
    const m = selectCamera(s, 'manual', replayEye(s, pose, floor), pose)
    const sunk = stepCameraState(m, { mouse: NO_MOUSE, held: new Set(['KeyQ']), realDtS: 10 }, replayEye(m, pose, floor), pose)
    expect(replayEye(sunk, pose, floor).position.y).toBeGreaterThanOrEqual(1997 - 1e-9)
  })

  it('dragging from flyby hands over to orbit from the same eye, when the eye is within zoom range (R-13)', () => {
    const rec = replaceLast(record(), withImpact(record().worlds.at(-1)!))
    const s = initialCameraState(rec, sea, 'auto')
    // The moment the player is nearest the flyby point, so the eye is ~26 m out: inside the orbit's zoom range.
    const near = rec.worlds.reduce((b, w) => length(sub(playerAircraft(w).state.position, s.flybyPoint)) < length(sub(playerAircraft(b).state.position, s.flybyPoint)) ? w : b)
    const pose = replayPosesAt(rec, near.tick * DT)
    const eye = replayEye(s, pose, sea)
    const s2 = stepCameraState(s, { mouse: { ...NO_MOUSE, dxPx: 1e-9 }, held: new Set(), realDtS: 0 }, eye, pose)
    expect(effectiveCamera(s2)).toBe('orbit')
    expect(s2.spin).toBe(false)
    expect(length(sub(replayEye(s2, pose, sea).position, eye.position))).toBeLessThan(1e-3)
  })

  it('spin turns orbit by 12 deg per real second, also while paused (R-7), and a drag stops it', () => {
    const rec = record()
    const pose = endPose(rec)
    const s = initialCameraState(rec, sea, 'orbit')
    const eye = replayEye(s, pose, sea)
    const spun = stepCameraState(s, { mouse: NO_MOUSE, held: new Set(), realDtS: 1 }, eye, pose)
    expect(spun.orbit.yawRad - s.orbit.yawRad).toBeCloseTo((12 * Math.PI) / 180, 9)
    const dragged = stepCameraState(spun, { mouse: { ...NO_MOUSE, dxPx: 10 }, held: new Set(), realDtS: 0 }, eye, pose)
    expect(dragged.spin).toBe(false)
  })
})
