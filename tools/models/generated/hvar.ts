/**
 * The 5-inch High Velocity Aircraft Rocket (O1, ordnance spec §2.1), built from cited figures.
 *
 * CITED (read 2026-09-26):
 * - Smithsonian NASM A19820116000, "Rocket, Air-to-Surface, 5-inch, HVAR"
 *   (airandspace.si.edu/collection-objects/rocket-air-to-surface-5-inch-hvar/nasm_A19820116000):
 *   68 x 11 x 11 in; "four fixed rectangular fins with rounded edges arranged in cruciform pattern;
 *   ogival nose ... three suspension bands".
 * - OP 1664 (Bureau of Ordnance, 1947), "5.0-inch A.R. with 5-inch motor", p. 170: head and motor
 *   5.0 in diameter, motor 51.4 in long, over-all 69 in (NASM's measured 68 in is used; 69 is 1.5%
 *   longer); the front lug band is strapped to the motor, the rear lug is on the fin assembly band.
 * - English Wikipedia, "High Velocity Aircraft Rocket", infobox: 68 in, 5 in, span 15.625 in. The
 *   span is uncited there; it is CORROBORATED by NASM's 11 in box, which is 15.625 / sqrt(2) = 11.05 in,
 *   the diagonal extent of a cruciform set.
 * ESTIMATED: every figure in `E` below.
 *
 * Frame: +X nose, +Y up; origin midway between the two lugs, on their tops: where the
 * launcher holds it.
 */
import { box, corner, lathe, mergeMeshes, storeDocument, type MeshData, type ProfilePoint } from './mesh.js'
import { OLIVE_DRAB } from './colors.js'
import { loadPaintTextures, PAINTED_METAL } from './paint.js'
import type { Generator } from './registry.js'

const IN = 0.0254
export const HVAR_CITED = {
  overallLengthM: 68 * IN,
  diameterM: 5 * IN,
  finSpanM: 15.625 * IN,
  motorLengthM: 51.4 * IN,
} as const

/** ESTIMATES (O1, 2026-09-26). */
const E = {
  noseOgiveLengthM: 0.254,
  noseTipRadiusM: 0.012,
  finChordM: 0.23,
  finThicknessM: 0.005,
  // DERIVED + ESTIMATE: the head shows 68 - 51.4 = 16.6 in (0.4216 m) ahead of the motor, and the
  // front lug band sits just behind that joint (+0.03 m, ESTIMATE).
  frontLugFromTipM: (68 - 51.4) * IN + 0.03,
  rearLugFromAftM: 0.24,
  lugHeightM: 0.03,
  lugLengthM: 0.06,
  lugWidthM: 0.02,
} as const

const SEGMENTS = 32
const TILE = PAINTED_METAL.tileM
const R = HVAR_CITED.diameterM / 2
export const HVAR_AXIS_Y = -(R + E.lugHeightM)
/** The lug midpoint is the origin: the tip sits half the lug-to-lug span plus the front lug's setback ahead of it. */
export const HVAR_TIP_X = (E.frontLugFromTipM + HVAR_CITED.overallLengthM - E.rearLugFromAftM) / 2

function bodyProfile(): ProfilePoint[] {
  const tip = HVAR_TIP_X, aft = HVAR_TIP_X - HVAR_CITED.overallLengthM
  const out: ProfilePoint[] = [{ x: tip, r: 0, color: OLIVE_DRAB }, ...corner(tip, E.noseTipRadiusM, OLIVE_DRAB)]
  for (let k = 1; k <= 10; k++) {
    const d = (k / 10) * E.noseOgiveLengthM
    out.push({ x: tip - d, r: E.noseTipRadiusM + (R - E.noseTipRadiusM) * Math.sin((d / E.noseOgiveLengthM) * (Math.PI / 2)), color: OLIVE_DRAB })
  }
  out.push(...corner(aft, R, OLIVE_DRAB), { x: aft, r: 0, color: OLIVE_DRAB })
  return out
}

export interface HvarParts { readonly body: MeshData; readonly fins: MeshData; readonly lugs: MeshData }

export function hvarParts(): HvarParts {
  const y0 = HVAR_AXIS_Y, t = E.finThicknessM
  const aft = HVAR_TIP_X - HVAR_CITED.overallLengthM
  const fins = [0, 1, 2, 3].map((k) => box([aft, y0 + R - 0.01, -t / 2], [aft + E.finChordM, y0 + HVAR_CITED.finSpanM / 2, t / 2], Math.PI / 4 + (k * Math.PI) / 2, y0, OLIVE_DRAB, TILE))
  const lug = (x: number): MeshData => box([x - E.lugLengthM / 2, y0 + R - 0.006, -E.lugWidthM / 2], [x + E.lugLengthM / 2, 0, E.lugWidthM / 2], 0, y0, OLIVE_DRAB, TILE)
  return {
    body: lathe(bodyProfile(), SEGMENTS, y0, TILE),
    fins: mergeMeshes(fins),
    lugs: mergeMeshes([lug(HVAR_TIP_X - E.frontLugFromTipM), lug(aft + E.rearLugFromAftM)]),
  }
}

export function hvarMesh(): MeshData {
  const p = hvarParts()
  return mergeMeshes([p.body, p.fins, p.lugs])
}

export const generateHvar: Generator = async () => storeDocument('hvar', hvarMesh(), await loadPaintTextures())
