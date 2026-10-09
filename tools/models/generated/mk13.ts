/**
 * The Mk 13 aircraft torpedo (V1, 2026-10-09), the USN's aerial torpedo, built from cited figures.
 * A drawn model only: the weapon, its drop envelope and its run are Track D.
 *
 * CITED (read 2026-10-09):
 * - NavWeaps, "United States of America Torpedoes of World War II", 22.4" (56.9 cm) Mark 13
 *   (navweaps.com/Weapons/WTUS_WWII.php): diameter 22.4 in; Mod 0 overall length 13 ft 5 in
 *   (161 in, 4.089 m), weight 1,949 lb; the tail shroud ring "reduced hooks and broaches".
 * - Naval Ordnance and Gunnery (1957), ch. 12, transcribed at eugeneleeslover.com/USNAVY/CHAPTER-12-H.html:
 *   "13 feet 5 inches long, and 22.42 inches in diameter"; a shroud ring around the tail vanes.
 * ESTIMATED: every figure in `MK13_SHAPE` but the length and diameter, and the colors (colors.ts).
 */
import { storeDocument } from './mesh.js'
import { TORPEDO_STEEL } from './colors.js'
import { loadPaintTextures } from './paint.js'
import { torpedoMesh, type TorpedoShape } from './torpedo.js'
import type { Generator } from './registry.js'

const IN = 0.0254
export const MK13_CITED = { overallLengthM: 161 * IN, diameterM: 22.4 * IN } as const

export const MK13_SHAPE: TorpedoShape = {
  ...MK13_CITED,
  noseLengthM: 0.3,
  noseTipRadiusM: 0.06,
  tailConeLengthM: 1.0,
  tailEndRadiusM: 0.07,
  finChordM: 0.3,
  // The vanes reach the ring, which stands inside the body's diameter (the shroud was about body width).
  finSpanM: 22.4 * IN * 0.92,
  finThicknessM: 0.006,
  stabilizer: { kind: 'ring', chordM: 0.2, color: TORPEDO_STEEL },
  propRadiusM: 0.16,
  lugFromNoseM: 1.9,
  color: TORPEDO_STEEL,
}

export const generateMk13: Generator = async () => storeDocument('mk13', torpedoMesh(MK13_SHAPE), await loadPaintTextures())
