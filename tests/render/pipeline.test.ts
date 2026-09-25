import { describe, expect, it } from 'vitest'
import { ACESFilmicToneMapping, AgXToneMapping, NoToneMapping, PerspectiveCamera, Scene } from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import { antiAliasingFromQuery, createFramePipeline, DEFAULT_ANTI_ALIASING } from '../../src/render/pipeline.js'

describe('createFramePipeline', () => {
  it('passes the scene through unchanged by default', () => {
    const p = createFramePipeline({} as WebGPURenderer, new Scene(), new PerspectiveCamera())
    expect(p.scenePass.scene).toBeInstanceOf(Scene)
    expect(p.sceneColor).toBeDefined()
    expect(p.sceneDepth).toBeDefined()
  })

  it('tonemaps with AgX by default, and switches the curve and exposure on the renderer', () => {
    const renderer = {} as WebGPURenderer
    const p = createFramePipeline(renderer, new Scene(), new PerspectiveCamera())
    expect(renderer.toneMapping).toBe(AgXToneMapping)
    p.setToneMap('aces')
    expect(renderer.toneMapping).toBe(ACESFilmicToneMapping)
    p.setToneMap('none')
    expect(renderer.toneMapping).toBe(NoToneMapping)
    p.setExposure(2.5)
    expect(renderer.toneMappingExposure).toBe(2.5)
  })

  // `setAntiAliasing('smaa')` is not exercised here: SMAANode builds its
  // lookup textures from an `Image`, which node has no class for. The DEV
  // `?aa=smaa` capture exercises it on the GPU (task-6 report).
  it('counts history resets', () => {
    const p = createFramePipeline({} as WebGPURenderer, new Scene(), new PerspectiveCamera())
    expect(p.historyResets()).toBe(0)
    p.resetHistory()
    p.resetHistory()
    expect(p.historyResets()).toBe(2)
    p.setAntiAliasing('traa') // already TRAA: a no-op, no rebuild
  })
})

describe('antiAliasingFromQuery', () => {
  it('defaults to TRAA in production and parses the DEV override', () => {
    expect(DEFAULT_ANTI_ALIASING).toBe('traa')
    expect(antiAliasingFromQuery('')).toBeUndefined()
    expect(antiAliasingFromQuery('?aa=smaa')).toBe('smaa')
    expect(antiAliasingFromQuery('?x=1&aa=traa')).toBe('traa')
  })
  it('throws on an unknown mode rather than silently showing the default', () => {
    expect(() => antiAliasingFromQuery('?aa=msaa')).toThrow(/aa: "msaa"/)
  })
})
