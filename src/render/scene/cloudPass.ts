import { FloatType, HalfFloatType, LinearFilter, Matrix4, NearestFilter, RGBAFormat, RenderTarget, Vector2, Vector3, type PerspectiveCamera } from 'three'
import {
  NodeMaterial, NodeUpdateType, QuadMesh, RendererUtils, TempNode,
  type Node, type NodeBuilder, type NodeFrame, type TextureNode, type WebGPURenderer,
} from 'three/webgpu'
import {
  Fn, If, Loop, abs, clamp, float, floor, fract, int, ivec2, max, min, mix, mrt, normalize, perspectiveDepthToViewZ,
  reference, screenCoordinate, struct, texture, uniform, vec2, vec4,
} from 'three/tsl'
import type { Vec3 } from '../../sim/math/vec3.js'
import { FOG_DISTANCE_M } from '../horizon.js'
import type { CloudsHandle } from './clouds.js'
import { HISTORY_BLEND, reprojectUvNode } from './cloudHistory.js'

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
 * Targets, all at `cloudTargetSize(drawing buffer, scale)`:
 * - The march, two of them ping-ponged (Task 4), each a two-attachment MRT:
 *   - `cloudColor` (half float, linear filter): rgb premultiplied by alpha, alpha.
 *   - `cloudData` (float -- `FOG_DISTANCE_M` is 100 km, past half float's
 *     65504): x = the cloud's transmittance-weighted mean distance in metres
 *     (the resolve's reprojection depth), y = the MIN scene view-Z over the
 *     full-resolution texels this texel covers, capped at `FOG_DISTANCE_M` --
 *     the depth the march actually stopped at, which the composite matches
 *     against and the next frame's resolve tests for disocclusion.
 * - `cloudHistory`, two ping-ponged (half float, linear): the temporally
 *   resolved color (photoreal Task 4, 2026-09-24; see the resolve's doc
 *   comment). The composite reads THIS, not the raw march; depth is never
 *   accumulated, so the composite's depth matching is this frame's.
 *
 * Temporal state is fed by main.ts: `setEye` every rendered frame, and
 * `resetHistory` on every discontinuity (`shouldResetHistory`, restart,
 * scenario switch, unpause). A resize or a resolution-scale change resets by
 * itself, because it reallocates the targets.
 */
export type CloudPass = {
  /** Full-resolution composite of clouds over `sceneColor`, for `FramePipeline.setOutput`. */
  readonly composite: Node<'vec4'>
  setResolutionScale(scale: number): void
  /** 1 marches every texel; 16 marches one 4x4 Bayer phase per frame. */
  setUpdatePeriod(frames: 1 | 16): void
  /** The eye's world position for the frame about to render (camera-relative
   *  rendering: the camera itself sits at the origin). Call once per rendered
   *  frame, before `FramePipeline.render()`. */
  setEye(eye: Vec3): void
  /** The next rendered frame resolves from its own march alone (Task 4:
   *  teleport, respawn, scenario switch, unpause, long stall). */
  resetHistory(): void
  /** Frames resolved without history since boot (every reset, the first
   *  frame and every resize), for the Tier 2 discontinuity case. */
  historyResets(): number
  /** Measures `ReprojectionResidual` on the next rendered frame (DEV
   *  diagnostic; the pass it needs is compiled on first use only). */
  measureReprojectionResidual(): Promise<ReprojectionResidual | null>
  dispose(): void
}

/**
 * DEV check of the resolve's reprojection direction (Task 4 fix round 1):
 * the mean over the low-resolution target of |last frame's march at the
 * reprojected position - this frame's march| (summed over rgba), for the
 * mapping the resolve actually uses and for two deliberately wrong ones --
 * the motion reversed (`2 * uvHere - uv`) and v mirrored (`1 - v`, the
 * render-target y-flip trap). All three come from ONE pass over ONE frame,
 * so they share content exactly. During a continuous maneuver the correct
 * mapping must have the smallest residual; `cloudTemporal.spec.ts` asserts
 * it. `reset` is true when the frame had no valid previous frame (the
 * numbers are then meaningless).
 */
export type ReprojectionResidual = {
  readonly correct: number; readonly reversed: number; readonly mirrored: number; readonly reset: boolean
}

/** The cloud target's size for a drawing buffer and a per-axis scale. */
export function cloudTargetSize(width: number, height: number, scale: number): { width: number; height: number } {
  return { width: cloudTargetAxis(width, scale), height: cloudTargetAxis(height, scale) }
}
/**
 * How many full-resolution pixels one cloud texel spans per axis (`span`,
 * exactly 1 / scale, possibly fractional) and the side of the full-resolution
 * block the march's min-depth downsample reads (`block`, whole texels that
 * are guaranteed to cover the span wherever it starts).
 *
 * FIXED 2026-09-25 (photoreal Task 9): the span was `round(1 / scale)`,
 * correct only for scale = 1/n. At 0.45 it was 2 while the target was
 * ceil(0.45 × pixels) texels, so the target covered 0.9 of the screen and
 * the bottom and right 10% of the composite read the clamped last row and
 * column: vertical streaks along the bottom of high-6000 (read 2026-09-25).
 * A span that is exactly 1 / scale makes target × span >= pixels for any
 * scale (`cloudTargetAxis` rounds up); a fractional span starting mid-pixel
 * can touch ceil(span) + 1 pixels, hence `block`.
 */
export function cloudCells(scale: number): { span: number; block: number } {
  const span = 1 / scale
  const whole = Math.abs(span - Math.round(span)) < 1e-9
  return { span: whole ? Math.round(span) : span, block: whole ? Math.round(span) : Math.ceil(span) + 1 }
}

/** One axis of `cloudTargetSize`; the per-frame path calls this directly so
 *  it allocates nothing. */
function cloudTargetAxis(pixels: number, scale: number): number {
  return Math.max(1, Math.ceil(pixels * scale))
}

/** The composite's depth weight is `1 / (DEPTH_EPSILON + relative difference)`;
 *  a tap whose depth matches exactly outweighs one 10% off by 11x. */
const DEPTH_EPSILON = 0.01
/** When NONE of the four bilinear taps is within this relative depth of the
 *  full-resolution pixel, the composite falls back to the best-matching texel
 *  of the surrounding 4x4 (see the composite's doc comment). */
const DEPTH_MISMATCH = 0.1
/** The resolve's disocclusion test (Task 4): history is rejected where the
 *  previous frame's march stopped at a view-Z more than this far (relative)
 *  from where today's stop point sat in the previous camera. 0.25, not the
 *  composite's 0.1: adjacent low-res texels of grazing terrain near the
 *  horizon differ by up to ~7% (30 km at 600 m, 1440p), and history is read
 *  at the NEAREST previous texel; an airframe or a hill against distant
 *  ground differs by far more than 25%. */
const DISOCCLUSION = 0.25
/** A sharp gradient in last frame's representative CLOUD depth marks a
 * volumetric silhouette. Those texels update immediately: scene-depth
 * disocclusion cannot detect a cloud edge moving over clear sky. */
const CLOUD_EDGE_DEPTH_MISMATCH = 0.2
/** The golden-ratio increment of the per-frame dither offset (spec §4.1). */
const GOLDEN = 0.618034

/** The canonical 4x4 Bayer order used by the High-tier amortized march. */
export function bayer4Index(x: number, y: number): number {
  const bayer2 = (a: number, b: number): number => 2 * a + b * (3 - 4 * a)
  return 4 * bayer2(x & 1, y & 1) + bayer2((x >> 1) & 1, (y >> 1) & 1)
}

export function bayer4Offset(phase: number): { x: number; y: number } {
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) if (bayer4Index(x, y) === phase) return { x, y }
  }
  throw new Error(`Bayer phase ${phase} is outside 0..15`)
}

const MarchOut = struct({ color: 'vec4', data: 'vec4' })
const NEIGHBORS = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] as const

/** Integer texel coordinate clamped into [0, max]. `clamp`'s @types/three
 *  0.186 overloads admit only float vectors; WGSL's `clamp` takes ivec2. */
function clampTexel(at: Node<'ivec2'>, hi: Node<'ivec2'>): Node<'ivec2'> {
  return (clamp as unknown as (x: Node<'ivec2'>, lo: Node<'ivec2'>, hi: Node<'ivec2'>) => Node<'ivec2'>)(at, ivec2(0, 0), hi)
}

/** One march target: `count: 2` MRT, color half float (linear), data float (nearest). */
function marchTarget(): RenderTarget {
  const target = new RenderTarget(1, 1, { count: 2, type: HalfFloatType, format: RGBAFormat, depthBuffer: false })
  const [color, data] = target.textures as [RenderTarget['texture'], RenderTarget['texture']]
  color.name = 'cloudColor'
  color.minFilter = color.magFilter = LinearFilter
  data.name = 'cloudData'
  data.type = FloatType
  data.minFilter = data.magFilter = NearestFilter
  return target
}

/** One history target: the resolved premultiplied color, half float, linear
 *  (the resolve samples it bilinearly at the reprojected position). */
function historyTarget(): RenderTarget {
  const target = new RenderTarget(1, 1, { type: HalfFloatType, format: RGBAFormat, depthBuffer: false })
  target.texture.name = 'cloudHistory'
  target.texture.minFilter = target.texture.magFilter = LinearFilter
  return target
}

let rendererState: ReturnType<typeof RendererUtils.resetRendererState> | undefined
const drawingBuffer = new Vector2()

class CloudPassNode extends TempNode<'vec4'> {
  /** Compact 1/16-area target containing this frame's Bayer phase. */
  private readonly updates = marchTarget()
  /** Ping-pong march targets; `march[current]` is written this frame and
   *  `march[1 - current]` still holds last frame's (its data feeds the
   *  resolve's disocclusion test). */
  private readonly march: readonly [RenderTarget, RenderTarget] = [marchTarget(), marchTarget()]
  /** Ping-pong resolved targets: `history[current]` is written this frame
   *  from `history[1 - current]`, and is what the composite reads. */
  private readonly history: readonly [RenderTarget, RenderTarget] = [historyTarget(), historyTarget()]
  private current = 0
  private readonly material = new NodeMaterial()
  private readonly quad = new QuadMesh(this.material)
  private readonly updateMaterial = new NodeMaterial()
  private readonly updateQuad = new QuadMesh(this.updateMaterial)
  private readonly resolveMaterial = new NodeMaterial()
  private readonly resolveQuad = new QuadMesh(this.resolveMaterial)
  /** Full-resolution texels per cloud texel, per axis (`cloudCells`). */
  private cells = cloudCells(0.5)
  private scale = 0.5
  private readonly fullSize = uniform(new Vector2(1, 1))
  private readonly lowSize = uniform(new Vector2(1, 1))
  private readonly cellsF = uniform(2)
  private readonly cellsI = uniform(2, 'int')
  /** 1 for every-frame tiers; 16 for High's one-texel-per-4x4 schedule. */
  private readonly updatePeriod = uniform(1, 'int')
  private readonly updateOffset = uniform(new Vector2())
  /** DEV residual measurements compare two fully marched frames. */
  private readonly forceMarch = uniform(0)
  // Texture nodes whose `.value` is swapped every frame (NodeSampledTexture
  // rebinds on a changed value; AfterImageNode relies on the same).
  private readonly marchColor = texture(this.march[0].textures[0]!) as unknown as TextureNode
  private readonly marchData = texture(this.march[0].textures[1]!) as unknown as TextureNode
  private readonly updateColor = texture(this.updates.textures[0]!) as unknown as TextureNode
  private readonly updateData = texture(this.updates.textures[1]!) as unknown as TextureNode
  private readonly prevMarchData = texture(this.march[1].textures[1]!) as unknown as TextureNode
  private readonly historyRead = texture(this.history[1].texture) as unknown as TextureNode
  private readonly resolved = texture(this.history[0].texture) as unknown as TextureNode
  /** Per-frame dither offset, `frameIndex * GOLDEN mod 1`, computed in float64
   *  on the CPU: a float32 `frameIndex * 0.618` loses the fraction after a few
   *  hours of frames. */
  private readonly jitter = uniform(0)
  private frameIndex = 0
  /** `eye - prevEye`, subtracted in float64 (world coordinates reach 100 km). */
  private readonly eyeDelta = uniform(new Vector3())
  /** Last rendered frame's `projectionMatrix * matrixWorldInverse` -- a
   *  rotation-only view, since the camera sits at the origin every frame. */
  private readonly prevViewProjection = uniform(new Matrix4())
  private readonly historyValid = uniform(0)
  /** Last frame's march color, for the DEV reprojection-residual check only. */
  private readonly prevMarchColor = texture(this.march[1].textures[0]!) as unknown as TextureNode
  /** The reprojection of one low-resolution texel into the previous frame,
   *  shared by the resolve and the residual check so the check measures
   *  exactly the mapping the resolve uses. Assigned in the constructor. */
  private readonly reprojectTexel: (cell: Node<'vec2'>, data: Node<'vec4'>) => {
    dir: Node<'vec3'>; cosView: Node<'float'>; valid: Node<'bool'>; uv: Node<'vec2'>
  }
  /** Screen UV of the previous frame -> continuous previous low-res texel coordinate. */
  private readonly prevLowOf = (uv: Node<'vec2'>): Node<'vec2'> => uv.mul(this.fullSize).div(this.cellsF) as unknown as Node<'vec2'>
  private residual: { target: RenderTarget; material: NodeMaterial; quad: QuadMesh } | null = null
  private residualRequests: ((r: ReprojectionResidual | null) => void)[] = []
  private eye: Vec3 | null = null
  private prevEye: Vec3 | null = null
  private resetPending = true
  resets = 0

  constructor(
    clouds: CloudsHandle,
    private readonly camera: PerspectiveCamera,
    private readonly sceneColor: Node<'vec4'>,
    private readonly sceneDepth: TextureNode,
    private readonly near: Node<'float'>,
    private readonly far: Node<'float'>,
  ) {
    super('vec4')
    this.updateBeforeType = NodeUpdateType.FRAME

    // The pass renders with the QuadMesh's own camera, so the scene camera's
    // matrices come in as uniforms holding the camera's live Matrix4 objects
    // (as GTAONode does), never through `cameraProjectionMatrix` & co.
    const projectionInverse = uniform(camera.projectionMatrixInverse)
    const cameraWorld = uniform(camera.matrixWorld)
    /** The view ray through a low-resolution texel's block center. The scene
     *  is camera-relative (the camera sits at the origin, main.ts), so the
     *  world direction is the view direction rotated by the camera; any NDC
     *  depth inside the frustum lies on the same ray. Shared by the march and
     *  the resolve, so both see the SAME ray for a texel. */
    const rayThrough = (cell: Node<'vec2'>): { dir: Node<'vec3'>; cosView: Node<'float'> } => {
      const center = cell.add(0.5).mul(this.cellsF)
      const ndc = vec2(center.x.div(this.fullSize.x).mul(2).sub(1), float(1).sub(center.y.div(this.fullSize.y).mul(2)))
      const viewH = projectionInverse.mul(vec4(ndc, 0.5, 1)).toVar()
      const viewDir = normalize(viewH.xyz.div(viewH.w)).toVar()
      return { dir: cameraWorld.mul(vec4(viewDir, 0)).xyz as unknown as Node<'vec3'>, cosView: viewDir.z.negate() as unknown as Node<'float'> }
    }

    this.reprojectTexel = (cell, data) => {
      const { dir, cosView } = rayThrough(cell)
      const reprojected = reprojectUvNode(dir, data.x as unknown as Node<'float'>, this.eyeDelta as unknown as Node<'vec3'>, this.prevViewProjection as unknown as Node<'mat4'>)
      return { dir, cosView, valid: reprojected.valid, uv: vec2(reprojected.uv).toVar() as unknown as Node<'vec2'> }
    }

    /** MIN scene view-Z over the full-resolution block covered by `cell`. */
    const minViewZAt = (cell: Node<'vec2'>): Node<'float'> => {
      const origin = ivec2(cell.mul(this.cellsF)).toVar()
      const fullMax = ivec2(this.fullSize).sub(ivec2(1, 1)).toVar()
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
      return minViewZ as unknown as Node<'float'>
    }

    /** The expensive ray march for one actual low-resolution cloud cell. */
    const marchAt = (cell: Node<'vec2'>, minViewZ: Node<'float'>): { color: Node<'vec4'>; depth: Node<'float'> } => {
      const { dir, cosView } = rayThrough(cell as unknown as Node<'vec2'>)
      const sceneT = min(minViewZ.div(max(cosView, 0.001)), float(FOG_DISTANCE_M))
      const ign = fract(float(52.9829189).mul(fract(cell.x.mul(0.06711056).add(cell.y.mul(0.00583715)))))
      const dither = fract(ign.add(this.jitter))
      const result = clouds.marchNode(dir, sceneT, dither)
      return { color: result.color, depth: result.depthM }
    }

    // The compact update pass has one texel per 4x4 block. Its phase offset
    // maps each output back to the one full cloud cell scheduled this frame,
    // so the expensive branch executes coherently over 1/16 the pixels.
    const update = Fn(() => {
      const block = floor(screenCoordinate.xy).toVar()
      const cell = min(block.mul(4).add(this.updateOffset), this.lowSize.sub(1)).toVar()
      const minViewZ = minViewZAt(cell as unknown as Node<'vec2'>)
      const result = marchAt(cell as unknown as Node<'vec2'>, minViewZ)
      return MarchOut(result.color, vec4(result.depth, minViewZ, 1, 0))
    })()
    this.updateMaterial.fragmentNode = mrt({ cloudColor: update.get('color'), cloudData: update.get('data') })
    this.updateMaterial.name = 'CloudUpdate'
    this.updateQuad.material = this.updateMaterial
    this.updateQuad.name = 'CloudUpdate'

    const march = Fn(() => {
      const cell = floor(screenCoordinate.xy).toVar()
      const minViewZ = minViewZAt(cell as unknown as Node<'vec2'>)
      const { dir, cosView } = rayThrough(cell as unknown as Node<'vec2'>)

      // Cloud Fidelity II §3.2: seed reprojection from last frame's depth at
      // this screen cell, then refine it once from the depth at the resulting
      // previous-frame coordinate. This gives an unscheduled texel the same
      // history/disocclusion decision the ordinary resolve gets without first
      // paying for a fresh march.
      const at = ivec2(cell).toVar()
      const lowMax = ivec2(this.lowSize).sub(ivec2(1, 1)).toVar()
      const seedData = this.prevMarchData.load(clampTexel(at, lowMax)).toVar()
      const seeded = this.reprojectTexel(cell as unknown as Node<'vec2'>, seedData as unknown as Node<'vec4'>)
      const seededLow = this.prevLowOf(seeded.uv)
      const previousData = this.prevMarchData.load(clampTexel(ivec2(floor(seededLow)), lowMax)).toVar()
      const reprojected = this.reprojectTexel(cell as unknown as Node<'vec2'>, previousData as unknown as Node<'vec4'>)
      const prevLow = vec2(this.prevLowOf(reprojected.uv)).toVar()
      // Unconditional texture sample: WGSL textureSample must stay in uniform
      // control flow even though only unscheduled, accepted texels use it.
      const history = this.historyRead.sample(prevLow.div(this.lowSize))
      const stop = this.eyeDelta.add(dir.mul(minViewZ.div(max(cosView, 0.001))))
      const expected = min(this.prevViewProjection.mul(vec4(stop, 1)).w, float(FOG_DISTANCE_M))
      const prevAt = clampTexel(ivec2(floor(prevLow)), lowMax).toVar()
      const prevStop = this.prevMarchData.load(prevAt).y
      const occluded = abs(prevStop.sub(expected)).div(max(expected, 1e-3)).greaterThan(DISOCCLUSION)
      const cloudDepthMin = float(previousData.x).toVar()
      const cloudDepthMax = float(previousData.x).toVar()
      for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const d = this.prevMarchData.load(clampTexel(prevAt.add(ivec2(ox, oy)), lowMax)).x
        cloudDepthMin.assign(min(cloudDepthMin, d))
        cloudDepthMax.assign(max(cloudDepthMax, d))
      }
      const cloudEdge = cloudDepthMax.sub(cloudDepthMin).div(max(cloudDepthMax, 1)).greaterThan(CLOUD_EDGE_DEPTH_MISMATCH)
      const uv = reprojected.uv
      const onScreen = uv.x.greaterThanEqual(0).and(uv.x.lessThanEqual(1)).and(uv.y.greaterThanEqual(0)).and(uv.y.lessThanEqual(1))
      const accept = this.historyValid.greaterThan(0.5).and(reprojected.valid).and(onScreen).and(occluded.not()).and(cloudEdge.not())
      const color = vec4(history).toVar()
      const cloudDepth = float(previousData.x).toVar()
      const marched = float(0).toVar()
      const assignMarch = (): void => {
        const result = marchAt(cell as unknown as Node<'vec2'>, minViewZ)
        color.assign(result.color)
        cloudDepth.assign(result.depth)
        marched.assign(1)
      }
      const compactAt = ivec2(floor(cell.div(4))).toVar()
      const fullMarch = this.forceMarch.greaterThan(0.5).or(this.updatePeriod.equal(int(1)))
      const scheduled = cell.x.mod(4).equal(this.updateOffset.x).and(cell.y.mod(4).equal(this.updateOffset.y))
      If(fullMarch, assignMarch).Else(() => {
        If(scheduled, () => {
          const data = this.updateData.load(compactAt)
          color.assign(this.updateColor.load(compactAt))
          cloudDepth.assign(data.x)
          marched.assign(1)
        }).Else(() => {
          // A disoccluded/off-screen texel is marched immediately instead of
          // waiting for its Bayer phase, preventing a 16-frame clear trail.
          If(accept.not(), assignMarch).Else(() => {
            // Carried history is up to 15 frames old, and re-sampling it
            // every frame under rotation smears it into arcs (in-deck roll,
            // 2026-09-25; gone with every-texel updates). Bound it by this
            // frame's fresh samples: the 3x3 compact texels around this
            // cell, the marches nearest it. Loads, so no uniformity rule.
            const compactMax = ivec2(this.lowSize.add(3).div(4)).sub(ivec2(1, 1)).toVar()
            const freshLo = vec4(this.updateColor.load(clampTexel(compactAt, compactMax))).toVar()
            const freshHi = vec4(freshLo).toVar()
            for (const [ox, oy] of NEIGHBORS) {
              const n = this.updateColor.load(clampTexel(compactAt.add(ivec2(ox, oy)), compactMax)).toVar()
              freshLo.assign(min(freshLo, n))
              freshHi.assign(max(freshHi, n))
            }
            color.assign(clamp(history, freshLo, freshHi))
          })
        })
      })
      return MarchOut(color, vec4(cloudDepth, minViewZ, marched, 0))
    })()
    this.material.fragmentNode = mrt({ cloudColor: march.get('color'), cloudData: march.get('data') })
    this.material.name = 'CloudMarch'
    this.quad.material = this.material
    this.quad.name = 'CloudMarch'

    /**
     * The temporal resolve (spec §4.1, Task 4), one low-resolution texel per
     * fragment:
     * 1. `current` = this frame's march; `lo`/`hi` = per-channel min/max of
     *    its 3x3 neighborhood.
     * 2. The cloud's representative depth along this texel's ray, reprojected
     *    into the previous frame (`reprojectUvNode`, with the eye delta
     *    because the scene is camera-relative), then converted from screen
     *    UV into the previous low-resolution target's UV (the target covers
     *    `lowSize * span` full-resolution pixels -- `cloudCells`' span, exactly
     *    1 / scale -- which exceeds the screen by less than one span).
     * 3. History is REJECTED -- the texel takes `current` -- when history is
     *    reset, the point is behind the previous camera or off its screen,
     *    or disoccluded: where the previous march stopped (its min view-Z,
     *    `cloudData.y`, at the nearest previous texel) differs by more than
     *    `DISOCCLUSION` from the view-Z today's stop point had in the
     *    previous camera. That is what keeps a rolling airframe from
     *    dragging a clear-sky ghost of itself across the deck: the texels it
     *    uncovers were stopped at 10 m last frame.
     * 4. Otherwise `mix(current, clamp(history, lo, hi), HISTORY_BLEND)`.
     * The texture sample is taken unconditionally and selected afterwards:
     * WGSL's `textureSample` must be in uniform control flow.
     */
    const resolve = Fn(() => {
      const low = screenCoordinate.xy
      const cell = floor(low).toVar()
      const at = ivec2(cell).toVar()
      const current = this.marchColor.load(at).toVar()
      const data = this.marchData.load(at).toVar()
      const output = vec4(current).toVar()
      If(data.z.greaterThan(0.5), () => {
        const lowMax = ivec2(this.lowSize).sub(ivec2(1, 1)).toVar()
        const lo = vec4(current).toVar()
        const hi = vec4(current).toVar()
        for (const [ox, oy] of NEIGHBORS) {
          const n = this.marchColor.load(clampTexel(at.add(ivec2(ox, oy)), lowMax)).toVar()
          lo.assign(min(lo, n))
          hi.assign(max(hi, n))
        }
        const reprojected = this.reprojectTexel(cell as unknown as Node<'vec2'>, data as unknown as Node<'vec4'>)
        const { dir, cosView, uv } = reprojected
        const prevLow = vec2(this.prevLowOf(uv)).toVar()
        const history = this.historyRead.sample(prevLow.div(this.lowSize))
        const clamped = clamp(history, lo, hi)
        // Disocclusion: today's stop point, in the previous camera.
        const stop = this.eyeDelta.add(dir.mul(data.y.div(max(cosView, 0.001))))
        const expected = min(this.prevViewProjection.mul(vec4(stop, 1)).w, float(FOG_DISTANCE_M))
        const prevStop = this.prevMarchData.load(clampTexel(ivec2(floor(prevLow)), lowMax)).y
        const occluded = abs(prevStop.sub(expected)).div(max(expected, 1e-3)).greaterThan(DISOCCLUSION)
        const onScreen = uv.x.greaterThanEqual(0).and(uv.x.lessThanEqual(1)).and(uv.y.greaterThanEqual(0)).and(uv.y.lessThanEqual(1))
        const accept = this.historyValid.greaterThan(0.5).and(reprojected.valid).and(onScreen).and(occluded.not())
        output.assign(accept.select(mix(current, clamped, HISTORY_BLEND), current))
      })
      return output
    })()
    this.resolveMaterial.fragmentNode = resolve
    this.resolveMaterial.name = 'CloudResolve'
    this.resolveQuad.material = this.resolveMaterial
    this.resolveQuad.name = 'CloudResolve'
  }

  setResolutionScale(scale: number): void {
    if (scale !== this.scale) this.resetPending = true
    this.scale = scale
    this.cells = cloudCells(scale)
  }

  setUpdatePeriod(frames: 1 | 16): void {
    if (frames !== this.updatePeriod.value) this.resetPending = true
    this.updatePeriod.value = frames
  }

  setEye(eye: Vec3): void {
    this.eye = { x: eye.x, y: eye.y, z: eye.z }
  }

  resetHistory(): void {
    this.resetPending = true
  }

  override updateBefore(frame: NodeFrame): undefined {
    const renderer = frame.renderer as unknown as WebGPURenderer
    rendererState = RendererUtils.resetRendererState(renderer, rendererState as ReturnType<typeof RendererUtils.resetRendererState>)
    const { x: width, y: height } = renderer.getDrawingBufferSize(drawingBuffer)
    const lowWidth = cloudTargetAxis(width, this.scale)
    const lowHeight = cloudTargetAxis(height, this.scale)
    const march = this.march[this.current]!
    const history = this.history[this.current]!
    // A resize reallocates every target: last frame's history is gone.
    if (march.width !== lowWidth || march.height !== lowHeight) this.resetPending = true
    for (const target of [...this.march, ...this.history]) target.setSize(lowWidth, lowHeight)
    this.updates.setSize(Math.ceil(lowWidth / 4), Math.ceil(lowHeight / 4))
    this.fullSize.value.set(width, height)
    this.lowSize.value.set(lowWidth, lowHeight)
    this.cellsF.value = this.cells.span
    this.cellsI.value = this.cells.block
    this.jitter.value = (this.frameIndex * GOLDEN) % 1
    const updateOffset = bayer4Offset(this.frameIndex % 16)
    this.updateOffset.value.set(updateOffset.x, updateOffset.y)
    this.frameIndex++

    // Reprojection is needed by the march itself now: unscheduled texels
    // carry accepted history, while rejected ones march immediately.
    const eye = this.eye ?? { x: 0, y: 0, z: 0 }
    const reset = this.resetPending || this.prevEye === null
    const prevEye = this.prevEye ?? eye
    this.eyeDelta.value.set(eye.x - prevEye.x, eye.y - prevEye.y, eye.z - prevEye.z)
    this.historyValid.value = reset ? 0 : 1
    this.historyRead.value = this.history[1 - this.current]!.texture
    this.forceMarch.value = this.residualRequests.length > 0 ? 1 : 0

    // 1. High's compact 1/16-area scheduled update. Every-frame tiers bypass
    // it and march coherently in the full target below.
    if (this.updatePeriod.value === 16) {
      this.updateColor.value = this.updates.textures[0]!
      this.updateData.value = this.updates.textures[1]!
      renderer.setRenderTarget(this.updates)
      this.updateQuad.render(renderer)
    }

    // 2. Assemble carried history, compact updates and disocclusion fallbacks
    // into this frame's full cloud target.
    this.marchColor.value = march.textures[0]!
    this.marchData.value = march.textures[1]!
    this.prevMarchData.value = this.march[1 - this.current]!.textures[1]!
    this.prevMarchColor.value = this.march[1 - this.current]!.textures[0]!
    renderer.setRenderTarget(march)
    this.quad.render(renderer)

    // 3. The resolve, from last frame's history into this frame's.
    renderer.setRenderTarget(history)
    this.resolveQuad.render(renderer)
    this.resolved.value = history.texture
    if (this.residualRequests.length > 0) this.renderResidual(renderer, reset)
    if (reset) this.resets++

    // 4. This frame becomes the previous one. The scene pass has already
    // rendered this frame, so the camera's matrices are this frame's.
    this.prevViewProjection.value.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse)
    this.prevEye = eye
    this.resetPending = false
    this.current = 1 - this.current
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
    // Task 4: color from the temporally resolved target, depth from this
    // frame's march (depth is never accumulated).
    const cloudColor = this.resolved
    const cloudData = this.marchData
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

  measureResidual(): Promise<ReprojectionResidual | null> {
    return new Promise((resolve) => { this.residualRequests.push(resolve) })
  }

  /** The residual pass (see `ReprojectionResidual`), built on first use. */
  private buildResidual(): { target: RenderTarget; material: NodeMaterial; quad: QuadMesh } {
    const target = new RenderTarget(1, 1, { type: FloatType, format: RGBAFormat, depthBuffer: false })
    target.texture.minFilter = target.texture.magFilter = NearestFilter
    const material = new NodeMaterial()
    material.fragmentNode = Fn(() => {
      const cell = floor(screenCoordinate.xy).toVar()
      const at = ivec2(cell).toVar()
      const current = this.marchColor.load(at).toVar()
      const data = this.marchData.load(at).toVar()
      const { uv } = this.reprojectTexel(cell as unknown as Node<'vec2'>, data as unknown as Node<'vec4'>)
      const here = cell.add(0.5).mul(this.cellsF).div(this.fullSize)
      const residual = (at2: Node<'vec2'>): Node<'float'> => {
        const d = abs(this.prevMarchColor.sample(this.prevLowOf(at2).div(this.lowSize)).sub(current))
        return d.x.add(d.y).add(d.z).add(d.w) as unknown as Node<'float'>
      }
      return vec4(
        residual(uv),
        residual(here.mul(2).sub(uv) as unknown as Node<'vec2'>),
        residual(vec2(uv.x, float(1).sub(uv.y)) as unknown as Node<'vec2'>),
        1,
      )
    })()
    material.name = 'CloudResidual'
    const quad = new QuadMesh(material)
    quad.name = 'CloudResidual'
    return { target, material, quad }
  }

  private renderResidual(renderer: WebGPURenderer, reset: boolean): void {
    const requests = this.residualRequests
    this.residualRequests = []
    this.residual ??= this.buildResidual()
    const { target, quad } = this.residual
    const width = this.march[0].width
    const height = this.march[0].height
    target.setSize(width, height)
    renderer.setRenderTarget(target)
    quad.render(renderer)
    // 16 float4 texels = 256 bytes: a width that is a multiple of 16 needs no
    // row padding in three's readback (WebGPUTextureUtils.copyTextureToBuffer
    // pads every row to 256 bytes).
    const readWidth = Math.max(16, Math.floor(width / 16) * 16)
    if (readWidth > width) { for (const r of requests) r(null); return }
    void renderer.readRenderTargetPixelsAsync(target, 0, 0, readWidth, height).then((pixels) => {
      const data = pixels as Float32Array
      let correct = 0, reversed = 0, mirrored = 0
      for (let i = 0; i < data.length; i += 4) { correct += data[i]!; reversed += data[i + 1]!; mirrored += data[i + 2]! }
      const n = data.length / 4
      const result = { correct: correct / n, reversed: reversed / n, mirrored: mirrored / n, reset }
      for (const r of requests) r(result)
    }, () => { for (const r of requests) r(null) })
  }

  override dispose(): void {
    super.dispose()
    for (const target of [...this.march, ...this.history]) target.dispose()
    this.updates.dispose()
    this.material.dispose()
    this.updateMaterial.dispose()
    this.resolveMaterial.dispose()
    if (this.residual !== null) { this.residual.target.dispose(); this.residual.material.dispose() }
    for (const r of this.residualRequests) r(null)
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
    setUpdatePeriod(frames) { node.setUpdatePeriod(frames) },
    setEye(eye) { node.setEye(eye) },
    resetHistory() { node.resetHistory() },
    historyResets() { return node.resets },
    measureReprojectionResidual() { return node.measureResidual() },
    dispose() { node.dispose() },
  }
}
