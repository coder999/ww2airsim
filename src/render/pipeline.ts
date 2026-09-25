import { ACESFilmicToneMapping, AgXToneMapping, NoToneMapping, type Camera, type Scene, type ToneMapping } from 'three'
import { RenderPipeline, type Node, type PassNode, type WebGPURenderer } from 'three/webgpu'
import { convertToTexture, luminance, max, mix, pass, uniform, vec3, vec4 } from 'three/tsl'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import type { ToneMapName } from './exposure.js'

/**
 * The frame as a render pipeline (photoreal render pass, spec §4.1). The
 * scene renders into `scenePass`'s own target (color + depth); later phases
 * put the cloud pass, tonemapping, bloom and anti-aliasing between that
 * target and the canvas via `setOutput`. The shadow-map and radar passes stay
 * separate `renderer.render` calls BEFORE `render()` -- they are inputs, not
 * part of the picture.
 *
 * Why this is pixel-equivalent to the old `renderer.render(scene, camera)`,
 * read from three@0.186.0's runtime (not assumed):
 * - `PassNode.setup` sets the pass target's `samples` to `renderer.samples`
 *   (4 with `antialias: true`, renderer.ts) and its color type to
 *   `renderer.getOutputBufferType()` -- the same half-float MSAA target the
 *   renderer's own frame-buffer path draws into when it has to color-convert.
 * - `PassNode.updateBefore` resizes the target to `getDrawingBufferSize()`
 *   every frame, so a window resize or pixel-ratio change needs no call here.
 * - `RenderPipeline.outputColorTransform` stays `true` (its default), so the
 *   output quad applies `renderOutput(renderer.toneMapping,
 *   renderer.outputColorSpace)` -- the linear-to-sRGB step the direct render
 *   applied -- and `render()` sets NoToneMapping/working space only around
 *   the quad itself so the conversion is not applied twice.
 * - Both the pass (`updateBefore` -> `renderer.render`) and the quad
 *   (`QuadMesh.render` -> `renderer.render`) are ordinary renders, so both
 *   write into the renderer's `'render'` timestamp pool (verified by
 *   experiment, task-2 report, 2026-09-24).
 *
 * Phase A (spec §4.2, Task 5): the frame is HDR up to the output quad. The
 * picture node handed to `setOutput` (the cloud composite, or `sceneColor`
 * with clouds off) is linear, unbounded radiance; `outputChain` adds bloom
 * and the output quad applies `renderer.toneMapping` (AgX by default) at
 * `renderer.toneMappingExposure`, then sRGB. Tonemapping happens exactly
 * once, read from three@0.186.0 (2026-09-25):
 * - `RenderPipeline.render` sets `renderer.toneMapping = NoToneMapping`
 *   around its quad render, and the scene pass (`PassNode.updateBefore`) and
 *   every other node pass render from INSIDE that quad render, so they see
 *   NoToneMapping. Independently, `Renderer.currentToneMapping` returns
 *   NoToneMapping whenever the target is not the canvas (`isOutputTarget`),
 *   so a pass writing its own HalfFloat target is never tonemapped anyway.
 * - `_updateContext` wraps the output node in `renderOutput(outputNode,
 *   this._toneMapping, ...)`, and `_update` rebuilds it when
 *   `renderer.toneMapping` changes -- which is why `setToneMap` needs no
 *   `needsUpdate` of its own. `toneMappingExposure` is a renderer-reference
 *   uniform (`ToneMappingNode.js`), read every frame with no rebuild.
 */
export type FramePipeline = {
  readonly scenePass: PassNode
  readonly sceneColor: Node<'vec4'>
  readonly sceneDepth: Node<'float'>
  setOutput(node: Node<'vec4'>): void
  /** `renderer.toneMappingExposure`, a linear multiplier before the curve. */
  setExposure(value: number): void
  setToneMap(name: ToneMapName): void
  render(): void
  dispose(): void
}

const TONE_MAPPINGS: Readonly<Record<ToneMapName, ToneMapping>> = {
  agx: AgXToneMapping, aces: ACESFilmicToneMapping, none: NoToneMapping,
}

/** Bloom, spec §4.2: threshold above diffuse white so only the sun disc, the
 *  sea glint and the brightest cloud rims contribute; strength subtle.
 *  `threshold` is linear HDR luminance BEFORE exposure (the high pass reads
 *  the composite, not the tonemapped output). Tuned by eye, Task 5 report. */
export const BLOOM_STRENGTH = 0.15
export const BLOOM_RADIUS = 0.4
export const BLOOM_THRESHOLD = 1.2

/**
 * A look for AgX, applied to the linear picture just before the curve. Base
 * AgX desaturates on purpose (its "path to white"), and on this scene's
 * palette-lit sky that turned the 17.3 h sunset beige and the noon sky grey
 * (Task 5 captures, 2026-09-25). Blender ships the same curve with a
 * "Punchy" look (saturation 1.4 in its CDL) for exactly this; this is the
 * linear-space equivalent: `mix(luma, rgb, s)`, floored at zero. Only under
 * AgX -- `?toneMap=none|aces` see the picture unaltered, so a comparison
 * capture measures the curve alone.
 */
export const AGX_LOOK_SATURATION = 1.4

type OutputChain = { readonly node: Node<'vec4'>; dispose(): void }

/**
 * The HDR chain from the picture to the output quad. `picture` becomes a
 * texture first: the cloud composite reads `screenCoordinate`, which is only
 * right in a full-resolution pass, and bloom's high pass runs at half
 * resolution -- so the composite renders once into a full-size HalfFloat
 * target (`convertToTexture` is a no-op for `sceneColor`, already a texture)
 * and both bloom and the output quad sample that.
 *
 * `resolved` is the anti-aliasing seam: Task 6 inserts TRAA here, between
 * the texture and bloom, so bloom and the output both read the resolved
 * frame.
 */
function outputChain(picture: Node<'vec4'>, saturation: Node<'float'>): OutputChain {
  const color = convertToTexture(picture) as unknown as Node<'vec4'>
  const resolved = color
  const glow = bloom(resolved, BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD)
  const hdr = resolved.rgb.add(glow.rgb)
  const looked = max(mix(vec3(luminance(hdr)), hdr, saturation), vec3(0))
  const node = vec4(looked, resolved.a) as unknown as Node<'vec4'>
  return {
    node,
    dispose() {
      glow.dispose()
      if (color !== picture) color.dispose()
    },
  }
}

export function createFramePipeline(renderer: WebGPURenderer, scene: Scene, camera: Camera): FramePipeline {
  const scenePass = pass(scene, camera) as unknown as PassNode
  const sceneColor = scenePass.getTextureNode('output') as unknown as Node<'vec4'>
  const sceneDepth = scenePass.getTextureNode('depth') as unknown as Node<'float'>
  // Production is always AgX; `setToneMap` exists for DEV `?toneMap=`.
  renderer.toneMapping = TONE_MAPPINGS.agx
  const saturation = uniform(AGX_LOOK_SATURATION)
  let chain = outputChain(sceneColor, saturation)
  const pipeline = new RenderPipeline(renderer, chain.node)
  return {
    scenePass, sceneColor, sceneDepth,
    setOutput(node) {
      chain.dispose()
      chain = outputChain(node, saturation)
      pipeline.outputNode = chain.node
      pipeline.needsUpdate = true
    },
    setExposure(value) { renderer.toneMappingExposure = value },
    setToneMap(name) {
      renderer.toneMapping = TONE_MAPPINGS[name]
      saturation.value = name === 'agx' ? AGX_LOOK_SATURATION : 1
    },
    render() { pipeline.render() },
    dispose() { pipeline.dispose(); chain.dispose(); scenePass.dispose() },
  }
}
