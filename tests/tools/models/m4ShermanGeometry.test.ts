// tests/tools/models/m4ShermanGeometry.test.ts
// The M4 Composite Sherman against the FM 30-40 (1943) Medium Tank M4 three-view, as re-read in
// tools/models/blender/m4-sherman.py (2026-10-11, 98.41 px/m, x = 0 at mid-length, ground y = 0).
// The first pass was boxes: its hull roof stood 1 ft 1 in low with the tracks outside a 6 ft 9 in hull,
// its turret ring sat 1 ft 3 in aft, it ran six evenly spaced road wheels, and its sprocket and idler
// were the same wheel. These checks read the built GLB (no Blender) and fail on that model.
import { describe, expect, it } from 'vitest'
import { Mesh, Raycaster, Vector3, type Group, type Object3D } from 'three'
import { wheelShells, type WheelShell } from '../../../src/render/scene/vehicleRig.js'
import { glbScene } from '../../render/_wildcatCache.js'

/** Drawn stations, meters. */
const ROAD_WHEELS_X = [-1.67, -0.81, -0.235, 0.65, 1.21, 2.09]
const RETURN_ROLLERS_X = [-1.77, -0.32, 1.12]
const SPROCKET = [2.585, 0.73] as const
const IDLER = [-2.625, 0.735] as const

let scene: Promise<Group> | undefined
const model = (): Promise<Group> => (scene ??= glbScene('content/vehicles/m4-sherman.glb').then((r) => { r.updateMatrixWorld(true); return r }))
const meshes = (root: Object3D, keep: (name: string) => boolean): Mesh[] => {
  const out: Mesh[] = []
  root.traverse((o) => { if (o instanceof Mesh && keep(o.name)) out.push(o) })
  return out
}
const moving = (n: string): boolean => n === 'Turret1' || n === 'Gun1'
/** The first surface a ray meets, its y (vertical rays) or null. */
function hitY(targets: Mesh[], from: [number, number, number], down: boolean): number | null {
  const ray = new Raycaster(new Vector3(...from), new Vector3(0, down ? -1 : 1, 0))
  const hit = ray.intersectObjects(targets, false)[0]
  return hit ? hit.point.y : null
}
/** Every round shell of the static running gear, in model space, outboard of the lower hull. */
async function shells(): Promise<(WheelShell & { side: number })[]> {
  const out: (WheelShell & { side: number })[] = []
  for (const m of meshes(await model(), (n) => !moving(n))) {
    const g = m.geometry.clone().applyMatrix4(m.matrixWorld)
    const pos = g.getAttribute('position')
    for (const s of wheelShells(g, 0.8, 1.2)) out.push({ ...s, side: Math.sign(pos.getZ(s.vertices[0]!)) })
  }
  return out
}

describe('M4 Sherman vs the FM 30-40 three-view', () => {
  it('has a flat glacis at 56 degrees from vertical, a 1.98 m roof and an engine deck falling aft', async () => {
    const hull = meshes(await model(), (n) => !moving(n))
    const ys = [1.9, 2.1, 2.3].map((x) => hitY(hull, [x, 5, 0], true)!)
    // The plane (2.37, 1.40)-(1.50, 1.98): 1.713, 1.580, 1.447 m.
    ys.forEach((y, i) => expect(y, `glacis at x ${[1.9, 2.1, 2.3][i]}`).toBeCloseTo(1.98 - ([1.9, 2.1, 2.3][i]! - 1.5) / 1.5, 1))
    const fromVertical = (Math.atan2(0.4, ys[0]! - ys[2]!) * 180) / Math.PI
    expect(fromVertical).toBeGreaterThan(54)
    expect(fromVertical).toBeLessThan(58.5)
    expect(hitY(hull, [1.2, 5, 0], true)!).toBeCloseTo(1.98, 1)
    expect(hitY(hull, [-1.2, 5, 0], true)! - hitY(hull, [-2.6, 5, 0], true)!, 'deck falls aft (FM 30-40: "slopes down gently in rear")').toBeGreaterThan(0.1)
  })

  it('carries full-width sponsons over the tracks, floored at 1.37 m', async () => {
    const hull = meshes(await model(), (n) => !moving(n))
    for (const z of [-1.2, 1.2]) for (const x of [-2.0, 0.3, 1.8]) {
      expect(hitY(hull, [x, 1.2, z], false), `sponson floor over x ${x}, z ${z}`).toBeCloseTo(1.37, 1)
    }
  })

  it('runs three VVSS bogies a side: paired road wheels, trailing return rollers, sprocket front and idler rear', async () => {
    const all = await shells()
    for (const side of [-1, 1]) {
      const mine = all.filter((s) => s.side === side)
      const big = mine.filter((s) => s.radius > 0.22 && s.radius < 0.28)
      const wheels = big.filter((s) => s.cx > -2.4).sort((a, b) => a.cx - b.cx)
      expect(wheels.map((s) => s.cx), `road wheels, side ${side}`).toHaveLength(ROAD_WHEELS_X.length)
      wheels.forEach((s, i) => {
        expect(Math.abs(s.cx - ROAD_WHEELS_X[i]!), `road wheel ${i} x ${s.cx.toFixed(3)}`).toBeLessThan(0.03)
        expect(s.cy).toBeCloseTo(0.305, 1)
        expect(s.radius).toBeCloseTo(0.245, 1)
      })
      const rollers = mine.filter((s) => s.radius > 0.08 && s.radius < 0.12).sort((a, b) => a.cx - b.cx)
      expect(rollers, `return rollers, side ${side}`).toHaveLength(RETURN_ROLLERS_X.length)
      rollers.forEach((s, i) => expect(Math.abs(s.cx - RETURN_ROLLERS_X[i]!), `roller ${i} x ${s.cx.toFixed(3)}`).toBeLessThan(0.03))
      const sprocket = mine.filter((s) => s.radius > 0.31 && s.radius < 0.36)
      expect(sprocket.length, `sprocket rings, side ${side}`).toBeGreaterThan(0)
      for (const s of sprocket) {
        expect(Math.abs(s.cx - SPROCKET[0]), 'the sprocket is at the front').toBeLessThan(0.03)
        expect(Math.abs(s.cy - SPROCKET[1])).toBeLessThan(0.03)
      }
      const idler = big.filter((s) => s.cx < -2.4)
      expect(idler, `idler, side ${side}`).toHaveLength(1)
      expect(Math.abs(idler[0]!.cx - IDLER[0])).toBeLessThan(0.03)
      expect(Math.abs(idler[0]!.cy - IDLER[1])).toBeLessThan(0.03)
    }
  })

  it('centers the turret ring at mid-length under a 2.73 m roof, the gun axis 2.31 m up and the muzzle at 2.68 m', async () => {
    const root = await model()
    const turret = root.getObjectByName('Turret1')!
    expect(Math.abs(turret.getWorldPosition(new Vector3()).x), 'turret ring center x (top view: x = 0)').toBeLessThan(0.03)
    expect(hitY(meshes(root, (n) => n === 'Turret1'), [0.2, 5, 0], true)!).toBeCloseTo(2.73, 1)
    const gun = meshes(root, (n) => n === 'Gun1')[0]!
    const g = gun.geometry.clone().applyMatrix4(gun.matrixWorld)
    const pos = g.getAttribute('position')
    let maxX = -Infinity, y0 = Infinity, y1 = -Infinity
    for (let i = 0; i < pos.count; i++) maxX = Math.max(maxX, pos.getX(i))
    for (let i = 0; i < pos.count; i++) if (pos.getX(i) > maxX - 0.05) { y0 = Math.min(y0, pos.getY(i)); y1 = Math.max(y1, pos.getY(i)) }
    expect(Math.abs(maxX - 2.683), `muzzle x ${maxX.toFixed(3)}`).toBeLessThan(0.03)
    expect(Math.abs((y0 + y1) / 2 - 2.31), 'gun axis at the muzzle').toBeLessThan(0.02)
  })
})
