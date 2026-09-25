import { Data3DTexture, DataTexture, LinearFilter, RedFormat, RepeatWrapping, UnsignedByteType, Vector2, Vector3, Vector4 } from 'three'
import type { Node, UniformNode, UniformArrayNode } from 'three/webgpu'
import { Fn, If, abs, clamp, float, max, mix, pow, saturate, select, sin, smoothstep, texture, texture3D, uniform, uniformArray, vec3 } from 'three/tsl'
import { MAX_CLOUD_LAYERS, type CloudLayer } from '../../sim/scenario.js'
import type { Vec3 } from '../../sim/math/vec3.js'
import type { SkyNoise } from '../sky/load.js'
import { COVERAGE_SIZE, DETAIL_SIZE, SHAPE_SIZE } from '../sky/noise.js'

/**
 * The cloud FIELD: the two noise volumes, the coverage-modulation field, the
 * layer uniforms, the drift, and the density function (design 16a §4, 16d
 * §2). Extracted from the dome on 2026-09-19 for Plan 16b so the shadow pass
 * reads the same function the cloud march reads (a pass since photoreal
 * Task 3, cloudPass.ts) -- one field, two readers, and the shadow cannot
 * disagree with the cloud that casts it. `clouds.ts` keeps the march;
 * `cloudShadow.ts` integrates this along the sun. Nothing here knows about a
 * camera.
 */

/** Metres per repeat of the shape volume and of the detail volume. Gameplay
 *  estimates (16a design §9): a 128-texel tile over 6 km is 47 m per texel. */
export const SHAPE_TILE_M = 6000
export const DETAIL_TILE_M = 400
/** Metres per repeat of the cumulus coverage-modulation field (Plan 16d
 *  design §2). Much larger than SHAPE_TILE_M on purpose: this is meant to
 *  read as broad, tens-of-kilometres regional weather variation, not
 *  per-cloud shape. 60 km against a 100 km `FOG_DISTANCE_M` draw distance
 *  keeps at most one visible repeat inside the fog. */
export const COVERAGE_TILE_M = 60_000
/** How far the coverage field can push a layer's configured coverage up or
 *  down: [0.4x, 1.6x], centred on 1x at a mid-value (0.5) sample so the
 *  configured `coverage` stays the deck's spatial average -- this only
 *  clumps and gaps it, it does not change the average cloudiness Mark
 *  configured per layer (design §2). Cumulus only; cirrus's threshold is
 *  untouched. */
const COVERAGE_MOD_MIN = 0.4
const COVERAGE_MOD_MAX = 1.6
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
  /** The Plan 16d cumulus coverage-modulation field (design §2), 2D, tiled
   *  every `COVERAGE_TILE_M`. */
  readonly coverage: DataTexture
  /** [base, thickness, coverage, kind] per layer, padded to MAX_CLOUD_LAYERS, sorted by base. */
  readonly layerData: UniformArrayNode<string>
  readonly layerCount: UniformNode<'int', number>
  readonly eyeWorld: UniformNode<'vec3', Vector3>
  readonly drift: UniformNode<'vec2', Vector2>
  /** The sorted layers, for CPU-side questions (which is the lowest cumulus). */
  readonly layers: readonly CloudLayer[]
  /** Density in [0, 1] at a TRUE world point for one layer; 0 outside its slab. */
  density(p: Node<'vec3'>, base: Node<'float'>, thickness: Node<'float'>, coverage: Node<'float'>, kind: Node<'float'>): Node<'float'>
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
  t.format = RedFormat
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
  const coverageField = plane(noise.coverage, COVERAGE_SIZE)

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

  /** Density in [0, 1] at a world point for one layer; 0 outside the slab. */
  const density = Fn(([p, base, thickness, coverage, kind]: [Node<'vec3'>, Node<'float'>, Node<'float'>, Node<'float'>, Node<'float'>]) => {
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
        const shapeValue = stretch(texture3D(shape, warped.div(SHAPE_TILE_M)).r)
        // Plan 16d: the coverage-modulation field, sampled at the SAME
        // warped XZ the shape volume uses -- already wind-drifted via
        // `drifted` -- so the clumping pattern never slides against the
        // cloud bodies it gates (Review Focus). Reading a bare `drifted.xz`
        // here instead would be the easy, wrong "simplification."
        const covNoise = texture(coverageField, warped.xz.div(COVERAGE_TILE_M)).r
        const effCoverage = clamp(coverage.mul(mix(float(COVERAGE_MOD_MIN), float(COVERAGE_MOD_MAX), covNoise)), 0, 1)
        // Photoreal Task 10: Schneider 2015's shape, replacing 16a's ad-hoc
        // subtract-and-renormalize erosion that read as blurred cotton.
        // Height profile: a flat base (full density 7% up the slab) and a
        // rounded top -- above mid-slab, coverage narrows as sqrt of the
        // remaining height, so a column needs a stronger shape value to
        // reach higher and tops dome in. (The task brief's sqrt(1 - h) over
        // the WHOLE slab, plus Schneider's "then multiply by coverage", cut
        // the columns reaching cloud from 32% to 0% at coverage 0.45 on a
        // CPU twin of this function; see the Task 10 report.)
        const gradient = smoothstep(0, 0.07, h).mul(smoothstep(1, 0.6, h))
        const covH = effCoverage.mul(pow(saturate(float(1).sub(h).mul(2)), 0.5))
        // Coverage is the remap's low edge: what survives above 1 - coverage.
        const body = saturate(remapNode(shapeValue.mul(gradient), float(1).sub(covH), float(1), float(0), float(1)).mul(BODY_GAIN))
        const e = texture3D(detail, drifted.div(DETAIL_TILE_M)).r
        const detailMod = mix(e, float(1).sub(e), saturate(h.mul(5)))
        d.assign(saturate(remapNode(body, detailMod.mul(DETAIL_EROSION), float(1), float(0), float(1))))
      })
    })
    return d
  })

  const firstCumulus = sorted.find((l) => l.kind === 'cumulus')
  return {
    shape, detail, coverage: coverageField, layerData, layerCount, eyeWorld, drift, layers: sorted,
    // A TSL `Fn` is callable but not typed as the method above; the closure
    // gives the handle a plain function type.
    density: (p, base, thickness, coverage, kind) => density(p, base, thickness, coverage, kind),
    lowestCumulus: () => (firstCumulus ? { baseM: firstCumulus.baseM, topM: firstCumulus.baseM + firstCumulus.thicknessM } : null),
    update(eye, driftSeconds, wind): void {
      eyeWorld.value.set(eye.x, eye.y, eye.z)
      const d = cloudDriftM(wind, driftSeconds)
      drift.value.set(d.x, d.z)
    },
    dispose(): void {
      shape.dispose()
      detail.dispose()
      coverageField.dispose()
    },
  }
}
