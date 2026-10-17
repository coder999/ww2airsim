import { afterEach, describe, expect, it, vi } from 'vitest'
import { float, vec2 } from 'three/tsl'

// Forest canopy rework, Task 4 (2026-10-16): the relief material's wiring, not its pixels (a GPU spec owns those).
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules() })

async function load(search: string) {
  vi.resetModules()
  vi.stubEnv('DEV', true)
  vi.stubGlobal('location', { search })
  const fetched: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string) => { fetched.push(url); return new Response(new Uint8Array(16)) }))
  const canopy = await import('../../src/render/terrain/canopy.js')
  return { canopy, fetched }
}

/** `float(1)` is a constant node; a texture-driven shadow is not. */
const isConst = (n: unknown): boolean => !!(n as { node?: { isConstNode?: boolean } }).node?.isConstNode

describe('canopy relief', () => {
  it('reads the height texture only under forestCanopy=relief, and the flat material has no crown shadow', async () => {
    const flat = await load('?forestCanopy=current')
    const a = flat.canopy.canopyNodes(vec2(0, 0), vec2(0.5, 0.5))
    expect(isConst(a.shadow)).toBe(true)
    expect(flat.fetched.filter(u => u.includes('height.bin.gz'))).toEqual([])
    const relief = await load('?forestCanopy=relief')
    const b = relief.canopy.canopyNodes(vec2(0, 0), vec2(0.5, 0.5))
    expect(isConst(b.shadow)).toBe(false)
    expect(relief.fetched.some(u => u.includes('height.bin.gz'))).toBe(true)
    expect(relief.fetched.some(u => u.includes('material.bin.gz'))).toBe(true)
  })

  it('stays flat and reports the error when the height texture is the wrong size', async () => {
    const { canopy } = await load('?forestCanopy=relief')
    canopy.canopyNodes(float(0).xx as never, float(0).xx as never)
    await vi.waitFor(() => expect(canopy.forestCanopyStatus().reliefError).toContain('Invalid canopy height size'))
    expect(canopy.forestCanopyStatus()).toMatchObject({ mode: 'relief', reliefReady: false })
  })
})
