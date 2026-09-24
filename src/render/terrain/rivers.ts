import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RGFormat } from 'three'
import { toLocal } from '../../sim/world/projection.js'
import riverData from '../../../content/scenery/rivers.json' with { type: 'json' }
import placesData from '../../../content/scenery/places.json' with { type: 'json' }

export const RIVER_PATHS = riverData.map(r => ({
  name: r.name, widthM: r.widthM,
  points: r.coordinates.map(p => toLocal(p[1]!, p[0]!)),
}))

// The name+radius filter that narrows the Overpass query's raw 1,897 roads
// down to the 208 the Maharlika Highway alignment actually needs (design
// §7) now runs at BUILD time, in tools/scenery/build.ts's `buildPlaces` --
// moved out of this runtime filter (I1 fix wave, 2026-09-24) because Vite
// statically inlines the whole of `placesData` into the JS bundle, and the
// unfiltered file shipped 1,689 discarded roads on every page load. The
// committed `content/scenery/places.json` is therefore already filtered;
// see `build.ts` for the full history/measurements behind the filter's
// values. The raw 1,897-road fetch remains available only in the gitignored
// `tools/scenery/cache/places-overpass.json`.
export const ROAD_PATHS = placesData.roads.map(r => ({
  name: r.name, widthM: r.widthM,
  points: r.coordinates.map(p => toLocal(p[1]!, p[0]!)),
}))

function paint(
  paths: readonly { readonly widthM: number; readonly points: readonly { x: number; z: number }[] }[],
  data: Uint8Array, channel: 0 | 1, size: number,
  minX: number, minZ: number, stepX: number, stepZ: number, bankM: number,
): void {
  for (const path of paths) for (let i = 1; i < path.points.length; i++) {
    const a = path.points[i - 1]!, b = path.points[i]!
    const dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz
    if (len2 === 0) continue
    const radius = path.widthM / 2 + bankM
    const c0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - radius - minX) / stepX))
    const c1 = Math.min(size - 1, Math.ceil((Math.max(a.x, b.x) + radius - minX) / stepX))
    const r0 = Math.max(0, Math.floor((Math.min(a.z, b.z) - radius - minZ) / stepZ))
    const r1 = Math.min(size - 1, Math.ceil((Math.max(a.z, b.z) + radius - minZ) / stepZ))
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const px = minX + (c + 0.5) * stepX - a.x, pz = minZ + (r + 0.5) * stepZ - a.z
      const t = Math.max(0, Math.min(1, (px * dx + pz * dz) / len2))
      const distance = Math.hypot(px - t * dx, pz - t * dz)
      const value = Math.round(255 * Math.max(0, Math.min(1, (radius - distance) / bankM)))
      const index = (r * size + c) * 2 + channel
      data[index] = Math.max(data[index]!, value)
    }
  }
}

/** One mask shared by all terrain LODs. Colouring the terrain itself avoids
 * floating river ribbons, z-fighting and mismatched curvature at distance.
 * This is surface detail only: it does not carve the DEM or add water physics. */
export function createRiverMask(size = 8192) {
  const allPoints = [...RIVER_PATHS, ...ROAD_PATHS].flatMap(r => r.points)
  const minX = Math.min(...allPoints.map(p => p.x)) - 256
  const minZ = Math.min(...allPoints.map(p => p.z)) - 256
  const width = Math.max(...allPoints.map(p => p.x)) + 256 - minX
  const depth = Math.max(...allPoints.map(p => p.z)) + 256 - minZ
  const stepX = width / size, stepZ = depth / size
  const data = new Uint8Array(size * size * 2)
  // At this regional extent (rivers plus the radius-bounded Maharlika
  // Highway alignment, which still reaches far past the rivers' own small
  // footprint), texels are about 4.9 x 16.9 m -- measured directly against
  // the real, doubly-filtered ROAD_PATHS (name/ref AND the 80 km Tacloban
  // radius above), not the ~16.7 m estimate this file's own Ruling used
  // before this measurement existed. A soft margin both represents a damp
  // bank and prevents thin bends vanishing between texels.
  const bankM = Math.max(stepX, stepZ) * 1.5
  paint(RIVER_PATHS, data, 0, size, minX, minZ, stepX, stepZ, bankM)
  paint(ROAD_PATHS, data, 1, size, minX, minZ, stepX, stepZ, bankM)
  const texture = new DataTexture(data, size, size, RGFormat)
  texture.name = 'Leyte-river-road-surface-mask'
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
    if (c >= 0 && c < m.size && r >= 0 && r < m.size && m.data[(r * m.size + c) * 2]! > 24) return true
  }
  return false
}
