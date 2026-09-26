import { describe, expect, it } from 'vitest'
import { AxesHelper, BoxGeometry, Group, Mesh, MeshStandardMaterial, Object3D } from 'three'
import { applyWireframe, createGizmos, syncGizmos } from '../../../src/render/hangar/stage.js'

describe('applyWireframe', () => {
  it('sets and clears every mesh material, arrays included, because clones share them', () => {
    const shared = new MeshStandardMaterial()
    const a = new Mesh(new BoxGeometry(), shared)
    const b = new Mesh(new BoxGeometry(), [new MeshStandardMaterial(), shared])
    const root = new Group(); root.add(a, b)
    applyWireframe(root, true)
    expect([shared.wireframe, (b.material as MeshStandardMaterial[])[0]!.wireframe]).toEqual([true, true])
    applyWireframe(root, false)
    expect([shared.wireframe, (b.material as MeshStandardMaterial[])[0]!.wireframe]).toEqual([false, false])
  })
})

describe('gizmos', () => {
  it('one axes helper per node, following its world transform', () => {
    const parent = new Group(); parent.position.set(10, 0, 0); parent.scale.setScalar(0.1)
    const node = new Object3D(); node.name = 'Helice'; node.position.set(0, 20, 0)
    parent.add(node)
    const g = createGizmos([node], 2)
    expect(g.children).toHaveLength(1)
    expect(g.children[0]).toBeInstanceOf(AxesHelper)
    expect(g.children[0]!.name).toBe('gizmo Helice')
    syncGizmos(g, [node])
    expect(g.children[0]!.position.toArray()).toEqual([10, 2, 0])
    expect(g.children[0]!.scale.toArray()).toEqual([1, 1, 1])
  })
})
