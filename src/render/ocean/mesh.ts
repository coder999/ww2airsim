import { BufferAttribute, BufferGeometry, DataTexture, FloatType, Mesh, NearestFilter, RedFormat, Vector2, type Texture, type Object3D } from 'three'
import { MeshBasicNodeMaterial, type Node, type UniformNode } from 'three/webgpu'
import { Fn, If, clamp, color, fract, dFdx, dFdy, max, normalize, dot, pow, float, floor, int, ivec2, length, min, mix, positionLocal, smoothstep, textureLoad, uniform, varying, vec3, vec4 } from 'three/tsl'
import { horizonSinkNode, OCEAN_EXTENT_M } from '../horizon.js'
import { SEA_COLOUR } from '../scene/water.js'
import { OUTSIDE_DEPTH_M, type DepthField } from './depth.js'
import type { OceanCompute } from './compute.js'
import { shortestWavelengthM } from './bands.js'
import { windSpeedMps } from './beaufort.js'

export const DEEP_WATER_COLOUR = SEA_COLOUR
/** Art direction: turquoise shallow water; this is not an optical model. */
export const SHALLOW_WATER_COLOUR = 0x397d83
/** Reach the deep colour by 100 m, just shallower than the -125 m gulf centre. */
export const DEEP_COLOUR_DEPTH_M = 100
export type Ring = { readonly innerM: number; readonly outerM: number; readonly quadM: number }

// 512 azimuth segments give 4.91 km outer edges at 400 km; radial edges are
// <=5 km. Their d²/R curvature second difference remains below 5 m. Radial
// growth by four gives sub-metre cells near the camera with eight rings.
const SECTORS = 512
const radialSteps = (inner: number, outer: number): number => Math.max(64, Math.ceil((outer - inner) / 5000))
export function oceanRings(extentM: number, rings: number): readonly Ring[] {
  if (!Number.isFinite(extentM) || extentM <= 0 || !Number.isInteger(rings) || rings < 1 || rings > 16) {
    throw new Error('ocean: expected positive extent and 1–16 rings')
  }
  return Array.from({ length: rings }, (_, i) => {
    const outerM = extentM / 4 ** (rings - 1 - i)
    const innerM = i === 0 ? 0 : outerM / 4
    return { innerM, outerM, quadM: Math.max((outerM - innerM) / radialSteps(innerM, outerM), 2 * Math.PI * outerM / SECTORS) }
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
      for (let col = 0; col <= SECTORS; col++) {
        const angle = 2 * Math.PI * (col % SECTORS) / SECTORS
        positions.push(radius * Math.cos(angle), 0, radius * Math.sin(angle))
      }
    }
    for (let row = 0; row < steps; row++) for (let col = 0; col < SECTORS; col++) {
      const a = base + row * (SECTORS + 1) + col
      const b = a + SECTORS + 1
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

/** Visual attenuation over the first 100 m of water depth. */
export function attenuationFromDepth(depthM: number): number {
  const t = Number.isNaN(depthM) ? 0 : Math.min(1, Math.max(0, -depthM / 100))
  return t * t * (3 - 2 * t)
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
  const tex = new DataTexture(Float32Array.from(field.samples), field.header.samples, field.header.samples, RedFormat, FloatType)
  tex.minFilter = tex.magFilter = NearestFilter
  tex.needsUpdate = true
  const material = new MeshBasicNodeMaterial()
  const distanceM = length(positionLocal.xz)
  const vertexWorld = positionLocal.xz.add(camera)
  // GEBCO and the terrain coastline have different resolutions. Suppress
  // waves on rendered land as well as at the bathymetric shoreline.
  const landWeight = terrainTexture ? smoothstep(0, 2, depthNode(field, terrainTexture, vertexWorld, true).negate()) : float(1)
  const attenuation = landWeight.mul(smoothstep(0, 100, depthNode(field, tex, vertexWorld).negate()))
  let displacement: Node<'vec3'> = vec3(0)
  for (const cascade of cascades) {
    // Fade wavelengths below the polar mesh's angular sampling distance.
    const weight = float(1).sub(smoothstep(shortestWavelengthM(cascade.options) / 4,
      shortestWavelengthM(cascade.options) / 2, distanceM.mul(2 * Math.PI / SECTORS)))
    displacement = displacement.add(Fn(() => {
      const contribution = vec3(0).toVar()
      If(weight.greaterThan(0), () => {
        contribution.assign(waveSample(cascade.displacement, vertexWorld,
          cascade.options.n, cascade.options.patchM).xyz.mul(weight).mul(attenuation))
      })
      return contribution
    })())
  }
  const displacedPosition = vec3(positionLocal.x, horizonSinkNode(distanceM).negate(), positionLocal.z).add(displacement)
  material.positionNode = displacedPosition
  // Geometry follows the eye, but the texture samples fixed world positions.
  const worldXZ = varying(positionLocal.xz).add(camera)
  const depth = depthNode(field, tex, worldXZ)
  const waterColour = mix(color(SHALLOW_WATER_COLOUR), color(DEEP_WATER_COLOUR), smoothstep(0, DEEP_COLOUR_DEPTH_M, depth.negate()))
  let slopes: Node<'vec2'> = camera.mul(0)
  let foam: Node<'float'> = float(0)
  for (const cascade of cascades) {
    const footprint = max(length(dFdx(worldXZ)), length(dFdy(worldXZ)))
    const wavelength = shortestWavelengthM(cascade.options)
    const weight = smoothstep(0, 100, depth.negate()).mul(float(1).sub(smoothstep(wavelength / 4, wavelength / 2, footprint)))
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
  return mesh
}

export function recentreOcean(ocean: Object3D, cameraX: number, cameraZ: number, eyeHeightM = 1000): void {
  const height = eyeHeights.get(ocean)
  if (height) height.value = eyeHeightM
  ocean.position.set(cameraX, 0, cameraZ)
  oceanCameraXZ(ocean).set(cameraX, cameraZ)
}
