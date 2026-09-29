// tools/models/skin/surfaces.ts
/**
 * How each palette role weathers (DP0; model-detail-pass spec §4, §8 Q2: worn). These are the
 * shared look: a change here re-skins every skinned model on its next build (spec §5).
 * Every number is an ESTIMATE, chosen by eye on the DP0 pilots.
 *   scan        the pinned CC0 scan its micro-normal, wear and roughness come from (null: none)
 *   roughness   base roughness before the scan's variation
 *   metallic    0 paint, 1 bare metal
 *   fade        chalking toward a lighter gray on sky-facing surfaces, 0-1
 *   chip        fraction of the scan's brightest texels (its bare-metal flecks) that show bare metal through the paint
 *   rivets      draw rivet rows beside its panel lines
 *   scanNormal  the scan normal's strength, 0-1
 */
export type ScanId = 'painted-metal' | 'corrugated-iron' | 'concrete'
export interface Surface {
  readonly scan: ScanId | null
  readonly roughness: number
  readonly metallic: number
  readonly fade: number
  readonly chip: number
  readonly rivets: boolean
  readonly scanNormal: number
}

export const ROLE_SURFACE: Readonly<Record<string, Surface>> = {
  ijaGreen: { scan: 'painted-metal', roughness: 0.62, metallic: 0, fade: 0.18, chip: 0.01, rivets: true, scanNormal: 0.6 },
  underside: { scan: 'painted-metal', roughness: 0.58, metallic: 0, fade: 0.04, chip: 0.005, rivets: true, scanNormal: 0.6 },
  naturalMetal: { scan: 'painted-metal', roughness: 0.35, metallic: 1, fade: 0, chip: 0, rivets: true, scanNormal: 0.4 },
  dark: { scan: 'painted-metal', roughness: 0.55, metallic: 0, fade: 0.05, chip: 0.005, rivets: false, scanNormal: 0.5 },
  glazing: { scan: null, roughness: 0.08, metallic: 0, fade: 0, chip: 0, rivets: false, scanNormal: 0 },
  steel: { scan: 'corrugated-iron', roughness: 0.7, metallic: 0, fade: 0.1, chip: 0.04, rivets: false, scanNormal: 1 },
  concrete: { scan: 'concrete', roughness: 0.9, metallic: 0, fade: 0.04, chip: 0, rivets: false, scanNormal: 1 },
}

export function surfaceFor(role: string): Surface {
  const s = ROLE_SURFACE[role]
  if (!s) throw new Error(`skin: palette role "${role}" has no surface in tools/models/skin/surfaces.ts (known: ${Object.keys(ROLE_SURFACE).sort().join(', ')})`)
  return s
}
