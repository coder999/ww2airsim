import { Color, DynamicDrawUsage, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, PlaneGeometry } from 'three'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import { attribute, cameraWorldMatrix, float, length, max, mix, modelWorldMatrix, smoothstep, sqrt, uniform, uv, vec2, vec3, vec4 } from 'three/tsl'
import { residentCellOffsets, TREE_CELL_M, TREES_PER_CELL } from './treeCells.js'
import { SCENERY_TIERS, type SceneryTierName } from './tiers.js'
import type { TreeSite } from './vegetation.js'

const FAR_RANGES = { high: [2400, 4200], medium: [1600, 2800], low: [0, 0] } as const
const CELL_BATCH = 4
const LOAD_SLICE_MS = 1
const GROVE_RANGES = { high: [8000, 18000], medium: [5000, 11000], low: [0, 0] } as const

export function distantTreesEnabled(): boolean {
  return !(import.meta.env?.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).get('distantTrees') === 'off')
}

export type DistantTreeStats = {
  enabled: boolean; ready: boolean; instances: number; drawnInstances: number
  pending: number; generated: number; maxUpdateMs: number; fadeEndM: number
}

/** Two-triangle, analytically shaded crowns. Stable cell slots avoid rewriting
 * the whole forest at each crossing; only four newly resident cells are built
 * per frame. No images, per-tree objects, shadows or stipple mask. */
export function createDistantTrees(sitesAt: (cx: number, cz: number) => readonly TreeSite[], groves = false) {
  const cellSize = groves ? 1600 : TREE_CELL_M
  const perCell = groves ? 224 : TREES_PER_CELL
  const ranges = groves ? GROVE_RANGES : FAR_RANGES
  const maxCells = residentCellOffsets(ranges.high[1], cellSize).length
  const capacity = maxCells * perCell
  const centers = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(DynamicDrawUsage)
  const sizes = new InstancedBufferAttribute(new Float32Array(capacity * 2), 2).setUsage(DynamicDrawUsage)
  const colors = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(DynamicDrawUsage)
  const plane = new PlaneGeometry(2, 2)
  const geometry = new InstancedBufferGeometry()
  geometry.index = plane.index
  geometry.attributes = { ...plane.attributes, treeCenter: centers, treeSize: sizes, treeColor: colors }
  geometry.instanceCount = capacity
  const material = new MeshStandardNodeMaterial({ transparent: true, depthWrite: false, roughness: 1 })
  const nearStart = uniform(groves ? 2400 : 1400), nearEnd = uniform(groves ? 4200 : 1850)
  const farStart = uniform(ranges.high[0] as number), farEnd = uniform(ranges.high[1] as number)
  const center = attribute('treeCenter', 'vec3'), size = attribute('treeSize', 'vec2')
  // Scene objects are translated by -eye with no rotation. Camera axes are
  // therefore also the correct local axes for these crown cards.
  const p = uv().mul(2).sub(1)
  const cameraRight = cameraWorldMatrix.mul(vec4(1, 0, 0, 0)).xyz
  const cameraUp = cameraWorldMatrix.mul(vec4(0, 1, 0, 0)).xyz
  const topView = cameraWorldMatrix.mul(vec4(0, 0, 1, 0)).y.abs()
  const halfHeight = mix(size.y, size.x, topView)
  material.positionNode = center.add(cameraRight.mul(p.x.mul(size.x)))
    .add(cameraUp.mul(p.y.mul(halfHeight)))
  const a = p.sub(vec2(0, 0.12)).div(0.72)
  const b = p.sub(vec2(-0.43, -0.22)).div(0.49)
  const c = p.sub(vec2(0.39, -0.23)).div(0.55)
  const ab = length(a).lessThan(length(b)).select(a, b)
  const q = length(ab).lessThan(length(c)).select(ab, c)
  const edge = float(1).sub(smoothstep(0.85, 1, length(q)))
  // A rounded view-space normal lets the existing sun/sky/fog shade the
  // stand-in, rather than baking a fixed noon color into an unlit sprite.
  material.normalNode = vec3(q.x, q.y, sqrt(max(float(1).sub(q.dot(q)), 0.05))).normalize()
  material.colorNode = attribute('treeColor', 'vec3')
  const distance = length(modelWorldMatrix.mul(vec4(center, 1)).xyz)
  material.opacityNode = smoothstep(nearStart, nearEnd, distance)
    .mul(float(1).sub(smoothstep(farStart, farEnd, distance))).mul(edge)
  material.alphaTestNode = float(0)
  const object = new Mesh(geometry, material)
  object.name = groves ? 'distant crown groups' : 'distant tree crowns'
  object.frustumCulled = false
  object.renderOrder = groves ? -2 : -1 // Draw distant cards before the nearby blended crowns.
  const tint = new Color()
  type Cell = { slot: number; count: number; top: number }
  const cells = new Map<string, Cell>()
  let free: number[] = []
  let pending: { key: string; cx: number; cz: number }[] = []
  let previousKey = '', tier: SceneryTierName = 'high', generated = 0, maxUpdateMs = 0
  let count = 0, top = -Infinity
  const dirty = (a: InstancedBufferAttribute, slot: number) => {
    a.addUpdateRange(slot * perCell * a.itemSize, perCell * a.itemSize)
    a.needsUpdate = true
  }
  const clear = (slot: number) => {
    (sizes.array as Float32Array).fill(0, slot * perCell * 2, (slot + 1) * perCell * 2)
    dirty(sizes, slot)
  }
  const reset = () => {
    for (const cell of cells.values()) clear(cell.slot)
    cells.clear()
    free = Array.from({ length: maxCells }, (_, i) => maxCells - i - 1)
    pending = []
    previousKey = ''
    count = 0
    top = -Infinity
  }
  reset()
  return {
    object,
    reset,
    setTier(name: SceneryTierName) {
      tier = name
      nearEnd.value = groves ? FAR_RANGES[name][1] : SCENERY_TIERS[name].treeFadeEndM
      nearStart.value = groves ? FAR_RANGES[name][0] : Math.max(0, nearEnd.value - 450)
      farStart.value = ranges[name][0]
      farEnd.value = ranges[name][1]
      reset()
    },
    stats(parentVisible = true): DistantTreeStats {
      return { enabled: true, ready: pending.length === 0, instances: count,
        drawnInstances: parentVisible && object.visible ? count : 0,
        pending: pending.length, generated, maxUpdateMs, fadeEndM: farEnd.value }
    },
    update(x: number, z: number, eyeY: number) {
      if (tier === 'low') { object.visible = false; return }
      const started = performance.now()
      const cx = Math.floor(x / cellSize), cz = Math.floor(z / cellSize)
      const key = `${cx},${cz}`
      if (key !== previousKey) {
        previousKey = key
        const wanted = residentCellOffsets(farEnd.value, cellSize).map(([dx, dz]) => ({ key: `${cx + dx},${cz + dz}`, cx: cx + dx, cz: cz + dz }))
        const keys = new Set(wanted.map(cell => cell.key))
        for (const [k, cell] of cells) if (!keys.has(k)) {
          clear(cell.slot)
          free.push(cell.slot)
          cells.delete(k)
        }
        pending = wanted.filter(cell => !cells.has(cell.key)).sort((a, b) =>
          Math.hypot(a.cx - cx, a.cz - cz) - Math.hypot(b.cx - cx, b.cz - cz))
      }
      let changed = false
      for (let n = 0; n < CELL_BATCH && pending.length > 0; n++) {
        const next = pending.shift()!, slot = free.pop()!
        const sites = sitesAt(next.cx, next.cz)
        let cellTop = -Infinity
        sites.forEach((t, i) => {
          const at = slot * perCell + i
          centers.setXYZ(at, t.x, t.y + t.height * 0.84, t.z)
          sizes.setXY(at, t.radius * (groves ? 4.2 : 1.4), t.height * (groves ? 0.5 : 0.36))
          tint.setHSL(0.25 + t.shade * 0.08, 0.24 + t.shade * 0.14, 0.16 + t.shade * 0.07)
          colors.setXYZ(at, tint.r, tint.g, tint.b)
          cellTop = Math.max(cellTop, t.y + t.height + t.radius * (groves ? 5 : 2))
        })
        cells.set(next.key, { slot, count: sites.length, top: cellTop })
        for (const a of [centers, sizes, colors]) dirty(a, slot)
        generated++
        changed = true
        // A cell is atomic; stop before starting another once this frame's
        // slice is spent. The four-cell cap also bounds very fast machines.
        if (performance.now() - started >= LOAD_SLICE_MS) break
      }
      if (changed) {
        count = 0; top = -Infinity
        for (const cell of cells.values()) { count += cell.count; top = Math.max(top, cell.top) }
      }
      object.visible = count > 0 && eyeY - top <= farEnd.value
      maxUpdateMs = Math.max(maxUpdateMs, performance.now() - started)
    },
  }
}
