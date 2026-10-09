// tests/render/vehicleRig.test.ts
import { describe, expect, it } from 'vitest'
import { readdirSync } from 'node:fs'
import { Box3, Vector3, type Mesh } from 'three'
import { CHI_HA_GUN, HAND_FOLLOW_RAD, JEEP_STEERING, VEHICLE_RIDERS, VEHICLE_RIGS, treadUPerMeter, wheelShells } from '../../src/render/scene/vehicleRig.js'
import { glbScene } from './_wildcatCache.js'

/**
 * V1 (Mark, 2026-10-09): the ground vehicles' rigs, on the committed glbs' real scene graphs. The
 * GPU half (the hull's wheel shader, the tread texture) cannot run in Node; what can is checked here:
 * which shells the shader turns and how far, how far the tread moves, and every node the rigs pose.
 */
const chiHa = async () => { const root = await glbScene('content/vehicles/type97-chi-ha.glb'); return { root, rig: VEHICLE_RIGS['type97-chi-ha']!(root) } }
const jeep = async () => {
  const root = await glbScene('content/vehicles/willys-mb-jeep.glb')
  for (const id of VEHICLE_RIDERS['willys-mb-jeep']!) root.add(await glbScene(`content/figures/${id}.glb`))
  return { root, rig: VEHICLE_RIGS['willys-mb-jeep']!(root) }
}
/** Two angles equal modulo a full turn. */
const sameTurn = (a: number, b: number): number => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))

describe('vehicle rigs (V1)', () => {
  it('every rigged vehicle is a committed vehicle model, and both are rigged', () => {
    const models = readdirSync('content/vehicles').filter((f) => f.endsWith('.glb')).map((f) => f.slice(0, -4)).sort()
    expect(Object.keys(VEHICLE_RIGS).sort()).toEqual(models)
    expect(models).toEqual(['type97-chi-ha', 'willys-mb-jeep'])
  })
})

describe('Type 97 Chi-Ha', () => {
  it('finds the running gear: the same round shells on each side, wheel-sized, below the hull top', async () => {
    const { root } = await chiHa()
    const hull = root.getObjectByName('Object_4') as unknown as { geometry: Parameters<typeof wheelShells>[0] }
    const shells = wheelShells(hull.geometry, 0.6, 1.25)
    // Twelve road wheels a side (six stations, doubled), plus sprocket, idler and return-roller shells
    // and their hubs, mirrored port and starboard (measured on the committed glb 2026-10-09).
    expect(shells.length).toBe(72)
    const port = shells.filter((s) => s.vertices.length > 0 && hull.geometry.getAttribute('position').getZ(s.vertices[0]!) < 0)
    expect(port.length * 2).toBe(shells.length)
    for (const s of shells) {
      expect(s.radius, `shell at x ${s.cx.toFixed(2)}`).toBeGreaterThan(0.035)
      expect(s.radius).toBeLessThan(0.35)
    }
  })

  it('the tread moves one meter of texture per meter driven, and the wheels the same distance', async () => {
    const { root, rig } = await chiHa()
    const track = root.getObjectByName('Object_10') as unknown as { geometry: Parameters<typeof treadUPerMeter>[0] }
    rig.drive(2, 0)
    const s = rig.state()
    expect(s['wheelTravelM']).toBe(2)
    expect(s['treadOffsetU']).toBeCloseTo(0, 12) // the Node scene has no texture to scroll
    expect(treadUPerMeter(track.geometry)).toBeGreaterThan(0)
  })

  it('the turret trains with its gun on it, the hull stays, and the gun elevates only within -15 to +20 degrees', async () => {
    const { root, rig } = await chiHa()
    const hull = root.getObjectByName('Object_4')!, gun = root.getObjectByName('Gun1')!
    const hullAt = hull.getWorldPosition(new Vector3()), gunAt = gun.getWorldPosition(new Vector3())
    const [mount] = rig.mounts
    mount!.setTraining(Math.PI / 2)
    root.updateMatrixWorld(true)
    expect(rig.state()['turretYawRad']).toBeCloseTo(Math.PI / 2, 9)
    expect(hull.getWorldPosition(new Vector3()).distanceTo(hullAt)).toBe(0)
    expect(gun.getWorldPosition(new Vector3()).distanceTo(gunAt), 'the gun went round with the turret').toBeGreaterThan(0.3)
    mount!.setElevation(1)
    expect(rig.state()['gunElevationRad']).toBeCloseTo(CHI_HA_GUN.maxElevationRad, 9)
    mount!.setElevation(-1)
    expect(rig.state()['gunElevationRad']).toBeCloseTo(CHI_HA_GUN.minElevationRad, 9)
  })
})

describe('Willys MB jeep and its driver', () => {
  it('full right lock turns the front wheels and the steering wheel by the gear ratio; the rear wheels only roll', async () => {
    const { root, rig } = await jeep()
    rig.drive(1, 1)
    const s = rig.state()
    expect(s['frontSteerRad']).toBeCloseTo(-JEEP_STEERING.lockRad, 9)
    expect(sameTurn(s['steeringWheelRad']!, -JEEP_STEERING.lockRad * JEEP_STEERING.ratio)).toBeLessThan(1e-6)
    expect(root.getObjectByName('WheelRL')!.rotation.y).toBe(0)
    // One meter rolls a 0.35 m wheel about 2.9 rad.
    expect(s['wheelSpinRad']).toBeLessThan(-2.5)
    expect(s['wheelSpinRad']).toBeGreaterThan(-3.2)
  })

  it("at rest the driver's gloved hands are on the jeep's own rim, and he sits on its seat", async () => {
    const { root } = await jeep()
    root.updateMatrixWorld(true)
    const wheel = root.getObjectByName('SteeringWheel')!
    const pivot = wheel.getWorldPosition(new Vector3())
    const axis = new Vector3().fromArray(wheel.userData['pivotAxis'] as number[])
    const rimBox = new Box3().setFromObject(wheel)
    const rimRadius = (rimBox.max.z - rimBox.min.z) / 2
    for (const name of ['ArmL', 'ArmR']) {
      const arm = root.getObjectByName(name) as Mesh
      const p = arm.geometry.getAttribute('position'), v = new Vector3(), grip = new Vector3()
      for (let i = 0; i < p.count; i++) if (v.fromBufferAttribute(p, i).length() > grip.length()) grip.copy(v)
      grip.applyMatrix4(arm.matrixWorld)
      const off = grip.clone().sub(pivot)
      const inPlane = off.clone().sub(axis.clone().multiplyScalar(off.dot(axis)))
      expect(Math.abs(inPlane.length() - rimRadius), `${name}: grip from the rim's circle`).toBeLessThan(0.03)
    }
    // The figure's lowest point on the body is the boots, near the floor; the seat cushion carries the pelvis.
    const driver = new Box3().setFromObject(root.getObjectByName('Driver')!)
    expect(driver.min.y).toBeGreaterThan(0.3)
  })

  it("the driver's hands stay on the rim while they follow it, and his arms move", async () => {
    const { root, rig } = await jeep()
    const arm = root.getObjectByName('ArmL')!
    const rest = arm.quaternion.clone()
    expect(rig.state()['handOffRimM']).toBeGreaterThanOrEqual(0) // the driver is there
    const steer = (0.9 * HAND_FOLLOW_RAD) / (JEEP_STEERING.lockRad * JEEP_STEERING.ratio)
    for (const s of [steer, -steer]) {
      rig.drive(0, s)
      expect(arm.quaternion.angleTo(rest), `steer ${s}`).toBeGreaterThan(0.05)
      // A swing about the shoulder, not a reach: measured 2026-10-09, 3.9 cm (left turn) and 3.0 cm (right) at 90% of the follow.
      expect(rig.state()['handOffRimM'], `steer ${s}`).toBeLessThan(0.04)
    }
  })
})
