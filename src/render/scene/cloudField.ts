import { Data3DTexture, DataTexture, LinearFilter, NearestFilter, RedFormat, RGBAFormat, RGFormat, RepeatWrapping, UnsignedByteType, Vector2, Vector3, Vector4 } from 'three'
import type { Node, UniformNode, UniformArrayNode } from 'three/webgpu'
import { Fn, If, abs, clamp, float, floor, fract, max, min, mix, saturate, select, sin, smoothstep, texture, texture3D, uniform, uniformArray, vec3 } from 'three/tsl'
import { MAX_CLOUD_LAYERS, type CloudLayer } from '../../sim/scenario.js'
import type { Vec3 } from '../../sim/math/vec3.js'
import type { SkyNoise } from '../sky/load.js'
import {
  CUMULUS_DIMS, CURL_SIZE, DETAIL_SIZE, SHAPE_SIZE, WEATHER_CELL_REACH, WEATHER_CELL_SPACING_M, WEATHER_FEATURE_STEPS,
  WEATHER_RADIUS_M, WEATHER_SIZE, WEATHER_TILE_M,
} from '../sky/noise.js'

/**
 * The cloud FIELD: the two noise volumes, the weather map (Cloud Fidelity II
 * §3.3), the layer uniforms, the drift, and the density function (design 16a
 * §4). Extracted from the dome on 2026-09-19 for Plan 16b so the shadow pass
 * reads the same function the cloud march reads (a pass since photoreal
 * Task 3, cloudPass.ts) -- one field, two readers, and the shadow cannot
 * disagree with the cloud that casts it. `clouds.ts` keeps the march;
 * `cloudShadow.ts` integrates this along the sun. Nothing here knows about a
 * camera.
 */

/** Metres per repeat of the shape volume: Cloud Fidelity II §3.4's packed
 *  128³ volume spans 20 m per texel. */
export const SHAPE_TILE_M = 2560
/** Metres per repeat of the 64³ detail volume. It is cumulus-only: cirrus
 *  never reads it. Cloud Fidelity II §3.4 deliberately makes this a 40 m
 *  high-frequency erosion tile, with a curl field breaking stationary seams. */
export const DETAIL_TILE_M = 40
/** Curl repeats independently of both volumes and displaces only the
 *  high-frequency detail coordinates, breaking stationary erosion seams. */
export const CURL_TILE_M = 1280
export const CURL_DISPLACEMENT_M = 24
export { WEATHER_TILE_M }
/** Metres over which a cloud's density ramps up from the layer base: the
 *  flat grey base every cloud of a layer shares. */
export const CLOUD_BASE_RAMP_M = 40
/** The shipped weather tile's grid: cells per side and metres per cell. */
const WEATHER_CELLS = Math.round(WEATHER_TILE_M / WEATHER_CELL_SPACING_M)
const WEATHER_CELL_M = WEATHER_TILE_M / WEATHER_CELLS
/** Entries in the coverage -> threshold table, at coverage k / (N - 1) (`skyCoverageTable`). */
export const COVERAGE_TABLE_SIZE = 33

/** Width, in weather-map strength, of the ramp over which a cloud fades in
 *  as the coverage threshold passes its strength. */
export const CLOUD_ALIVE_RAMP = 0.045
/** Archetype column density at which the twin counts a column as cloud. */
export const FOOTPRINT_DENSITY = 0.1

/** How much a cloud grows with its layer's coverage: 1 up to 0.2, 1.5 from
 *  0.65, smoothstep between. Broken decks are bigger, merged cells rather
 *  than more of the same small ones; the 1200 m grid cannot reach them any
 *  other way (plan 2026-09-26-cloud-vdb-coverage). The shader repeats it. */
export function coverageRadiusScale(coverage: number): number {
  const t = Math.min(1, Math.max(0, (coverage - 0.2) / 0.45))
  return 1 + 0.5 * t * t * (3 - 2 * t)
}

/** The archetype's footprint seen from above: 1 where its column reaches
 *  FOOTPRINT_DENSITY, indexed [z * nx + x]. */
export function cumulusFootprint(cumulus: Uint8Array): Uint8Array {
  const [nx, ny, nz] = CUMULUS_DIMS
  const lim = Math.round(FOOTPRINT_DENSITY * 255)
  const out = new Uint8Array(nx * nz)
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    if (cumulus[(z * ny + y) * nx + x]! >= lim) out[z * nx + x] = 1
  }
  return out
}

/** A cloud's shape variant from its strength; the shader repeats it. */
const cloudVariant = (peak: number): number => Math.min(1, Math.max(0, Math.sin(peak * 43.1 + 0.7) * 0.5 + 0.5))

export type SkyCoverageTable = {
  /** Low edge of the alive ramp, per coverage k / (N - 1). */
  readonly thresholds: number[]
  /** The sky fraction with every cloud alive, per entry: the most that
   *  coverage can reach. A layer asking for more gets this. */
  readonly reachable: number[]
}

/**
 * The strength threshold that puts `coverage` of the SKY under cloud (the
 * scenario schema's meaning, src/sim/scenario.ts), for coverage 0, 1/32,
 * ... 1. A CPU twin of the shader's footprint: every `stride`-th texel
 * centre is decoded exactly as `density()` decodes it -- winner and
 * runner-up, the coverage-grown radius, the variant's rotation and scale --
 * and counted as cloud where the archetype's footprint covers it and the
 * cloud is alive. The domain warp is ignored (it moves area, it does not
 * add any). Interpolated within a byte so the threshold is continuous.
 */
export function skyCoverageTable(weather: Uint8Array, footprint: Uint8Array, entries = COVERAGE_TABLE_SIZE, stride = 2): SkyCoverageTable {
  const size = WEATHER_SIZE, plane = size * size * 4, texelM = WEATHER_TILE_M / size
  const [nx, , nz] = CUMULUS_DIMS
  const per = Math.ceil(size / stride)
  const count = per * per
  const lx0 = new Float32Array(count * 2), lz0 = new Float32Array(count * 2), pk = new Uint8Array(count * 2)
  let s = 0
  for (let y = 0; y < size; y += stride) for (let x = 0; x < size; x += stride, s++) {
    const px = (x + 0.5) * texelM, pz = (y + 0.5) * texelM
    const gx = Math.floor(((2 * x + 1) * WEATHER_CELLS) / (2 * size)), gz = Math.floor(((2 * y + 1) * WEATHER_CELLS) / (2 * size))
    for (let k = 0; k < 2; k++) {
      const at = k * plane + (y * size + x) * 4
      const peakByte = weather[at]!
      if (peakByte === 0) continue
      const cx = (gx - WEATHER_CELL_REACH) * WEATHER_CELL_M + weather[at + 1]! * (WEATHER_CELL_M / WEATHER_FEATURE_STEPS)
      const cz = (gz - WEATHER_CELL_REACH) * WEATHER_CELL_M + weather[at + 2]! * (WEATHER_CELL_M / WEATHER_FEATURE_STEPS)
      const r = WEATHER_RADIUS_M[0] + (WEATHER_RADIUS_M[1] - WEATHER_RADIUS_M[0]) * (weather[at + 3]! / 255)
      const peak = peakByte / 255, variant = cloudVariant(peak)
      const sX = 0.78 + 0.4 * Math.min(1, Math.max(0, Math.sin(variant * 23.1) * 0.5 + 0.5))
      const sZ = 0.78 + 0.4 * Math.min(1, Math.max(0, Math.sin(variant * 17.7 + 1.9) * 0.5 + 0.5))
      const angle = variant * 19.73 + peak * 7.1
      const ca = Math.cos(angle), sa = Math.sin(angle)
      const dx = (px - cx) / r, dz = (pz - cz) / r
      lx0[s * 2 + k] = (dx * ca - dz * sa) / sX
      lz0[s * 2 + k] = (dx * sa + dz * ca) / sZ
      pk[s * 2 + k] = peakByte
    }
  }
  const byScale = new Map<number, Float64Array>()
  const coveredAbove = (rs: number): Float64Array => {
    const cached = byScale.get(rs)
    if (cached) return cached
    const hist = new Float64Array(256)
    for (let i = 0; i < count; i++) {
      let m = 0
      for (let k = 0; k < 2; k++) {
        const p = pk[i * 2 + k]!
        if (p <= m) continue
        const u = (lx0[i * 2 + k]! / rs) * 0.5 + 0.5, v = (lz0[i * 2 + k]! / rs) * 0.5 + 0.5
        if (u <= 0 || u >= 1 || v <= 0 || v >= 1) continue
        if (footprint[Math.floor(v * nz) * nx + Math.floor(u * nx)]) m = p
      }
      hist[m]!++
    }
    // above[v] = sky fraction covered by clouds whose strength byte is > v.
    const above = new Float64Array(256)
    let acc = 0
    for (let v = 255; v >= 0; v--) { above[v] = acc / count; acc += v > 0 ? hist[v]! : 0 }
    byScale.set(rs, above)
    return above
  }
  const thresholds: number[] = [], reachable: number[] = []
  for (let e = 0; e < entries; e++) {
    const c = e / (entries - 1)
    const above = coveredAbove(coverageRadiusScale(c))
    reachable.push(above[0]!)
    let theta = 0
    if (c < above[0]!) {
      let v = 0
      while (v < 254 && above[v + 1]! >= c) v++
      const hi = above[v]!, lo = above[v + 1]!
      theta = (v + (hi === lo ? 0 : (hi - c) / (hi - lo))) / 255
    }
    // The shader fades a cloud in over CLOUD_ALIVE_RAMP; centre it on theta.
    thresholds.push(Math.max(0, theta - CLOUD_ALIVE_RAMP / 2))
  }
  return { thresholds, reachable }
}

/** Extinction per metre at full density; ~250 m to opaque for cumulus. */
export const CUMULUS_SIGMA = 0.012
/** The committed shape volume's value range, from `tests/tools/skyNoise.test.ts`'s
 *  measurement of the 128-cube (110..247 of 255). */
const SHAPE_MIN = 110 / 255
const SHAPE_MAX = 247 / 255
export const KIND_CUMULUS = 0
export const KIND_CIRRUS = 1

/** How far the detail noise eats into the base shape: the low edge of
 *  Schneider 2015's erosion remap (photoreal Task 10). */
export const DETAIL_EROSION = 0.35

/** Schneider 2015's remap: `v` linearly from [lo0, hi0] onto [lo1, hi1],
 *  unclamped. An empty input range returns `lo1` instead of dividing by 0. */
export function remap(v: number, lo0: number, hi0: number, lo1: number, hi1: number): number {
  const span = hi0 - lo0
  if (span === 0) return lo1
  return lo1 + ((v - lo0) * (hi1 - lo1)) / span
}

/** The node twin of `remap`; same empty-range rule (|span| under 1e-6). */
export function remapNode(v: Node<'float'>, lo0: Node<'float'>, hi0: Node<'float'>, lo1: Node<'float'>, hi1: Node<'float'>): Node<'float'> {
  const span = hi0.sub(lo0)
  const ok = abs(span).greaterThan(1e-6)
  const safe = select(ok, span, float(1))
  return select(ok, lo1.add(v.sub(lo0).mul(hi1.sub(lo1)).div(safe)), lo1)
}

/** Where the noise has drifted to: the ground wind times simulated seconds. */
export function cloudDriftM(wind: Vec3 | null, seconds: number): { x: number; z: number } {
  return wind === null ? { x: 0, z: 0 } : { x: wind.x * seconds, z: wind.z * seconds }
}

/** A cloud density sampler: density in [0, 1] at a TRUE world point for one
 *  layer, 0 outside its slab. */
export type DensityFn = (p: Node<'vec3'>, base: Node<'float'>, thickness: Node<'float'>, coverage: Node<'float'>, kind: Node<'float'>) => Node<'float'>

export type CloudField = {
  readonly shape: Data3DTexture
  readonly detail: Data3DTexture
  readonly cumulus: Data3DTexture
  readonly curl: DataTexture
  /** The cumulus weather map (Cloud Fidelity II §3.3), RGBA: coverage
   *  potential, local cell X/Z, peak potential; tiled every `WEATHER_TILE_M`. */
  readonly weather: DataTexture
  /** [base, thickness, coverage, kind] per layer, padded to MAX_CLOUD_LAYERS, sorted by base. */
  readonly layerData: UniformArrayNode<string>
  readonly layerCount: UniformNode<'int', number>
  readonly eyeWorld: UniformNode<'vec3', Vector3>
  readonly drift: UniformNode<'vec2', Vector2>
  /** The sorted layers, for CPU-side questions (which is the lowest cumulus). */
  readonly layers: readonly CloudLayer[]
  /** Density in [0, 1] at a TRUE world point for one layer; 0 outside its slab. */
  readonly density: DensityFn
  /** `density` without the cumulus detail erosion (one volume read fewer):
   *  the cheap sample for the cloud light march (photoreal Task 11), where
   *  the shadow a 5 m erosion texel casts is below what a 60 m+ light step
   *  resolves anyway (Schneider 2015 does the same). Cirrus is unchanged. */
  readonly densityCoarse: DensityFn
  /**
   * `density`/`densityCoarse` as laid-out TSL functions (loading spec §A.3):
   * emitted once per shader as WGSL functions instead of inlined at every
   * call site -- inlining more copies in the light march was the boot
   * freeze (12 s when the spec measured it, 39 s after the stacked-lobe
   * cumulus rewrite, 2026-09-26). Call it ONCE PER MATERIAL: each call
   * returns a new pair, and a pair must never be shared across materials
   * (three 0.186 caches a laid-out function's code by Fn identity with the
   * first material's binding names).
   */
  laidOut(): { density: DensityFn; densityCoarse: DensityFn }
  /** Lowest cumulus layer's [base, top] in metres, or null when the deck has no cumulus. */
  lowestCumulus(): { baseM: number; topM: number } | null
  update(eye: Vec3, driftSeconds: number, wind: Vec3 | null): void
  dispose(): void
}

function volume(data: Uint8Array, size: number): Data3DTexture {
  const t = new Data3DTexture(data, size, size, size)
  t.format = RGBAFormat
  t.type = UnsignedByteType
  t.wrapS = t.wrapT = t.wrapR = RepeatWrapping
  t.minFilter = t.magFilter = LinearFilter
  t.unpackAlignment = 1
  t.needsUpdate = true
  return t
}

function scalarVolume(data: Uint8Array, width: number, height: number, depth: number): Data3DTexture {
  const t = new Data3DTexture(data, width, height, depth)
  t.format = RedFormat
  t.type = UnsignedByteType
  t.minFilter = t.magFilter = LinearFilter
  t.unpackAlignment = 1
  t.needsUpdate = true
  return t
}

function curlPlane(data: Uint8Array, size: number): DataTexture {
  const t = new DataTexture(data, size, size)
  t.format = RGFormat
  t.type = UnsignedByteType
  t.wrapS = t.wrapT = RepeatWrapping
  t.minFilter = t.magFilter = LinearFilter
  t.unpackAlignment = 1
  t.needsUpdate = true
  return t
}

function plane(data: Uint8Array, size: number): DataTexture {
  const t = new DataTexture(data, size, size)
  t.format = RGBAFormat
  t.type = UnsignedByteType
  t.wrapS = t.wrapT = RepeatWrapping
  // Each weather texel names one winning Worley feature point. Filtering
  // across a cell boundary blends two unrelated local coordinate frames and
  // can invent a false, razor-thin cloud between them. At 1024² the nearest
  // sample is still only ~39 m in world space; the linearly filtered 3D
  // density volumes provide the visible surface continuity.
  t.minFilter = t.magFilter = NearestFilter
  t.unpackAlignment = 1
  t.needsUpdate = true
  return t
}

export function createCloudField(layers: readonly CloudLayer[], noise: SkyNoise): CloudField {
  const sorted = [...layers].sort((a, b) => a.baseM - b.baseM)
  const shape = volume(noise.shape, SHAPE_SIZE)
  const detail = volume(noise.detail, DETAIL_SIZE)
  const cumulus = scalarVolume(noise.cumulus, CUMULUS_DIMS[0], CUMULUS_DIMS[1], CUMULUS_DIMS[2])
  const curl = curlPlane(noise.curl, CURL_SIZE)
  const weatherPlane = WEATHER_SIZE * WEATHER_SIZE * 4
  const weatherMap = plane(noise.weather.subarray(0, weatherPlane), WEATHER_SIZE)
  const runnerMap = plane(noise.weather.subarray(weatherPlane), WEATHER_SIZE)
  const coverageTable = skyCoverageTable(noise.weather, cumulusFootprint(noise.cumulus))
  const thresholds = uniformArray(coverageTable.thresholds, 'float')

  // Uniforms. Layers as [base, thickness, coverage, kind], padded to MAX.
  const layerData = uniformArray(
    Array.from({ length: MAX_CLOUD_LAYERS }, (_, i) => {
      const l = sorted[i]
      return l ? new Vector4(l.baseM, l.thicknessM, l.coverage, l.kind === 'cirrus' ? KIND_CIRRUS : KIND_CUMULUS) : new Vector4(0, 0, 0, 0)
    }),
    'vec4',
  )
  const layerCount = uniform(sorted.length, 'int')
  const eyeWorld = uniform(new Vector3())
  const drift = uniform(new Vector2())

  /** Density in [0, 1] at a world point for one layer; 0 outside the slab.
   *  `detailed` false skips the detail erosion (`densityCoarse`); `layout`
   *  true makes it a laid-out WGSL function rather than inlined (`laidOut`).
   *  The body reads no uniform: `drifted` and `theta` arrive as parameters
   *  (`driftedOf`, `thetaFor`), because a laid-out Fn's code is cached with
   *  the first material's uniform binding names. Textures are fine inside
   *  it as long as the instance is per-material (verified 2026-09-25). */
  const makeDensity = (detailed: boolean, layout: boolean) => {
    const fn = Fn(([p, drifted, base, thickness, coverage, kind, theta]: [Node<'vec3'>, Node<'vec3'>, Node<'float'>, Node<'float'>, Node<'float'>, Node<'float'>, Node<'float'>]) => {
      const h = p.y.sub(base).div(thickness)
      const inside = h.greaterThan(0).and(h.lessThan(1))
      const d = float(0).toVar()
      If(inside, () => {
        // The committed volume spans 110..247 of 255 (the Perlin-Worley remap
        // lifts the low end on purpose); stretched back to 0..1 here so
        // `coverage` means the fraction of sky it names.
        const stretch = (v: Node<'float'>): Node<'float'> => clamp(v.sub(SHAPE_MIN).div(SHAPE_MAX - SHAPE_MIN), 0, 1)
        // Coverage thresholds the shape: what survives above 1 - coverage is
        // cloud. `cov` is a parameter now (Plan 16d), not the closed-over
        // layer scalar directly, so cumulus can pass a spatially-modulated
        // value while cirrus keeps passing the plain layer scalar unchanged.
        const threshold = (shapeValue: Node<'float'>, cov: Node<'float'>): Node<'float'> =>
          clamp(shapeValue.sub(float(1).sub(cov)).div(max(cov, 0.001)), 0, 1)
        // ONE branch samples, never both: a `mix` of the two kinds after
        // sampling cost every cumulus step three volume reads instead of one
        // (3.9 ms against the 2.5 ms budget, 2026-09-19).
        If(kind.greaterThan(0.5), () => {
          // Cirrus: the same volume stretched along the east axis over a tile
          // three times wider, times a second coarser sample so the 1.5 km
          // Worley cells cannot read as a grid from below. A thin band.
          // Untouched by Plan 16d: no coverage modulation for cirrus (spec §1).
          const streaks = texture3D(shape, drifted.mul(vec3(1 / (SHAPE_TILE_M * 9), 1 / SHAPE_TILE_M, 1 / (SHAPE_TILE_M * 3)))).r
          const sheet = texture3D(shape, drifted.mul(vec3(1 / (SHAPE_TILE_M * 4), 1 / (SHAPE_TILE_M * 2), 1 / (SHAPE_TILE_M * 5))).add(0.37)).r
          const gradient = smoothstep(0, 0.3, h).mul(smoothstep(1, 0.7, h))
          d.assign(threshold(stretch(streaks.mul(0.6).add(sheet.mul(0.4))), coverage).mul(gradient).mul(0.6))
        }).Else(() => {
          // Cumulus: flat-bottomed, rounded on top, edges eroded by the detail
          // volume, strongest near the base and the edge (Schneider 2015).
          // Slowly warp the horizontal coordinates at two unequal scales:
          // the same tiling shape volume must not line up in repeating distant rows.
          const warped = vec3(
            drifted.x.add(sin(drifted.z.div(7300).add(drifted.x.div(17000))).mul(1800)),
            drifted.y,
            drifted.z.add(sin(drifted.x.div(9100).sub(drifted.z.div(13000))).mul(1800)),
          )
          // Cloud Fidelity II §3.3: the weather map says which cloud this
          // column belongs to. Sampled at the SAME warped XZ the shape volume
          // uses (already wind-drifted), so a cloud's footprint never slides
          // against its body (the rule Plan 16d's coverage field set).
          // Nearest texel, addressed by index so its grid cell can be computed
          // in the generator's exact integer arithmetic.
          const tileXZ = fract(warped.xz.div(WEATHER_TILE_M)).mul(WEATHER_TILE_M).toVar()
          const texelIdx = floor(tileXZ.div(WEATHER_TILE_M / WEATHER_SIZE)).toVar()
          const weatherUv = texelIdx.add(0.5).div(WEATHER_SIZE).toVar()
          // Coverage -> strength threshold `theta` is a parameter (`thetaFor`);
          // the coverage-grown radius repeats coverageRadiusScale here.
          const grow = float(1).add(smoothstep(0.2, 0.65, coverage).mul(0.5)).toVar()
          const cellOrigin = floor(texelIdx.mul(2).add(1).mul(WEATHER_CELLS).div(2 * WEATHER_SIZE))
            .sub(WEATHER_CELL_REACH).mul(WEATHER_CELL_M).toVar()
          // One of the texel's two clouds (winner, runner-up). R is its
          // strength; G/B its centre in 1/51-cell steps from the texel's grid
          // cell minus WEATHER_CELL_REACH; A its radius. Every texel of a
          // cloud decodes to the same centre, so the local position is
          // continuous across texels (tools/sky/weather.ts). A runner-up of
          // strength 0 is never alive.
          const candidate = (wm: Node<'vec4'>) => {
            const peak = wm.r
            const centre = cellOrigin.add(floor(wm.gb.mul(255).add(0.5)).mul(WEATHER_CELL_M / WEATHER_FEATURE_STEPS))
            const radius = mix(float(WEATHER_RADIUS_M[0]), float(WEATHER_RADIUS_M[1]), wm.a).mul(grow)
            const local = tileXZ.sub(centre).div(radius)
            const variant = saturate(sin(peak.mul(43.1).add(0.7)).mul(0.5).add(0.5)).toVar()
            const hc = p.y.sub(base).div(thickness.mul(mix(float(0.42), float(1), variant))).toVar()
            const alive = smoothstep(theta, theta.add(CLOUD_ALIVE_RAMP), peak).toVar()
            // The baked stacked-lobe archetype in the cloud's own frame.
            // Rotation and scale come from its strength, so neighbours do not
            // present the same silhouette.
            const scaleX = mix(float(0.78), float(1.18), saturate(sin(variant.mul(23.1)).mul(0.5).add(0.5)))
            const scaleZ = mix(float(0.78), float(1.18), saturate(sin(variant.mul(17.7).add(1.9)).mul(0.5).add(0.5)))
            const angle = variant.mul(19.73).add(peak.mul(7.1))
            const ca = sin(angle.add(1.5707963267948966)), sa = sin(angle)
            const lx = local.x.mul(ca).sub(local.y.mul(sa)).div(scaleX)
            const lz = local.x.mul(sa).add(local.y.mul(ca)).div(scaleZ)
            const uvw = vec3(lx.mul(0.5).add(0.5), hc, lz.mul(0.5).add(0.5))
            const inVolume = uvw.x.greaterThan(0).and(uvw.x.lessThan(1))
              .and(uvw.y.greaterThan(0)).and(uvw.y.lessThan(1))
              .and(uvw.z.greaterThan(0)).and(uvw.z.lessThan(1))
            const stored = float(0).toVar()
            If(alive.greaterThan(0).and(inVolume), () => { stored.assign(texture3D(cumulus, uvw).r) })
            return { stored, alive, hc, variant }
          }
          const first = candidate(texture(weatherMap, weatherUv))
          let stored: Node<'float'> = first.stored, alive: Node<'float'> = first.alive
          let hc: Node<'float'> = first.hc, type: Node<'float'> = first.variant
          if (detailed) {
            // The denser of the two draws this point: a cloud that grows past
            // the texels it wins is not sliced off at its neighbour's
            // boundary. The coarse density (the light march's, seven reads a
            // step) keeps the winner only: a runner-up matters only at the
            // seams, and there it would change a shadow, not a silhouette.
            // Measured 2026-09-26 at 4K High in-deck: 32.5 ms p95 with both.
            const second = candidate(texture(runnerMap, weatherUv))
            const useSecond = second.stored.mul(second.alive).greaterThan(first.stored.mul(first.alive)).toVar()
            stored = select(useSecond, second.stored, first.stored).toVar()
            alive = select(useSecond, second.alive, first.alive).toVar()
            hc = select(useSecond, second.hc, first.hc).toVar()
            type = select(useSecond, second.variant, first.variant).toVar()
          }
          If(alive.greaterThan(0), () => {
            // Where the archetype is empty there is no cloud: the shape noise
            // only sculpts an existing body. Without this gate its +-0.065
            // term filled every live cell's whole column with faint haze, and
            // the shape volume was read there on every step.
            If(stored.greaterThan(0), () => {
              const morphologyP = warped.add(vec3(
                sin(warped.z.div(4300).add(type.mul(5.7))).mul(hc).mul(260),
                0,
                sin(warped.x.div(5100).sub(type.mul(4.3))).mul(hc).mul(220),
              ))
              const shapeSample = texture3D(shape, morphologyP.div(SHAPE_TILE_M))
              const shapeFbm = shapeSample.g.mul(0.625).add(shapeSample.b.mul(0.25)).add(shapeSample.a.mul(0.125))
              const shapeValue = saturate(stretch(shapeSample.r).mul(mix(float(0.82), float(1.08), shapeFbm)))
              const sculpted = stored.add(shapeValue.sub(0.5).mul(mix(float(0.05), float(0.13), smoothstep(0.05, 0.8, hc))))

              // The shared layer base remains flat, while the signed ellipsoid
              // field and one Perlin-Worley read define the three-dimensional
              // silhouette rather than thresholding a 2D radial disc.
              const gradient = smoothstep(0, CLOUD_BASE_RAMP_M, p.y.sub(base)).mul(smoothstep(1, 0.8, hc))
              const body = smoothstep(0.015, 0.22, sculpted).mul(gradient).mul(alive).toVar()
              if (detailed) {
                // Erosion only lowers density, so where the base shape is empty
                // the detail volume is not read at all (photoreal Task 11).
                If(body.greaterThan(0), () => {
                  const curlXZ = texture(curl, warped.xz.div(CURL_TILE_M)).rg.mul(2).sub(1)
                  const detailP = warped.add(vec3(curlXZ.x.mul(CURL_DISPLACEMENT_M), 0, curlXZ.y.mul(CURL_DISPLACEMENT_M)))
                  const ds = texture3D(detail, detailP.div(DETAIL_TILE_M))
                  const e = ds.r.mul(0.625).add(ds.g.mul(0.25)).add(ds.b.mul(0.125))
                  // Wispy near each cloud's base, billowy above it.
                  const detailMod = mix(e, float(1).sub(e), saturate(hc.mul(5)))
                  d.assign(saturate(remapNode(body, detailMod.mul(DETAIL_EROSION), float(1), float(0), float(1))))
                })
              } else {
                d.assign(body)
              }
            })
          })
        })
      })
      return d
    })
    if (layout) {
      fn.setLayout({
        name: detailed ? 'cloudDensity' : 'cloudDensityCoarse',
        type: 'float',
        inputs: [
          { name: 'p', type: 'vec3' },
          { name: 'drifted', type: 'vec3' },
          { name: 'base', type: 'float' },
          { name: 'thickness', type: 'float' },
          { name: 'coverage', type: 'float' },
          { name: 'kind', type: 'float' },
          { name: 'theta', type: 'float' },
        ],
      })
    }
    return fn
  }
  /** The coverage -> strength threshold, from the sky-fraction twin
   *  (skyCoverageTable), read at the call site from the `thresholds`
   *  uniform array. Only cumulus uses it; cirrus ignores it. */
  const thetaFor = (coverage: Node<'float'>): Node<'float'> => {
    const at = coverage.mul(COVERAGE_TABLE_SIZE - 1).toVar()
    const k = min(at.floor(), float(COVERAGE_TABLE_SIZE - 2)).toVar()
    const k0 = (thresholds.element(k.toInt()) as unknown as Node<'float'>).toVar()
    const k1 = (thresholds.element(k.toInt().add(1)) as unknown as Node<'float'>).toVar()
    return mix(k0, k1, saturate(at.sub(k)))
  }
  /** Where the noise has drifted to, from the `drift` uniform. */
  const driftedOf = (p: Node<'vec3'>): Node<'vec3'> => vec3(p.x.add(drift.x), p.y, p.z.add(drift.y))
  const bind = (fn: ReturnType<typeof makeDensity>): DensityFn =>
    (p, base, thickness, coverage, kind) => fn(p, driftedOf(p), base, thickness, coverage, kind, thetaFor(coverage))
  const density = bind(makeDensity(true, false))
  const densityCoarse = bind(makeDensity(false, false))

  const firstCumulus = sorted.find((l) => l.kind === 'cumulus')
  return {
    shape, detail, cumulus, curl, weather: weatherMap, layerData, layerCount, eyeWorld, drift, layers: sorted,
    density,
    densityCoarse,
    laidOut: () => ({ density: bind(makeDensity(true, true)), densityCoarse: bind(makeDensity(false, true)) }),
    lowestCumulus: () => (firstCumulus ? { baseM: firstCumulus.baseM, topM: firstCumulus.baseM + firstCumulus.thicknessM } : null),
    update(eye, driftSeconds, wind): void {
      eyeWorld.value.set(eye.x, eye.y, eye.z)
      const d = cloudDriftM(wind, driftSeconds)
      drift.value.set(d.x, d.z)
    },
    dispose(): void {
      shape.dispose()
      detail.dispose()
      cumulus.dispose()
      curl.dispose()
      weatherMap.dispose()
      runnerMap.dispose()
    },
  }
}
