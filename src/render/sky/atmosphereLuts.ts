import {
  ClampToEdgeWrapping, DataUtils, HalfFloatType, LinearFilter, Matrix4, Mesh, OrthographicCamera, PlaneGeometry, RGBAFormat,
  RenderTarget, Scene, Vector3, Vector4, type Camera, type Texture,
} from 'three'
import { MeshBasicNodeMaterial, type Node, type WebGPURenderer } from 'three/webgpu'
import {
  Fn, Loop, abs, acos, asin, clamp, cos, exp, float, floor, int, length, max, min, mix, normalize, select, sin, smoothstep, sqrt,
  texture, uniform, uv, vec2, vec3, vec4,
} from 'three/tsl'
import type { Vec3 } from '../../sim/math/vec3.js'
import { FOG_DISTANCE_M } from '../horizon.js'
import {
  ATMOSPHERE, MULTI_SCATTERING_DIRECTIONS, MULTI_SCATTERING_LUT_SIZE, MULTI_SCATTERING_STEPS, SUN_FADE_BELOW_HORIZON_DEG,
  TRANSMITTANCE_LUT_HEIGHT, TRANSMITTANCE_LUT_WIDTH, transmittanceLutUv, type Rgb,
} from './atmosphere.js'

/**
 * The Hillaire 2020 atmosphere LUTs on the GPU (photoreal render pass,
 * design §4.3). Four full-screen-quad passes into half-float render targets,
 * the `cloudShadow.ts` shape:
 *
 *  - transmittance 256×64, (mu, r) in Bruneton's x_mu/x_r mapping, once;
 *  - multi-scattering Ψms 32×32, (muS, h), once, after transmittance;
 *  - sky-view 192×108, per frame at the eye altitude and sun direction, the
 *    latitude concentrated at the horizon (Hillaire §5.3);
 *  - aerial perspective, 32 depth slices of 32×32 side by side in a 1024×32
 *    atlas, per frame in the camera's frustum (Hillaire §5.4).
 *
 * Every formula mirrors `atmosphere.ts` (the CPU model): the same constants
 * (read from `ATMOSPHERE`, never retyped), the same density profile, the same
 * texel-center LUT mappings, and the same quadratic sample spacing for the
 * transmittance's optical depth. `tests/e2e/atmosphere.spec.ts` reads the
 * transmittance LUT back and holds it to `transmittanceToTop` within 2%.
 *
 * Units are the CPU model's: meters, and light relative to the sun's
 * top-of-atmosphere illuminance = 1 (sky-view and AP hold radiance per unit
 * sun illuminance). Heights above the ground sphere are computed as
 * (r² − R²)/(r + R) from exact terms rather than r − R, which float32 would
 * round to half a meter at 6.36e6 m.
 *
 * One module-level instance (`getAtmosphereLuts`, controller ruling P2):
 * render targets need no renderer to construct, so shaders import the lookup
 * nodes without constructor plumbing; main.ts calls `update` and disposes.
 *
 * Y flip (cloudShadow.ts): a quad's uv.y = 1 edge is texture row 0, which a
 * sampler reads at st.y = 0. Every pass decodes its parameters from
 * st = (uv.x, 1 − uv.y), and every lookup samples at st directly.
 */

const A = ATMOSPHERE
/** Aerial perspective's range: the far fade distance. Pinned equal to
 *  FOG_DISTANCE_M by tests/render/clouds.test.ts. */
export const AP_MAX_DISTANCE_M = FOG_DISTANCE_M

/** DEV-only `?atmosphere=off`: skip the per-frame LUT update, the control
 *  for measuring its cost. Throws on anything else, like `?cloudShadow=`. */
export const ATMOSPHERE_PARAM = 'atmosphere'
export function atmosphereFromQuery(search: string): 'off' | undefined {
  const raw = new URLSearchParams(search).get(ATMOSPHERE_PARAM)
  if (raw === null) return undefined
  if (raw === 'off') return raw
  throw new Error(`${ATMOSPHERE_PARAM}: ${JSON.stringify(raw)} is not an atmosphere mode`)
}

export const SKY_VIEW_WIDTH = 192
export const SKY_VIEW_HEIGHT = 108
export const AP_SLICES = 32
export const AP_SLICE_TEXELS = 32

/** Optical-depth steps per transmittance texel (quadratic spacing). */
export const TRANSMITTANCE_STEPS = 40
/** Steps per sky-view ray (quadratic spacing). */
export const SKY_VIEW_STEPS = 30
/** Steps per aerial-perspective texel, eye to its slice depth (quadratic). */
export const AP_STEPS = 20
/** The sky-view eye is held this far above the ground sphere, as in
 *  Hillaire's PLANET_RADIUS_OFFSET: at exactly 0 every downward ray has zero
 *  length and the row below the horizon reads black. */
export const MIN_EYE_ALTITUDE_M = 10

/** Depth of AP slice k (0-based): ((k+1)/32)² of the range, so near slices
 *  are thin (slice 0 ends at 98 m) and slice 31 ends at the range. */
export function apSliceDepthM(k: number): number {
  const f = (k + 1) / AP_SLICES
  return AP_MAX_DISTANCE_M * f * f
}
/** Continuous slice coordinate of a distance: k at `apSliceDepthM(k)`, below
 *  0 nearer than slice 0, clamped to the last slice beyond the range. */
export function apSliceCoord(distanceM: number): number {
  return Math.sqrt(Math.min(1, Math.max(0, distanceM / AP_MAX_DISTANCE_M))) * AP_SLICES - 1
}

/** Hillaire §5.3's sky-view mapping, texel-center convention (atmosphere.ts
 *  ruling): u = sqrt of the half-angle to the sun's azimuth, v splits at the
 *  geometric horizon with a squared (horizon-dense) coordinate each side. */
export function skyViewLutUv(eyeAltitudeM: number, viewZenithCos: number, lightViewCos: number): [number, number] {
  const h = Math.max(MIN_EYE_ALTITUDE_M, eyeAltitudeM)
  const r = A.bottomRadiusM + h
  const beta = Math.acos(Math.sqrt(h * (2 * A.bottomRadiusM + h)) / r)
  const zha = Math.PI - beta
  const angle = Math.acos(Math.min(1, Math.max(-1, viewZenithCos)))
  const v = angle <= zha ? 0.5 * (1 - Math.sqrt(Math.max(0, 1 - angle / zha))) : 0.5 + 0.5 * Math.sqrt((angle - zha) / beta)
  const u = Math.sqrt(Math.min(1, Math.max(0, 0.5 - 0.5 * lightViewCos)))
  return [toTexelJs(u, SKY_VIEW_WIDTH), toTexelJs(v, SKY_VIEW_HEIGHT)]
}
/** Inverse of `skyViewLutUv`. */
export function skyViewLutParams(eyeAltitudeM: number, u: number, v: number): { viewZenithCos: number; lightViewCos: number } {
  const h = Math.max(MIN_EYE_ALTITUDE_M, eyeAltitudeM)
  const r = A.bottomRadiusM + h
  const beta = Math.acos(Math.sqrt(h * (2 * A.bottomRadiusM + h)) / r)
  const zha = Math.PI - beta
  const xu = fromTexelJs(u, SKY_VIEW_WIDTH), xv = fromTexelJs(v, SKY_VIEW_HEIGHT)
  let angle: number
  if (xv < 0.5) { const c = 1 - 2 * xv; angle = zha * (1 - c * c) } else { const c = 2 * xv - 1; angle = zha + beta * c * c }
  return { viewZenithCos: Math.cos(angle), lightViewCos: 1 - 2 * xu * xu }
}

function toTexelJs(x: number, n: number): number { return 0.5 / n + x * (1 - 1 / n) }
function fromTexelJs(u: number, n: number): number { return (u - 0.5 / n) / (1 - 1 / n) }

export type AtmosphereLutName = 'transmittance' | 'multiScattering' | 'skyView' | 'aerialPerspective'

export type AtmosphereLuts = {
  readonly transmittance: Texture
  readonly multiScattering: Texture
  readonly skyView: Texture
  readonly aerialPerspective: Texture
  /** Sky radiance for a world direction (sampling skyView). */
  skyRadianceNode(dirWorld: Node<'vec3'>): Node<'vec3'>
  /** Aerial perspective at a camera-relative distance along a direction:
   *  rgb = in-scattered light, a = transmittance (mean over rgb). */
  aerialPerspectiveNode(dirWorld: Node<'vec3'>, distanceM: Node<'float'>): Node<'vec4'>
  /** Transmittance from the eye toward the sun, as a node (sunColorAt's
   *  below-horizon fade included). */
  sunTransmittanceNode(): Node<'vec3'>
  update(renderer: WebGPURenderer, eyeAltitudeM: number, sunDirection: Vec3, camera: Camera): void
  /** DEV: the transmittance LUT at (hM, mu), read back from the GPU and
   *  bilinearly filtered exactly as a sampler at `transmittanceLutUv` would. */
  readTransmittance(renderer: WebGPURenderer, hM: number, mu: number): Promise<Rgb>
  /** DEV: one texel of a LUT as stored (rgba), at pixel column `px` and row
   *  `py` counted from the texture's first row, i.e. sampler st = ((px + 0.5)/W,
   *  (py + 0.5)/H). Proves the per-frame LUTs finite and oriented. */
  readTexel(renderer: WebGPURenderer, lut: AtmosphereLutName, px: number, py: number): Promise<readonly [number, number, number, number]>
  dispose(): void
}

// ---------------------------------------------------------------------------
// Shared TSL building blocks. Plain functions returning nodes (inlined into
// each graph), with every constant read from ATMOSPHERE.

type F = Node<'float'>
type V3 = Node<'vec3'>

const R_M = A.bottomRadiusM
const TOP_M = A.topRadiusM
const THICKNESS_M = TOP_M - R_M
/** Distance from the ground to the top along the ground's tangent (Bruneton's H). */
const H_M = Math.sqrt(TOP_M * TOP_M - R_M * R_M)
const RAYLEIGH = (): V3 => vec3(A.rayleighScattering[0], A.rayleighScattering[1], A.rayleighScattering[2])
const OZONE = (): V3 => vec3(A.ozoneAbsorption[0], A.ozoneAbsorption[1], A.ozoneAbsorption[2])

const toTexel = (x: F, n: number): F => float(0.5 / n).add(x.mul(1 - 1 / n))
const fromTexel = (u: F, n: number): F => u.sub(0.5 / n).div(1 - 1 / n)

/** Relative densities (rayleigh, mie, ozone) at altitude h: densityAt. */
function density(h: F): V3 {
  const hh = max(h, 0)
  return vec3(
    exp(hh.negate().div(A.rayleighScaleHeightM)),
    exp(hh.negate().div(A.mieScaleHeightM)),
    max(float(0), float(1).sub(abs(hh.sub(A.ozoneCenterM)).div(A.ozoneHalfWidthM))),
  )
}
/** extinctionAt, from a density triple. */
const extinctionOf = (d: V3): V3 =>
  RAYLEIGH().mul(d.x).add(vec3(float(A.mieScattering + A.mieAbsorption).mul(d.y))).add(OZONE().mul(d.z))
/** Rayleigh scattering per meter (vec3) and Mie scattering (float), scatteringAt. */
const rayleighScatteringOf = (d: V3): V3 => RAYLEIGH().mul(d.x)
const mieScatteringOf = (d: V3): F => float(A.mieScattering).mul(d.y)

/** r² − R² for altitude h, without cancellation. */
const rhoSq = (h: F): F => h.mul(h.add(2 * R_M))

/** distanceToTopBoundary(r, mu) for r = R + h. (TOP² − r²) is formed as
 *  (thickness − h)(TOP + r); for mu ≥ 0 the root is rationalized so the
 *  result is never a difference of two 6e6-sized numbers. */
function distanceToTop(h: F, mu: F): F {
  const r = h.add(R_M)
  const topMinusRSq = float(THICKNESS_M).sub(h).mul(r.add(TOP_M))
  const rmu = r.mul(mu)
  const root = sqrt(max(float(0), topMinusRSq.add(rmu.mul(rmu))))
  return max(float(0), select(mu.greaterThanEqual(0), topMinusRSq.div(max(rmu.add(root), 1e-3)), root.sub(rmu)))
}
/** rayIntersectsGround(r, mu): mu < 0 and r²mu² ≥ r² − R². */
function intersectsGround(h: F, mu: F): Node<'bool'> {
  const rmu = h.add(R_M).mul(mu)
  return mu.lessThan(0).and(rmu.mul(rmu).greaterThanEqual(rhoSq(h)))
}
/** distanceToBottomBoundary(r, mu), rationalized: (r² − R²)/(−r·mu + root). */
function distanceToBottom(h: F, mu: F): F {
  const rmu = h.add(R_M).mul(mu)
  const root = sqrt(max(float(0), rmu.mul(rmu).sub(rhoSq(h))))
  return rhoSq(h).div(max(rmu.negate().add(root), 1e-3))
}
/** Height above the ground at distance t along (h, mu): ((r²−R²) + 2r·mu·t + t²)/(r_t + R). */
function heightAlong(h: F, mu: F, t: F): F {
  const r = h.add(R_M)
  const num = rhoSq(h).add(r.mul(mu).mul(t).mul(2)).add(t.mul(t))
  const rt = sqrt(max(float(R_M * R_M * 0.25), num.add(R_M * R_M)))
  return num.div(rt.add(R_M))
}

/** transmittanceLutUv as a node: sampler coordinates of (h, mu). */
function transmittanceUv(h: F, mu: F): Node<'vec2'> {
  const hc = clamp(h, 0, THICKNESS_M)
  const r = hc.add(R_M)
  const rho = sqrt(max(float(0), rhoSq(hc)))
  const d = distanceToTop(hc, mu)
  const dMin = float(TOP_M).sub(r)
  const dMax = rho.add(H_M)
  const xMu = clamp(d.sub(dMin).div(max(dMax.sub(dMin), 1e-3)), 0, 1)
  return vec2(toTexel(xMu, TRANSMITTANCE_LUT_WIDTH), toTexel(rho.div(H_M), TRANSMITTANCE_LUT_HEIGHT))
}
/** multiScatteringLutUv as a node. */
function multiScatteringUv(h: F, muS: F): Node<'vec2'> {
  return vec2(
    toTexel(clamp(muS.mul(0.5).add(0.5), 0, 1), MULTI_SCATTERING_LUT_SIZE),
    toTexel(clamp(h.div(THICKNESS_M), 0, 1), MULTI_SCATTERING_LUT_SIZE),
  )
}

// Phase functions (rayleighPhase, cornetteShanksPhase).
const rayleighPhaseOf = (c: F): F => float(3 / (16 * Math.PI)).mul(c.mul(c).add(1))
function cornetteShanksOf(c: F): F {
  const g = A.mieG, g2 = g * g
  const k = (3 / (8 * Math.PI)) * (1 - g2) / (2 + g2)
  const denom = max(float(1 + g2).sub(c.mul(2 * g)), 1e-9)
  return float(k).mul(c.mul(c).add(1)).div(denom.mul(sqrt(denom)))
}

function lutTarget(width: number, height: number): RenderTarget {
  return new RenderTarget(width, height, {
    format: RGBAFormat, type: HalfFloatType, depthBuffer: false, stencilBuffer: false,
    minFilter: LinearFilter, magFilter: LinearFilter, wrapS: ClampToEdgeWrapping, wrapT: ClampToEdgeWrapping, generateMipmaps: false,
  })
}

/** Cast for `Loop`'s `name` (honoured at runtime, absent from the types; cloudShadow.ts). */
type LoopParams = Parameters<typeof Loop>[0]
const loopOf = (end: number | Node<'int'>, name: string): LoopParams =>
  ({ start: int(0), end, type: 'int', condition: '<', name }) as unknown as LoopParams
const counter = (inputs: unknown, name: string): Node<'int'> => (inputs as Record<string, Node<'int'>>)[name]!

// ---------------------------------------------------------------------------

export function createAtmosphereLuts(): AtmosphereLuts {
  const transmittanceTarget = lutTarget(TRANSMITTANCE_LUT_WIDTH, TRANSMITTANCE_LUT_HEIGHT)
  const multiScatteringTarget = lutTarget(MULTI_SCATTERING_LUT_SIZE, MULTI_SCATTERING_LUT_SIZE)
  const skyViewTarget = lutTarget(SKY_VIEW_WIDTH, SKY_VIEW_HEIGHT)
  const apTarget = lutTarget(AP_SLICES * AP_SLICE_TEXELS, AP_SLICE_TEXELS)

  const transmittanceTex = texture(transmittanceTarget.texture)
  const multiScatteringTex = texture(multiScatteringTarget.texture)
  const skyViewTex = texture(skyViewTarget.texture)
  const apTex = texture(apTarget.texture)
  // `level(0)`: no mips, and textureSampleLevel is legal in the non-uniform
  // control flow of a march (textureSample is not, in WGSL).
  const sampleTransmittance = (h: F, mu: F): V3 => transmittanceTex.sample(transmittanceUv(h, mu)).level(float(0)).rgb
  /** sunTransmittanceAt: the LUT, 0 in the planet's shadow. */
  const sunTransmittance = (h: F, muS: F): V3 => sampleTransmittance(h, muS).mul(select(intersectsGround(h, muS), float(0), float(1)))
  const samplePsi = (h: F, muS: F): V3 => multiScatteringTex.sample(multiScatteringUv(h, muS)).level(float(0)).rgb

  // Per-frame state.
  const eyeAltitude = uniform(MIN_EYE_ALTITUDE_M)
  const sunDir = uniform(new Vector3(0, 1, 0))
  /** Camera world rotation (translation zeroed) for the AP pass, and its inverse for the lookup. */
  const camRotation = uniform(new Matrix4())
  const camRotationInverse = uniform(new Matrix4())
  /** The frustum's extents on the view-space z = −1 plane: (left, right, bottom, top). */
  const frustum = uniform(new Vector4(-1, 1, -1, 1))

  const st = (): Node<'vec2'> => vec2(uv().x, float(1).sub(uv().y))

  // ---- transmittance: optical depth to the top in quadratic steps ----------
  const transmittanceMaterial = new MeshBasicNodeMaterial()
  transmittanceMaterial.fragmentNode = Fn(() => {
    const s = st().toVar()
    const xMu = fromTexel(s.x, TRANSMITTANCE_LUT_WIDTH).toVar()
    const xR = fromTexel(s.y, TRANSMITTANCE_LUT_HEIGHT).toVar()
    // transmittanceLutParams.
    const rho = xR.mul(H_M).toVar()
    const rhoSqV = rho.mul(rho).toVar()
    const r = sqrt(rhoSqV.add(R_M * R_M)).toVar()
    const h = rhoSqV.div(r.add(R_M)).toVar()
    const dMin = float(TOP_M).sub(r)
    const dMax = rho.add(H_M)
    const d = dMin.add(xMu.mul(dMax.sub(dMin))).toVar()
    const mu = clamp(select(d.lessThanEqual(0), float(1), float(H_M * H_M).sub(rhoSqV).sub(d.mul(d)).div(r.mul(d).mul(2))), -1, 1).toVar()
    const tau = vec3(0).toVar()
    const n = TRANSMITTANCE_STEPS
    Loop(loopOf(n, 'i'), (inputs) => {
      const x = counter(inputs, 'i').toFloat().add(0.5).div(n)
      const t = d.mul(x).mul(x)
      const w = d.mul(x).mul(2 / n)
      tau.addAssign(extinctionOf(density(heightAlong(h, mu, t))).mul(w))
    })
    return vec4(exp(tau.negate()), 1)
  })()

  // ---- multi-scattering Ψms (multipleScatteringPsi) -------------------------
  const msMaterial = new MeshBasicNodeMaterial()
  msMaterial.fragmentNode = Fn(() => {
    const s = st().toVar()
    const muS = fromTexel(s.x, MULTI_SCATTERING_LUT_SIZE).mul(2).sub(1).toVar()
    const h = fromTexel(s.y, MULTI_SCATTERING_LUT_SIZE).mul(THICKNESS_M).toVar()
    const sun = vec3(sqrt(max(float(0), float(1).sub(muS.mul(muS)))), muS, 0).toVar()
    const r = h.add(R_M).toVar()
    const isotropic = 1 / (4 * Math.PI)
    const nSide = Math.round(Math.sqrt(MULTI_SCATTERING_DIRECTIONS))
    const N = nSide * nSide
    const steps = MULTI_SCATTERING_STEPS
    const L2 = vec3(0).toVar()
    const fms = vec3(0).toVar()
    Loop(loopOf(N, 'k'), (inputs) => {
      const k = counter(inputs, 'k')
      // sphereDirection(k, 8).
      const kf = k.toFloat().toVar()
      const j = floor(kf.div(nSide)).toVar()
      const i = kf.sub(j.mul(nSide))
      const phi = i.add(0.5).mul(2 * Math.PI / nSide)
      const cosT = float(1).sub(j.add(0.5).mul(2 / nSide)).toVar()
      const sinT = sqrt(max(float(0), float(1).sub(cosT.mul(cosT))))
      const dir = vec3(sinT.mul(cos(phi)), cosT, sinT.mul(sin(phi))).toVar()
      const mu = dir.y // origin (0, r, 0)
      const ground = intersectsGround(h, mu).toVar()
      const dist = select(ground, distanceToBottom(h, mu), distanceToTop(h, mu)).toVar()
      const dt = dist.div(steps).toVar()
      const T = vec3(1).toVar()
      Loop(loopOf(steps, 's'), (inner) => {
        const t = counter(inner, 's').toFloat().add(0.5).mul(dt).toVar()
        const hp = heightAlong(h, mu, t).toVar()
        const rp = hp.add(R_M)
        // mu of the sun at p = (dir.x t, r + dir.y t, dir.z t).
        const muSp = dir.x.mul(t).mul(sun.x).add(r.add(dir.y.mul(t)).mul(sun.y)).div(rp).toVar()
        const dens = density(hp).toVar()
        const ext = max(extinctionOf(dens), vec3(1e-12)).toVar()
        const scat = rayleighScatteringOf(dens).add(vec3(mieScatteringOf(dens))).toVar()
        const stepT = exp(ext.negate().mul(dt)).toVar()
        const integ = vec3(1).sub(stepT).div(ext).toVar()
        L2.addAssign(T.mul(scat).mul(isotropic).mul(sunTransmittance(hp, muSp)).mul(integ))
        fms.addAssign(T.mul(scat).mul(integ))
        T.mulAssign(stepT)
      })
      // The ground's Lambertian bounce, lit by the transmitted sun.
      const gx = dir.x.mul(dist), gy = r.add(dir.y.mul(dist))
      const rg = sqrt(gx.mul(gx).add(gy.mul(gy)).add(dir.z.mul(dist).mul(dir.z.mul(dist))))
      const cosSun = max(float(0), gx.mul(sun.x).add(gy.mul(sun.y)).div(rg)).toVar()
      const groundLight = T.mul(sunTransmittance(float(0), cosSun)).mul(cosSun).mul(A.groundAlbedo / Math.PI)
      L2.addAssign(select(ground, groundLight, vec3(0)))
    })
    const psi = L2.div(N).div(vec3(1).sub(min(fms.div(N), vec3(0.99))))
    return vec4(psi, 1)
  })()

  /** Single + multiple in-scattering source at a march point: S per channel. */
  const inScatter = (hp: F, muSp: F, pR: F, pM: F): V3 => {
    const dens = density(hp)
    const rayl = rayleighScatteringOf(dens)
    const mie = mieScatteringOf(dens)
    const single = rayl.mul(pR).add(vec3(mie.mul(pM))).mul(sunTransmittance(hp, muSp))
    return single.add(rayl.add(vec3(mie)).mul(samplePsi(hp, muSp)))
  }

  /** Integrates in-scattered radiance and throughput along a ray from the eye
   *  (altitude h) with local-zenith cosine mu, over [0, dist], in `n`
   *  quadratic midpoint steps (t = d·x², segment d(2i+1)/n²), Hillaire's
   *  energy-conserving per-step integral. */
  const march = (h: F, mu: F, dir: V3, sun: V3, dist: F, n: number): { L: V3; T: V3 } => {
    const cosTheta = dir.dot(sun).toVar()
    const pR = rayleighPhaseOf(cosTheta).toVar()
    const pM = cornetteShanksOf(cosTheta).toVar()
    const r = h.add(R_M).toVar()
    const L = vec3(0).toVar()
    const T = vec3(1).toVar()
    Loop(loopOf(n, 'm'), (inputs) => {
      const i = counter(inputs, 'm').toFloat()
      const x = i.add(0.5).div(n)
      const t = dist.mul(x).mul(x).toVar()
      const dt = dist.mul(i.mul(2).add(1)).div(n * n).toVar()
      const hp = heightAlong(h, mu, t).toVar()
      const rp = hp.add(R_M)
      // The eye is at (0, r, 0) with the local zenith +y.
      const muSp = dir.x.mul(t).mul(sun.x).add(r.add(dir.y.mul(t)).mul(sun.y)).add(dir.z.mul(t).mul(sun.z)).div(rp).toVar()
      const ext = max(extinctionOf(density(hp)), vec3(1e-12)).toVar()
      const stepT = exp(ext.negate().mul(dt)).toVar()
      L.addAssign(T.mul(inScatter(hp, muSp, pR, pM)).mul(vec3(1).sub(stepT)).div(ext))
      T.mulAssign(stepT)
    })
    return { L, T }
  }

  // ---- sky-view (192×108), per frame ---------------------------------------
  const skyViewMaterial = new MeshBasicNodeMaterial()
  skyViewMaterial.fragmentNode = Fn(() => {
    const s = st().toVar()
    const xu = fromTexel(s.x, SKY_VIEW_WIDTH).toVar()
    const xv = fromTexel(s.y, SKY_VIEW_HEIGHT).toVar()
    const h = eyeAltitude.toVar()
    const r = h.add(R_M)
    const beta = acos(sqrt(rhoSq(h)).div(r)).toVar()
    const zha = float(Math.PI).sub(beta).toVar()
    const cUp = float(1).sub(xv.mul(2))
    const cDown = xv.mul(2).sub(1)
    const angle = select(xv.lessThan(0.5), zha.mul(float(1).sub(cUp.mul(cUp))), zha.add(beta.mul(cDown.mul(cDown)))).toVar()
    const lightViewCos = float(1).sub(xu.mul(xu).mul(2)).toVar()
    const sinZ = sin(angle)
    const lightViewSin = sqrt(max(float(0), float(1).sub(lightViewCos.mul(lightViewCos))))
    const dir = vec3(sinZ.mul(lightViewCos), cos(angle), sinZ.mul(lightViewSin)).toVar()
    // The sun in the same frame: azimuth 0, zenith cosine = its world y.
    const muS = clamp(normalize(sunDir).y, -1, 1).toVar()
    const sun = vec3(sqrt(max(float(0), float(1).sub(muS.mul(muS)))), muS, 0).toVar()
    const mu = dir.y
    const dist = select(intersectsGround(h, mu), distanceToBottom(h, mu), distanceToTop(h, mu)).toVar()
    const { L } = march(h, mu, dir, sun, dist, SKY_VIEW_STEPS)
    return vec4(L, 1)
  })()

  // ---- aerial perspective (32 slices × 32×32), per frame --------------------
  const apMaterial = new MeshBasicNodeMaterial()
  apMaterial.fragmentNode = Fn(() => {
    const s = st().toVar()
    const col = floor(s.x.mul(AP_SLICES * AP_SLICE_TEXELS)).toVar()
    const slice = floor(col.div(AP_SLICE_TEXELS)).toVar()
    const fx = col.sub(slice.mul(AP_SLICE_TEXELS)).div(AP_SLICE_TEXELS - 1)
    const fy = floor(s.y.mul(AP_SLICE_TEXELS)).div(AP_SLICE_TEXELS - 1)
    const sliceF = slice.add(1).div(AP_SLICES)
    const depth = sliceF.mul(sliceF).mul(AP_MAX_DISTANCE_M).toVar()
    const viewDir = vec3(mix(frustum.x, frustum.y, fx), mix(frustum.z, frustum.w, fy), -1)
    const dir = normalize(camRotation.mul(vec4(viewDir, 0)).xyz).toVar()
    const h = eyeAltitude.toVar()
    const mu = dir.y
    const boundary = select(intersectsGround(h, mu), distanceToBottom(h, mu), distanceToTop(h, mu))
    const dist = min(depth, boundary).toVar()
    const sun = normalize(sunDir).toVar()
    const { L, T } = march(h, mu, dir, sun, dist, AP_STEPS)
    return vec4(L, T.x.add(T.y).add(T.z).div(3))
  })()

  const quad = new PlaneGeometry(2, 2)
  const passes = [transmittanceMaterial, msMaterial, skyViewMaterial, apMaterial].map((material) => {
    const scene = new Scene()
    const mesh = new Mesh(quad, material)
    mesh.frustumCulled = false
    scene.add(mesh)
    return scene
  })
  const [transmittanceScene, msScene, skyViewScene, apScene] = passes as [Scene, Scene, Scene, Scene]
  // A fixed identity view of the clip square (cloudShadow.ts).
  const quadCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)

  const renderPass = (renderer: WebGPURenderer, target: RenderTarget, scene: Scene): void => {
    renderer.setRenderTarget(target)
    renderer.render(scene, quadCamera)
  }
  let staticRendered = false
  const renderStatic = (renderer: WebGPURenderer): void => {
    if (staticRendered) return
    const previous = renderer.getRenderTarget()
    renderPass(renderer, transmittanceTarget, transmittanceScene)
    renderPass(renderer, multiScatteringTarget, msScene)
    renderer.setRenderTarget(previous)
    staticRendered = true
  }

  // ---- lookups --------------------------------------------------------------
  const skyRadianceNode = (dirWorld: Node<'vec3'>): Node<'vec3'> => Fn(() => {
    const d = normalize(dirWorld).toVar()
    const sun = normalize(sunDir).toVar()
    const h = eyeAltitude.toVar()
    const r = h.add(R_M)
    const beta = acos(sqrt(rhoSq(h)).div(r)).toVar()
    const zha = float(Math.PI).sub(beta).toVar()
    const angle = acos(clamp(d.y, -1, 1)).toVar()
    const vUp = float(0.5).mul(float(1).sub(sqrt(max(float(0), float(1).sub(angle.div(zha))))))
    const vDown = float(0.5).add(float(0.5).mul(sqrt(max(float(0), angle.sub(zha).div(beta)))))
    const v = select(angle.lessThanEqual(zha), vUp, vDown)
    // Cosine of the azimuth between the view and the sun; 1 where either is vertical.
    const dh = vec2(d.x, d.z), sh = vec2(sun.x, sun.z)
    const lenProduct = length(dh).mul(length(sh))
    const lightViewCos = select(lenProduct.greaterThan(1e-6), clamp(dh.dot(sh).div(max(lenProduct, 1e-6)), -1, 1), float(1))
    const u = sqrt(clamp(float(0.5).sub(lightViewCos.mul(0.5)), 0, 1))
    return skyViewTex.sample(vec2(toTexel(u, SKY_VIEW_WIDTH), toTexel(v, SKY_VIEW_HEIGHT))).level(float(0)).rgb
  })()

  const aerialPerspectiveNode = (dirWorld: Node<'vec3'>, distanceM: Node<'float'>): Node<'vec4'> => Fn(() => {
    const v = camRotationInverse.mul(vec4(normalize(dirWorld), 0)).xyz.toVar()
    const z = max(v.z.negate(), 1e-4)
    const fx = clamp(v.x.div(z).sub(frustum.x).div(frustum.y.sub(frustum.x)), 0, 1)
    const fy = clamp(v.y.div(z).sub(frustum.z).div(frustum.w.sub(frustum.z)), 0, 1)
    const localU = toTexel(fx, AP_SLICE_TEXELS).toVar()
    const localV = toTexel(fy, AP_SLICE_TEXELS).toVar()
    // apSliceCoord.
    const sc = sqrt(clamp(distanceM.div(AP_MAX_DISTANCE_M), 0, 1)).mul(AP_SLICES).sub(1).toVar()
    const s0 = clamp(floor(sc), 0, AP_SLICES - 1).toVar()
    const s1 = min(s0.add(1), AP_SLICES - 1)
    const f = clamp(sc.sub(s0), 0, 1)
    const a = apTex.sample(vec2(s0.add(localU).div(AP_SLICES), localV)).level(float(0))
    const b = apTex.sample(vec2(s1.add(localU).div(AP_SLICES), localV)).level(float(0))
    const inside = mix(a, b, f)
    // Nearer than slice 0: fade from no atmosphere at the eye.
    return mix(vec4(0, 0, 0, 1), inside, clamp(sc.add(1), 0, 1))
  })()

  const sunTransmittanceNode = (): Node<'vec3'> => Fn(() => {
    const h = eyeAltitude.toVar()
    const mu = clamp(normalize(sunDir).y, -1, 1).toVar()
    // sunColorAt: the LUT clamps a below-horizon ray to the tangent ray; fade
    // it out over SUN_FADE_BELOW_HORIZON_DEG below the local horizon.
    const horizonMu = sqrt(rhoSq(h)).div(h.add(R_M)).negate()
    const deg = 180 / Math.PI
    const horizonDeg = asin(horizonMu).mul(deg).toVar()
    const fade = smoothstep(horizonDeg.sub(SUN_FADE_BELOW_HORIZON_DEG), horizonDeg, asin(mu).mul(deg))
    return sampleTransmittance(h, mu).mul(select(intersectsGround(h, mu), fade, float(1)))
  })()

  const rotation = new Matrix4()
  const corner = new Vector3()
  return {
    transmittance: transmittanceTarget.texture,
    multiScattering: multiScatteringTarget.texture,
    skyView: skyViewTarget.texture,
    aerialPerspective: apTarget.texture,
    skyRadianceNode,
    aerialPerspectiveNode,
    sunTransmittanceNode,
    update(renderer, eyeAltitudeM, sunDirection, camera): void {
      eyeAltitude.value = Math.min(THICKNESS_M - 1, Math.max(MIN_EYE_ALTITUDE_M, eyeAltitudeM))
      sunDir.value.set(sunDirection.x, sunDirection.y, sunDirection.z)
      camera.updateMatrixWorld()
      rotation.extractRotation(camera.matrixWorld)
      camRotation.value.copy(rotation)
      camRotationInverse.value.copy(rotation).transpose()
      // The frustum's corners on the z = −1 plane, from the inverse projection
      // (any depth inside the frustum; 0.5 is inside for normal and reversed z).
      corner.set(-1, -1, 0.5).applyMatrix4(camera.projectionMatrixInverse)
      const l = corner.x / -corner.z, b = corner.y / -corner.z
      corner.set(1, 1, 0.5).applyMatrix4(camera.projectionMatrixInverse)
      frustum.value.set(l, corner.x / -corner.z, b, corner.y / -corner.z)
      const previous = renderer.getRenderTarget()
      renderStatic(renderer)
      renderPass(renderer, skyViewTarget, skyViewScene)
      renderPass(renderer, apTarget, apScene)
      renderer.setRenderTarget(previous)
    },
    async readTransmittance(renderer, hM, mu): Promise<Rgb> {
      renderStatic(renderer)
      const [u, v] = transmittanceLutUv(hM, mu)
      // Bilinear filtering by hand at the sampler's texel convention: the
      // four texels around (u, v), weighted exactly as LinearFilter would.
      const W = TRANSMITTANCE_LUT_WIDTH, H = TRANSMITTANCE_LUT_HEIGHT
      const x = u * W - 0.5, y = v * H - 0.5
      const x0 = Math.min(W - 2, Math.max(0, Math.floor(x))), y0 = Math.min(H - 2, Math.max(0, Math.floor(y)))
      const fx = Math.min(1, Math.max(0, x - x0)), fy = Math.min(1, Math.max(0, y - y0))
      // A 4-texel-wide window (cloudShadow.ts's alignment rule), two rows.
      // Copy origin rows count from the texture's first row, as st.y does.
      const px = Math.min(W - 4, x0)
      const data = await renderer.readRenderTargetPixelsAsync(transmittanceTarget, px, y0, 4, 2) as Uint16Array
      // Rows are padded to 256 bytes = 128 half floats.
      const rowStride = 128
      const at = (col: number, row: number, c: number): number => DataUtils.fromHalfFloat(data[row * rowStride + (col - px) * 4 + c]!)
      const channel = (c: number): number =>
        (at(x0, 0, c) * (1 - fx) + at(x0 + 1, 0, c) * fx) * (1 - fy) + (at(x0, 1, c) * (1 - fx) + at(x0 + 1, 1, c) * fx) * fy
      return [channel(0), channel(1), channel(2)]
    },
    async readTexel(renderer, lut, px, py) {
      renderStatic(renderer)
      const target = { transmittance: transmittanceTarget, multiScattering: multiScatteringTarget, skyView: skyViewTarget, aerialPerspective: apTarget }[lut]
      const x = Math.min(target.width - 4, Math.max(0, Math.floor(px)))
      const y = Math.min(target.height - 1, Math.max(0, Math.floor(py)))
      const data = await renderer.readRenderTargetPixelsAsync(target, x, y, 4, 1) as Uint16Array
      const o = (Math.floor(px) - x) * 4
      const at = (c: number): number => DataUtils.fromHalfFloat(data[o + c]!)
      return [at(0), at(1), at(2), at(3)] as const
    },
    dispose(): void {
      for (const t of [transmittanceTarget, multiScatteringTarget, skyViewTarget, apTarget]) t.dispose()
      quad.dispose()
      for (const m of [transmittanceMaterial, msMaterial, skyViewMaterial, apMaterial]) m.dispose()
    },
  }
}

let instance: AtmosphereLuts | null = null
/** The one set of LUTs (controller ruling P2). Created on first use. */
export function getAtmosphereLuts(): AtmosphereLuts {
  instance ??= createAtmosphereLuts()
  return instance
}
/** main.ts's teardown: dispose the instance if one was created. */
export function disposeAtmosphereLuts(): void {
  instance?.dispose()
  instance = null
}
