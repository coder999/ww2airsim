/**
 * The AN-M65 1,000 lb general-purpose bomb (O1, ordnance spec §2.1), built from cited figures.
 *
 * CITED (read 2026-09-26):
 * - OP 1664, U.S. Explosive Ordnance, Bureau of Ordnance, 28 May 1947, Vol. 2 Part 6 Ch. 17,
 *   "Explosive Bombs ('AN' Series)", full text at archive.org/details/OP1664USExplosiveOrdnance:
 *   p. 390 table "1,000-pound G.P. AN-M44 (Obsolescent), AN-M65, and AN-M65A1": over-all length
 *   67.1 in, body length 53.1 in, body diameter 18.8 in, tail length 18.5 in, tail width 25.4 in;
 *   p. 384 "Suspension": dual lugs 14 in apart, a single lug at the center of gravity opposite them;
 *   p. 384 "Tail fin construction": box type, a cast-steel sleeve, four sheet-steel fins and four
 *   struts forming a box; p. 385 "Color and markings": olive drab, 1 in yellow bands at the nose and
 *   at the tail of the body (Amatol/TNT).
 * - Australian War Memorial C285409 (awm.gov.au/collection/C285409): a yellow band 250 mm from the nose.
 * DERIVED: the tail sleeve overlaps the body by 53.1 + 18.5 - 67.1 = 4.5 in.
 * ESTIMATED: every figure in `E` below. No drawing was read for any of them.
 *
 * Frame: +X nose, +Y up; the origin is the suspension point, midway between the dual lugs on
 * their tops, which is what a rack holds, so a content offset is where the lugs meet the rack.
 */
import { box, corner, lathe, mergeMeshes, storeDocument, type MeshData, type ProfilePoint } from './mesh.js'
import { FUZE_STEEL, INSIGNIA_YELLOW, OLIVE_DRAB } from './colors.js'
import { loadPaintTextures, PAINTED_METAL } from './paint.js'
import type { Generator } from './registry.js'

const IN = 0.0254
export const AN_M65_CITED = {
  overallLengthM: 67.1 * IN,
  bodyLengthM: 53.1 * IN,
  bodyDiameterM: 18.8 * IN,
  tailLengthM: 18.5 * IN,
  tailWidthM: 25.4 * IN,
  lugSpacingM: 14 * IN,
  bandWidthM: 1 * IN,
  noseBandFromSeatM: 0.25,
} as const

/** ESTIMATES (O1, 2026-09-26). */
const E = {
  noseOgiveLengthM: 0.42,
  fuzeSeatRadiusM: 0.04,
  boatTailStartM: 1.0, // distance aft of the seat where the parallel body starts to taper
  bodyAftRadiusM: 0.14,
  tailBandFromSeatM: 0.95, // forward edge of the tail band, just ahead of the taper
  sleeveAftRadiusM: 0.07,
  finRootChordM: 0.4,
  boxStrutDepthM: 0.17,
  sheetM: 0.004,
  lugFromSeatM: 0.62, // lug midpoint = the CG (OP 1664 puts the single lug there)
  lugHeightM: 0.035,
  lugLengthM: 0.04,
  lugWidthM: 0.016,
  fuze: { lengthM: 0.11, tipRadiusM: 0.016, bodyRadiusM: 0.028, vaneRadiusM: 0.065, vaneFrontM: 0.08, vaneBackM: 0.068, neckRadiusM: 0.03 },
} as const

const SEGMENTS = 32
const TILE = PAINTED_METAL.tileM
const R = AN_M65_CITED.bodyDiameterM / 2
export const AN_M65_AXIS_Y = -(R + E.lugHeightM)
export const AN_M65_SEAT_X = E.lugFromSeatM

/** Body radius at `d` meters aft of the fuze seat: a sine ogive, the parallel body, then an
 *  eased boat-tail that leaves the parallel body tangentially. */
function bodyRadius(d: number): number {
  if (d <= E.noseOgiveLengthM) return E.fuzeSeatRadiusM + (R - E.fuzeSeatRadiusM) * Math.sin((d / E.noseOgiveLengthM) * (Math.PI / 2))
  if (d <= E.boatTailStartM) return R
  const t = (d - E.boatTailStartM) / (AN_M65_CITED.bodyLengthM - E.boatTailStartM)
  return R + (E.bodyAftRadiusM - R) * t * t
}

function bodyProfile(): ProfilePoint[] {
  const L = AN_M65_CITED.bodyLengthM, w = AN_M65_CITED.bandWidthM
  const bands: readonly (readonly [number, number])[] = [[AN_M65_CITED.noseBandFromSeatM, AN_M65_CITED.noseBandFromSeatM + w], [E.tailBandFromSeatM, E.tailBandFromSeatM + w]]
  const ds = new Set<number>()
  for (let k = 0; k <= 10; k++) ds.add((k / 10) * E.noseOgiveLengthM)
  for (let k = 0; k <= 8; k++) ds.add(E.boatTailStartM + (k / 8) * (L - E.boatTailStartM))
  for (const [a, b] of bands) { ds.add(a); ds.add(b) }
  const sorted = [...ds].sort((a, b) => a - b)
  const inBand = (d: number): boolean => bands.some(([a, b]) => d > a && d < b)
  const out: ProfilePoint[] = [{ x: AN_M65_SEAT_X, r: 0, color: OLIVE_DRAB }, ...corner(AN_M65_SEAT_X, E.fuzeSeatRadiusM, OLIVE_DRAB)]
  for (const d of sorted.slice(1)) {
    const x = AN_M65_SEAT_X - d, r = bodyRadius(d)
    const edge = bands.find(([a, b]) => d === a || d === b)
    if (edge) {
      const entering = d === edge[0]
      out.push({ x, r, color: entering ? OLIVE_DRAB : INSIGNIA_YELLOW }, { x, r, color: entering ? INSIGNIA_YELLOW : OLIVE_DRAB })
    } else if (d === L) out.push(...corner(x, r, OLIVE_DRAB))
    else out.push({ x, r, color: inBand(d) ? INSIGNIA_YELLOW : OLIVE_DRAB })
  }
  out.push({ x: AN_M65_SEAT_X - L, r: 0, color: OLIVE_DRAB })
  return out
}

function fuzeProfile(): ProfilePoint[] {
  const f = E.fuze, s = AN_M65_SEAT_X, c = FUZE_STEEL
  return [
    { x: s + f.lengthM, r: 0, color: c }, ...corner(s + f.lengthM, f.tipRadiusM, c),
    ...corner(s + f.vaneFrontM, f.bodyRadiusM, c), ...corner(s + f.vaneFrontM, f.vaneRadiusM, c),
    ...corner(s + f.vaneBackM, f.vaneRadiusM, c), ...corner(s + f.vaneBackM, f.neckRadiusM, c),
    ...corner(s, f.neckRadiusM, c), { x: s, r: 0, color: c },
  ]
}

export interface AnM65Parts { readonly body: MeshData; readonly fuze: MeshData; readonly tail: MeshData; readonly lugs: MeshData }

export function anM65Parts(): AnM65Parts {
  const C = AN_M65_CITED, y0 = AN_M65_AXIS_Y, t = E.sheetM, W = C.tailWidthM
  const finAft = AN_M65_SEAT_X - C.overallLengthM
  const tailFront = finAft + C.tailLengthM
  const sleeveFrontR = bodyRadius(AN_M65_SEAT_X - tailFront) + 0.004 // just outside the boat-tail it clamps onto
  const sleeve = lathe([
    { x: tailFront, r: 0, color: OLIVE_DRAB }, ...corner(tailFront, sleeveFrontR, OLIVE_DRAB),
    ...corner(finAft, E.sleeveAftRadiusM, OLIVE_DRAB), { x: finAft, r: 0, color: OLIVE_DRAB },
  ], SEGMENTS, y0, TILE)
  const fins = [0, 1, 2, 3].map((k) => box([finAft, y0 + 0.04, -t / 2], [finAft + E.finRootChordM, y0 + (W / 2) * Math.SQRT2 - t, t / 2], Math.PI / 4 + (k * Math.PI) / 2, y0, OLIVE_DRAB, TILE))
  const struts = [0, 1, 2, 3].map((k) => box([finAft, y0 + W / 2 - t, -W / 2], [finAft + E.boxStrutDepthM, y0 + W / 2, W / 2], (k * Math.PI) / 2, y0, OLIVE_DRAB, TILE))
  const lug = (x: number, top: boolean): MeshData => top
    ? box([x - E.lugLengthM / 2, y0 + R - 0.006, -E.lugWidthM / 2], [x + E.lugLengthM / 2, 0, E.lugWidthM / 2], 0, y0, OLIVE_DRAB, TILE)
    : box([x - E.lugLengthM / 2, y0 - R - E.lugHeightM, -E.lugWidthM / 2], [x + E.lugLengthM / 2, y0 - R + 0.006, E.lugWidthM / 2], 0, y0, OLIVE_DRAB, TILE)
  return {
    body: lathe(bodyProfile(), SEGMENTS, y0, TILE),
    fuze: lathe(fuzeProfile(), SEGMENTS, y0, TILE),
    tail: mergeMeshes([sleeve, ...fins, ...struts]),
    lugs: mergeMeshes([lug(C.lugSpacingM / 2, true), lug(-C.lugSpacingM / 2, true), lug(0, false)]),
  }
}

/** The whole store, parts in a fixed order: the one mesh the glb and the mount fit use. */
export function anM65Mesh(): MeshData {
  const p = anM65Parts()
  return mergeMeshes([p.body, p.fuze, p.tail, p.lugs])
}

export const generateAnM65: Generator = async () => storeDocument('an-m65', anM65Mesh(), await loadPaintTextures())
