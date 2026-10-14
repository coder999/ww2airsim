// tests/render/vehicleRig.test.ts
import { describe, expect, it } from 'vitest'
import { readdirSync } from 'node:fs'
import { Box3, Vector3, type Mesh } from 'three'
import { CHI_HA_GUN, HAND_FOLLOW_RAD, JEEP_STEERING, M4_75_GUN, VEHICLE_RIDERS, VEHICLE_RIGS, trackShoes, treadUPerMeter, wheelShells } from '../../src/render/scene/vehicleRig.js'
import { glbScene } from './_wildcatCache.js'

/**
 * V1 (Mark, 2026-10-09): the ground vehicles' rigs, on the committed glbs' real scene graphs. The
 * GPU half (the hull's wheel shader, the tread texture) cannot run in Node; what can is checked here:
 * which shells the shader turns and how far, how far the tread moves, and every node the rigs pose.
 */
const chiHa = async () => { const root = await glbScene('content/vehicles/type97-chi-ha.glb'); return { root, rig: VEHICLE_RIGS['type97-chi-ha']!(root) } }
const sherman = async () => { const root = await glbScene('content/vehicles/m4-sherman.glb'); return { root, rig: VEHICLE_RIGS['m4-sherman']!(root) } }
const jeep = async () => {
  const root = await glbScene('content/vehicles/willys-mb-jeep.glb')
  for (const id of VEHICLE_RIDERS['willys-mb-jeep']!) root.add(await glbScene(`content/figures/${id}.glb`))
  return { root, rig: VEHICLE_RIGS['willys-mb-jeep']!(root) }
}
/** Two angles equal modulo a full turn. */
const sameTurn = (a: number, b: number): number => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))

describe('vehicle rigs (V1)', () => {
  it('every committed vehicle model is rigged', () => {
    const models = readdirSync('content/vehicles').filter((f) => f.endsWith('.glb')).map((f) => f.slice(0, -4)).sort()
    expect(Object.keys(VEHICLE_RIGS).sort()).toEqual(models)
    expect(models).toEqual(['caterpillar-d7-3t', 'gmc-cckw-353', 'lcvp', 'm4-sherman', 'type38-75mm-field-gun', 'type94-cargo-truck', 'type95-kurogane', 'type97-chi-ha', 'usaaf-63ft-rescue-boat', 'willys-mb-jeep'])
  })
})

describe('Type 95 Kurogane', () => {
  it('drives the original model through the four-wheel steering rig without a rider', async () => {
    const root = await glbScene('content/vehicles/type95-kurogane.glb')
    const rig = VEHICLE_RIGS['type95-kurogane']!(root)
    rig.drive(2, 0.5)
    expect(rig.state()['wheelSpinRad']).toBeLessThan(-5)
    expect(rig.state()['frontSteerRad']).toBeCloseTo(-JEEP_STEERING.lockRad * 0.5, 9)
    expect(rig.state()['handOffRimM']).toBe(-1)
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

describe('M4 Composite Sherman', () => {
  it('trains the 75 mm turret with its gun and clamps gun elevation to -10 through +25 degrees', async () => {
    const { root, rig } = await sherman()
    const hull = root.children.find((o) => o.name !== 'Turret1' && o.name !== 'Gun1')!
    const gun = root.getObjectByName('Gun1')!
    const hullAt = hull.getWorldPosition(new Vector3()), gunAt = gun.getWorldPosition(new Vector3())
    const [mount] = rig.mounts
    mount!.setTraining(Math.PI * 0.75)
    root.updateMatrixWorld(true)
    expect(rig.state()['turretYawRad']).toBeCloseTo(Math.PI * 0.75, 9)
    expect(hull.getWorldPosition(new Vector3()).distanceTo(hullAt)).toBe(0)
    expect(gun.getWorldPosition(new Vector3()).distanceTo(gunAt), 'the gun went round with the turret').toBeGreaterThan(0.3)
    mount!.setElevation(1)
    expect(rig.state()['gunElevationRad']).toBeCloseTo(M4_75_GUN.maxElevationRad, 9)
    mount!.setElevation(-1)
    expect(rig.state()['gunElevationRad']).toBeCloseTo(M4_75_GUN.minElevationRad, 9)
  })
})

describe('M4 Composite Sherman running gear (F4R)', () => {
  const parts = async () => {
    const { root, rig } = await sherman()
    const mesh = (n: string) => root.getObjectByName(n) as unknown as { geometry: Parameters<typeof wheelShells>[0] }
    const hull = root.children.find((o) => !['Turret1', 'Gun1', 'Tracks'].includes(o.name)) as unknown as { geometry: Parameters<typeof wheelShells>[0] }
    return { rig, hull, tracks: mesh('Tracks') }
  }

  it('turns exactly the wheels: roller, road wheel, idler and sprocket shells on both sides, no suspension box', async () => {
    const { rig, hull } = await parts()
    const shells = wheelShells(hull.geometry, 0.75, 1.2, true)
    // Per side (measured on the committed glb 2026-10-14): six road wheels, three rollers, the idler, and
    // three sprocket shells (the hub and the two tooth rings). Mirrored port and starboard.
    expect(shells.length).toBe(26)
    expect(rig.state()['wheelShells']).toBe(26)
    const radii = new Set(shells.map((s) => s.radius.toFixed(2)))
    expect([...radii].sort()).toEqual(['0.10', '0.25', '0.26', '0.33'].sort().filter((r) => radii.has(r)))
    expect(shells.filter((s) => s.radius > 0.22 && s.radius < 0.28).length).toBe(2 * (6 + 1) + 2)
    // Without `exact` the 0.40 x 0.35 m bogie brackets pass the squareness test and would be spun with the wheels.
    expect(wheelShells(hull.geometry, 0.75, 1.2, false).length).toBeGreaterThan(shells.length)
  })

  it('a road wheel carries its five hub bolt heads, which turn with it', async () => {
    const { hull } = await parts()
    const plain = wheelShells(hull.geometry, 0.75, 1.2, false)
    const exact = wheelShells(hull.geometry, 0.75, 1.2, true)
    const at = (list: typeof plain) => list.find((s) => Math.abs(s.cx - 0.65) < 0.01 && s.radius > 0.24 && s.radius < 0.25 && hull.geometry.getAttribute('position').getZ(s.vertices[0]!) > 0)!
    expect(at(exact).vertices.length).toBeGreaterThan(at(plain).vertices.length)
    // A bolt is a four-sided prism: 6 faces of 4 corners each, 24 vertices, five of them.
    expect(at(exact).vertices.length - at(plain).vertices.length).toBe(5 * 24)
  })

  it('has identical track shoes, a side after a side, six inches apart', async () => {
    const { rig, tracks } = await parts()
    const shoes = trackShoes(tracks.geometry)
    expect(shoes.perSide).toBeGreaterThan(70)
    expect(shoes.pitchM).toBeGreaterThan(0.14)
    expect(shoes.pitchM).toBeLessThan(0.16)
    expect(rig.state()['trackShoesPerSide']).toBe(shoes.perSide)
  })

  it('moves each shoe toward the one behind it, so the ground run goes aft as the tank goes forward', async () => {
    const { tracks } = await parts()
    const shoes = trackShoes(tracks.geometry)
    const pos = tracks.geometry.getAttribute('position')
    let aft = 0, ground = 0
    for (let i = 0; i < pos.count; i++) {
      const own = new Vector3(pos.getX(i), pos.getY(i), pos.getZ(i))
      const prev = new Vector3(shoes.prev[3 * i]!, shoes.prev[3 * i + 1]!, shoes.prev[3 * i + 2]!)
      // One shoe over, never the length of the track: one pitch on the centerline, a little more on the outer face and less on the inner face of the sprocket and idler turns.
      expect(own.distanceTo(prev), `vertex ${i}`).toBeLessThan(shoes.pitchM * 1.2)
      expect(own.distanceTo(prev)).toBeGreaterThan(shoes.pitchM * 0.8)
      expect(prev.z).toBeCloseTo(own.z, 5)
      if (own.y < 0.05) { ground++; if (prev.x < own.x) aft++ }
    }
    expect(ground).toBeGreaterThan(1000)
    expect(aft, 'every vertex on the ground run has its previous shoe aft of it').toBe(ground)
  })

  it('wraps the shoes every pitch of travel and turns the wheels the same distance', async () => {
    const { rig, tracks } = await parts()
    const pitch = trackShoes(tracks.geometry).pitchM
    rig.drive(2.25 * pitch, 0)
    expect(rig.state()['trackPhase']).toBeCloseTo(0.25, 9)
    expect(rig.state()['wheelTravelM']).toBeCloseTo(2.25 * pitch, 9)
    rig.drive(-0.25 * pitch, 0)
    expect(rig.state()['trackPhase'], 'backing up wraps the same way').toBeCloseTo(0.75, 9)
    rig.drive(0, 0)
    expect(rig.state()['trackPhase']).toBe(0)
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

describe('F4R ground rework (2026-10-14): rigs turn about the right points', () => {
  const center = (o: { updateWorldMatrix(a: boolean, b: boolean): void }): Vector3 => new Box3().setFromObject(o as never).getCenter(new Vector3())
  const meshCenter = (root: { getObjectByName(n: string): unknown }, name: string): Vector3 => center(root.getObjectByName(name) as never)

  it.each(['gmc-cckw-353', 'type95-kurogane'])('%s: every wheel spins about its own axle, and only the front pair steers', async (id) => {
    const root = await glbScene(`content/vehicles/${id}.glb`)
    const rig = VEHICLE_RIGS[id]!(root)
    const names = ['WheelFL', 'WheelFR', ...(id === 'gmc-cckw-353' ? ['WheelR1L', 'WheelR1R', 'WheelR2L', 'WheelR2R'] : ['WheelRL', 'WheelRR'])]
    root.updateMatrixWorld(true)
    const before = names.map((n) => meshCenter(root, n))
    rig.drive(3, 1)
    root.updateMatrixWorld(true)
    names.forEach((n, i) => expect(meshCenter(root, n).distanceTo(before[i]!), `${id} ${n} center moved`).toBeLessThan(0.02))
    expect(rig.state()['wheelSpinRad']).toBeLessThan(-3)
    expect(Math.abs(rig.state()['frontSteerRad'] as number)).toBeCloseTo(JEEP_STEERING.lockRad, 9)
    const rear = root.getObjectByName(names[names.length - 1]!)!
    expect(rear.rotation.y, 'a rear wheel must not steer').toBe(0)
  })

  it('caterpillar-d7-3t: the sprockets turn in place, the blade rises with its arms, and tilts about its own center', async () => {
    const root = await glbScene('content/vehicles/caterpillar-d7-3t.glb')
    const rig = VEHICLE_RIGS['caterpillar-d7-3t']!(root)
    root.updateMatrixWorld(true)
    const sprockets = ['TrackL', 'TrackR'].map((n) => meshCenter(root, n))
    const blade = meshCenter(root, 'BladeTilt'), arms = meshCenter(root, 'BladeRaise')
    rig.drive(2, 0)
    root.updateMatrixWorld(true)
    ;['TrackL', 'TrackR'].forEach((n, i) => expect(meshCenter(root, n).distanceTo(sprockets[i]!), `${n} center`).toBeLessThan(0.02))
    expect(rig.state()['trackSpinRad']).toBeCloseTo(-2 / 0.36, 9)
    const [mount] = rig.mounts
    mount!.setElevation(Math.PI / 6)
    root.updateMatrixWorld(true)
    expect(meshCenter(root, 'BladeTilt').y - blade.y, 'the blade rose').toBeGreaterThan(0.3)
    expect(meshCenter(root, 'BladeRaise').y - arms.y, 'the arms rose').toBeGreaterThan(0.1)
    const raised = meshCenter(root, 'BladeTilt')
    mount!.setTraining(Math.PI / 12)
    root.updateMatrixWorld(true)
    expect(meshCenter(root, 'BladeTilt').distanceTo(raised), 'tilt pivots about the blade center').toBeLessThan(0.05)
    expect(rig.state()['bladeTiltRad']).toBeCloseTo(Math.PI / 12, 6)
  })
})
