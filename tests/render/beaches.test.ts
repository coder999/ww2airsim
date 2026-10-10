import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { createBeaches, loadBeaches } from '../../src/render/scene/beaches.js'

function fixture(): Group {
  const root = new Group()
  for (const role of ['ShoreSand', 'ShoreSand', 'ShoreSurf']) {
    const material = new MeshBasicMaterial()
    material.name = role
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), material)
    mesh.name = `${role}-tile`
    root.add(mesh)
  }
  return root
}

describe('curved beaches', () => {
  it('shares one runtime material per role, reports real geometry, and follows the eye', () => {
    const source = fixture()
    const beaches = createBeaches(source)
    const meshes = source.children as Mesh[]
    expect(meshes[0]!.material).toBe(meshes[1]!.material)
    expect(meshes[0]!.material).not.toBe(meshes[2]!.material)
    expect(meshes[0]!.material).not.toBe(meshes[2]!.material)
    beaches.update(123, -456)
    expect(beaches.stats()).toEqual({
      meshes: 3,
      triangles: 36,
      roles: { ShoreSand: 2, ShoreSurf: 1 },
      eyeX: 123,
      eyeZ: -456,
    })
    beaches.dispose()
    beaches.dispose()
  })

  it('loads through an injected parser, so Node tests never need GLTFLoader', async () => {
    const parse = vi.fn(async () => fixture())
    const beaches = await loadBeaches('/beaches.glb', parse)
    expect(parse).toHaveBeenCalledWith('/beaches.glb')
    expect(beaches.stats().meshes).toBe(3)
  })

  it('fails loudly when Blender and runtime disagree about a role', () => {
    const root = fixture()
    ;(root.children[0] as Mesh).material = new MeshBasicMaterial({ name: 'SandMaybe' })
    expect(() => createBeaches(root)).toThrow(/unknown material role "SandMaybe"/)
  })
})
