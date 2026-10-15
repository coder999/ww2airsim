import { AdditiveBlending, DoubleSide, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, PlaneGeometry } from 'three'
import { NodeMaterial } from 'three/webgpu'
import {
  attribute, cameraProjectionMatrix, dot, exp, float, length, max, min, modelViewMatrix, positionGeometry, smoothstep, sqrt, uniform, varying, vec2, vec3, vec4,
} from 'three/tsl'
import { LIGHT_CAPS } from '../../sim/lights/lights.js'

/**
 * Glow sprites (F6A, plan §3.5 item 2): one instanced additive billboard draw
 * for every emitter, so a 30-pot runway costs one draw and no per-light
 * shading. HDR radiance, depth-tested against the scene so terrain hides a
 * glow, never writing depth. A glow has a MINIMUM on-screen size
 * (`MIN_PIXELS`) so a distant point light neither vanishes nor shimmers under
 * TRAA; it keeps its radiance when expanded (a point light does not get
 * dimmer with distance in the picture the way its area would say, which is
 * what makes a pot readable at six miles).
 *
 * The scene is camera-relative (`scene.position` = -eye), so an instance's
 * position is raw world metres and the model-view matrix does the shift.
 */
export const GLOW_CAPACITY = LIGHT_CAPS.glowSprites + LIGHT_CAPS.navSprites
/** Smallest drawn diameter, pixels. */
export const MIN_PIXELS = 5

export type GlowInstance = {
  readonly x: number; readonly y: number; readonly z: number
  /** World diameter of the halo, metres. */
  readonly sizeM: number
  /** HDR radiance at the core, scene units before exposure. */
  readonly r: number; readonly g: number; readonly b: number
}

export type GlowBatch = {
  readonly object: Mesh
  /** Writes up to GLOW_CAPACITY instances; returns the count drawn. */
  write(instances: readonly GlowInstance[]): number
  /** 2 * tan(fov / 2) / viewport height in pixels: the world size of one pixel at unit distance. */
  setPixelAngle(angle: number): void
  dispose(): void
}

export function createGlowBatch(): GlowBatch {
  const quad = new PlaneGeometry(2, 2)
  const geometry = new InstancedBufferGeometry()
  geometry.index = quad.index
  geometry.setAttribute('position', quad.getAttribute('position'))
  geometry.setAttribute('uv', quad.getAttribute('uv'))
  const pos = new InstancedBufferAttribute(new Float32Array(GLOW_CAPACITY * 4), 4)
  const col = new InstancedBufferAttribute(new Float32Array(GLOW_CAPACITY * 4), 4)
  geometry.setAttribute('glowPos', pos)
  geometry.setAttribute('glowColor', col)
  geometry.instanceCount = 0

  const pixelAngle = uniform(0.001)
  const ps = attribute('glowPos', 'vec4'), cl = attribute('glowColor', 'vec4')
  const corner = positionGeometry.xy
  const viewCenter = modelViewMatrix.mul(vec4(ps.xyz, 1))
  const dist = length(viewCenter.xyz)
  const size = max(ps.w, dist.mul(pixelAngle).mul(MIN_PIXELS))
  // Pull the quad toward the eye by half its size so the lower half of a glow
  // sitting on the ground is not cut by the terrain's own depth.
  const toEye = min(size.mul(0.5), dist.mul(0.5))
  const offset = vec4(corner.mul(size).mul(0.5), toEye, 0)
  const material = new NodeMaterial()
  material.name = 'LightGlow'
  material.vertexNode = cameraProjectionMatrix.mul(viewCenter.add(offset))
  const q = varying(vec2(corner.x, corner.y))
  const rr = dot(q, q)
  // A tight core and a wide halo; both HDR so the bloom spreads them.
  // Faded to nothing before the quad's edge, or the halo shows the quad's square outline.
  const edge = float(1).sub(smoothstep(0.55, 1, sqrt(rr)))
  const shape = exp(rr.mul(-14)).add(exp(rr.mul(-6)).mul(0.05)).mul(edge)
  material.fragmentNode = vec4(vec3(varying(cl.xyz)).mul(shape), float(1))
  material.transparent = true
  material.depthTest = true
  material.depthWrite = false
  material.blending = AdditiveBlending
  material.side = DoubleSide

  const mesh = new Mesh(geometry, material)
  mesh.name = 'light glow'
  mesh.frustumCulled = false
  mesh.renderOrder = 50
  return {
    object: mesh,
    write(instances) {
      const n = Math.min(instances.length, GLOW_CAPACITY)
      for (let i = 0; i < n; i++) {
        const g = instances[i]!
        pos.setXYZW(i, g.x, g.y, g.z, g.sizeM)
        col.setXYZW(i, g.r, g.g, g.b, 1)
      }
      pos.needsUpdate = true; col.needsUpdate = true
      geometry.instanceCount = n
      return n
    },
    setPixelAngle(angle) { pixelAngle.value = angle },
    dispose() { geometry.dispose(); material.dispose(); quad.dispose() },
  }
}
