import { describe, expect, it } from 'vitest'
import { ACESFilmicToneMapping, AgXToneMapping, NoToneMapping, PerspectiveCamera, Scene } from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import { createFramePipeline } from '../../src/render/pipeline.js'

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
})
