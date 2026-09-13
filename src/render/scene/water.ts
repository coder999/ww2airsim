import { Mesh, MeshStandardMaterial, PlaneGeometry, RepeatWrapping, DataTexture, RGBAFormat, type Object3D } from 'three'

/**
 * Half of this must exceed `SKY_RADIUS_M`, or the plane runs out before the
 * dome does and the water/dome boundary lands deep inside the dome's lower
 * hemisphere instead of on its equator (whole-branch review, I-1). The
 * relation, not the number, is what `scene.test.ts` asserts.
 *
 * Deliberately NOT "big enough that the edge never enters frame", which is
 * what this comment used to claim and what no finite flat plane can achieve:
 * a plane at y = 0 is met by a ray at angle t below eye level at a distance
 * of altitude/sin(t), which runs to infinity as t goes to zero. Measured
 * 2026-09-13 against this project's own constants at the 600 m spawn: with
 * the old 40,000 m extent the boundary sat 1.718 degrees below eye level,
 * NDC y = -0.0520, about 37 px below centre at 1440p -- a hard line where a
 * pilot reads the horizon. The residual is handled in `sky.ts` by colour
 * rather than here by size.
 */
export const WATER_EXTENT_M = 100_000

/** The sea's flat colour. `sky.ts` paints the dome below its equator with this
 *  exact value; that is what makes the boundary invisible, so the two must
 *  never be given separate literals. */
export const SEA_COLOUR = 0x18384f

/** World metres per repeat of the surface-detail normal map. */
export const WATER_DETAIL_METRES = 40

/**
 * Flat water with procedural surface detail.
 *
 * The detail is not decoration and is not the ocean (that is Plan 4's FFT).
 * A uniform plane gives no motion parallax: at 170 m/s over featureless water
 * you cannot perceive speed, altitude or sink rate, which would leave this
 * plan unable to answer the only question it exists to answer -- how the
 * flight model feels. `recentreWater` exists to keep that true.
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
  normalMap.repeat.set(
    WATER_EXTENT_M / WATER_DETAIL_METRES,
    WATER_EXTENT_M / WATER_DETAIL_METRES,
  )
  normalMap.needsUpdate = true

  const mesh = new Mesh(
    new PlaneGeometry(WATER_EXTENT_M, WATER_EXTENT_M),
    new MeshStandardMaterial({ color: SEA_COLOUR, roughness: 0.35, metalness: 0.1, normalMap }),
  )
  mesh.rotation.x = -Math.PI / 2
  return mesh
}

/**
 * Slide the plane under the eye, keeping its surface detail on the sea.
 *
 * The sky dome has been re-centred every frame since Task 12; the water was
 * not, so it stayed at the world origin while the aeroplane flew away from it
 * (whole-branch review, I-1). At the spawn's 120 m/s the old 20,000 m
 * half-extent was spent in under three minutes, after which the aeroplane is
 * over nothing at all.
 *
 * Moving a textured plane drags its texture with it, which would make the
 * detail perfectly stationary relative to the aeroplane -- no parallax, i.e.
 * exactly the failure `createWater` exists to prevent, and a far more
 * misleading result than the edge it fixes. So the map's offset compensates.
 * With `u` running along world +X and `v` along world -Z (PlaneGeometry's UVs
 * after the -90-degree rotation about X), holding the sampled coordinate of a
 * fixed world point constant needs `offset = (eyeX, -eyeZ) / WATER_DETAIL_METRES`.
 * `scene.test.ts` pins this by computing the mapping independently rather than
 * by calling anything here.
 */
export function recentreWater(water: Object3D, eyeX: number, eyeZ: number): void {
  water.position.set(eyeX, 0, eyeZ)
  const map = ((water as Mesh).material as MeshStandardMaterial).normalMap
  if (map) map.offset.set(eyeX / WATER_DETAIL_METRES, -eyeZ / WATER_DETAIL_METRES)
}
