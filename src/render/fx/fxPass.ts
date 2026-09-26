import {
  DynamicDrawUsage, HalfFloatType, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, NearestFilter, PlaneGeometry,
  RGBAFormat, RedFormat, RenderTarget, Scene, Vector2, type PerspectiveCamera,
} from 'three'
import { NodeUpdateType, RendererUtils, TempNode, type Node, type NodeBuilder, type NodeFrame, type TextureNode, type WebGPURenderer } from 'three/webgpu'
import { Fn, If, abs, clamp, float, floor, fract, ivec2, max, min, perspectiveDepthToViewZ, reference, screenCoordinate, select, texture, uniform, vec2, vec4 } from 'three/tsl'
import type { Vec3 } from '../../sim/math/vec3.js'
import { FOG_DISTANCE_M } from '../horizon.js'
import type { CloudShadowHandle } from '../scene/cloudShadow.js'
import { createFxMaterials, createFxUniforms, type FxUniforms } from './material.js'
import { CLOSENESS_SCALE_M, DENSE_ACCUMULATED_ALPHA } from './shading.js'
import type { FxSheetTextures } from './sheets.js'
import { createInstanceArrays, type FxInstanceArrays } from './system.js'
import { FX_MAX_CAPACITY, type FxTier } from './tiers.js'

/**
 * The effects pass (ordnance-and-effects design §4.1), in cloudPass.ts's
 * TempNode shape. `updateBefore` draws the particle batch twice into
 * reduced-resolution targets -- premultiplied color, then max-blended dense
 * depth (plan E1 Ruling R9) -- reading the scene pass's depth for the soft
 * fade. `setup` returns the depth-aware composite over the scene color,
 * which main.ts hands the cloud pass as ITS scene color: effects composite
 * before clouds (§4.2), and the clouds' march stops at dense fx via
 * `cloudLimit`. With no live particle nothing renders and the composite
 * skips its taps (Ruling R12).
 */
export function fxSpan(scale: number): number {
  const span = 1 / scale
  if (Math.abs(span - Math.round(span)) > 1e-9) throw new Error(`fx resolution scale ${scale} must be 1/n`)
  return Math.round(span)
}
export function fxTargetSize(width: number, height: number, scale: number): { width: number; height: number } {
  return { width: Math.max(1, Math.ceil(width * scale)), height: Math.max(1, Math.ceil(height * scale)) }
}

export type FxCloudLimit = { denseViewZAt(fullPixel: Node<'vec2'>): Node<'float'> }
export type FxPass = {
  readonly composite: Node<'vec4'>
  readonly cloudLimit: FxCloudLimit | null
  /** The system writes these (`FxSystem.writeInstances`); `setCount` uploads them. */
  readonly instances: FxInstanceArrays
  setTier(tier: FxTier): void
  /** `scene.position` this frame (minus the eye): the fx scene mirrors it (Ruling R10). */
  setWorldOffset(offset: Vec3): void
  setCount(count: number): void
  count(): number
  dispose(): void
}

/** cloudPass.ts's composite weight constant, the same rule (Ruling R11). */
const DEPTH_EPSILON = 0.01
let rendererState: ReturnType<typeof RendererUtils.resetRendererState> | undefined
const drawingBuffer = new Vector2()
const clampTexel = (at: Node<'ivec2'>, hi: Node<'ivec2'>): Node<'ivec2'> =>
  (clamp as unknown as (x: Node<'ivec2'>, lo: Node<'ivec2'>, hi: Node<'ivec2'>) => Node<'ivec2'>)(at, ivec2(0, 0), hi)
const target = (format: typeof RGBAFormat | typeof RedFormat): RenderTarget => {
  const t = new RenderTarget(1, 1, { type: HalfFloatType, format, depthBuffer: false })
  t.texture.minFilter = NearestFilter; t.texture.magFilter = NearestFilter
  return t
}

class FxPassNode extends TempNode<'vec4'> {
  readonly color = target(RGBAFormat)
  readonly dense = target(RedFormat)
  readonly scene = new Scene()
  readonly denseScene = new Scene()
  readonly geometry = new InstancedBufferGeometry()
  readonly instances = createInstanceArrays(FX_MAX_CAPACITY)
  readonly u: FxUniforms = createFxUniforms()
  readonly active = uniform(0)
  readonly lowMax = uniform(new Vector2(0, 0))
  readonly colorTex = texture(this.color.texture) as unknown as TextureNode
  readonly denseTex = texture(this.dense.texture) as unknown as TextureNode
  private readonly attributes: InstancedBufferAttribute[]
  private readonly materials: ReturnType<typeof createFxMaterials>
  scale = 0.5
  live = 0

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly sceneColor: Node<'vec4'>,
    private readonly sceneDepth: TextureNode,
    private readonly near: Node<'float'>,
    private readonly far: Node<'float'>,
    sheets: FxSheetTextures, shadow: CloudShadowHandle | null, soft: boolean,
  ) {
    super('vec4')
    this.updateBeforeType = NodeUpdateType.FRAME
    const quad = new PlaneGeometry(2, 2)
    this.geometry.setAttribute('position', quad.getAttribute('position'))
    this.geometry.setIndex(quad.getIndex())
    const { posSize, anim, tint, vel } = this.instances
    this.attributes = ([['fxPosSize', posSize], ['fxAnim', anim], ['fxTint', tint], ['fxVel', vel]] as const).map(([name, array]) => {
      const a = new InstancedBufferAttribute(array, 4)
      a.setUsage(DynamicDrawUsage)
      this.geometry.setAttribute(name, a)
      return a
    })
    this.geometry.instanceCount = 0
    this.materials = createFxMaterials({ sheets, sceneDepth, near, far, u: this.u, soft, shadow })
    for (const [scene, material] of [[this.scene, this.materials.particle], [this.denseScene, this.materials.dense]] as const) {
      const mesh = new Mesh(this.geometry, material)
      // Instances are scattered over kilometres (terrain/mesh.ts's reason, verbatim).
      mesh.frustumCulled = false
      scene.add(mesh)
    }
  }

  setCount(n: number): void {
    this.live = n
    this.geometry.instanceCount = n
    for (const a of this.attributes) { a.clearUpdateRanges(); a.addUpdateRange(0, n * 4); a.needsUpdate = true }
    this.active.value = n > 0 ? 1 : 0
  }

  override updateBefore(frame: NodeFrame): undefined {
    if (this.live === 0) return undefined // Ruling R12
    const renderer = frame.renderer as unknown as WebGPURenderer
    const { x: width, y: height } = renderer.getDrawingBufferSize(drawingBuffer)
    const low = fxTargetSize(width, height, this.scale)
    this.color.setSize(low.width, low.height)
    this.dense.setSize(low.width, low.height)
    this.u.span.value = fxSpan(this.scale)
    this.u.fullMax.value.set(width - 1, height - 1)
    this.lowMax.value.set(low.width - 1, low.height - 1)
    this.u.camRight.value.setFromMatrixColumn(this.camera.matrixWorld, 0).normalize()
    this.u.camUp.value.setFromMatrixColumn(this.camera.matrixWorld, 1).normalize()
    this.u.camBack.value.setFromMatrixColumn(this.camera.matrixWorld, 2).normalize()
    rendererState = RendererUtils.resetRendererState(renderer, rendererState as ReturnType<typeof RendererUtils.resetRendererState>)
    // resetRendererState clears to alpha 1; both targets must start empty.
    renderer.setClearColor(0x000000, 0)
    renderer.setRenderTarget(this.color)
    renderer.render(this.scene, this.camera)
    renderer.setRenderTarget(this.dense)
    renderer.render(this.denseScene, this.camera)
    RendererUtils.restoreRendererState(renderer, rendererState)
    return undefined
  }

  /** Depth-aware upsample (Ruling R11): four bilinear taps, each weighted by
   *  how well the depth its texel was drawn against matches this pixel's. */
  override setup(_builder: NodeBuilder): Node<'vec4'> {
    const composite = Fn(() => {
      const pixel = screenCoordinate.xy
      const fx = vec4(0, 0, 0, 0).toVar()
      If(this.active.greaterThan(0.5), () => {
        const viewZ = (at: Node<'ivec2'>) => min(perspectiveDepthToViewZ(this.sceneDepth.load(at).x, this.near, this.far).negate(), float(FOG_DISTANCE_M))
        const z = viewZ(ivec2(floor(pixel))).toVar()
        const uv = pixel.div(this.u.span).sub(0.5).toVar()
        const f = fract(uv).toVar()
        const i0 = ivec2(floor(uv)).toVar()
        const lowMax = ivec2(this.lowMax).toVar()
        const fullMax = ivec2(this.u.fullMax).toVar()
        const sum = vec4(0, 0, 0, 0).toVar()
        const weights = float(0).toVar()
        for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
          const at = clampTexel(i0.add(ivec2(ox, oy)), lowMax).toVar()
          const rep = clampTexel(ivec2(floor(vec2(at).add(0.5).mul(this.u.span))), fullMax)
          const rel = abs(z.sub(viewZ(rep))).div(max(z, 1e-3))
          const wx = ox === 0 ? float(1).sub(f.x) : f.x
          const wy = oy === 0 ? float(1).sub(f.y) : f.y
          const w = wx.mul(wy).div(rel.add(DEPTH_EPSILON)).toVar()
          sum.addAssign(this.colorTex.load(at).mul(w))
          weights.addAssign(w)
        }
        fx.assign(sum.div(max(weights, 1e-12)))
      })
      return vec4(this.sceneColor.rgb.mul(float(1).sub(fx.a)).add(fx.rgb), this.sceneColor.a)
    })
    return composite() as unknown as Node<'vec4'>
  }

  readonly limit: FxCloudLimit = {
    denseViewZAt: (fullPixel) => {
      const t = clampTexel(ivec2(floor(fullPixel.div(this.u.span))), ivec2(this.lowMax))
      const a = this.colorTex.load(t).a
      const c = this.denseTex.load(t).x
      const dense = this.active.greaterThan(0.5).and(a.greaterThan(DENSE_ACCUMULATED_ALPHA)).and(c.greaterThan(0))
      return select(dense, float(CLOSENESS_SCALE_M).mul(float(1).div(max(c, 1e-6)).sub(1)), float(FOG_DISTANCE_M)) as unknown as Node<'float'>
    },
  }

  override dispose(): void {
    this.color.dispose(); this.dense.dispose(); this.geometry.dispose()
    this.materials.particle.dispose(); this.materials.dense.dispose()
    super.dispose()
  }
}

export function createFxPass(o: {
  camera: PerspectiveCamera; sceneColor: Node<'vec4'>; sceneDepth: Node<'float'>; sheets: FxSheetTextures
  shadow: CloudShadowHandle | null; soft: boolean; cloudLimit: boolean; tier: FxTier
}): FxPass {
  const node = new FxPassNode(
    o.camera, o.sceneColor, o.sceneDepth as unknown as TextureNode,
    reference('near', 'float', o.camera) as unknown as Node<'float'>,
    reference('far', 'float', o.camera) as unknown as Node<'float'>,
    o.sheets, o.shadow, o.soft,
  )
  const pass: FxPass = {
    composite: node as unknown as Node<'vec4'>,
    cloudLimit: o.cloudLimit ? node.limit : null,
    instances: node.instances,
    setTier(tier) {
      node.scale = tier.resolutionScale
      node.u.frameBlend.value = tier.frameBlend ? 1 : 0
      node.u.mipBias.value = tier.topMip ? 0 : 1
    },
    setWorldOffset(offset) {
      node.scene.position.set(offset.x, offset.y, offset.z)
      node.denseScene.position.set(offset.x, offset.y, offset.z)
      node.u.worldOffset.value.set(offset.x, offset.y, offset.z)
    },
    setCount(n) { node.setCount(n) },
    count: () => node.live,
    dispose() { node.dispose() },
  }
  pass.setTier(o.tier)
  return pass
}
