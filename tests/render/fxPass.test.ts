import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Scene } from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import { createFramePipeline } from '../../src/render/pipeline.js'
import { createFxPass, fxSpan, fxTargetSize } from '../../src/render/fx/fxPass.js'
import { fallbackFxSheets } from '../../src/render/fx/sheets.js'
import { FX_MAX_CAPACITY, FX_TIERS } from '../../src/render/fx/tiers.js'

describe('fxPass (effects design §4.1)', () => {
  it('spans whole pixels per texel at the tier scales, and refuses any other', () => {
    expect(fxSpan(FX_TIERS.high.resolutionScale)).toBe(2)
    expect(fxSpan(FX_TIERS.low.resolutionScale)).toBe(4)
    expect(() => fxSpan(0.3)).toThrow()
  })

  it('sizes its targets by ceiling, never below one texel', () => {
    expect(fxTargetSize(2560, 1440, 0.5)).toEqual({ width: 1280, height: 720 })
    expect(fxTargetSize(2561, 1441, 0.25)).toEqual({ width: 641, height: 361 })
    expect(fxTargetSize(1, 1, 0.25)).toEqual({ width: 1, height: 1 })
  })

  it('builds over a frame pipeline, exposes max-capacity instance arrays, a cloud limit, and a live count', () => {
    const camera = new PerspectiveCamera()
    const p = createFramePipeline({} as WebGPURenderer, new Scene(), camera)
    const make = (cloudLimit: boolean) => createFxPass({ camera, sceneColor: p.sceneColor, sceneDepth: p.sceneDepth, sheets: fallbackFxSheets(), shadow: null, soft: true, cloudLimit, tier: FX_TIERS.high })
    const fx = make(true)
    expect(fx.composite).toBeDefined()
    expect(fx.instances.posSize.length).toBe(FX_MAX_CAPACITY * 4)
    expect(fx.cloudLimit).not.toBeNull()
    expect(make(false).cloudLimit).toBeNull()
    expect(fx.count()).toBe(0)
    fx.setCount(37)
    expect(fx.count()).toBe(37)
    fx.setTier(FX_TIERS.low)
    fx.dispose()
  })
})
