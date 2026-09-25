import type { Camera, Scene } from 'three'
import { RenderPipeline, type Node, type PassNode, type WebGPURenderer } from 'three/webgpu'
import { pass } from 'three/tsl'

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
 */
export type FramePipeline = {
  readonly scenePass: PassNode
  readonly sceneColor: Node<'vec4'>
  readonly sceneDepth: Node<'float'>
  setOutput(node: Node<'vec4'>): void
  render(): void
  dispose(): void
}

export function createFramePipeline(renderer: WebGPURenderer, scene: Scene, camera: Camera): FramePipeline {
  const scenePass = pass(scene, camera) as unknown as PassNode
  const sceneColor = scenePass.getTextureNode('output') as unknown as Node<'vec4'>
  const sceneDepth = scenePass.getTextureNode('depth') as unknown as Node<'float'>
  const pipeline = new RenderPipeline(renderer, sceneColor)
  return {
    scenePass, sceneColor, sceneDepth,
    setOutput(node) { pipeline.outputNode = node; pipeline.needsUpdate = true },
    render() { pipeline.render() },
    dispose() { pipeline.dispose(); scenePass.dispose() },
  }
}
