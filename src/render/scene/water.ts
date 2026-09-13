import { Mesh, MeshStandardMaterial, PlaneGeometry, RepeatWrapping, DataTexture, RGBAFormat, type Object3D } from 'three'

/** Big enough that its edge never enters frame at this plan's altitudes. */
export const WATER_EXTENT_M = 40_000

/**
 * Flat water with procedural surface detail.
 *
 * The detail is not decoration and is not the ocean (that is Plan 4's FFT).
 * A uniform plane gives no motion parallax: at 170 m/s over featureless water
 * you cannot perceive speed, altitude or sink rate, which would leave this
 * plan unable to answer the only question it exists to answer -- how the
 * flight model feels.
 */
export function createWater(): Object3D {
  const size = 64
  const data = new Uint8Array(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    // Deterministic value noise; no Math.random, matching the project rule
    // even though this is render-side and unsimulated.
    const x = i % size
    const y = (i / size) | 0
    const n = (Math.sin(x * 0.7) + Math.cos(y * 0.9) + Math.sin((x + y) * 0.3)) / 3
    const v = 128 + n * 40
    data[i * 4] = v
    data[i * 4 + 1] = v
    data[i * 4 + 2] = 255
    data[i * 4 + 3] = 255
  }
  const normalMap = new DataTexture(data, size, size, RGBAFormat)
  normalMap.wrapS = normalMap.wrapT = RepeatWrapping
  normalMap.repeat.set(WATER_EXTENT_M / 40, WATER_EXTENT_M / 40)
  normalMap.needsUpdate = true

  const mesh = new Mesh(
    new PlaneGeometry(WATER_EXTENT_M, WATER_EXTENT_M),
    new MeshStandardMaterial({ color: 0x18384f, roughness: 0.35, metalness: 0.1, normalMap }),
  )
  mesh.rotation.x = -Math.PI / 2
  return mesh
}
