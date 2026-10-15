import { eyeWorldNode, gameplayLights } from '../lights/irradiance.js'
import { DoubleSide, Material, Mesh, Object3D, Vector2 } from 'three'
import { MeshBasicNodeMaterial, type Node, type UniformNode } from 'three/webgpu'
import { color, float, fract, length, max, mix, normalize, positionLocal, positionWorld, sin, smoothstep, uniform, uv, vec3 } from 'three/tsl'
import { BEACHES_URL } from '../content.js'
import { horizonSinkNode } from '../horizon.js'
import { parseGltf, type ParseModel } from '../models/modelCache.js'
import { cloudSkylightNode, skyIrradianceUpNode, sunColorNode, sunDirectionNode } from './lighting.js'

export const BEACH_ROLE_NAMES = ['ShoreSand', 'ShoreSurf'] as const
export type BeachRoleName = typeof BEACH_ROLE_NAMES[number]

export type BeachStats = {
  readonly meshes: number
  readonly triangles: number
  readonly roles: Readonly<Record<BeachRoleName, number>>
  readonly eyeX: number
  readonly eyeZ: number
  readonly timeS: number
  readonly animated: boolean
}

export type Beaches = {
  readonly object: Object3D
  update(eyeX: number, eyeZ: number, timeS?: number): void
  stats(): BeachStats
  dispose(): void
}

const isRole = (name: string): name is BeachRoleName => (BEACH_ROLE_NAMES as readonly string[]).includes(name)

/** CPU twin of the compact breaker field used below. Useful for pinning the
 * direction, period and cross-shore envelope without compiling a shader. */
export function shoreEffectSample(along: number, across: number, timeS: number): { foam: number; backwash: number; shallow: number } {
  const smooth = (a: number, b: number, value: number): number => {
    const x = Math.max(0, Math.min(1, (value - a) / (b - a)))
    return x * x * (3 - 2 * x)
  }
  const wave = (offset: number): number => {
    const p = ((across * 1.55 + timeS * 0.16 + Math.sin(along * 22 + timeS * 0.35) * 0.04 + offset) % 1 + 1) % 1
    return smooth(0.035, 0.105, p) * (1 - smooth(0.105, 0.235, p))
  }
  const envelope = 1 - smooth(0.62, 0.96, across)
  const foam = Math.min(1, (wave(0) + wave(0.48) * 0.68) * envelope)
  const backwash = (0.5 + 0.5 * Math.sin(across * 18 - timeS * 0.7 + along * 5)) * smooth(0.04, 0.42, across) * (1 - smooth(0.42, 0.9, across))
  return { foam, backwash, shallow: smooth(0.03, 0.95, across) }
}

export function shoreFxFromQuery(search: string): 'on' | 'off' | undefined {
  const raw = new URLSearchParams(search).get('shoreFx')
  if (raw === null) return undefined
  if (raw === 'on' || raw === 'off') return raw
  throw new Error(`shoreFx: ${JSON.stringify(raw)} is not on or off`)
}

/** Fixed phase for repeatable DEV captures. Omitted in normal play, where the
 * simulation clock drives the surf and therefore freezes with Pause. */
export function shoreTimeFromQuery(search: string): number | undefined {
  const raw = new URLSearchParams(search).get('shoreTime')
  if (raw === null) return undefined
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0) throw new Error(`shoreTime: ${JSON.stringify(raw)} is not a non-negative number`)
  return value
}

function beachMaterials(eyeXZ: UniformNode<'vec2', Vector2>, timeS: UniformNode<'float', number>, animated: boolean): Readonly<Record<BeachRoleName, MeshBasicNodeMaterial>> {
  const position = vec3(
    positionLocal.x,
    positionLocal.y.sub(horizonSinkNode(length(positionLocal.xz.sub(eyeXZ)))),
    positionLocal.z,
  )
  const illumination = skyIrradianceUpNode.add(cloudSkylightNode)
    .add(sunColorNode.mul(max(normalize(sunDirectionNode).y, 0)))
    .add(gameplayLights(positionWorld.add(eyeWorldNode.xyz), vec3(0, 1, 0)))
    .mul(1 / Math.PI)
  const make = (name: BeachRoleName, albedo: Node<'vec3'>): MeshBasicNodeMaterial => {
    const material = new MeshBasicNodeMaterial()
    material.name = name
    material.positionNode = position
    material.colorNode = albedo.mul(illumination)
    material.side = DoubleSide
    return material
  }
  const c = (rgb: number): Node<'vec3'> => color(rgb) as unknown as Node<'vec3'>
  // The broad overlap is what hides the source DEM's staircase.  These
  // gradients keep that necessary width from reading as a single-color halo.
  const across = uv().y
  const dry = mix(c(0x747855), c(0xb7a57e), smoothstep(0, 0.45, across))
  const sand = make('ShoreSand', mix(dry, c(0x5f5b4c), smoothstep(0.45, 1, across)))
  let surfAlbedo: Node<'vec3'> = c(0xe4eff0)
  if (animated) {
    const along = uv().x, acrossWater = uv().y
    const phase = (offset: number) => fract(acrossWater.mul(1.55).add(timeS.mul(0.16)).add(sin(along.mul(22).add(timeS.mul(0.35))).mul(0.04)).add(offset))
    const crest = (p: ReturnType<typeof phase>) => smoothstep(0.035, 0.105, p).mul(float(1).sub(smoothstep(0.105, 0.235, p)))
    const foam = crest(phase(0)).add(crest(phase(0.48)).mul(0.68))
      .mul(float(1).sub(smoothstep(0.62, 0.96, acrossWater))).clamp(0, 1)
    const backwash = sin(acrossWater.mul(18).sub(timeS.mul(0.7)).add(along.mul(5))).mul(0.5).add(0.5)
      .mul(smoothstep(0.04, 0.42, acrossWater)).mul(float(1).sub(smoothstep(0.42, 0.9, acrossWater)))
    const shallow = mix(c(0x789788), c(0x315f67), smoothstep(0.03, 0.95, acrossWater))
    surfAlbedo = mix(shallow, c(0xcbd9d2), backwash.mul(0.2))
    surfAlbedo = mix(surfAlbedo, c(0xf2f6ee), foam.mul(0.92))
  }
  const surf = make('ShoreSurf', surfAlbedo)
  surf.transparent = true
  surf.depthWrite = false
  // UV.y is zero at the waterline and one at the submerged edge.  The ocean
  // hides the geometry below mean sea level; this fade leaves a soft breaker
  // line instead of a white forty-eight-metre slab.
  surf.opacityNode = float(0.72).mul(float(1).sub(smoothstep(0.05, 0.92, uv().y)))
  return { ShoreSand: sand, ShoreSurf: surf }
}

export function createBeaches(root: Object3D, animated = true): Beaches {
  const eyeXZ = uniform(new Vector2()) as UniformNode<'vec2', Vector2>
  const timeS = uniform(0) as UniformNode<'float', number>
  const runtime = beachMaterials(eyeXZ, timeS, animated)
  const roles: Record<BeachRoleName, number> = { ShoreSand: 0, ShoreSurf: 0 }
  const sourceMaterials = new Set<Material>()
  let meshes = 0, triangles = 0
  root.traverse((child) => {
    if (!(child instanceof Mesh)) return
    if (Array.isArray(child.material)) throw new Error(`beaches: mesh ${child.name} has multiple materials`)
    const role = child.material.name
    if (!isRole(role)) throw new Error(`beaches: mesh ${child.name} has unknown material role "${role}"`)
    sourceMaterials.add(child.material)
    child.material = runtime[role]
    child.castShadow = false
    child.receiveShadow = true
    meshes++
    roles[role]++
    triangles += child.geometry.index ? child.geometry.index.count / 3 : child.geometry.attributes.position.count / 3
  })
  for (const material of sourceMaterials) material.dispose()
  if (meshes === 0) throw new Error('beaches: loaded asset contains no meshes')
  for (const role of BEACH_ROLE_NAMES) if (roles[role] === 0) throw new Error(`beaches: loaded asset contains no ${role} meshes`)
  root.name = 'curved beach ribbons'
  let disposed = false
  return {
    object: root,
    update(eyeX, eyeZ, nextTimeS = timeS.value): void { eyeXZ.value.set(eyeX, eyeZ); timeS.value = nextTimeS },
    stats: (): BeachStats => ({ meshes, triangles, roles: { ...roles }, eyeX: eyeXZ.value.x, eyeZ: eyeXZ.value.y, timeS: timeS.value, animated }),
    dispose(): void {
      if (disposed) return
      disposed = true
      const geometries = new Set<unknown>()
      root.traverse((child) => { if (child instanceof Mesh) geometries.add(child.geometry) })
      for (const geometry of geometries) (geometry as { dispose(): void }).dispose()
      for (const material of Object.values(runtime)) material.dispose()
    },
  }
}

export async function loadBeaches(url = BEACHES_URL, parse: ParseModel = parseGltf, animated = true): Promise<Beaches> {
  return createBeaches(await parse(url), animated)
}
