// src/render/scene/shipFit.ts
/**
 * Fitting a ship model to the ShipSpec the sim is authoritative for (ship-models
 * spec §4). Pure: typed arrays in, numbers and typed arrays out. No DOM, no
 * three.js, no loader. `tools/models/stages/shipFit.ts` calls it at build time
 * and `tests/tools/shipModels.test.ts` calls it again on the COMMITTED glb
 * against the LIVE content/ships/<id>.json, so a moved deck fails the suite.
 *
 * Frame: meters, +x bow, +y up, +z starboard, waterline at y = 0, which is the
 * frame `normalize` bakes (A6M Zero spec §6.1) and the one `createShipMesh`
 * has always drawn in.
 */

/** Every triangle of a model, flattened into one frame. */
export interface TriangleSoup {
  /** xyz per vertex. */
  readonly positions: Float32Array
  /** Three vertex indices per triangle. */
  readonly indices: Uint32Array
}

/** The ShipSpec fields a fit reads. A structural subset, so this module does not import src/sim. */
export interface FitSpec {
  readonly id: string
  readonly role: string
  readonly lengthM: number
  readonly beamM: number
  readonly deckHeightM: number
  readonly flightDeck?: { readonly lengthM: number; readonly widthM: number; readonly heightM: number } | undefined
  readonly trapZone?: { readonly fromSternM: number; readonly toSternM: number } | undefined
}

/** Design constants (spec §4.4). A change here is a design change: say so in the commit. */
export const TOLERANCE = {
  hullLengthFrac: 0.005,
  deckLengthFrac: 0.005,
  overallLengthFrac: 0.03,
  kMin: 0.85,
  kMax: 1.25,
  syOverSxMin: 0.85,
  syOverSxMax: 1.15,
  mainDeckM: 3,
  deckCellM: 0.15,
  deckCellShareMin: 0.95,
  edgeBandM: 2.5,
  belowDeckEndM: 45,
  belowDeckEdgeM: 4,
  fittingM: 0.5,
  narrowEndMax: 0.9,
} as const

/** Where the skirt ends, meters (spec §4.5). */
export const SKIRT_BOTTOM_M = -3

/** A pinned narrow-end ratio's tolerance: the Liberty reads 0.938 bow-forward and about 1.066 reversed (2026-09-25). */
export const PINNED_NARROW_END_TOL = 0.03

/** Up-facing: a unit normal whose y exceeds this (spec §5.1). */
export const UP_NY = 0.9
/** Half-height of the band a deck plane's triangles are gathered from, meters. */
export const PLANE_TOL_M = 0.3

const tri = (m: TriangleSoup, t: number): [number, number, number] => [m.indices[3 * t]!, m.indices[3 * t + 1]!, m.indices[3 * t + 2]!]
const px = (m: TriangleSoup, v: number): number => m.positions[3 * v]!
const py = (m: TriangleSoup, v: number): number => m.positions[3 * v + 1]!
const pz = (m: TriangleSoup, v: number): number => m.positions[3 * v + 2]!

export const triangleCount = (m: TriangleSoup): number => m.indices.length / 3

/** Area and unit normal of triangle `t` (counter-clockwise front face, glTF's winding). */
export function triangleNormal(m: TriangleSoup, t: number): { area: number; nx: number; ny: number; nz: number; cx: number; cy: number; cz: number } {
  const [a, b, c] = tri(m, t)
  const ux = px(m, b) - px(m, a), uy = py(m, b) - py(m, a), uz = pz(m, b) - pz(m, a)
  const vx = px(m, c) - px(m, a), vy = py(m, c) - py(m, a), vz = pz(m, c) - pz(m, a)
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
  const len = Math.hypot(nx, ny, nz)
  return {
    area: len / 2,
    nx: len ? nx / len : 0, ny: len ? ny / len : 0, nz: len ? nz / len : 0,
    cx: (px(m, a) + px(m, b) + px(m, c)) / 3, cy: (py(m, a) + py(m, b) + py(m, c)) / 3, cz: (pz(m, a) + pz(m, b) + pz(m, c)) / 3,
  }
}

export function bounds(m: TriangleSoup): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < m.positions.length; i += 3) {
    for (let k = 0; k < 3; k++) { const v = m.positions[i + k]!; if (v < min[k]!) min[k] = v; if (v > max[k]!) max[k] = v }
  }
  return { min, max }
}

/** The `p`th percentile (0..100) of `values`, nearest-rank. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) throw new Error('percentile of nothing')
  const s = [...values].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))]!
}

/**
 * The height of the largest up-facing surface between `minY` and `maxY`:
 * up-facing triangle area binned by centroid height in `binM` bins, the
 * heaviest bin's area-weighted mean height. A carrier's flight deck, a
 * freighter's main deck.
 */
export function dominantUpPlane(m: TriangleSoup, minY: number, maxY: number, binM: number): number {
  const area = new Map<number, number>(), moment = new Map<number, number>()
  for (let t = 0; t < triangleCount(m); t++) {
    const n = triangleNormal(m, t)
    if (n.ny <= UP_NY || n.cy < minY || n.cy > maxY) continue
    const bin = Math.floor(n.cy / binM)
    area.set(bin, (area.get(bin) ?? 0) + n.area)
    moment.set(bin, (moment.get(bin) ?? 0) + n.area * n.cy)
  }
  let best: number | null = null
  for (const [bin, a] of area) if (best === null || a > area.get(best)!) best = bin
  if (best === null) throw new Error(`no up-facing surface between y ${minY} and ${maxY}`)
  return moment.get(best)! / area.get(best)!
}

/**
 * Where a horizontal plane at height `y` cuts the model: one segment per
 * triangle that straddles it, as [x0, z0, x1, z1]. Exact, however sparse the
 * mesh's vertex rows are (a vertex band misses a low-poly hull entirely).
 */
export function sectionAt(m: TriangleSoup, y: number): number[][] {
  const out: number[][] = []
  for (let t = 0; t < triangleCount(m); t++) {
    const vs = tri(m, t)
    const pts: number[] = []
    for (let e = 0; e < 3; e++) {
      const a = vs[e]!, b = vs[(e + 1) % 3]!
      const ya = py(m, a) - y, yb = py(m, b) - y
      if ((ya < 0 && yb >= 0) || (yb < 0 && ya >= 0)) {
        const s = ya / (ya - yb)
        pts.push(px(m, a) + s * (px(m, b) - px(m, a)), pz(m, a) + s * (pz(m, b) - pz(m, a)))
      }
    }
    if (pts.length === 4) out.push(pts)
  }
  return out
}

/** The section's lateral extent at height `y`, optionally only where x lies in [xLo, xHi]. */
export function sectionBeam(m: TriangleSoup, y: number, xLo = -Infinity, xHi = Infinity): { minZ: number; maxZ: number; width: number } {
  let minZ = Infinity, maxZ = -Infinity
  const take = (x: number, z: number): void => { if (x >= xLo && x <= xHi) { minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z) } }
  for (const [x0, z0, x1, z1] of sectionAt(m, y) as [number, number, number, number][]) {
    take(x0, z0); take(x1, z1)
    for (const xb of [xLo, xHi]) {
      if (Number.isFinite(xb) && (x0 - xb) * (x1 - xb) < 0) take(xb, z0 + ((xb - x0) / (x1 - x0)) * (z1 - z0))
    }
  }
  return { minZ, maxZ, width: maxZ > minZ ? maxZ - minZ : 0 }
}

/** The height at which "waterline beam" is read, meters: just above y = 0, where a waterline model's flat base meets its sides. */
export const WATERLINE_SECTION_M = 0.1

export function waterlineBeam(m: TriangleSoup): number {
  const w = sectionBeam(m, WATERLINE_SECTION_M).width
  if (!(w > 0)) throw new Error(`nothing crosses y = ${WATERLINE_SECTION_M} m: the waterline origin is wrong`)
  return w
}

/**
 * Spec §4.2's bow check for non-carriers: the widest half-beam in the forward
 * `frac` of the hull over the widest in the aft `frac`, read on sections at
 * `heights` above the waterline. A bow is finer than a stern, so a value over
 * 0.9 means the model is backward.
 */
export function narrowEndRatio(m: TriangleSoup, heights: readonly number[] = [0.1, 0.5, 1], frac = 0.05): number {
  const b = bounds(m)
  const len = b.max[0] - b.min[0]
  let fore = 0, aft = 0
  for (const y of heights) {
    const f = sectionBeam(m, y, b.max[0] - frac * len, b.max[0])
    const a = sectionBeam(m, y, b.min[0], b.min[0] + frac * len)
    if (f.width > 0) fore = Math.max(fore, Math.abs(f.minZ), Math.abs(f.maxZ))
    if (a.width > 0) aft = Math.max(aft, Math.abs(a.minZ), Math.abs(a.maxZ))
  }
  if (aft === 0) throw new Error('narrowEndRatio: no stern section at the given heights')
  return fore / aft
}

/**
 * Points where a vertical ray's TOPMOST hit lies within `tol` of `planeY`, on
 * a `stepM` grid: an area-uniform sample of the deck as the eye sees it from
 * above (the island hides the deck under it, as it does in the game).
 */
export function planeSamples(m: TriangleSoup, planeY: number, stepM = 0.5, tol = 0.15): { xs: number[]; zs: number[] } {
  const b = bounds(m)
  const probe = createHeightProbe(m)
  const xs: number[] = [], zs: number[] = []
  for (let x = b.min[0] + stepM / 2; x < b.max[0]; x += stepM) {
    for (let z = b.min[2] + stepM / 2; z < b.max[2]; z += stepM) {
      const y = probe(x, z)
      if (y !== null && Math.abs(y - planeY) <= tol) { xs.push(x); zs.push(z) }
    }
  }
  if (xs.length === 0) throw new Error(`no deck visible at y ${planeY}`)
  return { xs, zs }
}

/** The slice length `deckExtent` measures in, meters. */
export const DECK_SLICE_M = 0.5
/** A slice counts as deck when this much of it, across, is visible deck. */
export const DECK_SLICE_MIN_M = 2

/**
 * A deck's visible extent, from `planeSamples` on a 0.5 m grid: its length
 * is first to last `DECK_SLICE_M` slice holding at least `DECK_SLICE_MIN_M`
 * of visible deck across (so one stray sample far off cannot stretch it, and
 * a tapered end is not trimmed the way an area percentile trims it); its
 * center is that span's middle. Its width is the median over those slices of
 * each slice's visible edge-to-edge width at the slice's middle, with both
 * edges refined by bisection to 1 mm, so the 0.5 m grid does not quantize it.
 */
export function deckExtent(m: TriangleSoup, planeY: number): { length: number; centerX: number; medianWidth: number; minX: number; maxX: number } {
  const step = 0.5
  const probe = createHeightProbe(m)
  const onDeck = (x: number, z: number): boolean => { const y = probe(x, z); return y !== null && Math.abs(y - planeY) <= 0.15 }
  const { xs, zs } = planeSamples(m, planeY, step)
  const count = new Map<number, number>(), zlo = new Map<number, number>(), zhi = new Map<number, number>()
  xs.forEach((x, i) => {
    const s = Math.floor(x / DECK_SLICE_M)
    count.set(s, (count.get(s) ?? 0) + 1)
    zlo.set(s, Math.min(zlo.get(s) ?? Infinity, zs[i]!))
    zhi.set(s, Math.max(zhi.get(s) ?? -Infinity, zs[i]!))
  })
  const perSlice = (DECK_SLICE_M / step) * (DECK_SLICE_MIN_M / step)
  const deck = [...count.keys()].filter((s) => count.get(s)! >= perSlice).sort((a, b) => a - b)
  if (deck.length === 0) throw new Error(`no ${DECK_SLICE_M} m slice holds ${DECK_SLICE_MIN_M} m of visible deck at y ${planeY}`)
  const minX = deck[0]! * DECK_SLICE_M, maxX = (deck.at(-1)! + 1) * DECK_SLICE_M
  // Bisect from an on-deck z toward an off-deck z, 1 mm.
  const edge = (x: number, inZ: number, outZ: number): number => {
    let a = inZ, b = outZ
    while (Math.abs(b - a) > 0.001) { const c = (a + b) / 2; if (onDeck(x, c)) a = c; else b = c }
    return a
  }
  const widths = deck.map((s) => {
    const x = (s + 0.5) * DECK_SLICE_M
    const lo = zlo.get(s)!, hi = zhi.get(s)!
    const zLo = onDeck(x, lo) ? edge(x, lo, lo - step) : lo
    const zHi = onDeck(x, hi) ? edge(x, hi, hi + step) : hi
    return zHi - zLo
  })
  return { length: maxX - minX, centerX: (minX + maxX) / 2, minX, maxX, medianWidth: percentile(widths, 50) }
}

/**
 * Where a carrier's island is: the area-weighted mean z of every triangle
 * whose centroid is more than `aboveM` over the deck plane, and the xz box of
 * those on the starboard half. Spec §4.2: after the fit the island must be to
 * starboard (+z); a reversed or mirrored carrier puts it to port.
 */
export function islandOf(m: TriangleSoup, deckY: number, aboveM = 3): { meanZ: number; minX: number; maxX: number; minZ: number; maxZ: number } {
  let a = 0, az = 0
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (let t = 0; t < triangleCount(m); t++) {
    const n = triangleNormal(m, t)
    if (n.cy <= deckY + aboveM) continue
    a += n.area; az += n.area * n.cz
    if (n.cz <= 0) continue
    for (const v of tri(m, t)) {
      minX = Math.min(minX, px(m, v)); maxX = Math.max(maxX, px(m, v))
      minZ = Math.min(minZ, pz(m, v)); maxZ = Math.max(maxZ, pz(m, v))
    }
  }
  if (a === 0) throw new Error(`islandOf: nothing more than ${aboveM} m above the deck at ${deckY}`)
  return { meanZ: az / a, minX, maxX, minZ, maxZ }
}

/**
 * The residual fit applied after `normalize` (spec §4.3): translate x by
 * `shiftX`, scale x by `rx` and y by `ry`, and scale z by `rx * k(y')`, where
 * `k` runs linearly from `kWaterline` at y' = 0 to `kDeck` at y' = `deckY`
 * and holds outside that span. A hull fit is rx = ry = 1, shiftX = 0 and
 * kWaterline = kDeck.
 */
export interface ShipFit {
  readonly shiftX: number
  readonly rx: number
  readonly ry: number
  readonly kWaterline: number
  readonly kDeck: number
  /** Fitted meters: the height at which `k` reaches `kDeck`. */
  readonly deckY: number
}

export function lateralK(fit: ShipFit, y: number): number {
  const t = fit.deckY > 0 ? Math.min(1, Math.max(0, y / fit.deckY)) : 1
  return fit.kWaterline + (fit.kDeck - fit.kWaterline) * t
}

/** d k / d y' at `y` (0 outside the ramp). */
function lateralKSlope(fit: ShipFit, y: number): number {
  return fit.deckY > 0 && y > 0 && y < fit.deckY ? (fit.kDeck - fit.kWaterline) / fit.deckY : 0
}

/**
 * Applies `fit` to positions in place, and to normals by the inverse
 * transpose of the map's Jacobian, so a warped hull keeps its authored
 * shading. The map is x' = rx (x + shiftX), y' = ry y, z' = rx k(y') z.
 */
export function applyFit(positions: Float32Array, normals: Float32Array | null, fit: ShipFit): void {
  for (let v = 0; v < positions.length / 3; v++) {
    const x = positions[3 * v]!, y = positions[3 * v + 1]!, z = positions[3 * v + 2]!
    const y2 = fit.ry * y
    const k = lateralK(fit, y2)
    positions[3 * v] = fit.rx * (x + fit.shiftX)
    positions[3 * v + 1] = y2
    positions[3 * v + 2] = fit.rx * k * z
    if (normals) {
      const d = fit.rx * k
      const c = fit.rx * z * lateralKSlope(fit, y2) * fit.ry
      const nx = normals[3 * v]! / fit.rx
      const nz = normals[3 * v + 2]! / d
      const ny = normals[3 * v + 1]! / fit.ry - (c / (fit.ry * d)) * normals[3 * v + 2]!
      const len = Math.hypot(nx, ny, nz) || 1
      normals[3 * v] = nx / len; normals[3 * v + 1] = ny / len; normals[3 * v + 2] = nz / len
    }
  }
}

/** The fit for a carrier (`fit: "deck"`, spec §4.3), from normalized geometry. */
export function deckFit(m: TriangleSoup, spec: FitSpec): ShipFit {
  const fd = spec.flightDeck
  if (!fd) throw new Error(`${spec.id}: fit "deck" needs a flightDeck`)
  const b = bounds(m)
  const deckY0 = dominantUpPlane(m, b.max[1] * 0.2, b.max[1], 0.1)
  const d = deckExtent(m, deckY0)
  const rx = fd.lengthM / d.length
  const ry = fd.heightM / deckY0
  const wl = waterlineBeam(m)
  return { shiftX: -d.centerX, rx, ry, kWaterline: spec.beamM / (wl * rx), kDeck: fd.widthM / (d.medianWidth * rx), deckY: fd.heightM }
}

/** The fit for everything else (`fit: "hull"`): length is `normalize`'s, lateral k matches the waterline beam. */
export function hullFit(m: TriangleSoup, spec: FitSpec): ShipFit {
  const k = spec.beamM / waterlineBeam(m)
  return { shiftX: 0, rx: 1, ry: 1, kWaterline: k, kDeck: k, deckY: spec.deckHeightM }
}

/** A vertical ray's topmost hit, bucketed so a 2,096-cell grid over 15k triangles is fast. */
export function createHeightProbe(m: TriangleSoup, cellM = 4): (x: number, z: number) => number | null {
  const b = bounds(m)
  const nx = Math.max(1, Math.ceil((b.max[0] - b.min[0]) / cellM)), nz = Math.max(1, Math.ceil((b.max[2] - b.min[2]) / cellM))
  const buckets: number[][] = Array.from({ length: nx * nz }, () => [])
  const ix = (x: number): number => Math.min(nx - 1, Math.max(0, Math.floor((x - b.min[0]) / cellM)))
  const iz = (z: number): number => Math.min(nz - 1, Math.max(0, Math.floor((z - b.min[2]) / cellM)))
  for (let t = 0; t < triangleCount(m); t++) {
    const [a, bb, c] = tri(m, t)
    const x0 = Math.min(px(m, a), px(m, bb), px(m, c)), x1 = Math.max(px(m, a), px(m, bb), px(m, c))
    const z0 = Math.min(pz(m, a), pz(m, bb), pz(m, c)), z1 = Math.max(pz(m, a), pz(m, bb), pz(m, c))
    for (let i = ix(x0); i <= ix(x1); i++) for (let j = iz(z0); j <= iz(z1); j++) buckets[i * nz + j]!.push(t)
  }
  return (x, z) => {
    if (x < b.min[0] || x > b.max[0] || z < b.min[2] || z > b.max[2]) return null
    let top: number | null = null
    for (const t of buckets[ix(x) * nz + iz(z)]!) {
      const [a, bb, c] = tri(m, t)
      const ax = px(m, a), az = pz(m, a), bx = px(m, bb), bz = pz(m, bb), cx = px(m, c), cz = pz(m, c)
      const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz)
      if (Math.abs(det) < 1e-12) continue
      const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det
      const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det
      const l3 = 1 - l1 - l2
      if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue
      const y = l1 * py(m, a) + l2 * py(m, bb) + l3 * py(m, c)
      if (top === null || y > top) top = y
    }
    return top
  }
}

export interface DeckGridReport {
  readonly cells: number
  /** Share of cells more than `edgeBandM` from the long edges within ±deckCellM of the deck. */
  readonly innerOnDeck: number
  /** Share of all cells within ±deckCellM. */
  readonly allOnDeck: number
  /** Cells on the centerline (|z| <= 1 m) or in the trap zone's lane that are NOT on the deck. */
  readonly laneMisses: number
  /** Below-deck cells outside the allowed corners. */
  readonly strayBelow: number
  readonly belowShare: number
  /** The highest above-deck excess outside the island's box, meters. */
  readonly worstFitting: number
}

/**
 * Spec §4.3 step 4: `cellM` cells over the sim's flight-deck rectangle, each
 * compared with the deck height. `lane` is the half-width of the trap-zone
 * lane checked at 100%: the trap band's own half-width (ship.ts).
 */
export function deckGrid(m: TriangleSoup, spec: FitSpec, lane: number, island: { minX: number; maxX: number; minZ: number; maxZ: number }, cellM = 2): DeckGridReport {
  const fd = spec.flightDeck!, tz = spec.trapZone
  const probe = createHeightProbe(m)
  const L = fd.lengthM, W = fd.widthM, H = fd.heightM
  let cells = 0, inner = 0, innerOn = 0, allOn = 0, laneMisses = 0, strayBelow = 0, below = 0, worstFitting = 0
  const nx = Math.floor(L / cellM), nz = Math.floor(W / cellM)
  for (let i = 0; i < nx; i++) {
    const x = (i - (nx - 1) / 2) * cellM
    for (let j = 0; j < nz; j++) {
      const z = (j - (nz - 1) / 2) * cellM
      cells++
      const y = probe(x, z)
      const on = y !== null && Math.abs(y - H) <= TOLERANCE.deckCellM
      const isInner = Math.abs(z) <= W / 2 - TOLERANCE.edgeBandM
      if (isInner) { inner++; if (on) innerOn++ }
      if (on) allOn++
      const fromStern = x + L / 2
      const inLane = Math.abs(z) <= 1 || (tz !== undefined && fromStern >= tz.fromSternM && fromStern <= tz.toSternM && Math.abs(z) <= lane)
      if (inLane && !on) laneMisses++
      if (y === null || y < H - TOLERANCE.deckCellM) {
        below++
        if (!(Math.abs(x) >= L / 2 - TOLERANCE.belowDeckEndM && Math.abs(z) >= W / 2 - TOLERANCE.belowDeckEdgeM)) strayBelow++
      } else if (y > H + TOLERANCE.deckCellM) {
        const inIsland = x >= island.minX - 2 && x <= island.maxX + 2 && z >= island.minZ - 2 && z <= island.maxZ + 2
        if (!inIsland) worstFitting = Math.max(worstFitting, y - H)
      }
    }
  }
  return { cells, innerOnDeck: innerOn / inner, allOnDeck: allOn / cells, laneMisses, strayBelow, belowShare: below / cells, worstFitting }
}

/**
 * The half-width of the trap band a carrier's model can carry (spec §4.3
 * step 5): 0.45 of the deck's width (ship.ts's boxes draw 0.9 W), narrowed
 * to 1 m inboard of anything over `fittingM` above the deck inside the trap
 * zone's span, which on the CV-6 is the island (measured 2026-09-25).
 */
export function trapLaneHalfWidth(m: TriangleSoup, spec: FitSpec, stepM = 0.5): number {
  const fd = spec.flightDeck!, tz = spec.trapZone!
  const probe = createHeightProbe(m)
  let half = 0.45 * fd.widthM
  for (let s = tz.fromSternM; s <= tz.toSternM; s += stepM) {
    const x = -fd.lengthM / 2 + s
    for (let z = 0; z <= half; z += stepM / 2) {
      for (const zz of [z, -z]) {
        const y = probe(x, zz)
        if (y !== null && y > fd.heightM + TOLERANCE.fittingM) half = Math.min(half, Math.abs(zz) - 1)
      }
    }
  }
  return half
}

/** Topmost hit at or below `belowY` straight under (x, z), or null. */
export function surfaceBelow(m: TriangleSoup, x: number, z: number, belowY: number): number | null {
  let top: number | null = null
  for (let t = 0; t < triangleCount(m); t++) {
    const [a, b, c] = tri(m, t)
    const ax = px(m, a), az = pz(m, a), bx = px(m, b), bz = pz(m, b), cx = px(m, c), cz = pz(m, c)
    const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz)
    if (Math.abs(det) < 1e-12) continue
    const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det
    const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det
    const l3 = 1 - l1 - l2
    if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue
    const y = l1 * py(m, a) + l2 * py(m, b) + l3 * py(m, c)
    if (y <= belowY && (top === null || y > top)) top = y
  }
  return top
}

/**
 * The skirt's outline (spec §4.5): the 2D convex hull, in xz, of every vertex
 * within `bandM` of the lowest one, counter-clockwise seen from above
 * (Andrew's monotone chain).
 */
export function skirtOutline(m: TriangleSoup, bandM = 0.3): [number, number][] {
  const minY = bounds(m).min[1]
  const pts: [number, number][] = []
  for (let v = 0; v < m.positions.length / 3; v++) if (py(m, v) <= minY + bandM) pts.push([px(m, v), pz(m, v)])
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (o: [number, number], a: [number, number], b: [number, number]): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: [number, number][] = [], upper: [number, number][] = []
  for (const p of pts) { while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, p) <= 0) lower.pop(); lower.push(p) }
  for (const p of [...pts].reverse()) { while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, p) <= 0) upper.pop(); upper.push(p) }
  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)]
  if (hull.length < 3) throw new Error('skirtOutline: fewer than three points at the base')
  return hull
}

/**
 * A wall around `outline` from y = `top` down to y = `bottom`: two triangles
 * per edge, wound so the front face looks outward, and a horizontal outward
 * normal per vertex (four vertices per edge, flat-shaded).
 */
export function skirtWall(outline: readonly [number, number][], top: number, bottom: number): { positions: Float32Array; normals: Float32Array; indices: Uint32Array } {
  const pos: number[] = [], nor: number[] = [], idx: number[] = []
  // Signed area: counter-clockwise in (x, z) when positive.
  let area = 0
  outline.forEach((p, i) => { const q = outline[(i + 1) % outline.length]!; area += p[0] * q[1] - q[0] * p[1] })
  const ccw = area > 0
  outline.forEach((p, i) => {
    const q = outline[(i + 1) % outline.length]!
    const ex = q[0] - p[0], ez = q[1] - p[1]
    const len = Math.hypot(ex, ez) || 1
    // Outward normal in xz for a counter-clockwise (x, z) polygon is (ez, -ex).
    const nx = (ccw ? ez : -ez) / len, nz = (ccw ? -ex : ex) / len
    const b = pos.length / 3
    pos.push(p[0], top, p[1], q[0], top, q[1], q[0], bottom, q[1], p[0], bottom, p[1])
    for (let k = 0; k < 4; k++) nor.push(nx, 0, nz)
    // Front face = counter-clockwise seen from outside.
    const quad = [b, b + 1, b + 2, b, b + 2, b + 3]
    const t0 = triangleNormal({ positions: new Float32Array(pos), indices: new Uint32Array(quad.slice(0, 3)) }, 0)
    idx.push(...(t0.nx * nx + t0.nz * nz >= 0 ? quad : [b, b + 2, b + 1, b, b + 3, b + 2]))
  })
  return { positions: new Float32Array(pos), normals: new Float32Array(nor), indices: new Uint32Array(idx) }
}

/** How a model proves its bow is at +x (spec §4.2). */
export type BowCheck = 'narrow-end' | 'island-starboard' | { readonly pinnedNarrowEnd: number; readonly evidence: string }

export interface FitOptions {
  readonly fit: 'deck' | 'hull'
  readonly kind: 'waterline' | 'full-hull'
  readonly bow: BowCheck
  /** full-hull only: the keel's depth measured at S1, pinned so a moved origin fails. */
  readonly keelM?: number | undefined
}

/** What a fitted model measures, for the build log and the progress ledger. */
export interface FitMeasures {
  readonly overallLengthM: number
  readonly waterlineBeamM: number
  readonly baseY: number
  readonly topY: number
  readonly narrowEnd: number
  readonly mainDeckM?: number
  readonly deckPlaneM?: number
  readonly deckLengthM?: number
  readonly deckWidthM?: number
  readonly islandMeanZ?: number
  readonly islandInboardZ?: number
  readonly trapLaneHalfWidthM?: number
  readonly grid?: DeckGridReport
}

const pct = (a: number, b: number): string => `${(((a / b) - 1) * 100).toFixed(2)}%`

/**
 * Every §4.4 tolerance, re-measured on FITTED geometry against the spec. The
 * build calls it before writing; Tier 1 calls it on the committed glb against
 * the live content/ships JSON. Each problem names the quantity, the measured
 * value and the limit.
 */
export function fitProblems(m: TriangleSoup, spec: FitSpec, o: FitOptions): { problems: string[]; measures: FitMeasures } {
  const problems: string[] = []
  const b = bounds(m)
  if (!Array.from(m.positions).every(Number.isFinite)) problems.push('a vertex is not finite')
  const overall = b.max[0] - b.min[0]
  const wl = waterlineBeam(m)
  const narrow = narrowEndRatio(m)
  let measures: FitMeasures = { overallLengthM: overall, waterlineBeamM: wl, baseY: b.min[1], topY: b.max[1], narrowEnd: narrow }
  if (Math.abs(wl / spec.beamM - 1) > 0.01) problems.push(`waterline beam ${wl.toFixed(2)} m vs beamM ${spec.beamM} (${pct(wl, spec.beamM)}, limit ±1%)`)
  if (o.kind === 'waterline' && Math.abs(b.min[1] - SKIRT_BOTTOM_M) > 0.05) problems.push(`skirt bottom at y ${b.min[1].toFixed(3)}, expected ${SKIRT_BOTTOM_M}`)
  if (o.kind === 'full-hull') {
    if (o.keelM === undefined) problems.push('a full-hull model needs its measured keelM')
    else if (Math.abs(b.min[1] - o.keelM) > 0.05) problems.push(`keel at y ${b.min[1].toFixed(3)}, pinned at ${o.keelM} ± 0.05 (the waterline origin moved)`)
  }
  if (o.bow === 'narrow-end' && narrow > TOLERANCE.narrowEndMax) problems.push(`narrow-end ratio ${narrow.toFixed(3)} > ${TOLERANCE.narrowEndMax}: the bow is not at +x`)
  if (typeof o.bow === 'object' && Math.abs(narrow - o.bow.pinnedNarrowEnd) > PINNED_NARROW_END_TOL) problems.push(`narrow-end ratio ${narrow.toFixed(3)}, pinned at ${o.bow.pinnedNarrowEnd} ± ${PINNED_NARROW_END_TOL} (${o.bow.evidence}): the model was reversed`)
  if (o.fit === 'hull') {
    if (Math.abs(overall / spec.lengthM - 1) > TOLERANCE.hullLengthFrac) problems.push(`hull length ${overall.toFixed(2)} m vs lengthM ${spec.lengthM} (${pct(overall, spec.lengthM)}, limit ±0.5%)`)
    const main = dominantUpPlane(m, 0.5, spec.deckHeightM + TOLERANCE.mainDeckM + 3, 0.25)
    measures = { ...measures, mainDeckM: main }
    if (Math.abs(main - spec.deckHeightM) > TOLERANCE.mainDeckM) problems.push(`main deck at ${main.toFixed(2)} m vs deckHeightM ${spec.deckHeightM} (limit ±${TOLERANCE.mainDeckM} m)`)
  } else {
    const fd = spec.flightDeck
    if (!fd) return { problems: [...problems, `${spec.id}: fit "deck" needs a flightDeck`], measures }
    const plane = dominantUpPlane(m, b.max[1] * 0.2, b.max[1], 0.1)
    const d = deckExtent(m, plane)
    const island = islandOf(m, fd.heightM)
    const lane = spec.trapZone ? trapLaneHalfWidth(m, spec) : 0
    const grid = deckGrid(m, spec, lane, island)
    measures = { ...measures, deckPlaneM: plane, deckLengthM: d.length, deckWidthM: d.medianWidth, islandMeanZ: island.meanZ, islandInboardZ: island.minZ, trapLaneHalfWidthM: lane, grid }
    if (Math.abs(plane - fd.heightM) > 0.05) problems.push(`deck plane at ${plane.toFixed(3)} m vs flightDeck.heightM ${fd.heightM} (limit ±0.05)`)
    if (Math.abs(d.length / fd.lengthM - 1) > TOLERANCE.deckLengthFrac) problems.push(`deck length ${d.length.toFixed(2)} m vs flightDeck.lengthM ${fd.lengthM} (${pct(d.length, fd.lengthM)}, limit ±0.5%)`)
    if (Math.abs(d.medianWidth / fd.widthM - 1) > 0.01) problems.push(`deck width ${d.medianWidth.toFixed(2)} m vs flightDeck.widthM ${fd.widthM} (${pct(d.medianWidth, fd.widthM)}, limit ±1%)`)
    if (Math.abs(overall / spec.lengthM - 1) > TOLERANCE.overallLengthFrac) problems.push(`overall length ${overall.toFixed(2)} m vs lengthM ${spec.lengthM} (${pct(overall, spec.lengthM)}, limit ±3%)`)
    if (o.bow === 'island-starboard' && !(island.meanZ > 0)) problems.push(`island mean z ${island.meanZ.toFixed(2)} m is not to starboard (+z): the model is reversed or mirrored`)
    if (grid.innerOnDeck < TOLERANCE.deckCellShareMin) problems.push(`${(grid.innerOnDeck * 100).toFixed(1)}% of inner deck cells within ±${TOLERANCE.deckCellM} m (limit ≥ ${TOLERANCE.deckCellShareMin * 100}%)`)
    if (grid.laneMisses > 0) problems.push(`${grid.laneMisses} centerline or trap-lane cells are not on the deck (limit 0)`)
    if (grid.strayBelow > 0) problems.push(`${grid.strayBelow} below-deck cells outside the tapered corners (limit 0)`)
    if (grid.worstFitting > TOLERANCE.fittingM) problems.push(`a fitting stands ${grid.worstFitting.toFixed(2)} m above the deck outside the island (limit ${TOLERANCE.fittingM})`)
    if (spec.trapZone && lane < 5) problems.push(`trap lane half-width ${lane.toFixed(2)} m < 5 m: the island crowds the landing lane`)
  }
  return { problems, measures }
}

/** The fit's own residuals against §4.4's design ranges (build time: the committed glb records them in asset.extras.shipFit). */
export function residualProblems(fit: ShipFit, o: Pick<FitOptions, 'fit'>): string[] {
  const out: string[] = []
  const inK = (k: number): boolean => k >= TOLERANCE.kMin && k <= TOLERANCE.kMax
  if (!inK(fit.kWaterline)) out.push(`lateral kWaterline ${fit.kWaterline.toFixed(4)} outside ${TOLERANCE.kMin}..${TOLERANCE.kMax}`)
  if (!inK(fit.kDeck)) out.push(`lateral kDeck ${fit.kDeck.toFixed(4)} outside ${TOLERANCE.kMin}..${TOLERANCE.kMax}`)
  const r = fit.ry / fit.rx
  if (o.fit === 'deck' && (r < TOLERANCE.syOverSxMin || r > TOLERANCE.syOverSxMax)) out.push(`sy/sx ${r.toFixed(4)} outside ${TOLERANCE.syOverSxMin}..${TOLERANCE.syOverSxMax}`)
  return out
}
