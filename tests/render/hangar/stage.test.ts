import { describe, expect, it } from 'vitest'
import { AxesHelper, BoxGeometry, Color, DataTexture, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, RepeatWrapping } from 'three'
import { applyChecker, applyDebugViews, applyUnlit, applyWireframe, CHECKER_REPEAT, createGizmos, syncGizmos, type DebugViews } from '../../../src/render/hangar/stage.js'

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

  it('marks a material it changes for update, so WebGPU rebuilds its index buffer; leaves an unchanged one alone', () => {
    // Without needsUpdate the WebGPU renderer draws with a wireframe index it
    // never uploaded: "setIndexBuffer: parameter 1 is not of type GPUBuffer"
    // (reference GPU, 2026-09-26).
    const m = new MeshStandardMaterial()
    const root = new Group(); root.add(new Mesh(new BoxGeometry(), m))
    const v0 = m.version
    applyWireframe(root, true)
    expect(m.version).toBeGreaterThan(v0)
    const v1 = m.version
    applyWireframe(root, true)
    expect(m.version).toBe(v1)
  })
})

describe('applyUnlit (R3: check 5 measures lighting, not paint)', () => {
  it('draws each mesh with its own base color, map and alpha, unlit, and restores the very same materials', () => {
    const map = new DataTexture(new Uint8Array(4), 1, 1)
    const lit = new MeshStandardMaterial({ color: new Color(0.2, 0.4, 0.6), map, transparent: true, opacity: 0.5, side: DoubleSide, alphaTest: 0.1 })
    const other = new MeshStandardMaterial()
    const a = new Mesh(new BoxGeometry(), lit)
    const b = new Mesh(new BoxGeometry(), [other, lit])
    const root = new Group(); root.add(a, b)
    applyUnlit(root, true)
    const u = a.material as unknown as MeshBasicMaterial
    expect(u).toBeInstanceOf(MeshBasicMaterial)
    expect(u.color.toArray()).toEqual(lit.color.toArray())
    expect([u.map, u.transparent, u.opacity, u.side, u.alphaTest]).toEqual([map, true, 0.5, DoubleSide, 0.1])
    expect((b.material as unknown as MeshBasicMaterial[]).map((m) => m.type)).toEqual(['MeshBasicMaterial', 'MeshBasicMaterial'])
    applyUnlit(root, true) // idempotent: a second on must not wrap the unlit stand-ins
    applyUnlit(root, false)
    expect(a.material).toBe(lit)
    expect(b.material).toEqual([other, lit])
    expect((b.material as MeshStandardMaterial[])[1]).toBe(lit)
  })
})

describe('applyChecker (DP0: the UV checker, spec §9)', () => {
  it('swaps each standard material for a clone mapped with one shared checker, and restores the very same materials', () => {
    const lit = new MeshStandardMaterial({ color: new Color(0.2, 0.4, 0.6), map: new DataTexture(new Uint8Array(4), 1, 1) })
    const a = new Mesh(new BoxGeometry(), lit), b = new Mesh(new BoxGeometry(), lit)
    const root = new Group(); root.add(a, b)
    applyChecker(root, true)
    const ca = a.material as MeshStandardMaterial, cb = b.material as MeshStandardMaterial
    expect(ca).not.toBe(lit)
    expect(ca.map).not.toBe(lit.map)
    expect(ca.map).toBe(cb.map) // one checker texture, shared
    expect(ca.color.toArray()).toEqual([1, 1, 1]) // the checker shows unmodulated
    expect(lit.map).not.toBeNull() // the shared original is untouched
    applyChecker(root, true) // idempotent
    applyChecker(root, false)
    expect(a.material).toBe(lit)
    expect(b.material).toBe(lit)
  })
})

describe('applyDebugViews (DP0 Task 11 review: the views toggle in any order)', () => {
  // The stage's setters each flip one flag and call applyDebugViews with all three.
  const bench = () => {
    const lit = new MeshStandardMaterial({ map: new DataTexture(new Uint8Array(4), 1, 1) })
    const mesh = new Mesh(new BoxGeometry(), lit)
    const root = new Group(); root.add(mesh)
    const v: DebugViews = { wireframe: false, checker: false, unlit: false }
    const set = (k: keyof DebugViews, on: boolean): void => { v[k] = on; applyDebugViews(root, v) }
    return { lit, mesh, set }
  }
  const shown = (mesh: Mesh): MeshStandardMaterial | MeshBasicMaterial => mesh.material as MeshStandardMaterial

  it('wireframe on, checker on, wireframe off, checker off: the shared original ends solid', () => {
    const { lit, mesh, set } = bench()
    set('wireframe', true); set('checker', true)
    expect(shown(mesh).wireframe).toBe(true) // the checker clone keeps wireframe
    set('wireframe', false)
    expect([shown(mesh).wireframe, lit.wireframe]).toEqual([false, false])
    set('checker', false)
    expect(mesh.material).toBe(lit)
    expect(lit.wireframe).toBe(false)
  })

  it('checker on, wireframe on, checker off: wireframe survives the checker; then off, the original ends solid', () => {
    const { lit, mesh, set } = bench()
    set('checker', true); set('wireframe', true)
    expect(shown(mesh).wireframe).toBe(true)
    set('checker', false)
    expect(mesh.material).toBe(lit)
    expect(lit.wireframe).toBe(true) // not lost
    set('checker', true)
    expect(shown(mesh).wireframe).toBe(true)
    set('wireframe', false); set('checker', false)
    expect(lit.wireframe).toBe(false)
  })

  it('unlit on, checker on, unlit off, checker off: restores the live original, never disposes it', () => {
    const { lit, mesh, set } = bench()
    let disposed = 0
    lit.addEventListener('dispose', () => { disposed++ })
    set('unlit', true); set('checker', true)
    const u = shown(mesh) as MeshBasicMaterial
    expect(u).toBeInstanceOf(MeshBasicMaterial)
    expect(u.map).not.toBe(lit.map) // unlit over the checker shows the checker
    set('unlit', false)
    expect(shown(mesh)).toBeInstanceOf(MeshStandardMaterial)
    expect(shown(mesh)).not.toBe(lit) // the checker clone, lit
    set('checker', false)
    expect(mesh.material).toBe(lit)
    expect(disposed).toBe(0)
  })

  it('the checker tiles CHECKER_REPEAT times per UV unit, wrapping', () => {
    const { mesh, set } = bench()
    set('checker', true)
    const map = shown(mesh).map!
    expect(map.repeat.toArray()).toEqual([CHECKER_REPEAT, CHECKER_REPEAT])
    expect([map.wrapS, map.wrapT]).toEqual([RepeatWrapping, RepeatWrapping])
    expect(CHECKER_REPEAT).toBeGreaterThanOrEqual(4)
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
