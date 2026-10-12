import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Vector3,
  type Material,
  type Object3D,
} from 'three'

/**
 * At this distance a fighter's span is about 18 px at 1440p/91 deg. The detailed model remains for
 * the camera's own engagement (the scaling probe puts it 900 m away); everything farther becomes one
 * draw. The 200 m hysteresis keeps a circling airplane from swapping representations every frame.
 */
export const AIRFRAME_LOD_ENTER_M = 1200
export const AIRFRAME_LOD_EXIT_M = 1000
export const AIRFRAME_LOD_PROXY_NAME = 'AirframeFarLod'

interface SharedProxy {
  readonly geometry: BufferGeometry
  readonly material: MeshStandardMaterial
  refs: number
}

const proxies = new Map<string, SharedProxy>()

const materialColor = (material: Material | undefined, target: Color): Color => {
  const colored = material as Material & { color?: Color }
  return colored.color === undefined ? target.setRGB(0.42, 0.44, 0.4) : target.copy(colored.color)
}

function underAny(node: Object3D, excluded: ReadonlySet<Object3D>, stop: Object3D): boolean {
  for (let p: Object3D | null = node; p !== null; p = p.parent) {
    if (excluded.has(p)) return true
    if (p === stop) return false
  }
  return false
}

function visibleThrough(node: Object3D, stop: Object3D): boolean {
  for (let p: Object3D | null = node; p !== null; p = p.parent) {
    if (!p.visible) return false
    if (p === stop) return true
  }
  return false
}

/** Bakes the authored, intact model into one indexed, vertex-colored mesh in `root`'s frame. */
function bakeProxy(root: Object3D, model: Object3D, excluded: ReadonlySet<Object3D>): BufferGeometry | null {
  root.updateWorldMatrix(true, true)
  const toRoot = root.matrixWorld.clone().invert()
  const meshes: Mesh[] = []
  model.traverse((node) => {
    if (node instanceof Mesh && visibleThrough(node, model) && !underAny(node, excluded, model)) meshes.push(node)
  })
  const vertexCount = meshes.reduce((n, mesh) => n + mesh.geometry.getAttribute('position').count, 0)
  const indexCount = meshes.reduce((n, mesh) => n + (mesh.geometry.getIndex()?.count ?? mesh.geometry.getAttribute('position').count), 0)
  if (vertexCount === 0 || indexCount === 0) return null
  const positions = new Float32Array(vertexCount * 3)
  const colors = new Float32Array(vertexCount * 3)
  const indices = new Uint32Array(indexCount)
  const point = new Vector3()
  const color = new Color()
  const vertexColor = new Color()
  let vertexOffset = 0
  let indexOffset = 0

  for (const node of meshes) {
    node.updateWorldMatrix(true, false)
    const transform = new Matrix4().multiplyMatrices(toRoot, node.matrixWorld)
    const geometry = node.geometry
    const position = geometry.getAttribute('position')
    const sourceColor = geometry.getAttribute('color')
    const sourceIndex = geometry.getIndex()
    const materialIndices = Array.isArray(node.material) ? new Uint16Array(position.count) : null
    if (materialIndices !== null) for (const group of geometry.groups) {
      for (let j = group.start; j < group.start + group.count; j++) materialIndices[sourceIndex?.getX(j) ?? j] = group.materialIndex ?? 0
    }
    const mirrored = transform.determinant() < 0
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(transform)
      const at = (vertexOffset + i) * 3
      positions[at] = point.x; positions[at + 1] = point.y; positions[at + 2] = point.z
      const material = Array.isArray(node.material) ? node.material[materialIndices![i] ?? 0] : node.material
      materialColor(material, color)
      if (sourceColor !== undefined) color.multiply(vertexColor.fromBufferAttribute(sourceColor, i))
      colors[at] = color.r; colors[at + 1] = color.g; colors[at + 2] = color.b
    }
    const elements = sourceIndex?.count ?? position.count
    for (let triangle = 0; triangle < elements; triangle += 3) {
      const order = mirrored ? [0, 2, 1] : [0, 1, 2]
      for (const corner of order) indices[indexOffset++] = vertexOffset + (sourceIndex?.getX(triangle + corner) ?? triangle + corner)
    }
    vertexOffset += position.count
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  geometry.setIndex(new BufferAttribute(indices, 1))
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

export interface AirframeLod {
  /** Chooses the full or far representation. Damage always forces the articulated model. */
  update(cameraDistanceM: number, forceFull: boolean): void
  /** Applies a visibility mutation such as dropping a store without losing it across a far/near switch. */
  mutateFull(change: () => void): void
  dispose(): void
}

const inert: AirframeLod = { update: () => {}, mutateFull: (change) => { change() }, dispose: () => {} }

/**
 * Adds a shared one-draw far representation. `fullRoots` are the outer model and its store meshes;
 * `model` is only the authored airframe, so loadout combinations do not multiply cached proxies.
 */
export function createAirframeLod(
  key: string,
  root: Object3D,
  model: Object3D,
  fullRoots: readonly Object3D[],
  excluded: readonly Object3D[] = [],
): AirframeLod {
  let shared = proxies.get(key)
  if (shared === undefined) {
    const geometry = bakeProxy(root, model, new Set(excluded))
    if (geometry === null) return inert
    shared = {
      geometry,
      material: new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }),
      refs: 0,
    }
    proxies.set(key, shared)
  }
  shared.refs++
  const held = shared
  const proxy = new Mesh(held.geometry, held.material)
  proxy.name = AIRFRAME_LOD_PROXY_NAME
  proxy.receiveShadow = true
  proxy.visible = false
  root.add(proxy)

  let far = false
  let disposed = false
  let fullVisibility = fullRoots.map((node) => node.visible)
  const showFull = (): void => { fullRoots.forEach((node, i) => { node.visible = fullVisibility[i]! }) }
  const hideFull = (): void => { fullRoots.forEach((node) => { node.visible = false }) }
  const setFar = (next: boolean): void => {
    if (next === far) return
    if (next) {
      fullVisibility = fullRoots.map((node) => node.visible)
      hideFull()
    } else showFull()
    proxy.visible = next
    far = next
  }

  return {
    update(cameraDistanceM, forceFull): void {
      const finiteDistance = Number.isFinite(cameraDistanceM) ? cameraDistanceM : 0
      const wantFar = !forceFull && (far ? finiteDistance > AIRFRAME_LOD_EXIT_M : finiteDistance >= AIRFRAME_LOD_ENTER_M)
      setFar(wantFar)
    },
    mutateFull(change): void {
      if (!far) { change(); return }
      showFull()
      change()
      fullVisibility = fullRoots.map((node) => node.visible)
      hideFull()
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      proxy.removeFromParent()
      held.refs--
      if (held.refs === 0 && proxies.get(key) === held) {
        proxies.delete(key)
        held.geometry.dispose()
        held.material.dispose()
      }
    },
  }
}
