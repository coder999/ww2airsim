import { afterEach, describe, expect, it, vi } from 'vitest'
import { DataArrayTexture } from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import { BLOOM_THRESHOLD } from '../../src/render/pipeline.js'
import {
  CLOSENESS_SCALE_M, decodeCloseness, encodeCloseness, fireRamp, fxTexelPixel, nearFade, sixWayLight, softFade,
} from '../../src/render/fx/shading.js'
import { fallbackFxSheets, loadFxSheets } from '../../src/render/fx/sheets.js'
import { FX_SHEETS, fxSheetManifestSchema } from '../../src/render/fx/sheetManifest.js'

const MAPS = { right: 0.9, left: 0.1, top: 0.7, bottom: 0.2, back: 0.3, front: 0.5 }

describe('fx shading twins (effects design §4.1, §4.3)', () => {
  it('near fade: invisible inside 0.5 m, full by 2 m (spec: "within about 2 m of the eye", Review Focus 5)', () => {
    expect(nearFade(0.4)).toBe(0)
    expect(nearFade(1.25)).toBeCloseTo(0.5, 12)
    expect(nearFade(2.5)).toBe(1)
  })

  it('soft fade: gone behind the surface, full a half-size in front, scale floored at 0.5 m', () => {
    expect(softFade(100, 101, 10)).toBe(0)
    expect(softFade(100, 95, 10)).toBe(1)
    expect(softFade(100, 97.5, 10)).toBeCloseTo(0.5, 12)
    expect(softFade(100, 99.75, 0.1)).toBeCloseTo(0.5, 12)
  })

  it('dense-depth closeness round-trips and orders by distance; 0 means nothing there', () => {
    for (const z of [0.5, 12, 300, 4000, 100_000]) expect(decodeCloseness(encodeCloseness(z)) / z).toBeCloseTo(1, 9)
    expect(encodeCloseness(10)).toBeGreaterThan(encodeCloseness(20)) // MaxEquation keeps the nearest
    expect(decodeCloseness(0)).toBe(Infinity)
    expect(encodeCloseness(CLOSENESS_SCALE_M)).toBe(0.5)
  })

  it('six-way: an axis light reads exactly its map; weights sum to one for any unit direction', () => {
    expect(sixWayLight(MAPS, { x: 1, y: 0, z: 0 })).toBe(MAPS.right)
    expect(sixWayLight(MAPS, { x: 0, y: -1, z: 0 })).toBe(MAPS.bottom)
    expect(sixWayLight(MAPS, { x: 0, y: 0, z: 1 })).toBe(MAPS.front)
    const s = Math.SQRT1_2
    expect(sixWayLight(MAPS, { x: s, y: s, z: 0 })).toBeCloseTo((MAPS.right + MAPS.top) / 2, 12)
    const ones = { right: 1, left: 1, top: 1, bottom: 1, back: 1, front: 1 }
    for (const l of [{ x: 0.36, y: -0.48, z: 0.8 }, { x: -0.6, y: 0, z: -0.8 }]) expect(sixWayLight(ones, l)).toBeCloseTo(1, 12)
  })

  it('fire is emissive HDR above the bloom threshold, and black when cold (spec §4.3)', () => {
    expect(fireRamp(0)).toEqual([0, 0, 0])
    const hot = fireRamp(1)
    expect(Math.max(...hot)).toBeGreaterThan(BLOOM_THRESHOLD)
    expect(hot[0]).toBeGreaterThan(hot[1]); expect(hot[1]).toBeGreaterThan(hot[2]) // orange, not white
  })

  it('an fx texel reads the full-resolution pixel at its block center, clamped', () => {
    expect(fxTexelPixel(0, 2, 2560)).toBe(1)
    expect(fxTexelPixel(3, 4, 2560)).toBe(14)
    expect(fxTexelPixel(1279, 2, 2559)).toBe(2558)
  })
})

describe('fx sheets at runtime', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('the fallback is a valid one-frame atlas: emission only in fireball and flame, transparent borders (Review Focus 2)', () => {
    const s = fallbackFxSheets()
    expect(s.fallback).toBe(true)
    expect(() => fxSheetManifestSchema.parse(s.manifest)).not.toThrow()
    expect(s.lightA).toBeInstanceOf(DataArrayTexture)
    const { cellPx, cols } = s.manifest
    const b = (s.lightB as DataArrayTexture).image.data as Uint8Array
    const a = (s.lightA as DataArrayTexture).image.data as Uint8Array
    const w = cols * cellPx
    const centerOf = (cell: number): number => ((Math.floor(cell / cols) * cellPx + cellPx / 2) * w + (cell % cols) * cellPx + cellPx / 2) * 4
    FX_SHEETS.forEach((name, cell) => {
      const glowing = name === 'fireball' || name === 'flame'
      expect(b[centerOf(cell) + 3]! > 0, name).toBe(glowing)
      expect(a[centerOf(cell) + 3]).toBeGreaterThan(100)
    })
    expect(a[3]).toBe(0)
  })

  it('a failed fetch resolves to the fallback with a warning, never a rejection or console.error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error')
    const s = await loadFxSheets({} as WebGPURenderer)
    expect(s.fallback).toBe(true)
    expect(warn).toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })
})

describe('fx materials build', () => {
  it('the particle material blends premultiplied over; the dense one takes the max', async () => {
    const { createFxMaterials, createFxUniforms } = await import('../../src/render/fx/material.js')
    const { CustomBlending, MaxEquation, OneFactor, OneMinusSrcAlphaFactor, DepthTexture } = await import('three')
    const { texture, uniform } = await import('three/tsl')
    const { particle, dense } = createFxMaterials({
      sheets: fallbackFxSheets(), sceneDepth: texture(new DepthTexture(4, 4)) as never,
      near: uniform(0.1) as never, far: uniform(440_000) as never, u: createFxUniforms(), soft: true, shadow: null,
    })
    expect([particle.blending, particle.blendSrc, particle.blendDst]).toEqual([CustomBlending, OneFactor, OneMinusSrcAlphaFactor])
    expect([dense.blending, dense.blendEquation, dense.blendSrc, dense.blendDst]).toEqual([CustomBlending, MaxEquation, OneFactor, OneFactor])
    for (const m of [particle, dense]) { expect(m.depthTest).toBe(false); expect(m.depthWrite).toBe(false); expect(m.transparent).toBe(true) }
  })
})
