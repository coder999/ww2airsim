// tools/models/skin/layers.ts
import type { GBuffer } from './raster.js'
import type { Marking, Sidecar } from './sidecar.js'
import { sampleScan, type Scan } from './scans.js'
import { surfaceFor, type ScanId, type Surface } from './surfaces.js'
import { BARE_METAL, MARKING_COLORS, SRGB8_TO_LINEAR, srgbToLinear } from './colors.js'

/**
 * Height is in groove units, not meters: a panel line is 1 deep at its center. compose.ts turns
 * the height's slope per TEXEL into the normal (NORMAL_GAIN), so a line reads as a one-texel
 * bevel at any texel density, as the downloads' baked panel lines do. A physical 2 mm groove at
 * the hangar's ~30 cm texels (0.296 m in its sidecar, 2026-09-28) would be invisible.
 * Half-widths are meters; a line narrower than a sample is drawn one sample wide (ESTIMATE, the look).
 */
export const LINE_HALF_M = { panel: 0.001, hinge: 0.004 } as const
export const LINE_DEPTH_M = { panel: 1, hinge: 1.6 } as const
/** Rivet rows beside each panel line (ESTIMATE): offset and pitch (m), head radius (m), head
 *  height (groove units). Dots where a sample is under 4 mm; a faint ridge above that. */
export const RIVET = { offsetM: 0.012, pitchM: 0.025, radiusM: 0.0025, heightM: 0.35, dotsBelowM: 0.004 } as const
/** A grid axis whose spacing is under this many texels is skipped: it would alias, a lap that fine reads as noise, and the scan carries the corrugation. */
export const GRID_MIN_TEXELS = 4
/** A disc or polygon marks a sample only if its normal is within ~70 deg of the marking's axis. */
export const FACING_MIN = 0.35
const SEAM_DIRT = 0.3
/** A sample chips only if it is above the chip quantile by more than float roundoff: sampleScan's
 *  bilinear weights need not sum to exactly 1, so a flat 0.5 scan samples 1 ulp off 0.5
 *  (240 of 16,384 samples, measured 2026-09-28) and would otherwise chip where nothing is brighter. */
const CHIP_EPS = 1e-6

export interface Painted {
  readonly size: number; readonly covered: Uint8Array; readonly patch: Int32Array
  readonly color: Float32Array; readonly rough: Float32Array; readonly metal: Float32Array
  readonly height: Float32Array; readonly scanN: Float32Array
}

type V3 = [number, number, number]
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const unit = (a: V3): V3 => { const l = Math.sqrt(dot(a, a)); return [a[0] / l, a[1] / l, a[2] / l] }
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x))
const linearColor = (c: readonly number[]): V3 => [SRGB8_TO_LINEAR[c[0]!]!, SRGB8_TO_LINEAR[c[1]!]!, SRGB8_TO_LINEAR[c[2]!]!]

/** Distance from p to segment ab, 2D. */
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy
  const t = l2 === 0 ? 0 : clamp01(((px - ax) * dx + (py - ay) * dy) / l2)
  const ex = px - ax - t * dx, ey = py - ay - t * dy
  return Math.sqrt(ex * ex + ey * ey)
}

/** Coverage 0-1 of one marking at sample (p, n), or 0. Grid markings return 0: they cut height only. */
function coverage(mk: Marking, p: V3, n: V3): number {
  if (mk.kind === 'grid') return 0
  const ramp = (inside: number): number => (mk.featherM > 0 ? clamp01(inside / mk.featherM) : inside >= 0 ? 1 : 0)
  if (mk.kind === 'slab') {
    const c = p[mk.axis === 'x' ? 0 : mk.axis === 'y' ? 1 : 2]
    return ramp(Math.min(c - mk.fromM, mk.toM - c))
  }
  const a = unit(mk.axis as V3)
  if (dot(n, a) < FACING_MIN) return 0
  if (mk.kind === 'disc') {
    const d: V3 = [p[0] - mk.center[0], p[1] - mk.center[1], p[2] - mk.center[2]]
    const along = dot(d, a)
    if (Math.abs(along) > mk.radiusM) return 0
    const r = Math.sqrt(Math.max(0, dot(d, d) - along * along))
    return ramp(mk.radiusM - r)
  }
  // polygon: plane coordinates about origin, u along uDir made orthogonal to the axis
  const u0 = mk.uDir as V3
  const u = unit([u0[0] - dot(u0, a) * a[0], u0[1] - dot(u0, a) * a[1], u0[2] - dot(u0, a) * a[2]])
  const v = cross(a, u)
  const d: V3 = [p[0] - mk.origin[0], p[1] - mk.origin[1], p[2] - mk.origin[2]]
  const reach = Math.max(...mk.points.map(([x, y]) => Math.sqrt(x * x + y * y)))
  if (Math.abs(dot(d, a)) > reach) return 0
  const x = dot(d, u), y = dot(d, v)
  let inside = false, dist = Infinity
  for (let i = 0, j = mk.points.length - 1; i < mk.points.length; j = i++) {
    const [xi, yi] = mk.points[i]!, [xj, yj] = mk.points[j]!
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
    dist = Math.min(dist, segDist(x, y, xi, yi, xj, yj))
  }
  return inside ? ramp(dist) : 0
}

/**
 * Every covered sample's paint, finish, markings and height (DP0, spec §4). Order: role color;
 * scan wear; fading on sky-facing surfaces; markings in declaration order; chips through all
 * of it; then the seam dirt of panel lines. `atlasPx` sets the texel footprint the scans are
 * filtered to; the G-buffer is 2x that.
 */
export function paint(g: GBuffer, roles: readonly string[], side: Sidecar, scans: ReadonlyMap<ScanId, Scan>, atlasPx: number): Painted {
  const count = g.size * g.size
  const out: Painted = {
    size: g.size, covered: g.covered, patch: g.patch,
    color: new Float32Array(3 * count), rough: new Float32Array(count), metal: new Float32Array(count),
    height: new Float32Array(count), scanN: new Float32Array(3 * count),
  }
  const mpp = side.metersPerPx, spacing = (mpp * atlasPx) / g.size // meters per sample
  const surfaces: Surface[] = roles.map((r) => surfaceFor(r))
  const base: V3[] = roles.map((r) => side.roles[r]!.map(srgbToLinear) as V3)
  const scanOf = (s: Surface): Scan | null => {
    if (s.scan === null) return null
    const sc = scans.get(s.scan)
    if (!sc) throw new Error(`skin ${side.model}: scan "${s.scan}" was not loaded`)
    return sc
  }
  const chipAt = surfaces.map((s) => { const sc = scanOf(s); return sc && s.chip > 0 ? sc.lumAtQuantile(1 - s.chip) : -1 })
  const patches = new Map(side.patches.map((p) => [p.id, p]))
  const lines = new Map<number, Sidecar['lines']>()
  for (const l of side.lines) lines.set(l.patch, [...(lines.get(l.patch) ?? []), l])
  const marks = side.markings.map((m) => ({ m, color: m.kind === 'grid' ? null : linearColor(MARKING_COLORS[m.color]), tags: new Set(m.tags) }))
  const bare = linearColor(BARE_METAL)

  for (let i = 0; i < count; i++) {
    if (!g.covered[i]) continue
    const x = i % g.size, y = (i - x) / g.size
    const q = patches.get(g.patch[i]!)!
    const u = q.originM[0] + (((x + 0.5) * atlasPx) / g.size - q.rect[0]) * mpp
    const v = q.originM[1] + (((y + 0.5) * atlasPx) / g.size - q.rect[1]) * mpp
    const p: V3 = [g.pos[3 * i]!, g.pos[3 * i + 1]!, g.pos[3 * i + 2]!]
    const n: V3 = [g.nrm[3 * i]!, g.nrm[3 * i + 1]!, g.nrm[3 * i + 2]!]
    const r = g.role[i]!, surf = surfaces[r]!, sc = scanOf(surf)
    // DP2 (Ruling S7): decks sample their planks in world space, so they run fore and aft on every chart.
    const [su, sv] = surf.scanSpace === 'world-xz' ? [p[0], p[2]] : surf.scanSpace === 'world-zx' ? [p[2], p[0]] : [u, v]
    const s = sc ? sampleScan(sc, su, sv, mpp) : { lum: 0.5, rough: 0.5, n: [0, 0, 1] as V3 }
    let [cr, cg, cb] = base[r]!
    // scan wear
    if (sc) { const k = 1 + 0.35 * (s.lum - sc.meanLum); cr *= k; cg *= k; cb *= k }
    // chalking: lighter and grayer toward the sky
    const t = surf.fade * Math.max(0, n[1])
    const gray = (0.2126 * cr + 0.7152 * cg + 0.0722 * cb) * 1.35 + 0.02
    cr += (gray - cr) * t; cg += (gray - cg) * t; cb += (gray - cb) * t
    let rough = surf.roughness + 0.5 * (s.rough - 0.5), metal = surf.metallic, h = 0
    // markings
    for (const { m, color, tags } of marks) {
      if (!tags.has(q.tag)) continue
      if (m.kind === 'grid') {
        const hw = Math.max(m.widthM / 2, spacing)
        for (let a = 0; a < 3; a++) {
          const sp = m.spacingM[a]
          if (sp === null || sp === undefined || sp < GRID_MIN_TEXELS * mpp || Math.abs(n[a]!) >= 0.5) continue
          const c = p[a]!, d = Math.abs(c - sp * Math.round(c / sp))
          h -= m.depth * Math.max(0, 1 - d / hw)
        }
        continue
      }
      const al = coverage(m, p, n) * m.opacity
      if (al === 0) continue
      if (m.effect === 'wear') {
        cr += (cr * 1.15 + 0.02 - cr) * al; cg += (cg * 1.15 + 0.02 - cg) * al; cb += (cb * 1.15 + 0.02 - cb) * al
        rough += 0.2 * al
      } else {
        cr += (color![0] - cr) * al; cg += (color![1] - cg) * al; cb += (color![2] - cb) * al
        if (m.effect === 'stain') rough += 0.15 * al
      }
    }
    // chips: the scan's brightest texels, its own bare-metal flecks, show bare metal through paint
    // and markings alike. Not its darkest: in the painted-metal scan those are stains a meter wide,
    // which baked as a black blob on every panel (Task 12 captures, 2026-09-28).
    if (sc && chipAt[r]! >= 0 && s.lum > chipAt[r]! + CHIP_EPS) { [cr, cg, cb] = bare; metal = 1; rough = 0.35 }
    // panel lines, hinge lines and rivets
    for (const l of lines.get(q.id) ?? []) {
      const c = l.axis === 'u' ? u : v, o = l.axis === 'u' ? v : u
      const halfM = LINE_HALF_M[l.kind], hw = Math.max(halfM, spacing)
      if (o < l.fromM - hw || o > l.toM + hw) continue
      const d = Math.abs(c - l.atM), w = Math.max(0, 1 - d / hw)
      h -= LINE_DEPTH_M[l.kind] * w
      const dirt = 1 - SEAM_DIRT * w
      cr *= dirt; cg *= dirt; cb *= dirt
      if (l.kind !== 'panel' || !surf.rivets) continue
      for (const side2 of [-1, 1]) {
        const row = l.atM + side2 * RIVET.offsetM
        if (spacing < RIVET.dotsBelowM) {
          const oc = l.fromM + RIVET.pitchM * Math.round((o - l.fromM) / RIVET.pitchM)
          const dd = Math.sqrt((c - row) * (c - row) + (o - oc) * (o - oc))
          h += RIVET.heightM * Math.max(0, 1 - dd / RIVET.radiusM)
        } else {
          const rw = Math.max(RIVET.radiusM, spacing)
          h += RIVET.heightM * 0.3 * Math.max(0, 1 - Math.abs(c - row) / rw)
        }
      }
    }
    out.color[3 * i] = cr; out.color[3 * i + 1] = cg; out.color[3 * i + 2] = cb
    out.rough[i] = Math.min(1, Math.max(0.04, rough)); out.metal[i] = metal; out.height[i] = h
    out.scanN[3 * i] = s.n[0] * surf.scanNormal; out.scanN[3 * i + 1] = s.n[1] * surf.scanNormal; out.scanN[3 * i + 2] = s.n[2]
  }
  return out
}
