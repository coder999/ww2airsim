import { describe, it, expect } from 'vitest'
import { InstancedMesh, Scene } from 'three'
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
