import { ACESFilmicToneMapping, AgXToneMapping, HalfFloatType, NoToneMapping, RGFormat, type Camera, type Scene, type ToneMapping } from 'three'
import { RenderPipeline, type Node, type NodeFrame, type PassNode, type RenderTarget, type TextureNode, type WebGPURenderer } from 'three/webgpu'
import { convertToTexture, luminance, max, mix, mrt, output, pass, uniform, vec3, vec4 } from 'three/tsl'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import TRAANode from 'three/addons/tsl/display/TRAANode.js'
import { smaa } from 'three/addons/tsl/display/SMAANode.js'
import type { Vec3 } from '../sim/math/vec3.js'
import type { ToneMapName } from './exposure.js'
import { MOTION_OUTPUT, advanceVelocity, resetVelocity, sceneVelocity } from './scene/velocity.js'

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
 *   and its color type to `renderer.getOutputBufferType()` -- the same
 *   half-float target the renderer's own frame-buffer path draws into when it
 *   has to color-convert. (It was a 4x MSAA target until Task 6 turned
 *   `antialias` off for TRAA; `samples` is now 0 -- see Phase A below.)
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
 *
 * Anti-aliasing (spec §4.2, Task 6): TRAA replaces MSAA. The scene pass
 * writes a second MRT attachment, `motion` (`MOTION_OUTPUT`: a per-vertex
 * `VelocityNode`, or the world-fixed override on the camera-following sea --
 * scene/velocity.ts has why, and why the output is NOT named `velocity`), and
 * `TRAANode` resolves the picture against its own history between the
 * picture texture and bloom, so bloom and the output both see the resolved
 * frame. TRAA jitters the camera's projection for the length of
 * `RenderPipeline.render` (its `OnBeforeRenderPipeline` / `OnAfterRenderPipeline`
 * hooks, TRAANode.js), so the cloud pass, which renders inside it, marches
 * the same jittered pixels the scene pass drew. SMAA (no history, no jitter)
 * is the spec's fallback and stays selectable with DEV `?aa=smaa`.
 */
export type FramePipeline = {
  readonly scenePass: PassNode
  readonly sceneColor: Node<'vec4'>
  readonly sceneDepth: Node<'float'>
  setOutput(node: Node<'vec4'>): void
  /** `renderer.toneMappingExposure`, a linear multiplier before the curve. */
  setExposure(value: number): void
  setToneMap(name: ToneMapName): void
  setAntiAliasing(mode: AntiAliasingName): void
  /** The eye's world position for the frame about to render (camera-relative
   *  rendering), for the world-fixed motion vectors. Once per rendered frame. */
  setEye(eye: Vec3): void
  /** The next rendered frame resolves without TRAA history and with zero
   *  world-fixed motion: every discontinuity the cloud history resets on. */
  resetHistory(): void
  /** Frames TRAA resolved from a reset history (explicit resets only). */
  historyResets(): number
  render(): void
  dispose(): void
}

export type AntiAliasingName = 'traa' | 'smaa'
export const AA_PARAM = 'aa'
const AA_MODES: readonly AntiAliasingName[] = ['traa', 'smaa']
/** Production anti-aliasing (Task 6 ruling in the task-6 report). */
export const DEFAULT_ANTI_ALIASING: AntiAliasingName = 'traa'

/** DEV `?aa=traa|smaa`. Throws on an unknown name, like `toneMapFromQuery`. */
export function antiAliasingFromQuery(search: string): AntiAliasingName | undefined {
  const raw = new URLSearchParams(search).get(AA_PARAM)
  if (raw === null) return undefined
  if ((AA_MODES as readonly string[]).includes(raw)) return raw as AntiAliasingName
  throw new Error(`${AA_PARAM}: ${JSON.stringify(raw)} is not an anti-aliasing mode (${AA_MODES.join(', ')})`)
}

/**
 * `TRAANode` with a history reset. three@0.186.0's node has none public; it
 * refills its history from the current picture only when the picture's size
 * changes (TRAANode.js `updateBefore`, `needsRestart`). This does the same
 * copy on request, BEFORE the resolve, so the resolve blends the current
 * frame with itself: no trace of the previous view survives the reset frame.
 * The previous-depth texture is left stale on that frame; it only gates the
 * history the copy has just made identical to the current frame.
 */
class ResettableTRAANode extends TRAANode {
  private resetPending = false
  resetHistory(): void { this.resetPending = true }
  override updateBefore(frame: NodeFrame): boolean | undefined {
    if (this.resetPending) {
      this.resetPending = false
      const beauty = this.beautyNode as unknown as { isRTTNode?: boolean; renderTarget?: RenderTarget; passNode?: { renderTarget: RenderTarget } }
      const source = (beauty.isRTTNode ? beauty.renderTarget : beauty.passNode?.renderTarget)?.texture
      // Private in r186 (TRAANode.js constructor), read, not assumed.
      const history = (this as unknown as { _historyRenderTarget: RenderTarget })._historyRenderTarget
      // A size mismatch means the node restarts from the picture by itself.
      if (source !== undefined && history.width === source.width && history.height === source.height) {
        (frame.renderer as WebGPURenderer).copyTextureToTexture(source, history.texture)
      }
    }
    return super.updateBefore(frame)
  }
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

type OutputChain = { readonly node: Node<'vec4'>; readonly traa: ResettableTRAANode | null; dispose(): void }

type AaInputs = { readonly depth: TextureNode; readonly velocity: TextureNode; readonly camera: Camera }

/**
 * The HDR chain from the picture to the output quad. `picture` becomes a
 * texture first: the cloud composite reads `screenCoordinate`, which is only
 * right in a full-resolution pass, and bloom's high pass runs at half
 * resolution -- so the composite renders once into a full-size HalfFloat
 * target (`convertToTexture` is a no-op for `sceneColor`, already a texture)
 * and anti-aliasing reads that.
 *
 * `resolved` is the anti-aliased frame (Task 6): TRAA's resolve target, or
 * SMAA's blend target. Bloom and the output both read it, so bloom sees
 * stable edges rather than the jittered ones.
 */
function outputChain(picture: Node<'vec4'>, saturation: Node<'float'>, mode: AntiAliasingName, inputs: AaInputs): OutputChain {
  const color = convertToTexture(picture) as unknown as TextureNode
  const traa = mode === 'traa' ? new ResettableTRAANode(color, inputs.depth, inputs.velocity, inputs.camera) : null
  const smaaNode = traa === null ? smaa(color) : null
  const resolved = (traa ?? smaaNode!.getTextureNode()) as unknown as Node<'vec4'>
  const glow = bloom(resolved, BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD)
  const hdr = resolved.rgb.add(glow.rgb)
  const looked = max(mix(vec3(luminance(hdr)), hdr, saturation), vec3(0))
  const node = vec4(looked, resolved.a) as unknown as Node<'vec4'>
  return {
    node,
    traa,
    dispose() {
      glow.dispose()
      traa?.dispose()
      smaaNode?.dispose()
      if ((color as unknown as Node<'vec4'>) !== picture) color.dispose()
    },
  }
}

const ORIGIN: Vec3 = { x: 0, y: 0, z: 0 }

export function createFramePipeline(renderer: WebGPURenderer, scene: Scene, camera: Camera): FramePipeline {
  const scenePass = pass(scene, camera) as unknown as PassNode
  // Task 6: motion vectors for TRAA. Written under SMAA too (a DEV
  // comparison only), so switching modes never has to rebuild the pass.
  scenePass.setMRT(mrt({ output, [MOTION_OUTPUT]: sceneVelocity }))
  // Two half floats, not the pass's RGBA16F default: velocity is a vec2 and
  // every scene fragment writes it, so the attachment is half the bandwidth.
  const velocityTexture = scenePass.getTexture(MOTION_OUTPUT)
  velocityTexture.format = RGFormat
  velocityTexture.type = HalfFloatType
  const sceneColor = scenePass.getTextureNode('output') as unknown as Node<'vec4'>
  const sceneDepth = scenePass.getTextureNode('depth') as unknown as Node<'float'>
  const inputs: AaInputs = {
    depth: sceneDepth as unknown as TextureNode,
    velocity: scenePass.getTextureNode(MOTION_OUTPUT) as unknown as TextureNode,
    camera,
  }
  // Production is always AgX; `setToneMap` exists for DEV `?toneMap=`.
  renderer.toneMapping = TONE_MAPPINGS.agx
  const saturation = uniform(AGX_LOOK_SATURATION)
  let picture: Node<'vec4'> = sceneColor
  let mode = DEFAULT_ANTI_ALIASING
  let chain = outputChain(picture, saturation, mode, inputs)
  const pipeline = new RenderPipeline(renderer, chain.node)
  let eye: Vec3 | null = null
  let resets = 0
  const rebuild = (): void => {
    chain.dispose()
    chain = outputChain(picture, saturation, mode, inputs)
    pipeline.outputNode = chain.node
    pipeline.needsUpdate = true
  }
  return {
    scenePass, sceneColor, sceneDepth,
    setOutput(node) {
      picture = node
      rebuild()
    },
    setExposure(value) { renderer.toneMappingExposure = value },
    setToneMap(name) {
      renderer.toneMapping = TONE_MAPPINGS[name]
      saturation.value = name === 'agx' ? AGX_LOOK_SATURATION : 1
    },
    setAntiAliasing(next) {
      if (next === mode) return
      mode = next
      rebuild()
    },
    setEye(next) { eye = next },
    resetHistory() {
      resets++
      chain.traa?.resetHistory()
      resetVelocity()
    },
    historyResets() { return resets },
    render() {
      // Before `pipeline.render`: TRAA jitters the camera inside it.
      advanceVelocity(camera, eye ?? ORIGIN)
      pipeline.render()
    },
    dispose() { pipeline.dispose(); chain.dispose(); scenePass.dispose() },
  }
}
