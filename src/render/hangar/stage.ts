// src/render/hangar/stage.ts
import { AxesHelper, Box3, Color, DataTexture, GridHelper, Group, LinearMipmapLinearFilter, LineBasicMaterial, Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Quaternion, RepeatWrapping, Scene, SRGBColorSpace, Sphere, Vector3, type Object3D } from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { applySun, createLighting, SUN_DIRECTION } from '../scene/lighting.js'
import { atmospherePalette, warmIrradianceTable } from '../sky/palette.js'
import { exposureFor } from '../exposure.js'
import { createFramePipeline } from '../pipeline.js'
import { disposeMeshTree } from '../models/dispose.js'
import type { LibraryKind } from './library.js'
import { framingDistance, presetDirection, type CameraPreset } from './framing.js'

/** The fixed midday sun the hangar lights every model with (Hangar spec §6):
 *  the game's default SUN_DIRECTION, and the elevation that direction implies. */
export const HANGAR_SUN_ELEVATION_DEG =
  (Math.atan2(SUN_DIRECTION.y, Math.hypot(SUN_DIRECTION.x, SUN_DIRECTION.z)) * 180) / Math.PI

/** Every mesh material under `root`, on or off. Explicit both ways: the
 *  model cache's clones share materials, so a model shown after wireframe
 *  was turned off could otherwise still be wireframe (H2). */
export function applyWireframe(root: Object3D, on: boolean): void {
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!('wireframe' in m) || m.wireframe === on) continue
      m.wireframe = on
      // WebGPU uploads the wireframe index only when the material rebuilds.
      m.needsUpdate = true
    }
  })
}

const litMaterials = new WeakMap<Mesh, Mesh['material']>()
/** Every mesh under `root` drawn with its own base color, map and alpha but no
 *  lighting, or back to the very materials it had. Tier 2 check 5 divides a lit
 *  frame by this one, so paint cancels and only the response to light is left:
 *  a bare-metal B-17 is 3.1x a blue Wildcat's luminance lit (R3, 2026-09-27)
 *  and that says nothing about whether it is lit sanely. */
export function applyUnlit(root: Object3D, on: boolean): void {
  const unlit = (m: Mesh['material'] & object): MeshBasicMaterial => {
    const src = m as MeshStandardMaterial
    return new MeshBasicMaterial({
      color: src.color ?? new Color(1, 1, 1), map: src.map ?? null, vertexColors: src.vertexColors,
      transparent: src.transparent, opacity: src.opacity, side: src.side, alphaTest: src.alphaTest,
    })
  }
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return
    const saved = litMaterials.get(o)
    if (on && !saved) {
      litMaterials.set(o, o.material)
      o.material = Array.isArray(o.material) ? o.material.map(unlit) : unlit(o.material)
    } else if (!on && saved) {
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose()
      o.material = saved
      litMaterials.delete(o)
    }
  })
}

/** Checker tiles across UV [0, 1] on each axis; each tile is 8 x 8 squares, so 64 squares span
 *  an atlas. One tile per atlas gave about one square per patch on the Ki-84's 88-patch atlas,
 *  too coarse to show stretch (DP0 Task 11 review, 2026-09-28); 8 is by eye. */
export const CHECKER_REPEAT = 8
let checker: DataTexture | null = null
/** 8 x 8 squares, black and white, tiled CHECKER_REPEAT times over UV [0, 1]: one per page, shared. */
function checkerTexture(): DataTexture {
  if (checker) return checker
  const n = 256, cell = 32, data = new Uint8Array(n * n * 4)
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const v = ((Math.floor(x / cell) + Math.floor(y / cell)) & 1) ? 235 : 20
    data.set([v, v, v, 255], (y * n + x) * 4)
  }
  checker = new DataTexture(data, n, n)
  checker.colorSpace = SRGBColorSpace
  checker.wrapS = checker.wrapT = RepeatWrapping
  checker.repeat.set(CHECKER_REPEAT, CHECKER_REPEAT)
  // Mipmapped, so 64 squares over a distant model gray out instead of shimmering.
  checker.generateMipmaps = true
  checker.minFilter = LinearMipmapLinearFilter
  checker.needsUpdate = true
  return checker
}

const checkered = new WeakMap<Mesh, Mesh['material']>()
/** Every standard material under `root` swapped for a clone showing the UV checker, or back to
 *  the very materials it had (DP0, spec §9): stretch at a loft end shows as bent squares. The
 *  clone, not the original, is changed: the model cache shares materials across instances. */
export function applyChecker(root: Object3D, on: boolean): void {
  const swap = (m: Mesh['material'] & object): Mesh['material'] & object => {
    if (!(m instanceof MeshStandardMaterial)) return m
    const c = m.clone()
    c.map = checkerTexture(); c.color.setRGB(1, 1, 1); c.needsUpdate = true
    return c
  }
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return
    const saved = checkered.get(o)
    if (on && !saved) {
      checkered.set(o, o.material)
      o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material)
    } else if (!on && saved) {
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m !== saved && !(Array.isArray(saved) && saved.includes(m))) m.dispose()
      o.material = saved
      checkered.delete(o)
    }
  })
}

export interface DebugViews { wireframe: boolean; checker: boolean; unlit: boolean }
/** The three debug views on `root`, set as a whole. Checker and unlit each stash the materials
 *  under them and wireframe edits whatever is on top, so toggling them one at a time is
 *  order-dependent: wireframe on, checker on, wireframe off, checker off left the cached
 *  originals wireframe while the box was unticked, and unlit on, checker on, unlit off, checker
 *  off restored a disposed stand-in (DP0 Task 11 review). So every change unwinds to the
 *  originals, sets their wireframe, and re-layers checker then unlit in one fixed order. */
export function applyDebugViews(root: Object3D, v: DebugViews): void {
  applyUnlit(root, false)
  applyChecker(root, false)
  applyWireframe(root, v.wireframe) // on the shared originals
  applyChecker(root, v.checker) // its clones inherit wireframe
  applyUnlit(root, v.unlit)
  applyWireframe(root, v.wireframe) // the unlit stand-ins do not
}

/** Pivot gizmos (spec §8): an axes helper at each articulated node's origin,
 *  drawn over the model so a pivot inside the fuselage still shows. */
export function createGizmos(nodes: readonly Object3D[], size: number): Group {
  const g = new Group()
  g.name = 'hangar gizmos'
  for (const n of nodes) {
    const h = new AxesHelper(size)
    h.name = `gizmo ${n.name}`
    const mat = h.material as LineBasicMaterial
    mat.depthTest = false
    h.renderOrder = 999
    g.add(h)
  }
  return g
}

const _p = new Vector3(), _q = new Quaternion(), _s = new Vector3()
/** Each gizmo to its node's world position and orientation, at scale 1. */
export function syncGizmos(gizmos: Group, nodes: readonly Object3D[]): void {
  nodes.forEach((n, i) => {
    const h = gizmos.children[i]
    if (!h) return
    n.updateWorldMatrix(true, false)
    n.matrixWorld.decompose(_p, _q, _s)
    h.position.copy(_p)
    h.quaternion.copy(_q)
  })
}

const VFOV_DEG = 35
const AUTO_ROTATE_SPEED = 0.6

export interface HangarStage {
  /** Replaces what stands on the stage. `kind` picks the ground: water for ships, a pad otherwise. */
  show(model: Object3D | null, kind: LibraryKind | null): void
  setPreset(p: CameraPreset): void
  /** Stops the turntable and makes the frame repeatable (Tier 2). */
  freeze(): void
  setModelVisible(visible: boolean): void
  /** Wireframe on every model shown from now on, the current one included (H2). */
  setWireframe(on: boolean): void
  /** The UV checker on every model shown from now on, the current one included (DP0, spec §9). */
  setChecker(on: boolean): void
  /** The current model unlit (its own paint, no lights), or lit again; show() relights (Tier 2 check 5, R3). */
  setUnlit(on: boolean): void
  /** Pivot gizmos on these nodes; null or [] = off. show() clears them (H2). */
  setGizmos(nodes: readonly Object3D[] | null): void
  /** The turntable, on or off, without freezing anything else (H2). */
  setAutoRotate(on: boolean): void
  /** The standing model's bounding-box size, meters (x length, y height, z span). */
  modelSize(): { x: number; y: number; z: number } | null
  /** `world` through the stage camera, in NDC (O1, Tier 2 check 11). */
  project(world: Vector3): readonly [number, number]
  render(): void
  resize(width: number, height: number): void
}

/** `onUserOrbit` fires when a drag stops the turntable, so the bench's Turntable box can follow (H2 review). */
export function createStage(renderer: WebGPURenderer, canvas: HTMLCanvasElement, onUserOrbit: () => void = () => {}): HangarStage {
  const scene = new Scene()
  scene.background = new Color(0x2a2f36)
  warmIrradianceTable()
  const lights = createLighting()
  applySun(lights, atmospherePalette(0, HANGAR_SUN_ELEVATION_DEG), {
    x: SUN_DIRECTION.x, y: SUN_DIRECTION.y, z: SUN_DIRECTION.z,
  }, HANGAR_SUN_ELEVATION_DEG)
  scene.add(lights)

  const camera = new PerspectiveCamera(VFOV_DEG, canvas.clientWidth / Math.max(1, canvas.clientHeight), 0.1, 20_000)
  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.autoRotate = true
  controls.autoRotateSpeed = AUTO_ROTATE_SPEED
  // The turntable turns until the user takes hold of it.
  controls.addEventListener('start', () => {
    if (controls.autoRotate) onUserOrbit()
    controls.autoRotate = false
  })

  const pipeline = createFramePipeline(renderer, scene, camera)
  pipeline.setExposure(exposureFor(HANGAR_SUN_ELEVATION_DEG))

  const ground = new Group()
  ground.name = 'hangar ground'
  scene.add(ground)
  const holder = new Group()
  holder.name = 'hangar model'
  scene.add(holder)
  let current: Object3D | null = null
  let radius = 10
  let wireframe = false
  let checkerOn = false
  let unlitOn = false
  const views = (): DebugViews => ({ wireframe, checker: checkerOn, unlit: unlitOn })
  let gizmos: Group | null = null
  let gizmoNodes: readonly Object3D[] = []
  const setGizmos = (nodes: readonly Object3D[] | null): void => {
    // AxesHelper is LineSegments, which disposeMeshTree skips; it frees itself.
    if (gizmos) { scene.remove(gizmos); for (const h of gizmos.children) (h as AxesHelper).dispose() }
    gizmos = null
    gizmoNodes = nodes ?? []
    if (gizmoNodes.length === 0) return
    gizmos = createGizmos(gizmoNodes, radius * 0.08)
    gizmos.visible = holder.visible
    scene.add(gizmos)
  }
  let preset: CameraPreset = 'three-quarter'

  const frame = (): void => {
    const d = framingDistance(radius, VFOV_DEG, camera.aspect)
    const [x, y, z] = presetDirection(preset)
    const target = controls.target
    camera.position.set(target.x + x * d, target.y + y * d, target.z + z * d)
    camera.near = Math.max(0.05, d / 1000)
    camera.far = d * 20
    camera.updateProjectionMatrix()
    controls.update()
  }

  const rebuildGround = (kind: LibraryKind | null, extent: number): void => {
    disposeMeshTree(ground)
    ground.clear()
    // Meter grid, 10 m major lines: a model at the wrong scale shows at a glance.
    const size = Math.max(20, Math.ceil((extent * 1.5) / 10) * 10)
    const grid = new GridHelper(size, size, 0xd8d2c0, 0x5a5f66)
    grid.position.y = 0.01
    const major = new GridHelper(size, size / 10, 0xf2e9d0, 0xf2e9d0)
    major.position.y = 0.02
    const plane = new Mesh(
      new PlaneGeometry(size * 4, size * 4).rotateX(-Math.PI / 2),
      new MeshStandardMaterial({ color: kind === 'ship' ? 0x1d3f57 : 0x8a8a84, roughness: 0.9 }),
    )
    ground.add(plane, grid, major)
  }

  return {
    show(model, kind): void {
      if (current) {
        // Off before it goes: its materials are shared with the cached source.
        applyDebugViews(current, { wireframe: false, checker: false, unlit: false })
        holder.remove(current)
      }
      setGizmos(null)
      current = model
      unlitOn = false // show() relights
      if (model === null) {
        rebuildGround(null, 20)
        return
      }
      holder.add(model)
      applyDebugViews(model, views())
      const box = new Box3().setFromObject(model)
      const sphere = box.getBoundingSphere(new Sphere())
      radius = Math.max(1, sphere.radius)
      controls.target.copy(sphere.center)
      rebuildGround(kind, Math.max(box.max.x - box.min.x, box.max.z - box.min.z))
      frame()
    },
    setPreset(p): void {
      preset = p
      frame()
    },
    freeze(): void {
      controls.autoRotate = false
      controls.enableDamping = false
      controls.enabled = false
      pipeline.setAntiAliasing('smaa')
    },
    setModelVisible(visible): void {
      holder.visible = visible
      if (gizmos) gizmos.visible = visible
    },
    setUnlit(on): void {
      unlitOn = on
      if (current) applyDebugViews(current, views())
    },
    setWireframe(on): void {
      wireframe = on
      if (current) applyDebugViews(current, views())
    },
    setChecker(on): void {
      checkerOn = on
      if (current) applyDebugViews(current, views())
    },
    setGizmos,
    setAutoRotate(on): void { controls.autoRotate = on },
    modelSize() {
      if (!current) return null
      const s = new Box3().setFromObject(current).getSize(new Vector3())
      return { x: s.x, y: s.y, z: s.z }
    },
    project(world): readonly [number, number] {
      camera.updateMatrixWorld()
      const p = world.clone().project(camera)
      return [p.x, p.y]
    },
    render(): void {
      if (gizmos) syncGizmos(gizmos, gizmoNodes)
      controls.update()
      pipeline.render()
    },
    resize(width, height): void {
      renderer.setSize(width, height, false)
      camera.aspect = width / Math.max(1, height)
      camera.updateProjectionMatrix()
    },
  }
}
