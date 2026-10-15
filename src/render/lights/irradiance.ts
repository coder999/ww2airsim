import { Mesh, OrthographicCamera, PlaneGeometry, RenderTarget, Scene, Vector3, Vector4, FloatType, NearestFilter, RGBAFormat, type Material, type Object3D } from 'three'
import { MeshBasicNodeMaterial, type WebGPURenderer } from 'three/webgpu'
import type { Node } from 'three/webgpu'
import { Fn, Loop, diffuseColor, dot, float, inverseSqrt, int, max, min, normalWorld, positionWorld, select, smoothstep, sqrt, uniform, uniformArray, vec3, vec4 } from 'three/tsl'
import { LIGHT_CAPS, type LightRuntime } from '../../sim/lights/lights.js'
import type { Vec3 } from '../../sim/math/vec3.js'

/**
 * The shared lighting node (F6A Task 5, plan §3.5 item 1, ruling D1): the ONE
 * function terrain, ocean, beaches and fx call to add the gameplay lights'
 * irradiance, because a three.js PointLight would not reach those hand-written
 * shaders at all. A fixed 8-slot uniform array read by a loop whose count is a
 * uniform: with no light active the loop runs zero times, so the cost of the
 * branch in every daytime view is a uniform compare, not a loop.
 *
 * Positions are TRUE world metres (float32 is good to about 2 mm at 30 km);
 * surfaces that have only eye-relative coordinates add `eyeWorldNode`.
 */
export const LIGHT_SLOTS = LIGHT_CAPS.litSlots
/**
 * Scene irradiance per lux (the contract's lux to the renderer's scene units).
 * The "movie night" floor is far brighter than real moonlight, so physical
 * values would leave a pot's pool invisible; 0.1 gives a flare's pool
 * a few times the floor out to a mile (0.02 was invisible, 0.24 garish). LOOK CONSTANT, `?night=lux:` scales it.
 */
export const LIGHT_GAIN = 0.1
/** A fragment never receives more than this from the lights together (about a noon sun). */
export const MAX_IRRADIANCE = 4

export const eyeWorldNode = uniform(new Vector4(0, 0, 0, 0))
const pos = uniformArray(Array.from({ length: LIGHT_SLOTS }, () => new Vector4(0, 0, 0, 1)), 'vec4')
const col = uniformArray(Array.from({ length: LIGHT_SLOTS }, () => new Vector4(0, 0, 0, -2)), 'vec4')
const axis = uniformArray(Array.from({ length: LIGHT_SLOTS }, () => new Vector4(0, 1, 0, 0)), 'vec4')
const count = uniform(0, 'int')

/** The CPU half: writes the selected lights (at most LIGHT_SLOTS) into the uniform arrays. */
export function writeLightUniforms(selected: readonly LightRuntime[], eye: { x: number; y: number; z: number }, gain: number = LIGHT_GAIN): number {
  const n = Math.min(selected.length, LIGHT_SLOTS)
  for (let i = 0; i < n; i++) {
    const l = selected[i]!
    ;(pos.array[i] as Vector4).set(l.positionM.x, l.positionM.y, l.positionM.z, l.radiusM)
    const k = l.intensityCd * gain
    ;(col.array[i] as Vector4).set(l.color[0] * k, l.color[1] * k, l.color[2] * k, l.coneHalfAngleRad === undefined ? -2 : Math.cos(l.coneHalfAngleRad))
    const a = l.axis
    ;(axis.array[i] as Vector4).set(a?.x ?? 0, a?.y ?? 1, a?.z ?? 0, 0)
  }
  count.value = n
  eyeWorldNode.value.set(eye.x, eye.y, eye.z, 0)
  return n
}

/**
 * Irradiance (scene units) the active lights give a surface at TRUE world position `worldPos` with unit
 * normal `normal`: sum of I / d^2 x cos(normal, to light), faded out at each light's radius, restricted
 * to the cone for an aimed light. Pass `normal = null` for an omnidirectional receiver (a smoke sprite).
 */
export function gameplayLights(worldPos: Node<'vec3'>, normal: Node<'vec3'> | null): Node<'vec3'> {
  return Fn(() => {
    const sum = vec3(0).toVar()
    Loop({ start: int(0), end: count, type: 'int', condition: '<' }, ({ i }) => {
      const p = (pos.element(i) as unknown as Node<'vec4'>).toVar()
      const c = (col.element(i) as unknown as Node<'vec4'>).toVar()
      const a = (axis.element(i) as unknown as Node<'vec4'>).toVar()
      const d = p.xyz.sub(worldPos).toVar()
      const d2 = max(dot(d, d), 1).toVar()
      const toLight = d.mul(inverseSqrt(d2))
      const lam = normal === null ? float(1) : max(dot(normal, toLight), 0)
      const fade = float(1).sub(smoothstep(p.w.mul(0.8), p.w, sqrt(d2)))
      const spot = select(c.w.greaterThan(-1.5), smoothstep(c.w.sub(0.0015), c.w, dot(toLight.negate(), a.xyz)), float(1))
      sum.addAssign(c.xyz.mul(lam.mul(fade).mul(spot)).div(d2))
    })
    return min(sum, vec3(MAX_IRRADIANCE))
  })() as unknown as Node<'vec3'>
}

/**
 * Lit materials (aircraft, ships, vehicles, buildings, equipment) take the gameplay lights as an emissive
 * term, albedo / pi x irradiance (the Lambertian the terrain uses), because three's own lighting loop
 * knows only the sun and the hemisphere. `NodeMaterial.copy` (which the WebGPU renderer runs on every
 * plain material) carries `emissiveNode` across. A material that already has an `emissiveNode` is left
 * alone. Idempotent. Called once per parsed model (models/modelCache.ts).
 */
export function addGameplayLightsToMaterials(root: Object3D): void {
  const done = new Set<Material>()
  root.traverse((o) => {
    const m = (o as unknown as { material?: Material | Material[] }).material
    if (m === undefined) return
    for (const mat of Array.isArray(m) ? m : [m]) {
      if (done.has(mat) || !(mat as { isMeshStandardMaterial?: boolean }).isMeshStandardMaterial) continue
      done.add(mat)
      const target = mat as unknown as { emissiveNode?: Node<'vec3'> | null }
      if (target.emissiveNode) continue
      target.emissiveNode = diffuseColor.rgb.mul(gameplayLights(positionWorld.add(eyeWorldNode.xyz), normalWorld.normalize()).mul(1 / Math.PI)) as unknown as Node<'vec3'>
    }
  })
}

/**
 * The CPU twin of `gameplayLights`, the outside truth the GPU is checked against (tests/e2e/nightLights.spec.ts
 * reads the shader back through `createIrradianceProbe`). Same terms, same clamps, in doubles.
 * `normal = null` is an omnidirectional receiver.
 */
export function irradianceAtCpu(selected: readonly LightRuntime[], p: Vec3, normal: Vec3 | null, gain: number = LIGHT_GAIN): [number, number, number] {
  const sum: [number, number, number] = [0, 0, 0]
  const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
  for (const l of selected.slice(0, LIGHT_SLOTS)) {
    const dx = l.positionM.x - p.x, dy = l.positionM.y - p.y, dz = l.positionM.z - p.z
    const d2 = Math.max(dx * dx + dy * dy + dz * dz, 1), d = Math.sqrt(d2)
    const lx = dx / d, ly = dy / d, lz = dz / d
    const lam = normal === null ? 1 : Math.max(normal.x * lx + normal.y * ly + normal.z * lz, 0)
    const fade = 1 - smooth(l.radiusM * 0.8, l.radiusM, d)
    let spot = 1
    if (l.coneHalfAngleRad !== undefined && l.axis !== undefined) {
      const c = Math.cos(l.coneHalfAngleRad)
      spot = smooth(c - 0.0015, c, -(lx * l.axis.x + ly * l.axis.y + lz * l.axis.z))
    }
    const k = (l.intensityCd * gain * lam * fade * spot) / d2
    sum[0] += l.color[0] * k; sum[1] += l.color[1] * k; sum[2] += l.color[2] * k
  }
  return [Math.min(sum[0], MAX_IRRADIANCE), Math.min(sum[1], MAX_IRRADIANCE), Math.min(sum[2], MAX_IRRADIANCE)]
}

/** Reads `gameplayLights` back from the GPU at one point: a 4x1 float target and a quad whose fragment is that irradiance. */
export function createIrradianceProbe(): { read(renderer: WebGPURenderer, p: Vec3, normal: Vec3 | null): Promise<[number, number, number]>; dispose(): void } {
  const target = new RenderTarget(4, 1, { type: FloatType, format: RGBAFormat, depthBuffer: false, minFilter: NearestFilter, magFilter: NearestFilter, generateMipmaps: false })
  const probePos = uniform(new Vector3())
  const probeNormal = uniform(new Vector3(0, 1, 0))
  const omni = uniform(0)
  const material = new MeshBasicNodeMaterial()
  const lit = gameplayLights(probePos as unknown as Node<'vec3'>, probeNormal as unknown as Node<'vec3'>)
  const lightOmni = gameplayLights(probePos as unknown as Node<'vec3'>, null)
  material.colorNode = vec4(select(omni.greaterThan(0.5), lightOmni, lit), 1)
  const scene = new Scene()
  const quad = new Mesh(new PlaneGeometry(2, 2), material)
  quad.frustumCulled = false
  scene.add(quad)
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
  return {
    async read(renderer, p, normal) {
      probePos.value.set(p.x, p.y, p.z)
      probeNormal.value.set(normal?.x ?? 0, normal?.y ?? 1, normal?.z ?? 0)
      omni.value = normal === null ? 1 : 0
      const previous = renderer.getRenderTarget()
      renderer.setRenderTarget(target)
      renderer.render(scene, camera)
      renderer.setRenderTarget(previous)
      const data = await renderer.readRenderTargetPixelsAsync(target, 0, 0, 4, 1) as unknown as Float32Array
      return [data[0]!, data[1]!, data[2]!]
    },
    dispose() { target.dispose(); quad.geometry.dispose(); material.dispose() },
  }
}
