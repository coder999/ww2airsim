import {
  ClampToEdgeWrapping, LinearFilter, Mesh, MeshBasicMaterial, OrthographicCamera, PlaneGeometry, RenderTarget,
  Scene, UnsignedByteType, Vector2, type Object3D,
} from 'three'
import { MeshBasicNodeMaterial, type Node, type WebGPURenderer } from 'three/webgpu'
import { Fn, If, Loop, atan, cos, float, int, length, max, sin, smoothstep, uniform, uniformArray, uv, vec2, vec3, vec4 } from 'three/tsl'
import { MAX_RADAR_CONTACTS, RADAR_FADE_FLOOR, type RadarContact } from '../radar.js'

/**
 * The radar scope's own offscreen render (Plan 17, design:
 * docs/superpowers/specs/2026-09-23-radar-design.md §3). A small
 * `RenderTarget` painted by one quad pass, the same shape
 * `cloudShadow.ts` uses for its own camera-independent map -- deliberately,
 * so "did the math paint the right pixel" is provable with a direct
 * readback (`readAt`) rather than inferred from a screenshot that happens
 * to look right. That is the exact lesson the cloud-shadow mirroring
 * incident (2026-09-19) left behind: a camera-relative map read backwards
 * and no screenshot caught it.
 *
 * Roughly matches the physical `radarFace` mesh's 0.131 x 0.111 m aspect so
 * a circle drawn in UV space is not squashed into an ellipse once mapped
 * onto the mesh.
 */
export const RADAR_TEXELS_X = 128
export const RADAR_TEXELS_Y = 108

const DOT_RADIUS = 0.05
const TRAIL_DIM = 0.55
const GREEN = { r: 0.25, g: 1, b: 0.45 }
const TWO_PI = 2 * Math.PI

/** Bearing/range -> the texel `readAt` reads, using the SAME placement math
 *  the fragment shader paints with. In this raw sampler-row space, bearing 0
 *  (ahead) lands at HIGH `py`, not row 0 -- the fragment shader's own uv.y
 *  flip comment says texture row 0 is where "ahead" would land WITHOUT the
 *  flip, i.e. row 0 is the scope's bottom; +pi/2 (right) lands at high `px`.
 *  Verified against that comment and covered by
 *  `tests/render/radarScope.test.ts`'s orientation invariants. Pure and
 *  pixel-independent, so it's testable without a GPU -- exactly the guard
 *  this shader's one real bug (a doubled uv flip in `readAt`, caught in task
 *  review) had no automated check against. */
export function scopeTexelFor(bearingRad: number, rangeMi: number, selectedRangeMi: number): { px: number; py: number } {
  const localX = Math.sin(bearingRad) * (rangeMi / selectedRangeMi) * 0.5
  const localY = Math.cos(bearingRad) * (rangeMi / selectedRangeMi) * 0.5
  const u = localX + 0.5
  // Sampler space, which is what the copy origin counts in: the shader writes
  // local.y at row (local.y + 0.5) * N (uv.y = 1 is row 0), and the readback
  // origin counts rows from row 0 -- the same convention cloudShadow's readAt
  // hands straight through. Do NOT flip again here; the flip already happened
  // in the fragment shader.
  const v = localY + 0.5
  const px = Math.min(RADAR_TEXELS_X - 4, Math.max(0, Math.floor(u * RADAR_TEXELS_X)))
  const py = Math.min(RADAR_TEXELS_Y - 1, Math.max(0, Math.floor(v * RADAR_TEXELS_Y)))
  return { px, py }
}

export type RadarScopeHandle = {
  readonly target: RenderTarget
  readonly scene: Scene
  readonly camera: OrthographicCamera
  /** Gives `face` this scope's live texture. Call once, at startup. */
  attachTo(face: Object3D): void
  /** Call every frame BEFORE rendering `scene`/`camera` into `target`. */
  update(sweepRad: number, rangeMi: number, contacts: readonly RadarContact[]): void
  /**
   * Diagnostic readback at a given (bearingRad, rangeMi), using the SAME
   * placement math `update`'s shader paints with -- mirrors
   * `cloudShadow.ts`'s `readAt`. `null` if `rangeMi` is outside the
   * currently selected ring (nothing painted there). Returns the green
   * channel, 0..1.
   */
  readAt(renderer: WebGPURenderer, bearingRad: number, rangeMi: number): Promise<number | null>
  dispose(): void
}

export function createRadarScope(): RadarScopeHandle {
  const target = new RenderTarget(RADAR_TEXELS_X, RADAR_TEXELS_Y, {
    type: UnsignedByteType, depthBuffer: false, stencilBuffer: false,
    minFilter: LinearFilter, magFilter: LinearFilter, wrapS: ClampToEdgeWrapping, wrapT: ClampToEdgeWrapping, generateMipmaps: false,
  })

  const sweep = uniform(0)
  const selectedRangeMi = uniform(15)
  // (bearingRad, rangeMi) per slot; rangeMi < 0 is the empty-slot sentinel,
  // skipped by the `cRangeMi.greaterThanEqual(0)` guard below.
  const contactData = uniformArray(
    Array.from({ length: MAX_RADAR_CONTACTS }, () => new Vector2(0, -1)),
    'vec2',
  )
  const contactCount = uniform(0, 'int')

  const material = new MeshBasicNodeMaterial()
  material.colorNode = Fn(() => {
    // Same flip `cloudShadow.ts` needed: a render target's uv.y = 1 edge is
    // texture row 0 under WebGPU (WGSLNodeBuilder.isFlipY() is false), so
    // "ahead" would land at the BOTTOM of the scope without this.
    const local = vec2(uv().x, float(1).sub(uv().y)).sub(0.5).toVar()
    const dist = length(local).mul(2).toVar()
    // atan(y, x): the same clockwise-from-up convention `radar.ts`'s
    // bearing uses (Math.atan2(right, forward)) -- "up" on the scope is
    // local.y, "right" is local.x, matching bearing's own sign.
    const angle = atan(local.x, local.y).toVar()

    // wrapPi ported to TSL: `mod`'s sign behavior differs across GLSL/WGSL
    // and this shader has no headless test to catch a wrap bug, so this
    // uses the same atan(sin, cos) idiom `radar.ts`'s plain-JS `wrapPi`
    // does, which is unambiguous regardless of backend.
    const wrapPiT = (x: Node<'float'>): Node<'float'> => atan(sin(x), cos(x))
    const lagOf = (bearing: Node<'float'>): Node<'float'> => {
      const lag = wrapPiT(sweep.sub(bearing)).toVar()
      If(lag.lessThan(0), () => { lag.addAssign(TWO_PI) })
      return lag
    }
    const brightnessOf = (bearing: Node<'float'>): Node<'float'> =>
      float(RADAR_FADE_FLOOR).add(float(1 - RADAR_FADE_FLOOR).mul(float(1).sub(lagOf(bearing).div(TWO_PI))))

    // The sweep trail: brightest at the current sweep angle, fading over one
    // full 2*pi of angular lag behind it. This alone is the visible "beam" —
    // not a separately drawn line — dimmed relative to a contact dot so a
    // real return still reads brighter than the bare trail.
    const trail = brightnessOf(angle).mul(TRAIL_DIM)

    const dotLevel = float(0).toVar()
    Loop({ start: int(0), end: contactCount, type: 'int', condition: '<' }, ({ i }) => {
      // `uniformArray(..., 'vec2')` is typed `UniformArrayNode<string>` in
      // @types/three 0.186 (clouds.ts hit the same trap for 'vec4'), so the
      // element needs telling it is a vec2. Captured into vars before reuse:
      // TSL re-emits an element lookup at every use (16a handoff trap 3,
      // still true here).
      const c = (contactData.element(i) as unknown as Node<'vec2'>).toVar()
      const cBearing = c.x.toVar()
      const cRangeMi = c.y.toVar()
      If(cRangeMi.greaterThanEqual(0), () => {
        const cLocal = vec2(sin(cBearing), cos(cBearing)).mul(cRangeMi.div(selectedRangeMi)).mul(0.5).toVar()
        const d = length(local.sub(cLocal))
        const intensity = smoothstep(DOT_RADIUS, 0, d).mul(brightnessOf(cBearing))
        dotLevel.assign(max(dotLevel, intensity))
      })
    })

    const level = max(trail, dotLevel).toVar()
    const inCircle = smoothstep(1.02, 0.98, dist)
    const out = vec3(GREEN.r, GREEN.g, GREEN.b).mul(level).mul(inCircle)
    return vec4(out, 1)
  })()

  const scene = new Scene()
  const quad = new Mesh(new PlaneGeometry(2, 2), material)
  quad.frustumCulled = false
  scene.add(quad)
  // A fixed identity view of the clip square, exactly as `cloudShadow.ts`'s
  // quad camera is: it must never move, since the shader's own `sweep`/
  // `contactData` uniforms carry everything that changes frame to frame.
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)

  return {
    target, scene, camera,
    attachTo(face: Object3D): void {
      ;(face as Mesh).material = new MeshBasicMaterial({ map: target.texture })
    },
    update(sweepRad, rangeMi, contacts): void {
      sweep.value = sweepRad
      selectedRangeMi.value = rangeMi
      contactCount.value = contacts.length
      for (let i = 0; i < MAX_RADAR_CONTACTS; i++) {
        const c = contacts[i]
        ;(contactData.array[i] as Vector2).set(c ? c.bearingRad : 0, c ? c.rangeMi : -1)
      }
    },
    async readAt(renderer, bearingRad, rangeMi): Promise<number | null> {
      if (rangeMi > selectedRangeMi.value) return null
      // Four texels wide, not one: a narrower copy fails WebGPU's
      // mapAsync alignment (the exact "Size (1) must be a multiple of 4"
      // trap `cloudShadow.ts`'s `readAt` already hit and documented).
      const { px, py } = scopeTexelFor(bearingRad, rangeMi, selectedRangeMi.value)
      const data = await renderer.readRenderTargetPixelsAsync(target, px, py, 4, 1)
      return (data[1] ?? 0) / 255
    },
    dispose(): void {
      target.dispose()
      quad.geometry.dispose()
      material.dispose()
    },
  }
}
