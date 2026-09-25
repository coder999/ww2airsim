import { ACESFilmicToneMapping, AgXToneMapping, HalfFloatType, NoToneMapping, RGFormat, type Camera, type Scene, type ToneMapping } from 'three'
import { RenderPipeline, type Node, type PassNode, type TextureNode, type WebGPURenderer } from 'three/webgpu'
import { Fn, clamp, convertToTexture, float, floor, int, ivec2, luminance, max, min, mix, mrt, output, pass, uniform, uv, vec2, vec3, vec4 } from 'three/tsl'
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
  /** RCAS amount after anti-aliasing, 0..1 (`SHARPEN_AMOUNT`); a uniform. */
  setSharpen(amount: number): void
  /** The eye's world position for the frame about to render (camera-relative
   *  rendering), for the world-fixed motion vectors. Once per rendered frame. */
  setEye(eye: Vec3): void
  /** The next rendered frame resolves without TRAA history (see `Traa`),
   *  and the ocean's world-fixed motion restarts at zero. Other meshes keep
   *  three's per-object previous matrices across the reset -- harmless: the
   *  reset frame blends the current picture with itself whatever the motion
   *  says. Called on every discontinuity the cloud history resets on. */
  resetHistory(): void
  /** `resetHistory` calls since boot. */
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
 * `TRAANode`'s public runtime API that @types/three 0.186 does not declare
 * (both are documented methods in three@0.186.0 TRAANode.js).
 *
 * The history reset uses `setSize(1, 1)`: on the next `updateBefore` the
 * history no longer matches the picture's size, so three's own restart path
 * runs (TRAANode.js `needsRestart`: re-init both targets, copy the current
 * picture into the history) BEFORE the resolve, which then blends the
 * current frame with itself -- no trace of the previous view survives. The
 * same path a window resize takes; no private field is touched.
 */
type Traa = TRAANode & { setSize(width: number, height: number): void; getTextureNode(): TextureNode }

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

/**
 * Contrast-adaptive sharpening after anti-aliasing (Task 6 fix round 1,
 * controller ruling: TRAA's defaults -- 95% history, bilinear history
 * resampling -- visibly softened fine terrain and sub-pixel detail against
 * the MSAA-era captures, and the spec never trades visible quality away).
 *
 * AMD FidelityFX FSR 1's RCAS, as three's SharpenNode.js ports it (5-tap
 * cross; the lobe is limited by local contrast so it cannot ring past the
 * neighborhood's min/max), with two changes:
 * - It runs inline in the output quad rather than as its own pass, so it
 *   costs no extra full-resolution target.
 * - RCAS assumes a [0, 1] signal (its limiter divides by `1 - max`) and this
 *   picture is linear HDR (cloud tops and the sun exceed 1). Each tap is
 *   compressed per channel with `x / (1 + x)`, sharpened, and expanded with
 *   `c / (1 - c)`. Without it the limiter goes to 0/0 on bright pixels.
 *
 * `amount` is FSR's `exp2(-sharpness)`: 0 = off, 1 = RCAS's strongest.
 */
export const SHARPEN_AMOUNT = 0.5
const RCAS_LIMIT = 0.25 - 1 / 16

function rcasSharpen(tex: TextureNode, amount: Node<'float'>): Node<'vec4'> {
  return Fn(() => {
    const size = ivec2(tex.size(int(0)) as unknown as Node<'ivec2'>)
    const hi = size.sub(ivec2(1, 1))
    const at = ivec2(floor(uv().mul(vec2(size)))).toConst()
    const compress = (rgb: Node<'vec3'>): Node<'vec3'> => {
      const c = rgb.max(vec3(0))
      return c.div(c.add(1)).toConst() as unknown as Node<'vec3'>
    }
    const tap = (x: number, y: number): Node<'vec3'> => compress(tex.load(clampTexel(at.add(ivec2(x, y)), hi)).rgb)
    const center = tex.load(at).toConst()
    const e = compress(center.rgb), b = tap(0, -1), d = tap(-1, 0), f = tap(1, 0), h = tap(0, 1)
    const mn4 = min(min(b, d), min(f, h)).toConst()
    const mx4 = max(max(b, d), max(f, h)).toConst()
    const hitMin = min(mn4, e).div(max(mx4, vec3(1e-5)).mul(4)).toConst()
    const hitMax = vec3(1).sub(max(mx4, e)).div(mn4.mul(4).sub(4)).toConst()
    const lobeRGB = max(hitMin.negate(), hitMax).toConst()
    const lobe = max(float(-RCAS_LIMIT), min(max(lobeRGB.x, max(lobeRGB.y, lobeRGB.z)), float(0))).mul(amount).toConst()
    const sharpened = b.add(d).add(f).add(h).mul(lobe).add(e).div(lobe.mul(4).add(1))
    const c = min(sharpened.max(vec3(0)), vec3(0.9999)).toConst()
    return vec4(c.div(vec3(1).sub(c)), center.a)
  })() as unknown as Node<'vec4'>
}

/** Integer texel clamped into [0, hi]; see cloudPass.ts's `clampTexel` for
 *  why the cast (@types/three 0.186's `clamp` admits only float vectors). */
function clampTexel(at: Node<'ivec2'>, hi: Node<'ivec2'>): Node<'ivec2'> {
  return (clamp as unknown as (x: Node<'ivec2'>, lo: Node<'ivec2'>, hi: Node<'ivec2'>) => Node<'ivec2'>)(at, ivec2(0, 0), hi)
}

/** DEV `?sharpen=<0..1>`, for tuning captures. Throws outside [0, 1]. */
export const SHARPEN_PARAM = 'sharpen'
export function sharpenFromQuery(search: string): number | undefined {
  const raw = new URLSearchParams(search).get(SHARPEN_PARAM)
  if (raw === null) return undefined
  const value = Number(raw)
  if (raw.trim() === '' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${SHARPEN_PARAM}: ${JSON.stringify(raw)} is not a number in [0, 1]`)
  }
  return value
}

type OutputChain = { readonly node: Node<'vec4'>; readonly traa: Traa | null; dispose(): void }

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
 * SMAA's blend target. Bloom reads it as is; the output reads it through
 * `rcasSharpen` (Task 6 fix round 1), before exposure and the curve.
 */
function outputChain(
  picture: Node<'vec4'>, saturation: Node<'float'>, sharpenAmount: Node<'float'>, mode: AntiAliasingName, inputs: AaInputs,
): OutputChain {
  const color = convertToTexture(picture) as unknown as TextureNode
  const traa = mode === 'traa' ? new TRAANode(color, inputs.depth, inputs.velocity, inputs.camera) as Traa : null
  const smaaNode = traa === null ? smaa(color) : null
  const resolved = (traa ?? smaaNode!).getTextureNode()
  const glow = bloom(resolved as unknown as Node<'vec4'>, BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD)
  const sharp = rcasSharpen(resolved, sharpenAmount)
  const hdr = sharp.rgb.add(glow.rgb)
  const looked = max(mix(vec3(luminance(hdr)), hdr, saturation), vec3(0))
  const node = vec4(looked, sharp.a) as unknown as Node<'vec4'>
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
  const sharpenAmount = uniform(SHARPEN_AMOUNT)
  let picture: Node<'vec4'> = sceneColor
  let mode = DEFAULT_ANTI_ALIASING
  let chain = outputChain(picture, saturation, sharpenAmount, mode, inputs)
  const pipeline = new RenderPipeline(renderer, chain.node)
  let eye: Vec3 | null = null
  let resets = 0
  const rebuild = (): void => {
    chain.dispose()
    chain = outputChain(picture, saturation, sharpenAmount, mode, inputs)
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
    setSharpen(amount) { sharpenAmount.value = amount },
    setAntiAliasing(next) {
      if (next === mode) return
      mode = next
      rebuild()
    },
    setEye(next) { eye = next },
    resetHistory() {
      resets++
      chain.traa?.setSize(1, 1)
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
