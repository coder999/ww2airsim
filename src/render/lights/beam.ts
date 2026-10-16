import { AdditiveBlending, CylinderGeometry, DoubleSide, Mesh, Quaternion, Vector3 } from 'three'
import { NodeMaterial } from 'three/webgpu'
import { abs, dot, float, mix, normalView, normalize, pow, positionView, smoothstep, uniform, uv, vec3, vec4 } from 'three/tsl'
import type { Vec3 } from '../../sim/math/vec3.js'
import { LIGHT_CAPS } from '../../sim/lights/lights.js'

/**
 * Searchlight beams (F6A Task 6, ruling D6: a cone mesh with analytic scatter, not a volumetric
 * march). One additive, depth-tested cone per active beam, at most `LIGHT_CAPS.searchlights`.
 * Its brightness is analytic: bright where the line of sight runs through the thickest part of the cone
 * (|normal . view|), fading along its length and in the first metres by the lamp. Where the beam meets the
 * ground or a cloud base `beamLength` ends it, and the caller puts a glow sprite there.
 */
export const BEAM_MAX_M = 9000
/** The drawn beam's half-angle as a fraction of the lighting cone's: the bright core, not the whole cone. */
export const BEAM_VISUAL_HALF_ANGLE_RAD = (0.8 * Math.PI) / 180
/** Beam radiance before exposure (look constant, tuned at CP2). */
export const BEAM_RADIANCE = 0.7

export type BeamHit = { readonly lengthM: number; readonly hit: 'ground' | 'cloud' | null }

/**
 * How far a beam from `origin` along unit `axis` runs: to the terrain (marched in `stepM` steps, then
 * refined by bisection), or to a cloud base above it, or `BEAM_MAX_M`. `groundAt(x, z)` is the terrain
 * height; `cloudBaseM` is the lowest cumulus base or null for a clear sky.
 */
export function beamLength(origin: Vec3, axis: Vec3, groundAt: (x: number, z: number) => number, cloudBaseM: number | null, stepM = 40): BeamHit {
  let cloud = Infinity
  if (cloudBaseM !== null && axis.y > 1e-6 && cloudBaseM > origin.y) cloud = (cloudBaseM - origin.y) / axis.y
  const limit = Math.min(BEAM_MAX_M, cloud)
  const below = (t: number): boolean => origin.y + axis.y * t < groundAt(origin.x + axis.x * t, origin.z + axis.z * t)
  if (below(0)) return { lengthM: 0, hit: 'ground' }
  let lo = 0
  for (let t = stepM; t <= limit + stepM; t += stepM) {
    const tt = Math.min(t, limit)
    if (below(tt)) {
      let a = lo, b = tt
      for (let i = 0; i < 20; i++) { const m = (a + b) / 2; if (below(m)) b = m; else a = m }
      return { lengthM: (a + b) / 2, hit: 'ground' }
    }
    lo = tt
    if (tt >= limit) break
  }
  return cloud <= BEAM_MAX_M ? { lengthM: cloud, hit: 'cloud' } : { lengthM: BEAM_MAX_M, hit: null }
}

export type BeamInstance = { readonly origin: Vec3; readonly axis: Vec3; readonly lengthM: number; readonly gain: number }

export type Beams = {
  readonly group: Mesh[]
  update(beams: readonly BeamInstance[]): void
  dispose(): void
}

const Y = new Vector3(0, 1, 0)

export function createBeams(add: (m: Mesh) => void, remove: (m: Mesh) => void): Beams {
  // Apex at the origin, opening along +Y to unit length; scaled per beam.
  const geometry = new CylinderGeometry(1, 0, 1, 20, 1, true)
  geometry.translate(0, 0.5, 0)
  const meshes: Mesh[] = []
  const materials: NodeMaterial[] = []
  for (let i = 0; i < LIGHT_CAPS.searchlights; i++) {
    const material = new NodeMaterial()
    material.name = 'SearchlightBeam'
    const g = uniform(0)
    // CylinderGeometry's uv.y is 1 at its top: the wide end (radiusTop = 1). So 0 is the lamp (apex), 1 the far end.
    const along = uv().y
    const facing = abs(dot(normalize(normalView), normalize(positionView.negate())))
    const body = pow(facing, 2)
    const fadeIn = smoothstep(0, 0.02, along)
    const fadeOut = float(1).sub(smoothstep(0.55, 1, along))
    // Thinner and brighter near the lamp, as a real beam is; the haze scatter falls with distance.
    const near = mix(float(1.6), float(0.55), smoothstep(0, 0.4, along))
    const radiance = body.mul(fadeIn).mul(fadeOut).mul(near).mul(BEAM_RADIANCE).mul(g)
    material.fragmentNode = vec4(vec3(0.78, 0.9, 1).mul(radiance), 1)
    material.transparent = true
    material.depthTest = true
    material.depthWrite = false
    material.blending = AdditiveBlending
    material.side = DoubleSide
    ;(material as unknown as { userData: { gain: typeof g } }).userData.gain = g
    const mesh = new Mesh(geometry, material)
    mesh.name = `searchlight beam ${i}`
    mesh.visible = false
    mesh.frustumCulled = false
    mesh.renderOrder = 49
    meshes.push(mesh); materials.push(material)
    add(mesh)
  }
  const q = new Quaternion(), axisV = new Vector3()
  return {
    group: meshes,
    update(beams) {
      for (let i = 0; i < meshes.length; i++) {
        const mesh = meshes[i]!, b = beams[i]
        if (b === undefined || b.lengthM <= 0) { mesh.visible = false; continue }
        mesh.visible = true
        axisV.set(b.axis.x, b.axis.y, b.axis.z).normalize()
        q.setFromUnitVectors(Y, axisV)
        mesh.quaternion.copy(q)
        mesh.position.set(b.origin.x, b.origin.y, b.origin.z)
        const radius = b.lengthM * Math.tan(BEAM_VISUAL_HALF_ANGLE_RAD)
        mesh.scale.set(radius, b.lengthM, radius)
        ;(materials[i]!.userData as { gain: { value: number } }).gain.value = b.gain
      }
    },
    dispose() { for (const mesh of meshes) remove(mesh); geometry.dispose(); for (const mat of materials) mat.dispose() },
  }
}
