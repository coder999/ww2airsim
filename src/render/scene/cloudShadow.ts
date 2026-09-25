import {
  ClampToEdgeWrapping, LinearFilter, Mesh, OrthographicCamera, PlaneGeometry, RedFormat, RenderTarget, Scene,
  UnsignedByteType, Vector2,
} from 'three'
import { MeshBasicNodeMaterial, type Node, type WebGPURenderer } from 'three/webgpu'
import { Fn, If, Loop, clamp, exp, float, int, max, min, normalize, smoothstep, texture, uniform, uv, vec2, vec3, vec4 } from 'three/tsl'
import type { Vec3 } from '../../sim/math/vec3.js'
import { CUMULUS_SIGMA, type CloudField } from './cloudField.js'
import type { CloudTierName } from './clouds.js'
import { sunDirectionNode } from './lighting.js'

/**
 * Cloud shadows (design: docs/superpowers/specs/2026-09-19-cloud-shadows-design.md).
 *
 * A sun-view transmittance map: one 8-bit channel, MAP_TEXELS square over
 * MAP_SIDE_M around the eye, rendered every frame by a full-screen quad
 * whose fragment integrates the SAME cloud density the cloud pass marches
 * (cloudField.ts) up the sun ray from a sea-level ground point. The lookup
 * node undoes the camera-relative shift when asked to, applies exact
 * directional-sun parallax, fades to 1 above the lowest cumulus deck, and
 * samples the map. The sun's custom `shadow.shadowNode` carries the lookup
 * into every lit material (three r186 AnalyticLightNode.setupShadow); the
 * terrain and the ocean, which light themselves, call `node()` directly.
 */
export const MAP_TEXELS = 1024
export const MAP_SIDE_M = 80_000
export const MAP_TEXEL_M = MAP_SIDE_M / MAP_TEXELS
/** The outer ring that fades to no shadow, so clamp-to-edge beyond the map is seamless. */
export const MAP_FADE_M = 8000
/** How dark the sea goes under an opaque cloud: it loses glint and subsurface
 *  light but still reflects the sky. One number, for Mark to tune by eye. */
export const OCEAN_SHADOW_FLOOR = 0.6
export const SHADOW_TIERS = { high: { taps: 4 }, medium: { taps: 3 }, low: { taps: 2 } } as const

/** DEV-only `?cloudShadow=off|show`: the control for every budget and image
 *  measurement, and the probe that paints T as gray on the terrain and sea. */
export const CLOUD_SHADOW_PARAM = 'cloudShadow'
export type CloudShadowMode = 'off' | 'show'
export function cloudShadowFromQuery(search: string): CloudShadowMode | undefined {
  const raw = new URLSearchParams(search).get(CLOUD_SHADOW_PARAM)
  if (raw === null) return undefined
  if (raw === 'off' || raw === 'show') return raw
  throw new Error(`${CLOUD_SHADOW_PARAM}: ${JSON.stringify(raw)} is not a cloud shadow mode`)
}

/** Map center snapped to the texel grid: idempotent, moves in whole texels,
 *  so recentering never slides the sampled field under a still cloud. */
export function snapToTexel(x: number, z: number, texelM = MAP_TEXEL_M): { x: number; z: number } {
  // `+ 0` folds -0 to 0 so a snapped origin compares equal to a literal zero.
  return { x: Math.round(x / texelM) * texelM + 0, z: Math.round(z / texelM) * texelM + 0 }
}

/** The projection's minimum sun elevation, sin(5 deg): below it shadows
 *  would stretch to infinity as `1 / sun.y`; clamped, a horizon sun casts
 *  shadows eleven times the object's height and no longer (Plan 16c). */
export const SHADOW_MIN_SUN_Y = Math.sin((5 * Math.PI) / 180)

/** Horizontal offset from a point at height y to the sea-level point on the
 *  same sun ray: exact for a directional sun, so one sea-level map serves
 *  every height. */
export function sunParallaxXZ(sun: { x: number; y: number; z: number }, y: number): { x: number; z: number } {
  const sy = Math.max(sun.y, SHADOW_MIN_SUN_Y)
  return { x: (-sun.x / sy) * y + 0, z: (-sun.z / sy) * y + 0 }
}

export type CloudShadowHandle = {
  /** Transmittance in [0, 1] at a position. `'eyeRelative'` is what `positionWorld`
   *  is under camera-relative rendering (the node adds the eye back); `'world'` is a
   *  true world position a material already has (the terrain's, the ocean's). */
  node(position: Node<'vec3'>, frame: 'eyeRelative' | 'world'): Node<'float'>
  /** True when the deck has a cumulus layer and the DEV mode is not `off`. */
  readonly enabled: boolean
  readonly showing: boolean
  readonly target: RenderTarget
  readonly scene: Scene
  readonly camera: OrthographicCamera
  readonly taps: number
  /** The snapped map center in true world metres, after `update`. */
  centerXZ(): { x: number; z: number }
  setTier(name: CloudTierName): void
  /** Recenter on the eye (true world metres). Call before rendering the pass. */
  update(eye: Vec3): void
  /** DEV diagnostic: the map's stored transmittance at a sea-level world point,
   *  read back through the SAME texel convention the lookup node samples, so a
   *  fixed world point must read the same value from any eye position. Null
   *  outside the map or when the pass is disabled. */
  readAt(renderer: WebGPURenderer, x: number, z: number): Promise<number | null>
  dispose(): void
}

export function createCloudShadow(field: CloudField, mode?: CloudShadowMode): CloudShadowHandle {
  const lowest = field.lowestCumulus()
  const enabled = lowest !== null && mode !== 'off'

  const target = new RenderTarget(MAP_TEXELS, MAP_TEXELS, {
    format: RedFormat, type: UnsignedByteType, depthBuffer: false, stencilBuffer: false,
    minFilter: LinearFilter, magFilter: LinearFilter, wrapS: ClampToEdgeWrapping, wrapT: ClampToEdgeWrapping, generateMipmaps: false,
  })
  /** Minimum-x, minimum-z corner of the map in true world metres. */
  const mapOrigin = uniform(new Vector2())
  const taps = uniform(SHADOW_TIERS.high.taps, 'int')
  const deckBase = uniform(lowest?.baseM ?? 0)
  const deckTop = uniform(lowest?.topM ?? 1)
  const enabledU = uniform(enabled ? 1 : 0)

  // ---- the pass: one quad, one fragment per texel -------------------------
  const material = new MeshBasicNodeMaterial()
  material.colorNode = Fn(() => {
    // The quad's uv.y = 1 edge is the TOP of clip space, which WebGPU stores
    // as texture row 0, which `map.sample(st)` reads at st.y = 0 -- and the
    // WGSL builder applies no Y flip to render-target samples
    // (WGSLNodeBuilder.isFlipY() is false). So the texel written at uv.y is
    // read back at 1 - uv.y: without this flip the map is MIRRORED in z
    // about the eye's snapped center, and the shadows ride along with the
    // airplane at twice its speed in 78 m steps (Mark: "choppy", 2026-09-19;
    // five world points read different T from three eye positions).
    const ground = mapOrigin.add(vec2(uv().x, float(1).sub(uv().y)).mul(MAP_SIDE_M)).toVar()
    const sun = normalize(sunDirectionNode).toVar()
    const sunY = max(sun.y, float(SHADOW_MIN_SUN_Y)).toVar()
    const tau = float(0).toVar()
    const tapsF = taps.toFloat().toVar()
    Loop({ start: int(0), end: field.layerCount, type: 'int', condition: '<' }, ({ i }) => {
      // Captured into vars BEFORE the inner loop: TSL re-emits an element
      // lookup at every use (16a handoff trap 3).
      const layer = (field.layerData.element(i) as unknown as Node<'vec4'>).toVar()
      const base = layer.x.toVar()
      const thickness = layer.y.toVar()
      const coverage = layer.z.toVar()
      const kind = layer.w.toVar()
      If(kind.lessThan(0.5).and(coverage.greaterThan(0)), () => {
        // `name` is honoured at runtime (LoopNode.js: `param.name || getVarName(i)`)
        // but absent from @types/three 0.186's overloads, hence the cast.
        Loop({ start: int(0), end: taps, type: 'int', condition: '<', name: 'k' } as unknown as Node<'int'>, (inputs) => {
          // The runtime keys the counter by `name`; the types only know `i`.
          const k = (inputs as unknown as { k: Node<'int'> }).k
          const h = k.toFloat().add(0.5).div(tapsF)
          const y = base.add(thickness.mul(h))
          // The sun ray through (ground, 0): horizontal offset (sun.xz / sun.y) * y.
          const p = vec3(ground.x.add(sun.x.div(sunY).mul(y)), y, ground.y.add(sun.z.div(sunY).mul(y)))
          tau.addAssign(field.density(p, base, thickness, coverage, kind).mul(thickness.div(tapsF)).mul(CUMULUS_SIGMA))
        })
      })
    })
    const t = exp(tau.negate()).toVar()
    // Fade to 1 over the outer MAP_FADE_M so the clamp beyond the map is invisible.
    const edge = min(min(uv().x, uv().y), min(float(1).sub(uv().x), float(1).sub(uv().y))).mul(MAP_SIDE_M)
    const fade = smoothstep(0, MAP_FADE_M, edge)
    const out = float(1).sub(float(1).sub(t).mul(fade))
    return vec4(out, out, out, 1)
  })()
  const scene = new Scene()
  const quad = new Mesh(new PlaneGeometry(2, 2), material)
  quad.frustumCulled = false
  scene.add(quad)
  // A fixed identity view of the clip square. It MUST NOT be moved to the
  // map center (a camera 40 km from its quad renders nothing); the map's
  // world placement is entirely `mapOrigin`.
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)

  // ---- the lookup ---------------------------------------------------------
  const map = texture(target.texture)
  const node = (position: Node<'vec3'>, frame: 'eyeRelative' | 'world'): Node<'float'> =>
    Fn(() => {
      // `positionWorld` is eye-relative under camera-relative rendering
      // (scene.position = -eye, main.ts); a material that already has a true
      // world position passes 'world' and skips the add.
      const world = (frame === 'eyeRelative' ? position.add(field.eyeWorld) : position).toVar()
      const sun = normalize(sunDirectionNode).toVar()
      const sunY = max(sun.y, float(SHADOW_MIN_SUN_Y)).toVar()
      const ground = world.xz.sub(vec2(sun.x, sun.z).div(sunY).mul(world.y))
      const st = ground.sub(mapOrigin).div(MAP_SIDE_M)
      const sampled = map.sample(st).r
      // Above the lowest cumulus deck nothing shadows; one deck per shipped
      // scenario, so this is exact today (design §3, limitation recorded).
      const aboveDeck = smoothstep(deckBase, deckTop, world.y)
      const t = max(sampled, aboveDeck)
      // `enabledU` is 0 for a clear sky or `?cloudShadow=off`: constant 1.
      return clamp(float(1).sub(float(1).sub(t).mul(enabledU)), 0, 1)
    })()

  const center = { x: 0, z: 0 }
  return {
    node,
    enabled,
    showing: enabled && mode === 'show',
    target, scene, camera,
    get taps() { return taps.value },
    centerXZ: () => ({ ...center }),
    setTier(name: CloudTierName): void { taps.value = SHADOW_TIERS[name].taps },
    async readAt(renderer: WebGPURenderer, x: number, z: number): Promise<number | null> {
      if (!enabled) return null
      const sx = (x - mapOrigin.value.x) / MAP_SIDE_M
      const sy = (z - mapOrigin.value.y) / MAP_SIDE_M
      if (sx < 0 || sx >= 1 || sy < 0 || sy >= 1) return null
      // Sampler coordinates and the copy origin both count rows from the
      // texture's first row, so this is the texel `map.sample(st)` reads.
      // Four texels, not one: a 1-byte copy of an r8 texture fails WebGPU's
      // mapAsync alignment ("Size (1) must be a multiple of 4", 2026-09-19).
      const px = Math.min(MAP_TEXELS - 4, Math.floor(sx * MAP_TEXELS))
      const py = Math.min(MAP_TEXELS - 1, Math.floor(sy * MAP_TEXELS))
      const data = await renderer.readRenderTargetPixelsAsync(target, px, py, 4, 1)
      return (data[0] ?? 0) / 255
    },
    update(eye: Vec3): void {
      const c = snapToTexel(eye.x, eye.z)
      center.x = c.x
      center.z = c.z
      mapOrigin.value.set(c.x - MAP_SIDE_M / 2, c.z - MAP_SIDE_M / 2)
    },
    dispose(): void {
      target.dispose()
      quad.geometry.dispose()
      material.dispose()
    },
  }
}
