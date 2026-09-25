import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Scene } from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import { createFramePipeline } from '../../src/render/pipeline.js'

describe('createFramePipeline', () => {
  it('passes the scene through unchanged by default', () => {
    const p = createFramePipeline({} as WebGPURenderer, new Scene(), new PerspectiveCamera())
    expect(p.scenePass.scene).toBeInstanceOf(Scene)
    expect(p.sceneColor).toBeDefined()
    expect(p.sceneDepth).toBeDefined()
  })
})
