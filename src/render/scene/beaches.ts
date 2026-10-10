import { DoubleSide, Material, Mesh, Object3D, Vector2 } from 'three'
import { MeshBasicNodeMaterial, type Node, type UniformNode } from 'three/webgpu'
import { color, float, length, max, mix, normalize, positionLocal, smoothstep, uniform, uv, vec3 } from 'three/tsl'
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
}

export type Beaches = {
  readonly object: Object3D
  update(eyeX: number, eyeZ: number): void
  stats(): BeachStats
  dispose(): void
}

const isRole = (name: string): name is BeachRoleName => (BEACH_ROLE_NAMES as readonly string[]).includes(name)

function beachMaterials(eyeXZ: UniformNode<'vec2', Vector2>): Readonly<Record<BeachRoleName, MeshBasicNodeMaterial>> {
  const position = vec3(
    positionLocal.x,
    positionLocal.y.sub(horizonSinkNode(length(positionLocal.xz.sub(eyeXZ)))),
    positionLocal.z,
  )
  const illumination = skyIrradianceUpNode.add(cloudSkylightNode)
    .add(sunColorNode.mul(max(normalize(sunDirectionNode).y, 0))).mul(1 / Math.PI)
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
  const surf = make('ShoreSurf', c(0xe4eff0))
  surf.transparent = true
  surf.depthWrite = false
  // UV.y is zero at the waterline and one at the submerged edge.  The ocean
  // hides the geometry below mean sea level; this fade leaves a soft breaker
  // line instead of a white forty-eight-metre slab.
  surf.opacityNode = float(0.72).mul(float(1).sub(smoothstep(0.05, 0.92, uv().y)))
  return { ShoreSand: sand, ShoreSurf: surf }
}

export function createBeaches(root: Object3D): Beaches {
  const eyeXZ = uniform(new Vector2()) as UniformNode<'vec2', Vector2>
  const runtime = beachMaterials(eyeXZ)
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
    update(eyeX, eyeZ): void { eyeXZ.value.set(eyeX, eyeZ) },
    stats: (): BeachStats => ({ meshes, triangles, roles: { ...roles }, eyeX: eyeXZ.value.x, eyeZ: eyeXZ.value.y }),
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

export async function loadBeaches(url = BEACHES_URL, parse: ParseModel = parseGltf): Promise<Beaches> {
  return createBeaches(await parse(url))
}
