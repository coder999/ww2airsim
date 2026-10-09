/**
 * The Type 98 No. 25 land bomb, 250 kg (V2, 2026-10-09): the IJN's 551 lb class general-purpose
 * bomb, the store every Japanese bomber carries in this game. Built from cited figures.
 *
 * CITED (read 2026-10-09):
 * - English Wikipedia, "List of Japanese World War II navy bombs" (from TM 9-1985-4, Japanese
 *   Explosive Ordnance, 1953): Type 98 No. 25, weight about 241 kg (532 lb), filler about 96 kg
 *   picric acid or Type 98 explosive, length 180 cm (72 in), tail about 83 cm (32.5 in) of sheet
 *   steel, case welded and riveted 13 mm steel, a horizontal navy-type suspension lug.
 * - bulletpicker.com, "Bomb, 250 kg Land, Type 98 No. 25" (citing TM 9-1985-4 p. 50 and OP 1667
 *   p. 53): gray overall, green nose band and green tail struts; four fins spot welded to the tail
 *   cone, braced by one set of box struts; filler 211 lb (95.9 kg).
 * SECONDARY: English Wikipedia, "Type 21 and Type 22 rocket-bombs", whose warhead table gives the
 *   Type 98 No. 25 a 30 cm figure in a column the page does not label; taken as the body diameter.
 * ESTIMATED: every figure in `E` below. The two thin red lengthwise lines the same source describes
 *   are not drawn.
 *
 * Frame: +X nose, +Y up; the origin is the top of its one lug, at the center of gravity.
 */
import { box, corner, lathe, mergeMeshes, storeDocument, type MeshData, type ProfilePoint } from './mesh.js'
import { IJN_BOMB_GRAY, IJN_BOMB_GREEN } from './colors.js'
import { loadPaintTextures, PAINTED_METAL } from './paint.js'
import type { Generator } from './registry.js'

const IN = 0.0254
export const TYPE98_CITED = {
  overallLengthM: 1.8,
  tailLengthM: 32.5 * IN,
  bodyDiameterM: 0.3,
} as const

/** ESTIMATES (V2, 2026-10-09). */
const E = {
  noseOgiveLengthM: 0.36,
  noseTipRadiusM: 0.035,
  noseBandLengthM: 0.12, // the green nose band, from the tip
  parallelEndM: 0.8, // distance from the tip where the body starts to taper into the tail cone
  tailOverlapM: 0.08, // the tail cone's collar sits inside the body's base
  tailEndRadiusM: 0.05,
  finChordM: 0.42,
  finSpanM: 0.34, // tip to tip, a little over the body's diameter
  strutDepthM: 0.14,
  sheetM: 0.004,
  lugFromNoseM: 0.7, // the CG, about 40% of the length
  lugHeightM: 0.035,
  lugLengthM: 0.05,
  lugWidthM: 0.02,
} as const

const SEGMENTS = 32
const TILE = PAINTED_METAL.tileM
const R = TYPE98_CITED.bodyDiameterM / 2
export const TYPE98_AXIS_Y = -(R + E.lugHeightM)
const TIP_X = E.lugFromNoseM
const BODY_LENGTH_M = TYPE98_CITED.overallLengthM - TYPE98_CITED.tailLengthM + E.tailOverlapM

function bodyRadius(d: number): number {
  if (d <= E.noseOgiveLengthM) return E.noseTipRadiusM + (R - E.noseTipRadiusM) * Math.sin((d / E.noseOgiveLengthM) * (Math.PI / 2))
  if (d <= E.parallelEndM) return R
  const t = (d - E.parallelEndM) / (BODY_LENGTH_M - E.parallelEndM)
  return R + (R * 0.82 - R) * t * t
}

function bodyProfile(): ProfilePoint[] {
  const out: ProfilePoint[] = [{ x: TIP_X, r: 0, color: IJN_BOMB_GREEN }, ...corner(TIP_X, E.noseTipRadiusM, IJN_BOMB_GREEN)]
  const ds = new Set<number>([E.noseBandLengthM])
  for (let k = 1; k <= 10; k++) ds.add((k / 10) * E.noseOgiveLengthM)
  for (let k = 0; k < 6; k++) ds.add(E.parallelEndM + (k / 6) * (BODY_LENGTH_M - E.parallelEndM))
  for (const d of [...ds].sort((a, b) => a - b)) {
    const x = TIP_X - d, r = bodyRadius(d)
    if (d === E.noseBandLengthM) out.push({ x, r, color: IJN_BOMB_GREEN }, { x, r, color: IJN_BOMB_GRAY })
    else out.push({ x, r, color: d < E.noseBandLengthM ? IJN_BOMB_GREEN : IJN_BOMB_GRAY })
  }
  out.push(...corner(TIP_X - BODY_LENGTH_M, bodyRadius(BODY_LENGTH_M), IJN_BOMB_GRAY), { x: TIP_X - BODY_LENGTH_M, r: 0, color: IJN_BOMB_GRAY })
  return out
}

export interface Type98Parts { readonly body: MeshData; readonly tail: MeshData; readonly lug: MeshData }

export function type98Parts(): Type98Parts {
  const y0 = TYPE98_AXIS_Y, t = E.sheetM, W = E.finSpanM
  const finAft = TIP_X - TYPE98_CITED.overallLengthM
  const tailFront = finAft + TYPE98_CITED.tailLengthM
  const coneFrontR = bodyRadius(TIP_X - tailFront) - 0.002 // the collar seats inside the body's base
  const cone = lathe([
    { x: tailFront, r: 0, color: IJN_BOMB_GRAY }, ...corner(tailFront, coneFrontR, IJN_BOMB_GRAY),
    ...corner(finAft, E.tailEndRadiusM, IJN_BOMB_GRAY), { x: finAft, r: 0, color: IJN_BOMB_GRAY },
  ], SEGMENTS, y0, TILE)
  const fins = [0, 1, 2, 3].map((k) => box([finAft, y0 + 0.03, -t / 2], [finAft + E.finChordM, y0 + (W / 2) * Math.SQRT2 - t, t / 2], Math.PI / 4 + (k * Math.PI) / 2, y0, IJN_BOMB_GRAY, TILE))
  const struts = [0, 1, 2, 3].map((k) => box([finAft, y0 + W / 2 - t, -W / 2], [finAft + E.strutDepthM, y0 + W / 2, W / 2], (k * Math.PI) / 2, y0, IJN_BOMB_GREEN, TILE))
  return {
    body: lathe(bodyProfile(), SEGMENTS, y0, TILE),
    tail: mergeMeshes([cone, ...fins, ...struts]),
    lug: box([-E.lugLengthM / 2, y0 + R - 0.006, -E.lugWidthM / 2], [E.lugLengthM / 2, 0, E.lugWidthM / 2], 0, y0, IJN_BOMB_GRAY, TILE),
  }
}

export function type98Mesh(): MeshData {
  const p = type98Parts()
  return mergeMeshes([p.body, p.tail, p.lug])
}

export const generateType98No25: Generator = async () => storeDocument('type98-no25', type98Mesh(), await loadPaintTextures())
