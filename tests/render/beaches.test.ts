import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { createBeaches, loadBeaches, shoreEffectSample, shoreFxFromQuery, shoreTimeFromQuery } from '../../src/render/scene/beaches.js'

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
    beaches.update(123, -456, 8.5)
    expect(beaches.stats()).toEqual({
      meshes: 3,
      triangles: 36,
      roles: { ShoreSand: 2, ShoreSurf: 1 },
      eyeX: 123,
      eyeZ: -456,
      timeS: 8.5,
      animated: true,
    })
    beaches.dispose()
    beaches.dispose()
  })

  it('moves two breaker crests shoreward and keeps foam out of deep water', () => {
    const atStart = Array.from({ length: 101 }, (_, i) => ({ v: i / 100, ...shoreEffectSample(0.17, i / 100, 0) }))
    const later = Array.from({ length: 101 }, (_, i) => ({ v: i / 100, ...shoreEffectSample(0.17, i / 100, 0.25) }))
    const inshoreCrest = (samples: typeof atStart) => samples.filter(sample => sample.v < 0.3).reduce((a, b) => b.foam > a.foam ? b : a)
    expect(inshoreCrest(later).v).toBeLessThan(inshoreCrest(atStart).v)
    expect(atStart.filter(s => s.foam > 0.1).length).toBeGreaterThan(2)
    expect(shoreEffectSample(0.17, 1, 0).foam).toBe(0)
  })

  it('validates the DEV shoreline switch', () => {
    expect(shoreFxFromQuery('')).toBeUndefined()
    expect(shoreFxFromQuery('?shoreFx=off')).toBe('off')
    expect(() => shoreFxFromQuery('?shoreFx=maybe')).toThrow(/not on or off/)
    expect(shoreTimeFromQuery('?shoreTime=1.5')).toBe(1.5)
    expect(() => shoreTimeFromQuery('?shoreTime=-1')).toThrow(/non-negative/)
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
