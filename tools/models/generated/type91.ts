/**
 * The Type 91 aerial torpedo (V1, 2026-10-09), the IJN's aerial torpedo, built from cited figures.
 * A drawn model only: the weapon, its drop envelope and its run are Track D.
 *
 * CITED (read 2026-10-09):
 * - English Wikipedia, "Type 91 torpedo" (en.wikipedia.org/wiki/Type_91_torpedo): infobox length
 *   5.270 m, diameter 45 cm; the kyoban, "wooden stabilizer plates" on the tail fins from Rev. 1
 *   (1936), "designed to shear off on entry to the water"; box-type tail stabilizers in the B6N2 photos.
 * ESTIMATED: every figure in `TYPE91_SHAPE` but the length and diameter, and the colors (colors.ts).
 */
import { storeDocument } from './mesh.js'
import { PLYWOOD, TORPEDO_STEEL } from './colors.js'
import { loadPaintTextures } from './paint.js'
import { torpedoMesh, type TorpedoShape } from './torpedo.js'
import type { Generator } from './registry.js'

export const TYPE91_CITED = { overallLengthM: 5.27, diameterM: 0.45 } as const

export const TYPE91_SHAPE: TorpedoShape = {
  ...TYPE91_CITED,
  noseLengthM: 0.35,
  noseTipRadiusM: 0.03,
  tailConeLengthM: 1.2,
  tailEndRadiusM: 0.06,
  finChordM: 0.35,
  // The kyoban box spans a little wider than the body.
  finSpanM: 0.52,
  finThicknessM: 0.006,
  stabilizer: { kind: 'box', chordM: 0.32, color: PLYWOOD },
  propRadiusM: 0.13,
  lugFromNoseM: 2.4,
  color: TORPEDO_STEEL,
}

export const generateType91: Generator = async () => storeDocument('type91', torpedoMesh(TYPE91_SHAPE), await loadPaintTextures())
