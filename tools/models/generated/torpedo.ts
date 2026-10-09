/**
 * The shared builder for the two aerial torpedoes (V1, 2026-10-09): a body of revolution, a
 * cruciform tail, contra-rotating propellers, and either a ring shroud round the fins (Mk 13) or a
 * wooden box stabilizer on their tips (the Type 91's kyoban). Each torpedo's own file cites its
 * figures; everything this file adds is an ESTIMATE named in its `TorpedoShape`.
 *
 * Frame: +X nose, +Y up; the origin is the suspension point, on top of the body at its lug, as for
 * every generated store (mesh.ts), so Track D can hang one from a rack without a new convention.
 */
import { box, corner, lathe, mergeMeshes, type MeshData, type ProfilePoint, type Rgb } from './mesh.js'
import { PROPELLER_BRONZE } from './colors.js'
import { PAINTED_METAL } from './paint.js'

export interface TorpedoShape {
  readonly overallLengthM: number
  readonly diameterM: number
  /** Nose to the end of the rounded head. */
  readonly noseLengthM: number
  /** The nose's flat tip radius (0 = pointed). */
  readonly noseTipRadiusM: number
  /** Length of the tapering afterbody, ending at the propeller hub. */
  readonly tailConeLengthM: number
  readonly tailEndRadiusM: number
  readonly finChordM: number
  /** Tip to tip, across the axis. */
  readonly finSpanM: number
  readonly finThicknessM: number
  /** 'ring': a shroud of this chord at the fin tips; 'box': four plates joining the tips. */
  readonly stabilizer: { readonly kind: 'ring' | 'box'; readonly chordM: number; readonly color: Rgb }
  readonly propRadiusM: number
  readonly lugFromNoseM: number
  readonly color: Rgb
}

const SEGMENTS = 32
const TILE = PAINTED_METAL.tileM
const LUG = { heightM: 0.03, lengthM: 0.06, widthM: 0.025 } as const
/** The propeller hub's length aft of the body: the cited overall length runs nose to hub end. */
const HUB_M = 0.14

export const torpedoAxisY = (s: TorpedoShape): number => -(s.diameterM / 2 + LUG.heightM)
const noseX = (s: TorpedoShape): number => s.lugFromNoseM

function bodyProfile(s: TorpedoShape): ProfilePoint[] {
  const R = s.diameterM / 2, tip = noseX(s), c = s.color
  const out: ProfilePoint[] = s.noseTipRadiusM > 0 ? [{ x: tip, r: 0, color: c }, ...corner(tip, s.noseTipRadiusM, c)] : [{ x: tip, r: 0, color: c }]
  // A quarter ellipse from the tip radius out to the full diameter: a blunt torpedo head.
  for (let k = 1; k <= 10; k++) {
    const a = (k / 10) * (Math.PI / 2)
    out.push({ x: tip - s.noseLengthM * (1 - Math.cos(a)), r: s.noseTipRadiusM + (R - s.noseTipRadiusM) * Math.sin(a), color: c })
  }
  const coneStart = tip - (s.overallLengthM - HUB_M - s.tailConeLengthM)
  out.push({ x: coneStart, r: R, color: c })
  for (let k = 1; k <= 8; k++) {
    const t = k / 8
    out.push({ x: coneStart - t * s.tailConeLengthM, r: R + (s.tailEndRadiusM - R) * t * t, color: c })
  }
  const aft = tip - s.overallLengthM + HUB_M
  out.splice(out.length - 1, 1, ...corner(aft, s.tailEndRadiusM, c))
  out.push({ x: aft, r: 0, color: c })
  return out
}

export interface TorpedoParts { readonly body: MeshData; readonly fins: MeshData; readonly stabilizer: MeshData; readonly props: MeshData; readonly lug: MeshData }

export function torpedoParts(s: TorpedoShape): TorpedoParts {
  const y0 = torpedoAxisY(s), R = s.diameterM / 2, t = s.finThicknessM
  const aft = noseX(s) - s.overallLengthM + HUB_M
  // The fins stand just ahead of the propellers, on the afterbody (cruciform: up, down, port, starboard).
  const finAft = aft + 0.12, finFore = finAft + s.finChordM, tipR = s.finSpanM / 2
  const fins = [0, 1, 2, 3].map((k) => box([finAft, y0 + s.tailEndRadiusM * 0.5, -t / 2], [finFore, y0 + tipR, t / 2], (k * Math.PI) / 2, y0, s.color, TILE))
  const sc = s.stabilizer
  let stabilizer: MeshData
  if (sc.kind === 'ring') {
    // A 24-sided ring of flat staves standing on the fin tips.
    const n = 24, th = 0.008, half = Math.tan(Math.PI / n) * tipR + 0.002
    stabilizer = mergeMeshes(Array.from({ length: n }, (_, k) => box([finAft, y0 + tipR, -half], [finAft + sc.chordM, y0 + tipR + th, half], (k * 2 * Math.PI) / n, y0, sc.color, TILE)))
  } else {
    // The kyoban: four plates, each joining two fin tips across the quadrant between them.
    const side = tipR * Math.SQRT2, th = 0.012
    stabilizer = mergeMeshes([0, 1, 2, 3].map((k) => box([finAft, y0 + tipR * Math.SQRT1_2 - th, -side / 2], [finAft + sc.chordM, y0 + tipR * Math.SQRT1_2, side / 2], Math.PI / 4 + (k * Math.PI) / 2, y0, sc.color, TILE)))
  }
  // Contra-rotating propellers: two four-bladed sets, the aft one turned 45 degrees.
  const blade = (x: number, roll: number): MeshData => box([x - 0.03, y0 + 0.02, -0.025], [x, y0 + s.propRadiusM, 0.025], roll, y0, PROPELLER_BRONZE, TILE)
  const props = mergeMeshes([
    ...[0, 1, 2, 3].map((k) => blade(aft - 0.02, (k * Math.PI) / 2)),
    ...[0, 1, 2, 3].map((k) => blade(aft - 0.1, Math.PI / 4 + (k * Math.PI) / 2)),
    lathe([{ x: aft, r: 0, color: PROPELLER_BRONZE }, ...corner(aft, 0.03, PROPELLER_BRONZE), ...corner(aft - HUB_M, 0.03, PROPELLER_BRONZE), { x: aft - HUB_M, r: 0, color: PROPELLER_BRONZE }], SEGMENTS / 2, y0, TILE),
  ])
  const lug = box([-LUG.lengthM / 2, y0 + R - 0.006, -LUG.widthM / 2], [LUG.lengthM / 2, 0, LUG.widthM / 2], 0, y0, s.color, TILE)
  return { body: lathe(bodyProfile(s), SEGMENTS, y0, TILE), fins: mergeMeshes(fins), stabilizer, props, lug }
}

export function torpedoMesh(s: TorpedoShape): MeshData {
  const p = torpedoParts(s)
  return mergeMeshes([p.body, p.fins, p.stabilizer, p.props, p.lug])
}
