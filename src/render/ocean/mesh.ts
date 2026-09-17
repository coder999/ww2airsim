import { BufferAttribute, BufferGeometry, DataTexture, FloatType, Mesh, NearestFilter, RedFormat, Vector2, type Texture, type Object3D } from 'three'
import { MeshBasicNodeMaterial, type Node, type UniformNode } from 'three/webgpu'
import { Fn, If, clamp, color, fract, max, normalize, dot, pow, float, floor, int, ivec2, length, min, mix, positionLocal, smoothstep, textureLoad, uniform, varying, vec3, vec4 } from 'three/tsl'
import { horizonSinkNode, OCEAN_EXTENT_M } from '../horizon.js'
import { SEA_COLOUR } from '../scene/water.js'
import { OUTSIDE_DEPTH_M, type DepthField } from './depth.js'
import type { OceanCompute } from './compute.js'
import { angularFadeSpacingM, shortestWavelengthM } from './bands.js'
import { windSpeedMps } from './beaufort.js'

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

function depthNode(field: DepthField, tex: DataTexture, worldXZ: Node<'vec2'>, signed = false): Node<'float'> {
  const { samples: n, halfExtentM: h } = field.header
  const col = clamp(worldXZ.x.add(h).div(2 * h).mul(n - 1), 0, n - 1)
  const row = clamp(float(h).sub(worldXZ.y).div(2 * h).mul(n - 1), 0, n - 1)
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
 * CPU reference for the shader's per-cascade wave fade: 1 where the mesh
 * resolves `wavelengthM` at `distanceM`, 0 where it cannot, smooth between.
 *
 * The thresholds come from `angularFadeSpacingM` (bands.ts), which the shader
 * reads too -- the wavelength is known on the CPU, so the `smoothstep` there
 * takes these same plain numbers and there is no second implementation to
 * drift. This function exists to be asserted against, not to be mirrored.
 */
export function angularFadeWeight(wavelengthM: number, distanceM: number): number {
  if (!(wavelengthM > 0) || !Number.isFinite(wavelengthM)) return 0
  const { fadeFromM, goneAtM } = angularFadeSpacingM(wavelengthM)
  if (!(goneAtM > fadeFromM)) return 0
  const spacingM = angularSampleSpacingM(distanceM)
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
export function createOcean(field: DepthField, beaufort: number, cascades: readonly OceanCompute[] = [], terrainTexture?: DataTexture): Object3D {
  windSpeedMps(beaufort)
  const camera = uniform(new Vector2())
  const eyeHeight = uniform(1000)
  // Radians of view per pixel. Defaulted to a 60 deg vertical field over 1080
  // rows -- what `CAMERA_VFOV_DEG` and a common viewport give -- so a caller
  // that never calls `recentreOcean` still gets a sane fade rather than none.
  const pixelAngle = uniform(((60 * Math.PI) / 180) / 1080)
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
    ? float(1).sub(smoothstep(0, SHORELINE_FADE_M, depthNode(field, terrainTexture, vertexWorld, true)))
    : float(1)
  // Positive metres of water under this vertex.
  const waterM = depthNode(field, tex, vertexWorld).negate()
  // `pixelFootprintM` above, as nodes. ONE expression, evaluated in both the
  // vertex and the fragment stage, so a cascade's two transitions become one.
  const footprintM = max(
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
    const weight = float(1).sub(smoothstep(fadeFromM, goneAtM, footprintM))
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
  // Geometry follows the eye, but the texture samples fixed world positions.
  const worldXZ = varying(positionLocal.xz).add(camera)
  const depth = depthNode(field, tex, worldXZ)
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
    // `footprintM`, the SAME node the displacement above fades on -- not
    // `dFdx`/`dFdy`, which the vertex stage cannot read and which is why the
    // two stages used to disagree about where a cascade ends.
    const weight = shoal.mul(landWeight).mul(float(1).sub(smoothstep(fadeFromM, goneAtM, footprintM)))
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
  const fresnel = float(0.0204).add(pow(float(1).sub(clamp(dot(normal, normalize(vec3(0, eyeHeight, 0).sub(varying(displacedPosition)))), 0, 1)), 5).mul(0.9796))
  material.colorNode = cascades.length === 0 ? waterColour : mix(
    mix(waterColour.mul(max(normal.y, 0.3)), color(0x9abacb), fresnel), color(0xe4eff0), clamp(foam, 0, 1))
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
