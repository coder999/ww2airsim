import { describe, it, expect } from 'vitest'
import { BoxGeometry, InstancedMesh, MeshStandardMaterial, PerspectiveCamera, Scene } from 'three'
import {
  BOMB_CAPACITY, ROCKET_CAPACITY, ROCKET_BURN_S,
  createOrdnance, ordnanceInstances, flameInstances,
} from '../../src/render/ordnance.js'
import type { Projectile } from '../../src/sim/weapons/combat.js'
import { v3 } from '../../src/sim/math/vec3.js'

/** A minimal, otherwise-unused `Projectile`, one field overridden at a time. */
function projectile(overrides: Partial<Projectile>): Projectile {
  return {
    owner: 'f6f-1', id: 1, position: v3(0, 0, 0), previous: v3(0, 0, 0),
    velocity: v3(100, 0, 0), lifeS: 10, tracer: false, kind: 'bomb', ageS: 0,
    ...overrides,
  }
}

describe('ordnanceInstances / flameInstances (pure half, Plan 6b Task 8)', () => {
  it('filters by kind and is capacity-bounded, like tracerInstances', () => {
    const projectiles = [projectile({ kind: 'bomb' }), projectile({ kind: 'rocket' }), projectile({ kind: 'round' })]
    expect(ordnanceInstances(projectiles, 'bomb', 8)).toHaveLength(1)
    expect(ordnanceInstances(projectiles, 'rocket', 8)).toHaveLength(1)
    const many = Array.from({ length: 5 }, () => projectile({ kind: 'bomb' }))
    expect(ordnanceInstances(many, 'bomb', 3)).toHaveLength(3)
  })

  it('flameInstances keeps only rockets still burning (ageS < ROCKET_BURN_S)', () => {
    const projectiles = [
      projectile({ kind: 'rocket', ageS: 0 }),
      projectile({ kind: 'rocket', ageS: ROCKET_BURN_S - 0.01 }),
      projectile({ kind: 'rocket', ageS: ROCKET_BURN_S }),
      projectile({ kind: 'rocket', ageS: 5 }),
      projectile({ kind: 'bomb', ageS: 0 }),
    ]
    expect(flameInstances(projectiles, 32)).toHaveLength(2)
  })
})

describe('createOrdnance (Plan 6b Task 8): pooled bomb/rocket/flame meshes', () => {
  it('adds its pools to the scene, all at zero count and hidden', () => {
    const scene = new Scene()
    const ordnance = createOrdnance(scene)
    expect(scene.children).toContain(ordnance.object)
    const instancedMeshes = ordnance.object.children.filter((c) => c instanceof InstancedMesh) as InstancedMesh[]
    // bomb, rocket, flame
    expect(instancedMeshes).toHaveLength(3)
    for (const m of instancedMeshes) {
      expect(m.count).toBe(0)
      expect(m.visible).toBe(false)
    }
  })

  it('update() positions live bombs/rockets and shows a flame only on a still-burning rocket', () => {
    const scene = new Scene()
    const ordnance = createOrdnance(scene)
    const bomb = projectile({ kind: 'bomb', position: v3(10, 20, 30) })
    const hotRocket = projectile({ kind: 'rocket', ageS: 0.1 })
    const coldRocket = projectile({ kind: 'rocket', ageS: 5 })
    ordnance.update([bomb, hotRocket, coldRocket])
    const [bombMesh, rocketMesh, flameMesh] = ordnance.object.children.filter((c) => c instanceof InstancedMesh) as InstancedMesh[]
    expect(bombMesh!.count).toBe(1)
    expect(bombMesh!.visible).toBe(true)
    expect(rocketMesh!.count).toBe(2)
    expect(flameMesh!.count).toBe(1)
    expect(flameMesh!.visible).toBe(true)
  })

  it('bomb pool never exceeds BOMB_CAPACITY, rocket pool never exceeds ROCKET_CAPACITY', () => {
    const scene = new Scene()
    const ordnance = createOrdnance(scene)
    const bombs = Array.from({ length: BOMB_CAPACITY + 3 }, () => projectile({ kind: 'bomb' }))
    const rockets = Array.from({ length: ROCKET_CAPACITY + 5 }, () => projectile({ kind: 'rocket', ageS: 0 }))
    ordnance.update([...bombs, ...rockets])
    const [bombMesh, rocketMesh] = ordnance.object.children.filter((c) => c instanceof InstancedMesh) as InstancedMesh[]
    expect(bombMesh!.count).toBe(BOMB_CAPACITY)
    expect(rocketMesh!.count).toBe(ROCKET_CAPACITY)
  })
})

describe('createOrdnance store models (O1)', () => {
  const bombAt = (x: number) => ({ id: 1, owner: 'a', kind: 'bomb' as const, position: { x, y: 0, z: -20 }, previous: { x, y: 0, z: -20 }, velocity: { x: 100, y: 0, z: 0 }, lifeS: 10, tracer: false, ageS: 0.5 })

  it('swaps both pools onto the store geometry and material, and frees the primitive geometry it replaced', () => {
    const o = createOrdnance(new Scene())
    const pools = o.object.children.filter((c) => c instanceof InstancedMesh) as InstancedMesh[]
    let freed = 0
    pools[0]!.geometry.addEventListener('dispose', () => { freed++ })
    const bomb = { geometry: new BoxGeometry(1.7, 0.5, 0.5), material: new MeshStandardMaterial() }
    const rocket = { geometry: new BoxGeometry(1.7, 0.13, 0.13), material: new MeshStandardMaterial() }
    o.setStoreModels(bomb, rocket)
    expect(pools[0]!.geometry).toBe(bomb.geometry)
    expect(pools[0]!.material).toBe(bomb.material)
    expect(pools[1]!.geometry).toBe(rocket.geometry)
    expect(freed).toBe(1)
  })

  it('moves the motor flame to the rocket model\'s aft end, on its axis (not riding its back)', () => {
    const o = createOrdnance(new Scene())
    const flame = (o.object.children.filter((c) => c instanceof InstancedMesh) as InstancedMesh[])[2]!
    // A rocket whose origin is its lug tops, like hvar.glb: x -0.7..0.9, y -0.16..-0.03.
    const rocketGeometry = new BoxGeometry(1.6, 0.13, 0.13).translate(0.1, -0.095, 0)
    o.setStoreModels({ geometry: new BoxGeometry(1.7, 0.5, 0.5), material: new MeshStandardMaterial() }, { geometry: rocketGeometry, material: new MeshStandardMaterial() })
    rocketGeometry.computeBoundingBox()
    const r = rocketGeometry.boundingBox!
    flame.geometry.computeBoundingBox()
    const f = flame.geometry.boundingBox!
    expect(f.max.x).toBeLessThanOrEqual(r.min.x + 1e-6)
    expect((f.min.y + f.max.y) / 2).toBeCloseTo((r.min.y + r.max.y) / 2, 6)
    expect((f.min.z + f.max.z) / 2).toBeCloseTo((r.min.z + r.max.z) / 2, 6)
  })

  it('refuses a second swap rather than disposing the model cache\'s assets', () => {
    const o = createOrdnance(new Scene())
    const visual = () => ({ geometry: new BoxGeometry(1, 1, 1), material: new MeshStandardMaterial() })
    o.setStoreModels(visual(), visual())
    expect(() => o.setStoreModels(visual(), visual())).toThrow(/already/)
  })

  it('view(): counts, triangles, and the first bomb projected into the camera', () => {
    const scene = new Scene()
    const o = createOrdnance(scene)
    o.setStoreModels({ geometry: new BoxGeometry(1.7, 0.5, 0.5), material: new MeshStandardMaterial() }, { geometry: new BoxGeometry(1, 1, 1), material: new MeshStandardMaterial() })
    o.update([bombAt(0)] as never)
    scene.updateMatrixWorld(true)
    const camera = new PerspectiveCamera(60, 16 / 9, 0.1, 1000)
    camera.updateMatrixWorld(true)
    const v = o.view(camera, 1440)
    expect(v.bombs).toBe(1)
    expect(v.rockets).toBe(0)
    expect(v.bombTriangles).toBe(12)
    expect(v.bombNdc![0]).toBeCloseTo(0, 6)
    expect(v.bombNdc![1]).toBeCloseTo(0, 6)
    expect(v.bombRadiusPx!).toBeGreaterThan(10)
  })

  it('view() with no bomb aloft reports null position', () => {
    const o = createOrdnance(new Scene())
    expect(o.view(new PerspectiveCamera(), 1440).bombNdc).toBeNull()
  })
})
