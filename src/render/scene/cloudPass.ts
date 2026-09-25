import { FloatType, HalfFloatType, LinearFilter, NearestFilter, RGBAFormat, RenderTarget, Vector2, type PerspectiveCamera } from 'three'
import {
  NodeMaterial, NodeUpdateType, QuadMesh, RendererUtils, TempNode,
  type Node, type NodeBuilder, type NodeFrame, type TextureNode, type WebGPURenderer,
} from 'three/webgpu'
import {
  Fn, If, Loop, abs, clamp, float, floor, fract, int, ivec2, max, min, mrt, normalize, perspectiveDepthToViewZ,
  reference, screenCoordinate, struct, texture, uniform, vec2, vec4,
} from 'three/tsl'
import { FOG_DISTANCE_M } from '../horizon.js'
import type { CloudsHandle } from './clouds.js'

/**
 * The cloud march as a reduced-resolution full-screen pass (photoreal spec
 * §4.1, Task 3, 2026-09-24). Until now the march was the fragment of a dome
 * drawn last in the scene, once per full-resolution pixel -- 75-85% of the 4K
 * frame. Here it runs once per `resolutionScale`-sized texel into its own
 * target, then a depth-aware upsample composites it over the scene pass.
 *
 * Shape (Ruling P1, recorded in the task-3 report): a `TempNode` in the
 * pattern of three's `GTAONode` (examples/jsm/tsl/display/GTAONode.js). Its
 * `updateBefore` renders the low-resolution quad into a two-attachment (MRT)
 * target; its `setup` returns the composite. Because the composite reads the
 * scene pass's textures, three builds the scene `PassNode` first and adds it
 * to the frame's sequential update list first (Node.build calls
 * `addSequentialNode` after the children), so the scene is rendered before
 * the march reads its depth -- no ordering call in main.ts. Size follows the
 * drawing buffer every frame (as `PassNode.updateBefore` does), so a window
 * resize or a pixel-ratio change needs no call either.
 *
 * Targets, both at `cloudTargetSize(drawing buffer, scale)`:
 * - `cloudColor` (half float, linear filter): rgb premultiplied by alpha, alpha.
 * - `cloudData` (float -- `FOG_DISTANCE_M` is 100 km, past half float's
 *   65504): x = the cloud's transmittance-weighted mean distance in metres
 *   (for Task 4's reprojection), y = the MIN scene view-Z over the
 *   full-resolution texels this texel covers, capped at `FOG_DISTANCE_M` --
 *   the depth the march actually stopped at, which the composite matches
 *   against.
 */
export type CloudPass = {
  /** Full-resolution composite of clouds over `sceneColor`, for `FramePipeline.setOutput`. */
  readonly composite: Node<'vec4'>
  setResolutionScale(scale: number): void
  dispose(): void
}

/** The cloud target's size for a drawing buffer and a per-axis scale. */
export function cloudTargetSize(width: number, height: number, scale: number): { width: number; height: number } {
  return { width: Math.max(1, Math.ceil(width * scale)), height: Math.max(1, Math.ceil(height * scale)) }
}

/** The composite's depth weight is `1 / (DEPTH_EPSILON + relative difference)`;
 *  a tap whose depth matches exactly outweighs one 10% off by 11x. */
const DEPTH_EPSILON = 0.01
/** When NONE of the four bilinear taps is within this relative depth of the
 *  full-resolution pixel, the composite falls back to the best-matching texel
 *  of the surrounding 4x4 (see the composite's doc comment). */
const DEPTH_MISMATCH = 0.1

const MarchOut = struct({ color: 'vec4', data: 'vec4' })

/** Integer texel coordinate clamped into [0, max]. `clamp`'s @types/three
 *  0.186 overloads admit only float vectors; WGSL's `clamp` takes ivec2. */
function clampTexel(at: Node<'ivec2'>, hi: Node<'ivec2'>): Node<'ivec2'> {
  return (clamp as unknown as (x: Node<'ivec2'>, lo: Node<'ivec2'>, hi: Node<'ivec2'>) => Node<'ivec2'>)(at, ivec2(0, 0), hi)
}

let rendererState: ReturnType<typeof RendererUtils.resetRendererState> | undefined
const drawingBuffer = new Vector2()

class CloudPassNode extends TempNode<'vec4'> {
  readonly target: RenderTarget
  private readonly material = new NodeMaterial()
  private readonly quad = new QuadMesh(this.material)
  /** Full-resolution texels per cloud texel, per axis: round(1 / scale). */
  private cells = 2
  private scale = 0.5
  private readonly fullSize = uniform(new Vector2(1, 1))
  private readonly lowSize = uniform(new Vector2(1, 1))
  private readonly cellsF = uniform(2)
  private readonly cellsI = uniform(2, 'int')

  constructor(
    clouds: CloudsHandle,
    camera: PerspectiveCamera,
    private readonly sceneColor: Node<'vec4'>,
    private readonly sceneDepth: TextureNode,
    private readonly near: Node<'float'>,
    private readonly far: Node<'float'>,
  ) {
    super('vec4')
    this.updateBeforeType = NodeUpdateType.FRAME
    this.target = new RenderTarget(1, 1, { count: 2, type: HalfFloatType, format: RGBAFormat, depthBuffer: false })
    const [color, data] = this.target.textures as [RenderTarget['texture'], RenderTarget['texture']]
    color.name = 'cloudColor'
    color.minFilter = color.magFilter = LinearFilter
    data.name = 'cloudData'
    data.type = FloatType
    data.minFilter = data.magFilter = NearestFilter

    // The pass renders with the QuadMesh's own camera, so the scene camera's
    // matrices come in as uniforms holding the camera's live Matrix4 objects
    // (as GTAONode does), never through `cameraProjectionMatrix` & co.
    const projectionInverse = uniform(camera.projectionMatrixInverse)
    const cameraWorld = uniform(camera.matrixWorld)
    const march = Fn(() => {
      // Low-resolution pixel center, and the block of full-resolution
      // texels it covers.
      const low = screenCoordinate.xy
      const cell = floor(low).toVar()
      const origin = ivec2(cell.mul(this.cellsF)).toVar()
      const fullMax = ivec2(this.fullSize).sub(ivec2(1, 1)).toVar()
      // MIN view-Z over the block (spec §4.1: "min-depth downsample so thin
      // foreground geometry is not marched through"). Converted per texel
      // with three's own `perspectiveDepthToViewZ`, which follows
      // `renderer.reversedDepthBuffer` (always on, renderer.ts), so the min
      // is taken in metres and cannot pick the wrong end of a reversed range.
      const minViewZ = float(FOG_DISTANCE_M).toVar()
      Loop({ start: int(0), end: this.cellsI, type: 'int', condition: '<', name: 'by' } as unknown as Node<'int'>, (outer) => {
        const by = (outer as unknown as { readonly by: Node<'int'> }).by
        Loop({ start: int(0), end: this.cellsI, type: 'int', condition: '<', name: 'bx' } as unknown as Node<'int'>, (inner) => {
          const bx = (inner as unknown as { readonly bx: Node<'int'> }).bx
          const texel = clampTexel(origin.add(ivec2(bx, by)), fullMax)
          const depth = this.sceneDepth.load(texel).x
          minViewZ.assign(min(minViewZ, perspectiveDepthToViewZ(depth, this.near, this.far).negate()))
        })
      })
      // The view ray through the block's center. The scene is
      // camera-relative (the camera sits at the origin, main.ts), so the
      // world direction is the view direction rotated by the camera; any
      // NDC depth inside the frustum lies on the same ray.
      const center = cell.add(0.5).mul(this.cellsF)
      const ndc = vec2(center.x.div(this.fullSize.x).mul(2).sub(1), float(1).sub(center.y.div(this.fullSize.y).mul(2)))
      const viewH = projectionInverse.mul(vec4(ndc, 0.5, 1)).toVar()
      const viewDir = normalize(viewH.xyz.div(viewH.w)).toVar()
      const dir = cameraWorld.mul(vec4(viewDir, 0)).xyz
      // Scene depth as a ray length: view-space Z over the ray's cosine to
      // the view axis, capped at the fog distance -- as the dome did.
      const cosView = viewDir.z.negate()
      const sceneT = min(minViewZ.div(max(cosView, 0.001)), float(FOG_DISTANCE_M))
      // Per-pixel start dither: interleaved gradient noise, hides step
      // banding. On the LOW-resolution pixel, so each marched texel differs.
      const dither = fract(float(52.9829189).mul(fract(low.x.mul(0.06711056).add(low.y.mul(0.00583715)))))
      const result = clouds.marchNode(dir, sceneT, dither)
      // ONE node out of the `Fn` (trap 1): a struct, split into the two
      // attachments below.
      return MarchOut(result.color, vec4(result.depthM, minViewZ, 0, 0))
    })()
    this.material.fragmentNode = mrt({ cloudColor: march.get('color'), cloudData: march.get('data') })
    this.material.name = 'CloudMarch'
    this.quad.material = this.material
    this.quad.name = 'CloudMarch'
  }

  setResolutionScale(scale: number): void {
    this.scale = scale
    this.cells = Math.max(1, Math.round(1 / scale))
  }

  override updateBefore(frame: NodeFrame): undefined {
    const renderer = frame.renderer as unknown as WebGPURenderer
    rendererState = RendererUtils.resetRendererState(renderer, rendererState as ReturnType<typeof RendererUtils.resetRendererState>)
    const { x: width, y: height } = renderer.getDrawingBufferSize(drawingBuffer)
    const low = cloudTargetSize(width, height, this.scale)
    this.target.setSize(low.width, low.height)
    this.fullSize.value.set(width, height)
    this.lowSize.value.set(low.width, low.height)
    this.cellsF.value = this.cells
    this.cellsI.value = this.cells
    renderer.setRenderTarget(this.target)
    this.quad.render(renderer)
    RendererUtils.restoreRendererState(renderer, rendererState)
    return undefined
  }

  /**
   * The full-resolution composite: `scene.rgb * (1 - cloud.a) + cloud.rgb`,
   * with `cloud` from a depth-aware upsample of the premultiplied target.
   *
   * The rule, exactly:
   * 1. The four texels around the pixel (bilinear footprint, in cloud-texel
   *    units `u = pixelCenter / cells - 0.5`), clamped to the target.
   * 2. Each weighted by its bilinear weight times
   *    `1 / (DEPTH_EPSILON + |z - zLow| / z)`, where `z` is this pixel's scene
   *    view-Z and `zLow` the min view-Z that texel marched to, both capped at
   *    `FOG_DISTANCE_M` (beyond it the march is the same whatever the depth).
   * 3. If no tap is within `DEPTH_MISMATCH` (10%) relative depth, the pixel
   *    takes the single texel of the surrounding 4x4 whose `zLow` is closest to
   *    `z`, unfiltered.
   *
   * Why (3) is keyed on |difference|, not on "closer than every tap" as the
   * plan's wording has it: with a MIN-depth downsample the texel covering a
   * pixel has `zLow <= z`, and that texel is always one of the four taps, so
   * "the pixel is closer than every tap" cannot happen. The failure that does
   * happen is the reverse -- a background pixel beside a thin foreground
   * silhouette (a wing edge against cloud), whose covering texels all stopped
   * at the silhouette and saw no cloud. Unhandled, that is a clear halo
   * around the airframe; (2) and (3) pull the pixel's cloud from a
   * neighboring texel that marched to its own depth.
   */
  override setup(_builder: NodeBuilder): Node<'vec4'> {
    const cloudColor = texture(this.target.textures[0]!) as unknown as TextureNode
    const cloudData = texture(this.target.textures[1]!) as unknown as TextureNode
    const composite = Fn(() => {
      const pixel = screenCoordinate.xy
      const depth = this.sceneDepth.load(ivec2(floor(pixel))).x
      const z = min(perspectiveDepthToViewZ(depth, this.near, this.far).negate(), float(FOG_DISTANCE_M)).toVar()
      const u = pixel.div(this.cellsF).sub(0.5).toVar()
      const base = floor(u).toVar()
      const f = fract(u).toVar()
      const i0 = ivec2(base).toVar()
      const lowMax = ivec2(this.lowSize).sub(ivec2(1, 1)).toVar()
      const sum = vec4(0, 0, 0, 0).toVar()
      const weightSum = float(0).toVar()
      const bestTap = float(1e30).toVar()
      for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
        const at = clampTexel(i0.add(ivec2(ox, oy)), lowMax)
        const rel = abs(z.sub(cloudData.load(at).y)).div(max(z, 1e-3)).toVar()
        const wx = ox === 0 ? float(1).sub(f.x) : f.x
        const wy = oy === 0 ? float(1).sub(f.y) : f.y
        const w = wx.mul(wy).div(rel.add(DEPTH_EPSILON)).toVar()
        sum.addAssign(cloudColor.load(at).mul(w))
        weightSum.addAssign(w)
        bestTap.assign(min(bestTap, rel))
      }
      const cloud = sum.div(max(weightSum, 1e-12)).toVar()
      If(bestTap.greaterThan(DEPTH_MISMATCH), () => {
        const best = float(1e30).toVar()
        Loop({ start: int(-1), end: int(3), type: 'int', condition: '<', name: 'sy' } as unknown as Node<'int'>, (outer) => {
          const sy = (outer as unknown as { readonly sy: Node<'int'> }).sy
          Loop({ start: int(-1), end: int(3), type: 'int', condition: '<', name: 'sx' } as unknown as Node<'int'>, (inner) => {
            const sx = (inner as unknown as { readonly sx: Node<'int'> }).sx
            const at = clampTexel(i0.add(ivec2(sx, sy)), lowMax).toVar()
            const rel = abs(z.sub(cloudData.load(at).y)).div(max(z, 1e-3)).toVar()
            If(rel.lessThan(best), () => {
              best.assign(rel)
              cloud.assign(cloudColor.load(at))
            })
          })
        })
      })
      return vec4(this.sceneColor.rgb.mul(float(1).sub(cloud.a)).add(cloud.rgb), this.sceneColor.a)
    })
    return composite() as unknown as Node<'vec4'>
  }

  override dispose(): void {
    super.dispose()
    this.target.dispose()
    this.material.dispose()
  }
}

export function createCloudPass(opts: {
  clouds: CloudsHandle
  camera: PerspectiveCamera
  sceneColor: Node<'vec4'>
  sceneDepth: Node<'float'>
}): CloudPass {
  const node = new CloudPassNode(
    opts.clouds, opts.camera, opts.sceneColor, opts.sceneDepth as unknown as TextureNode,
    reference('near', 'float', opts.camera) as unknown as Node<'float'>,
    reference('far', 'float', opts.camera) as unknown as Node<'float'>,
  )
  return {
    composite: node as unknown as Node<'vec4'>,
    setResolutionScale(scale) { node.setResolutionScale(scale) },
    dispose() { node.dispose() },
  }
}
