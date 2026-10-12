// src/render/hangar/stage.ts
import { Box3, BoxGeometry, Color, DataTexture, GridHelper, Group, LinearMipmapLinearFilter, Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, RepeatWrapping, Scene, SRGBColorSpace, Sphere, Vector3, type Object3D } from 'three'
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
 *  lighting, or back to the very materials it had. E2E check 5 divides a lit
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

const VFOV_DEG = 35
const AUTO_ROTATE_SPEED = 0.6
export type HangarEnvironment = 'hangar' | 'water' | 'outside'

/** Aircraft, vehicles and loose ordnance are inspected under cover. Ships remain afloat and
 * buildings remain outside so their ground relationship still reads naturally. */
export function environmentFor(kind: LibraryKind | null): HangarEnvironment {
  return kind === 'ship' ? 'water' : kind === 'building' || kind === null ? 'outside' : 'hangar'
}

export interface HangarStage {
  /** Replaces what stands on the stage. `kind` picks the surrounding environment. */
  show(model: Object3D | null, kind: LibraryKind | null): void
  setPreset(p: CameraPreset): void
  /** The camera at `eye`, looking at `target`, both in stage meters (M1c captures: one distance for every ship). */
  aim(eye: readonly [number, number, number], target: readonly [number, number, number]): void
  /** Stops the turntable and makes the frame repeatable (E2E). */
  freeze(): void
  setModelVisible(visible: boolean): void
  /** Wireframe on every model shown from now on, the current one included (H2). */
  setWireframe(on: boolean): void
  /** The UV checker on every model shown from now on, the current one included (DP0, spec §9). */
  setChecker(on: boolean): void
  /** The current model unlit (its own paint, no lights), or lit again; show() relights (E2E check 5, R3). */
  setUnlit(on: boolean): void
  /** One-foot scale grid over the current floor/water. Off by default and retained across selections. */
  setGrid(on: boolean): void
  /** The turntable, on or off, without freezing anything else (H2). */
  setAutoRotate(on: boolean): void
  /** The standing model's bounding-box size, meters (x length, y height, z span). */
  modelSize(): { x: number; y: number; z: number } | null
  /** `world` through the stage camera, in NDC (O1, E2E check 11). */
  project(world: Vector3): readonly [number, number]
  /** The category-specific environment currently surrounding the model. */
  environment(): HangarEnvironment
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
  let gridOn = false
  let measurementGrid: Group | null = null
  let currentEnvironment: HangarEnvironment = 'outside'
  let preset: CameraPreset = 'three-quarter'

  const frame = (): void => {
    const d = framingDistance(radius, VFOV_DEG, camera.aspect, 1)
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
    currentEnvironment = environmentFor(kind)
    const size = Math.max(20, Math.ceil((extent * 1.5) / 10) * 10)
    const material = (color: number, metalness = 0.05): MeshStandardMaterial =>
      new MeshStandardMaterial({ color, roughness: 0.82, metalness })
    const addBox = (name: string, dimensions: readonly [number, number, number], position: readonly [number, number, number], color: number, rotationX = 0, metalness = 0.05): void => {
      const mesh = new Mesh(new BoxGeometry(...dimensions), material(color, metalness))
      mesh.name = name
      mesh.position.set(...position)
      mesh.rotation.x = rotationX
      ground.add(mesh)
    }

    // The request is a desktop redesign. Keep the proven phone stage intact; only its surrounding
    // UI and camera-safe gray pad render there, while desktop receives the enclosed hangar.
    if (currentEnvironment === 'hangar' && canvas.clientWidth > 820) {
      // Scale the room with the model and keep every orbit camera inside it. The thick floor has
      // a real underside, so dipping below grade no longer reveals transparency.
      const room = Math.max(20, radius * 8, extent * 2.2)
      const halfWidth = room * 0.5
      const halfLength = room * 0.82
      // Keep the roof just above the framed model. A scale-correct aircraft hangar many spans
      // wide pushed the V beyond the camera frustum and read as a featureless dark box.
      const eave = Math.max(2.5, radius * 1.05)
      const ridge = Math.max(eave + 2, radius * 1.65)
      const rise = ridge - eave
      const slope = Math.hypot(halfWidth, rise)
      const angle = Math.atan2(rise, halfWidth)
      scene.background = new Color(0x11181d)
      addBox('hangar floor', [halfLength * 2, 0.5, room], [0, -0.25, 0], 0x555a59, 0, 0.08)
      addBox('hangar back wall', [0.6, ridge, room], [-halfLength, ridge / 2, 0], 0x39454a, 0, 0.18)
      addBox('hangar left wall', [halfLength * 2, eave, 0.6], [0, eave / 2, -halfWidth], 0x354046, 0, 0.18)
      addBox('hangar right wall', [halfLength * 2, eave, 0.6], [0, eave / 2, halfWidth], 0x354046, 0, 0.18)
      // Keep the canopy behind the inspection volume. It still reads as a roofed bay from the
      // default view, but top/side presets and free orbit never put opaque roof over the model.
      const roofLength = halfLength * 0.62
      const roofX = -halfLength + roofLength / 2
      addBox('hangar roof left', [roofLength, 0.5, slope], [roofX, (eave + ridge) / 2, -halfWidth / 2], 0x28333a, -angle, 0.28)
      addBox('hangar roof right', [roofLength, 0.5, slope], [roofX, (eave + ridge) / 2, halfWidth / 2], 0x28333a, angle, 0.28)
      addBox('hangar ridge beam', [roofLength, 0.9, 0.9], [roofX, ridge - 0.25, 0], 0x121b21, 0, 0.45)
      const trussAngle = Math.atan2(halfWidth, rise)
      addBox('hangar back truss left', [0.9, slope, 0.65], [-halfLength + 0.65, (eave + ridge) / 2, -halfWidth / 2], 0x111a20, trussAngle, 0.42)
      addBox('hangar back truss right', [0.9, slope, 0.65], [-halfLength + 0.65, (eave + ridge) / 2, halfWidth / 2], 0x111a20, -trussAngle, 0.42)
      // One nearer cross-frame makes the V ceiling legible from the default three-quarter view.
      const frameX = -halfLength * 0.38
      addBox('hangar cross tie', [0.75, 0.75, room], [frameX, eave, 0], 0x1a2830, 0, 0.42)
      addBox('hangar cross truss left', [0.75, slope, 0.75], [frameX, (eave + ridge) / 2, -halfWidth / 2], 0x1a2830, trussAngle, 0.42)
      addBox('hangar cross truss right', [0.75, slope, 0.75], [frameX, (eave + ridge) / 2, halfWidth / 2], 0x1a2830, -trussAngle, 0.42)
      // Strong vertical bays make the space read as a large military hangar instead of a box.
      for (let i = -4; i <= 4; i++) {
        const z = (i / 4) * halfWidth * 0.9
        addBox(`hangar back rib ${i + 5}`, [0.8, eave, 0.28], [-halfLength + 0.5, eave / 2, z], 0x182228, 0, 0.35)
      }
    } else {
      scene.background = new Color(currentEnvironment === 'water' ? 0x355d73 : 0x2a2f36)
      const plane = new Mesh(
        new PlaneGeometry(size * 4, size * 4).rotateX(-Math.PI / 2),
        material(currentEnvironment === 'water' ? 0x1d4e68 : 0x8a8a84),
      )
      plane.name = currentEnvironment === 'water' ? 'water' : 'outside ground'
      ground.add(plane)
    }

    // One-foot grid with 10-foot major lines: useful for scale inspection, but deliberately opt-in.
    measurementGrid = new Group()
    measurementGrid.name = 'scale grid'
    const grid = new GridHelper(size, Math.max(1, Math.round(size / 0.3048)), 0xd8d2c0, 0x5a5f66)
    grid.position.y = 0.01
    const major = new GridHelper(size, Math.max(1, Math.round(size / 3.048)), 0xf2e9d0, 0xf2e9d0)
    major.position.y = 0.02
    measurementGrid.add(grid, major)
    measurementGrid.visible = gridOn
    ground.add(measurementGrid)
  }

  return {
    show(model, kind): void {
      if (current) {
        // Off before it goes: its materials are shared with the cached source.
        applyDebugViews(current, { wireframe: false, checker: false, unlit: false })
        holder.remove(current)
      }
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
    aim(eye, target): void {
      controls.target.set(...target)
      camera.position.set(...eye)
      camera.near = 0.5
      camera.far = 20_000
      camera.updateProjectionMatrix()
      controls.update()
    },
    freeze(): void {
      controls.autoRotate = false
      controls.enableDamping = false
      controls.enabled = false
      pipeline.setAntiAliasing('smaa')
    },
    setModelVisible(visible): void {
      holder.visible = visible
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
    setGrid(on): void {
      gridOn = on
      if (measurementGrid) measurementGrid.visible = on
    },
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
    environment(): HangarEnvironment { return currentEnvironment },
    render(): void {
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
