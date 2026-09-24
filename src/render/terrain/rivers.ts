import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RGFormat } from 'three'
import { toLocal } from '../../sim/world/projection.js'
import riverData from '../../../content/scenery/rivers.json'
import placesData from '../../../content/scenery/places.json'

export const RIVER_PATHS = riverData.map(r => ({
  name: r.name, widthM: r.widthM,
  points: r.coordinates.map(p => toLocal(p[1]!, p[0]!)),
}))

// Task 1's Overpass query has no name filter, so `places.json` carries
// every trunk/primary way in the whole 200 km query box -- 1,897 roads.
// Filtered by name/ref to the one alignment design §7 actually names
// ("the Maharlika Highway alignment... and the Ormoc side on the west"):
// 290 roads. THAT ALONE IS NOT ENOUGH -- measured 2026-09-24 against the
// real data: "Maharlika Highway" is OSM's name for the whole Pan-Philippine
// Highway, which crosses into Samar north of Tacloban (the San Juanico
// Bridge) and continues south past Abuyog -- the name-only set spans
// ~178 km, not the ~100 km (Tacloban-Ormoc, the alignment's own two named
// ends) this plan actually needs. A second filter -- every point of the way
// within 80 km of Tacloban's own world origin (comfortably beyond both
// Ormoc, ~50 km, and Abuyog, ~65-70 km, straight-line) -- brings it down to
// 208 roads (measured directly against the real data by running this exact
// filter, not estimated; the controller's own overnight measurement got
// 206 with the same filter -- a couple of ways sit close enough to the
// 80 km boundary that floating-point rounding in the projection can flip
// them either side, and it does not change the outcome below either way)
// spanning 138.7 km (depth of the combined river+road bbox), measured
// texel size 4.9 x 16.9 m at the mask's 8192² size -- two-texel 33.9 m,
// inside the <38 m bar with real margin, confirmed by running the actual
// code (not the ~17 m ESTIMATE the first version of this ruling used
// before measuring the actual geographic spread).
// Tacloban's own sourced coordinate (content/bases/tacloban.json's
// reference: "11.228 N 125.028 E"), not the tangent-plane's (0,0) origin
// (10.8 N, 125.3 E per master spec §4) -- these are different points, and
// filtering against the wrong one would silently miscenter this radius.
const TACLOBAN_LOCAL = toLocal(11.228, 125.028)
const TACLOBAN_RADIUS_M = 80_000
export const ROAD_PATHS = placesData.roads
  .filter(r => /maharlika/i.test(r.name) || r.name === '1')
  .map(r => ({
    name: r.name, widthM: r.widthM,
    points: r.coordinates.map(p => toLocal(p[1]!, p[0]!)),
  }))
  .filter(r => r.points.every(p =>
    Math.hypot(p.x - TACLOBAN_LOCAL.x, p.z - TACLOBAN_LOCAL.z) < TACLOBAN_RADIUS_M))

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
