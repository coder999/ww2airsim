import {
  ClampToEdgeWrapping, LinearFilter, Mesh, OrthographicCamera, PlaneGeometry, RedFormat, RenderTarget, Scene,
  UnsignedByteType, Vector2,
} from 'three'
import { MeshBasicNodeMaterial, type Node } from 'three/webgpu'
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
 * whose fragment integrates the SAME cloud density the dome marches
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

/** Horizontal offset from a point at height y to the sea-level point on the
 *  same sun ray: exact for a directional sun, so one sea-level map serves
 *  every height. */
export function sunParallaxXZ(sun: { x: number; y: number; z: number }, y: number): { x: number; z: number } {
  return { x: (-sun.x / sun.y) * y + 0, z: (-sun.z / sun.y) * y + 0 }
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
    // uv (0,0) is the map's minimum corner; the quad fills the clip square.
    const ground = mapOrigin.add(uv().mul(MAP_SIDE_M)).toVar()
    const sun = normalize(sunDirectionNode).toVar()
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
          const p = vec3(ground.x.add(sun.x.div(sun.y).mul(y)), y, ground.y.add(sun.z.div(sun.y).mul(y)))
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
      const ground = world.xz.sub(vec2(sun.x, sun.z).div(sun.y).mul(world.y))
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
