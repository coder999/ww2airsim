import { BufferAttribute, BufferGeometry, DataTexture, FloatType, Mesh, NearestFilter, RedFormat, Vector2, type Object3D } from 'three'
import { MeshBasicNodeMaterial, type Node, type UniformNode } from 'three/webgpu'
import { clamp, color, float, floor, int, ivec2, length, min, mix, positionLocal, smoothstep, textureLoad, uniform, varying, vec3 } from 'three/tsl'
import { horizonSinkNode, OCEAN_EXTENT_M } from '../horizon.js'
import { SEA_COLOUR } from '../scene/water.js'
import { OUTSIDE_DEPTH_M, type DepthField } from './depth.js'
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

function depthNode(field: DepthField, tex: DataTexture, worldXZ: Node<'vec2'>): Node<'float'> {
  const { samples: n, halfExtentM: h } = field.header
  const col = clamp(worldXZ.x.add(h).div(2 * h).mul(n - 1), 0, n - 1)
  const row = clamp(float(h).sub(worldXZ.y).div(2 * h).mul(n - 1), 0, n - 1)
  const x0 = floor(col), z0 = floor(row)
  const x1 = min(x0.add(1), n - 1), z1 = min(z0.add(1), n - 1)
  const read = (x: Node<'float'>, z: Node<'float'>): Node<'float'> => textureLoad(tex, ivec2(int(x), int(z))).r
  const north = mix(read(x0, z0), read(x1, z0), col.sub(x0))
  const south = mix(read(x0, z1), read(x1, z1), col.sub(x0))
  const value = min(0, mix(north, south, row.sub(z0)))
  const inside = worldXZ.x.abs().lessThanEqual(h).and(worldXZ.y.abs().lessThanEqual(h))
  return inside.select(value, float(OUTSIDE_DEPTH_M))
}

const cameras = new WeakMap<Object3D, UniformNode<'vec2', Vector2>>()
/** Exposes the actual sampling uniform so recentering can be tested. */
export function oceanCameraXZ(ocean: Object3D): Vector2 {
  const camera = cameras.get(ocean)
  if (!camera) throw new Error('ocean: object was not created by createOcean')
  return camera.value
}

/** Flat-water milestone: curvature and bathymetric colour, before GPU FFT. */
export function createOcean(field: DepthField, beaufort: number): Object3D {
  windSpeedMps(beaufort)
  const camera = uniform(new Vector2())
  const tex = new DataTexture(Float32Array.from(field.samples), field.header.samples, field.header.samples, RedFormat, FloatType)
  tex.minFilter = tex.magFilter = NearestFilter
  tex.needsUpdate = true
  const material = new MeshBasicNodeMaterial()
  const distanceM = length(positionLocal.xz)
  material.positionNode = vec3(positionLocal.x, horizonSinkNode(distanceM).negate(), positionLocal.z)
  // Geometry follows the eye, but the texture samples fixed world positions.
  const worldXZ = varying(positionLocal.xz).add(camera)
  const depth = depthNode(field, tex, worldXZ)
  material.colorNode = mix(color(SHALLOW_WATER_COLOUR), color(DEEP_WATER_COLOUR), smoothstep(0, DEEP_COLOUR_DEPTH_M, depth.negate()))
  const mesh = new Mesh(oceanGeometry(oceanRings(OCEAN_EXTENT_M, 8)), material)
  mesh.frustumCulled = false // shader changes bounds; the disc always surrounds the eye
  mesh.userData.disposeOcean = () => { mesh.geometry.dispose(); material.dispose(); tex.dispose() }
  cameras.set(mesh, camera)
  return mesh
}

export function recentreOcean(ocean: Object3D, cameraX: number, cameraZ: number): void {
  ocean.position.set(cameraX, 0, cameraZ)
  oceanCameraXZ(ocean).set(cameraX, cameraZ)
}
