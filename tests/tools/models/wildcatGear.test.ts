// The drawn Wildcat's lengthened main legs (W1 spec §2, ruling R5, 2026-09-28): at gear down the
// main wheels sit WILDCAT_GEAR_STRETCH_M lower, so the drawing parks at Grumman's 12°20' static
// ground angle, without moving the strut's top. The leg telescopes out over the last quarter of the
// travel only (gearStretchM): a fixed-length stretch was measured that day not to stow (the wheel
// hung 0.2 m below the belly gear-up; W1 Task 3 report), so at every fraction up to 0.75 the gear is
// exactly the model's own and stows as the model does. Measured through loadWildcat on the real glb
// graph (tests/render/_wildcatCache.ts).
import { beforeAll, describe, expect, it } from 'vitest'
import { Group, Matrix4, Mesh, Quaternion, Vector3, type Object3D } from 'three'
import { GEAR_DOWN, GEAR_UP, applyGearFraction, gearStretchM, loadWildcat, wildcatCorrection } from '../../../src/render/scene/wildcat.js'
import { WILDCAT_GEAR_STRETCH_M } from '../../../src/render/scene/wildcatFrame.js'
import { syntheticCache, wildcatGlbScene } from '../../render/_wildcatCache.js'
import type { Airframe } from '../../../src/render/scene/airframe.js'

const SIDES = [
  { group: 'GRP_Rueda_Der', strut: 'polySurface272', wheel: 'polySurface255', down: GEAR_DOWN.der, up: GEAR_UP.der },
  { group: 'GRP_Rueda_Izq', strut: 'polySurface277', wheel: 'polySurface257', down: GEAR_DOWN.izq, up: GEAR_UP.izq },
] as const
const STILL = { roll: 0, pitch: 0, yaw: 0 }

/** Every vertex of `o`'s meshes, in `frame`'s coordinates. */
function points(o: Object3D, frame: Object3D): Vector3[] {
  frame.updateMatrixWorld(true)
  const toFrame = new Matrix4().copy(frame.matrixWorld).invert()
  const out: Vector3[] = []
  o.traverse((m) => {
    if (!(m instanceof Mesh)) return
    const mat = new Matrix4().multiplyMatrices(toFrame, m.matrixWorld)
    const a = m.geometry.getAttribute('position')
    for (let i = 0; i < a.count; i++) out.push(new Vector3().fromBufferAttribute(a, i).applyMatrix4(mat))
  })
  return out
}

let stretched: Airframe
/** The sim body frame of the unstretched reference (its correction group's parent). */
let plain: Object3D
let plainRoot: Object3D

beforeAll(async () => {
  const cache = syntheticCache()
  stretched = await loadWildcat(undefined, (url) => cache.acquire(url))
  // The unstretched reference: the same graph through the same correction, with no stretch.
  plainRoot = await wildcatGlbScene()
  const correction = wildcatCorrection()
  correction.add(plainRoot)
  plain = new Group()
  plain.add(correction)
})

const pose = (a: Airframe, f: number) => a.update({ gearFraction: f, flapFraction: 0, throttle: 0, controls: STILL, frameS: 0, cameraDistanceM: 50 })
const posePlain = (f: number) => { for (const s of SIDES) applyGearFraction(plainRoot.getObjectByName(s.group)!, s.down, s.up, f) }

describe('the lengthened main legs (W1 R5)', () => {
  it('at GEAR_DOWN the leg is vertical in the sim frame, so the stretch is a pure drop', () => {
    pose(stretched, 1)
    stretched.root.updateMatrixWorld(true)
    for (const s of SIDES) {
      const q = stretched.root.getObjectByName(s.strut)!.getWorldQuaternion(new Quaternion())
      const axis = new Vector3(0, 1, 0).applyQuaternion(q).applyQuaternion(stretched.root.getWorldQuaternion(new Quaternion()).invert())
      expect(Math.acos(Math.min(1, axis.y)) * 180 / Math.PI, `${s.strut} off vertical, deg`).toBeLessThanOrEqual(1)
    }
  })

  it('at GEAR_DOWN the main wheels touch at -2.3952 m and the strut tops have not moved', () => {
    pose(stretched, 1)
    posePlain(1)
    for (const s of SIDES) {
      const wheelLow = Math.min(...points(stretched.root.getObjectByName(s.wheel)!, stretched.root).map((p) => p.y))
      expect(Math.abs(wheelLow + 2.3952), `${s.wheel} lowest ${wheelLow.toFixed(4)}`).toBeLessThanOrEqual(0.01)
      const topNow = Math.max(...points(stretched.root.getObjectByName(s.strut)!, stretched.root).map((p) => p.y))
      const topBefore = Math.max(...points(plainRoot.getObjectByName(s.strut)!, plain).map((p) => p.y))
      expect(Math.abs(topNow - topBefore), `${s.strut} top ${topNow.toFixed(4)} vs ${topBefore.toFixed(4)}`).toBeLessThanOrEqual(0.005)
      const wheelBefore = Math.min(...points(plainRoot.getObjectByName(s.wheel)!, plain).map((p) => p.y))
      expect(wheelBefore - wheelLow, `${s.wheel} drop`).toBeCloseTo(WILDCAT_GEAR_STRETCH_M, 3)
    }
  })

  it.each([0, 0.25, 0.5, 0.75])('at gear fraction %s the gear is exactly the model\'s own, so it stows as the model does', (f) => {
    pose(stretched, f)
    posePlain(f)
    for (const s of SIDES) {
      const now = points(stretched.root.getObjectByName(s.group)!, stretched.root)
      const before = points(plainRoot.getObjectByName(s.group)!, plain)
      expect(now.length).toBe(before.length)
      const worst = Math.max(...now.map((p, i) => p.distanceTo(before[i]!)))
      expect(worst, `${s.group} at ${f}: moved ${worst} m from the model's pose`).toBeLessThanOrEqual(1e-6)
    }
  })

  it('the stretch is linear over the last quarter: at 0.875 the wheel is halfway between its 0.75 and 1 heights', () => {
    const low = (f: number, wheel: string) => { pose(stretched, f); return Math.min(...points(stretched.root.getObjectByName(wheel)!, stretched.root).map((p) => p.y)) }
    for (const s of SIDES) {
      const [a, m, b] = [low(0.75, s.wheel), low(0.875, s.wheel), low(1, s.wheel)]
      expect(Math.abs(m - (a + b) / 2), `${s.wheel}: ${a.toFixed(4)}, ${m.toFixed(4)}, ${b.toFixed(4)}`).toBeLessThanOrEqual(0.01)
    }
    expect(gearStretchM(0.875)).toBeCloseTo(WILDCAT_GEAR_STRETCH_M / 2, 12)
    expect(gearStretchM(0.75)).toBe(0)
    expect(gearStretchM(1)).toBe(WILDCAT_GEAR_STRETCH_M)
  })

  it('repeated poses do not accumulate: down, up, down again is the same drawing', () => {
    pose(stretched, 1)
    const first = points(stretched.root.getObjectByName('GRP_Rueda_Der')!, stretched.root)
    for (const f of [0, 0.9, 1, 1, 0.3, 1]) pose(stretched, f)
    const again = points(stretched.root.getObjectByName('GRP_Rueda_Der')!, stretched.root)
    expect(Math.max(...again.map((p, i) => p.distanceTo(first[i]!)))).toBeLessThanOrEqual(1e-9)
  })
})
