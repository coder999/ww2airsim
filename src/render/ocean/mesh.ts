import { BufferAttribute, BufferGeometry, DataTexture, FloatType, Mesh, NearestFilter, RedFormat, Vector2, type Texture, type Object3D } from 'three'
import { MeshBasicNodeMaterial, type Node, type UniformNode } from 'three/webgpu'
import { Fn, If, clamp, color, fract, max, normalize, dot, pow, reflect, float, floor, int, ivec2, length, min, mix, positionLocal, smoothstep, textureLoad, uniform, varying, vec3, vec4 } from 'three/tsl'
import { horizonSinkNode, OCEAN_EXTENT_M } from '../horizon.js'
import { SEA_COLOUR } from '../scene/water.js'
import { OCEAN_SHADOW_FLOOR, type CloudShadowHandle } from '../scene/cloudShadow.js'
import { sunColorNode, sunDirectionNode } from '../scene/lighting.js'
import { aerialPerspective, reflectedSky, seaIrradianceOverPi } from '../scene/atmosphereShading.js'
import { OUTSIDE_DEPTH_M, type DepthField } from './depth.js'
import type { OceanCompute } from './compute.js'
import { angularFadeSpacingM, shortestWavelengthM } from './bands.js'
import { windSpeedMps } from './beaufort.js'
import { worldFixedVelocityMrt } from '../scene/velocity.js'

export const DEEP_WATER_COLOUR = SEA_COLOUR
/** Art direction: turquoise shallow water; this is not an optical model. */
export const SHALLOW_WATER_COLOUR = 0x397d83
/** Reach the deep colour by 100 m, just shallower than the -125 m gulf centre. */
export const DEEP_COLOUR_DEPTH_M = 100
export type Ring = {
  readonly innerM: number
  readonly outerM: number
  /** The coarser of the two spacings in this ring -- what its cells look like. */
  readonly quadM: number
  /** Radial spacing alone. Separate from `quadM` because it is the one that
   *  JUMPS at a ring boundary while the angular spacing runs continuously, so
   *  it is the one a seam test has to be able to see. Added 2026-09-17 with
   *  the 391 m seam fix. */
  readonly radialM: number
}

// 512 azimuth segments give 4.91 km outer edges at 400 km; radial edges are
// <=5 km. Their d²/R curvature second difference remains below 5 m. Radial
// growth by four gives sub-metre cells near the camera with eight rings.
export const OCEAN_SECTORS = 512
/**
 * Radial rows in a ring.
 *
 * **The floor was 64 until 2026-09-17, and it was a visible seam.** The rings
 * grow by 4x, so a flat row count means the radial spacing jumps 4x at every
 * boundary while the angular spacing (`angularSampleSpacingM`) stays
 * continuous. Measured: 4.58 m in the 98-391 m ring against 18.31 m in the
 * 391-1563 m ring, and 18.31 m cannot represent the 32 m swell, which needs
 * 16 m. So the swell was drawn inside 391 m and vanished immediately outside
 * it -- a hard circle centred on the camera, which is what Mark outlined on
 * 2026-09-17.
 *
 * 128 puts that ring at 9.16 m, fine enough for the swell, so the only limit
 * left anywhere is the continuous angular one. The cost is 266,760 -> 529,416
 * mesh vertices. `tests/render/ocean/mesh.test.ts` asserts the invariant this
 * exists to hold: the mesh must resolve any wavelength the fade still draws.
 *
 * **The measured GPU tier budgets in `tiers.ts` predate this** and were taken
 * on the RX 6700 XT at 266,760 vertices. Doubling the vertex count did not
 * change the compute cost those numbers are about, but it is not free either,
 * and re-measuring on the reference desktop is outstanding.
 */
const radialSteps = (inner: number, outer: number): number => Math.max(128, Math.ceil((outer - inner) / 5000))
export function oceanRings(extentM: number, rings: number): readonly Ring[] {
  if (!Number.isFinite(extentM) || extentM <= 0 || !Number.isInteger(rings) || rings < 1 || rings > 16) {
    throw new Error('ocean: expected positive extent and 1–16 rings')
  }
  return Array.from({ length: rings }, (_, i) => {
    const outerM = extentM / 4 ** (rings - 1 - i)
    const innerM = i === 0 ? 0 : outerM / 4
    const radialM = (outerM - innerM) / radialSteps(innerM, outerM)
    return { innerM, outerM, radialM, quadM: Math.max(radialM, 2 * Math.PI * outerM / OCEAN_SECTORS) }
  })
}

/** Joined polar rings share angular samples at each boundary, avoiding
 * T-junction cracks when the shader sinks their vertices by curvature. */
export function oceanGeometry(rings: readonly Ring[]): BufferGeometry {
  const positions: number[] = []
  const indices: number[] = []
  for (const { innerM, outerM } of rings) {
    const base = positions.length / 3
    const steps = radialSteps(innerM, outerM)
    for (let row = 0; row <= steps; row++) {
      const radius = innerM + (outerM - innerM) * row / steps
      for (let col = 0; col <= OCEAN_SECTORS; col++) {
        const angle = 2 * Math.PI * (col % OCEAN_SECTORS) / OCEAN_SECTORS
        positions.push(radius * Math.cos(angle), 0, radius * Math.sin(angle))
      }
    }
    for (let row = 0; row < steps; row++) for (let col = 0; col < OCEAN_SECTORS; col++) {
      const a = base + row * (OCEAN_SECTORS + 1) + col
      const b = a + OCEAN_SECTORS + 1
      // Positive-Y winding. The centre row contributes a fan, not a second
      // degenerate triangle with two coincident centre vertices.
      if (innerM !== 0 || row !== 0) indices.push(a, a + 1, b + 1)
      indices.push(a, b + 1, b)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setIndex(indices)
  return geometry
}

/**
 * Bilinear sample of a square, node-centred grid texture covering the
 * `[-h, h]` box, at world `worldXZ`. The sample count is the TEXTURE'S OWN
 * width, never a count carried in from somewhere else: until 2026-09-18 this
 * read `field.header.samples` for every texture it was handed, which was
 * right only while the terrain texture happened to be the same L4 grid as
 * the GEBCO field. The day `FINEST_FETCHED_LEVEL` went 4 -> 2 (`eef5b4d`)
 * the terrain texture became 2049 wide, this kept indexing it as 513, every
 * land-weight lookup landed a quarter of the way across the box -- over Leyte
 * for most of the gulf -- and the waves silently vanished. `gridSampleAt`
 * below is the CPU statement of these lines; `oceanLandWeight` in the
 * diagnostics hook reads it against the live texture, and the ocean Tier 2
 * scene test asserts it over open water.
 */
function depthNode(halfExtentM: number, tex: DataTexture, worldXZ: Node<'vec2'>, signed = false): Node<'float'> {
  const n = textureSamples(tex)
  const h = halfExtentM
  const col = clamp(worldXZ.x.add(h).div(2 * h).mul(n - 1), 0, n - 1)
  const row = clamp(worldXZ.y.add(h).div(2 * h).mul(n - 1), 0, n - 1)
  const x0 = floor(col), z0 = floor(row)
  const x1 = min(x0.add(1), n - 1), z1 = min(z0.add(1), n - 1)
  const read = (x: Node<'float'>, z: Node<'float'>): Node<'float'> => textureLoad(tex, ivec2(int(x), int(z))).r
  const north = mix(read(x0, z0), read(x1, z0), col.sub(x0))
  const south = mix(read(x0, z1), read(x1, z1), col.sub(x0))
  const interpolated = mix(north, south, row.sub(z0))
  const value = signed ? interpolated : min(0, interpolated)
  const inside = worldXZ.x.abs().lessThanEqual(h).and(worldXZ.y.abs().lessThanEqual(h))
  return inside.select(value, float(OUTSIDE_DEPTH_M))
}

/** The side of a square grid texture, or a throw: a non-square texture has no single sample count to index by. */
export function textureSamples(tex: Pick<DataTexture, 'image'>): number {
  const { width, height } = tex.image
  if (!(width > 0) || width !== height) throw new Error(`ocean: expected a square grid texture, got ${width}x${height}`)
  return width
}

/**
 * CPU statement of `depthNode`: the same bilinear sample of a square grid
 * of `n` per side over `[-h, h]`, `OUTSIDE_DEPTH_M` beyond it. `signed`
 * keeps positive (land) values, as the terrain lookup needs; the default
 * clamps to water like the depth lookup does.
 */
export function gridSampleAt(values: ArrayLike<number>, n: number, halfExtentM: number, x: number, z: number, signed = false): number {
  const h = halfExtentM
  if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > h || Math.abs(z) > h) return OUTSIDE_DEPTH_M
  if (values.length !== n * n) throw new Error(`ocean: grid of ${values.length} values is not ${n}x${n}`)
  const col = Math.min(Math.max((x + h) / (2 * h) * (n - 1), 0), n - 1)
  const row = Math.min(Math.max((z + h) / (2 * h) * (n - 1), 0), n - 1)
  const x0 = Math.floor(col), z0 = Math.floor(row)
  const x1 = Math.min(x0 + 1, n - 1), z1 = Math.min(z0 + 1, n - 1)
  const at = (ix: number, iz: number): number => values[iz * n + ix]!
  const north = at(x0, z0) + (at(x1, z0) - at(x0, z0)) * (col - x0)
  const south = at(x0, z1) + (at(x1, z1) - at(x0, z1)) * (col - x0)
  const value = north + (south - north) * (row - z0)
  return signed ? value : Math.min(0, value)
}

/** `landWeightFromTerrain` at a world position, read from the terrain grid the ocean was given. */
export function landWeightAt(terrain: Pick<DataTexture, 'image'>, halfExtentM: number, x: number, z: number): number {
  const n = textureSamples(terrain)
  return landWeightFromTerrain(gridSampleAt(terrain.image.data as ArrayLike<number>, n, halfExtentM, x, z, true))
}

/**
 * Fraction of the local water depth a wave may reach before it breaks.
 *
 * 0.4 is the conventional depth-limited breaking criterion -- a wave whose
 * height passes roughly 0.4 of the depth it is in breaks rather than growing.
 * **An estimate in the sense this project means it**: the right order and the
 * right shape, not a figure taken from a specific reference, and the number to
 * turn if shallow water looks wrong.
 */
export const BREAKING_HEIGHT_RATIO = 0.4

/** Floor on the divisor in `shoalingScale`, so a flat-calm vertex does not
 *  divide by zero. Far below any wave height that could be seen. */
const SHOALING_EPSILON_M = 1e-4

/**
 * How much to scale a wave of local height `elevationM` sitting in water of
 * depth `depthM` (NEGATIVE below sea level, matching `depthAt`).
 *
 * **This replaced `attenuationFromDepth` on 2026-09-17, and the difference is
 * a cap versus a ramp.** That function returned `smoothstep(0, 100, depth)`,
 * so **full wave amplitude required 100 m of water** -- and Leyte Gulf is 2 to
 * 6 m deep for tens of kilometres off Tacloban. It went unnoticed while the
 * default spawn was 600 m above 125 m of open water (multiplier 1.000); the
 * moment Plan 11a parked the airplane on a runway beside San Pedro Bay, every
 * wave in view was multiplied by about 0.001 and Mark reported the sea as flat
 * colour.
 *
 * A cap does nothing to a wave that already fits, which is the whole point: a
 * 10 cm ripple in 2 m of water is left alone here and was cut to 0.001 before.
 * Deep water is untouched because the cap never binds there.
 *
 * Returns a finite value in [0, 1] for every input, including NaN -- this runs
 * per-vertex per-frame and a non-finite vertex position is master spec §9's
 * named hazard. A NaN in either argument yields 0, i.e. no wave, because
 * "draw nothing" is the safe reading of "I do not know".
 */
export function shoalingScale(elevationM: number, depthM: number): number {
  if (Number.isNaN(elevationM) || Number.isNaN(depthM)) return 0
  const waterM = depthM < 0 ? -depthM : 0
  const capM = BREAKING_HEIGHT_RATIO * waterM
  if (!(capM > 0)) return 0
  const heightM = Math.abs(elevationM)
  // Negated rather than `heightM <= capM`, so two infinities read as "it
  // fits" instead of producing Infinity/Infinity = NaN.
  if (!(heightM > capM)) return 1
  return capM / heightM
}

/**
 * Metres of rendered land above sea level over which waves are suppressed.
 *
 * Small on purpose: the term exists to hide the disagreement between the GEBCO
 * shoreline and the terrain DEM's shoreline, which is metres, not tens of them.
 */
export const SHORELINE_FADE_M = 2

/**
 * How much of the wave field survives at a point whose TERRAIN height is
 * `terrainHeightM` (positive above sea level).
 *
 * **This is the bug that made the sea flat, and it is worth reading twice.**
 * The expression here was `smoothstep(0, 2, -terrainHeightM)` -- it demanded
 * the terrain grid read 2 m BELOW sea level before allowing any waves at all.
 * That assumes the terrain pyramid carries bathymetry. It does not: the
 * pipeline stores land heights with the sea at zero, and the bathymetry lives
 * in the separate GEBCO field this module also samples. Measured 2026-09-17
 * over the whole 200 km box on the committed L4 field, 40,000 samples: **not
 * one reads below -2 m**, and 63.6% read exactly 0.
 *
 * So it evaluated to zero over every square metre of water in the world, and
 * it multiplies the entire displacement sum. Live from `b6a3929` -- Plan 5's
 * last ocean commit, which started passing the terrain texture -- until
 * 2026-09-17. Nothing caught it: the ocean's GPU tests assert the FFT compute
 * output rather than the rendered displacement, and the depth-attenuation unit
 * test asserted a DIFFERENT term (`attenuationFromDepth`) that was also
 * suppressing waves for its own unrelated reason, so the sea looked explicably
 * flat.
 *
 * `OUTSIDE_DEPTH_M` (-8000) comes back from `depthNode` beyond the 200 km box
 * and the ocean mesh reaches 400 km, so open sea past the DEM reads 1 here.
 *
 * Non-finite reads as open water rather than land: a NaN must not paint a
 * silent flat patch on the sea, which is the failure this whole function is.
 */
export function landWeightFromTerrain(terrainHeightM: number): number {
  if (!Number.isFinite(terrainHeightM)) return 1
  const t = Math.min(1, Math.max(0, terrainHeightM / SHORELINE_FADE_M))
  return 1 - t * t * (3 - 2 * t)
}

/**
 * World metres covered by one pixel on the water, at horizontal distance
 * `distanceM` from an eye `eyeHeightM` up, with `pixelAngleRad` of view angle
 * per pixel.
 *
 * **Why this replaced two different criteria.** The wave field is drawn by two
 * shader stages, and until 2026-09-17 each measured its own thing: the vertex
 * stage compared a cascade's wavelength to the mesh's angular sample spacing
 * (`angularSampleSpacingM`), while the fragment stage compared it to
 * `max(length(dFdx(worldXZ)), length(dFdy(worldXZ)))`. Those are different
 * quantities, so every cascade had TWO transitions at different distances --
 * geometry displacing where nothing shaded it, or the reverse. Measured for
 * the 32 m swell from a chase camera 10 m up: geometry to 1304 m, shading gone
 * by 406 m.
 *
 * `dFdx` is a fragment-stage derivative and cannot be read while displacing a
 * vertex, which is why the two ever differed. This is the same measurement
 * written analytically from quantities BOTH stages have -- distance, eye
 * height and the per-pixel view angle -- so the two can use one expression and
 * one threshold, and a cascade either contributes to both or neither.
 *
 * Two terms, and the second dominates at any distance worth caring about:
 * across the view a pixel covers `d * pixelAngle`, but along it the surface is
 * seen at a grazing angle and one pixel covers `d^2/eyeHeight * pixelAngle`.
 * That is why a low eye height loses wave detail so much closer in -- from 2 m
 * up, a pixel covers ~390 m of sea at 900 m out.
 */
export function pixelFootprintM(distanceM: number, eyeHeightM: number, pixelAngleRad: number): number {
  if (!(distanceM > 0) || !(pixelAngleRad > 0)) return 0
  const across = distanceM * pixelAngleRad
  const along = ((distanceM * distanceM) / Math.max(eyeHeightM, MIN_EYE_HEIGHT_M)) * pixelAngleRad
  const worst = Math.max(across, along)
  return Number.isFinite(worst) ? worst : 0
}

/** Floor on eye height in `pixelFootprintM`, so sitting exactly on the surface
 *  does not divide by zero. Well below the 2.2 m the parked airplane's wheels
 *  put the camera above the ground. */
const MIN_EYE_HEIGHT_M = 0.5

/** Metres between neighbouring azimuth samples of the polar mesh at a given
 *  distance from the eye. This is the resolution limit the wave fade exists
 *  to respect. */
export function angularSampleSpacingM(distanceM: number): number {
  if (!(distanceM > 0)) return 0
  return (distanceM * 2 * Math.PI) / OCEAN_SECTORS
}

/**
 * CPU mirrors of the two per-cascade fades the shader runs, one per stage.
 *
 * **Two, because the stages are limited by different things**, and fusing them
 * was tried on 2026-09-17 and measured worse: the vertex stage can only
 * displace where the mesh has vertices, while the fragment stage can shade
 * detail finer than any vertex, which is what a normal map is for. Forcing
 * both onto the worse of the two limits cost 74% of the near-field wave
 * texture on the reference GPU (peak row-texture 1.12 -> 0.29).
 *
 * What they DO share is the threshold pair from `angularFadeSpacingM`, so the
 * two edges stay close together and each is a gradient rather than a ring.
 */
export function meshFadeWeight(wavelengthM: number, distanceM: number): number {
  return fadeFrom(wavelengthM, angularSampleSpacingM(distanceM))
}

/** The fragment stage's fade: same thresholds, measured against the screen
 *  footprint rather than the mesh. See `meshFadeWeight` for why both exist. */
export function screenFadeWeight(
  wavelengthM: number,
  distanceM: number,
  eyeHeightM: number,
  pixelAngleRad: number,
): number {
  return fadeFrom(wavelengthM, pixelFootprintM(distanceM, eyeHeightM, pixelAngleRad))
}

function fadeFrom(wavelengthM: number, spacingM: number): number {
  if (!(wavelengthM > 0) || !Number.isFinite(wavelengthM)) return 0
  const { fadeFromM, goneAtM } = angularFadeSpacingM(wavelengthM)
  if (!(goneAtM > fadeFromM)) return 0
  const t = Math.min(1, Math.max(0, (spacingM - fadeFromM) / (goneAtM - fadeFromM)))
  return 1 - t * t * (3 - 2 * t)
}

/**
 * The coarsest sampling the wave field is subject to at a point: the WORSE of
 * the mesh's angular spacing and the screen's pixel footprint.
 *
 * **Both limits are real and neither dominates everywhere.** Low down, the
 * footprint runs away as d^2/eye-height and is the binding limit within a few
 * hundred metres. High up, the footprint is small but the polar mesh is coarse
 * at range -- at 11 km its angular spacing is 135 m, so it cannot carry a 32 m
 * swell however many pixels the swell covers. Fading on the footprint alone
 * (as this module briefly did on 2026-09-17) therefore asks the mesh to draw
 * waves it has no vertices for.
 *
 * `max` of the two spacings is the honest answer and it is what both shader
 * stages fade on. It also makes "the mesh must resolve any wave it draws" true
 * by construction rather than by a separate assertion.
 */
export function effectiveSpacingM(distanceM: number, eyeHeightM: number, pixelAngleRad: number): number {
  return Math.max(angularSampleSpacingM(distanceM), pixelFootprintM(distanceM, eyeHeightM, pixelAngleRad))
}

/**
 * CPU mirror of the shader's per-cascade fade: 1 where `wavelengthM` is
 * sampled finely enough at this point, 0 where it is not, smooth between.
 *
 * Thresholds come from `angularFadeSpacingM` (bands.ts) and the measured
 * quantity from `effectiveSpacingM` above -- the same pair the vertex and
 * fragment stages use, so this is a mirror to assert against rather than a
 * second implementation that could drift.
 */
export function fadeWeight(
  wavelengthM: number,
  distanceM: number,
  eyeHeightM: number,
  pixelAngleRad: number,
): number {
  if (!(wavelengthM > 0) || !Number.isFinite(wavelengthM)) return 0
  const { fadeFromM, goneAtM } = angularFadeSpacingM(wavelengthM)
  if (!(goneAtM > fadeFromM)) return 0
  const spacingM = effectiveSpacingM(distanceM, eyeHeightM, pixelAngleRad)
  const t = Math.min(1, Math.max(0, (spacingM - fadeFromM) / (goneAtM - fadeFromM)))
  return 1 - t * t * (3 - 2 * t)
}

/** Explicit periodic bilinear sampling also works on unfilterable float textures. */
function waveSample(tex: Texture, world: Node<'vec2'>, n: number, patchM: number): Node<'vec4'> {
  const p = fract(world.div(patchM)).mul(n)
  const base = floor(p)
  const next = base.add(1).mod(n)
  const f = fract(p)
  const read = (x: Node<'float'>, y: Node<'float'>) => textureLoad(tex, ivec2(int(x), int(y)))
  return mix(mix(read(base.x, base.y), read(next.x, base.y), f.x),
    mix(read(base.x, next.y), read(next.x, next.y), f.x), f.y)
}

const eyeHeights = new WeakMap<Object3D, UniformNode<'float', number>>()
const pixelAngles = new WeakMap<Object3D, UniformNode<'float', number>>()
const cameras = new WeakMap<Object3D, UniformNode<'vec2', Vector2>>()
/** Exposes the actual sampling uniform so recentering can be tested. */
export function oceanCameraXZ(ocean: Object3D): Vector2 {
  const camera = cameras.get(ocean)
  if (!camera) throw new Error('ocean: object was not created by createOcean')
  return camera.value
}

/** Camera-centred curved water, with optional deterministic GPU wave bands. */
export function createOcean(field: DepthField, beaufort: number, cascades: readonly OceanCompute[] = [], terrainTexture?: DataTexture, shadow?: CloudShadowHandle): Object3D {
  windSpeedMps(beaufort)
  const camera = uniform(new Vector2())
  const eyeHeight = uniform(1000)
  // Radians of view per pixel. Defaulted to a 60 deg vertical field over 1080
  // rows -- what `CAMERA_VFOV_DEG` and a common viewport give -- so a caller
  // that never calls `recentreOcean` still gets a sane fade rather than none.
  const pixelAngle = uniform(((60 * Math.PI) / 180) / 1080)
  if (terrainTexture) textureSamples(terrainTexture)
  const tex = new DataTexture(Float32Array.from(field.samples), field.header.samples, field.header.samples, RedFormat, FloatType)
  tex.minFilter = tex.magFilter = NearestFilter
  tex.needsUpdate = true
  const material = new MeshBasicNodeMaterial()
  const distanceM = length(positionLocal.xz)
  const vertexWorld = positionLocal.xz.add(camera)
  // GEBCO and the terrain coastline have different resolutions. Suppress
  // waves on rendered land as well as at the bathymetric shoreline.
  // `1 - smoothstep(0, SHORELINE_FADE_M, height)`, NOT `smoothstep(0, 2,
  // -height)` -- see `landWeightFromTerrain` above, which is the CPU statement
  // of this line and carries why the old form was zero over all water.
  const landWeight = terrainTexture
    ? float(1).sub(smoothstep(0, SHORELINE_FADE_M, depthNode(field.header.halfExtentM, terrainTexture, vertexWorld, true)))
    : float(1)
  // Positive metres of water under this vertex.
  const waterM = depthNode(field.header.halfExtentM, tex, vertexWorld).negate()
  // `pixelFootprintM` above, as nodes. ONE expression, evaluated in both the
  // vertex and the fragment stage, so a cascade's two transitions become one.
  // The MESH's angular spacing -- what limits the vertex stage, which can only
  // displace where it has vertices.
  const meshSpacingM = distanceM.mul(2 * Math.PI / OCEAN_SECTORS)
  // The SCREEN's footprint -- what limits the fragment stage. Deliberately a
  // different quantity, and on 2026-09-17 this module briefly fused the two on
  // the theory that one criterion must be right. It is not: a normal map shows
  // detail the mesh has no vertices for, which is the whole point of one, and
  // fusing them cost 74% of the near-field wave texture (measured on the
  // reference GPU: peak row-texture 1.12 -> 0.29). The stages differ because
  // they are limited by different things.
  const screenFootprintM = max(
    distanceM.mul(pixelAngle),
    distanceM.mul(distanceM).div(max(eyeHeight, MIN_EYE_HEIGHT_M)).mul(pixelAngle),
  )
  // The raw sum of the bands, before anything about the water they are in.
  let raw: Node<'vec3'> = vec3(0)
  for (const cascade of cascades) {
    // Fade wavelengths the polar mesh cannot sample. Thresholds from
    // `angularFadeSpacingM` (bands.ts) -- Nyquist, two samples across the
    // wavelength -- and asserted on the CPU through `angularFadeWeight`,
    // which reads the same function rather than restating the arithmetic.
    const { fadeFromM, goneAtM } = angularFadeSpacingM(shortestWavelengthM(cascade.options))
    const weight = float(1).sub(smoothstep(fadeFromM, goneAtM, meshSpacingM))
    raw = raw.add(Fn(() => {
      const contribution = vec3(0).toVar()
      If(weight.greaterThan(0), () => {
        contribution.assign(waveSample(cascade.displacement, vertexWorld,
          cascade.options.n, cascade.options.patchM).xyz.mul(weight))
      })
      return contribution
    })())
  }
  // Depth-limited breaking, applied to the SUM and not per cascade: the wave
  // that has to fit in the water is the one actually there, which is all three
  // bands together. Capping each band separately would let their total exceed
  // the limit every one of them individually respected.
  //
  // `shoalingScale` (above) is the CPU statement of these three lines and is
  // what the unit tests asserted; read them against each other. On land
  // `waterM` is negative, so the cap is negative, so `clamp` returns 0 and
  // there are no waves -- the behaviour the old depth ramp also had, kept.
  const shoal = clamp(waterM.mul(BREAKING_HEIGHT_RATIO).div(max(raw.y.abs(), SHOALING_EPSILON_M)), 0, 1)
  const displacement: Node<'vec3'> = raw.mul(landWeight).mul(shoal)
  const displacedPosition = vec3(positionLocal.x, horizonSinkNode(distanceM).negate(), positionLocal.z).add(displacement)
  material.positionNode = displacedPosition
  // Photoreal Task 6: the mesh follows the eye, so its object matrices say
  // nothing about where the SEA was last frame; the water is world-fixed
  // (wave motion ignored, centimetres per frame -- scene/velocity.ts). A
  // `mrtNode`, so the shadow and radar passes (no MRT) ignore it.
  material.mrtNode = worldFixedVelocityMrt()
  // Geometry follows the eye, but the texture samples fixed world positions.
  const worldXZ = varying(positionLocal.xz).add(camera)
  const depth = depthNode(field.header.halfExtentM, tex, worldXZ)
  const waterColour = mix(color(SHALLOW_WATER_COLOUR), color(DEEP_WATER_COLOUR), smoothstep(0, DEEP_COLOUR_DEPTH_M, depth.negate()))
  let slopes: Node<'vec2'> = camera.mul(0)
  let foam: Node<'float'> = float(0)
  for (const cascade of cascades) {
    const wavelength = shortestWavelengthM(cascade.options)
    // Was `smoothstep(0, 100, depth)` -- a SECOND, independent copy of the
    // 100 m depth ramp that made the displacement path flat, which is why
    // fixing only the geometry left the sea still looking like paint. The
    // shading now reads the same `shoal` and `landWeight` the geometry does,
    // so the two cannot disagree about where there are waves.
    //
    // The footprint fade is deliberately left at wavelength/4..wavelength/2:
    // it is a SCREEN-space criterion (dFdx/dFdy of world position per pixel),
    // not the mesh's angular sampling, and relaxing it is a separate
    // shimmer judgement from the one taken for the geometry.
    // Thresholds from `angularFadeSpacingM`, the SAME function the vertex
    // stage reads -- see `ANGULAR_FADE_SAMPLES_PER_WAVELENGTH` (bands.ts) for
    // why one shared constant rather than the literals that used to sit here.
    // The measured quantity differs (pixel footprint here, mesh angular
    // spacing there) because the two stages know different things; the
    // threshold must not.
    const { fadeFromM, goneAtM } = angularFadeSpacingM(wavelength)
    // `screenFootprintM`, analytic rather than `dFdx`/`dFdy` so the CPU can
    // mirror it (`fadeWeight`), and the SAME widened thresholds the vertex
    // stage uses -- what makes each edge a gradient instead of a ring.
    const weight = shoal.mul(landWeight).mul(float(1).sub(smoothstep(fadeFromM, goneAtM, screenFootprintM)))
    const detail = Fn(() => {
      const value = vec4(0).toVar()
      If(weight.greaterThan(0), () => {
        const sampledNormal = waveSample(cascade.normal, worldXZ, cascade.options.n, cascade.options.patchM)
        value.assign(vec4(sampledNormal.xz.div(max(sampledNormal.y, 0.1)).mul(weight),
          waveSample(cascade.foam, worldXZ, cascade.options.n, cascade.options.patchM).r.mul(weight), 0))
      })
      return value
    })()
    slopes = slopes.add(detail.xy)
    foam = max(foam, detail.z)
  }
  const normal = normalize(vec3(slopes.x, 1, slopes.y))
  const view = normalize(vec3(0, eyeHeight, 0).sub(varying(displacedPosition)))
  const fresnel = float(0.0204).add(pow(float(1).sub(clamp(dot(normal, view), 0, 1)), 5).mul(0.9796))
  // Plan 16c: a specular glint where the wave normals reflect the sun.
  // Photoreal Task 9: in the atmosphere's sun color (scene units, black
  // below the dusk floor, so the glint dies with the sun), bright enough to
  // bloom.
  const sun = normalize(sunDirectionNode)
  const glint = pow(max(dot(reflect(view.negate(), normal), sun), 0), 180).mul(sunColorNode).mul(fresnel)
  // Photoreal Task 9: the subsurface color and the foam are lit by the
  // irradiance on the up-facing sea -- the transmitted sun on the horizontal
  // plus the sky's (`skyIrradianceUpNode`, dusk floor included) -- as
  // albedo/pi x E, the terrain's Lambertian. At noon that is ~1, the scale
  // the colors were chosen at; at dusk it falls with the light, as the old
  // palette's ambient scale did (without it the sea glowed turquoise under
  // a navy sky, read 2026-09-19).
  const seaIrradiance = seaIrradianceOverPi()
  const subsurface = waterColour.mul(seaIrradiance)
  // `color()`'s type admits only scalar `mul` (clouds.ts has the same cast).
  const foamColour = (color(0xe4eff0) as unknown as Node<'vec3'>).mul(seaIrradiance)
  // The sky the water reflects (photoreal Task 12, spec §4.5): the sky-view
  // LUT along the eye ray reflected off the per-fragment WAVE normal, so each
  // facet takes the color of the sky it faces -- far field the grazing
  // horizon sky, near field the higher, bluer sky mixed with the subsurface
  // hue by Fresnel. `reflectedSky` floors the direction at the true horizon
  // (atmosphereShading.ts); with a flat normal it is exactly `mirroredSky`,
  // which the terrain's far fade reads, so the two still meet.
  const eyeToVertex = displacedPosition.sub(vec3(0, eyeHeight, 0))
  const eyeDistanceM = length(eyeToVertex)
  const reflectedSkyColor = reflectedSky(reflect(view.negate(), normal))
  const unshadowed = cascades.length === 0 ? subsurface : mix(
    mix(subsurface.mul(max(normal.y, 0.3)), reflectedSkyColor, fresnel), foamColour, clamp(foam, 0, 1)).add(glint)
  // Plan 16b: under cloud the sea loses glint and subsurface light but still
  // reflects the sky, hence a floor rather than the terrain's direct-only
  // scale. The sea is at y = 0, so `worldXZ` is the true world point and the
  // parallax is zero.
  const shadowT = shadow ? shadow.node(vec3(worldXZ.x, 0, worldXZ.y), 'world') : float(1)
  // Aerial perspective (atmosphereShading.ts), per vertex like the terrain's;
  // past the LUT's 100 km it is extrapolated, carrying the 400 km sea into the
  // horizon haze. The terrain fades to THIS sea at its draw distance.
  const ap = varying(aerialPerspective(eyeToVertex, eyeDistanceM))
  const lit = unshadowed.mul(mix(float(OCEAN_SHADOW_FLOOR), float(1), shadowT))
  material.colorNode = shadow?.showing ? vec3(shadowT, shadowT, shadowT) : lit.mul(ap.a).add(ap.rgb)
  const mesh = new Mesh(oceanGeometry(oceanRings(OCEAN_EXTENT_M, 8)), material)
  mesh.frustumCulled = false // shader changes bounds; the disc always surrounds the eye
  mesh.userData.disposeOcean = () => { mesh.geometry.dispose(); material.dispose(); tex.dispose() }
  cameras.set(mesh, camera)
  eyeHeights.set(mesh, eyeHeight)
  pixelAngles.set(mesh, pixelAngle)
  return mesh
}

export function recentreOcean(ocean: Object3D, cameraX: number, cameraZ: number, eyeHeightM = 1000, pixelAngleRad?: number): void {
  const height = eyeHeights.get(ocean)
  if (height) height.value = eyeHeightM
  const angle = pixelAngles.get(ocean)
  if (angle && pixelAngleRad !== undefined && pixelAngleRad > 0) angle.value = pixelAngleRad
  ocean.position.set(cameraX, 0, cameraZ)
  oceanCameraXZ(ocean).set(cameraX, cameraZ)
}
