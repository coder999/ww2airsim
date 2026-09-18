import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RedFormat } from 'three'
import { toLocal } from '../../sim/world/projection.js'
import riverData from '../../../content/scenery/rivers.json'

export const RIVER_PATHS = riverData.map(r => ({
  name: r.name, widthM: r.widthM,
  points: r.coordinates.map(p => toLocal(p[1]!, p[0]!)),
}))

/** One mask shared by all terrain LODs. Colouring the terrain itself avoids
 * floating river ribbons, z-fighting and mismatched curvature at distance.
 * This is surface detail only: it does not carve the DEM or add water physics. */
export function createRiverMask(size = 4096) {
  const points = RIVER_PATHS.flatMap(r => r.points)
  const minX = Math.min(...points.map(p => p.x)) - 256
  const minZ = Math.min(...points.map(p => p.z)) - 256
  const width = Math.max(...points.map(p => p.x)) + 256 - minX
  const depth = Math.max(...points.map(p => p.z)) + 256 - minZ
  const stepX = width / size, stepZ = depth / size
  const data = new Uint8Array(size * size)
  // At this regional extent texels are about 9 x 8 m. A soft margin both
  // represents a damp bank and prevents thin bends vanishing between texels.
  const bankM = Math.max(stepX, stepZ) * 1.5
  for (const river of RIVER_PATHS) for (let i = 1; i < river.points.length; i++) {
    const a = river.points[i - 1]!, b = river.points[i]!
    const dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz
    if (len2 === 0) continue
    const radius = river.widthM / 2 + bankM
    const c0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - radius - minX) / stepX))
    const c1 = Math.min(size - 1, Math.ceil((Math.max(a.x, b.x) + radius - minX) / stepX))
    const r0 = Math.max(0, Math.floor((Math.min(a.z, b.z) - radius - minZ) / stepZ))
    const r1 = Math.min(size - 1, Math.ceil((Math.max(a.z, b.z) + radius - minZ) / stepZ))
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const px = minX + (c + 0.5) * stepX - a.x, pz = minZ + (r + 0.5) * stepZ - a.z
      const t = Math.max(0, Math.min(1, (px * dx + pz * dz) / len2))
      const distance = Math.hypot(px - t * dx, pz - t * dz)
      const value = Math.round(255 * Math.max(0, Math.min(1, (radius - distance) / bankM)))
      const index = r * size + c
      data[index] = Math.max(data[index]!, value)
    }
  }
  const texture = new DataTexture(data, size, size, RedFormat)
  texture.name = 'Leyte-river-surface-mask'
  texture.minFilter = LinearMipmapLinearFilter
  texture.magFilter = LinearFilter
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return { texture, minX, minZ, width, depth, stepX, stepZ, size, data }
}

let mask: ReturnType<typeof createRiverMask> | undefined
export function riverMask(): ReturnType<typeof createRiverMask> {
  return mask ??= createRiverMask()
}

/** Keep entire crowns out of water, including neighbouring edge texels. */
export function nearRiver(x: number, z: number): boolean {
  const m = riverMask()
  const col = Math.floor((x - m.minX) / m.stepX), row = Math.floor((z - m.minZ) / m.stepZ)
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    const c = col + dc, r = row + dr
    if (c >= 0 && c < m.size && r >= 0 && r < m.size && m.data[r * m.size + c]! > 24) return true
  }
  return false
}
