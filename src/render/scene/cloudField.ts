import { Data3DTexture, DataTexture, LinearFilter, RGBAFormat, RedFormat, RepeatWrapping, UnsignedByteType, Vector2, Vector3, Vector4 } from 'three'
import type { Node, UniformNode, UniformArrayNode } from 'three/webgpu'
import { Fn, If, abs, clamp, float, max, min, mix, pow, saturate, select, sin, smoothstep, texture, texture3D, uniform, uniformArray, vec3 } from 'three/tsl'
import { MAX_CLOUD_LAYERS, type CloudLayer } from '../../sim/scenario.js'
import type { Vec3 } from '../../sim/math/vec3.js'
import type { SkyNoise } from '../sky/load.js'
import { DETAIL_SIZE, SHAPE_SIZE, WEATHER_SIZE, WEATHER_TILE_M } from '../sky/noise.js'

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

/** Metres per repeat of the shape volume. Gameplay estimates (16a design
 *  §9): a 128-texel tile over 6 km is 47 m per texel. */
export const SHAPE_TILE_M = 6000
/** Metres per repeat of the detail volume -- cumulus-only in effect, since
 *  density() below samples `detail` only in the cumulus branch; cirrus never
 *  reads it. Retiled 400 -> 150 m (Plan 16d, design §2's "cheaper retiling
 *  option"): the erosion texel now spans ~4.7 m over the existing 32-texel
 *  volume, versus ~12.5 m before, for the "camera inside or just below the
 *  cumulus layer" case cirrus never hits. No new texture, no VRAM cost --
 *  see design §2 for why a genuinely finer volume is deferred until this is
 *  measured (Plan 16d Task 5). Kept by photoreal Task 10 on 2026-09-25 after
 *  a 150-vs-400 m capture under the Schneider erosion: 150 m gives
 *  cauliflower edges at 1 km where 400 m is smooth, with no sparkle inside
 *  the deck. */
export const DETAIL_TILE_M = 150
export { WEATHER_TILE_M }
/** The lowest top a cloud can have, as a fraction of its layer's thickness:
 *  the weather map's B channel spans [WEATHER_TOP_MIN, 1] (Cloud Fidelity II
 *  §3.3). 0.3 of the free-flight deck's 900 m is a 270 m-deep humilis. */
export const WEATHER_TOP_MIN = 0.3
/** The layer's `coverage` is the fraction of SKY in cloud; the map fraction
 *  that yields it is larger, because each cloud's dome and the shape noise
 *  carve its footprint. Calibrated against the pre-§3.3 deck
 *  (above-deck-3200's cloud pixel fraction, progress ledger). */
export const WEATHER_COVERAGE_GAIN = 1.5
/** Metres over which a cloud's density ramps up from the layer base: the
 *  flat grey base every cloud of a layer shares. */
export const CLOUD_BASE_RAMP_M = 40
/** Entries in the coverage -> threshold table, at coverage k / (N - 1). */
export const COVERAGE_TABLE_SIZE = 33

/**
 * The weather-map potential (R, in [0, 1]) above which a fraction `coverage`
 * of the map lies, for coverage 0, 1/32, ... 1 (Cloud Fidelity II §3.3).
 * Measured from the map's own bytes, so the scenario's `coverage` stays the
 * fraction of the map in cloud whatever the generator does; `density()`
 * interpolates it. Interpolated within a byte so the threshold is
 * continuous in coverage. Past the fraction of texels with any potential at
 * all, it is 0 (the gaps stay clear).
 */
export function coverageThresholds(weather: Uint8Array, entries = COVERAGE_TABLE_SIZE): number[] {
  const count = weather.length / 4
  const hist = new Float64Array(256)
  for (let i = 0; i < count; i++) hist[weather[i * 4]!]!++
  // above[v] = fraction of texels whose byte is > v, for v = 0..255.
  const above = new Float64Array(256)
  let acc = 0
  for (let v = 255; v >= 0; v--) {
    above[v] = acc / count
    acc += hist[v]!
  }
  return Array.from({ length: entries }, (_, k) => {
    const c = k / (entries - 1)
    if (c >= above[0]!) return 0
    // above[] falls from above[0] toward 0; find v with above[v] >= c > above[v + 1].
    let v = 0
    while (v < 254 && above[v + 1]! >= c) v++
    const hi = above[v]!, lo = above[v + 1]!
    const t = hi === lo ? 0 : (hi - c) / (hi - lo)
    return (v + t) / 255
  })
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
/** Density gain on the thresholded base shape before erosion (photoreal
 *  Task 10) -- Schneider's density multiplier, used IN PLACE of his
 *  multiply-by-coverage. Without it the 0.35 erosion alone cut the columns
 *  reaching optical depth 0.3 at coverage 0.45 from 32% to 8% on a CPU twin
 *  of this function; with it they stay at 31%, edges steeper and bodies
 *  about twice as dense. Captured 2026-09-25: cloud pixels in the
 *  above-deck-3200 view 83% before, 75% after. */
export const BODY_GAIN = 2

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

export type CloudField = {
  readonly shape: Data3DTexture
  readonly detail: Data3DTexture
  /** The cumulus weather map (Cloud Fidelity II §3.3), RGBA: coverage
   *  potential, cloud type, top height; tiled every `WEATHER_TILE_M`. */
  readonly weather: DataTexture
  /** [base, thickness, coverage, kind] per layer, padded to MAX_CLOUD_LAYERS, sorted by base. */
  readonly layerData: UniformArrayNode<string>
  readonly layerCount: UniformNode<'int', number>
  readonly eyeWorld: UniformNode<'vec3', Vector3>
  readonly drift: UniformNode<'vec2', Vector2>
  /** The sorted layers, for CPU-side questions (which is the lowest cumulus). */
  readonly layers: readonly CloudLayer[]
  /** Density in [0, 1] at a TRUE world point for one layer; 0 outside its slab. */
  density(p: Node<'vec3'>, base: Node<'float'>, thickness: Node<'float'>, coverage: Node<'float'>, kind: Node<'float'>): Node<'float'>
  /** `density` without the cumulus detail erosion (one volume read fewer):
   *  the cheap sample for the cloud light march (photoreal Task 11), where
   *  the shadow a 5 m erosion texel casts is below what a 60 m+ light step
   *  resolves anyway (Schneider 2015 does the same). Cirrus is unchanged. */
  densityCoarse(p: Node<'vec3'>, base: Node<'float'>, thickness: Node<'float'>, coverage: Node<'float'>, kind: Node<'float'>): Node<'float'>
  /** Lowest cumulus layer's [base, top] in metres, or null when the deck has no cumulus. */
  lowestCumulus(): { baseM: number; topM: number } | null
  update(eye: Vec3, driftSeconds: number, wind: Vec3 | null): void
  dispose(): void
}

function volume(data: Uint8Array, size: number): Data3DTexture {
  const t = new Data3DTexture(data, size, size, size)
  t.format = RedFormat
  t.type = UnsignedByteType
  t.wrapS = t.wrapT = t.wrapR = RepeatWrapping
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
  t.minFilter = t.magFilter = LinearFilter
  t.unpackAlignment = 1
  t.needsUpdate = true
  return t
}

export function createCloudField(layers: readonly CloudLayer[], noise: SkyNoise): CloudField {
  const sorted = [...layers].sort((a, b) => a.baseM - b.baseM)
  const shape = volume(noise.shape, SHAPE_SIZE)
  const detail = volume(noise.detail, DETAIL_SIZE)
  const weatherMap = plane(noise.weather, WEATHER_SIZE)
  const thresholds = uniformArray(coverageThresholds(noise.weather), 'float')

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
   *  `detailed` false skips the detail erosion (`densityCoarse`). */
  const makeDensity = (detailed: boolean) => Fn(([p, base, thickness, coverage, kind]: [Node<'vec3'>, Node<'float'>, Node<'float'>, Node<'float'>, Node<'float'>]) => {
    const h = p.y.sub(base).div(thickness)
    const inside = h.greaterThan(0).and(h.lessThan(1))
    const d = float(0).toVar()
    If(inside, () => {
      const drifted = vec3(p.x.add(drift.x), p.y, p.z.add(drift.y))
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
        // the same 6 km volume must not line up in repeating distant rows.
        const warped = vec3(
          drifted.x.add(sin(drifted.z.div(7300).add(drifted.x.div(17000))).mul(1800)),
          drifted.y,
          drifted.z.add(sin(drifted.x.div(9100).sub(drifted.z.div(13000))).mul(1800)),
        )
        // Cloud Fidelity II §3.3: the weather map says which cloud this
        // column belongs to. Sampled at the SAME warped XZ the shape volume
        // uses (already wind-drifted), so a cloud's footprint never slides
        // against its body (the rule Plan 16d's coverage field set).
        const wm = texture(weatherMap, warped.xz.div(WEATHER_TILE_M)).toVar()
        // R thresholded at `theta` leaves exactly `coverage` of the map in
        // cloud (coverageThresholds, measured from the map itself) ...
        const at = min(coverage.mul(WEATHER_COVERAGE_GAIN), 1).mul(COVERAGE_TABLE_SIZE - 1).toVar()
        const k = min(at.floor(), float(COVERAGE_TABLE_SIZE - 2)).toVar()
        const k0 = (thresholds.element(k.toInt()) as unknown as Node<'float'>).toVar()
        const k1 = (thresholds.element(k.toInt().add(1)) as unknown as Node<'float'>).toVar()
        const theta = mix(k0, k1, saturate(at.sub(k))).toVar()
        // ... and each surviving cloud reaches full coverage at its own
        // centre (A, its peak): a dome footprint, not a mesa.
        const cellCov = saturate(wm.r.sub(theta).div(max(wm.a.sub(theta), 0.02)))
        // This cloud's own top, and the height within it: every cloud of a
        // layer shares the flat base, each stops at its own top.
        const topFrac = mix(float(WEATHER_TOP_MIN), float(1), wm.b)
        const cloudDepth = thickness.mul(topFrac)
        const hc = p.y.sub(base).div(cloudDepth).toVar()
        If(cellCov.greaterThan(0).and(hc.lessThan(1)), () => {
          // Schneider's type-driven vertical profile, here as the shape of
          // the dome: the footprint narrows as sqrt(1 - hc^n). Stratus
          // (type 0, n 8) keeps its width almost to a flat top, cumulus
          // (0.5, n 2.5) is a rounded mound on a flat base, towering
          // cumulus (1, n 5) a column with a rounded top.
          const type = wm.g
          const n = mix(mix(float(8), float(2.5), saturate(type.mul(2))), float(5), saturate(type.mul(2).sub(1)))
          const shapeValue = stretch(texture3D(shape, warped.div(SHAPE_TILE_M)).r)
          // A flat base ramped over CLOUD_BASE_RAMP_M, a soft top.
          const gradient = smoothstep(0, CLOUD_BASE_RAMP_M, p.y.sub(base)).mul(smoothstep(1, 0.8, hc))
          const covH = cellCov.mul(pow(saturate(float(1).sub(pow(max(hc, 0), n))), 0.5))
          // Schneider 2015's remap: coverage is the low edge, so the shape
          // noise carves the footprint into billows; BODY_GAIN as before.
          const body = saturate(remapNode(shapeValue.mul(gradient), float(1).sub(covH), float(1), float(0), float(1)).mul(BODY_GAIN)).toVar()
          if (detailed) {
            // Erosion only lowers density, so where the base shape is empty
            // the detail volume is not read at all (photoreal Task 11).
            If(body.greaterThan(0), () => {
              const e = texture3D(detail, drifted.div(DETAIL_TILE_M)).r
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
    return d
  })
  const density = makeDensity(true)
  const densityCoarse = makeDensity(false)

  const firstCumulus = sorted.find((l) => l.kind === 'cumulus')
  return {
    shape, detail, weather: weatherMap, layerData, layerCount, eyeWorld, drift, layers: sorted,
    // A TSL `Fn` is callable but not typed as the method above; the closure
    // gives the handle a plain function type.
    density: (p, base, thickness, coverage, kind) => density(p, base, thickness, coverage, kind),
    densityCoarse: (p, base, thickness, coverage, kind) => densityCoarse(p, base, thickness, coverage, kind),
    lowestCumulus: () => (firstCumulus ? { baseM: firstCumulus.baseM, topM: firstCumulus.baseM + firstCumulus.thicknessM } : null),
    update(eye, driftSeconds, wind): void {
      eyeWorld.value.set(eye.x, eye.y, eye.z)
      const d = cloudDriftM(wind, driftSeconds)
      drift.value.set(d.x, d.z)
    },
    dispose(): void {
      shape.dispose()
      detail.dispose()
      weatherMap.dispose()
    },
  }
}
